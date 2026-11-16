/**
 * services/linkPreview.service.ts — Phase 4.1 : Preview de liens
 *
 * Détecte les URLs dans un message texte, fetch les métadonnées OpenGraph
 * côté serveur (évite les CORS), met en cache dans Redis 24h.
 *
 * Retourne : { title, description, image, url } | null
 *
 * ⚠️ Nécessite Node 20+ (fetch natif). Si Node < 20, installer node-fetch.
 */

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

    // 2. Fetch réseau
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ChatApp/1.0 LinkPreviewBot (compatible; like Twitterbot)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr,en;q=0.9',
        },
      });
      clearTimeout(timer);

      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;

      // Lire seulement les premiers 500 Ko (les balises meta sont toujours dans <head>)
      const buffer = await response.arrayBuffer();
      const html = new TextDecoder().decode(buffer.slice(0, MAX_HTML_BYTES));

      const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();

      const preview: LinkPreviewData = {
        title:       extractOgMeta(html, 'title')       || hostname,
        description: extractOgMeta(html, 'description') || '',
        image:       extractOgMeta(html, 'image'),
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
