/**
 * routes/admin.routes.ts — Phase 3.5 COMPLET
 * 
 * Routes :
 *   /api/admin-auth/* → TOTP setup/verify (requireSuperAdmin)
 *   /api/admin/*      → dashboard (requireSuperAdmin + requireAdminToken)
 * 
 * Endpoints admin :
 *   GET  /stats           → stats complètes
 *   POST /cleanup         → nettoyage manuel
 *   GET  /reports         → liste signalements (filtrable par status)
 *   PATCH /reports/:id    → traiter un signalement
 *   GET  /users           → liste tous les utilisateurs
 *   POST /users/:id/ban   → bannir
 *   POST /users/:id/unban → débannir
 *   POST /users/:id/mute  → muter global
 *   POST /users/:id/unmute→ démuter
 *   GET  /groups          → liste tous les salons
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireSuperAdmin, requireAdminToken } from '../middleware/superadmin.middleware';
import { adminAuthController } from '../controllers/admin-auth.controller';
import { cleanupService } from '../services/cleanup.service';
import { moderationActionRepository } from '../repositories/moderation-action.repository';
import { reportRepository } from '../repositories/report.repository';
import { messageRepository } from '../repositories/message.repository';
import { db } from '../config/database';

// ══════════════════════════════════
// Auth TOTP (pas besoin d'admin_token)
// ══════════════════════════════════
export const adminAuthRouter = Router();
adminAuthRouter.use(requireAuth, requireSuperAdmin);
adminAuthRouter.get('/status', adminAuthController.status);
adminAuthRouter.post('/setup', adminAuthController.setup);
adminAuthRouter.post('/verify', adminAuthController.verify);

// ══════════════════════════════════
// Dashboard admin (post-TOTP)
// ══════════════════════════════════
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin, requireAdminToken);

/** GET /api/admin/stats */
adminRouter.get('/stats', async (_req, res) => {
  try {
    const usersByTier = await db('users').select('tier').count('id as count').groupBy('tier');
    const [usersTotal] = await db('users').count('id as total');
    const groupsByStatus = await db('groups').select('status').count('id as count').groupBy('status');
    const groupsByType = await db('groups').select('type').count('id as count').groupBy('type');
    const [messagesTotal] = await db('messages').count('id as total');
    const [convsTotal] = await db('conversations').count('id as total');
    const [pendingReports] = await db('reports').where('status', 'pending').count('id as total');
    const [modActionsWeek] = await db('moderation_actions').where('created_at', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).count('id as total');
    const [bannedUsers] = await db('users').where('is_banned', true).count('id as total');
    const [messagesToday] = await db('messages').where('created_at', '>', new Date(new Date().setHours(0, 0, 0, 0))).count('id as total');

    res.json({
      users: {
        total: parseInt(usersTotal.total as string, 10),
        by_tier: Object.fromEntries(usersByTier.map(r => [r.tier, parseInt(r.count as string, 10)])),
        banned: parseInt(bannedUsers.total as string, 10),
      },
      groups: {
        total: parseInt((await db('groups').count('id as total'))[0].total as string, 10),
        by_status: Object.fromEntries(groupsByStatus.map(r => [r.status, parseInt(r.count as string, 10)])),
        by_type: Object.fromEntries(groupsByType.map(r => [r.type, parseInt(r.count as string, 10)])),
      },
      messages: { total: parseInt(messagesTotal.total as string, 10), today: parseInt(messagesToday.total as string, 10) },
      conversations: { total: parseInt(convsTotal.total as string, 10) },
      moderation: {
        pending_reports: parseInt(pendingReports.total as string, 10),
        actions_this_week: parseInt(modActionsWeek.total as string, 10),
      },
    });
  } catch (error: any) {
    console.error('❌ admin stats:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/cleanup */
adminRouter.post('/cleanup', async (_req, res) => {
  try {
    const result = await cleanupService.run();
    res.json({ message: 'Nettoyage effectué', ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** GET /api/admin/reports — Liste regroupée par message_id */
adminRouter.get('/reports', async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const result = await reportRepository.findAllGrouped({
      status: status as string,
      page: parseInt(page as string) || 1,
      limit: Math.min(parseInt(limit as string) || 20, 50),
    });
    res.json(result);
  } catch (error: any) {
    console.error('❌ admin reports:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * PATCH /api/admin/reports/:id
 * Body optionnel : message_id → traite TOUS les reports du message d'un coup
 */
adminRouter.patch('/reports/:id', async (req, res) => {
  try {
    const { status, review_note, message_id } = req.body;
    const adminId = req.user!.userId;

    if (!['reviewed', 'actioned', 'dismissed'].includes(status)) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Statut invalide' });
      return;
    }

    // Si message_id fourni → batch (tous les reports de ce message)
    if (message_id) {
      await reportRepository.reviewAllForMessage(message_id, {
        status,
        reviewed_by: adminId,
        review_note,
      });
    } else {
      await reportRepository.review(req.params.id, {
        status, reviewed_by: adminId, review_note,
      });
    }

    // Si actioned → masquer le message + émettre WS
    if (status === 'actioned') {
      const targetMessageId = message_id || (await reportRepository.findById(req.params.id))?.message_id;
      if (targetMessageId) {
        const msg = await db('messages').where({ id: targetMessageId }).select('group_id', 'conversation_id', 'parent_message_id').first();
        await messageRepository.softDelete(targetMessageId, `Admin action #${req.params.id}`);
        const io = req.app.get('io');
        if (io) {
          const payload = { message_id: targetMessageId, parent_message_id: msg?.parent_message_id || null };
          if (msg?.group_id) io.to(`group:${msg.group_id}`).emit('message:hidden', payload);
          if (msg?.conversation_id) io.to(`conv:${msg.conversation_id}`).emit('message:hidden', payload);
        }
      }
    }

    res.json({ success: true, status });
  } catch (error: any) {
    console.error('❌ admin review:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** GET /api/admin/users — Tous les utilisateurs */
adminRouter.get('/users', async (_req, res) => {
  try {
    const users = await db('users')
      .select('id', 'username', 'email', 'tier', 'app_role', 'is_banned', 'is_muted',
        'ban_reason', 'donor_badge', 'created_at', 'last_seen_at')
      .orderBy('created_at', 'desc');
    res.json({ users });
  } catch (error: any) {
    console.error('❌ admin users:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/users/:id/ban */
adminRouter.post('/users/:id/ban', async (req, res) => {
  try {
    const { duration, reason, admin_message } = req.body;
    const targetId = req.params.id;
    const finalReason = reason || 'Banni par l\'administrateur';

    const banAction = await moderationActionRepository.create({
      target_user_id: targetId, moderator_id: req.user!.userId,
      action: 'ban', duration: duration || 'permanent',
      reason: finalReason,
    });

    await db('users').where({ id: targetId }).update({
      is_banned: true,
      ban_reason: finalReason,
      ban_expires_at: banAction.expires_at || null,
    });

    // ⭐ Notification WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${targetId}`).emit('moderation:banned', {
        duration: duration || 'permanent',
        reason: finalReason,
        expires_at: banAction.expires_at,
        admin_message: admin_message || undefined,
      });
    }

    res.json({ message: 'Utilisateur banni', expires_at: banAction.expires_at });
  } catch (error: any) {
    console.error('❌ admin ban:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/users/:id/unban */
adminRouter.post('/users/:id/unban', async (_req, res) => {
  try {
    await db('users').where({ id: _req.params.id }).update({
      is_banned: false, ban_reason: null, ban_expires_at: null,
    });
    res.json({ message: 'Utilisateur débanni' });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/users/:id/mute — Muter global depuis le panel admin */
adminRouter.post('/users/:id/mute', async (req, res) => {
  try {
    const { duration, reason, admin_message } = req.body;
    const targetId = req.params.id;

    const action = await moderationActionRepository.create({
      target_user_id: targetId, moderator_id: req.user!.userId,
      action: 'mute', duration: duration || '30m',
      reason: reason || 'Muté par l\'administrateur',
    });

    await db('users').where({ id: targetId }).update({
      is_muted: true,
      mute_expires_at: action.expires_at || null,
    });

    // ⭐ Notification WebSocket avec admin_message
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${targetId}`).emit('moderation:muted', {
        duration: duration || '30m',
        reason: reason || 'Muté par l\'administrateur',
        expires_at: action.expires_at,
        admin_message: admin_message || undefined,
      });
    }

    res.json({ action, message: `Utilisateur muté (${duration || '30m'})` });
  } catch (error: any) {
    console.error('❌ admin mute:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/users/:id/unmute — Démuter global */
adminRouter.post('/users/:id/unmute', async (req, res) => {
  try {
    const targetId = req.params.id;
    await db('users').where({ id: targetId }).update({
      is_muted: false, mute_expires_at: null,
    });
    await moderationActionRepository.create({
      target_user_id: targetId, moderator_id: req.user!.userId,
      action: 'unmute', reason: 'Démuté par l\'administrateur',
    });
    res.json({ message: 'Utilisateur démuté' });
  } catch (error: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** GET /api/admin/groups — Tous les salons */
adminRouter.get('/groups', async (_req, res) => {
  try {
    const rows = await db('groups')
      .leftJoin('users as creator', 'groups.creator_id', '=', 'creator.id')
      .select(
        'groups.id', 'groups.name', 'groups.description', 'groups.type',
        'groups.status', 'groups.is_official', 'groups.member_count',
        'groups.created_at', 'groups.last_message_at', 'groups.creator_id',
        'creator.username as creator_username'
      )
      .orderBy('groups.created_at', 'desc');
    res.json({ groups: Array.isArray(rows) ? rows : [] });
  } catch (error: any) {
    console.error('❌ admin groups:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/** POST /api/admin/groups — Créer un salon officiel */
adminRouter.post('/groups', async (req, res) => {
  try {
    const { name, description, type, rules } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Nom requis' });
      return;
    }
    const existing = await db('groups').where({ name: name.trim() }).first();
    if (existing) {
      res.status(409).json({ error: 'CONFLICT', message: 'Un salon avec ce nom existe déjà' });
      return;
    }
    const [group] = await db('groups').insert({
      name: name.trim(),
      description: description?.trim() || null,
      type: type === 'private' ? 'private' : 'public',
      rules: rules?.trim() || null,
      is_official: true,
      status: 'active',
      member_count: 0,
    }).returning('*');

    // ⭐ Broadcast temps réel si salon public
    if (group.type === 'public') {
      const io = req.app.get('io');
      if (io) io.emit('group:created', { group });
    }

    res.status(201).json({ group });
  } catch (error: any) {
    console.error('❌ admin create group:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/reports/action — Action composite sur un signalement
 * Body : { report_ids[], message_id?, reported_user_id, action, duration?, reason, notify? }
 * action : 'hide' | 'hide_mute' | 'hide_ban'
 */
adminRouter.post('/reports/action', async (req, res) => {
  try {
    const { report_ids, message_id, reported_user_id, action, duration, reason, notify, admin_message } = req.body;
    const adminId = req.user!.userId;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!action || !['hide', 'hide_mute', 'hide_ban'].includes(action)) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'action invalide (hide | hide_mute | hide_ban)' });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason requis' });
      return;
    }
    if (!reported_user_id) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reported_user_id requis' });
      return;
    }

    const io = req.app.get('io');

    // ── 1. Masquer le message + émettre WS ────────────────────────────────
    if (message_id) {
      const msg = await db('messages').where({ id: message_id }).select('group_id', 'conversation_id', 'parent_message_id').first();
      await messageRepository.softDelete(message_id, `Admin: ${reason}`);
      if (io) {
        const payload = { message_id, parent_message_id: msg?.parent_message_id || null };
        if (msg?.group_id) io.to(`group:${msg.group_id}`).emit('message:hidden', payload);
        if (msg?.conversation_id) io.to(`conv:${msg.conversation_id}`).emit('message:hidden', payload);
      }
    }

    // ── 2. Marquer tous les reports comme traités ──────────────────────────
    if (message_id) {
      await reportRepository.reviewAllForMessage(message_id, {
        status: 'actioned',
        reviewed_by: adminId,
        review_note: reason,
      });
    } else if (Array.isArray(report_ids) && report_ids.length > 0) {
      for (const rid of report_ids) {
        await reportRepository.review(rid, { status: 'actioned', reviewed_by: adminId, review_note: reason });
      }
    }

    // ── 3. Muter si demandé ────────────────────────────────────────────────
    if (action === 'hide_mute') {
      const muteAction = await moderationActionRepository.create({
        target_user_id: reported_user_id,
        moderator_id: adminId,
        action: 'mute',
        duration: duration || '1h',
        reason,
      });
      await db('users').where({ id: reported_user_id }).update({
        is_muted: true,
        mute_expires_at: muteAction.expires_at || null,
      });
      if (notify && io) {
        io.to(`user:${reported_user_id}`).emit('moderation:muted', {
          duration: duration || '1h',
          reason,
          expires_at: muteAction.expires_at,
          admin_message: admin_message || undefined,
        });
      }
    }

    // ── 4. Bannir si demandé ───────────────────────────────────────────────
    if (action === 'hide_ban') {
      const banAction = await moderationActionRepository.create({
        target_user_id: reported_user_id,
        moderator_id: adminId,
        action: 'ban',
        duration: duration || 'permanent',
        reason,
      });
      await db('users').where({ id: reported_user_id }).update({
        is_banned: true,
        ban_reason: reason,
        ban_expires_at: banAction.expires_at || null,
      });
      if (notify && io) {
        io.to(`user:${reported_user_id}`).emit('moderation:banned', {
          duration: duration || 'permanent',
          reason,
          expires_at: banAction.expires_at,
          admin_message: admin_message || undefined,
        });
      }
    }

    res.json({
      message: 'Action effectuée',
      action,
      message_hidden: !!message_id,
    });
  } catch (error: any) {
    console.error('❌ admin reports/action:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default adminRouter;
