/**
 * middleware/auth.middleware.ts — Vérifie le JWT sur chaque requête protégée
 * 
 * Fonctionnement :
 *   1. Récupère le token depuis le header "Authorization: Bearer <token>"
 *   2. Vérifie et décode le JWT
 *   3. Attache les infos de l'utilisateur à req.user
 *   4. Si pas de token ou invalide → 401
 * 
 * Deux middlewares :
 *   - requireAuth     : obligatoire (rejette si pas de token)
 *   - optionalAuth    : facultatif (passe même sans token, mais attache user si présent)
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';

// Étend le type Request d'Express pour y ajouter `user`
// Ça permet de faire req.user.userId dans les controllers
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware obligatoire — Bloque si pas authentifié
 * Utilisation : router.get('/api/users/me', requireAuth, controller.getMe)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token d\'authentification manquant',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Le token a expiré, veuillez le renouveler',
      });
    } else {
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token invalide',
      });
    }
  }
}

/**
 * Middleware optionnel — Passe toujours, mais attache user si token présent
 * Utilisation : router.get('/api/groups', optionalAuth, controller.list)
 * Permet aux invités non connectés de voir les salons publics
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Token invalide → on continue sans user (comme un invité)
    }
  }

  next();
}
