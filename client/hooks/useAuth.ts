/**
 * hooks/useAuth.ts — Hook d'authentification
 * 
 * Gère : login, register, guest, logout, vérification du token au chargement.
 * 🔐 Les jetons sont dans des cookies httpOnly posés par le serveur : ce hook ne les voit jamais.
 * Il ne garde que l'utilisateur (Zustand).
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { getOrCreateFingerprint } from '@/lib/fingerprint';

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, logout: clearUser, setLoading } = useAuthStore();

  /** Inscription par email */
  const register = useCallback(async (username: string, email: string, password: string) => {
    const { data } = await api.post('/auth/register', { username, email, password });
    setUser(data.user);
    connectSocket();
    router.push('/chat_group');
    return data;
  }, [setUser, router]);

  /** Connexion par email */
  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
    connectSocket();
    router.push('/chat_group');
    return data;
  }, [setUser, router]);

  /** Connexion invité */
  const loginAsGuest = useCallback(async (username?: string) => {
    const fingerprint = getOrCreateFingerprint();
    const { data } = await api.post('/auth/guest', { username, fingerprint });
    setUser(data.user);
    connectSocket();
    router.push('/chat_group');
    return data;
  }, [setUser, router]);

  /** Déconnexion */
  const logout = useCallback(async () => {
    try {
      // Le serveur supprime la session et efface les cookies
      await api.post('/auth/logout');
    } catch {
      // Ignore les erreurs de logout
    }
    // ⭐ Émettre user:logout AVANT de déconnecter
    // Le serveur va : supprimer Redis + mettre last_seen_at = 10min passé + broadcast offline
    // Grâce au timestamp dans le passé, les polls HTTP du MembersPanel verront offline aussi
    const currentSocket = getSocket();
    if (currentSocket?.connected) {
      currentSocket.emit('user:logout');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    disconnectSocket();
    clearUser();
    router.push('/');
  }, [clearUser, router]);

  /** Vérifie si l'utilisateur est connecté au chargement */
  const checkAuth = useCallback(async () => {
    try {
      // Cookie de session présent → profil ; expiré → l'intercepteur tente un renouvellement
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      connectSocket();
    } catch {
      // Pas de session (visiteur) ou session terminée
      clearUser();
    }
  }, [setUser, clearUser, setLoading]);

  /** ⭐ Phase 4.1e — Rafraîchir le profil (tier, badges) sans se déconnecter */
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch { /* Silencieux */ }
  }, [setUser]);

  return {
    user,
    isAuthenticated,
    isLoading,
    register,
    login,
    loginAsGuest,
    logout,
    checkAuth,
    refreshUser,
  };
}
