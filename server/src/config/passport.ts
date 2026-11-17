/**
 * config/passport.ts — Configuration Passport.js (Google OAuth)
 * 
 * Passport gère tout le flow OAuth :
 *   1. Redirige l'utilisateur vers Google
 *   2. Google renvoie un code d'autorisation
 *   3. Passport échange le code contre les infos utilisateur
 *   4. Notre callback crée ou retrouve le compte
 * 
 * SETUP REQUIS — Pour que ça marche, il faut :
 *   1. Aller sur https://console.cloud.google.com
 *   2. Créer un projet (ou en sélectionner un)
 *   3. Activer "Google+ API" ou "People API"
 *   4. Créer des identifiants OAuth 2.0 (type "Application Web")
 *   5. Ajouter http://localhost:4000/api/auth/oauth/google/callback dans les "URI de redirection autorisés"
 *   6. Copier le Client ID et Client Secret dans le fichier .env
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env';

// Ne configure Google OAuth que si les clés sont présentes
if (env.isDev && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
  console.log('⚠️  OAuth Google non configuré (GOOGLE_CLIENT_ID manquant dans .env)');
  console.log('   → La connexion Google sera désactivée');
  console.log('   → Pour l\'activer : https://console.cloud.google.com/apis/credentials');
} else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/oauth/google/callback',
      scope: ['profile', 'email'],
    },
    // Ce callback est appelé après que Google a authentifié l'utilisateur
    // profile contient : id, displayName, emails, photos
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        // On passe le profil Google au controller qui gèrera la création/connexion
        // 🔐 email_verified : Google indique si l'adresse a été vérifiée. Sans cette preuve,
        // on ne lie JAMAIS le compte Google à un compte ChatApp existant (prise de contrôle).
        const emailEntry = profile.emails?.[0] as { value: string; verified?: boolean | string } | undefined;
        const rawJson = (profile as unknown as { _json?: { email_verified?: boolean | string } })._json;
        const emailVerified = emailEntry?.verified === true || emailEntry?.verified === 'true'
          || rawJson?.email_verified === true || rawJson?.email_verified === 'true';
        const oauthProfile = {
          provider: 'google',
          providerId: profile.id,
          email: emailEntry?.value || null,
          emailVerified,
          displayName: profile.displayName || 'User',
          avatar: profile.photos?.[0]?.value || null,
        };
        // req.user contient ici le profil Google (pas un JWT) : lu par oauth.controller
        done(null, oauthProfile as unknown as Express.User);
      } catch (error) {
        done(error as Error);
      }
    }
  ));
}

export default passport;
