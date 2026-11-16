/**
 * services/access.service.ts — Contrôle d'accès en lecture (salons, messages)
 *
 * 🔐 Avant : l'historique d'un salon PRIVÉ, sa liste de membres, ses détails et ses
 * fils de discussion étaient lisibles par n'importe qui connaissant l'identifiant du salon
 * (même sans être connecté, même après avoir été expulsé).
 *
 * Règle : salon privé → réservé aux membres. Message privé (DM) → réservé aux participants.
 * Un refus renvoie 404 (on ne confirme pas l'existence de la ressource).
 */
import { groupRepository } from '../repositories/group.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { messageRepository } from '../repositories/message.repository';
import { NotFoundError } from '../utils/errors';

export async function canReadGroup(group: { id: string; type: string } | null | undefined, userId?: string): Promise<boolean> {
  if (!group) return false;
  if (group.type !== 'private') return true;
  if (!userId) return false;
  return groupRepository.isMember(group.id, userId);
}

export async function assertCanReadGroup(groupId: string, userId?: string) {
  const group = await groupRepository.findById(groupId);
  if (!group || !(await canReadGroup(group, userId))) throw new NotFoundError('Salon introuvable');
  return group;
}

export async function assertCanReadMessage(messageId: string, userId?: string) {
  const message = await messageRepository.findById(messageId);
  if (!message) throw new NotFoundError('Message introuvable');
  if (message.group_id) {
    await assertCanReadGroup(message.group_id, userId);
  } else if (message.conversation_id) {
    if (!userId || !(await conversationRepository.isParticipant(message.conversation_id, userId))) {
      throw new NotFoundError('Message introuvable');
    }
  }
  return message;
}
