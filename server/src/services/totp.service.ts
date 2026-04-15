/**
 * services/totp.service.ts — TOTP avec speakeasy (lib éprouvée, import CJS propre)
 * 
 * Dépendances :
 *   npm install speakeasy qrcode
 *   npm install -D @types/speakeasy @types/qrcode
 */
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { db } from '../config/database';
import { env } from '../config/env';

const APP_NAME = env.APP_NAME || 'ChatApp';

export const totpService = {

  async setup(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    const user = await db('users').where({ id: userId }).select('username', 'email', 'totp_secret', 'totp_enabled').first();
    if (!user) throw new Error('Utilisateur introuvable');

    if (user.totp_enabled && user.totp_secret) {
      throw new Error('TOTP déjà configuré. Utilisez la vérification.');
    }

    // Générer le secret avec speakeasy
    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} Admin (${user.email || user.username})`,
      issuer: `${APP_NAME} Admin`,
      length: 20,
    });

    // Stocker le secret base32 en BDD
    await db('users').where({ id: userId }).update({ totp_secret: secret.base32 });

    // Générer le QR code
    const otpauthUrl = secret.otpauth_url || '';
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl,
    };
  },

  async verify(userId: string, token: string): Promise<boolean> {
    const user = await db('users').where({ id: userId }).select('totp_secret', 'totp_enabled').first();
    if (!user || !user.totp_secret) return false;

    // Vérifier le code avec une fenêtre de ±2 (60 secondes de tolérance)
    const isValid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: token,
      window: 2,
    });

    // Première vérification réussie → activer le TOTP
    if (isValid && !user.totp_enabled) {
      await db('users').where({ id: userId }).update({ totp_enabled: true });
    }

    return isValid;
  },

  async isEnabled(userId: string): Promise<boolean> {
    const user = await db('users').where({ id: userId }).select('totp_enabled').first();
    return !!user?.totp_enabled;
  },

  async reset(userId: string): Promise<void> {
    await db('users').where({ id: userId }).update({ totp_secret: null, totp_enabled: false });
  },
};
