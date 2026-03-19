/**
 * controllers/messages.controller.ts — FIXED: ajout endpoint thread
 */
import type { Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { messageRepository } from '../repositories/message.repository';
import { AppError } from '../utils/errors';

export const messagesController = {

  /** GET /api/groups/:groupId/messages */
  async getGroupMessages(req: Request, res: Response): Promise<void> {
    try {
      const { groupId } = req.params;
      const { limit, before } = req.query;
      const messages = await messageService.getGroupMessages({
        groupId, limit: limit ? parseInt(limit as string, 10) : 50,
        before: before as string, currentUserId: req.user?.userId,
      });
      const total = await messageRepository.countByGroup(groupId);
      res.json({ messages, has_more: messages.length > 0 && total > messages.length });
    } catch (error: any) {
      if (error instanceof AppError) res.status(error.statusCode).json({ error: error.code, message: error.message });
      else { console.error('❌ getGroupMessages:', error); res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' }); }
    }
  },

  /** GET /api/groups/:groupId/messages/:messageId/thread — Réponses d'un thread */
  async getThread(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const messages = await messageService.getThreadMessages(messageId, req.user?.userId);
      res.json({ messages });
    } catch (error: any) {
      console.error('❌ getThread:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
