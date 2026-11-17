/**
 * stores/authStore.ts — ajout gif_display
 */
import { create } from 'zustand';

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  tier: string;
  avatar_url: string | null;
  bio: string | null;
  donor_badge: string;
  theme: string;
  status_text?: string | null;
  status_emoji?: string | null;
  gif_display?: 'auto' | 'click' | null;  // ⭐ préférence personnelle (null = règle admin)
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthUser) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),

  // Vide l'état local. Les cookies httpOnly sont effacés par le serveur (POST /api/auth/logout).
  logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),
}));
