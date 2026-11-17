/**
 * services/totp.service.ts — Double authentification du panel admin (TOTP, Google Authenticator…)
 *
 * 🔐 Renforcements :
 *  1. Bibliothèque : otplib 13 (maintenue, cryptographie auditée) au lieu de speakeasy (abandonnée).
 *  2. Secret chiffré en base (AES-256-GCM, clé TOTP_ENCRYPTION_KEY du .env) : une fuite de la base
 *     de données ne suffit plus à générer des codes valides.
 *     Les anciens secrets en clair sont relus puis rechiffrés automatiquement au prochain code valide.
 *  3. Code à usage unique : un code déjà accepté est refusé ensuite (anti-rejeu), même dans sa fenêtre de validité.
 *  4. Tolérance réduite : ±30 s (une période) au lieu de ±60 s.
 */
import crypto from 'crypto';
import QRCode from 'qrcode';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { db } from '../config/database';
import { env } from '../config/env';
import { redis } from '../config/redis';

const APP_NAME = env.APP_NAME || 'ChatApp';
const ENC_PREFIX = 'v1:';
const TOLERANCE_SECONDS = 30;

/** Clé AES-256 (32 octets) : TOTP_ENCRYPTION_KEY (64 caractères hex), sinon dérivée en développement */
function encryptionKey(): Buffer {
  const hex = env.TOTP_ENCRYPTION_KEY;
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  if (!env.isDev) throw new Error('TOTP_ENCRYPTION_KEY manquante ou invalide (64 caractères hexadécimaux)');
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update('chatapp-totp-key').digest();
}

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + [iv, tag, data].map((b) => b.toString('base64')).join(':');
}

function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // ancien secret en clair (avant chiffrement)
  const [iv, tag, data] = stored.slice(ENC_PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const lastStepKey = (userId: string) => `totp:last_step:${userId}`;

export const totpService = {

  async setup(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    const user = await db('users').where({ id: userId }).select('username', 'email', 'totp_secret', 'totp_enabled').first();
    if (!user) throw new Error('Utilisateur introuvable');

    if (user.totp_enabled && user.totp_secret) {
      throw new Error('TOTP déjà configuré. Utilisez la vérification.');
    }

    // Nouveau secret (base32, 20 octets) — stocké CHIFFRÉ
    const secret = generateSecret();
    await db('users').where({ id: userId }).update({ totp_secret: encryptSecret(secret) });

    const otpauthUrl = generateURI({
      issuer: `${APP_NAME} Admin`,
      label: user.email || user.username,
      secret,
    });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Le secret en clair n'est montré qu'une fois, au moment de la configuration
    return { secret, qrCodeUrl, otpauthUrl };
  },

  async verify(userId: string, token: string): Promise<boolean> {
    if (!/^\d{6}$/.test(token)) return false;

    const user = await db('users').where({ id: userId }).select('totp_secret', 'totp_enabled').first();
    if (!user || !user.totp_secret) return false;

    let secret: string;
    try {
      secret = decryptSecret(user.totp_secret);
    } catch {
      console.error('❌ TOTP : secret illisible (clé TOTP_ENCRYPTION_KEY modifiée ?)');
      return false;
    }

    // Dernière période déjà utilisée → un code ne sert qu'une seule fois
    const lastStep = Number(await redis.get(lastStepKey(userId)).catch(() => null)) || undefined;

    const result = await verifyTotp({
      secret,
      token,
      epochTolerance: TOLERANCE_SECONDS,
      ...(lastStep ? { afterTimeStep: lastStep } : {}),
    }).catch(() => ({ valid: false as const }));

    if (!result.valid) return false;

    // Mémoriser la période utilisée (10 min suffisent : la tolérance est de ±30 s)
    if ('timeStep' in result && typeof result.timeStep === 'number') {
      await redis.set(lastStepKey(userId), String(result.timeStep), 'EX', 600).catch(() => {});
    }

    const updates: Record<string, unknown> = {};
    if (!user.totp_enabled) updates.totp_enabled = true;               // première vérification → activation
    if (!user.totp_secret.startsWith(ENC_PREFIX)) updates.totp_secret = encryptSecret(secret); // migration
    if (Object.keys(updates).length) await db('users').where({ id: userId }).update(updates);

    return true;
  },

  async isEnabled(userId: string): Promise<boolean> {
    const user = await db('users').where({ id: userId }).select('totp_enabled').first();
    return !!user?.totp_enabled;
  },

  async reset(userId: string): Promise<void> {
    await db('users').where({ id: userId }).update({ totp_secret: null, totp_enabled: false });
    await redis.del(lastStepKey(userId)).catch(() => {});
  },
};
