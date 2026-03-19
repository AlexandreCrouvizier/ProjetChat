/**
 * services/message.service.ts — FIXED: sendMessage retourne un message formaté identique à getGroupMessages
 * 
 * Le bug "Inconnu" venait du fait que sendMessage retournait les champs plats
 * (author_username, author_tier...) alors que le frontend attend un objet
 * author: { id, username, tier... }. Maintenant le formatage est uniforme.
 */

import { messageRepository } from '../repositories/message.repository';
import { groupRepository } from '../repositories/group.repository';
import { reactionRepository } from '../repositories/reaction.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { moderationService } from './moderation.service';
import { checkRateLimit } from '../middleware/rateLimit.middleware';
import { logAudit } from '../middleware/audit.middleware';
import { BadRequestError, ForbiddenError, RateLimitError } from '../utils/errors';
import { VALIDATION, TIER_LIMITS } from '../../../shared/constants';

/**
 * Formate un message brut (avec champs plats) en message structuré (avec author: {})
 * Utilisé par sendMessage ET getGroupMessages pour garantir le même format
 */
function formatMessage(msg: any, options?: { reactions?: any[]; replyTo?: any; threadCount?: number; threadLastReplyAt?: string | null }) {
  return {
    id: msg.id,
    content: msg.content,
    author: {
      id: msg.author_id,
      username: msg.author_username || 'Inconnu',
      avatar_url: msg.author_avatar_url || null,
      tier: msg.author_tier || 'registered',
      donor_badge: msg.author_donor_badge || 'none',
    },
    group_id: msg.group_id || null,
    conversation_id: msg.conversation_id || null,
    parent_message_id: msg.parent_message_id || null,
    reply_to_id: msg.reply_to_id || null,
    type: msg.type || 'text',
    is_pinned: msg.is_pinned || false,
    edited_at: msg.edited_at || null,
    created_at: msg.created_at,
    reactions: options?.reactions || [],
    reply_to: options?.replyTo || null,
    thread_count: options?.threadCount || 0,
    thread_last_reply_at: options?.threadLastReplyAt || null,
  };
}

