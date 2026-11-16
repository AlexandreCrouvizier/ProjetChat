/**
 * services/linkPreview.service.ts — Phase 4.1 : Preview de liens
 *
 * Détecte les URLs dans un message texte, fetch les métadonnées OpenGraph
 * côté serveur (évite les CORS), met en cache dans Redis 24h.
 *
 * Retourne : { title, description, image, url } | null
 *
 * 🔐 SÉCURITÉ (anti-SSRF) — avant, le serveur allait chercher N'IMPORTE quelle URL postée
 * dans le chat, y compris http://127.0.0.1, l'interface de la box (192.168.1.254) ou
 * l'API de métadonnées d'un VPS (169.254.169.254), et suivait les redirections.
 * Maintenant :
 *   - http/https uniquement, ports 80/443, pas d'identifiants dans l'URL
 *   - l'adresse IP résolue doit être PUBLIQUE (contrôle fait au moment de la connexion,
 *     donc résistant au « DNS rebinding »)
 *   - redirections suivies à la main (3 max) et revérifiées à chaque saut
 *   - lecture plafonnée à 500 Ko (le flux est coupé au-delà), délai total 5 s
 */

import http from 'http';
import https from 'https';
import dns from 'dns';
import net from 'net';
import { redis } from '../config/redis';

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 heures
const FETCH_TIMEOUT_MS  = 5_000;         // 5 secondes max par requête
const MAX_HTML_BYTES    = 500_000;       // Lire 500 Ko max

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

export interface LinkPreviewData {
  title:       string;
  description: string;
  image:       string | null;
  url:         string;
  site_name:   string | null;
}

/**
 * Extrait une balise meta OpenGraph ou Twitter Card depuis le HTML brut.
 * Gère les deux ordres d'attributs (property/content et content/property).
 */
function extractOgMeta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']{1,500})["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+property=["']og:${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']twitter:${prop}["'][^>]+content=["']([^"']{1,500})["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']twitter:${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHTMLEntities(m[1].trim());
  }
  if (prop === 'title') {
    const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    if (m?.[1]) return decodeHTMLEntities(m[1].trim());
  }
  return null;
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ─── Anti-SSRF ──────────────────────────────────────────────────────────────

/** true si l'adresse IP est routable sur Internet (ni privée, ni locale, ni réservée) */
export function isPublicIp(ip: string): boolean {
  const addr = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  if (net.isIPv4(addr)) {
    const [a, b, c] = addr.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;              // this-net, privé, loopback
    if (a === 100 && b >= 64 && b <= 127) return false;              // CGNAT
    if (a === 169 && b === 254) return false;                        // link-local / métadonnées cloud
    if (a === 172 && b >= 16 && b <= 31) return false;               // privé
    if (a === 192 && b === 168) return false;                        // privé
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;  // IETF / documentation
    if (a === 198 && (b === 18 || b === 19)) return false;           // benchmark
    if (a === 198 && b === 51 && c === 100) return false;            // documentation
    if (a === 203 && b === 0 && c === 113) return false;             // documentation
    if (a >= 224) return false;                                      // multicast + réservé
    return true;
  }
  if (net.isIPv6(addr)) {
    const x = addr.toLowerCase();
    if (x === '::' || x === '::1') return false;
    if (/^f[cd]/.test(x)) return false;          // fc00::/7  (ULA, privé)
    if (/^fe[89ab]/.test(x)) return false;       // fe80::/10 (link-local)
    if (x.startsWith('ff')) return false;        // multicast
    if (x.startsWith('64:ff9b')) return false;   // NAT64 (peut cibler de l'IPv4 interne)
    if (x.startsWith('2001:db8')) return false;  // documentation
    return true;
  }
  return false;
}

/** Résolution DNS qui refuse toute destination non publique (utilisée au moment de la connexion) */
function safeLookup(hostname: string, options: any, callback: any): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) {
      return callback(Object.assign(new Error('Destination interdite'), { code: 'EBLOCKED' }));
    }
    if (options && options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

function isAllowedTarget(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (port !== 80 && port !== 443) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host)) return false;
  // Une IP écrite en clair ne passe pas par le DNS → contrôle direct
  if (net.isIP(host) && !isPublicIp(host)) return false;
  return true;
}

/** Télécharge le début d'une page HTML de façon sûre. null si refusé ou en échec. */
function fetchHtmlSafely(rawUrl: string, redirectsLeft = 3, deadline = Date.now() + FETCH_TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    let u: URL;
    try { u = new URL(rawUrl); } catch { return resolve(null); }
    if (!isAllowedTarget(u)) return resolve(null);
    const remaining = deadline - Date.now();
    if (remaining <= 0) return resolve(null);

    let settled = false;
    const finish = (value: string | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET',
      lookup: safeLookup as any,
      headers: {
        'User-Agent': 'ChatApp/1.0 LinkPreviewBot (compatible; like Twitterbot)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return finish(null);
        let next: string;
        try { next = new URL(res.headers.location, u).toString(); } catch { return finish(null); }
        settled = true; clearTimeout(timer);
        return resolve(fetchHtmlSafely(next, redirectsLeft - 1, deadline));
      }
      if (status < 200 || status >= 300 || !String(res.headers['content-type'] || '').includes('text/html')) {
        res.resume();
        return finish(null);
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (chunk: Buffer) => {
        if (settled) return;
        const room = MAX_HTML_BYTES - total;
        chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
        total += Math.min(chunk.length, room);
        if (total >= MAX_HTML_BYTES) { res.destroy(); finish(Buffer.concat(chunks).toString('utf8')); }
      });
      res.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
      res.on('error', () => finish(null));
    });

    const timer = setTimeout(() => { req.destroy(); finish(null); }, remaining);
    req.on('error', () => finish(null));
    req.end();
  });
}

export const linkPreviewService = {
  /**
   * Retourne la première URL trouvée dans un message, ou null.
   */
  detectUrl(content: string): string | null {
    const matches = content.match(URL_REGEX);
    return matches?.[0] ?? null;
  },

  /**
   * Récupère les métadonnées de prévisualisation pour une URL.
   * Vérifie le cache Redis avant tout fetch réseau.
   */
  async fetchPreview(url: string): Promise<LinkPreviewData | null> {
    const cacheKey = `lp:${url}`;

    // 1. Cache Redis
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as LinkPreviewData;
    } catch { /* Redis optionnel */ }

    // 2. Fetch réseau (🔐 anti-SSRF, lecture plafonnée)
    try {
      const html = await fetchHtmlSafely(url);
      if (!html) return null;

      const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();

      const preview: LinkPreviewData = {
        title:       extractOgMeta(html, 'title')       || hostname,
        description: extractOgMeta(html, 'description') || '',
        // 🔐 Image d'aperçu : uniquement une URL https absolue
        image:       (() => { const img = extractOgMeta(html, 'image'); return img && /^https:\/\//i.test(img) ? img.slice(0, 1000) : null; })(),
        site_name:   extractOgMeta(html, 'site_name'),
        url,
      };

      // Troncature
      if (preview.title.length > 120)       preview.title       = preview.title.substring(0, 120) + '…';
      if (preview.description.length > 220) preview.description = preview.description.substring(0, 220) + '…';

      // Mise en cache 24h
      try { await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(preview)); } catch {}

      return preview;
    } catch {
      return null; // Timeout, réseau, ou HTML invalide → pas de preview
    }
  },
};
