/**
 * utils/authCookies.ts — Jetons de session dans des cookies httpOnly
 *
 * 🔐 Pourquoi : avant, les jetons étaient dans localStorage, lisible par n'importe quel script de la page.
 * Une seule faille XSS suffisait à voler la session. Un cookie httpOnly est invisible pour JavaScript :
 * le navigateur l'envoie tout seul au serveur, mais aucun script ne peut le lire.
 *
 *  - chatapp_at    : jeton d'accès (15 min), envoyé partout (API + WebSocket)
 *  - chatapp_rt    : jeton de renouvellement (7 j), envoyé UNIQUEMENT à /api/auth
 *  - chatapp_admin : jeton du panel (30 min, après TOTP), envoyé UNIQUEMENT à /api
 *
 * SameSite=Strict : jamais envoyés depuis un autre site (protection CSRF).
 * Secure en production : jamais envoyés en HTTP non chiffré.
 * Les cookies ne dépendent pas du port : ils valent pour :1608 (chat), :2025 (panel) et :4000 (WebSocket).
 */
import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const COOKIE = {
  access: 'chatapp_at',
  refresh: 'chatapp_rt',
  admin: 'chatapp_admin',
} as const;

const PATHS = { access: '/', refresh: '/api/auth', admin: '/api' } as const;

function baseOptions(path: string): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: !env.isDev, path };
}

/** Durée de vie restante du JWT (en ms), pour que le cookie expire en même temps que lui */
function msUntilExpiry(token: string, fallbackMs: number): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : fallbackMs;
}

export function setSessionCookies(res: Response, tokens: { access_token?: string; refresh_token?: string }): void {
  if (tokens.access_token) {
    res.cookie(COOKIE.access, tokens.access_token, {
      ...baseOptions(PATHS.access), maxAge: msUntilExpiry(tokens.access_token, 15 * 60 * 1000),
    });
  }
  if (tokens.refresh_token) {
    res.cookie(COOKIE.refresh, tokens.refresh_token, {
      ...baseOptions(PATHS.refresh), maxAge: msUntilExpiry(tokens.refresh_token, 7 * 24 * 3600 * 1000),
    });
  }
}

export function setAdminCookie(res: Response, adminToken: string): void {
  res.cookie(COOKIE.admin, adminToken, {
    ...baseOptions(PATHS.admin), maxAge: msUntilExpiry(adminToken, 30 * 60 * 1000),
  });
}

export function clearAdminCookie(res: Response): void {
  res.clearCookie(COOKIE.admin, baseOptions(PATHS.admin));
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(COOKIE.access, baseOptions(PATHS.access));
  res.clearCookie(COOKIE.refresh, baseOptions(PATHS.refresh));
  clearAdminCookie(res);
}

/** Retire les jetons d'une réponse JSON : le navigateur ne doit jamais les voir */
export function withoutTokens<T extends Record<string, unknown>>(result: T): Omit<T, 'access_token' | 'refresh_token'> {
  const { access_token: _a, refresh_token: _r, ...rest } = result;
  return rest;
}

/** Lit un cookie dans l'en-tête Cookie (requête HTTP ou poignée de main WebSocket) */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return undefined;
}

export function readRequestCookie(req: Request, name: string): string | undefined {
  return readCookie(req.headers.cookie, name);
}
