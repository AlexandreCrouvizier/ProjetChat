/**
 * services/message.service.ts — Phase 4.1 : support médias (image, file, gif, link preview)
 *
 * Ajouts :
 *   - formatMessage : champs file_url, gif_url, link_preview
 *   - sendMessage : accepte type, file_url, gif_url
 *                   détecte automatiquement les URLs dans les messages texte
 *                   et génère un link_preview côté serveur
 */

import { messageRepository } from '../repositories/message.repository';
import { groupRepository } from '../repositories/group.repository';
import { reactionRepository } from '../repositories/reaction.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { userRepository } from '../repositories/user.repository';
import { moderationService } from './moderation.service';
import { linkPreviewService } from './linkPreview.service';
import { checkRateLimit } from '../middleware/rateLimit.middleware';
import { logAudit } from '../middleware/audit.middleware';
import { BadRequestError, ForbiddenError, RateLimitError } from '../utils/errors';
import { VALIDATION, TIER_LIMITS } from '../../../shared/constants';
import { db } from '../config/database';

// 🔐 Types de message qu'un client a le droit d'envoyer ('system' est réservé au serveur)
const CLIENT_MESSAGE_TYPES = ['text', 'image', 'file', 'gif'];
// 🔐 Les médias doivent provenir de NOS uploads (nom = UUID généré par le serveur)
const IMAGE_URL_RE = /^\/uploads\/images\/[0-9a-f-]{36}\.(webp|jpe?g|png|gif)$/i;
const FILE_URL_RE  = /^\/uploads\/files\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i;

