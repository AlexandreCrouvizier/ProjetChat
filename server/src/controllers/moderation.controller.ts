/**
 * controllers/moderation.controller.ts — Phase 3 Étape 5
 * 
 * Mise à jour : createReport accepte maintenant :
 *   - message_id + reason → signaler un message (comme avant)
 *   - reported_user_id + reason → signaler un utilisateur directement (nouveau)
 */
import type { Request, Response } from 'express';
import { reportRepository } from '../repositories/report.repository';
import { moderationActionRepository } from '../repositories/moderation-action.repository';
import { messageRepository } from '../repositories/message.repository';
import { userRepository } from '../repositories/user.repository';
import { logAudit } from '../middleware/audit.middleware';
import { getIpFromRequest } from '../utils/ip';

const AUTO_HIDE_THRESHOLD = 3;

export const moderationController = {

  /** POST /api/moderation/reports — Signaler un message OU un utilisateur */
  async createReport(req: Request, res: Response): Promise<void> {
    try {
      const { message_id, reported_user_id, reason, reason_text } = req.body;
      const reporterId = req.user!.userId;

      if (!reason) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason requis' });
        return;
      }

      const validReasons = ['spam', 'harassment', 'hate_speech', 'nsfw', 'misinformation', 'inappropriate', 'fake_account', 'other'];
      if (!validReasons.includes(reason)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: `Motif invalide. Valeurs : ${validReasons.join(', ')}` });
        return;
      }

      let targetUserId: string;
      let groupId: string | undefined;
      let conversationId: string | undefined;

      if (message_id) {
        // ⭐ Signalement d'un MESSAGE
        const message = await messageRepository.findById(message_id);
        if (!message) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Message introuvable' });
          return;
        }
        if (message.author_id === reporterId) {
          res.status(400).json({ error: 'INVALID_ACTION', message: 'Vous ne pouvez pas signaler votre propre message' });
          return;
        }
        // Doublon ?
        const already = await reportRepository.existsForUser(message_id, reporterId);
        if (already) {
          res.status(409).json({ error: 'DUPLICATE', message: 'Vous avez déjà signalé ce message' });
          return;
        }
        targetUserId = message.author_id!;
        groupId = message.group_id || undefined;
        conversationId = message.conversation_id || undefined;
      } else if (reported_user_id) {
        // ⭐ Signalement d'un UTILISATEUR (sans message)
        const targetUser = await userRepository.findById(reported_user_id);
        if (!targetUser) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });
          return;
        }
        if (reported_user_id === reporterId) {
          res.status(400).json({ error: 'INVALID_ACTION', message: 'Vous ne pouvez pas vous signaler vous-même' });
          return;
        }
        targetUserId = reported_user_id;
      } else {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'message_id ou reported_user_id requis' });
        return;
      }

      const report = await reportRepository.create({
        message_id: message_id || undefined,
        reported_user_id: targetUserId,
        reporter_id: reporterId,
        group_id: groupId,
        conversation_id: conversationId,
        reason,
        reason_text: reason_text?.trim() || undefined,
      });

      // Auto-hide si message avec seuil atteint
      if (message_id) {
        const count = await reportRepository.countForMessage(message_id);
        const message = await messageRepository.findById(message_id);
        if (count >= AUTO_HIDE_THRESHOLD && message && !message.is_hidden) {
          await messageRepository.softDelete(message_id, 'Auto-masqué : seuil de signalements atteint');
          // ⭐ Notifier les clients en temps réel
          const io = req.app.get('io');
          if (io) {
            const hiddenPayload = { message_id, parent_message_id: message.parent_message_id || null };
            if (message.group_id) io.to(`group:${message.group_id}`).emit('message:hidden', hiddenPayload);
            if (message.conversation_id) io.to(`conv:${message.conversation_id}`).emit('message:hidden', hiddenPayload);
          }
        }
      }

      await logAudit('report_create', getIpFromRequest(req), reporterId, {
        report_id: report.id, message_id, reported_user_id: targetUserId, reason,
      });

      res.status(201).json({
        report: { id: report.id, status: report.status },
      });
    } catch (error: any) {
      console.error('❌ createReport:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/moderation/reports — Dashboard modérateur */
  async listReports(req: Request, res: Response): Promise<void> {
    try {
      const { status, page, limit } = req.query;
      const result = await reportRepository.findAll({
        status: status as string,
        page: parseInt(page as string) || 1,
        limit: Math.min(parseInt(limit as string) || 20, 50),
      });
      res.json({
        reports: result.reports,
        pagination: {
          page: parseInt(page as string) || 1,
          total: result.total,
          pages: Math.ceil(result.total / (parseInt(limit as string) || 20)),
        },
      });
    } catch (error: any) {
      console.error('❌ listReports:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** PATCH /api/moderation/reports/:id — Traiter un signalement */
  async reviewReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, review_note } = req.body;
      const moderatorId = req.user!.userId;

      if (!['reviewed', 'actioned', 'dismissed'].includes(status)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Statut invalide' });
        return;
      }

      const report = await reportRepository.findById(id);
      if (!report) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

      const updated = await reportRepository.review(id, {
        status, reviewed_by: moderatorId, review_note,
      });

      if (status === 'actioned' && report.message_id) {
        const targetMsg = await messageRepository.findById(report.message_id);
        await messageRepository.softDelete(report.message_id, `Masqué suite au signalement #${id}`);
        // ⭐ Notifier les clients en temps réel
        const io = req.app.get('io');
        if (io) {
          const hiddenPayload = { message_id: report.message_id, parent_message_id: targetMsg?.parent_message_id || null };
          if (targetMsg?.group_id) io.to(`group:${targetMsg.group_id}`).emit('message:hidden', hiddenPayload);
          if (targetMsg?.conversation_id) io.to(`conv:${targetMsg.conversation_id}`).emit('message:hidden', hiddenPayload);
        }
      }

      await logAudit('report_review', getIpFromRequest(req), moderatorId, {
        report_id: id, status, review_note,
      });

      res.json({ report: updated });
    } catch (error: any) {
      console.error('❌ reviewReport:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/moderation/users/:id/mute — Mute global */
  async muteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id: targetId } = req.params;
      const { duration, reason } = req.body;
      const moderatorId = req.user!.userId;

      if (!duration || !reason) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'duration et reason requis' });
        return;
      }

      const target = await userRepository.findById(targetId);
      if (!target) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

      await userRepository.update(targetId, { is_muted: true, mute_expires_at: null } as any);

      const action = await moderationActionRepository.create({
        target_user_id: targetId, moderator_id: moderatorId,
        action: 'mute', duration, reason,
        ip_address: getIpFromRequest(req),
      });

      if (action.expires_at) {
        await userRepository.update(targetId, { mute_expires_at: action.expires_at } as any);
      }

      await logAudit('user_mute', getIpFromRequest(req), moderatorId, {
        target_user_id: targetId, duration, reason,
      });

      res.json({ action, message: `Utilisateur muté (${duration})` });
    } catch (error: any) {
      console.error('❌ muteUser:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/moderation/users/:id/unmute */
  async unmuteUser(req: Request, res: Response): Promise<void> {
    try {
      const { id: targetId } = req.params;
      const moderatorId = req.user!.userId;
      await userRepository.update(targetId, { is_muted: false, mute_expires_at: null } as any);
      await moderationActionRepository.create({
        target_user_id: targetId, moderator_id: moderatorId,
        action: 'unmute', reason: 'Démute par modérateur',
        ip_address: getIpFromRequest(req),
      });
      res.json({ message: 'Utilisateur démuté' });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/moderation/users/:id/ban — Bannir */
  async banUser(req: Request, res: Response): Promise<void> {
    try {
      const { id: targetId } = req.params;
      const { duration, reason } = req.body;
      const moderatorId = req.user!.userId;

      if (!duration || !reason) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'duration et reason requis' });
        return;
      }

      const target = await userRepository.findById(targetId);
      if (!target) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

      const action = await moderationActionRepository.create({
        target_user_id: targetId, moderator_id: moderatorId,
        action: 'ban', duration, reason,
        ip_address: getIpFromRequest(req),
      });

      await userRepository.update(targetId, {
        is_banned: true, ban_reason: reason,
        ban_expires_at: action.expires_at || null,
      } as any);

      await logAudit('user_ban', getIpFromRequest(req), moderatorId, {
        target_user_id: targetId, duration, reason,
      });

      res.json({ action, message: `Utilisateur banni (${duration})` });
    } catch (error: any) {
      console.error('❌ banUser:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** POST /api/moderation/users/:id/unban */
  async unbanUser(req: Request, res: Response): Promise<void> {
    try {
      const { id: targetId } = req.params;
      const moderatorId = req.user!.userId;
      await userRepository.update(targetId, {
        is_banned: false, ban_reason: null, ban_expires_at: null,
      } as any);
      await moderationActionRepository.create({
        target_user_id: targetId, moderator_id: moderatorId,
        action: 'unban', reason: 'Débanni par modérateur',
        ip_address: getIpFromRequest(req),
      });
      res.json({ message: 'Utilisateur débanni' });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },

  /** GET /api/moderation/users/:id/history — Historique modération */
  async userHistory(req: Request, res: Response): Promise<void> {
    try {
      const actions = await moderationActionRepository.findByUser(req.params.id);
      res.json({ actions });
    } catch (error: any) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur serveur' });
    }
  },
};
