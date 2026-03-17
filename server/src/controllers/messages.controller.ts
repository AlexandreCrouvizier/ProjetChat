/**
 * controllers/messages.controller.ts — Endpoints REST pour les messages
 * 
 * Le temps réel passe par WebSocket (message:send).
 * Le REST sert principalement à récupérer l'historique.
 */

import type { Request, Response } from 'express';
import { messageService } from '../services/message.service';
import { AppError } from '../utils/errors';

export const messagesController = {

  /** GET /api/groups/:groupId/messages — Historique des messages */
  async getGroupMessages(req: Request, res: Response): Promise<void> {
    try {
      const { groupId } = req.params;
      const { limit, before } = req.query;

      const messages = await messageService.getGroupMessages({
        groupId,
        limit: limit ? parseInt(limit as string, 10) : 50,
        before: before as string,
        userTier: req.user?.tier,
      });

      // Déterminer s'il y a plus de messages (pour le "charger plus")
      const total = await (await import('../repositories/message.repository')).messageRepository.countByGroup(groupId);
      const hasMore = messages.length > 0 && total > messages.length;

      res.json({
        messages,
        has_more: hasMore,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.code, message: error.message });
      } else {
        console.error('❌ Erreur getGroupMessages:', error);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
      }
    }
  },
};
