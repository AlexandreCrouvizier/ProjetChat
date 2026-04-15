/**
 * repositories/user.repository.ts — Requêtes BDD pour les utilisateurs
 * 
 * Les repositories ne contiennent QUE des requêtes BDD.
 * Pas de logique métier, pas de validation, pas de hash de mot de passe.
 * C'est le service qui orchestre tout.
 */

import { db } from '../config/database';

// Type retourné par les requêtes (correspond à la table users)
export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  oauth_provider: string | null;
  oauth_id: string | null;
  tier: string;
  avatar_url: string | null;
  bio: string | null;
  status_text: string | null;
  status_emoji: string | null;
  donor_badge: string;
  theme: string;
  is_banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
  is_muted: boolean;
  mute_expires_at: string | null;
  last_seen_at: string | null;
  last_ip: string | null;
  created_at: string;
  updated_at: string;
}

// Colonnes "publiques" (ce qu'on retourne au client, JAMAIS le hash ou l'IP)
const PUBLIC_COLUMNS = [
  'id', 'username', 'email', 'tier', 'avatar_url', 'bio',
  'status_text', 'status_emoji', 'donor_badge', 'theme',
  'is_banned', 'is_muted', 'last_seen_at', 'created_at',
];

export const userRepository = {

  /** Trouver un user par ID */
  async findById(id: string): Promise<UserRow | null> {
    return db('users').where({ id }).first() || null;
  },

  /** Trouver un user par email */
  async findByEmail(email: string): Promise<UserRow | null> {
    return db('users').where({ email }).first() || null;
  },

  /** Trouver un user par username */
  async findByUsername(username: string): Promise<UserRow | null> {
    return db('users').where({ username }).first() || null;
  },

  /** Trouver un user par OAuth (provider + id) */
  async findByOAuth(provider: string, oauthId: string): Promise<UserRow | null> {
    return db('users')
      .where({ oauth_provider: provider, oauth_id: oauthId })
      .first() || null;
  },

  /** Créer un nouvel utilisateur */
  async create(data: {
    username: string;
    email?: string;
    password_hash?: string;
    oauth_provider?: string;
    oauth_id?: string;
    tier: string;
    last_ip?: string;
  }): Promise<UserRow> {
    const [user] = await db('users')
      .insert(data)
      .returning('*');
    return user;
  },

  /** Mettre à jour un utilisateur */
  async update(id: string, data: Partial<UserRow>): Promise<UserRow | null> {
    const [user] = await db('users')
      .where({ id })
      .update(data)
      .returning('*');
    return user || null;
  },

  /** Vérifier si un username est déjà pris (par un inscrit, pas un invité) */
  async isUsernameTaken(username: string): Promise<boolean> {
    const user = await db('users')
      .where({ username })
      .whereNot({ tier: 'guest' })  // Les invités ne "réservent" pas leur pseudo
      .first();
    return !!user;
  },

  /** Vérifier si un email est déjà utilisé */
  async isEmailTaken(email: string): Promise<boolean> {
    const user = await db('users').where({ email }).first();
    return !!user;
  },

  /** Supprimer les comptes invités expirés (plus de 24h sans activité) */
  async cleanExpiredGuests(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await db('users')
      .where({ tier: 'guest' })
      .where('created_at', '<', cutoff)
      .del();
    return count;
  },
};
