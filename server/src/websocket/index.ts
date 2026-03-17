/**
 * websocket/index.ts — Configuration Socket.io
 * 
 * C'est ici que tout le temps réel se passe :
 *   1. Authentification WebSocket (vérifie le JWT à la connexion)
 *   2. Rejoindre les rooms des groupes de l'utilisateur
 *   3. Enregistrement des handlers (messages, typing, etc.)
 * 
 * Concept clé — Les "rooms" Socket.io :
 *   Chaque groupe est une room : "group:uuid"
 *   Chaque utilisateur a sa room perso : "user:uuid" (pour les notifs)
 *   Quand on envoie un message dans un groupe, on broadcast à la room du groupe
 *   → Tous les membres connectés reçoivent le message instantanément
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';
import { getIpFromSocket } from '../utils/ip';
import { groupRepository } from '../repositories/group.repository';
import { userRepository } from '../repositories/user.repository';
import { redis } from '../config/redis';
import { registerMessageHandlers } from './message.handler';
import { registerGroupHandlers } from './group.handler';

// Étend le type Socket pour y attacher les données utilisateur
// Comme req.user en Express, mais pour les WebSockets
interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
  userIp: string;
}

export function setupWebSocket(io: SocketIOServer): void {

  // ===== MIDDLEWARE AUTH WEBSOCKET =====
  // Exécuté AVANT chaque connexion. Si le token est invalide, la connexion est refusée.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Token d\'authentification manquant'));
      }

      // Vérifie le JWT
      const payload = verifyAccessToken(token);

      // Vérifie que l'utilisateur existe et n'est pas banni
      const user = await userRepository.findById(payload.userId);
      if (!user) {
        return next(new Error('Utilisateur introuvable'));
      }
      if (user.is_banned) {
        return next(new Error('Compte suspendu'));
      }

      // Attache les données utilisateur au socket
      (socket as AuthenticatedSocket).user = payload;
      (socket as AuthenticatedSocket).userIp = getIpFromSocket(socket);

      next();
    } catch (error: any) {
      next(new Error('Token invalide ou expiré'));
    }
  });

  // ===== CONNEXION =====
  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId, username, tier } = socket.user;

    console.log(`⚡ [WS] ${username} connecté (${tier}) — socket: ${socket.id}`);

    // 1. Rejoindre la room personnelle (pour les notifications ciblées)
    socket.join(`user:${userId}`);

    // 2. Rejoindre les rooms de tous les groupes de l'utilisateur
    try {
      const groupIds = await groupRepository.getGroupIdsForUser(userId);
      for (const groupId of groupIds) {
        socket.join(`group:${groupId}`);
      }
      console.log(`   → ${groupIds.length} room(s) rejointe(s)`);
    } catch (err) {
      console.error('⚠️ Erreur chargement des rooms:', err);
    }

    // 3. Marquer comme "en ligne" dans Redis
    await redis.hset('presence', userId, JSON.stringify({
      socketId: socket.id,
      username,
      tier,
      connectedAt: Date.now(),
    }));

    // 4. Mettre à jour last_seen_at en BDD
    await userRepository.update(userId, {
      last_seen_at: new Date().toISOString(),
      last_ip: socket.userIp,
    } as any);

    // 5. Broadcast "online" aux autres utilisateurs
    socket.broadcast.emit('presence:update', {
      user_id: userId,
      status: 'online',
    });

    // 6. Enregistrer les handlers d'événements
    registerMessageHandlers(io, socket);
    registerGroupHandlers(io, socket);

    // 7. Déconnexion
    socket.on('disconnect', async (reason) => {
      console.log(`👋 [WS] ${username} déconnecté (${reason})`);

      // Retirer de la présence Redis
      await redis.hdel('presence', userId);

      // Mettre à jour last_seen_at
      await userRepository.update(userId, {
        last_seen_at: new Date().toISOString(),
      } as any);

      // Broadcast "offline"
      socket.broadcast.emit('presence:update', {
        user_id: userId,
        status: 'offline',
        last_seen_at: new Date().toISOString(),
      });
    });
  });
}

export type { AuthenticatedSocket };
