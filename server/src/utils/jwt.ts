/**
 * utils/jwt.ts — Génération et vérification des tokens JWT
 * 
 * On utilise 2 types de tokens :
 *   - Access Token  (15 min) : envoyé dans chaque requête, vérifié par le middleware
 *   - Refresh Token (7 jours) : stocké en BDD (hashé), sert à renouveler l'access token
 * 
 * Pourquoi 2 tokens ?
 *   L'access token est court (15min) donc s'il est volé, le risque est limité.
 *   Le refresh token est long (7j) mais il est hashé en BDD, donc on peut le révoquer.
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Ce qui est encodé dans le JWT (le "payload")
export interface JwtPayload {
  userId: string;
  username: string;
  tier: string;       // guest, registered, premium
}

/**
 * Génère un Access Token (courte durée, envoyé à chaque requête)
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,  // 15m par défaut
  });
}

/**
 * Génère un Refresh Token (longue durée, stocké côté client + hashé en BDD)
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,  // 7d par défaut
  });
}

/**
 * Vérifie et décode un Access Token
 * Retourne le payload si valide, throw si expiré/invalide
 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

/**
 * Vérifie et décode un Refresh Token
 */
export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
