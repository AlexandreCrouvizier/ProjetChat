/**
 * routes/moderation.routes.ts — Phase 3 : signalement + modération
 */
import { Router } from 'express';
import { moderationController } from '../controllers/moderation.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireSuperAdmin, requireAdminToken } from '../middleware/superadmin.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { requireAdminGateway } from '../middleware/adminGateway.middleware';

// 🔐 Chaîne commune aux actions du panel : passerelle admin (PC seul) + superadmin + token TOTP
const adminOnly = [requireAdminGateway, requireAuth, requireSuperAdmin, requireAdminToken];

const router = Router();

// Signalement — tous les utilisateurs authentifiés peuvent signaler (y compris invités)
router.post('/reports', requireAuth, rateLimit({ name: 'report', max: 20, windowSeconds: 3600, by: 'user' }), moderationController.createReport);

// 🔐 Modération globale — réservée au superadmin authentifié par TOTP.
// (Avant : n'importe quel compte inscrit pouvait lister les signalements, masquer des messages,
//  muter ou bannir n'importe qui — y compris le superadmin.)
router.get('/reports', ...adminOnly, moderationController.listReports);
router.patch('/reports/:id', ...adminOnly, moderationController.reviewReport);

// Actions globales sur un utilisateur
router.post('/users/:id/mute', ...adminOnly, moderationController.muteUser);
router.post('/users/:id/unmute', ...adminOnly, moderationController.unmuteUser);
router.post('/users/:id/ban', ...adminOnly, moderationController.banUser);
router.post('/users/:id/unban', ...adminOnly, moderationController.unbanUser);

// Historique modération d'un utilisateur
router.get('/users/:id/history', ...adminOnly, moderationController.userHistory);

export default router;
