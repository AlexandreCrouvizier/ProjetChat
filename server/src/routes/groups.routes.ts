/**
 * routes/groups.routes.ts — FIXED: ajout route thread
 */
import { Router } from 'express';
import { groupsController } from '../controllers/groups.controller';
import { messagesController } from '../controllers/messages.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();

router.get('/', optionalAuth, groupsController.list);
router.post('/', requireAuth, requireTier('registered', 'premium'), groupsController.create);
router.get('/:id', optionalAuth, groupsController.get);
router.get('/:id/members', requireAuth, groupsController.members);
router.get('/:groupId/messages', optionalAuth, messagesController.getGroupMessages);
router.get('/:groupId/messages/:messageId/thread', optionalAuth, messagesController.getThread);  // ⭐

export default router;
