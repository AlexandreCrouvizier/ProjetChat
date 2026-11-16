import axios from 'axios';

// Client API configuré
// En dev, les appels /api/* sont proxiés vers le backend via next.config.js rewrites
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur : ajoute le JWT à chaque requête
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur : gère le refresh token si 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Si 401 et qu'on n'a pas déjà tenté un refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post('/api/auth/refresh', {
          refresh_token: refreshToken,
        });

        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token);
        }

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch {
        // Refresh échoué → déconnexion
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/auth_group/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// ⭐ Phase 4.1 — Upload d'images et fichiers
export async function uploadImage(file: File): Promise<{ url: string; filename: string; size: number; size_readable: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload/image', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur upload image');
  return data;
}

export async function uploadFile(file: File): Promise<{ url: string; filename: string; size: number; size_readable: string; mimetype: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload/file', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur upload fichier');
  return data;
}

export default api;
