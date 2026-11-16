/**
 * lib/fingerprint.ts — Identifiant persistant client pour les invités
 *
 * Génère un UUID unique à la première visite et le conserve :
 *   1. Dans localStorage (principal)
 *   2. Dans un cookie (secours si localStorage effacé)
 *
 * Le fingerprint est envoyé au serveur à chaque connexion invité ET
 * dans le handshake WebSocket.
 *
 * ⚠️ Ce n'est PAS un fingerprint de navigateur (Canvas, fonts...).
 * C'est volontairement un simple UUID persistant, plus facile à implémenter
 * et suffisant pour identifier 99% des mauvaises intentions courantes.
 * La navigation privée génère un nouveau UUID — c'est géré par le double
 * verrou IP côté serveur.
 */

const STORAGE_KEY = 'guest_fp';
const COOKIE_NAME = 'gfp';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 an en secondes

function generateFingerprint(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'fp_' + crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback pour navigateurs anciens
  return 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

/**
 * Retourne le fingerprint existant ou en crée un nouveau.
 * Synchronise localStorage ↔ cookie à chaque appel.
 */
export function getOrCreateFingerprint(): string {
  if (typeof window === 'undefined') return 'fp_ssr';

  // 1. Lire depuis localStorage
  let fp = localStorage.getItem(STORAGE_KEY);

  // 2. Fallback sur le cookie si localStorage vide (ex: effacé manuellement)
  if (!fp) {
    fp = readCookie(COOKIE_NAME);
  }

  // 3. Si rien trouvé → générer un nouveau
  if (!fp || !fp.startsWith('fp_')) {
    fp = generateFingerprint();
  }

  // 4. Synchroniser les deux stockages
  localStorage.setItem(STORAGE_KEY, fp);
  setCookie(COOKIE_NAME, fp, COOKIE_MAX_AGE);

  return fp;
}

/**
 * Efface le fingerprint local (pour les tests ou la déconnexion volontaire).
 * Le serveur garde la trace — pas utilisé en production courante.
 */
export function clearFingerprint(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
}
