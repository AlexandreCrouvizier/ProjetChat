/**
 * lib/adminGateway.ts — Reconnaît les requêtes passées par la passerelle admin (côté serveur Next uniquement)
 *
 * La passerelle (scripts/admin-gateway.mjs) n'écoute que sur 127.0.0.1:ADMIN_PORT et ajoute
 * l'en-tête `x-chatapp-admin-gateway` = ADMIN_GATEWAY_SECRET (lu dans le .env racine).
 * ⚠️ Ne jamais importer ce fichier dans un composant client.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash, timingSafeEqual } from 'crypto';

export const ADMIN_GATEWAY_HEADER = 'x-chatapp-admin-gateway';

let cachedSecret: string | null = null;

function readSecret(): string {
  if (cachedSecret !== null) return cachedSecret;
  let secret = process.env.ADMIN_GATEWAY_SECRET || '';
  if (!secret) {
    // Next.js tourne depuis client/ et ne charge pas le .env racine
    const envPath = resolve(process.cwd(), '..', '.env');
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
        const m = line.match(/^\s*ADMIN_GATEWAY_SECRET\s*=\s*(.*?)\s*$/);
        if (m) secret = m[1].replace(/^["']|["']$/g, '');
      }
    }
  }
  // Valeur d'exemple ou trop courte → panel désactivé (fermé par défaut)
  if (secret.length < 32 || /^CHANGE_ME/i.test(secret)) secret = '';
  cachedSecret = secret;
  return secret;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest();

export function isAdminGatewayRequest(headerValue: string | null): boolean {
  const secret = readSecret();
  if (!secret || !headerValue) return false;
  return timingSafeEqual(sha256(headerValue), sha256(secret));
}
