/**
 * middleware/rateLimit.middleware.ts — Rate limiting avec Redis
 * 
 * Deux usages :
 *   1. Middleware Express (pour les routes REST)
 *   2. Fonction directe (pour les événements WebSocket)
 * 
 * Le délai entre deux messages dépend du type de compte et se règle dans Panel → Paramètres
 * (par défaut : invité 10 s, inscrit 1 s, premium 0,5 s).
 */

import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { settingsService } from '../services/settings.service';
import { getIpFromRequest } from '../utils/ip';

/**
 * Vérifie si un utilisateur peut envoyer un message (délai minimum entre deux messages).
 * Le délai dépend du type de compte et se règle dans Panel → Paramètres (settings.service).
 * Retourne { allowed, delayMs } — delayMs sert au message d'erreur affiché au membre.
 */
export async function checkRateLimit(userId: string, tier: string): Promise<{ allowed: boolean; delayMs: number }> {
  const key = `ratelimit:msg:${userId}`;
  const delayMs = (await settingsService.forTier(tier)).rateLimitMs;

  try {
    // Redis SET NX PX = « crée la clé seulement si elle n'existe pas », durée en millisecondes
    // (avant : EX en secondes arrondies → 0,5 s devenait 1 s)
    const result = await redis.set(key, '1', 'PX', delayMs, 'NX');
    return { allowed: result === 'OK', delayMs };
  } catch (err) {
    console.error('⚠️ Rate limit indisponible (Redis) :', (err as any)?.message || err);
    return { allowed: true, delayMs };
  }
}

/**
 * Compteur générique à fenêtre fixe.
 * Retourne { allowed, retryAfter } — fail-open si Redis est indisponible (log l'erreur).
 */
export async function hitLimit(
  key: string, max: number, windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const fullKey = `ratelimit:${key}`;
    const current = await redis.incr(fullKey);
    if (current === 1) await redis.expire(fullKey, windowSeconds);
    if (current > max) {
      const ttl = await redis.ttl(fullKey);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }
    return { allowed: true, retryAfter: 0 };
  } catch (err) {
    console.error('⚠️ Rate limit indisponible (Redis) :', (err as any)?.message || err);
    return { allowed: true, retryAfter: 0 };
  }
}

/** Remet un compteur à zéro (ex. après une connexion réussie) */
export async function resetLimit(key: string): Promise<void> {
  try { await redis.del(`ratelimit:${key}`); } catch { /* non bloquant */ }
}

/**
 * 🔐 Middleware Express de limitation de débit.
 *   name : identifiant de la règle (ex. 'login')
 *   by   : 'ip' (défaut) ou 'user' (nécessite requireAuth avant)
 */
export function rateLimit(opts: { name: string; max: number; windowSeconds: number; by?: 'ip' | 'user' }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subject = opts.by === 'user' && req.user?.userId ? `u:${req.user.userId}` : `ip:${getIpFromRequest(req)}`;
    const { allowed, retryAfter } = await hitLimit(`${opts.name}:${subject}`, opts.max, opts.windowSeconds);
    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfter / 60)} min.`,
      });
      return;
    }
    next();
  };
}

/** @deprecated conservé pour compatibilité — utiliser rateLimit() */
export function rateLimitMiddleware(maxRequests: number, windowSeconds: number) {
  return rateLimit({ name: 'api', max: maxRequests, windowSeconds });
}
