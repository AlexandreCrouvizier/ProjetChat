/**
 * websocket/group.handler.ts — Phase 3 : join/leave rooms + broadcast
 */
import type { Server, Socket } from 'socket.io';
import { groupRepository } from '../repositories/group.repository';
import { TIER_LIMITS } from '../../../shared/constants';

export function registerGroupHandlers(io: Server, socket: Socket, user: any) {

  /** Rejoindre un salon (room Socket.io) */
  socket.on('group:join', async (data: { group_id: string }, callback?: Function) => {
    try {
      const { group_id } = data;
      if (!group_id) return;

      const group = await groupRepository.findById(group_id);
      if (!group) {
        callback?.({ error: 'NOT_FOUND' });
        return;
      }

      // Vérifier si déjà membre en BDD
      const isMember = await groupRepository.isMember(group_id, user.userId);

      if (!isMember) {
        // Groupe public → rejoindre automatiquement
        if (group.type === 'public') {
          // Vérifier quota
          const tierConfig = TIER_LIMITS[user.tier as keyof typeof TIER_LIMITS];
          if (tierConfig.maxPublicGroups !== Infinity) {
            const count = await groupRepository.countJoinedPublicByUser(user.userId);
            if (count >= tierConfig.maxPublicGroups) {
              callback?.({ error: 'QUOTA_EXCEEDED', message: `Limite de ${tierConfig.maxPublicGroups} salons atteinte` });
              return;
            }
          }
          await groupRepository.addMember(group_id, user.userId, 'member');
          await groupRepository.incrementMemberCount(group_id);
        } else {
          // Groupe privé → refuser (il faut une invitation)
          callback?.({ error: 'FORBIDDEN', message: 'Salon privé — utilisez un lien d\'invitation' });
          return;
        }
      }

      // Rejoindre la room Socket.io
      socket.join(`group:${group_id}`);

      // Broadcast aux autres membres du salon
      socket.to(`group:${group_id}`).emit('group:member_joined', {
        group_id,
        user: {
          id: user.userId,
          username: user.username,
          tier: user.tier,
        },
      });

      callback?.({ success: true });
    } catch (error) {
      console.error('❌ group:join error:', error);
      callback?.({ error: 'INTERNAL_ERROR' });
    }
  });

  /** Quitter un salon */
  socket.on('group:leave', async (data: { group_id: string }, callback?: Function) => {
    try {
      const { group_id } = data;
      if (!group_id) return;

      // Quitter la room Socket.io
      socket.leave(`group:${group_id}`);

      // Broadcast aux autres membres
      socket.to(`group:${group_id}`).emit('group:member_left', {
        group_id,
        user_id: user.userId,
        username: user.username,
      });

      callback?.({ success: true });
    } catch (error) {
      console.error('❌ group:leave error:', error);
      callback?.({ error: 'INTERNAL_ERROR' });
    }
  });
}
