/**
 * services/message.service.ts — Logique métier des messages (corrigé)
 * 
 * Utilise maintenant moderationService pour le filtrage.
 */

import { messageRepository } from '../repositories/message.repository';
import { groupRepository } from '../repositories/group.repository';
import { moderationService } from './moderation.service';
import { checkRateLimit } from '../middleware/rateLimit.middleware';
import { logAudit } from '../middleware/audit.middleware';
import { BadRequestError, ForbiddenError, RateLimitError } from '../utils/errors';
import { VALIDATION, TIER_LIMITS } from '../../../shared/constants';

export const messageService = {

  async sendMessage(data: {
    content: string;
    authorId: string;
    groupId: string;
    tier: string;
    parentMessageId?: string;
    replyToId?: string;
    ip: string;
  }) {
    // 1. Validation du contenu
    if (!data.content || data.content.trim().length === 0) {
      throw new BadRequestError('Le message ne peut pas être vide');
    }
    if (data.content.length > VALIDATION.message.maxLength) {
      throw new BadRequestError(`Le message ne peut pas dépasser ${VALIDATION.message.maxLength} caractères`);
    }

    // 2. Rate limiting
    const allowed = await checkRateLimit(data.authorId, data.tier);
    if (!allowed) {
      const tierConfig = TIER_LIMITS[data.tier as keyof typeof TIER_LIMITS];
      const seconds = Math.ceil((tierConfig?.rateLimitMs || 10000) / 1000);
      throw new RateLimitError(`Veuillez attendre ${seconds}s entre chaque message`);
    }

    // 3. Vérifier que le groupe existe et est actif
    const group = await groupRepository.findById(data.groupId);
    if (!group) throw new BadRequestError('Salon introuvable');
    if (group.status !== 'active') throw new BadRequestError('Ce salon est archivé ou inactif');

    // 4. Vérifier accès au groupe privé
    if (group.type === 'private') {
      const isMember = await groupRepository.isMember(data.groupId, data.authorId);
      if (!isMember) throw new ForbiddenError('Vous n\'êtes pas membre de ce salon privé');
    }

    // 5. ⭐ Filtre anti-spam + mots interdits (CORRIGÉ)
    const modResult = await moderationService.checkMessage({
      content: data.content,
      userId: data.authorId,
      groupId: data.groupId,
    });
    if (!modResult.allowed) {
      throw new BadRequestError(modResult.reason || 'Message bloqué par le filtre anti-spam');
    }

    // 6. Sauvegarder en BDD (avec IP — LCEN)
    const message = await messageRepository.create({
      content: data.content.trim(),
      author_id: data.authorId,
      group_id: data.groupId,
      parent_message_id: data.parentMessageId,
      reply_to_id: data.replyToId,
      type: 'text',
      ip_address: data.ip,
    });

    // 7. Mettre à jour last_message_at
    await groupRepository.updateLastMessage(data.groupId);

    // 8. Récupérer le message complet
    const fullMessage = await messageRepository.findByIdWithAuthor(message.id);

    // 9. Log LCEN
    await logAudit('message_send', data.ip, data.authorId, {
      message_id: message.id,
      group_id: data.groupId,
    });

    return fullMessage;
  },

  async getGroupMessages(params: {
    groupId: string;
    limit?: number;
    before?: string;
    userTier?: string;
  }) {
    const messages = await messageRepository.findByGroup({
      groupId: params.groupId,
      limit: params.limit || 50,
      before: params.before,
    });

    return messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      author: {
        id: msg.author_id,
        username: msg.author_username,
        avatar_url: msg.author_avatar_url,
        tier: msg.author_tier,
        donor_badge: msg.author_donor_badge,
      },
      group_id: msg.group_id,
      parent_message_id: msg.parent_message_id,
      reply_to_id: msg.reply_to_id,
      type: msg.type,
      is_pinned: msg.is_pinned,
      edited_at: msg.edited_at,
      created_at: msg.created_at,
    }));
  },
};
