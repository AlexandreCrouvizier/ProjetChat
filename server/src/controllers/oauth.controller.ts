/**
 * controllers/oauth.controller.ts — Gère le callback OAuth Google
 * 
 * Flow :
 *   1. L'utilisateur clique "Connexion Google" sur le frontend
 *   2. Le frontend redirige vers /api/auth/oauth/google
 *   3. Le serveur redirige vers la page de consentement Google
 *   4. Google redirige vers /api/auth/oauth/google/callback avec le profil
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

export const oauthController = {

  /**
   * Callback après authentification Google
   * Passport a déjà vérifié le token Google et extrait le profil (dans req.user)
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const profile = req.user as any;
      if (!profile) {
        res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_failed`);
        return;
      }

      const ip = getIpFromRequest(req);
      const userAgent = req.headers['user-agent'];

      // 1. Chercher si un compte existe déjà avec ce Google ID
      let user = await userRepository.findByOAuth('google', profile.providerId);
      let isNewUser = false;

      if (!user) {
        // 2. Chercher par email (peut-être inscrit par email avant)
        if (profile.email) {
          user = await userRepository.findByEmail(profile.email);
        }

        // 🔐 Lier un compte Google à un compte existant UNIQUEMENT si Google a vérifié l'email.
        // Sinon, n'importe qui pourrait créer un compte Google avec l'adresse d'une victime
        // (non vérifiée) et prendre le contrôle de son compte ChatApp.
        if (user && !profile.emailVerified) {
          res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_email_unverified`);
          return;
        }

        if (user) {
          // Compte existant (inscrit par email) → lier le Google ID
          await userRepository.update(user.id, {
            oauth_provider: 'google',
            oauth_id: profile.providerId,
          } as any);
        } else {
          // 3. Nouveau compte → créer
          // Générer un username unique basé sur le displayName
          let username = profile.displayName
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .substring(0, 25);

          // Vérifier l'unicité
          if (await userRepository.isUsernameTaken(username)) {
            username = username + '_' + Math.floor(Math.random() * 1000);
          }

          user = await userRepository.create({
            username,
            email: profile.email,
            oauth_provider: 'google',
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

      // 🔐 Un compte banni ne peut pas se reconnecter via Google
      if (isBanActive(user)) {
        res.redirect(`${env.APP_URL}/auth_group/login?error=account_suspended`);
        return;
      }

      // 🔐 Pas encore d'avatar : la photo Google est copiée chez nous (jamais d'URL externe en avatar,
      // les visiteurs ne chargent rien depuis Google). Non bloquant en cas d'échec.
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
      await logAudit('login', ip, user.id, { method: 'oauth_google', is_new: isNewUser }, userAgent);

      // 8. Session en cookies httpOnly, puis retour au frontend (sans aucun jeton dans l'URL)
      setSessionCookies(res, { access_token: accessToken, refresh_token: refreshToken });
      res.redirect(`${env.APP_URL}/auth_group/login?oauth_success=1`);

    } catch (error: any) {
      console.error('❌ OAuth callback error:', error);
      res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_error`);
    }
  },
};
