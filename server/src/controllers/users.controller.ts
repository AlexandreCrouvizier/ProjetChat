/**
 * controllers/users.controller.ts — Endpoints utilisateurs
 * 
 * Pour l'instant : recherche pour l'autocomplete des mentions @pseudo
 * Phase 2 suite : profil, avatar, bio, settings
 */

import type { Request, Response } from 'express';
import { mentionService } from '../services/mention.service';
import { userRepository } from '../repositories/user.repository';

export const usersController = {

  /** GET /api/users/search?q=pau&group_id=uuid — Recherche pour @mention autocomplete */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { q, group_id } = req.query;

      if (!q || typeof q !== 'string' || q.length < 1) {
        res.json({ users: [] });
        return;
      }

      const users = await mentionService.searchForAutocomplete({
        query: q,
        groupId: group_id as string,
        currentUserId: req.user!.userId,
        limit: 8,
      });

      res.json({ users });
    } catch (error: any) {
      console.error('❌ users search:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/users/:id — Profil public d'un utilisateur */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = await userRepository.findById(req.params.id);
      if (!user) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });
        return;
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          avatar_url: user.avatar_url,
          bio: user.bio,
          tier: user.tier,
          donor_badge: user.donor_badge,
          status_text: user.status_text,
          status_emoji: user.status_emoji,
          last_seen_at: user.last_seen_at,
          created_at: user.created_at,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