export const messageService = {

  async sendMessage(data: {
    content: string;
    authorId: string;
    groupId?: string;
    conversationId?: string;
    tier: string;
    parentMessageId?: string;
    replyToId?: string;
    ip: string;
  }) {
    if (!data.content || data.content.trim().length === 0) {
      throw new BadRequestError('Le message ne peut pas être vide');
    }
    if (data.content.length > VALIDATION.message.maxLength) {
      throw new BadRequestError(`Le message ne peut pas dépasser ${VALIDATION.message.maxLength} caractères`);
    }

    const allowed = await checkRateLimit(data.authorId, data.tier);
    if (!allowed) {
      const tierConfig = TIER_LIMITS[data.tier as keyof typeof TIER_LIMITS];
      const seconds = Math.ceil((tierConfig?.rateLimitMs || 10000) / 1000);
      throw new RateLimitError(`Veuillez attendre ${seconds}s entre chaque message`);
    }

    if (data.groupId) {
      const group = await groupRepository.findById(data.groupId);
      if (!group) throw new BadRequestError('Salon introuvable');
      if (group.status !== 'active') throw new BadRequestError('Salon archivé ou inactif');
      if (group.type === 'private') {
        const isMember = await groupRepository.isMember(data.groupId, data.authorId);
        if (!isMember) throw new ForbiddenError('Non membre du salon privé');
      }
    }

    if (data.conversationId) {
      const isParticipant = await conversationRepository.isParticipant(data.conversationId, data.authorId);
      if (!isParticipant) throw new ForbiddenError('Non participant de cette conversation');
    }

    const modResult = await moderationService.checkMessage({
      content: data.content,
      userId: data.authorId,
      groupId: data.groupId || data.conversationId || 'dm',
    });
    if (!modResult.allowed) {
      throw new BadRequestError(modResult.reason || 'Message bloqué');
    }

    if (data.replyToId) {
      const replyTo = await messageRepository.findById(data.replyToId);
      if (!replyTo) throw new BadRequestError('Message cité introuvable');
    }
    if (data.parentMessageId) {
      const parent = await messageRepository.findById(data.parentMessageId);
      if (!parent) throw new BadRequestError('Message parent introuvable');
    }

    const message = await messageRepository.create({
      content: data.content.trim(),
      author_id: data.authorId,
      group_id: data.groupId || undefined,
      conversation_id: data.conversationId || undefined,
      parent_message_id: data.parentMessageId,
      reply_to_id: data.replyToId,
      type: 'text',
      ip_address: data.ip,
    });

    if (data.groupId) await groupRepository.updateLastMessage(data.groupId);
    if (data.conversationId) await conversationRepository.updateLastMessage(data.conversationId);

    // ⭐ Récupérer le message AVEC l'auteur (JOIN users)
    const fullMessage = await messageRepository.findByIdWithAuthor(message.id);

    await logAudit('message_send', data.ip, data.authorId, {
      message_id: message.id, group_id: data.groupId, conversation_id: data.conversationId,
    });

    // Charger les données reply_to si présent
    let replyToData = null;
    if (data.replyToId) {
      const replies = await messageRepository.getReplyToData([data.replyToId]);
      replyToData = replies[data.replyToId] || null;
    }

    // ⭐ Retourner le message FORMATÉ (avec author: { id, username, ... })
    return formatMessage(fullMessage, {
      reactions: [],
      replyTo: replyToData,
      threadCount: 0,
      threadLastReplyAt: null,
    });
  },

  async getGroupMessages(params: {
    groupId: string;
    limit?: number;
    before?: string;
    currentUserId?: string;
  }) {
    const messages = await messageRepository.findByGroup({
      groupId: params.groupId,
      limit: params.limit || 50,
      before: params.before,
    });

    const messageIds = messages.map(m => m.id);
    const [allReactions, threadCounts, replyToData] = await Promise.all([
      reactionRepository.getForMessages(messageIds),
      messageRepository.getThreadCounts(messageIds),
      messageRepository.getReplyToData(messages.filter(m => m.reply_to_id).map(m => m.reply_to_id!)),
    ]);

    return messages.map(msg => formatMessage(msg, {
      reactions: (allReactions[msg.id] || []).map(r => ({
        emoji: r.emoji, count: r.count,
        reacted: params.currentUserId ? r.users.includes(params.currentUserId) : false,
      })),
      replyTo: msg.reply_to_id ? (replyToData[msg.reply_to_id] || null) : null,
      threadCount: threadCounts[msg.id]?.count || 0,
      threadLastReplyAt: threadCounts[msg.id]?.lastReplyAt || null,
    }));
  },

  async getConversationMessages(params: {
    conversationId: string;
    limit?: number;
    before?: string;
    currentUserId?: string;
  }) {
    const messages = await messageRepository.findByConversation({
      conversationId: params.conversationId,
      limit: params.limit || 50,
      before: params.before,
    });

    const messageIds = messages.map(m => m.id);
    const [allReactions, replyToData] = await Promise.all([
      reactionRepository.getForMessages(messageIds),
      messageRepository.getReplyToData(messages.filter(m => m.reply_to_id).map(m => m.reply_to_id!)),
    ]);

    return messages.map(msg => formatMessage(msg, {
      reactions: (allReactions[msg.id] || []).map(r => ({
        emoji: r.emoji, count: r.count,
        reacted: params.currentUserId ? r.users.includes(params.currentUserId) : false,
      })),
      replyTo: msg.reply_to_id ? (replyToData[msg.reply_to_id] || null) : null,
    }));
  },

  async getThreadMessages(parentMessageId: string, currentUserId?: string) {
    const messages = await messageRepository.findThreadMessages(parentMessageId);
    const messageIds = messages.map(m => m.id);
    const allReactions = await reactionRepository.getForMessages(messageIds);

    return messages.map(msg => formatMessage(msg, {
      reactions: (allReactions[msg.id] || []).map(r => ({
        emoji: r.emoji, count: r.count,
        reacted: currentUserId ? r.users.includes(currentUserId) : false,
      })),
    }));
  },
};
