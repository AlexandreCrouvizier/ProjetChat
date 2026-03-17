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

      res.status(201).json(result);
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

      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** POST /api/auth/guest */
  async guest(req: Request, res: Response): Promise<void> {
    try {
      const { username } = req.body;

      const result = await authService.loginAsGuest({
        username,
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** POST /api/auth/refresh */
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'refresh_token est requis',
        });
        return;
      }

      const result = await authService.refreshTokens({
        refreshToken: refresh_token,
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  },

  /** POST /api/auth/logout */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refresh_token } = req.body;

      await authService.logout({
        refreshToken: refresh_token,
        userId: req.user!.userId,
        ip: getIpFromRequest(req),
        userAgent: req.headers['user-agent'],
      });

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
