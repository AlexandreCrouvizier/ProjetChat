/**
 * websocket/index.ts — FIXED: nettoyage présence correct au disconnect/logout
 */
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken, type JwtPayload } from '../utils/jwt';
import { getIpFromSocket } from '../utils/ip';
import { groupRepository } from '../repositories/group.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { userRepository } from '../repositories/user.repository';
import { redis } from '../config/redis';
import { registerMessageHandlers } from './message.handler';
import { registerGroupHandlers } from './group.handler';
import { registerReactionHandlers } from './reaction.handler';
import { registerConversationHandlers } from './conversation.handler';

interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
  userIp: string;
}

export function setupWebSocket(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Token manquant'));
      const payload = verifyAccessToken(token);
      const user = await userRepository.findById(payload.userId);
      if (!user) return next(new Error('Utilisateur introuvable'));
      if (user.is_banned) return next(new Error('Compte suspendu'));
      (socket as AuthenticatedSocket).user = payload;
      (socket as AuthenticatedSocket).userIp = getIpFromSocket(socket);
      next();
    } catch { next(new Error('Token invalide ou expiré')); }
  });

  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId, username, tier } = socket.user;
    console.log(`⚡ [WS] ${username} connecté (${tier})`);

    // Room personnelle
    socket.join(`user:${userId}`);

    // Rooms des groupes
    try {
      const groupIds = await groupRepository.getGroupIdsForUser(userId);
      for (const gid of groupIds) socket.join(`group:${gid}`);
    } catch (err) { console.error('⚠️ rooms groupes:', err); }

    // Rooms des conversations privées
    try {
      const convIds = await conversationRepository.getConversationIdsForUser(userId);
      for (const cid of convIds) socket.join(`conv:${cid}`);
    } catch (err) { console.error('⚠️ rooms conversations:', err); }

    // ⭐ Présence : stocker avec le socketId pour gérer les multi-onglets
    await redis.hset('presence', userId, JSON.stringify({ socketId: socket.id, username, tier, connectedAt: Date.now() }));
    await userRepository.update(userId, { last_seen_at: new Date().toISOString(), last_ip: socket.userIp } as any);
    socket.broadcast.emit('presence:update', { user_id: userId, status: 'online' });

    // Handlers
    registerMessageHandlers(io, socket);
    registerGroupHandlers(io, socket, socket.user);
    registerReactionHandlers(io, socket);
    registerConversationHandlers(io, socket);

    // ⭐ Déconnexion — vérifier qu'il n'y a pas d'autre socket du même user
    socket.on('disconnect', async (reason) => {
      console.log(`👋 [WS] ${username} déconnecté (${reason})`);

      // Vérifier si l'utilisateur a encore d'autres sockets connectés
      const otherSockets = await io.in(`user:${userId}`).fetchSockets();
      const hasOtherConnections = otherSockets.length > 0;

      if (!hasOtherConnections) {
        // Plus aucune connexion → marquer offline
        await redis.hdel('presence', userId);
        await userRepository.update(userId, { last_seen_at: new Date().toISOString() } as any);
        socket.broadcast.emit('presence:update', { user_id: userId, status: 'offline', last_seen_at: new Date().toISOString() });
        console.log(`   → ${username} est maintenant hors ligne`);
      } else {
        console.log(`   → ${username} a encore ${otherSockets.length} connexion(s) active(s)`);
      }
    });
  });
}

export type { AuthenticatedSocket };
