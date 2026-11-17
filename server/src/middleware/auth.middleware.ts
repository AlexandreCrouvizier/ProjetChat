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
import { COOKIE, readRequestCookie } from '../utils/authCookies';
import { isAccessRevoked } from '../services/accessRevocation.service';

/** Jeton d'accès : cookie httpOnly (navigateur) ou en-tête « Authorization: Bearer » (outils, tests) */
export function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return readRequestCookie(req, COOKIE.access);
}

// `req.user` est déjà déclaré par passport (type Express.User, vide par défaut).
// On complète CE type au lieu de redéclarer `user` (conflit qui cassait le typage partout) :
// ainsi req.user.userId / tier / username sont connus de TypeScript dans tous les contrôleurs.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends JwtPayload {}
  }
}

/**
 * Middleware obligatoire — Bloque si pas authentifié
 * Utilisation : router.get('/api/users/me', requireAuth, controller.getMe)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getAccessToken(req);

  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token d\'authentification manquant',
    });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
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
    return;
  }

  // 🔐 Compte banni entre-temps : son jeton encore valide est refusé immédiatement
  isAccessRevoked(payload.userId)
    .then((revoked) => {
      if (revoked) {
        res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Compte suspendu' });
        return;
      }
      req.user = payload;
      next();
    })
    .catch(next);
}

/**
 * Middleware optionnel — Passe toujours, mais attache user si token présent
 * Utilisation : router.get('/api/groups', optionalAuth, controller.list)
 * Permet aux invités non connectés de voir les salons publics
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = getAccessToken(req);
  if (!token) { next(); return; }

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    // Token invalide → on continue sans user (comme un invité)
    next();
    return;
  }

  // 🔐 Compte banni : traité comme un visiteur anonyme
  isAccessRevoked(payload.userId)
    .then((revoked) => {
      if (!revoked) req.user = payload;
      next();
    })
    .catch(next);
}
