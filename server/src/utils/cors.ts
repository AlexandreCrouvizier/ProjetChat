/**
 * utils/cors.ts — Origines autorisées (Express + Socket.io)
 *
 * Production   : uniquement APP_URL.
 * Développement : APP_URL + localhost + adresses de réseau privé, pour tester
 *                 depuis le Wi-Fi local (téléphone, tablette, autre PC, Mac).
 *                 Ces plages (RFC 1918) ne sont pas routables sur Internet.
 */
import { env } from '../config/env';

const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Pas d'en-tête Origin : requête même origine, proxy Next.js côté serveur, curl…
  if (!origin) return true;
  if (origin === env.APP_URL) return true;
  return env.isDev && PRIVATE_LAN_ORIGIN.test(origin);
}

/** Callback compatible avec le paquet `cors` (Express) et l'option `cors.origin` de Socket.io */
export function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  callback(null, isAllowedOrigin(origin));
}
