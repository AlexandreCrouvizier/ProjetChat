/**
 * utils/ip.ts — Extraction de l'IP du client
 *
 * LCEN : chaque action doit être associée à une IP fiable.
 *
 * 🔐 SÉCURITÉ : l'en-tête X-Forwarded-For est fourni par le client → falsifiable.
 * On ne l'utilise QUE si la connexion vient de notre propre proxy, sur la même machine
 * (Next.js en dev, NGINX en production). Dans ce cas on prend la DERNIÈRE IP de la liste :
 * c'est celle ajoutée par notre proxy (les précédentes peuvent être inventées par le client).
 * Sinon (connexion directe, ex. WebSocket sur :4000), on prend l'adresse TCP réelle.
 */

import type { Request } from 'express';
import type { Socket } from 'socket.io';

const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1']);

/** Retire le préfixe IPv4-mappé ("::ffff:192.168.1.10" → "192.168.1.10") */
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '0.0.0.0';
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.substring(7) : trimmed;
}

function resolveClientIp(peer: string | undefined, forwarded: string | string[] | undefined): string {
  const peerIp = normalizeIp(peer);
  if (!TRUSTED_PROXIES.has(peerIp) || !forwarded) return peerIp;

  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  const hops = raw.split(',').map((h) => h.trim()).filter(Boolean);
  const last = hops[hops.length - 1];
  return last ? normalizeIp(last) : peerIp;
}

/** IP du client depuis une requête Express */
export function getIpFromRequest(req: Request): string {
  return resolveClientIp(req.socket.remoteAddress, req.headers['x-forwarded-for']);
}

/** IP du client depuis un Socket.io */
export function getIpFromSocket(socket: Socket): string {
  return resolveClientIp(socket.handshake.address, socket.handshake.headers['x-forwarded-for']);
}
