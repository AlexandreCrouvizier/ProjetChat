/**
 * controllers/profile.controller.ts — profil, avatar (fichier), statut
 */
import type { Request, Response } from 'express';
import { userRepository } from '../repositories/user.repository';
import { VALIDATION } from '../../../shared/constants';
import { uploadService, InvalidImageError, QuotaExceededError } from '../services/upload.service';
import { getIpFromRequest } from '../utils/ip';
import { db } from '../config/database';
import { settingsService, MOBILE_LAYOUTS, DEFAULT_MOBILE_LAYOUT, type MobileLayout } from '../services/settings.service';

/** Disposition sur téléphone d'un compte : règle de son type de compte + son choix (s'il a le droit de choisir) */
async function layoutFor(userId: string) {
  const row = await db('users').where({ id: userId }).first('tier', 'mobile_layout');
  if (!row) return null;
  const rule = (await settingsService.forTier(row.tier)).mobileLayout;
  const preference: MobileLayout | null = MOBILE_LAYOUTS.includes(row.mobile_layout) ? row.mobile_layout : null;
  const effective: MobileLayout = rule === 'option' ? (preference ?? DEFAULT_MOBILE_LAYOUT) : rule;
  return { rule, preference, effective, choices: MOBILE_LAYOUTS };
}

export const profileController = {

  /** GET /api/users/me/layout — disposition sur téléphone (tous les types de compte, invités compris) */
  async getLayout(req: Request, res: Response): Promise<void> {
    try {
      const layout = await layoutFor(req.user!.userId);
      if (!layout) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      res.json(layout);
    } catch (error: any) {
      console.error('❌ getLayout:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /**
   * PATCH /api/users/me/layout — { mobile_layout: 'stack' | 'tabs' | 'drawers' | null }
   * 🔐 Choix fermé ; refusé (403) quand l'admin impose la disposition de ce type de compte.
   */
  async updateLayout(req: Request, res: Response): Promise<void> {
    try {
      const value = req.body?.mobile_layout;
      if (value !== null && !MOBILE_LAYOUTS.includes(value)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: `Disposition invalide (${MOBILE_LAYOUTS.join(' | ')} ou null)`, field: 'mobile_layout' });
        return;
      }
      const current = await layoutFor(req.user!.userId);
      if (!current) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (current.rule !== 'option') {
        res.status(403).json({ error: 'LAYOUT_LOCKED', message: "La disposition est choisie par l'administrateur pour votre type de compte" });
        return;
      }
      await db('users').where({ id: req.user!.userId }).update({ mobile_layout: value });
      res.json(await layoutFor(req.user!.userId));
    } catch (error: any) {
      console.error('❌ updateLayout:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** PATCH /api/users/me */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { username, bio, theme, gif_display, keep_upload_metadata } = req.body;
      const updates: Record<string, any> = {};

      if (username !== undefined) {
        if (username.length < VALIDATION.username.minLength || username.length > VALIDATION.username.maxLength) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: `Pseudo : ${VALIDATION.username.minLength}-${VALIDATION.username.maxLength} caractères`, field: 'username' });
          return;
        }
        if (!VALIDATION.username.pattern.test(username)) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Pseudo : lettres, chiffres, - et _ uniquement', field: 'username' });
          return;
        }
        const existing = await userRepository.findByUsername(username);
        if (existing && existing.id !== userId) {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Ce pseudo est déjà pris', field: 'username' });
          return;
        }
        updates.username = username;
      }

      if (bio !== undefined) {
        // Tronquer silencieusement si trop long
        updates.bio = typeof bio === 'string' ? bio.substring(0, VALIDATION.bio.maxLength) : '';
      }

      if (theme !== undefined && (theme === 'light' || theme === 'dark')) {
        updates.theme = theme;
      }

      // Préférence d'affichage des GIFs (null = suit la règle admin du tier)
      // Métadonnées de mes images : true = conserver, false/null = supprimer (utile si l'admin a mis « option »)
      if (keep_upload_metadata !== undefined) {
        if (keep_upload_metadata !== null && typeof keep_upload_metadata !== 'boolean') {
          res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valeur invalide pour les métadonnées', field: 'keep_upload_metadata' });
          return;
        }
        updates.keep_upload_metadata = keep_upload_metadata;
      }

      if (gif_display !== undefined) {
        if (gif_display === null || gif_display === 'auto' || gif_display === 'click') {
          updates.gif_display = gif_display;
        }
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Aucune modification' });
        return;
      }

      const user = await userRepository.update(userId, updates);
      if (!user) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

      res.json({
        user: {
          id: user.id, username: user.username, email: user.email,
          tier: user.tier, avatar_url: user.avatar_url, bio: user.bio,
          donor_badge: user.donor_badge, theme: user.theme,
          status_text: user.status_text, status_emoji: user.status_emoji,
          gif_display: (user as any).gif_display ?? null,
        },
      });
    } catch (error: any) {
      console.error('❌ updateProfile:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/users/me/avatar — Envoi d'un avatar (fichier, champ « file », 5 Mo max)
   * 🔐 Avant : image base64 (jusqu'à 700 Ko renvoyés avec chaque message) ou URL externe libre
   * (traçage d'IP de tous ceux qui voyaient l'avatar). Maintenant : fichier vérifié par Sharp,
   * converti en WebP 256×256 sans métadonnées, stocké chez nous et tracé (table uploads).
   */
  async uploadAvatar(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Aucune image reçue' });
        return;
      }
      const user = req.user!;
      await uploadService.assertQuota(user.userId, user.tier, 64 * 1024); // un avatar fait ~10-40 Ko
      const avatarUrl = await uploadService.saveAvatar(req.file.buffer, { id: user.userId, username: user.username }, {
        ip: getIpFromRequest(req), originalName: req.file.originalname,
      });
      res.json({ avatar_url: avatarUrl });
    } catch (error: any) {
      if (error instanceof InvalidImageError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });
        return;
      }
      if (error instanceof QuotaExceededError) {
        res.status(413).json({ error: 'STORAGE_QUOTA_EXCEEDED', message: error.message });
        return;
      }
      console.error('❌ uploadAvatar:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** DELETE /api/users/me/avatar — Supprimer l'avatar */
  async deleteAvatar(req: Request, res: Response): Promise<void> {
    try {
      await uploadService.removeAvatar(req.user!.userId);
      res.json({ avatar_url: null });
    } catch (error: any) {
      console.error('❌ deleteAvatar:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** PATCH /api/users/me/status */
  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { status_text, status_emoji } = req.body;
      const updates: Record<string, any> = {};

      if (status_text !== undefined) updates.status_text = (status_text || '').substring(0, 100);
      if (status_emoji !== undefined) updates.status_emoji = (status_emoji || '').substring(0, 10);

      const user = await userRepository.update(userId, updates);

      const io = req.app.get('io');
      if (io) {
        io.emit('presence:status_updated', {
          user_id: userId, status_text: user?.status_text, status_emoji: user?.status_emoji,
        });
      }

      res.json({ status_text: user?.status_text, status_emoji: user?.status_emoji });
    } catch (error: any) {
      console.error('❌ updateStatus:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
