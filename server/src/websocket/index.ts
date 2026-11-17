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
import { isBanActive, isAccessRevoked } from '../services/accessRevocation.service';
import { COOKIE, readCookie } from '../utils/authCookies';

interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
  userIp: string;
}

export function setupWebSocket(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    try {
      // 🔐 Jeton d'accès lu dans le cookie httpOnly envoyé avec la poignée de main
      // (ou dans auth.token pour les outils / tests)
      const token = readCookie(socket.handshake.headers.cookie, COOKIE.access)
        || (typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined);
      if (!token) return next(new Error('Token manquant'));
      const payload = verifyAccessToken(token);
      const user = await userRepository.findById(payload.userId);
      if (!user) return next(new Error('Utilisateur introuvable'));
      if (isBanActive(user) || await isAccessRevoked(user.id)) return next(new Error('Compte suspendu'));
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

    // Handlers — 🐛 enregistrés AVANT toute attente (base, Redis) : avant, un événement envoyé
    // dès la connexion (ex. group:join à l'ouverture d'un salon) arrivait trop tôt et était perdu.
    registerMessageHandlers(io, socket);
    registerGroupHandlers(io, socket, socket.user);
    registerReactionHandlers(io, socket);
    registerConversationHandlers(io, socket);

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

    // ⭐ Présence : stocker dans Redis
    await redis.hset('presence', userId, JSON.stringify({ socketId: socket.id, username, tier, connectedAt: Date.now() }));
    await userRepository.update(userId, { last_seen_at: new Date().toISOString(), last_ip: socket.userIp } as any);
    socket.broadcast.emit('presence:update', { user_id: userId, status: 'online' });

    // ⭐ Heartbeat 60s : maintient last_seen_at à jour pour les utilisateurs actifs
    // Sans ça, après 5min, last_seen_at devient vieux → MembersPanel les affiche offline
    const heartbeatInterval = setInterval(async () => {
      if (!socket.connected) { clearInterval(heartbeatInterval); return; }
      try {
        await userRepository.update(userId, { last_seen_at: new Date().toISOString() } as any);
      } catch { clearInterval(heartbeatInterval); }
    }, 60_000);

    // ⭐ Logout explicite : le client émet 'user:logout' AVANT de fermer la connexion
    // IMPORTANT : on met last_seen_at = il y a 10min (PAS NOW)
    // Si on met NOW, le MembersPanel voit un timestamp récent → croit que l'user est online
    socket.on('user:logout', async () => {
      clearInterval(heartbeatInterval);
      await redis.hdel('presence', userId);
      // last_seen_at = 10min dans le passé → MembersPanel voit timestamp > 5min → offline ✅
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await userRepository.update(userId, { last_seen_at: tenMinAgo } as any);
      socket.broadcast.emit('presence:update', {
        user_id: userId,
        status: 'offline',
        last_seen_at: tenMinAgo,
      });
      console.log(`🚪 [WS] ${username} déconnexion volontaire`);
    });

    // ⭐ Déconnexion réseau (fermeture onglet, perte connexion, etc.)
    socket.on('disconnect', async (reason) => {
      console.log(`👋 [WS] ${username} déconnecté (${reason})`);
      clearInterval(heartbeatInterval);

      const otherSockets = await io.in(`user:${userId}`).fetchSockets();
      const hasOtherConnections = otherSockets.length > 0;

      if (!hasOtherConnections) {
        await redis.hdel('presence', userId);
        // Même principe : timestamp dans le passé pour éviter les faux positifs
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await userRepository.update(userId, { last_seen_at: tenMinAgo } as any);
        socket.broadcast.emit('presence:update', {
          user_id: userId,
          status: 'offline',
          last_seen_at: tenMinAgo,
        });
        console.log(`   → ${username} est maintenant hors ligne`);
      } else {
        console.log(`   → ${username} a encore ${otherSockets.length} connexion(s) active(s)`);
      }
    });
  });
}

export type { AuthenticatedSocket };