function isSafeHttpsUrl(value: unknown, maxLength = 1000): value is string {
  if (typeof value !== 'string' || value.length > maxLength) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

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
    // ⭐ Phase 4.1 — Médias
    file_url: msg.file_url || null,
    gif_url: msg.gif_url || null,
    link_preview: msg.link_preview || null,
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
    type?: string;
    fileUrl?: string;
    gifUrl?: string;
    ip: string;
  }) {
    const messageType = data.type || 'text';

    // 🔐 Validation stricte des champs envoyés par le client (WebSocket = données non fiables).
    // Avant : file_url / gif_url / type étaient libres → un invité pouvait envoyer une « image »
    // pointant vers n'importe quel site (traçage d'IP) ou un lien javascript: (vol de session).
    if (!CLIENT_MESSAGE_TYPES.includes(messageType)) {
      throw new BadRequestError('Type de message invalide');
    }
    if (data.content !== undefined && data.content !== null && typeof data.content !== 'string') {
      throw new BadRequestError('Contenu invalide');
    }
    if (messageType === 'image') {
      if (data.tier === 'guest') throw new ForbiddenError('Le partage de médias est réservé aux membres inscrits.');
      if (!data.fileUrl || !IMAGE_URL_RE.test(data.fileUrl)) throw new BadRequestError('Image invalide');
    }
    if (messageType === 'file') {
      if (data.tier !== 'premium') throw new ForbiddenError('Le partage de fichiers est réservé aux membres Premium.');
      if (!data.fileUrl || !FILE_URL_RE.test(data.fileUrl)) throw new BadRequestError('Fichier invalide');
    }
    if (messageType === 'gif' && !isSafeHttpsUrl(data.gifUrl)) {
      throw new BadRequestError('GIF invalide');
    }
    // Un champ média ne peut accompagner que le type correspondant
    if (messageType !== 'image' && messageType !== 'file') data.fileUrl = undefined;
    if (messageType !== 'gif') data.gifUrl = undefined;

    // Validation contenu : obligatoire sauf pour image/gif/file
    if (messageType === 'text' && (!data.content || data.content.trim().length === 0)) {
      throw new BadRequestError('Le message ne peut pas être vide');
    }
    if (data.content && data.content.length > VALIDATION.message.maxLength) {
      throw new BadRequestError(`Le message ne peut pas dépasser ${VALIDATION.message.maxLength} caractères`);
    }
    // Validation présence du média selon le type
    if (messageType === 'image' && !data.fileUrl) throw new BadRequestError('URL image manquante');
    if (messageType === 'file'  && !data.fileUrl) throw new BadRequestError('URL fichier manquante');
    if (messageType === 'gif'   && !data.gifUrl)  throw new BadRequestError('URL GIF manquante');

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

      // ⭐ Vérification mute dans le salon
      const isMutedInGroup = await groupRepository.isMemberMuted(data.groupId, data.authorId);
      if (isMutedInGroup) {
        const err = new ForbiddenError('Vous êtes muté dans ce salon.');
        (err as any).muteData = { reason: 'Muté dans ce salon', expires_at: null, duration: '' };
        throw err;
      }
    }

    // ⭐ Vérification mute global
    const author = await userRepository.findById(data.authorId);
    if (author?.is_muted) {
      // Auto-démuter si expiré
      if (author.mute_expires_at && new Date(author.mute_expires_at) < new Date()) {
        await userRepository.update(data.authorId, { is_muted: false, mute_expires_at: null } as any);
      } else {
        // Récupérer la raison du dernier mute depuis moderation_actions
        const lastMute = await db('moderation_actions')
          .where({ target_user_id: data.authorId, action: 'mute' })
          .orderBy('created_at', 'desc')
          .first();
        const err = new ForbiddenError('Vous êtes actuellement muté.');
        (err as any).muteData = {
          reason: lastMute?.reason || 'Muté par la modération',
          expires_at: author.mute_expires_at || null,
          duration: lastMute?.duration || '',
        };
        throw err;
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

    // 🔐 Le message cité / le fil parent doivent appartenir au MÊME salon ou à la même conversation
    // (sinon on pourrait faire apparaître le contenu d'un salon privé ou d'un DM dans un salon public)
    const sameScope = (m: any) =>
      (m.group_id || null) === (data.groupId || null) &&
      (m.conversation_id || null) === (data.conversationId || null);
    if (data.replyToId) {
      const replyTo = await messageRepository.findById(data.replyToId);
      if (!replyTo || !sameScope(replyTo)) throw new BadRequestError('Message cité introuvable');
    }
    if (data.parentMessageId) {
      const parent = await messageRepository.findById(data.parentMessageId);
      if (!parent || !sameScope(parent)) throw new BadRequestError('Message parent introuvable');
    }

    const message = await messageRepository.create({
      content: data.content ? data.content.trim() : '',
      author_id: data.authorId,
      group_id: data.groupId || undefined,
      conversation_id: data.conversationId || undefined,
      parent_message_id: data.parentMessageId,
      reply_to_id: data.replyToId,
      type: messageType,
      file_url: data.fileUrl || undefined,
      gif_url: data.gifUrl || undefined,
      ip_address: data.ip,
    });

    if (data.groupId) await groupRepository.updateLastMessage(data.groupId);
    if (data.conversationId) await conversationRepository.updateLastMessage(data.conversationId);

    // ⭐ Détection link preview pour les messages texte (asynchrone, ne bloque pas)
    let linkPreview = null;
    if (messageType === 'text' && data.content) {
      const detectedUrl = linkPreviewService.detectUrl(data.content);
      if (detectedUrl) {
        // Fire-and-forget : on tente de générer la preview en arrière-plan
        // On attend max 4s pour ne pas trop retarder la réponse socket
        try {
          const previewPromise = linkPreviewService.fetchPreview(detectedUrl);
          const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 4000));
          linkPreview = await Promise.race([previewPromise, timeoutPromise]);
          if (linkPreview) {
            // Sauvegarder en BDD
            await db('messages').where({ id: message.id }).update({
              link_preview: JSON.stringify(linkPreview),
            });
          }
        } catch { /* Preview optionnelle, ne pas planter */ }
      }
    }

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
    return formatMessage({ ...fullMessage, link_preview: linkPreview }, {
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
