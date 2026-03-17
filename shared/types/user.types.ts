// ===== USER TYPES =====

export type UserTier = 'guest' | 'registered' | 'premium';
export type UserTheme = 'light' | 'dark';
export type DonorBadge = 'none' | 'supporter' | 'mecene' | 'fondateur';

export interface User {
  id: string;
  username: string;
  email: string | null;
  tier: UserTier;
  avatar_url: string | null;
  bio: string | null;
  status_text: string | null;
  status_emoji: string | null;
  donor_badge: DonorBadge;
  theme: UserTheme;
  chat_color: string | null;      // Premium only
  notification_sound: string | null; // Premium only
  is_banned: boolean;
  is_muted: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

// Profil public (ce que les autres voient)
export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  tier: UserTier;
  donor_badge: DonorBadge;
  status_text: string | null;
  status_emoji: string | null;
  is_online: boolean;
  created_at: string;
}

// Données retournées à l'utilisateur connecté
export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  tier: UserTier;
  avatar_url: string | null;
  bio: string | null;
  donor_badge: DonorBadge;
  theme: UserTheme;
}

export interface AuthResponse {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  is_new_user?: boolean;
}
