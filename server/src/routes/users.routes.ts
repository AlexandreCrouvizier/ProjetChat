/**
 * routes/users.routes.ts — Phase 3 Étape 5 : ajout blocage utilisateur
 * 
 * Préserve toutes les routes existantes (search, profil, avatar, status)
 * Ajoute : block, unblock, blocked list, block status
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { usersController } from '../controllers/users.controller';
import { profileController } from '../controllers/profile.controller';
import { blockedController } from '../controllers/blocked.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireTier } from '../middleware/tierGuard.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { AVATAR_MAX_INPUT_BYTES } from '../services/upload.service';

const router = Router();

// Avatar reçu en mémoire (5 Mo max, 1 seul fichier), jamais écrit tel quel sur le disque
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_INPUT_BYTES, files: 1 } });

// Recherche pour autocomplete @mention
router.get('/search', requireAuth, usersController.search);

// Disposition sur téléphone (tous les types de compte : un invité peut aussi choisir si l'admin le permet)
router.get('/me/layout', requireAuth, profileController.getLayout);
router.patch('/me/layout', requireAuth, rateLimit({ name: 'layout', max: 30, windowSeconds: 60, by: 'user' }), profileController.updateLayout);

// Mon profil
router.patch('/me', requireAuth, requireTier('registered', 'premium'), profileController.updateProfile);
// 🔐 Avatar = fichier image (5 Mo max), traité par Sharp. L'ancien PATCH (base64 / URL externe) est supprimé.
router.post(
  '/me/avatar',
  requireAuth,
  requireTier('registered', 'premium'),
  rateLimit({ name: 'avatar', max: 10, windowSeconds: 600, by: 'user' }),
  (req: Request, res: Response, next: NextFunction) => {
    avatarUpload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Image trop volumineuse (5 Mo maximum)' });
        return;
      }
      if (err) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Envoi de l\'image impossible' });
        return;
      }
      next();
    });
  },
  profileController.uploadAvatar,
);
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
