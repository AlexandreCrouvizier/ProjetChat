/**
 * config/passport.ts — Configuration Passport.js (connexion Google et GitHub)
 *
 * Passport gère le flow OAuth :
 *   1. Redirige l'utilisateur vers le fournisseur (Google ou GitHub)
 *   2. Le fournisseur renvoie un code d'autorisation (+ notre « state » anti-CSRF, voir oauthState.ts)
 *   3. Passport échange le code contre les infos utilisateur
 *   4. oauth.controller crée ou retrouve le compte
 *
 * SETUP GOOGLE : https://console.cloud.google.com → Identifiants OAuth 2.0 (Application Web)
 *   URI de redirection : http://localhost:4000/api/auth/oauth/google/callback
 *   → GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET dans le .env
 *
 * SETUP GITHUB : https://github.com/settings/developers → « New OAuth App »
 *   Homepage URL : http://localhost:1608
 *   Authorization callback URL : http://localhost:4000/api/auth/oauth/github/callback
 *   → GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET dans le .env
 *
 * Un fournisseur sans clés est simplement désactivé (bouton masqué côté client).
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { env } from './env';
import { CookieStateStore } from './oauthState';

/** Profil normalisé transmis à oauth.controller (via req.user) */
export interface OAuthProfile {
  provider: 'google' | 'github';
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  avatar: string | null;
}

export const oauthProviders = { google: false, github: false };

// ── Google ──────────────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/oauth/google/callback',
      scope: ['profile', 'email'],
      store: new CookieStateStore() as any,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        // 🔐 email_verified : Google indique si l'adresse a été vérifiée. Sans cette preuve,
        // on ne lie JAMAIS le compte Google à un compte ChatApp existant (prise de contrôle).
        const emailEntry = profile.emails?.[0] as { value: string; verified?: boolean | string } | undefined;
        const rawJson = (profile as unknown as { _json?: { email_verified?: boolean | string } })._json;
        const emailVerified = emailEntry?.verified === true || emailEntry?.verified === 'true'
          || rawJson?.email_verified === true || rawJson?.email_verified === 'true';
        const oauthProfile: OAuthProfile = {
          provider: 'google',
          providerId: profile.id,
          email: emailEntry?.value || null,
          emailVerified,
          displayName: profile.displayName || 'User',
          avatar: profile.photos?.[0]?.value || null,
        };
        done(null, oauthProfile as unknown as Express.User);
      } catch (error) {
        done(error as Error);
      }
    }
  ));
  oauthProviders.google = true;
} else if (env.isDev) {
  console.log('⚠️  OAuth Google non configuré (GOOGLE_CLIENT_ID manquant dans .env) → bouton masqué');
}

// ── GitHub ──────────────────────────────────────────────────────────────────
/**
 * Adresse e-mail PRINCIPALE et VÉRIFIÉE du compte GitHub (API /user/emails, scope user:email).
 * L'adresse publique du profil peut être n'importe quelle adresse non vérifiée : on ne s'y fie pas.
 */
async function githubVerifiedEmail(accessToken: string): Promise<{ email: string | null; verified: boolean }> {
  try {
    const res = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ChatApp',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { email: null, verified: false };
    const list = (await res.json()) as Array<{ email?: unknown; primary?: unknown; verified?: unknown }>;
    if (!Array.isArray(list)) return { email: null, verified: false };
    const primary = list.find((e) => e && e.primary === true && e.verified === true && typeof e.email === 'string');
    if (primary) return { email: String(primary.email).toLowerCase(), verified: true };
    const anyVerified = list.find((e) => e && e.verified === true && typeof e.email === 'string');
    if (anyVerified) return { email: String(anyVerified.email).toLowerCase(), verified: true };
    return { email: null, verified: false };
  } catch {
    return { email: null, verified: false };
  }
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/api/auth/oauth/github/callback',
      scope: ['read:user', 'user:email'],
      store: new CookieStateStore() as any,
    } as any,
    async (accessToken: string, _refreshToken: string, profile: any, done: (err: Error | null, user?: Express.User) => void) => {
      try {
        const { email, verified } = await githubVerifiedEmail(accessToken);
        const oauthProfile: OAuthProfile = {
          provider: 'github',
          providerId: String(profile.id),
          email,
          emailVerified: verified,
          // Pseudo GitHub (login) plutôt que le nom affiché (souvent un nom complet avec espaces)
          displayName: profile.username || profile.displayName || 'User',
          avatar: profile.photos?.[0]?.value || null,
        };
        done(null, oauthProfile as unknown as Express.User);
      } catch (error) {
        done(error as Error);
      }
    }
  ));
  oauthProviders.github = true;
} else if (env.isDev) {
  console.log('ℹ️  OAuth GitHub non configuré (GITHUB_CLIENT_ID manquant dans .env) → bouton masqué');
}

export default passport;
