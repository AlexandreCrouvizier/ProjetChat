import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { forceBannedExit } from '@/lib/banGuard';

/**
 * lib/api.ts — Client API
 *
 * 🔐 Session en cookies httpOnly : le navigateur joint lui-même le jeton à chaque requête,
 * aucun script (ni ce fichier, ni un script malveillant) ne peut le lire.
 * En dev, /api/* est relayé vers le serveur Express par next.config.js (rewrites).
 */
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Nettoyage des anciens jetons laissés en localStorage par les versions précédentes
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('admin_token');
  } catch { /* stockage indisponible */ }
}

// Codes d'erreur du serveur signifiant « jeton d'accès absent ou expiré »
const SESSION_ERRORS = new Set(['UNAUTHORIZED', 'TOKEN_EXPIRED', 'INVALID_TOKEN']);
// Routes d'authentification qui ne doivent jamais déclencher de renouvellement automatique
const NO_REFRESH = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/guest', '/auth/logout'];

let refreshPromise: Promise<boolean> | null = null;

/**
 * Renouvelle la session grâce au cookie de renouvellement (httpOnly).
 * Un seul appel à la fois, même si plusieurs requêtes échouent en même temps.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/auth/refresh', null, { withCredentials: true })
      .then(() => true)
      .catch(() => false)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string }>) => {
    const original = error.config as RetryConfig | undefined;
    const code = error.response?.data?.error;
    const url = original?.url || '';

    // 🔐 Compte banni : le serveur refuse désormais immédiatement son jeton
    if (error.response?.status === 403 && code === 'ACCOUNT_SUSPENDED') {
      void forceBannedExit();
      return Promise.reject(error);
    }

    if (
      original && !original._retry
      && error.response?.status === 401
      && code && SESSION_ERRORS.has(code)
      && !NO_REFRESH.some((path) => url.startsWith(path))
    ) {
      original._retry = true;
      if (await refreshSession()) return api(original);
      // Session terminée : on vide l'état local (les pages protégées redirigent elles-mêmes)
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

/** Envoi de fichier (multipart) avec un renouvellement de session si nécessaire */
async function postFile(path: string, file: File, fallbackError: string) {
  const send = () => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(path, { method: 'POST', body: formData, credentials: 'same-origin' });
  };
  let res = await send();
  if (res.status === 401 && await refreshSession()) res = await send();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || fallbackError);
  return data;
}

// ⭐ Phase 4.1 — Upload d'images et fichiers
export async function uploadImage(file: File): Promise<{ url: string; filename: string; size: number; size_readable: string }> {
  return postFile('/api/upload/image', file, 'Erreur upload image');
}

export async function uploadFile(file: File): Promise<{ url: string; filename: string; size: number; size_readable: string; mimetype: string }> {
  return postFile('/api/upload/file', file, 'Erreur upload fichier');
}

// 🔐 Avatar envoyé en fichier : le serveur le vérifie et le convertit en WebP 256×256
export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  return postFile('/api/users/me/avatar', file, 'Erreur lors de l\'envoi de l\'avatar');
}

export default api;
