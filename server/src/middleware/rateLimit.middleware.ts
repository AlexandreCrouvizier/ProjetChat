/**
 * middleware/rateLimit.middleware.ts — Rate limiting avec Redis
 * 
 * Deux usages :
 *   1. Middleware Express (pour les routes REST)
 *   2. Fonction directe (pour les événements WebSocket)
 * 
 * Le rate limit est différent selon le tier :
 *   - Invité  : 1 message / 10 secondes
 *   - Inscrit : 1 message / 1 seconde
 *   - Premium : 1 message / 0.5 seconde
 */

import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { TIER_LIMITS } from '../../../shared/constants';
import { getIpFromRequest } from '../utils/ip';

/**
 * Vérifie si un utilisateur peut envoyer un message (rate limit)
 * Retourne true si autorisé, false si limité
 */
export async function checkRateLimit(userId: string, tier: string): Promise<boolean> {
  const key = `ratelimit:msg:${userId}`;
  
  // Récupère le délai en ms selon le tier
  const tierConfig = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
  if (!tierConfig) return true;
  
  const delayMs = tierConfig.rateLimitMs;
  const delaySeconds = Math.ceil(delayMs / 1000);

  // Redis SET NX = "set only if not exists" + TTL
  // Si la clé existe déjà → le rate limit n'est pas écoulé → bloqué
  const result = await redis.set(key, '1', 'EX', delaySeconds, 'NX');
  
  return result === 'OK';  // 'OK' = clé créée = autorisé, null = existait déjà = bloqué
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
