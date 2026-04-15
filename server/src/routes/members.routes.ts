/**
 * routes/members.routes.ts — Phase 3 : gestion des rôles dans les groupes
 * 
 * ⚠️ Ces routes sont MONTÉES dans groups.routes.ts, pas dans app.ts directement.
 * Voir le patch groups.routes.ts ci-joint.
 */
import { Router } from 'express';
import { membersController } from '../controllers/members.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router({ mergeParams: true }); // mergeParams pour accéder à :id du parent

// Changer le rôle d'un membre (promote/demote)
router.patch('/:userId', requireAuth, requireTier('registered', 'premium'), membersController.updateRole);

// Expulser un membre
router.post('/:userId/kick', requireAuth, requireTier('registered', 'premium'), membersController.kick);

// Mute/unmute un membre dans le salon
router.post('/:userId/mute', requireAuth, requireTier('registered', 'premium'), membersController.muteInGroup);

export default router;
