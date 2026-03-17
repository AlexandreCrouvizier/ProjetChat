/**
 * components/chat/MembersPanel.tsx — Panneau des membres en ligne (Glassmorphism)
 */

'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Member {
  id: string;
  username: string;
  avatar_url: string | null;
  tier: string;
  donor_badge: string;
  role: string;
  last_seen_at: string | null;
}

function getAvatarColor(username: string): string {
  const colors = [
    'from-purple-500 to-indigo-500',
    'from-emerald-500 to-green-600',
    'from-amber-500 to-orange-600',
    'from-red-500 to-rose-600',
    'from-cyan-500 to-blue-500',
    'from-pink-500 to-fuchsia-600',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getRoleBadge(role: string): { text: string; style: string } | null {
  const roles: Record<string, { text: string; style: string }> = {
    creator: { text: '👑', style: 'bg-amber-500/20 text-amber-300' },
    admin: { text: 'ADM', style: 'bg-red-500/20 text-red-300' },
    moderator: { text: 'MOD', style: 'bg-purple-500/20 text-purple-300' },
  };
  return roles[role] || null;
}

export function MembersPanel({ groupId }: { groupId: string | null }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  // Charger les membres
  useEffect(() => {
    if (!groupId) return;
    const load = async () => {
      try {
        const { data } = await api.get(`/groups/${groupId}/members`);
        setMembers(data.members || []);
        // Considérer comme "en ligne" ceux avec un last_seen récent (< 5min)
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const online = new Set(
          (data.members || [])
            .filter((m: Member) => m.last_seen_at && new Date(m.last_seen_at).getTime() > fiveMinAgo)
            .map((m: Member) => m.id)
        );
        setOnlineIds(online);
      } catch (err) {
        console.error('Erreur chargement membres:', err);
      }
    };
    load();
  }, [groupId]);

  // Écouter les changements de présence
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onPresence = (data: { user_id: string; status: string }) => {
      setOnlineIds(prev => {
        const next = new Set(prev);
        if (data.status === 'online') next.add(data.user_id);
        else next.delete(data.user_id);
        return next;
      });
    };

    const onMemberJoined = (data: { group_id: string; user: any }) => {
      if (data.group_id === groupId) {
        setMembers(prev => {
          if (prev.some(m => m.id === data.user.id)) return prev;
          return [...prev, { ...data.user, role: 'member', donor_badge: 'none', avatar_url: null, last_seen_at: new Date().toISOString() }];
        });
        setOnlineIds(prev => new Set(prev).add(data.user.id));
      }
    };

    const onMemberLeft = (data: { group_id: string; user_id: string }) => {
      if (data.group_id === groupId) {
        setMembers(prev => prev.filter(m => m.id !== data.user_id));
      }
    };

    socket.on('presence:update', onPresence);
    socket.on('group:member_joined', onMemberJoined);
    socket.on('group:member_left', onMemberLeft);

    return () => {
      socket.off('presence:update', onPresence);
      socket.off('group:member_joined', onMemberJoined);
      socket.off('group:member_left', onMemberLeft);
    };
  }, [groupId]);

  const onlineMembers = members.filter(m => onlineIds.has(m.id));

  if (!groupId) return null;

  return (
    <div className="w-[200px] glass rounded-2xl p-4 overflow-y-auto flex-shrink-0">
      {/* Titre */}
      <div className="flex items-center gap-1.5 px-2 pb-2 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-[.12em]">
        En ligne
        <span className="bg-[var(--acc-s)] text-[var(--acc)] text-[9px] px-1.5 py-px rounded-lg font-bold border border-[rgba(139,92,246,0.15)]">
          {onlineMembers.length}
        </span>
      </div>

      {/* Liste des membres en ligne */}
      {onlineMembers.map(member => {
        const initial = member.username.charAt(0).toUpperCase();
        const color = getAvatarColor(member.username);
        const roleBadge = getRoleBadge(member.role);
        const isGuest = member.tier === 'guest';

        return (
          <div key={member.id}
               className="flex items-center gap-2.5 px-2 py-[7px] rounded-lg cursor-pointer transition-all border border-transparent hover:bg-[var(--glass-h)] hover:border-[var(--border)]">
            {/* Avatar */}
            <div className={`w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br ${color} flex items-center justify-center text-xs font-bold text-white shadow-[0_3px_10px_rgba(0,0,0,0.2)] relative flex-shrink-0`}>
              {initial}
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--on)] border-2 border-[var(--bg)] shadow-[0_0_6px_var(--on-g)]" />
            </div>
            
            {/* Nom */}
            <span className={`text-xs font-medium flex-1 truncate ${isGuest ? 'italic opacity-60 text-[var(--t2)]' : 'text-[var(--t2)]'}`}>
              {member.username}
            </span>

            {/* Badge rôle */}
            {roleBadge && (
              <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${roleBadge.style} flex-shrink-0`}>
                {roleBadge.text}
              </span>
            )}
            {isGuest && !roleBadge && (
              <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-[var(--badge-g)] text-[var(--t3)] flex-shrink-0">INV</span>
            )}
          </div>
        );
      })}

      {onlineMembers.length === 0 && (
        <div className="text-center text-[var(--t3)] text-[11px] py-4">Aucun membre en ligne</div>
      )}
    </div>
  );
}
