/**
 * routes/conversations.routes.ts — hide au lieu de leave
 */
import { Router } from 'express';
import { conversationsController } from '../controllers/conversations.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();
router.get('/', requireAuth, conversationsController.list);
router.post('/', requireAuth, requireTier('registered', 'premium'), conversationsController.create);
router.get('/:id/messages', requireAuth, conversationsController.messages);
router.post('/:id/read', requireAuth, conversationsController.markRead);
router.delete('/:id', requireAuth, conversationsController.hide);  // ⭐ Masquer (pas supprimer)

export default router;
