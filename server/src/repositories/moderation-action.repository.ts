/**
 * repositories/moderation-action.repository.ts — Historique des actions de modération
 */
import { db } from '../config/database';

const DURATION_MAP: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '20m': 20 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '45m': 45 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const moderationActionRepository = {

  /** Créer une action de modération */
  async create(data: {
    target_user_id: string; moderator_id: string; action: string;
    group_id?: string; duration?: string; reason: string;
    report_id?: string; ip_address?: string;
  }): Promise<any> {
    const expiresAt = data.duration && data.duration !== 'permanent' && DURATION_MAP[data.duration]
      ? new Date(Date.now() + DURATION_MAP[data.duration])
      : null;

    const [action] = await db('moderation_actions').insert({
      ...data,
      expires_at: expiresAt,
    }).returning('*');

    return action;
  },

  /** Historique des actions sur un utilisateur */
  async findByUser(targetUserId: string): Promise<any[]> {
    return db('moderation_actions')
      .leftJoin('users as mod', 'moderation_actions.moderator_id', '=', 'mod.id')
      .where('moderation_actions.target_user_id', targetUserId)
      .select('moderation_actions.*', 'mod.username as moderator_username')
      .orderBy('moderation_actions.created_at', 'desc')
      .limit(50);
  },

  /** Vérifier si un utilisateur est actuellement mute (global) */
  async isCurrentlyMuted(userId: string): Promise<boolean> {
    const action = await db('moderation_actions')
      .where({ target_user_id: userId, action: 'mute' })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
      })
      .orderBy('created_at', 'desc')
      .first();

    if (!action) return false;

    // Vérifier s'il y a eu un unmute après
    const unmute = await db('moderation_actions')
      .where({ target_user_id: userId, action: 'unmute' })
      .where('created_at', '>', action.created_at)
      .first();

    return !unmute;
  },
};
