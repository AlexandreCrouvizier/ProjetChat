/**
 * repositories/session.repository.ts — Gestion des sessions (refresh tokens)
 */

import { db } from '../config/database';

export const sessionRepository = {

  /** Créer une session (stocke le hash du refresh token) */
  async create(data: {
    user_id: string;
    refresh_token_hash: string;
    ip_address: string;
    user_agent?: string;
    expires_at: Date;
  }): Promise<void> {
    await db('sessions').insert(data);
  },

  /** Trouver une session par hash du refresh token */
  async findByTokenHash(hash: string): Promise<any | null> {
    return db('sessions')
      .where({ refresh_token_hash: hash })
      .where('expires_at', '>', new Date())  // Pas expirée
      .first() || null;
  },

  /** Supprimer une session spécifique (logout) */
  async deleteByTokenHash(hash: string): Promise<void> {
    await db('sessions').where({ refresh_token_hash: hash }).del();
  },

  /** Supprimer toutes les sessions d'un utilisateur (logout partout) */
  async deleteAllForUser(userId: string): Promise<void> {
    await db('sessions').where({ user_id: userId }).del();
  },

  /** Supprimer les sessions expirées (cron job quotidien) */
  async cleanExpired(): Promise<number> {
    const count = await db('sessions')
      .where('expires_at', '<', new Date())
      .del();
    return count;
  },
};
