/**
 * middleware/csrf.middleware.ts — Protection CSRF (requêtes forgées depuis un autre site)
 *
 * Depuis le passage aux cookies, le navigateur joint la session automatiquement.
 * Un site piégé pourrait donc tenter d'envoyer une requête à notre place. Deux barrières :
 *   1. Cookies SameSite=Strict (le navigateur ne les joint pas depuis un autre site)
 *   2. Ce middleware : toute requête qui modifie quelque chose (POST/PUT/PATCH/DELETE) doit
 *      venir d'une origine autorisée (en-tête Origin, ou Referer à défaut).
 */
import type { Request, Response, NextFunction } from 'express';
import { isAllowedOrigin } from '../utils/cors';
import { COOKIE, readRequestCookie } from '../utils/authCookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try { return new URL(referer).origin; } catch { return undefined; }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = (req.headers.origin as string | undefined) || originFromReferer(req.headers.referer);
  if (origin) {
    if (origin !== 'null' && isAllowedOrigin(origin)) return next();
    res.status(403).json({ error: 'FORBIDDEN_ORIGIN', message: 'Origine de la requête non autorisée' });
    return;
  }

  // Ni Origin ni Referer : les navigateurs récents en envoient toujours un.
  // On refuse si la requête s'appuie sur un cookie de session (risque CSRF),
  // on laisse passer sinon (outils en ligne de commande, appels serveur à serveur).
  const usesSessionCookie = [COOKIE.access, COOKIE.refresh, COOKIE.admin]
    .some((name) => readRequestCookie(req, name));
  if (usesSessionCookie) {
    res.status(403).json({ error: 'FORBIDDEN_ORIGIN', message: 'Origine de la requête inconnue' });
    return;
  }
  next();
}
