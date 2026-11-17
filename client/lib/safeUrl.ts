/**
 * lib/safeUrl.ts — Filtrage des URLs affichées dans le chat
 *
 * 🔐 Les URLs de médias viennent d'autres utilisateurs : on n'accepte que
 *   - nos propres fichiers : chemin relatif commençant par /uploads/
 *   - des URLs absolues http(s)
 * Tout le reste (javascript:, data:, vbscript:, //autre-site…) est rejeté → null.
 */
export function safeMediaUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) return null;
  if (url.startsWith('/uploads/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

import { isGifMediaUrl } from '@/lib/gifMedia';

/** 🔐 Nos propres fichiers uniquement (images et fichiers des messages) : /uploads/images|files/<uuid>.<ext> */
export function safeLocalMediaUrl(url: unknown): string | null {
  return typeof url === 'string' && /^\/uploads\/(images|files)\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i.test(url) ? url : null;
}

/** 🔐 GIF : uniquement hébergés par un fournisseur (même liste que la CSP et que le serveur) */
export function safeGifUrl(url: unknown): string | null {
  return isGifMediaUrl(url) ? (url as string) : null;
}

/** 🔐 Image d'aperçu de lien : uniquement la copie faite par notre serveur (/uploads/previews/<sha256>.webp) */
export function safePreviewImageUrl(url: unknown): string | null {
  return typeof url === 'string' && /^\/uploads\/previews\/[0-9a-f]{64}\.webp$/.test(url) ? url : null;
}

/**
 * 🔐 Avatars : uniquement nos fichiers WebP (/uploads/avatars/<uuid>.webp).
 * Jamais d'image externe (traçage d'IP) ni de data: (ancien format base64).
 */
export function safeAvatarUrl(url: unknown): string | null {
  return typeof url === 'string' && /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/.test(url) ? url : null;
}

/** Variante stricte : uniquement https absolu (images externes, aperçus de liens) */
export function safeHttpsUrl(url: unknown): string | null {
  const safe = safeMediaUrl(url);
  return safe && safe.startsWith('https://') ? safe : null;
}

/** Miniature d'une de NOS images : /uploads/thumbs/<uuid>.webp (sinon null) */
export function safeThumbUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  return /^\/uploads\/thumbs\/[0-9a-f-]{36}\.webp$/i.test(url) ? url : null;
}

/**
 * Miniature (400 px) déduite de l'adresse d'une image envoyée : même identifiant, dossier thumbs.
 * Pas de miniature pour les GIF (l'animation serait perdue) : l'original est affiché.
 */
export function thumbForImage(url: string | null | undefined): string | null {
  const safe = safeLocalMediaUrl(url);
  const m = safe ? /^\/uploads\/images\/([0-9a-f-]{36})\.(webp|jpe?g|png)$/i.exec(safe) : null;
  return m ? `/uploads/thumbs/${m[1]}.webp` : null;
}
