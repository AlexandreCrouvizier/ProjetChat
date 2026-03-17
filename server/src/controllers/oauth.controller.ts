/**
 * controllers/oauth.controller.ts — Gère le callback OAuth Google
 * 
 * Flow :
 *   1. L'utilisateur clique "Connexion Google" sur le frontend
 *   2. Le frontend redirige vers /api/auth/oauth/google
 *   3. Le serveur redirige vers la page de consentement Google
 *   4. Google redirige vers /api/auth/oauth/google/callback avec le profil
 *   5. Ce controller crée/retrouve le compte et redirige vers le frontend avec le token
 */

import type { Request, Response } from 'express';
import { userRepository } from '../repositories/user.repository';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { sessionRepository } from '../repositories/session.repository';
import { logAudit } from '../middleware/audit.middleware';
import { getIpFromRequest } from '../utils/ip';
import crypto from 'crypto';
import { env } from '../config/env';

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

        if (user) {
          // Compte existant (inscrit par email) → lier le Google ID
          await userRepository.update(user.id, {
            oauth_provider: 'google',
            oauth_id: profile.providerId,
            avatar_url: user.avatar_url || profile.avatar,
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

          // Mettre à jour l'avatar si disponible
          if (profile.avatar) {
            await userRepository.update(user.id, { avatar_url: profile.avatar } as any);
          }

          isNewUser = true;
        }
      }

      // Recharger le user complet
      user = await userRepository.findById(user!.id);
      if (!user) {
        res.redirect(`${env.APP_URL}/auth_group/login?error=user_not_found`);
        return;
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

      // 8. Rediriger vers le frontend avec les tokens en query params
      // Le frontend les récupérera et les stockera dans localStorage
      const redirectUrl = `${env.APP_URL}/auth_group/login?` + new URLSearchParams({
        access_token: accessToken,
        refresh_token: refreshToken,
        oauth_success: 'true',
      }).toString();

      res.redirect(redirectUrl);

    } catch (error: any) {
      console.error('❌ OAuth callback error:', error);
      res.redirect(`${env.APP_URL}/auth_group/login?error=oauth_error`);
    }
  },
};
