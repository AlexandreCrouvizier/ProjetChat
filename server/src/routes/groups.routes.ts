/**
 * routes/groups.routes.ts — Routes des salons
 */

import { Router } from 'express';
import { groupsController } from '../controllers/groups.controller';
import { messagesController } from '../controllers/messages.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';

const router = Router();

// Liste des salons publics (accessible à tous, même sans auth)
router.get('/', optionalAuth, groupsController.list);

// Créer un salon (inscrit ou premium uniquement)
router.post('/', requireAuth, requireTier('registered', 'premium'), groupsController.create);

// Détails d'un salon
router.get('/:id', optionalAuth, groupsController.get);

// Membres d'un salon
router.get('/:id/members', requireAuth, groupsController.members);

// Messages d'un salon (accessible à tous pour les groupes publics)
router.get('/:groupId/messages', optionalAuth, messagesController.getGroupMessages);

export default router;
