/**
 * middleware/superadmin.middleware.ts — Protection des routes admin
 * 
 * Deux niveaux de vérification :
 *   1. requireSuperAdmin : vérifie que l'utilisateur a app_role = 'superadmin'
 *   2. requireAdminToken : vérifie le JWT admin (émis après vérification TOTP)
 * 
 * Les routes de setup/verify TOTP n'exigent que requireSuperAdmin.
 * Les routes du dashboard admin exigent requireSuperAdmin + requireAdminToken.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/database';
import { env } from '../config/env';

// Le secret pour les admin tokens est différent du JWT principal
const ADMIN_JWT_SECRET = (env as any).ADMIN_JWT_SECRET || env.JWT_SECRET + '_admin_panel';

/**
 * Vérifie que l'utilisateur authentifié est superadmin en BDD
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié' });
      return;
    }

    const user = await db('users').where({ id: req.user.userId }).select('app_role').first();

    if (!user || user.app_role !== 'superadmin') {
      // Réponse volontairement vague pour ne pas révéler l'existence du panel
      res.status(404).json({ error: 'NOT_FOUND', message: 'Route introuvable' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
  }
}

/**
 * Vérifie le JWT admin (émis après TOTP) dans le header X-Admin-Token
 * Ce token a une durée courte (30 min)
 */
export async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminToken = req.headers['x-admin-token'] as string;

    if (!adminToken) {
      res.status(403).json({ error: 'ADMIN_TOKEN_REQUIRED', message: 'Token admin requis' });
      return;
    }

    const decoded = jwt.verify(adminToken, ADMIN_JWT_SECRET) as { userId: string; isAdmin: boolean };

    if (!decoded.isAdmin || decoded.userId !== req.user?.userId) {
      res.status(403).json({ error: 'INVALID_ADMIN_TOKEN', message: 'Token admin invalide' });
      return;
    }

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(403).json({ error: 'ADMIN_TOKEN_EXPIRED', message: 'Session admin expirée, veuillez revérifier votre code TOTP' });
    } else {
      res.status(403).json({ error: 'INVALID_ADMIN_TOKEN', message: 'Token admin invalide' });
    }
  }
}

/**
 * Génère un JWT admin après vérification TOTP réussie
 * Durée : 30 minutes
 */
export function generateAdminToken(userId: string): string {
  return jwt.sign(
    { userId, isAdmin: true },
    ADMIN_JWT_SECRET,
    { expiresIn: '30m' }
  );
}
