/**
 * routes/gifs.routes.ts — GIF via le serveur
 *
 *   GET /api/gifs/config  (public)                  → fournisseur actif + règles d'affichage par tier
 *   GET /api/gifs/search  (inscrit / premium)       → ?q=texte&limit=20 — résultats normalisés
 *
 * 🔐 La clé API reste sur le serveur : elle n'apparaît jamais dans une réponse.
 */
import { Router } from 'express';
import { db } from '../config/database';
import { requireAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { gifService, getGifProvider, GIF_QUERY_MAX_LENGTH, GIF_LIMIT_MAX } from '../services/gif.service';
import { logger } from '../utils/logger';

const router = Router();

const DISPLAY_RULES = ['visible', 'masked', 'option'];
const DEFAULT_DISPLAY = { guest: 'masked', registered: 'option', premium: 'visible', limit: 20 };

async function readDisplaySettings() {
  try {
    const rows = await db('app_settings')
      .whereIn('key', ['gif_display_guest', 'gif_display_registered', 'gif_display_premium', 'gif_picker_limit'])
      .select('key', 'value');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    const rule = (v: string | undefined, fallback: string) => (v && DISPLAY_RULES.includes(v) ? v : fallback);
    const limit = parseInt(map['gif_picker_limit'] ?? '20', 10);
    return {
      guest:      rule(map['gif_display_guest'], DEFAULT_DISPLAY.guest),
      registered: rule(map['gif_display_registered'], DEFAULT_DISPLAY.registered),
      premium:    rule(map['gif_display_premium'], DEFAULT_DISPLAY.premium),
      limit:      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), GIF_LIMIT_MAX) : DEFAULT_DISPLAY.limit,
    };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

router.get('/config', async (_req, res) => {
  res.json({ provider: getGifProvider().provider, display: await readDisplaySettings() });
});

router.get(
  '/search',
  requireAuth,
  requireTier('registered', 'premium'),
  rateLimit({ name: 'gif-search', max: 60, windowSeconds: 60, by: 'user' }),
  async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.length > GIF_QUERY_MAX_LENGTH) {
      res.status(400).json({ error: 'INVALID_QUERY', message: `Recherche limitée à ${GIF_QUERY_MAX_LENGTH} caractères` });
      return;
    }
    const limit = parseInt(typeof req.query.limit === 'string' ? req.query.limit : '20', 10);
    try {
      res.json({ provider: getGifProvider().provider, results: await gifService.search(q, limit) });
    } catch (error: any) {
      logger.warn(`Recherche GIF impossible : ${error?.message || error}`);
      res.status(502).json({ error: 'GIF_PROVIDER_ERROR', message: 'Le service de GIF ne répond pas, réessayez plus tard.' });
    }
  },
);

export default router;
