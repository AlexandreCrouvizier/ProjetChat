/**
 * services/gif.service.ts — Recherche de GIF via le serveur (Klipy > Giphy > Tenor)
 *
 * 🔐 Avant : la clé API GIF était envoyée au navigateur (/api/config/gif), qui appelait
 * directement le fournisseur. N'importe quel visiteur pouvait la copier et épuiser notre quota.
 * Maintenant la clé ne quitte jamais le serveur : le navigateur demande /api/gifs/search,
 * le serveur interroge le fournisseur et ne renvoie que la liste des GIF.
 *
 * 🔐 Un GIF n'est accepté (résultats de recherche ET messages) que s'il est hébergé par un fournisseur
 * (GIF_MEDIA_DOMAINS, partagé avec la CSP du client) : impossible de faire passer pour un GIF une image
 * hébergée n'importe où (traçage d'IP des lecteurs), et le navigateur refuse toute autre image externe.
 */
import crypto from 'crypto';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { isGifMediaUrl } from '../../../shared/constants';

export type GifProvider = 'klipy' | 'giphy' | 'tenor' | 'none';

export interface GifResult {
  id: string;
  title: string;
  preview: string;
  original: string;
}

const SEARCH_CACHE_SECONDS = 300;          // mêmes résultats pendant 5 min (économise le quota)
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // réponse du fournisseur : 2 Mo max
const REQUEST_TIMEOUT_MS = 5000;
export const GIF_QUERY_MAX_LENGTH = 100;
export const GIF_LIMIT_MAX = 50;


export function getGifProvider(): { provider: GifProvider; key: string } {
  if (env.GIF_KLIPY_API_KEY) return { provider: 'klipy', key: env.GIF_KLIPY_API_KEY };
  if (env.GIF_GIPHY_API_KEY) return { provider: 'giphy', key: env.GIF_GIPHY_API_KEY };
  if (env.GIF_TENOR_API_KEY) return { provider: 'tenor', key: env.GIF_TENOR_API_KEY };
  return { provider: 'none', key: '' };
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** URL https propre (sans identifiants, port standard), sinon chaîne vide */
function cleanHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1000) return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function buildProviderUrl(provider: GifProvider, key: string, q: string, limit: number): string {
  const query = encodeURIComponent(q);
  const k = encodeURIComponent(key);
  switch (provider) {
    case 'klipy':
      return q
        ? `https://api.klipy.com/v2/search?q=${query}&key=${k}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`
        : `https://api.klipy.com/v2/featured?key=${k}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`;
    case 'giphy':
      return q
        ? `https://api.giphy.com/v1/gifs/search?api_key=${k}&q=${query}&limit=${limit}&lang=fr`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${k}&limit=${limit}`;
    case 'tenor':
      return q
        ? `https://tenor.googleapis.com/v2/search?q=${query}&key=${k}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`
        : `https://tenor.googleapis.com/v2/featured?key=${k}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`;
    default:
      return '';
  }
}

const rejectedHosts = new Set<string>();

function normalize(provider: GifProvider, data: any): GifResult[] {
  const items: any[] = provider === 'giphy' ? data?.data : data?.results;
  if (!Array.isArray(items)) return [];
  const out: GifResult[] = [];
  for (const item of items) {
    let preview = '', original = '';
    if (provider === 'giphy') {
      preview  = cleanHttpsUrl(item?.images?.fixed_height_small?.url || item?.images?.downsized?.url);
      original = cleanHttpsUrl(item?.images?.original?.url || item?.images?.downsized?.url);
    } else {
      const f = item?.media_formats || {};
      preview  = cleanHttpsUrl(f.tinygif?.url || f.nanogif?.url || f.gif?.url);
      original = cleanHttpsUrl(f.gif?.url || f.tinygif?.url);
    }
    if (!preview || !original) continue;
    // 🔐 Images hébergées ailleurs que chez le fournisseur : écartées (et signalées, sans la clé)
    if (!isGifMediaUrl(preview) || !isGifMediaUrl(original)) {
      rejectedHosts.add(new URL(isGifMediaUrl(preview) ? original : preview).hostname);
      continue;
    }
    out.push({
      id: String(item?.id ?? '').slice(0, 100),
      title: typeof item?.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 140) : 'GIF',
      preview,
      original,
    });
  }
  return out;
}

/** Lit une réponse JSON en refusant tout ce qui dépasse la taille maximale */
async function readJsonLimited(res: Response): Promise<any> {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error('Réponse GIF trop volumineuse');
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Réponse GIF trop volumineuse');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

export const gifService = {
  /**
   * Recherche (q vide = GIF du moment). Lève une erreur si le fournisseur ne répond pas correctement.
   */
  async search(q: string, limit: number): Promise<GifResult[]> {
    const { provider, key } = getGifProvider();
    if (provider === 'none') return [];

    const query = q.trim().slice(0, GIF_QUERY_MAX_LENGTH);
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), GIF_LIMIT_MAX);
    const cacheKey = `gif:search:${provider}:${safeLimit}:${hash(query.toLowerCase())}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as GifResult[]; } catch { /* cache illisible → on refait la requête */ }
    }

    const res = await fetch(buildProviderUrl(provider, key, query, safeLimit), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      // Le statut seul : jamais l'URL (elle contient la clé)
      logger.warn(`GIF ${provider} : réponse ${res.status}`);
      throw new Error(`Fournisseur GIF indisponible (${res.status})`);
    }

    const results = normalize(provider, await readJsonLimited(res));
    if (rejectedHosts.size) {
      logger.warn(`GIF ${provider} : images hébergées hors des domaines autorisés ignorées (${[...rejectedHosts].join(', ')}) — à ajouter à GIF_MEDIA_DOMAINS (shared/constants.ts) si c'est bien le fournisseur`);
      rejectedHosts.clear();
    }
    await redis.set(cacheKey, JSON.stringify(results), 'EX', SEARCH_CACHE_SECONDS);
    return results;
  },

  /** 🔐 Une URL de GIF envoyée dans un message est-elle hébergée par un fournisseur ? */
  async isTrustedGifUrl(value: unknown): Promise<boolean> {
    return isGifMediaUrl(value);
  },
};
