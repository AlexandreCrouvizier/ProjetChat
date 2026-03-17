import dotenv from 'dotenv';
import path from 'path';

// Charge le .env depuis la racine du projet
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const env = {
  // App
  APP_NAME: process.env.APP_NAME || 'chatapp',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
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
};

// Vérifie les variables critiques en production
if (!env.isDev) {
  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Variable d'environnement manquante : ${key}`);
    }
  }
}
