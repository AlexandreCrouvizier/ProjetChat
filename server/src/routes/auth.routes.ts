/**
 * routes/auth.routes.ts — Routes d'authentification (avec OAuth Google et GitHub)
 */

import { Router, type RequestHandler } from 'express';
import { authController } from '../controllers/auth.controller';
import { oauthController } from '../controllers/oauth.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { audit } from '../middleware/audit.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import passport, { oauthProviders } from '../config/passport';
import { env } from '../config/env';

const router = Router();

// ===== Routes classiques =====
// 🔐 Limitation de débit par IP (anti brute-force / anti création massive de comptes)
router.post('/register', rateLimit({ name: 'register', max: 10, windowSeconds: 3600 }), audit('register'), authController.register);
router.post('/login',    rateLimit({ name: 'login',    max: 20, windowSeconds: 900 }),  audit('login'),    authController.login);
router.post('/guest',    rateLimit({ name: 'guest',    max: 30, windowSeconds: 900 }) , audit('guest'),    authController.guest);
router.post('/refresh',  rateLimit({ name: 'refresh',  max: 60, windowSeconds: 900 }),                     authController.refresh);
router.post('/logout',   optionalAuth,      authController.logout);  // fonctionne même si le jeton d'accès a expiré
router.get('/me',        requireAuth,       authController.me);

// ===== OAuth (Google, GitHub) =====
// Fournisseurs configurés (clés présentes dans le .env) : le client n'affiche que ceux-là
router.get('/oauth/providers', (_req, res) => { res.json(oauthProviders); });

const failure = `${env.APP_URL}/auth_group/login?error=oauth_failed`;
for (const provider of ['google', 'github'] as const) {
  const scope = provider === 'google' ? ['profile', 'email'] : ['read:user', 'user:email'];
  // Fournisseur sans clés : retour propre à la page de connexion (au lieu d'une erreur 500)
  const configured: RequestHandler = (_req, res, next) => {
    if (oauthProviders[provider]) return next();
    res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_unavailable`);
  };
  // Étape 1 : redirection vers le fournisseur (+ « state » anti-CSRF en cookie)
  router.get(`/oauth/${provider}`,
    rateLimit({ name: `oauth_${provider}`, max: 30, windowSeconds: 900 }),
    configured,
    passport.authenticate(provider, { scope, session: false }),
  );
  // Étape 2 : retour du fournisseur (state vérifié par passport → CookieStateStore)
  router.get(`/oauth/${provider}/callback`,
    configured,
    passport.authenticate(provider, { session: false, failureRedirect: failure }),
    oauthController.callback,
  );
}

export default router;
