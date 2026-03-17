/**
 * hooks/useAuth.ts — Hook d'authentification
 * 
 * Gère : login, register, guest, logout, vérification du token au chargement.
 * Stocke les tokens dans localStorage et l'utilisateur dans Zustand.
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket, disconnectSocket } from '@/lib/socket';

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, logout: clearUser, setLoading } = useAuthStore();

  /** Inscription par email */
  const register = useCallback(async (username: string, email: string, password: string) => {
    const { data } = await api.post('/auth/register', { username, email, password });
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    setUser(data.user);
    connectSocket(data.access_token);
    router.push('/chat_group');
    return data;
  }, [setUser, router]);

  /** Connexion par email */
  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    setUser(data.user);
    connectSocket(data.access_token);
    router.push('/chat_group');
    return data;
  }, [setUser, router]);

  /** Connexion invité */
  const loginAsGuest = useCallback(async (username?: string) => {
    const { data } = await api.post('/auth/guest', { username });
    localStorage.setItem('access_token', data.access_token);
    setUser(data.user);
    connectSocket(data.access_token);
    router.push('/chat_group');
    return data;
  }, [setUser, router]);

  /** Déconnexion */
  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      await api.post('/auth/logout', { refresh_token: refreshToken });
    } catch {
      // Ignore les erreurs de logout (token peut être déjà expiré)
    }
    disconnectSocket();
    clearUser();
    router.push('/');
  }, [clearUser, router]);

  /** Vérifie si l'utilisateur est connecté au chargement */
  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      connectSocket(token);
    } catch {
      // Token invalide/expiré → le refresh sera tenté par l'intercepteur axios
      clearUser();
    }
  }, [setUser, clearUser, setLoading]);

  return {
    user,
    isAuthenticated,
    isLoading,
    register,
    login,
    loginAsGuest,
    logout,
    checkAuth,
  };
}
