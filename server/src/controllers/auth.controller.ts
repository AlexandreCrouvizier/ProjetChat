/**
 * controllers/auth.controller.ts — Gère les requêtes HTTP d'authentification
 * 
 * Le controller fait le pont entre Express (req/res) et le service.
 * Il ne contient PAS de logique métier (c'est le service qui gère).
 * Son rôle :
 *   1. Extraire les données de la requête (body, headers, IP)
 *   2. Appeler le service
 *   3. Retourner la réponse (JSON + status code)
 *   4. Attraper les erreurs et retourner le bon code HTTP
 */

import type { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { getIpFromRequest } from '../utils/ip';
import { AppError } from '../utils/errors';
import { verifyRefreshToken } from '../utils/jwt';
import {
  COOKIE, readRequestCookie, setSessionCookies, setGuestCookie, clearSessionCookies, withoutTokens,
} from '../utils/authCookies';

export const authController = {

  /** POST /api/auth/register */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password } = req.body;

      // Validation basique des champs requis
      if (!username || !email || !password) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'username, email et password sont requis',
        });
        return;
      }

      const result = await authService.register({
        username,
        email,
        password,
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

      // 🔐 Jetons en cookies httpOnly, jamais dans le JSON
      setSessionCookies(res, result);
      res.status(201).json(withoutTokens(result));
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** POST /api/auth/login */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'email et password sont requis',
        });
        return;
      }

      const result = await authService.login({
        email,
        password,
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

      setSessionCookies(res, result);
      res.json(withoutTokens(result));
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** POST /api/auth/guest */
  async guest(req: Request, res: Response): Promise<void> {
    try {
      const { username, fingerprint } = req.body;

      const result = await authService.loginAsGuest({
        username,
        fingerprint: typeof fingerprint === 'string' ? fingerprint.substring(0, 80) : undefined,
        // 🔐 Secret de reconnexion : lu UNIQUEMENT dans son cookie httpOnly (chemin /api/auth)
        guestSecret: readRequestCookie(req, COOKIE.guest),
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

      setSessionCookies(res, result);
      if (result.guest_secret) setGuestCookie(res, result.guest_secret);
      res.status(201).json(withoutTokens(result));
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** POST /api/auth/refresh */
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      // 🔐 Le jeton de renouvellement n'est lu QUE dans son cookie httpOnly (chemin /api/auth)
      const refreshToken = readRequestCookie(req, COOKIE.refresh);

      if (!refreshToken) {
        res.status(401).json({
          error: 'NO_SESSION',
          message: 'Aucune session à renouveler',
        });
        return;
      }

      const result = await authService.refreshTokens({
        refreshToken,
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

      setSessionCookies(res, result);
      res.json(withoutTokens(result));
    } catch (error: any) {
      // Session invalide → on efface les cookies pour ne pas réessayer en boucle
      if (error instanceof AppError && error.statusCode === 401) clearSessionCookies(res);
      handleError(res, error);
    }
  },

  /** POST /api/auth/logout */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = readRequestCookie(req, COOKIE.refresh);

      // Utilisateur : celui du jeton d'accès, sinon celui du jeton de renouvellement
      // (permet de se déconnecter proprement même si le jeton d'accès a expiré)
      let userId = req.user?.userId;
      if (!userId && refreshToken) {
        try { userId = verifyRefreshToken(refreshToken).userId; } catch { /* jeton invalide */ }
      }

      if (userId) {
        await authService.logout({
          refreshToken,
          userId,
          ip: getIpFromRequest(req),
          userAgent: req.headers['user-agent'],
        });
      }

      clearSessionCookies(res);
      res.json({ message: 'Déconnecté' });
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** GET /api/auth/me — Retourne l'utilisateur courant */
  async me(req: Request, res: Response): Promise<void> {
    try {
      // req.user est déjà rempli par le middleware requireAuth
      // Mais il ne contient que userId, username, tier (le JWT payload)
      // On va chercher le profil complet en BDD
      const { userRepository } = await import('../repositories/user.repository');
      const user = await userRepository.findById(req.user!.userId);

      if (!user) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });
        return;
      }

      res.json({ user: authService.sanitizeUser(user) });
    } catch (error: any) {
      handleError(res, error);
    }
  },
};

/**
 * Gère les erreurs de manière uniforme
 * Les AppError ont un statusCode, les autres erreurs → 500
 */
function handleError(res: Response, error: any): void {
  if (error instanceof AppError) {
    const body: any = {
      error: error.code,
      message: error.message,
    };
    // Ajoute le champ spécifique si c'est une ValidationError
    if ('field' in error && error.field) {
      body.field = error.field;
    }
    res.status(error.statusCode).json(body);
  } else {
    console.error('❌ Erreur inattendue:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Erreur interne du serveur',
    });
  }
}
