/**
 * proxy.ts — (ex-middleware, renommé en Next.js 16) — s'exécute avant chaque page
 *
 * 🔐 1. Politique de sécurité du contenu (CSP) avec « nonce »
 *    Un nonce aléatoire est généré à chaque requête. Seuls les scripts portant ce nonce
 *    (ceux de Next.js et le nôtre) peuvent s'exécuter : un script injecté par une faille XSS
 *    ne le connaît pas et est bloqué par le navigateur.
 *
 * 🔐 2. Panel admin (/panel/...) servi QUE via la passerelle admin (http://localhost:2025,
 *    npm run admin, PC uniquement). Sur le port du chat (1608, ouvert au Wi-Fi),
 *    /panel répond une page 404 ordinaire, comme si le panel n'existait pas.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_GATEWAY_HEADER, isAdminGatewayRequest } from '@/lib/adminGateway';

const isDev = process.env.NODE_ENV !== 'production';

/** Adresse du serveur temps réel (Socket.io), même règle que client/lib/socket.ts */
function realtimeSources(request: NextRequest): string[] {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) {
    try {
      const u = new URL(configured);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return [u.origin, `${wsProto}//${u.host}`];
    } catch { /* URL invalide → règle par défaut */ }
  }
  const host = (request.headers.get('host') || 'localhost').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  // Nom d'hôte assaini : il est recopié dans un en-tête de sécurité
  const safeHost = /^([a-z0-9.-]+|\[[0-9a-f:]+\])$/.test(hostname) ? hostname : 'localhost';
  const secure = request.nextUrl.protocol === 'https:';
  return [`${secure ? 'https' : 'http'}://${safeHost}:4000`, `${secure ? 'wss' : 'ws'}://${safeHost}:4000`];
}

function buildCsp(nonce: string, request: NextRequest): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'strict-dynamic' : les scripts chargés par un script de confiance (nonce) sont acceptés
    // 'unsafe-eval' uniquement en développement (outils de React / Next.js)
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Styles inline nécessaires (attributs style de React, Tailwind) — risque limité
    'style-src': ["'self'", "'unsafe-inline'"],
    // Avatars (data:), aperçus de liens et GIF (https:), images locales
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'media-src': ["'self'", 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    // 🔐 Seulement notre site et le serveur temps réel (la recherche GIF passe par le serveur)
    'connect-src': ["'self'", ...realtimeSources(request)],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
  // Forcer HTTPS sur les ressources uniquement si le site est réellement servi en HTTPS
  // (sinon `npm start` en local, en HTTP, ne pourrait plus naviguer)
  const servedOverHttps = request.nextUrl.protocol === 'https:'
    || request.headers.get('x-forwarded-proto') === 'https';
  return servedOverHttps ? `${csp}; upgrade-insecure-requests` : csp;
}

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, request);

  // Next.js lit le nonce dans l'en-tête CSP de la requête et l'ajoute à ses propres scripts
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const isPanel = request.nextUrl.pathname === '/panel' || request.nextUrl.pathname.startsWith('/panel/');
  const response = isPanel && !isAdminGatewayRequest(request.headers.get(ADMIN_GATEWAY_HEADER))
    ? NextResponse.rewrite(new URL('/__page-introuvable', request.url), { status: 404, request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Toutes les pages, sauf l'API, les fichiers statiques et les fichiers uploadés
      source: '/((?!api|_next/static|_next/image|uploads|favicon.ico|manifest.json).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
