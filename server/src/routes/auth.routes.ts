/**
 * routes/auth.routes.ts — Routes d'authentification (avec OAuth Google)
 */

import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { oauthController } from '../controllers/oauth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { audit } from '../middleware/audit.middleware';
import passport from '../config/passport';

const router = Router();

// ===== Routes classiques =====
router.post('/register', audit('register'), authController.register);
router.post('/login',    audit('login'),    authController.login);
router.post('/guest',    audit('guest'),    authController.guest);
router.post('/refresh',                     authController.refresh);
router.post('/logout',   requireAuth,       authController.logout);
router.get('/me',        requireAuth,       authController.me);

// ===== OAuth Google =====
// Étape 1 : Redirige vers Google (l'utilisateur voit la page de consentement Google)
router.get('/oauth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Étape 2 : Google redirige ici après consentement
router.get('/oauth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth_group/login?error=oauth_failed' }),
  oauthController.googleCallback
);

export default router;
