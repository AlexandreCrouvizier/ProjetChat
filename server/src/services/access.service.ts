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
import type { Server as SocketIOServer } from 'socket.io';

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

/**
 * 🔐 Retire un utilisateur d'un salon EN TEMPS RÉEL (expulsion ou départ).
 * Avant : il était retiré de la base, mais ses connexions WebSocket restaient dans la « room »
 * du salon → un membre expulsé d'un salon privé continuait de recevoir tous les nouveaux messages
 * jusqu'à sa prochaine reconnexion.
 */
export async function removeUserFromGroupRoom(
  io: SocketIOServer | undefined,
  group: { id: string; type: string },
  userId: string,
  username?: string,
): Promise<void> {
  if (!io) return;
  const room = `group:${group.id}`;
  io.in(`user:${userId}`).socketsLeave(room);
  // Liste des membres à jour pour ceux qui restent
  io.to(room).emit('group:member_left', { group_id: group.id, user_id: userId, username: username ?? '' });
  // Salon privé : il disparaît de sa barre latérale (il n'y a plus accès)
  if (group.type === 'private') io.to(`user:${userId}`).emit('group:deleted', { group_id: group.id });
}
