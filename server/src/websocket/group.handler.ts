/**
 * websocket/group.handler.ts — Gestion des groupes en temps réel
 * 
 * Événements :
 *   group:join    → Utilisateur rejoint un salon (rejoint la room Socket.io)
 *   group:leave   → Utilisateur quitte un salon
 */

import { Server as SocketIOServer } from 'socket.io';
import type { AuthenticatedSocket } from './index';
import { groupRepository } from '../repositories/group.repository';
import { TIER_LIMITS } from '../../../shared/constants';

export function registerGroupHandlers(io: SocketIOServer, socket: AuthenticatedSocket): void {
  const { userId, username, tier } = socket.user;

  /**
   * group:join — Rejoindre un salon
   * 
   * Deux choses se passent :
   *   1. En BDD : ajout dans group_members (persistant)
   *   2. En Socket.io : socket.join("group:uuid") (temps réel)
   */
  socket.on('group:join', async (data: { group_id: string }, callback?: (res: any) => void) => {
    try {
      const group = await groupRepository.findById(data.group_id);
      if (!group) {
        callback?.({ success: false, error: 'Salon introuvable' });
        return;
      }

      // Vérifier si déjà membre
      const alreadyMember = await groupRepository.isMember(data.group_id, userId);
      if (alreadyMember) {
        // Déjà membre → juste rejoindre la room Socket.io (reconnexion)
        socket.join(`group:${data.group_id}`);
        callback?.({ success: true, already_member: true });
        return;
      }

      // Vérifier les quotas de salons publics rejoints
      if (group.type === 'public') {
        const tierConfig = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
        const maxGroups = tierConfig?.maxPublicGroups ?? 3;
        
        if (maxGroups !== Infinity) {
          const joinedCount = await groupRepository.countJoinedPublicByUser(userId);
          if (joinedCount >= maxGroups) {
            callback?.({
              success: false,
              error: `Limite atteinte : ${maxGroups} salons publics maximum pour votre tier (${tier})`,
            });
            return;
          }
        }
      }

      // Vérifier que c'est un salon public (les privés nécessitent une invitation)
      if (group.type === 'private') {
        callback?.({ success: false, error: 'Ce salon est privé. Vous avez besoin d\'une invitation.' });
        return;
      }

      // Ajouter en BDD
      await groupRepository.addMember(data.group_id, userId, 'member');
      await groupRepository.incrementMemberCount(data.group_id);

      // Rejoindre la room Socket.io
      socket.join(`group:${data.group_id}`);

      // Broadcast aux membres du groupe : "Paul a rejoint le salon"
      io.to(`group:${data.group_id}`).emit('group:member_joined', {
        group_id: data.group_id,
        user: { id: userId, username, tier },
      });

      console.log(`📥 [WS] ${username} a rejoint #${group.name}`);
      callback?.({ success: true });
    } catch (error: any) {
      console.error(`⚠️ [WS] group:join erreur:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * group:leave — Quitter un salon
   */
  socket.on('group:leave', async (data: { group_id: string }, callback?: (res: any) => void) => {
    try {
      const isMember = await groupRepository.isMember(data.group_id, userId);
      if (!isMember) {
        callback?.({ success: false, error: 'Vous n\'êtes pas membre de ce salon' });
        return;
      }

      // Retirer de la BDD
      await groupRepository.removeMember(data.group_id, userId);
      await groupRepository.decrementMemberCount(data.group_id);

      // Broadcast AVANT de quitter la room (sinon on ne reçoit pas son propre message)
      io.to(`group:${data.group_id}`).emit('group:member_left', {
        group_id: data.group_id,
        user_id: userId,
        username,
      });

      // Quitter la room Socket.io
      socket.leave(`group:${data.group_id}`);

      console.log(`📤 [WS] ${username} a quitté le salon ${data.group_id}`);
      callback?.({ success: true });
    } catch (error: any) {
      console.error(`⚠️ [WS] group:leave erreur:`, error.message);
      callback?.({ success: false, error: error.message });
    }
  });
}
