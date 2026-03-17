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
 * Middleware Express pour le rate limiting global (par IP)
 * Plus général que le rate limit par message
 */
export function rateLimitMiddleware(maxRequests: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:api:${ip}`;

    const current = await redis.incr(key);
    
    if (current === 1) {
      // Première requête → initialise le TTL
      await redis.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: `Trop de requêtes. Réessayez dans ${windowSeconds} secondes.`,
      });
      return;
    }

    next();
  };
}
