/**
 * middleware/adminGateway.middleware.ts — Le panel admin n'est joignable que via la passerelle
 *
 * La passerelle (client/scripts/admin-gateway.mjs) écoute uniquement sur 127.0.0.1:ADMIN_PORT
 * et ajoute l'en-tête `x-chatapp-admin-gateway` avec ADMIN_GATEWAY_SECRET.
 * Une requête venant du Wi-Fi (port 1608 ou directement 4000) ne connaît pas ce secret :
 * les routes admin lui répondent 404, même avec un compte superadmin et un token TOTP valides.
 *
 * En production, c'est NGINX qui jouera ce rôle (vhost admin restreint, qui ajoute l'en-tête).
 */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const ADMIN_GATEWAY_HEADER = 'x-chatapp-admin-gateway';

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

export function isFromAdminGateway(headerValue: unknown): boolean {
  if (!env.ADMIN_GATEWAY_SECRET || typeof headerValue !== 'string' || !headerValue) return false;
  // Comparaison à temps constant (sur des empreintes de même longueur)
  return crypto.timingSafeEqual(sha256(headerValue), sha256(env.ADMIN_GATEWAY_SECRET));
}

export function requireAdminGateway(req: Request, res: Response, next: NextFunction): void {
  if (isFromAdminGateway(req.headers[ADMIN_GATEWAY_HEADER])) return next();
  // Réponse identique à une route inexistante : ne révèle pas l'existence du panel
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route introuvable' });
}
