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

/** Variante stricte : uniquement https absolu (images externes, aperçus de liens) */
export function safeHttpsUrl(url: unknown): string | null {
  const safe = safeMediaUrl(url);
  return safe && safe.startsWith('https://') ? safe : null;
}
