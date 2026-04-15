/**
 * repositories/message.repository.ts — Phase 2 étape 3 : Reply + Threads
 * 
 * Ajouts :
 *   - findByGroup/findByConversation : charge aussi le message reply_to (cité)
 *   - getThreadCounts : compte le nombre de réponses dans un thread
 *   - findThreadMessages : charge les messages d'un thread
 */

import { db } from '../config/database';

export interface MessageRow {
  id: string;
  content: string;
  author_id: string | null;
  group_id: string | null;
  conversation_id: string | null;
  parent_message_id: string | null;
  reply_to_id: string | null;
  type: string;
  is_pinned: boolean;
  is_hidden: boolean;
  ip_address: string;
  edited_at: string | null;
  created_at: string;
}

export interface MessageWithAuthor extends MessageRow {
  author_username: string;
  author_avatar_url: string | null;
  author_tier: string;
  author_donor_badge: string;
}

const MESSAGE_WITH_AUTHOR_SELECT = [
  'messages.*',
  'users.username as author_username',
  'users.avatar_url as author_avatar_url',
  'users.tier as author_tier',
  'users.donor_badge as author_donor_badge',
];

export const messageRepository = {

  async findByGroup(params: {
    groupId: string;
    limit?: number;
    before?: string;
  }): Promise<MessageWithAuthor[]> {
    const { groupId, limit = 50, before } = params;

    let query = db('messages')
      .leftJoin('users', 'messages.author_id', '=', 'users.id')
      .where('messages.group_id', groupId)
      .where('messages.is_hidden', false)
      // Ne charger que les messages racines (pas les réponses de thread)
      // Les réponses de thread sont chargées séparément via findThreadMessages
      .whereNull('messages.parent_message_id')
      .select(MESSAGE_WITH_AUTHOR_SELECT)
      .orderBy('messages.created_at', 'desc')
      .limit(Math.min(limit, 100));

    if (before) {
      const cursor = await db('messages').where({ id: before }).select('created_at').first();
      if (cursor) query = query.where('messages.created_at', '<', cursor.created_at);
    }

    return (await query).reverse();
  },

  async findByConversation(params: {
    conversationId: string;
    limit?: number;
    before?: string;
  }): Promise<MessageWithAuthor[]> {
    const { conversationId, limit = 50, before } = params;

    let query = db('messages')
      .leftJoin('users', 'messages.author_id', '=', 'users.id')
      .where('messages.conversation_id', conversationId)
      .where('messages.is_hidden', false)
      .select(MESSAGE_WITH_AUTHOR_SELECT)
      .orderBy('messages.created_at', 'desc')
      .limit(Math.min(limit, 100));

    if (before) {
      const cursor = await db('messages').where({ id: before }).select('created_at').first();
      if (cursor) query = query.where('messages.created_at', '<', cursor.created_at);
    }

    return (await query).reverse();
  },

  /**
   * Récupérer les infos des messages cités (reply_to)
   * Pour chaque message qui a un reply_to_id, on récupère l'auteur + un extrait du contenu
   */
  async getReplyToData(replyToIds: string[]): Promise<Record<string, { id: string; author_username: string; content: string }>> {
    if (replyToIds.length === 0) return {};

    const rows = await db('messages')
      .leftJoin('users', 'messages.author_id', '=', 'users.id')
      .whereIn('messages.id', replyToIds)
      .select('messages.id', 'messages.content', 'users.username as author_username');

    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.id] = {
        id: row.id,
        author_username: row.author_username || 'Inconnu',
        // Tronquer le contenu à 100 caractères pour la prévisualisation
        content: row.content.length > 100 ? row.content.substring(0, 100) + '...' : row.content,
      };
    }
    return result;
  },

  /**
   * Compter les réponses dans les threads pour plusieurs messages
   * Un thread = les messages qui ont parent_message_id = ce message
   */
  async getThreadCounts(messageIds: string[]): Promise<Record<string, { count: number; lastReplyAt: string | null }>> {
    if (messageIds.length === 0) return {};

    const rows = await db('messages')
      .whereIn('parent_message_id', messageIds)
      .where('is_hidden', false)
      .groupBy('parent_message_id')
      .select(
        'parent_message_id',
        db.raw('COUNT(*) as count'),
        db.raw('MAX(created_at) as last_reply_at')
      );

    const result: Record<string, { count: number; lastReplyAt: string | null }> = {};
    for (const row of rows) {
      result[row.parent_message_id] = {
        count: parseInt(row.count, 10),
        lastReplyAt: row.last_reply_at,
      };
    }
    return result;
  },

  /**
   * Charger les messages d'un thread (réponses à un message parent)
   */
  async findThreadMessages(parentMessageId: string): Promise<MessageWithAuthor[]> {
    return db('messages')
      .leftJoin('users', 'messages.author_id', '=', 'users.id')
      .where('messages.parent_message_id', parentMessageId)
      .where('messages.is_hidden', false)
      .select(MESSAGE_WITH_AUTHOR_SELECT)
      .orderBy('messages.created_at', 'asc');
  },

  async create(data: {
    content: string;
    author_id: string;
    group_id?: string;
    conversation_id?: string;
    parent_message_id?: string;
    reply_to_id?: string;
    type?: string;
    ip_address: string;
  }): Promise<MessageRow> {
    const [message] = await db('messages')
      .insert({
        content: data.content,
        author_id: data.author_id,
        group_id: data.group_id || null,
        conversation_id: data.conversation_id || null,
        parent_message_id: data.parent_message_id || null,
        reply_to_id: data.reply_to_id || null,
        type: data.type || 'text',
        ip_address: data.ip_address,
      })
      .returning('*');
    return message;
  },

  async findByIdWithAuthor(id: string): Promise<MessageWithAuthor | null> {
    return await db('messages')
      .leftJoin('users', 'messages.author_id', '=', 'users.id')
      .where('messages.id', id)
      .select(MESSAGE_WITH_AUTHOR_SELECT)
      .first() || null;
  },

  async findById(id: string): Promise<MessageRow | null> {
    return await db('messages').where({ id }).first() || null;
  },

  async countByGroup(groupId: string): Promise<number> {
    const result = await db('messages')
      .where({ group_id: groupId, is_hidden: false })
      .whereNull('parent_message_id')
      .count('id as count')
      .first();
    return parseInt(result?.count as string, 10) || 0;
  },

  async countByConversation(conversationId: string): Promise<number> {
    const result = await db('messages')
      .where({ conversation_id: conversationId, is_hidden: false })
      .count('id as count')
      .first();
    return parseInt(result?.count as string, 10) || 0;
  },

  /** Soft delete — masquer un message (conservé en BDD pour LCEN) */
  async softDelete(id: string, reason?: string): Promise<void> {
    await db('messages').where({ id }).update({
      is_hidden: true,
      hidden_reason: reason || 'Supprimé par la modération',
    });
  },
};
