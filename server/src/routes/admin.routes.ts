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
import { rateLimit } from '../middleware/rateLimit.middleware';
import { revokeUserAccess, restoreUserAccess } from '../services/accessRevocation.service';
import { adminAuthController } from '../controllers/admin-auth.controller';
import { cleanupService } from '../services/cleanup.service';
import { moderationActionRepository } from '../repositories/moderation-action.repository';
import { reportRepository } from '../repositories/report.repository';
import { messageRepository } from '../repositories/message.repository';
import { guestSecurityService } from '../services/guestSecurity.service';
import { db } from '../config/database';
import { validateSettingUpdate, invalidateAppSettings } from '../services/settings.service';
import { logAudit } from '../middleware/audit.middleware';
import { lcenService } from '../services/lcen.service';
import { uploadService, UploadActionError } from '../services/upload.service';
import { getIpFromRequest } from '../utils/ip';

// ══════════════════════════════════
// Auth TOTP (pas besoin d'admin_token)
// ══════════════════════════════════
export const adminAuthRouter = Router();
adminAuthRouter.use(requireAuth, requireSuperAdmin);
adminAuthRouter.get('/status', adminAuthController.status);
adminAuthRouter.post('/setup', adminAuthController.setup);
// 🔐 Anti brute-force TOTP : 5 essais / 15 min par compte
adminAuthRouter.post('/verify', rateLimit({ name: 'totp', max: 5, windowSeconds: 900, by: 'user' }), adminAuthController.verify);
adminAuthRouter.post('/logout', adminAuthController.logout);

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

