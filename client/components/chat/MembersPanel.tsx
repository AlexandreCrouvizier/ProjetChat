/**
 * components/chat/MembersPanel.tsx — FIXED: affiche avatar photo + présence correcte
 */
'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Member { id: string; username: string; avatar_url: string | null; tier: string; donor_badge: string; role: string; last_seen_at: string | null; }

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}
function getRoleBadge(r: string) { const m: Record<string,{text:string;style:string}> = { creator:{text:'👑',style:'bg-amber-500/20 text-amber-300'},admin:{text:'ADM',style:'bg-red-500/20 text-red-300'},moderator:{text:'MOD',style:'bg-purple-500/20 text-purple-300'} }; return m[r]||null; }

export function MembersPanel({ groupId, onMemberClick }: { groupId: string | null; onMemberClick?: (userId: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!groupId) return;
    api.get(`/groups/${groupId}/members`).then(({ data }) => {
      setMembers(data.members || []);
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      setOnlineIds(new Set((data.members || []).filter((m: Member) => m.last_seen_at && new Date(m.last_seen_at).getTime() > fiveMinAgo).map((m: Member) => m.id)));
    }).catch(() => {});
  }, [groupId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = (d: { user_id: string; status: string }) => {
      setOnlineIds(prev => { const n = new Set(prev); d.status === 'online' ? n.add(d.user_id) : n.delete(d.user_id); return n; });
    };
    const onJoined = (d: { group_id: string; user: any }) => {
      if (d.group_id === groupId) {
        setMembers(prev => prev.some(m => m.id === d.user.id) ? prev : [...prev, { ...d.user, role: 'member', donor_badge: 'none', avatar_url: d.user.avatar_url || null, last_seen_at: new Date().toISOString() }]);
        setOnlineIds(prev => new Set(prev).add(d.user.id));
      }
    };
    const onLeft = (d: { group_id: string; user_id: string }) => { if (d.group_id === groupId) setMembers(prev => prev.filter(m => m.id !== d.user_id)); };
    socket.on('presence:update', onPresence);
    socket.on('group:member_joined', onJoined);
    socket.on('group:member_left', onLeft);
    return () => { socket.off('presence:update', onPresence); socket.off('group:member_joined', onJoined); socket.off('group:member_left', onLeft); };
  }, [groupId]);

  const onlineMembers = members.filter(m => onlineIds.has(m.id));
  if (!groupId) return null;

  return (
    <div className="w-[200px] glass rounded-2xl p-4 overflow-y-auto flex-shrink-0">
      <div className="flex items-center gap-1.5 px-2 pb-2 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-[.12em]">
        En ligne
        <span className="bg-[var(--acc-s)] text-[var(--acc)] text-[9px] px-1.5 py-px rounded-lg font-bold border border-[rgba(139,92,246,0.15)]">{onlineMembers.length}</span>
      </div>
      {onlineMembers.map(member => {
        const initial = member.username.charAt(0).toUpperCase();
        const color = getAvatarColor(member.username);
        const roleBadge = getRoleBadge(member.role);
        const isGuest = member.tier === 'guest';
        return (
          <div key={member.id} onClick={() => onMemberClick?.(member.id)}
            className="flex items-center gap-2.5 px-2 py-[7px] rounded-lg cursor-pointer transition-all border border-transparent hover:bg-[var(--glass-h)] hover:border-[var(--border)]">
            {/* ⭐ Avatar photo si dispo, initiale sinon */}
            <div className="relative flex-shrink-0">
              {member.avatar_url ? (
                <img src={member.avatar_url} alt={member.username}
                  className="w-[30px] h-[30px] rounded-[9px] object-cover shadow-[0_3px_10px_rgba(0,0,0,0.2)]" />
              ) : (
                <div className={`w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br ${color} flex items-center justify-center text-xs font-bold text-white shadow-[0_3px_10px_rgba(0,0,0,0.2)]`}>
                  {initial}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--on)] border-2 border-[var(--bg)] shadow-[0_0_6px_var(--on-g)]" />
            </div>
            <span className={`text-xs font-medium flex-1 truncate ${isGuest ? 'italic opacity-60 text-[var(--t2)]' : 'text-[var(--t2)]'}`}>{member.username}</span>
            {roleBadge && <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${roleBadge.style} flex-shrink-0`}>{roleBadge.text}</span>}
            {isGuest && !roleBadge && <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-[var(--badge-g)] text-[var(--t3)] flex-shrink-0">INV</span>}
          </div>
        );
      })}
      {onlineMembers.length === 0 && <div className="text-center text-[var(--t3)] text-[11px] py-4">Aucun membre en ligne</div>}
    </div>
  );
}
