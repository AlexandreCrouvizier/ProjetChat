/**
 * websocket/message.handler.ts — Phase 4.1 : support médias (image, file, gif)
 *
 * L'événement message:send accepte maintenant :
 *   type?     : 'text' | 'image' | 'file' | 'gif' (défaut 'text')
 *   file_url? : URL serveur pour les types image/file
 *   gif_url?  : URL Tenor pour le type gif
 */
import { Server as SocketIOServer } from 'socket.io';
import { AppError } from '../utils/errors';
import type { AuthenticatedSocket } from './index';
import { messageService } from '../services/message.service';
import { mentionService } from '../services/mention.service';
import { redis } from '../config/redis';

export function registerMessageHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const { userId, username, tier } = socket.user;
  const ip = socket.userIp;

  socket.on('message:send', async (data: {
    content: string;
    group_id: string;
    reply_to_id?: string;
    parent_message_id?: string;
    type?: string;
    file_url?: string;
    gif_url?: string;
  }, callback?: (response: any) => void) => {
    try {
      const message = await messageService.sendMessage({
        content: data.content || '',
        authorId: userId,
        groupId: data.group_id,
        tier,
        replyToId: data.reply_to_id,
        parentMessageId: data.parent_message_id,
        type: data.type || 'text',
        fileUrl: data.file_url,
        gifUrl: data.gif_url,
        ip,
      });

      // ⭐ Si c'est une réponse de thread → event séparé
      if (data.parent_message_id) {
        // Broadcast la réponse UNIQUEMENT pour les ThreadView ouverts
        io.to(`group:${data.group_id}`).emit('thread:new_reply', {
          parent_message_id: data.parent_message_id,
          message,
        });

        // Broadcast la mise à jour du compteur pour le message parent dans le flux principal
        io.to(`group:${data.group_id}`).emit('thread:count_update', {
          message_id: data.parent_message_id,
          thread_count_increment: 1,
          last_reply_at: message.created_at,
        });
      } else {
        // Message normal → broadcast dans le flux principal
        io.to(`group:${data.group_id}`).emit('message:new', message);
      }

      // Traiter les mentions
      try {
        const mentionedUsers = await mentionService.processMentions(data.content, userId);
        for (const mentioned of mentionedUsers) {
          io.to(`user:${mentioned.id}`).emit('notification:new', {
            type: 'mention',
            title: `${username} vous a mentionné`,
            content: data.content.substring(0, 80),
            reference_type: 'message',
            reference_id: message.id,
            created_at: new Date().toISOString(),
          });
        }
      } catch {}

      if (callback) callback({ success: true, message });
    } catch (error: any) {
      console.error(`⚠️ [WS] message:send erreur (${username}):`, error.message);
      // ⭐ Si erreur de mute, retourner les données enrichies (expires_at, reason)
      if (error.muteData) {
        if (callback) callback({
          success: false,
          error: error.message,
          muted: true,
          expires_at: error.muteData.expires_at,
          reason: error.muteData.reason,
        });
      } else {
        if (callback) callback({ success: false, error: publicError(error) });
      }
    }
  });

  // Typing
  socket.on('typing:start', async (data: { group_id: string }) => {
    if (tier === 'guest') return;
    await redis.setex(`typing:${data.group_id}:${userId}`, 3, username);
    const users = await getTypingUsers(data.group_id);
    socket.to(`group:${data.group_id}`).emit('typing:update', { group_id: data.group_id, users });
  });

  socket.on('typing:stop', async (data: { group_id: string }) => {
    if (tier === 'guest') return;
    await redis.del(`typing:${data.group_id}:${userId}`);
    const users = await getTypingUsers(data.group_id);
    socket.to(`group:${data.group_id}`).emit('typing:update', { group_id: data.group_id, users });
  });
}

async function getTypingUsers(groupId: string) {
  const keys = await redis.keys(`typing:${groupId}:*`);
  const users: Array<{ id: string; username: string }> = [];
  for (const key of keys) {
    const uname = await redis.get(key);
    if (uname) users.push({ id: key.split(':')[2], username: uname });
  }
  return users;
}

/** 🔐 Seules nos erreurs métier (AppError) sont montrées au client ; le reste reste dans les logs serveur */
function publicError(error: any): string {
  return error instanceof AppError ? error.message : 'Erreur serveur';
}
