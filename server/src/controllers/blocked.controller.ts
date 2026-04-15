/**
 * controllers/blocked.controller.ts — Blocage utilisateur
 */
import type { Request, Response } from 'express';
import { blockedRepository } from '../repositories/blocked.repository';
import { userRepository } from '../repositories/user.repository';

export const blockedController = {

  /** POST /api/users/:id/block — Bloquer un utilisateur */
  async block(req: Request, res: Response): Promise<void> {
    try {
      const blockerId = req.user!.userId;
      const blockedId = req.params.id;

      if (blockerId === blockedId) {
        res.status(400).json({ error: 'INVALID_ACTION', message: 'Vous ne pouvez pas vous bloquer vous-même' });
        return;
      }

      const target = await userRepository.findById(blockedId);
      if (!target) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });
        return;
      }

      await blockedRepository.block(blockerId, blockedId);
      res.json({ message: 'Utilisateur bloqué', blocked_id: blockedId });
    } catch (error: any) {
      console.error('❌ block:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** DELETE /api/users/:id/block — Débloquer un utilisateur */
  async unblock(req: Request, res: Response): Promise<void> {
    try {
      const blockerId = req.user!.userId;
      const blockedId = req.params.id;

      await blockedRepository.unblock(blockerId, blockedId);
      res.json({ message: 'Utilisateur débloqué', blocked_id: blockedId });
    } catch (error: any) {
      console.error('❌ unblock:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/users/me/blocked — Liste des utilisateurs bloqués */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const blocked = await blockedRepository.getBlockedByUser(req.user!.userId);
      res.json({ blocked });
    } catch (error: any) {
      console.error('❌ blocked list:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/users/:id/block-status — Vérifier si un utilisateur est bloqué */
  async checkStatus(req: Request, res: Response): Promise<void> {
    try {
      const isBlocked = await blockedRepository.isBlocked(req.user!.userId, req.params.id);
      res.json({ is_blocked: isBlocked });
    } catch (error: any) {
      console.error('❌ block status:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
