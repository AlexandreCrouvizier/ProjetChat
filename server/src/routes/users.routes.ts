/**
 * routes/users.routes.ts — Phase 3 Étape 5 : ajout blocage utilisateur
 * 
 * Préserve toutes les routes existantes (search, profil, avatar, status)
 * Ajoute : block, unblock, blocked list, block status
 */
import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { profileController } from '../controllers/profile.controller';
import { blockedController } from '../controllers/blocked.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();

// Recherche pour autocomplete @mention
router.get('/search', requireAuth, usersController.search);

// Mon profil
router.patch('/me', requireAuth, requireTier('registered', 'premium'), profileController.updateProfile);
router.patch('/me/avatar', requireAuth, requireTier('registered', 'premium'), profileController.updateAvatar);
router.delete('/me/avatar', requireAuth, requireTier('registered', 'premium'), profileController.deleteAvatar);
router.patch('/me/status', requireAuth, requireTier('registered', 'premium'), profileController.updateStatus);

// ⭐ Liste des utilisateurs bloqués (AVANT /:id pour ne pas être capturé)
router.get('/me/blocked', requireAuth, blockedController.list);

// Profil public d'un utilisateur
router.get('/:id', optionalAuth, usersController.getProfile);

// ⭐ Blocage utilisateur
router.get('/:id/block-status', requireAuth, blockedController.checkStatus);
router.post('/:id/block', requireAuth, requireTier('registered', 'premium'), blockedController.block);
router.delete('/:id/block', requireAuth, requireTier('registered', 'premium'), blockedController.unblock);

export default router;
