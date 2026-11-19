import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Charge le .env depuis la racine du projet.
// src/config (dev, tsx) et dist/server/src/config (build) n'ont pas la même profondeur :
// on remonte jusqu'à trouver le dossier qui contient à la fois server/ et .env.
function findRootEnv(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate) && fs.existsSync(path.join(dir, 'server'))) return candidate;
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), '..', '.env');
}
dotenv.config({ path: findRootEnv() });

export const env = {
  // App
  APP_NAME: process.env.APP_NAME || 'chatapp',
  APP_URL: process.env.APP_URL || 'http://localhost:1608',
  NODE_ENV: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Server
  PORT: parseInt(process.env.SERVER_PORT || '4000', 10),

  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://chatapp:chatapp_dev_2026@localhost:5432/chatapp',

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Rate Limiting
  RATE_LIMIT_GUEST_MS: parseInt(process.env.RATE_LIMIT_GUEST_MS || '10000', 10),
  RATE_LIMIT_USER_MS: parseInt(process.env.RATE_LIMIT_USER_MS || '1000', 10),

  // LCEN
  LCEN_RETENTION_DAYS: parseInt(process.env.LCEN_RETENTION_DAYS || '365', 10),

  // 🔐 Secret des tokens du panel admin (émis après TOTP).
  // Absent en dev → dérivé du secret d'accès (HMAC), jamais une valeur connue.
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || '',

  // 🔐 Secret ajouté par la passerelle admin (port ADMIN_PORT, PC uniquement).
  // Vide → panel et API admin désactivés (fermé par défaut).
  ADMIN_GATEWAY_SECRET: process.env.ADMIN_GATEWAY_SECRET || '',

  // 🔐 Clé de chiffrement des secrets TOTP en base (64 caractères hexadécimaux).
  // Ne JAMAIS la changer une fois des secrets créés : sinon il faut reconfigurer le TOTP.
  TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY || '',

  // 🔐 Clés des fournisseurs de GIF : lues UNIQUEMENT par le serveur (jamais envoyées au navigateur).
  // Une seule suffit — priorité : Klipy > Giphy > Tenor.
  GIF_KLIPY_API_KEY: process.env.GIF_KLIPY_API_KEY || '',
  GIF_GIPHY_API_KEY: process.env.GIF_GIPHY_API_KEY || '',
  GIF_TENOR_API_KEY: process.env.GIF_TENOR_API_KEY || '',

  // 🔐 Voix / vidéo (LiveKit) : lues UNIQUEMENT par le serveur (la clé secrète ne quitte jamais le serveur).
  // Variables absentes = fonction « indisponible » : le chat fonctionne normalement sans LiveKit.
  LIVEKIT_URL: process.env.LIVEKIT_URL || '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  /** Adresse de LiveKit vue par les navigateurs (wss://…). Vide : LIVEKIT_URL. */
  LIVEKIT_PUBLIC_URL: process.env.LIVEKIT_PUBLIC_URL || '',
};

// Vérifie les variables critiques en production
if (!env.isDev) {
  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_JWT_SECRET', 'ADMIN_GATEWAY_SECRET', 'TOTP_ENCRYPTION_KEY', 'DATABASE_URL'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Variable d'environnement manquante : ${key}`);
    }
  }
  // 🔐 Refuser de démarrer en production avec des secrets faibles ou identiques
  const secrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_JWT_SECRET', 'ADMIN_GATEWAY_SECRET'].map((k) => process.env[k] || '');
  if (secrets.some((s) => s.length < 64 || /^(dev|CHANGE_ME)/i.test(s))) {
    throw new Error('Secrets JWT trop faibles en production (64 caractères aléatoires minimum)');
  }
  if (new Set(secrets).size !== secrets.length) {
    throw new Error('Les secrets JWT doivent être tous différents');
  }
}