/** POST /api/admin/lcen/purge — Purge immédiate des traces au-delà de la durée de conservation */
adminRouter.post('/lcen/purge', async (req, res) => {
  try {
    const result = await lcenService.purge();
    await logAudit('admin_lcen_purge', getIpFromRequest(req), req.user?.userId, { total: result.total }, req.headers['user-agent']);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('❌ admin lcen purge:', error?.message || error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ══════════════════════════════════
// Galerie des fichiers envoyés (tous, ou ceux d'un membre)
// ══════════════════════════════════

/** GET /api/admin/uploads?user_id=&kind=image|file|avatar&status=active|deleted|all&q=&before= */
adminRouter.get('/uploads', async (req, res) => {
  try {
    res.json(await uploadService.adminList({
      userId: req.query.user_id, kind: req.query.kind, status: req.query.status,
      q: req.query.q, before: req.query.before, limit: req.query.limit,
    }));
  } catch (error: any) {
    console.error('❌ admin uploads:', error?.message || error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/uploads/expire — effacer maintenant les fichiers dont la durée de conservation est dépassée */
adminRouter.post('/uploads/expire', async (req, res) => {
  try {
    const expired = await uploadService.expireOld(req.app.get('io'));
    await logAudit('admin_upload_expire', getIpFromRequest(req), req.user?.userId, { expired }, req.headers['user-agent']);
    res.json({ success: true, expired });
  } catch (error: any) {
    console.error('❌ admin uploads expire:', error?.message || error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** GET /api/admin/uploads/:id — trace complète + dimensions + EXIF + messages qui utilisent le fichier */
adminRouter.get('/uploads/:id', async (req, res) => {
  try {
    res.json(await uploadService.adminDetail(req.params.id));
  } catch (error: any) {
    if (error instanceof UploadActionError) return res.status(error.status).json({ error: error.message });
    console.error('❌ admin upload detail:', error?.message || error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** DELETE /api/admin/uploads/:id  { with_messages?: boolean } — retrait par la modération (tracé) */
adminRouter.delete('/uploads/:id', async (req, res) => {
  try {
    const result = await uploadService.adminRemove(req.params.id, req.body?.with_messages === true, req.app.get('io'));
    await logAudit('admin_upload_remove', getIpFromRequest(req), req.user?.userId,
      { upload_id: req.params.id, url: result.url, owner: result.user_id, messages: result.messages, with_messages: req.body?.with_messages === true },
      req.headers['user-agent']);
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof UploadActionError) return res.status(error.status).json({ error: error.message });
    console.error('❌ admin upload remove:', error?.message || error);
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

    // ⭐ Phase 4.1f — Si c'est un invité, bannir aussi son fingerprint + IP logic
    const targetUser = await db('users')
      .where({ id: targetId })
      .select('tier', 'guest_fingerprint', 'last_ip', 'username')
      .first();

    if (targetUser?.tier === 'guest' && targetUser.guest_fingerprint) {
      const adminUsername = req.user!.username || 'admin';
      const result = await guestSecurityService.banFingerprint({
        fingerprint:      targetUser.guest_fingerprint,
        usernameSnapshot: targetUser.username,
        lastKnownIp:      targetUser.last_ip || null,
        reason:           finalReason,
        permanent:        !banAction.expires_at,
        expiresAt:        banAction.expires_at ? new Date(banAction.expires_at) : null,
        bannedBy:         adminUsername,
      });

      if (result.permaban_triggered) {
        console.log(`🚫 Permaban IP automatique déclenché (${result.ip_ban_count} fingerprints bannis)`);
      }
    }

    // 🔐 Prévenir l'utilisateur puis couper immédiatement son accès (API, sessions, WebSocket)
    await revokeUserAccess(req.app.get('io'), targetId, {
      duration: duration || 'permanent',
      reason: finalReason,
      expires_at: banAction.expires_at,
      admin_message: admin_message || undefined,
    });

    res.json({ message: 'Utilisateur banni', expires_at: banAction.expires_at });
  } catch (error: any) {
    console.error('❌ admin ban:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** POST /api/admin/users/:id/unban */
adminRouter.post('/users/:id/unban', async (req, res) => {
  try {
    const targetId = req.params.id;
    const target = await db('users').where({ id: targetId }).select('tier', 'guest_fingerprint').first();
    if (!target) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

    await db('users').where({ id: targetId }).update({
      is_banned: false, ban_reason: null, ban_expires_at: null,
    });
    await restoreUserAccess(targetId);

    // 🐛 Correctif : un invité est aussi banni par son empreinte navigateur.
    // Sans ça, il restait bloqué à la reconnexion même après le débannissement.
    if (target.guest_fingerprint) {
      await guestSecurityService.unbanFingerprint(target.guest_fingerprint);
    }

    await moderationActionRepository.create({
      target_user_id: targetId, moderator_id: req.user!.userId,
      action: 'unban', reason: 'Débanni par l\'administrateur',
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
        'groups.allow_voice', 'groups.allow_video', 'groups.allow_screen', 'groups.allow_voicemsg', 'groups.voice_max_participants',
        'creator.username as creator_username'
      )
      .orderBy('groups.created_at', 'desc');
    res.json({ groups: Array.isArray(rows) ? rows : [] });
  } catch (error: any) {
    console.error('❌ admin groups:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * PATCH /api/admin/groups/:id/voice — Dérogations voix / vidéo / écran d'un salon
 * { allow_voice?, allow_video?, allow_screen?, allow_voicemsg?: 'on' | 'off' | null (null = suit le type de salon), voice_max_participants?: 2-100 | null }
 * 🔐 Une dérogation « on » ne dépasse jamais le type de compte du membre (voice.service.decide).
 */
adminRouter.patch('/groups/:id/voice', async (req, res) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const group = await db('groups').where({ id: req.params.id }).first('id', 'allow_voice', 'allow_video', 'allow_screen', 'allow_voicemsg', 'voice_max_participants');
    if (!group) return res.status(404).json({ error: 'NOT_FOUND' });

    const update: Record<string, any> = {};
    for (const col of ['allow_voice', 'allow_video', 'allow_screen', 'allow_voicemsg']) {
      if (!(col in (req.body || {}))) continue;
      const v = req.body[col];
      if (v !== null && v !== 'on' && v !== 'off') return res.status(400).json({ error: 'VALIDATION_ERROR', message: `${col} : on | off | null`, field: col });
      update[col] = v;
    }
    if ('voice_max_participants' in (req.body || {})) {
      const v = req.body.voice_max_participants;
      if (v !== null && !(Number.isInteger(v) && v >= 2 && v <= 100)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'voice_max_participants : entier de 2 à 100 ou null', field: 'voice_max_participants' });
      }
      update.voice_max_participants = v;
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Aucune valeur fournie' });

    await db('groups').where({ id: group.id }).update(update);
    await logAudit('admin_group_voice', getIpFromRequest(req), req.user?.userId, { group_id: group.id, from: group, to: update }, req.headers['user-agent']);
    res.json({ success: true, id: group.id, ...update });
  } catch (error: any) {
    console.error('❌ admin group voice:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** GET /api/admin/voice/health — État de LiveKit (configuré ? répond ?) : détails réservés au panel, jamais aux membres */
adminRouter.get('/voice/health', async (_req, res) => {
  try {
    const { getVoiceHealth, effectiveVoiceMode } = await import('../services/voice.service');
    const { settingsService } = await import('../services/settings.service');
    const h = await getVoiceHealth(true);
    res.json({ configured: h.configured, reachable: h.ok, detail: h.detail, checked_at: new Date(h.checkedAt).toISOString(),
      setting: await settingsService.voiceMode(), effective: await effectiveVoiceMode() });
  } catch (error: any) {
    console.error('❌ admin voice health:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
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
      // 🔐 Couper réellement l'accès (avant : seul un message était envoyé, et seulement si « notifier »)
      await revokeUserAccess(io, reported_user_id, notify ? {
        duration: duration || 'permanent',
        reason,
        expires_at: banAction.expires_at,
        admin_message: admin_message || undefined,
      } : undefined);
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

// ══════════════════════════════════════════════════════════════════
//  PARAMÈTRES GLOBAUX — Phase 4.1c
// ══════════════════════════════════════════════════════════════════

/** PATCH /api/admin/users/:id/tier — Changer le tier d'un utilisateur */
adminRouter.patch('/users/:id/tier', async (req, res) => {
  try {
    const { tier } = req.body;
    if (!['guest', 'registered', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Tier invalide. Valeurs : guest, registered, premium' });
    }
    await db('users').where({ id: req.params.id }).update({ tier });

    // ⭐ Notifier le client en temps réel → il rafraîchit son JWT sans se déconnecter
    const io = req.app.get('io');
    if (io) io.to(`user:${req.params.id}`).emit('user:tier_updated', { tier });

    res.json({ success: true, id: req.params.id, tier });
  } catch (error: any) {
    console.error('❌ admin users tier:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});


adminRouter.get('/settings', async (_req, res) => {
  try {
    const rows = await db('app_settings').select('*').orderBy('key');
    res.json({ settings: rows });
  } catch (error: any) {
    console.error('❌ admin settings GET:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** PATCH /api/admin/settings — Mettre à jour un ou plusieurs paramètres */
adminRouter.patch('/settings', async (req, res) => {
  try {
    const updates: Record<string, string> = req.body.settings || {};
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune valeur fournie' });
    }

    // 🔐 Valeurs contrôlées (choix fermés, bornes numériques) : tout est refusé si une seule est invalide
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      const check = validateSettingUpdate(key, value);
      if (!check.ok) return res.status(400).json({ error: check.error });
      normalized[key] = check.value;
    }

    const before = await db('app_settings').whereIn('key', Object.keys(normalized)).select('key', 'value');
    const previous: Record<string, string> = {};
    for (const r of before) previous[r.key] = r.value;

    const changes: Record<string, { from: string; to: string }> = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (!(key in previous)) continue; // clé inconnue : ignorée (aucune création depuis le panel)
      await db('app_settings')
        .where({ key })
        .update({ value, updated_at: db.fn.now() });
      if (previous[key] !== value) changes[key] = { from: previous[key], to: value };
    }

    // Invalider les caches (compression d'images + réglages par type de compte)
    invalidateAppSettings();
    try {
      const { invalidateSettingsCache } = await import('./upload.routes');
      invalidateSettingsCache();
    } catch { /* import dynamique optionnel */ }

    // Traçabilité : qui a changé quoi, quand (ancienne → nouvelle valeur)
    if (Object.keys(changes).length > 0) {
      await logAudit('admin_settings', getIpFromRequest(req), req.user?.userId, { changes }, req.headers['user-agent']);
    }

    res.json({ success: true, updated: Object.keys(updates) });
  } catch (error: any) {
    console.error('❌ admin settings PATCH:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  SÉCURITÉ INVITÉS — Phase 4.1f
// ══════════════════════════════════════════════════════════════════

/** GET /api/admin/security/stats */
adminRouter.get('/security/stats', async (_req, res) => {
  try {
    const stats = await guestSecurityService.getSecurityStats();
    res.json(stats);
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

/** GET /api/admin/security/fingerprints?page=1 */
adminRouter.get('/security/fingerprints', async (req, res) => {
  try {
    const page  = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const data  = await guestSecurityService.getBannedFingerprints(page, limit);
    res.json(data);
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

/** DELETE /api/admin/security/fingerprints/:fp — Débannir un fingerprint */
adminRouter.delete('/security/fingerprints/:fp', async (req, res) => {
  try {
    const result = await guestSecurityService.unbanFingerprint(req.params.fp);
    // 🐛 Débannir l'empreinte débannit aussi le compte invité correspondant
    // (avant : il fallait aussi le faire dans l'onglet Utilisateurs)
    const accounts = await db('users').where({ guest_fingerprint: req.params.fp }).select('id');
    await db('users').where({ guest_fingerprint: req.params.fp }).update({
      is_banned: false, ban_reason: null, ban_expires_at: null,
    });
    for (const a of accounts) await restoreUserAccess(a.id);
    res.json({ success: true, ip_auto_ban_lifted: result.ipAutoBanLifted });
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

/** GET /api/admin/security/ips?page=1 */
adminRouter.get('/security/ips', async (req, res) => {
  try {
    const page  = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const data  = await guestSecurityService.getBannedIps(page, limit);
    res.json(data);
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

/** POST /api/admin/security/ips — Permaban manuel d'une IP */
adminRouter.post('/security/ips', async (req, res) => {
  try {
    const { ip, reason } = req.body;
    if (!ip) return res.status(400).json({ error: 'ip requis' });
    await guestSecurityService.manualPermbanIp({
      ip,
      reason: reason || 'Banni manuellement',
      bannedBy: req.user!.username || 'admin',
    });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

/** DELETE /api/admin/security/ips/:ip — Débannir une IP */
adminRouter.delete('/security/ips/:ip', async (req, res) => {
  try {
    await guestSecurityService.unbanIp(req.params.ip);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

/** GET /api/admin/security/ip-history/:ip */
adminRouter.get('/security/ip-history/:ip', async (req, res) => {
  try {
    const rows = await guestSecurityService.getIpHistory(req.params.ip);
    res.json({ rows });
  } catch { res.status(500).json({ error: 'INTERNAL_ERROR' }); }
});

export default adminRouter;
