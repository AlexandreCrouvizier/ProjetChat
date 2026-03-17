/**
 * websocket/message.handler.ts — Gestion des messages en temps réel
 * 
 * Événements gérés :
 *   message:send    → Client envoie un message → sauvegarde + broadcast
 *   typing:start    → Client commence à taper → broadcast aux autres
 *   typing:stop     → Client arrête de taper → broadcast aux autres
 * 
 * Le flux d'un message :
 *   1. Client émet "message:send" avec le contenu
 *   2. Serveur valide, filtre, sauvegarde en BDD (avec IP)
 *   3. Serveur broadcast "message:new" à toute la room du groupe
 *   4. Serveur retourne un ACK au client (callback)
 *   5. Le client affiche ✓ quand l'ACK arrive
 */

import { Server as SocketIOServer } from 'socket.io';
import type { AuthenticatedSocket } from './index';
import { messageService } from '../services/message.service';
import { redis } from '../config/redis';

export function registerMessageHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const { userId, username, tier } = socket.user;
  const ip = socket.userIp;

  /**
   * message:send — Le client envoie un message
   * 
   * Le callback permet au client de savoir si le message a été reçu.
   * Socket.io supporte les callbacks nativement :
   *   socket.emit('message:send', data, (response) => { ... })
   */
  socket.on('message:send', async (data: {
    content: string;
    group_id: string;
    reply_to_id?: string;
    parent_message_id?: string;
  }, callback?: (response: any) => void) => {
    try {
      // Appelle le service qui fait toute la logique
      // (validation, rate limit, filtre, sauvegarde, log LCEN)
      const message = await messageService.sendMessage({
        content: data.content,
        authorId: userId,
        groupId: data.group_id,
        tier,
        replyToId: data.reply_to_id,
        parentMessageId: data.parent_message_id,
        ip,
      });

      // Broadcast le message à TOUS les membres du groupe
      // (y compris l'émetteur, qui recevra aussi le message avec l'ID serveur)
      io.to(`group:${data.group_id}`).emit('message:new', message);

      // ACK au client : "message bien reçu"
      if (callback) {
        callback({ success: true, message });
      }
    } catch (error: any) {
      console.error(`⚠️ [WS] message:send erreur (${username}):`, error.message);
      
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  /**
   * typing:start — L'utilisateur commence à taper
   * 
   * On stocke dans Redis avec un TTL de 3 secondes.
   * Si le client n'envoie pas de nouveau "typing:start" dans les 3s,
   * Redis supprime automatiquement l'entrée (l'utilisateur a arrêté de taper).
   * 
   * Côté client, on throttle l'émission à 1 fois toutes les 2 secondes.
   */
  socket.on('typing:start', async (data: { group_id: string }) => {
    // Seuls les inscrits et premium ont le typing indicator
    if (tier === 'guest') return;

    const key = `typing:${data.group_id}:${userId}`;
    await redis.setex(key, 3, username);  // TTL 3 secondes

    // Récupère tous les utilisateurs en train de taper dans ce groupe
    const typingUsers = await getTypingUsers(data.group_id);

    // Broadcast aux AUTRES membres (pas à soi-même)
    socket.to(`group:${data.group_id}`).emit('typing:update', {
      group_id: data.group_id,
      users: typingUsers,
    });
  });

  /**
   * typing:stop — L'utilisateur arrête de taper
   */
  socket.on('typing:stop', async (data: { group_id: string }) => {
    if (tier === 'guest') return;

    const key = `typing:${data.group_id}:${userId}`;
    await redis.del(key);

    const typingUsers = await getTypingUsers(data.group_id);

    socket.to(`group:${data.group_id}`).emit('typing:update', {
      group_id: data.group_id,
      users: typingUsers,
    });
  });
}

/**
 * Récupère la liste des utilisateurs en train de taper dans un groupe
 * Scanne les clés Redis "typing:{groupId}:*"
 */
async function getTypingUsers(groupId: string): Promise<Array<{ id: string; username: string }>> {
  const pattern = `typing:${groupId}:*`;
  const keys = await redis.keys(pattern);

  const users: Array<{ id: string; username: string }> = [];
  for (const key of keys) {
    const username = await redis.get(key);
    if (username) {
      const id = key.split(':')[2];  // typing:{groupId}:{userId}
      users.push({ id, username });
    }
  }

  return users;
}
