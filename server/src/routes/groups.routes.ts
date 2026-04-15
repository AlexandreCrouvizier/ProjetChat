/**
 * routes/groups.routes.ts — Phase 3 Étape 3 : ajout routes membres (rôles, kick, mute)
 */
import { Router } from 'express';
import { groupsController } from '../controllers/groups.controller';
import { messagesController } from '../controllers/messages.controller';
import { membersController } from '../controllers/members.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();

// ─── Invitations (préfixe /invites/ pour éviter le conflit avec /:id) ───────
// GET  /invites/:code/info  → infos publiques (sans auth)
// POST /invites/:code       → rejoindre
router.get('/invites/:code/info', optionalAuth, groupsController.getInviteInfo);
router.post('/invites/:code', requireAuth, groupsController.joinByInvite);

// Salons CRUD
router.get('/', optionalAuth, groupsController.list);
router.post('/', requireAuth, requireTier('registered', 'premium'), groupsController.create);
router.get('/:id', optionalAuth, groupsController.get);
router.patch('/:id', requireAuth, requireTier('registered', 'premium'), groupsController.update);
router.delete('/:id', requireAuth, requireTier('registered', 'premium'), groupsController.remove);

// Membres — liste + join/leave
router.get('/:id/members', requireAuth, groupsController.members);
router.post('/:id/join', requireAuth, groupsController.join);
router.post('/:id/leave', requireAuth, groupsController.leave);

// ⭐ Membres — rôles, kick, mute (Phase 3)
router.patch('/:id/members/:userId', requireAuth, requireTier('registered', 'premium'), membersController.updateRole);
router.post('/:id/members/:userId/kick', requireAuth, requireTier('registered', 'premium'), membersController.kick);
router.post('/:id/members/:userId/mute', requireAuth, requireTier('registered', 'premium'), membersController.muteInGroup);

// Invitations
router.post('/:id/invite', requireAuth, requireTier('registered', 'premium'), groupsController.createInvite);
router.get('/:id/invitations', requireAuth, requireTier('registered', 'premium'), groupsController.listInvitations);
router.delete('/:id/invitations/:invId', requireAuth, requireTier('registered', 'premium'), groupsController.deactivateInvitation);

// Messages
router.get('/:groupId/messages', optionalAuth, messagesController.getGroupMessages);
router.get('/:groupId/messages/:messageId/thread', optionalAuth, messagesController.getThread);

export default router;
