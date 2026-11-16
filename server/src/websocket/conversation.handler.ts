/**
 * websocket/conversation.handler.ts — FIXED: unhide la conv quand un message arrive
 */
import { Server as SocketIOServer } from 'socket.io';
import { AppError } from '../utils/errors';
import type { AuthenticatedSocket } from './index';
import { messageService } from '../services/message.service';
import { conversationRepository } from '../repositories/conversation.repository';

export function registerConversationHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const { userId, username, tier } = socket.user;
  const ip = socket.userIp;

  socket.on('conversation:join', async (data: { conversation_id: string }, callback?: (res: any) => void) => {
    try {
      const isParticipant = await conversationRepository.isParticipant(data.conversation_id, userId);
      if (!isParticipant) { callback?.({ success: false, error: 'Non participant' }); return; }
      socket.join(`conv:${data.conversation_id}`);
      callback?.({ success: true });
    } catch (error: any) { callback?.({ success: false, error: publicError(error) }); }
  });

  socket.on('dm:send', async (data: {
    conversation_id: string;
    content: string;
    reply_to_id?: string;
  }, callback?: (res: any) => void) => {
    try {
      const isParticipant = await conversationRepository.isParticipant(data.conversation_id, userId);
      if (!isParticipant) { callback?.({ success: false, error: 'Non participant' }); return; }

      const message = await messageService.sendMessage({
        content: data.content, authorId: userId,
        conversationId: data.conversation_id, tier, replyToId: data.reply_to_id, ip,
      });

      await conversationRepository.updateLastMessage(data.conversation_id);

      // ⭐ Rendre la conversation visible pour TOUS les participants
      // Si l'autre avait masqué la conv, elle réapparaît
      await conversationRepository.unhideForAll(data.conversation_id);

      // Broadcast aux deux participants
      io.to(`conv:${data.conversation_id}`).emit('dm:new', {
        ...message, conversation_id: data.conversation_id,
      });

      // L'autre participant
      const other = await conversationRepository.getOtherParticipant(data.conversation_id, userId);
      if (other) {
        // S'assurer qu'il est dans la room
        const otherSockets = await io.in(`user:${other.id}`).fetchSockets();
        for (const s of otherSockets) s.join(`conv:${data.conversation_id}`);

        // Notifier pour rafraîchir la liste (la conv va réapparaître si masquée)
        io.to(`user:${other.id}`).emit('conversations:updated');

        io.to(`user:${other.id}`).emit('notification:new', {
          type: 'dm', title: `${username}`,
          content: data.content.substring(0, 100),
          reference_type: 'conversation', reference_id: data.conversation_id,
          created_at: new Date().toISOString(),
        });
      }

      io.to(`user:${userId}`).emit('conversations:updated');
      callback?.({ success: true, message });
    } catch (error: any) {
      console.error(`⚠️ [WS] dm:send erreur (${username}):`, error.message);
      callback?.({ success: false, error: publicError(error) });
    }
  });

  socket.on('conversation:read', async (data: { conversation_id: string }) => {
    try {
      // 🔐 Seul un participant peut marquer la conversation comme lue (évite les faux accusés de lecture)
      if (!data?.conversation_id || !(await conversationRepository.isParticipant(data.conversation_id, userId))) return;
      await conversationRepository.markAsRead(data.conversation_id, userId);
      const other = await conversationRepository.getOtherParticipant(data.conversation_id, userId);
      if (other) {
        io.to(`user:${other.id}`).emit('conversation:read_update', {
          conversation_id: data.conversation_id, user_id: userId, last_read_at: new Date().toISOString(),
        });
      }
    } catch (error: any) { console.error(`⚠️ conversation:read erreur:`, error.message); }
  });
}

/** 🔐 Seules nos erreurs métier (AppError) sont montrées au client ; le reste reste dans les logs serveur */
function publicError(error: any): string {
  return error instanceof AppError ? error.message : 'Erreur serveur';
}
