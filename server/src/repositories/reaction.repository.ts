/**
 * repositories/reaction.repository.ts — Requêtes BDD pour les réactions
 * 
 * Toggle logic : si la réaction existe → la supprimer, sinon → la créer.
 * On retourne toujours le résumé complet des réactions du message après modification.
 */

import { db } from '../config/database';

export interface ReactionSummary {
  emoji: string;
  count: number;
  users: string[];    // Liste des user_ids qui ont réagi
}

export const reactionRepository = {

  /**
   * Toggle une réaction (ajouter si n'existe pas, supprimer si existe)
   * Retourne 'added' ou 'removed'
   */
  async toggle(messageId: string, userId: string, emoji: string): Promise<'added' | 'removed'> {
    // Vérifie si la réaction existe déjà
    const existing = await db('reactions')
      .where({ message_id: messageId, user_id: userId, emoji })
      .first();

    if (existing) {
      // Supprime la réaction
      await db('reactions')
        .where({ message_id: messageId, user_id: userId, emoji })
        .del();
      return 'removed';
    } else {
      // Ajoute la réaction
      await db('reactions').insert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
      return 'added';
    }
  },

  /**
   * Récupère le résumé des réactions pour un message
   * Retourne un tableau : [{ emoji: "👍", count: 3, users: ["uuid1", "uuid2", "uuid3"] }]
   */
  async getForMessage(messageId: string): Promise<ReactionSummary[]> {
    const rows = await db('reactions')
      .where({ message_id: messageId })
      .select('emoji', 'user_id')
      .orderBy('created_at', 'asc');

    // Grouper par emoji
    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      if (!grouped[row.emoji]) grouped[row.emoji] = [];
      grouped[row.emoji].push(row.user_id);
    }

    return Object.entries(grouped).map(([emoji, users]) => ({
      emoji,
      count: users.length,
      users,
    }));
  },

  /**
   * Récupère les réactions pour plusieurs messages d'un coup
   * Optimisation : évite N+1 queries quand on charge l'historique
   */
  async getForMessages(messageIds: string[]): Promise<Record<string, ReactionSummary[]>> {
    if (messageIds.length === 0) return {};

    const rows = await db('reactions')
      .whereIn('message_id', messageIds)
      .select('message_id', 'emoji', 'user_id')
      .orderBy('created_at', 'asc');

    // Grouper par message_id puis par emoji
    const result: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      if (!result[row.message_id]) result[row.message_id] = {};
      if (!result[row.message_id][row.emoji]) result[row.message_id][row.emoji] = [];
      result[row.message_id][row.emoji].push(row.user_id);
    }

    // Transformer en format ReactionSummary
    const formatted: Record<string, ReactionSummary[]> = {};
    for (const [msgId, emojis] of Object.entries(result)) {
      formatted[msgId] = Object.entries(emojis).map(([emoji, users]) => ({
        emoji,
        count: users.length,
        users,
      }));
    }

    return formatted;
  },
};
