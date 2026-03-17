/**
 * repositories/message.repository.ts — Requêtes BDD pour les messages
 * 
 * La requête la plus fréquente : "donne-moi les 50 derniers messages du groupe X"
 * On utilise la pagination par cursor (avant un message donné) plutôt que
 * par offset, car c'est beaucoup plus performant sur les grosses tables.
 */

import { db } from '../config/database';

export interface MessageRow {
  id: string;
  content: string;
  author_id: string | null;
  group_id: string | null;
  parent_message_id: string | null;
  reply_to_id: string | null;
  type: string;
  is_pinned: boolean;
  is_hidden: boolean;
  ip_address: string;
  edited_at: string | null;
  created_at: string;
}

// Ce qu'on retourne au client : le message + les infos de l'auteur
export interface MessageWithAuthor extends MessageRow {
  author_username: string;
  author_avatar_url: string | null;
  author_tier: string;
  author_donor_badge: string;
}

export const messageRepository = {

  /**
   * Récupérer les messages d'un groupe avec les infos auteur
   * Pagination par cursor : "les 50 messages avant ce message_id"
   */
  async findByGroup(params: {
    groupId: string;
    limit?: number;
    before?: string;  // message_id cursor
  }): Promise<MessageWithAuthor[]> {
    const { groupId, limit = 50, before } = params;

    let query = db('messages')
      .join('users', 'messages.author_id', '=', 'users.id')
      .where('messages.group_id', groupId)
      .where('messages.is_hidden', false)  // Pas les messages masqués
      .select(
        'messages.*',
        'users.username as author_username',
        'users.avatar_url as author_avatar_url',
        'users.tier as author_tier',
        'users.donor_badge as author_donor_badge',
      )
      .orderBy('messages.created_at', 'desc')
      .limit(Math.min(limit, 100));  // Max 100 par requête

    // Pagination : si on a un cursor, on prend les messages AVANT celui-ci
    if (before) {
      const cursorMessage = await db('messages').where({ id: before }).select('created_at').first();
      if (cursorMessage) {
        query = query.where('messages.created_at', '<', cursorMessage.created_at);
      }
    }

    const messages = await query;

    // Les messages arrivent en DESC (plus récent en premier)
    // On les inverse pour les afficher du plus ancien au plus récent
    return messages.reverse();
  },

  /**
   * Créer un message
   * ⚠️ ip_address est OBLIGATOIRE (LCEN)
   */
  async create(data: {
    content: string;
    author_id: string;
    group_id: string;
    parent_message_id?: string;
    reply_to_id?: string;
    type?: string;
    ip_address: string;
  }): Promise<MessageRow> {
    const [message] = await db('messages')
      .insert({
        content: data.content,
        author_id: data.author_id,
        group_id: data.group_id,
        parent_message_id: data.parent_message_id || null,
        reply_to_id: data.reply_to_id || null,
        type: data.type || 'text',
        ip_address: data.ip_address,
      })
      .returning('*');
    return message;
  },

  /**
   * Récupérer un message par ID avec les infos auteur
   */
  async findByIdWithAuthor(id: string): Promise<MessageWithAuthor | null> {
    const message = await db('messages')
      .join('users', 'messages.author_id', '=', 'users.id')
      .where('messages.id', id)
      .select(
        'messages.*',
        'users.username as author_username',
        'users.avatar_url as author_avatar_url',
        'users.tier as author_tier',
        'users.donor_badge as author_donor_badge',
      )
      .first();
    return message || null;
  },

  /**
   * Compter les messages d'un groupe (pour savoir s'il y en a d'autres)
   */
  async countByGroup(groupId: string): Promise<number> {
    const result = await db('messages')
      .where({ group_id: groupId, is_hidden: false })
      .count('id as count')
      .first();
    return parseInt(result?.count as string, 10) || 0;
  },
};
