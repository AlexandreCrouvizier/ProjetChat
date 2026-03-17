/**
 * utils/ip.ts — Extraction de l'IP du client
 * 
 * LCEN : chaque action doit être associée à une IP.
 * 
 * En production, le client passe par NGINX (reverse proxy).
 * L'IP réelle est dans le header X-Forwarded-For, pas dans req.ip
 * (qui serait l'IP de NGINX = 127.0.0.1).
 */

import type { Request } from 'express';
import type { Socket } from 'socket.io';

/**
 * Récupère l'IP du client depuis une requête Express
 */
export function getIpFromRequest(req: Request): string {
  // X-Forwarded-For contient potentiellement plusieurs IPs : "client, proxy1, proxy2"
  // On prend la première = l'IP réelle du client
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }

  // Fallback : IP directe (en dev, sans proxy)
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

/**
 * Récupère l'IP du client depuis un Socket.io
 */
export function getIpFromSocket(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || '0.0.0.0';
}
