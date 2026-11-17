/**
 * controllers/oauth.controller.ts — Gère le callback OAuth (Google, GitHub)
 * 
 * Flow :
 *   1. L'utilisateur clique "Continuer avec Google / GitHub" sur le frontend
 *   2. Le frontend redirige vers /api/auth/oauth/<fournisseur>
 *   3. Le serveur redirige vers la page de consentement du fournisseur (avec un « state » en cookie)
 *   4. Le fournisseur redirige vers /api/auth/oauth/<fournisseur>/callback avec le code
 *   5. Ce controller crée/retrouve le compte, pose les cookies de session (httpOnly)
 *      et redirige vers le frontend — 🔐 plus aucun jeton dans l'URL (historique, logs, en-tête Referer)
 */

import type { Request, Response } from 'express';
import { userRepository } from '../repositories/user.repository';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { sessionRepository } from '../repositories/session.repository';
import { logAudit } from '../middleware/audit.middleware';
import { getIpFromRequest } from '../utils/ip';
import crypto from 'crypto';
import { env } from '../config/env';
import { isBanActive } from '../services/accessRevocation.service';
import { setSessionCookies } from '../utils/authCookies';
import { uploadService } from '../services/upload.service';
import type { OAuthProfile } from '../config/passport';

export const oauthController = {

  /**
   * Callback après authentification Google ou GitHub
   * Passport a déjà vérifié le code du fournisseur et le « state », et normalisé le profil (req.user)
   */
  async callback(req: Request, res: Response): Promise<void> {
    try {
      const profile = req.user as unknown as OAuthProfile | undefined;
      if (!profile || (profile.provider !== 'google' && profile.provider !== 'github')) {
        res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_failed`);
        return;
      }

      const ip = getIpFromRequest(req);
      const userAgent = req.headers['user-agent'];

      // 1. Chercher si un compte existe déjà avec cet identifiant chez ce fournisseur
      let user = await userRepository.findByOAuth(profile.provider, profile.providerId);
      let isNewUser = false;

      if (!user) {
        // 2. Chercher par email (peut-être inscrit par email avant)
        if (profile.email) {
          user = await userRepository.findByEmail(profile.email);
        }

        // 🔐 Lier un compte Google/GitHub à un compte existant UNIQUEMENT si le fournisseur a vérifié l'email.
        // Sinon, n'importe qui pourrait créer un compte chez le fournisseur avec l'adresse d'une victime
        // (non vérifiée) et prendre le contrôle de son compte ChatApp.
        if (user && !profile.emailVerified) {
          res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_email_unverified`);
          return;
        }

        if (user) {
          // Compte existant (inscrit par email) → lier ce fournisseur s'il n'en a pas encore.
          // (Un seul fournisseur mémorisé par compte : s'il est déjà lié à l'autre, la connexion
          // passe par l'adresse e-mail vérifiée, sans écraser le lien existant.)
          if (!user.oauth_provider) {
            await userRepository.update(user.id, {
              oauth_provider: profile.provider,
              oauth_id: profile.providerId,
            } as any);
          }
        } else {
          // 3. Nouveau compte → créer
          // Générer un username unique basé sur le displayName
          let username = profile.displayName
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .substring(0, 25);

          // Pseudo trop court (nom sans lettres latines, par exemple) → pseudo générique
          if (username.length < 3) username = `membre_${crypto.randomInt(1000, 10000)}`;
          // Vérifier l'unicité
          const base = username.substring(0, 24);
          for (let i = 0; i < 5 && await userRepository.isUsernameTaken(username); i++) {
            username = `${base}_${crypto.randomInt(100, 100000)}`;
          }

          user = await userRepository.create({
            username,
            email: profile.email ?? undefined,
            oauth_provider: profile.provider,
            oauth_id: profile.providerId,
            tier: 'registered',
            last_ip: ip,
          });


          isNewUser = true;
        }
      }

      // Recharger le user complet
      user = await userRepository.findById(user!.id);
      if (!user) {
        res.redirect(`${env.APP_URL}/auth_group/login?error=user_not_found`);
        return;
      }

      // 🔐 Un compte banni ne peut pas se reconnecter via Google/GitHub
      if (isBanActive(user)) {
        res.redirect(`${env.APP_URL}/auth_group/login?error=account_suspended`);
        return;
      }

      // 🔐 Pas encore d'avatar : la photo du fournisseur est copiée chez nous (jamais d'URL externe en
      // avatar, les visiteurs ne chargent rien chez Google/GitHub). Non bloquant en cas d'échec.
      if (!user.avatar_url && profile.avatar) {
        await uploadService.importRemoteAvatar(profile.avatar, { id: user.id, username: user.username }, ip);
      }

      // 4. Générer les tokens JWT
      const payload = { userId: user.id, username: user.username, tier: user.tier };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // 5. Sauvegarder la session
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await sessionRepository.create({
        user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        ip_address: ip,
        user_agent: userAgent,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // 6. Mettre à jour last_seen
      await userRepository.update(user.id, {
        last_seen_at: new Date().toISOString(),
        last_ip: ip,
      } as any);

      // 7. Log LCEN
      await logAudit('login', ip, user.id, { method: `oauth_${profile.provider}`, is_new: isNewUser }, userAgent);

      // 8. Session en cookies httpOnly, puis retour au frontend (sans aucun jeton dans l'URL)
      setSessionCookies(res, { access_token: accessToken, refresh_token: refreshToken });
      res.redirect(`${env.APP_URL}/auth_group/login?oauth_success=1`);

    } catch (error: any) {
      console.error('❌ OAuth callback error:', error);
      res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_error`);
    }
  },
};
