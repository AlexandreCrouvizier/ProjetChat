/**
 * controllers/conversations.controller.ts — Phase 3 : vérification de blocage avant DM
 */
import type { Request, Response } from 'express';
import { conversationRepository } from '../repositories/conversation.repository';
import { messageService } from '../services/message.service';
import { messageRepository } from '../repositories/message.repository';
import { userRepository } from '../repositories/user.repository';
import { blockedRepository } from '../repositories/blocked.repository';

export const conversationsController = {

  /** GET /api/conversations */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const conversations = await conversationRepository.findByUser(req.user!.userId);
      res.json({ conversations });
    } catch (error: any) {
      console.error('❌ list conversations:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/conversations — Créer / retrouver une conv */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { target_user_id } = req.body;
      const userId = req.user!.userId;

      if (!target_user_id) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'target_user_id requis' }); return; }
      if (target_user_id === userId) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Impossible de vous envoyer un message' }); return; }
      if (req.user!.tier === 'guest') { res.status(403).json({ error: 'FORBIDDEN', message: 'Créez un compte gratuit pour envoyer des messages privés' }); return; }

      const target = await userRepository.findById(target_user_id);
      if (!target) { res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' }); return; }

      // ⭐ Vérifier le blocage dans les deux sens
      const blocked = await blockedRepository.isEitherBlocked(userId, target_user_id);
      if (blocked) {
        res.status(403).json({ error: 'BLOCKED', message: 'Impossible d\'envoyer un message à cet utilisateur' });
        return;
      }

      const { conversation, isNew } = await conversationRepository.findOrCreate(userId, target_user_id);

      res.status(isNew ? 201 : 200).json({
        conversation: {
          id: conversation.id, is_new: isNew,
          participant: { id: target.id, username: target.username, avatar_url: target.avatar_url, tier: target.tier },
        },
      });
    } catch (error: any) {
      console.error('❌ create conversation:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/conversations/:id/messages */
  async messages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      if (!(await conversationRepository.isParticipant(id, userId))) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Non participant' }); return;
      }
      const messages = await messageService.getConversationMessages({
        conversationId: id, limit: parseInt(req.query.limit as string) || 50,
        before: req.query.before as string, currentUserId: userId,
      });
      const total = await messageRepository.countByConversation(id);
      res.json({ messages, has_more: messages.length > 0 && total > messages.length });
    } catch (error: any) {
      console.error('❌ conversation messages:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/conversations/:id/read — Marquer lu (✓✓) */
  async markRead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!(await conversationRepository.isParticipant(id, req.user!.userId))) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Non participant' }); return;
      }
      await conversationRepository.markAsRead(id, req.user!.userId);
      res.json({ last_read_at: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** DELETE /api/conversations/:id — Masquer une conversation */
  async hide(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      if (!(await conversationRepository.isParticipant(id, userId))) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Non participant' }); return;
      }
      await conversationRepository.hideForUser(id, userId);
      res.json({ message: 'Conversation masquée' });
    } catch (error: any) {
      console.error('❌ hide conversation:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
