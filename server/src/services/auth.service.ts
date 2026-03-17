/**
 * services/auth.service.ts — Logique métier de l'authentification
 * 
 * C'est ici que se passe la vraie logique :
 *   - Hacher les mots de passe (bcrypt)
 *   - Générer les tokens JWT
 *   - Vérifier les credentials
 *   - Créer les comptes (email, OAuth, invité)
 * 
 * Le service NE connaît PAS Express (pas de req/res).
 * Il reçoit des données, retourne des résultats ou throw des erreurs.
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository';
import { sessionRepository } from '../repositories/session.repository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { logAudit } from '../middleware/audit.middleware';
import { BadRequestError, UnauthorizedError, ValidationError } from '../utils/errors';
import { VALIDATION } from '../../../shared/constants';

// Nombre de rounds bcrypt (12 = bon compromis sécurité/performance)
const BCRYPT_ROUNDS = 12;

export const authService = {

  /**
   * Inscription par email + mot de passe
   * Crée le compte, génère les tokens, log l'action
   */
  async register(data: {
    username: string;
    email: string;
    password: string;
    ip: string;
    userAgent?: string;
  }) {
    // 1. Validations
    if (!VALIDATION.username.pattern.test(data.username)) {
      throw new ValidationError('Le pseudo ne peut contenir que des lettres, chiffres, - et _', 'username');
    }
    if (data.username.length < VALIDATION.username.minLength || data.username.length > VALIDATION.username.maxLength) {
      throw new ValidationError(`Le pseudo doit faire entre ${VALIDATION.username.minLength} et ${VALIDATION.username.maxLength} caractères`, 'username');
    }
    if (data.password.length < VALIDATION.password.minLength) {
      throw new ValidationError(`Le mot de passe doit faire au moins ${VALIDATION.password.minLength} caractères`, 'password');
    }
    if (!VALIDATION.password.pattern.test(data.password)) {
      throw new ValidationError('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre', 'password');
    }

    // 2. Vérifier l'unicité
    if (await userRepository.isUsernameTaken(data.username)) {
      throw new ValidationError('Ce pseudo est déjà pris', 'username');
    }
    if (await userRepository.isEmailTaken(data.email)) {
      throw new ValidationError('Cet email est déjà utilisé', 'email');
    }

    // 3. Hasher le mot de passe (bcrypt = salage automatique)
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // 4. Créer l'utilisateur
    const user = await userRepository.create({
      username: data.username,
      email: data.email,
      password_hash: passwordHash,
      tier: 'registered',
      last_ip: data.ip,
    });

    // 5. Générer les tokens
    const tokens = await this.createTokens(user, data.ip, data.userAgent);

    // 6. Log LCEN
    await logAudit('register', data.ip, user.id, { method: 'email' }, data.userAgent);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  },

  /**
   * Connexion par email + mot de passe
   */
  async login(data: {
    email: string;
    password: string;
    ip: string;
    userAgent?: string;
  }) {
    // 1. Trouver l'utilisateur par email
    const user = await userRepository.findByEmail(data.email);
    if (!user || !user.password_hash) {
      // Message volontairement vague (sécurité : ne pas révéler si l'email existe)
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }

    // 2. Vérifier si banni
    if (user.is_banned) {
      const msg = user.ban_expires_at
        ? `Compte suspendu jusqu'au ${new Date(user.ban_expires_at).toLocaleDateString('fr-FR')}`
        : 'Compte suspendu définitivement';
      throw new UnauthorizedError(msg);
    }

    // 3. Vérifier le mot de passe
    const isValid = await bcrypt.compare(data.password, user.password_hash);
    if (!isValid) {
      // Log la tentative échouée (LCEN + détection brute force)
      await logAudit('login_failed', data.ip, user.id, { reason: 'invalid_password' }, data.userAgent);
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }

    // 4. Mettre à jour last_seen et last_ip
    await userRepository.update(user.id, {
      last_seen_at: new Date().toISOString(),
      last_ip: data.ip,
    } as any);

    // 5. Générer les tokens
    const tokens = await this.createTokens(user, data.ip, data.userAgent);

    // 6. Log LCEN
    await logAudit('login', data.ip, user.id, { method: 'email' }, data.userAgent);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  },

  /**
   * Connexion anonyme (invité)
   * Crée un compte temporaire avec un pseudo aléatoire ou choisi
   */
  async loginAsGuest(data: {
    username?: string;
    ip: string;
    userAgent?: string;
  }) {
    let username = data.username;

    // 1. Si pas de pseudo fourni, en générer un aléatoire
    if (!username) {
      const randomNum = Math.floor(Math.random() * 9000) + 1000;
      username = `Invité_${randomNum}`;
    }

    // 2. Vérifier que le pseudo n'est pas pris par un inscrit
    if (await userRepository.isUsernameTaken(username)) {
      throw new ValidationError('Ce pseudo est réservé par un utilisateur inscrit', 'username');
    }

    // 3. Vérifier si un invité avec ce pseudo existe déjà
    const existing = await userRepository.findByUsername(username);
    if (existing && existing.tier === 'guest') {
      // Un invité avec ce pseudo existe → en générer un nouveau
      const randomNum = Math.floor(Math.random() * 9000) + 1000;
      username = `Invité_${randomNum}`;
    }

    // 4. Créer le compte invité
    const user = await userRepository.create({
      username,
      tier: 'guest',
      last_ip: data.ip,
    });

    // 5. Générer uniquement un access token (pas de refresh pour les invités)
    const payload = { userId: user.id, username: user.username, tier: user.tier };
    const accessToken = generateAccessToken(payload);

    // 6. Log LCEN
    await logAudit('login', data.ip, user.id, { method: 'guest' }, data.userAgent);

    return {
      user: this.sanitizeUser(user),
      access_token: accessToken,
    };
  },

  /**
   * Renouveler les tokens via le refresh token
   */
  async refreshTokens(data: {
    refreshToken: string;
    ip: string;
    userAgent?: string;
  }) {
    // 1. Vérifier le refresh token (signature JWT)
    let payload;
    try {
      payload = verifyRefreshToken(data.refreshToken);
    } catch {
      throw new UnauthorizedError('Refresh token invalide ou expiré');
    }

    // 2. Vérifier que le hash existe en BDD (pas révoqué)
    const tokenHash = crypto.createHash('sha256').update(data.refreshToken).digest('hex');
    const session = await sessionRepository.findByTokenHash(tokenHash);
    if (!session) {
      throw new UnauthorizedError('Session expirée, veuillez vous reconnecter');
    }

    // 3. Récupérer l'utilisateur
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedError('Utilisateur introuvable');
    }

    // 4. Supprimer l'ancienne session (rotation du refresh token)
    await sessionRepository.deleteByTokenHash(tokenHash);

    // 5. Créer de nouveaux tokens
    const tokens = await this.createTokens(user, data.ip, data.userAgent);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  },

  /**
   * Déconnexion — Supprime la session (refresh token)
   */
  async logout(data: {
    refreshToken?: string;
    userId: string;
    ip: string;
    userAgent?: string;
  }) {
    if (data.refreshToken) {
      // Supprimer la session spécifique
      const tokenHash = crypto.createHash('sha256').update(data.refreshToken).digest('hex');
      await sessionRepository.deleteByTokenHash(tokenHash);
    } else {
      // Si pas de refresh token fourni, supprimer TOUTES les sessions
      await sessionRepository.deleteAllForUser(data.userId);
    }

    await logAudit('logout', data.ip, data.userId, undefined, data.userAgent);
  },

  // ===== HELPERS PRIVÉS =====

  /**
   * Crée un access token + refresh token, et sauvegarde la session
   */
  async createTokens(user: any, ip: string, userAgent?: string) {
    const payload = {
      userId: user.id,
      username: user.username,
      tier: user.tier,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Hash du refresh token pour le stocker en BDD
    // (on ne stocke JAMAIS le token en clair en BDD)
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Calculer la date d'expiration (7 jours)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await sessionRepository.create({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      ip_address: ip,
      user_agent: userAgent,
      expires_at: expiresAt,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  },

  /**
   * Nettoie les données utilisateur avant de les renvoyer au client
   * JAMAIS de password_hash, last_ip, ou données sensibles
   */
  sanitizeUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email || null,
      tier: user.tier,
      avatar_url: user.avatar_url || null,
      bio: user.bio || null,
      donor_badge: user.donor_badge,
      theme: user.theme,
    };
  },
};
