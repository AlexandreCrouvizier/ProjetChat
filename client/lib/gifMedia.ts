/**
 * lib/gifMedia.ts — Domaines d'hébergement des GIF (côté client)
 *
 * ⚠️ Copie de GIF_MEDIA_DOMAINS (shared/constants.ts, utilisée par le serveur) : Next.js ne peut pas
 * importer de code hors du dossier client/. Les deux listes DOIVENT rester identiques
 * (vérifié par le test outils-tests/e2e-lot42c.mjs).
 * Utilisée par la CSP (proxy.ts, img-src) et par l'affichage des GIF (lib/safeUrl.ts).
 */
export const GIF_MEDIA_DOMAINS = ['klipy.com', 'giphy.com', 'tenor.com'] as const;

/** L'adresse est-elle une image https hébergée par un fournisseur de GIF ? */
export function isGifMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1000) return false;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase();
    return GIF_MEDIA_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
