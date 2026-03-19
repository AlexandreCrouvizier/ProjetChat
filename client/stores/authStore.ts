/**
 * stores/authStore.ts — Phase 2 : ajout avatar_url, bio, status
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

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
