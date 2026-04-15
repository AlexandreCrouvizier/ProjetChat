/**
 * controllers/admin-auth.controller.ts — Authentification admin (TOTP)
 * 
 * Endpoints :
 *   GET  /api/admin-auth/status  → vérifie si superadmin + TOTP configuré
 *   POST /api/admin-auth/setup   → génère QR code TOTP (premier accès)
 *   POST /api/admin-auth/verify  → vérifie le code 6 chiffres → émet admin_token
 */
import type { Request, Response } from 'express';
import { totpService } from '../services/totp.service';
import { generateAdminToken } from '../middleware/superadmin.middleware';
import { db } from '../config/database';

export const adminAuthController = {

  /**
   * GET /api/admin-auth/status
   * Vérifie si l'utilisateur est superadmin et si le TOTP est configuré
   * Appelé au chargement de la page admin pour savoir quel écran afficher
   */
  async status(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const user = await db('users').where({ id: userId }).select('app_role', 'totp_enabled').first();

      if (!user || user.app_role !== 'superadmin') {
        // Réponse vague
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.json({
        is_superadmin: true,
        totp_enabled: user.totp_enabled,
      });
    } catch (error: any) {
      console.error('❌ admin status:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/admin-auth/setup
   * Génère un nouveau secret TOTP + QR code
   * Uniquement si le TOTP n'est pas encore activé
   */
  async setup(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await totpService.setup(userId);

      res.json({
        qr_code: result.qrCodeUrl,
        secret_manual: result.secret,  // Pour saisie manuelle si le QR ne marche pas
        message: 'Scannez le QR code avec Google Authenticator, puis entrez le code à 6 chiffres pour activer.',
      });
    } catch (error: any) {
      if (error.message === 'TOTP déjà configuré. Utilisez la vérification.') {
        res.status(409).json({ error: 'ALREADY_CONFIGURED', message: error.message });
      } else {
        console.error('❌ admin setup:', error);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
      }
    }
  },

  /**
   * POST /api/admin-auth/verify
   * Vérifie le code TOTP et émet un admin_token JWT (30 min)
   */
  async verify(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { code } = req.body;

      if (!code || typeof code !== 'string' || code.length !== 6) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Code à 6 chiffres requis' });
        return;
      }

      const isValid = await totpService.verify(userId, code);

      if (!isValid) {
        res.status(401).json({ error: 'INVALID_CODE', message: 'Code invalide ou expiré' });
        return;
      }

      // Générer le token admin (30 min)
      const adminToken = generateAdminToken(userId);

      res.json({
        admin_token: adminToken,
        expires_in: 1800, // 30 min en secondes
        message: 'Authentification admin réussie',
      });
    } catch (error: any) {
      console.error('❌ admin verify:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
