/**
 * routes/users.routes.ts — FIXED: ajout DELETE avatar
 */
import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { profileController } from '../controllers/profile.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();

router.get('/search', requireAuth, usersController.search);
router.patch('/me', requireAuth, requireTier('registered', 'premium'), profileController.updateProfile);
router.patch('/me/avatar', requireAuth, requireTier('registered', 'premium'), profileController.updateAvatar);
router.delete('/me/avatar', requireAuth, requireTier('registered', 'premium'), profileController.deleteAvatar);
router.patch('/me/status', requireAuth, requireTier('registered', 'premium'), profileController.updateStatus);
router.get('/:id', optionalAuth, usersController.getProfile);

export default router;
