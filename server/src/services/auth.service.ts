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
import { redis } from '../config/redis';
import { guestSecurityService } from './guestSecurity.service';
import { db } from '../config/database';
import { userRepository } from '../repositories/user.repository';
import { sessionRepository } from '../repositories/session.repository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { logAudit } from '../middleware/audit.middleware';
import { BadRequestError, UnauthorizedError, ValidationError, RateLimitError } from '../utils/errors';
import { VALIDATION } from '../../../shared/constants';
import { hitLimit, resetLimit } from '../middleware/rateLimit.middleware';
import { isBanActive } from './accessRevocation.service';

// Nombre de rounds bcrypt (12 = bon compromis sécurité/performance)
const BCRYPT_ROUNDS = 12;

// 🔐 Hash factice : quand l'email n'existe pas, on fait quand même un bcrypt.compare
// pour que le temps de réponse ne révèle pas si un compte existe.
const DUMMY_HASH = bcrypt.hashSync('chatapp-timing-equalizer', BCRYPT_ROUNDS);

/** Normalise et valide grossièrement un email (type + format + longueur) */
function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') throw new ValidationError('Email invalide', 'email');
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ValidationError('Email invalide', 'email');
  return e;
}

function assertString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new ValidationError(`Champ ${field} invalide`, field);
  }
  return value;
}

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
    // 1. Validations (🔐 types stricts : le body JSON peut contenir n'importe quoi)
    data.username = assertString(data.username, 'username', 50);
    data.password = assertString(data.password, 'password', 200);
    data.email = normalizeEmail(data.email);
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
    const email = normalizeEmail(data.email);
    const password = assertString(data.password, 'password', 200);

    // 🔐 Anti brute-force par compte (en plus de la limite par IP sur la route)
    const emailLimit = await hitLimit(`login-email:${email}`, 10, 900);
    if (!emailLimit.allowed) {
      throw new RateLimitError(`Trop de tentatives sur ce compte. Réessayez dans ${Math.ceil(emailLimit.retryAfter / 60)} min.`);
    }

    // 1. Trouver l'utilisateur par email (insensible à la casse)
    const user = await userRepository.findByEmail(email);

    // 2. Vérifier le mot de passe — TOUJOURS un bcrypt.compare (temps constant)
    const isValid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !isValid) {
      if (user) await logAudit('login_failed', data.ip, user.id, { reason: 'invalid_password' }, data.userAgent);
      // Message volontairement vague (ne pas révéler si l'email existe)
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }

    // 3. Vérifier le bannissement APRÈS le mot de passe (sinon on révèle qu'un compte existe et est banni)
    if (isBanActive(user)) {
      const msg = user.ban_expires_at
        ? `Compte suspendu jusqu'au ${new Date(user.ban_expires_at).toLocaleDateString('fr-FR')}`
        : 'Compte suspendu définitivement';
      throw new UnauthorizedError(msg);
    }
    await resetLimit(`login-email:${email}`);

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
    fingerprint?: string;
    ip: string;
    userAgent?: string;
  }) {
    // ── 0. Vérifications sécurité fingerprint + IP ─────────────────────────

    if (data.fingerprint) {
      // Fingerprint banni ?
      const fpCheck = await guestSecurityService.isFingerprintBanned(data.fingerprint);
      if (fpCheck.banned) {
        // Message explicite pour l'utilisateur : durée + motif (le motif est déjà montré au moment du ban)
        const until = fpCheck.expiresAt
          ? `jusqu'au ${fpCheck.expiresAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}`
          : 'définitivement';
        throw new ValidationError(`Accès suspendu ${until}. Motif : ${fpCheck.reason}`, 'fingerprint');
      }
    }

    // IP permabannit ?
    const ipCheck = await guestSecurityService.isIpPermabanned(data.ip);
    if (ipCheck.banned) {
      throw new ValidationError('Accès refusé depuis cette adresse réseau.', 'ip');
    }

    // Nouveau fingerprint depuis une IP à risque élevé ?
    if (data.fingerprint) {
      const dangerous = await guestSecurityService.isNewFingerprintFromDangerousIp(data.fingerprint, data.ip);
      if (dangerous) {
        throw new ValidationError('Accès refusé depuis cette adresse réseau.', 'ip');
      }
    }

    // ── 1. Reconnexion d'un invité existant via son fingerprint ──────────────
    // Si le fingerprint existe déjà en BDD → reconnexion (même invité qui revient)
    if (data.fingerprint) {
      const existingByFp = await db('users')
        .where({ guest_fingerprint: data.fingerprint, tier: 'guest' })
        .whereNull('ban_expires_at')
        .where(q => q.where('is_banned', false).orWhereNull('is_banned'))
        .select('*')
        .first();

      if (existingByFp) {
        // Mettre à jour la dernière IP
        await db('users').where({ id: existingByFp.id }).update({
          last_ip: data.ip,
          last_seen_at: db.fn.now(),
        });

        // Log sécurité
        await guestSecurityService.logConnection({
          fingerprint: data.fingerprint,
          userId:      existingByFp.id,
          ip:          data.ip,
          userAgent:   data.userAgent,
        });

        await logAudit('login', data.ip, existingByFp.id, { method: 'guest_reconnect', fingerprint: data.fingerprint }, data.userAgent);

        const payload = { userId: existingByFp.id, username: existingByFp.username, tier: 'guest' };
        return {
          user: this.sanitizeUser(existingByFp),
          access_token: generateAccessToken(payload),
        };
      }
    }

    // ── 2. Nouvel invité — générer un username unique ──────────────────────
    let username = data.username;

    // 🔐 Pseudo choisi par l'invité : mêmes règles que les inscrits
    if (username !== undefined && username !== null && username !== '') {
      if (typeof username !== 'string'
        || !VALIDATION.username.pattern.test(username)
        || username.length < VALIDATION.username.minLength
        || username.length > VALIDATION.username.maxLength) {
        throw new ValidationError('Pseudo invalide (lettres, chiffres, - et _ uniquement)', 'username');
      }
    } else {
      username = undefined;
    }

    if (!username) {
      const counter = await redis.incr('guest:username_counter');
      username = `Invité_${String(counter).padStart(5, '0')}`;
    }

    // Vérifier que le pseudo n'est pas pris par un inscrit
    if (await userRepository.isUsernameTaken(username)) {
      throw new ValidationError('Ce pseudo est réservé par un utilisateur inscrit', 'username');
    }

    // Pseudo invité déjà pris → en générer un nouveau
    const existingByUsername = await userRepository.findByUsername(username);
    if (existingByUsername && existingByUsername.tier === 'guest') {
      const counter = await redis.incr('guest:username_counter');
      username = `Invité_${String(counter).padStart(5, '0')}`;
    }

    // ── 3. Créer le nouveau compte invité ─────────────────────────────────
    const user = await userRepository.create({
      username,
      tier: 'guest',
      last_ip: data.ip,
      guest_fingerprint: data.fingerprint || null,
    } as any);

    // Log sécurité
    if (data.fingerprint) {
      await guestSecurityService.logConnection({
        fingerprint: data.fingerprint,
        userId:      user.id,
        ip:          data.ip,
        userAgent:   data.userAgent,
      });
    }

    // Log LCEN
    await logAudit('login', data.ip, user.id, { method: 'guest', fingerprint: data.fingerprint }, data.userAgent);

    const payload = { userId: user.id, username: user.username, tier: user.tier };
    const accessToken = generateAccessToken(payload);

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

    // 🔐 Un utilisateur banni ne peut plus renouveler ses tokens
    if (isBanActive(user)) {
      await sessionRepository.deleteAllForUser(user.id);
      throw new UnauthorizedError('Compte suspendu');
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
