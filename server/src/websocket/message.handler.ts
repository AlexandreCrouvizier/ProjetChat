/**
 * websocket/message.handler.ts — Phase 4.1 : support médias (image, file, gif)
 *
 * L'événement message:send accepte maintenant :
 *   type?     : 'text' | 'image' | 'file' | 'gif' | 'audio' (défaut 'text')
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
    audio_duration_ms?: number;
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
        audioDurationMs: data.audio_duration_ms,
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

  // ── Indicateur « en train d'écrire » ──────────────────────────────────────
  // 🔐 Avant : aucun contrôle → n'importe qui pouvait afficher « X écrit… » dans un salon privé
  // dont il n'est pas membre, et chaque événement lançait un KEYS sur tout Redis (bloquant).
  // Maintenant : identifiant valide + socket réellement dans le salon (rejoint après contrôle d'accès)
  // + 1 événement par seconde maximum, et un ensemble Redis par salon (plus de KEYS).
  let lastTypingAt = 0;

  const handleTyping = async (data: { group_id?: unknown } | undefined, typing: boolean) => {
    try {
      if (tier === 'guest') return;
      const groupId = data?.group_id;
      if (typeof groupId !== 'string' || !UUID_RE.test(groupId)) return;
      const room = `group:${groupId}`;
      if (!socket.rooms.has(room)) return;
      if (typing) {
        const now = Date.now();
        if (now - lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
        lastTypingAt = now;
      }
      const users = await updateTyping(groupId, userId, username, typing);
      socket.to(room).emit('typing:update', { group_id: groupId, users });
    } catch (error: any) {
      console.error(`⚠️ [WS] typing (${username}):`, error?.message || error);
    }
  };

  socket.on('typing:start', (data: { group_id?: unknown }) => { void handleTyping(data, true); });
  socket.on('typing:stop',  (data: { group_id?: unknown }) => { void handleTyping(data, false); });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPING_TTL_MS = 3000;           // « en train d'écrire » expire seul après 3 s sans nouvel événement
const TYPING_MIN_INTERVAL_MS = 1000;  // anti-spam

/**
 * Met à jour la liste des personnes qui écrivent dans un salon et la renvoie.
 * Un ensemble trié Redis par salon : membre = « id|pseudo », score = instant d'expiration.
 */
async function updateTyping(groupId: string, userId: string, username: string, typing: boolean) {
  const key = `typing:${groupId}`;
  const member = `${userId}|${username}`;
  const now = Date.now();
  const tx = redis.multi();
  if (typing) tx.zadd(key, now + TYPING_TTL_MS, member);
  else tx.zrem(key, member);
  tx.zremrangebyscore(key, '-inf', now);
  tx.zrange(key, 0, 49);
  tx.pexpire(key, TYPING_TTL_MS * 2);
  const results = await tx.exec();
  const members = (results?.[2]?.[1] as string[] | undefined) ?? []; // 3ᵉ commande = zrange
  return members.map((m) => {
    const sep = m.indexOf('|');
    return { id: m.slice(0, sep), username: m.slice(sep + 1) };
  });
}

/** 🔐 Seules nos erreurs métier (AppError) sont montrées au client ; le reste reste dans les logs serveur */
function publicError(error: any): string {
  return error instanceof AppError ? error.message : 'Erreur serveur';
}
