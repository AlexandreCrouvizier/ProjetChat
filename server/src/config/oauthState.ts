/**
 * config/oauthState.ts — Paramètre « state » OAuth conservé dans un cookie (anti CSRF de connexion)
 *
 * 🔐 Sans « state », un site malveillant pouvait renvoyer un visiteur sur notre adresse de retour
 * OAuth avec le code d'autorisation de SON propre compte Google/GitHub : la victime se retrouvait
 * connectée au compte de l'attaquant (et y écrivait ses messages privés).
 *
 * Au départ vers le fournisseur : valeur aléatoire en cookie httpOnly (10 min, chemin /api/auth/oauth).
 * Au retour : la valeur renvoyée par le fournisseur doit être identique (comparaison à temps constant),
 * le cookie est effacé dans tous les cas (usage unique).
 *
 * SameSite=Lax (et pas Strict) : le retour depuis google.com / github.com est une navigation venant
 * d'un autre site ; un cookie Strict ne serait pas envoyé. Lax suffit : il n'est envoyé que pour
 * une navigation de premier niveau en GET, et la valeur ne donne aucun accès par elle-même.
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { env } from './env';
import { readRequestCookie } from '../utils/authCookies';

export const OAUTH_STATE_COOKIE = 'chatapp_oauth_state';
const COOKIE_PATH = '/api/auth/oauth';
const MAX_AGE_MS = 10 * 60 * 1000;

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: !env.isDev, path: COOKIE_PATH };
}

/** Magasin de « state » compatible passport-oauth2 (signatures à 4 arguments) */
export class CookieStateStore {
  store(req: Request, _state: unknown, _meta: unknown, callback: (err: Error | null, state?: string) => void): void {
    const res = req.res;
    if (!res) return callback(new Error('Réponse HTTP indisponible pour le state OAuth'));
    const state = crypto.randomBytes(32).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE, state, { ...cookieOptions(), maxAge: MAX_AGE_MS });
    callback(null, state);
  }

  verify(req: Request, providedState: string, _meta: unknown, callback: (err: Error | null, ok: boolean, state?: unknown) => void): void {
    const expected = readRequestCookie(req, OAUTH_STATE_COOKIE);
    req.res?.clearCookie(OAUTH_STATE_COOKIE, cookieOptions());
    const ok = typeof expected === 'string' && typeof providedState === 'string'
      && /^[0-9a-f]{64}$/.test(expected) && expected.length === providedState.length
      && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedState));
    if (!ok) return callback(null, false, { message: 'State OAuth invalide' });
    callback(null, true);
  }
}
