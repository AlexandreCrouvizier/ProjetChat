/**
 * controllers/messages.controller.ts — FIXED: ajout endpoint thread
 */
import type { Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { historyService } from '../services/history.service';
import { AppError } from '../utils/errors';
import { assertCanReadGroup, assertCanReadMessage } from '../services/access.service';

export const messagesController = {

  /** GET /api/groups/:groupId/messages */
  async getGroupMessages(req: Request, res: Response): Promise<void> {
    try {
      const { groupId } = req.params;
      const { limit, before } = req.query;
      // 🔐 Salon privé → membres uniquement
      await assertCanReadGroup(groupId, req.user?.userId);
      // Première arrivée dans le salon (sert à la règle « N messages avant l'arrivée »)
      if (req.user) await historyService.recordArrival(groupId, req.user.userId);
      const result = await messageService.getGroupMessages({
        groupId, limit: limit ? parseInt(limit as string, 10) || 50 : 50,
        before: typeof before === 'string' && /^[0-9a-f-]{36}$/i.test(before) ? before : undefined,
        currentUserId: req.user?.userId, currentUserTier: req.user?.tier,
      });
      res.json({ messages: result.messages, has_more: result.hasMore, history: result.history });
    } catch (error: any) {
      if (error instanceof AppError) res.status(error.statusCode).json({ error: error.code, message: error.message });
      else { console.error('❌ getGroupMessages:', error); res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' }); }
    }
  },

  /** GET /api/groups/:groupId/messages/:messageId/thread — Réponses d'un thread */
  async getThread(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      // 🔐 Le fil hérite des droits du message parent (salon privé / DM)
      await assertCanReadMessage(messageId, req.user?.userId);
      const messages = await messageService.getThreadMessages(messageId, req.user?.userId, req.user?.tier);
      res.json({ messages });
    } catch (error: any) {
      if (error instanceof AppError) { res.status(error.statusCode).json({ error: error.code, message: error.message }); return; }
      console.error('❌ getThread:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
