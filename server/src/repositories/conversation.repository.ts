/**
 * repositories/conversation.repository.ts — FIXED: hide/show au lieu de delete
 * 
 * Fermer un PV (✕) = masquer (is_hidden = true)
 * L'autre envoie un message = réapparaît (is_hidden = false)
 * L'historique est TOUJOURS conservé
 */
import { db } from '../config/database';

export const conversationRepository = {
  async findOrCreate(userId: string, targetUserId: string): Promise<{ conversation: any; isNew: boolean }> {
    const existing = await db('conversation_participants as cp1')
      .join('conversation_participants as cp2', 'cp1.conversation_id', 'cp2.conversation_id')
      .where('cp1.user_id', userId).where('cp2.user_id', targetUserId)
      .select('cp1.conversation_id').first();
    if (existing) {
      const conversation = await db('conversations').where({ id: existing.conversation_id }).first();
      // ⭐ Rendre visible si masquée (l'utilisateur relance la conv)
      await db('conversation_participants')
        .where({ conversation_id: conversation.id, user_id: userId })
        .update({ is_hidden: false });
      return { conversation, isNew: false };
    }
    const [conversation] = await db('conversations').insert({}).returning('*');
    await db('conversation_participants').insert([
      { conversation_id: conversation.id, user_id: userId, is_initiator: true },
      { conversation_id: conversation.id, user_id: targetUserId, is_initiator: false },
    ]);
    return { conversation, isNew: true };
  },

  /**
   * Liste les conversations VISIBLES d'un utilisateur (is_hidden = false)
   */
  async findByUser(userId: string): Promise<any[]> {
    const conversations = await db('conversation_participants as my_cp')
      .join('conversation_participants as other_cp', function() {
        this.on('my_cp.conversation_id', '=', 'other_cp.conversation_id')
            .andOn('other_cp.user_id', '!=', db.raw('?', [userId]));
      })
      .join('conversations as c', 'c.id', '=', 'my_cp.conversation_id')
      .join('users as u', 'u.id', '=', 'other_cp.user_id')
      .where('my_cp.user_id', userId)
      .where('my_cp.is_hidden', false)  // ⭐ Seulement les non masquées
      .select(
        'c.id', 'c.last_message_at', 'c.created_at',
        'u.id as participant_id', 'u.username as participant_username',
        'u.avatar_url as participant_avatar_url', 'u.tier as participant_tier',
        'u.donor_badge as participant_donor_badge', 'u.last_seen_at as participant_last_seen_at',
        'my_cp.last_read_at',
      )
      .orderByRaw('COALESCE(c.last_message_at, c.created_at) DESC');

    const enriched = [];
    for (const conv of conversations) {
      const lastMsg = await db('messages')
        .leftJoin('users', 'messages.author_id', '=', 'users.id')
        .where('messages.conversation_id', conv.id).where('messages.is_hidden', false)
        .orderBy('messages.created_at', 'desc')
        .select('messages.content', 'users.username as author_username').first();

      const unreadQuery = db('messages')
        .where('conversation_id', conv.id).where('is_hidden', false).where('author_id', '!=', userId);
      if (conv.last_read_at) unreadQuery.where('created_at', '>', conv.last_read_at);
      const result = await unreadQuery.count('id as count').first();

      enriched.push({
        ...conv,
        last_message_content: lastMsg?.content || null,
        last_message_author: lastMsg?.author_username || null,
        unread_count: parseInt(result?.count as string, 10) || 0,
      });
    }
    return enriched;
  },

  async isParticipant(convId: string, userId: string): Promise<boolean> {
    return !!(await db('conversation_participants').where({ conversation_id: convId, user_id: userId }).first());
  },

  async getOtherParticipant(convId: string, userId: string): Promise<any | null> {
    return db('conversation_participants').join('users', 'conversation_participants.user_id', '=', 'users.id')
      .where('conversation_participants.conversation_id', convId)
      .whereNot('conversation_participants.user_id', userId)
      .select('users.id', 'users.username', 'users.avatar_url', 'users.tier').first() || null;
  },

  async updateLastMessage(convId: string): Promise<void> {
    await db('conversations').where({ id: convId }).update({ last_message_at: new Date() });
  },

  async markAsRead(convId: string, userId: string): Promise<void> {
    await db('conversation_participants')
      .where({ conversation_id: convId, user_id: userId })
      .update({ last_read_at: new Date() });
  },

  async getConversationIdsForUser(userId: string): Promise<string[]> {
    const rows = await db('conversation_participants').where({ user_id: userId }).select('conversation_id');
    return rows.map((r: any) => r.conversation_id);
  },

  /**
   * ⭐ Masquer une conversation (ne supprime rien)
   * La conversation réapparaîtra si l'autre envoie un message
   */
  async hide(convId: string, userId: string): Promise<void> {
    await db('conversation_participants')
      .where({ conversation_id: convId, user_id: userId })
      .update({ is_hidden: true });
  },

  /**
   * ⭐ Rendre visible une conversation masquée (quand l'autre envoie un message)
   */
  async unhide(convId: string, userId: string): Promise<void> {
    await db('conversation_participants')
      .where({ conversation_id: convId, user_id: userId })
      .update({ is_hidden: false });
  },

  /**
   * ⭐ Rendre visible pour TOUS les participants (quand un nouveau message arrive)
   */
  async unhideForAll(convId: string): Promise<void> {
    await db('conversation_participants')
      .where({ conversation_id: convId })
      .update({ is_hidden: false });
  },
};
