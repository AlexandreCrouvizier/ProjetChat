/**
 * controllers/profile.controller.ts — FIXED: avatar upload + delete + validation
 */
import type { Request, Response } from 'express';
import { userRepository } from '../repositories/user.repository';
import { VALIDATION } from '../../../shared/constants';

export const profileController = {

  /** PATCH /api/users/me */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { username, bio, theme } = req.body;
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
        },
      });
    } catch (error: any) {
      console.error('❌ updateProfile:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** PATCH /api/users/me/avatar — Upload avatar (base64 ou URL) */
  async updateAvatar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { avatar_url } = req.body;

      if (avatar_url === undefined) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'avatar_url requis' });
        return;
      }

      // Si avatar_url est null ou vide → supprimer l'avatar
      if (!avatar_url || avatar_url === '' || avatar_url === 'null') {
        await userRepository.update(userId, { avatar_url: null } as any);
        res.json({ avatar_url: null });
        return;
      }

      // Valider la taille
      if (typeof avatar_url === 'string' && avatar_url.length > 700000) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Image trop volumineuse (max ~500KB)' });
        return;
      }

      // Valider le format (data URL ou URL http)
      if (typeof avatar_url === 'string' && !avatar_url.startsWith('data:image/') && !avatar_url.startsWith('http')) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Format invalide (image base64 ou URL attendue)' });
        return;
      }

      const user = await userRepository.update(userId, { avatar_url } as any);
      res.json({ avatar_url: user?.avatar_url || null });
    } catch (error: any) {
      console.error('❌ updateAvatar:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** DELETE /api/users/me/avatar — Supprimer l'avatar */
  async deleteAvatar(req: Request, res: Response): Promise<void> {
    try {
      await userRepository.update(req.user!.userId, { avatar_url: null } as any);
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
