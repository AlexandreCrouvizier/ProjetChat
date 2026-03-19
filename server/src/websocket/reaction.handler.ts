/**
 * websocket/reaction.handler.ts — Réactions emoji en temps réel
 * 
 * Événements :
 *   reaction:toggle → Client ajoute/retire une réaction → broadcast mise à jour
 * 
 * Règles par tier :
 *   - Invité (A) : uniquement 👍 et 👎
 *   - Inscrit (B) / Premium (C) : tous les emojis
 */

import { Server as SocketIOServer } from 'socket.io';
import type { AuthenticatedSocket } from './index';
import { reactionRepository } from '../repositories/reaction.repository';
import { messageRepository } from '../repositories/message.repository';
import { TIER_LIMITS } from '../../../shared/constants';

// Emojis autorisés pour les invités
const GUEST_EMOJIS = ['👍', '👎'];

export function registerReactionHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const { userId, tier } = socket.user;

  /**
   * reaction:toggle — Ajouter ou retirer une réaction
   * 
   * Si l'utilisateur a déjà réagi avec cet emoji → retirer
   * Sinon → ajouter
   * Dans les deux cas → broadcast la liste complète des réactions du message
   */
  socket.on('reaction:toggle', async (data: {
    message_id: string;
    emoji: string;
  }, callback?: (res: any) => void) => {
    try {
      const { message_id, emoji } = data;

      // 1. Vérifier les permissions par tier
      if (tier === 'guest') {
        const tierConfig = TIER_LIMITS.guest;
        if (!tierConfig.allowedReactions.includes(emoji)) {
          callback?.({
            success: false,
            error: `Les invités ne peuvent utiliser que ${GUEST_EMOJIS.join(' et ')}`,
          });
          return;
        }
      }

      // 2. Vérifier que le message existe
      const message = await messageRepository.findById(message_id);
      if (!message) {
        callback?.({ success: false, error: 'Message introuvable' });
        return;
      }

      // 3. Toggle la réaction (ajouter ou retirer)
      const action = await reactionRepository.toggle(message_id, userId, emoji);

      // 4. Récupérer le résumé complet des réactions du message
      const reactions = await reactionRepository.getForMessage(message_id);

      // 5. Formater pour le broadcast (ajouter "reacted" pour chaque client)
      // On broadcast les données brutes, chaque client déterminera "reacted" côté frontend
      const reactionData = {
        message_id,
        reactions: reactions.map(r => ({
          emoji: r.emoji,
          count: r.count,
          users: r.users,  // Le frontend comparera avec son propre userId
        })),
      };

      // 6. Broadcast à la room appropriée (groupe ou conversation)
      if (message.group_id) {
        io.to(`group:${message.group_id}`).emit('reaction:update', reactionData);
      } else if (message.conversation_id) {
        io.to(`conv:${message.conversation_id}`).emit('reaction:update', reactionData);
      }

      callback?.({ success: true, action });

    } catch (error: any) {
      console.error('⚠️ [WS] reaction:toggle erreur:', error.message);
      callback?.({ success: false, error: error.message });
    }
  });
}
