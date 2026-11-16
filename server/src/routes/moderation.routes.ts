/**
 * routes/moderation.routes.ts — Phase 3 : signalement + modération
 */
import { Router } from 'express';
import { moderationController } from '../controllers/moderation.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireSuperAdmin, requireAdminToken } from '../middleware/superadmin.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';

const router = Router();

// Signalement — tous les utilisateurs authentifiés peuvent signaler (y compris invités)
router.post('/reports', requireAuth, rateLimit({ name: 'report', max: 20, windowSeconds: 3600, by: 'user' }), moderationController.createReport);

// 🔐 Modération globale — réservée au superadmin authentifié par TOTP.
// (Avant : n'importe quel compte inscrit pouvait lister les signalements, masquer des messages,
//  muter ou bannir n'importe qui — y compris le superadmin.)
router.get('/reports', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.listReports);
router.patch('/reports/:id', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.reviewReport);

// Actions globales sur un utilisateur
router.post('/users/:id/mute', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.muteUser);
router.post('/users/:id/unmute', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.unmuteUser);
router.post('/users/:id/ban', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.banUser);
router.post('/users/:id/unban', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.unbanUser);

// Historique modération d'un utilisateur
router.get('/users/:id/history', requireAuth, requireSuperAdmin, requireAdminToken, moderationController.userHistory);

export default router;
