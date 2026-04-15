/**
 * routes/moderation.routes.ts — Phase 3 : signalement + modération
 */
import { Router } from 'express';
import { moderationController } from '../controllers/moderation.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();

// Signalement — tous les utilisateurs authentifiés peuvent signaler (y compris invités)
router.post('/reports', requireAuth, moderationController.createReport);

// Dashboard modération — réservé aux admins/modérateurs
// Note: pour l'instant on vérifie côté controller que l'utilisateur a le bon rôle
// En production, ajouter un middleware requireAdmin
router.get('/reports', requireAuth, requireTier('registered', 'premium'), moderationController.listReports);
router.patch('/reports/:id', requireAuth, requireTier('registered', 'premium'), moderationController.reviewReport);

// Actions globales sur un utilisateur
router.post('/users/:id/mute', requireAuth, requireTier('registered', 'premium'), moderationController.muteUser);
router.post('/users/:id/unmute', requireAuth, requireTier('registered', 'premium'), moderationController.unmuteUser);
router.post('/users/:id/ban', requireAuth, requireTier('registered', 'premium'), moderationController.banUser);
router.post('/users/:id/unban', requireAuth, requireTier('registered', 'premium'), moderationController.unbanUser);

// Historique modération d'un utilisateur
router.get('/users/:id/history', requireAuth, requireTier('registered', 'premium'), moderationController.userHistory);

export default router;
