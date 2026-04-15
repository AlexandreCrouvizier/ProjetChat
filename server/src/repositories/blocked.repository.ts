/**
 * repositories/blocked.repository.ts — Blocage entre utilisateurs
 * 
 * Quand A bloque B :
 *   - A ne voit plus les messages de B (filtrage côté client)
 *   - B ne peut plus envoyer de DM à A
 *   - B ne sait pas qu'il est bloqué
 */
import { db } from '../config/database';

export const blockedRepository = {

  /** Bloquer un utilisateur */
  async block(blockerId: string, blockedId: string): Promise<void> {
    // Upsert : si déjà bloqué, ne rien faire
    const exists = await db('blocked_users')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .first();
    if (!exists) {
      await db('blocked_users').insert({ blocker_id: blockerId, blocked_id: blockedId });
    }
  },

  /** Débloquer un utilisateur */
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await db('blocked_users')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .del();
  },

  /** Vérifier si A a bloqué B */
  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const row = await db('blocked_users')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .first();
    return !!row;
  },

  /** Vérifier le blocage dans les deux sens (pour les DM) */
  async isEitherBlocked(userA: string, userB: string): Promise<boolean> {
    const row = await db('blocked_users')
      .where({ blocker_id: userA, blocked_id: userB })
      .orWhere({ blocker_id: userB, blocked_id: userA })
      .first();
    return !!row;
  },

  /** Liste des utilisateurs bloqués par un user */
  async getBlockedByUser(blockerId: string): Promise<any[]> {
    return db('blocked_users')
      .join('users', 'blocked_users.blocked_id', '=', 'users.id')
      .where('blocked_users.blocker_id', blockerId)
      .select(
        'users.id', 'users.username', 'users.avatar_url', 'users.tier',
        'blocked_users.created_at as blocked_at'
      )
      .orderBy('blocked_users.created_at', 'desc');
  },

  /** Liste des IDs bloqués par un user (pour filtrage rapide) */
  async getBlockedIds(blockerId: string): Promise<string[]> {
    const rows = await db('blocked_users')
      .where({ blocker_id: blockerId })
      .select('blocked_id');
    return rows.map((r: any) => r.blocked_id);
  },
};
