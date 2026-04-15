/**
 * components/chat/MembersPanel.tsx — Phase 3 : rôles + clic droit (promote, mute, kick)
 * 
 * Fonctionnalités :
 *   - Liste des membres en ligne / hors ligne
 *   - Badges rôle (👑 Créateur, 🛡️ Admin, 🔧 Modérateur)
 *   - 🔇 si muté
 *   - Clic gauche → ouvre le ProfileModal
 *   - Clic droit → menu contextuel avec actions selon le rôle de l'utilisateur courant
 *   - Présence en temps réel via WebSocket
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import { InviteModal } from '@/components/modals/InviteModal';

interface Member {
  id: string;
  username: string;
  avatar_url: string | null;
  tier: string;
  donor_badge: string;
  last_seen_at: string | null;
  role: string;
  joined_at: string;
  is_muted?: boolean;
}

interface MembersPanelProps {
  groupId: string | null;
  groupType?: string;
  groupName?: string;
  onMemberClick: (userId: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  creator: '👑 Créateur',
  admin: '🛡️ Admin',
  moderator: '🔧 Modérateur',
  member: '',
};
const ROLE_COLORS: Record<string, string> = {
  creator: 'text-amber-400',
  admin: 'text-red-400',
  moderator: 'text-blue-400',
  member: 'text-[var(--t2)]',
};
const ROLE_HIERARCHY: Record<string, number> = { creator: 4, admin: 3, moderator: 2, member: 1 };

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}

export function MembersPanel({ groupId, groupType, groupName, onMemberClick }: MembersPanelProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ member: Member; x: number; y: number } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Charger les membres
  const loadMembers = useCallback(async () => {
    if (!groupId) return;
    try {
      const { data } = await api.get(`/groups/${groupId}/members`);
      setMembers(data.members || []);
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      setOnlineIds(new Set(
        (data.members || [])
          .filter((m: Member) => m.last_seen_at && new Date(m.last_seen_at).getTime() > fiveMinAgo)
          .map((m: Member) => m.id)
      ));
    } catch {}
  }, [groupId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Refresh périodique
  useEffect(() => {
    if (!groupId) return;
    const interval = setInterval(loadMembers, 15000);
    return () => clearInterval(interval);
  }, [groupId, loadMembers]);

  // WebSocket présence + join/leave
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = (d: { user_id: string; status: string }) => {
      setOnlineIds(prev => {
        const n = new Set(prev);
        d.status === 'online' ? n.add(d.user_id) : n.delete(d.user_id);
        return n;
      });
    };
    const onJoined = (d: { group_id: string; user: any }) => {
      if (d.group_id === groupId) {
        setMembers(prev => prev.some(m => m.id === d.user.id) ? prev : [...prev, {
          ...d.user, role: 'member', donor_badge: 'none',
          avatar_url: d.user.avatar_url || null, last_seen_at: new Date().toISOString(),
        }]);
        setOnlineIds(prev => new Set(prev).add(d.user.id));
      }
    };
    const onLeft = (d: { group_id: string; user_id: string }) => {
      if (d.group_id === groupId) setMembers(prev => prev.filter(m => m.id !== d.user_id));
    };
    socket.on('presence:update', onPresence);
    socket.on('group:member_joined', onJoined);
    socket.on('group:member_left', onLeft);
    return () => {
      socket.off('presence:update', onPresence);
      socket.off('group:member_joined', onJoined);
      socket.off('group:member_left', onLeft);
    };
  }, [groupId]);

  // Fermer le menu contextuel au clic ailleurs
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Rôle de l'utilisateur courant dans ce groupe
  const myMembership = members.find(m => m.id === user?.id);
  const myRole = myMembership?.role || 'member';
  const myRank = ROLE_HIERARCHY[myRole] || 0;

  const canActOn = (target: Member) => myRank > (ROLE_HIERARCHY[target.role] || 0) && target.id !== user?.id;
  const canModerate = myRank >= 2; // moderator+

  // Clic droit sur un membre
  const handleContextMenu = (e: React.MouseEvent, member: Member) => {
    e.preventDefault();
    if (member.id === user?.id) return; // Pas de menu sur soi-même
    if (!canModerate) return; // Pas de menu si pas mod+
    setContextMenu({
      member,
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 280),
    });
  };

  // Exécuter une action de modération
  const handleAction = async (action: string, targetId: string, payload?: any) => {
    try {
      if (action === 'promote' || action === 'demote') {
        await api.patch(`/groups/${groupId}/members/${targetId}`, { role: payload });
      } else if (action === 'kick') {
        if (!confirm('Expulser ce membre du salon ?')) return;
        await api.post(`/groups/${groupId}/members/${targetId}/kick`);
      } else if (action === 'mute') {
        await api.post(`/groups/${groupId}/members/${targetId}/mute`);
      }
      // Rafraîchir la liste
      await loadMembers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
    setContextMenu(null);
  };

  if (!groupId) return null;

  const onlineMembers = members.filter(m => onlineIds.has(m.id));
  const offlineMembers = members.filter(m => !onlineIds.has(m.id));

  const renderMember = (member: Member, isOnline: boolean) => {
    const initial = member.username.charAt(0).toUpperCase();
    const color = getAvatarColor(member.username);
    const isGuest = member.tier === 'guest';

    return (
      <div key={member.id}
        onClick={() => onMemberClick(member.id)}
        onContextMenu={(e) => handleContextMenu(e, member)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--glass-h)] transition-all group/member">

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {member.avatar_url ? (
            <img src={member.avatar_url} alt={member.username}
              className="w-[30px] h-[30px] rounded-[9px] object-cover shadow-[0_3px_10px_rgba(0,0,0,0.2)]" />
          ) : (
            <div className={`w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br ${color} flex items-center justify-center text-xs font-bold text-white shadow-[0_3px_10px_rgba(0,0,0,0.2)]`}>
              {initial}
            </div>
          )}
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg)] ${isOnline ? 'bg-[var(--on)]' : 'bg-gray-500'}`} />
        </div>

        {/* Nom + rôle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[12px] font-medium truncate ${ROLE_COLORS[member.role] || ''} ${!isOnline ? 'opacity-50' : ''} ${isGuest ? 'italic' : ''}`}>
              {member.username}
            </span>
            {member.is_muted && <span className="text-[9px]" title="Muté dans ce salon">🔇</span>}
          </div>
          {ROLE_LABELS[member.role] && (
            <div className="text-[9px] text-[var(--t3)] leading-tight">{ROLE_LABELS[member.role]}</div>
          )}
        </div>

        {/* Badge tier pour invités */}
        {isGuest && !ROLE_LABELS[member.role] && (
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-[var(--badge-g)] text-[var(--t3)] flex-shrink-0">INV</span>
        )}
      </div>
    );
  };

  return (
    <div className="w-[200px] glass-strong rounded-2xl flex flex-col overflow-hidden flex-shrink-0"
      onClick={() => setContextMenu(null)}>

      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-[10px] font-semibold text-[var(--t3)] uppercase tracking-wider flex items-center gap-2">
          En ligne <span className="bg-[var(--on)] text-white text-[8px] font-bold px-1.5 py-px rounded-full">{onlineMembers.length}</span>
          {/* ⭐ Bouton inviter — salon privé, créateur ou admin uniquement */}
          {groupType === 'private' && (myRole === 'creator' || myRole === 'admin') && (
            <button onClick={() => setShowInvite(true)}
              className="ml-auto px-2 py-0.5 rounded-lg text-[9px] font-semibold text-[var(--acc)] transition-all hover:bg-[var(--acc-s)]"
              style={{ border: '1px solid rgba(139,92,246,0.3)' }}
              title="Inviter des membres">
              🔗 Inviter
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {onlineMembers.map(m => renderMember(m, true))}
        {offlineMembers.length > 0 && (
          <>
            <div className="px-4 pt-3 pb-1 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider">
              Hors ligne — {offlineMembers.length}
            </div>
            {offlineMembers.map(m => renderMember(m, false))}
          </>
        )}
        {members.length === 0 && (
          <div className="text-center text-[var(--t3)] text-[11px] py-4">Aucun membre</div>
        )}
      </div>

      {/* ⭐ Menu contextuel (clic droit) */}
      {contextMenu && canActOn(contextMenu.member) && (
        <div ref={menuRef}
          className="fixed glass-strong rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1 z-50 min-w-[170px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}>

          {/* Header du menu */}
          <div className="px-3 py-1.5 text-[10px] text-[var(--t3)] font-semibold border-b border-[var(--border)]">
            {contextMenu.member.username} — {ROLE_LABELS[contextMenu.member.role] || 'Membre'}
          </div>

          {/* Promouvoir Admin — creator uniquement */}
          {myRole === 'creator' && contextMenu.member.role !== 'admin' && (
            <button onClick={() => handleAction('promote', contextMenu.member.id, 'admin')}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--t1)] hover:bg-[var(--glass-h)] transition-colors flex items-center gap-2">
              🛡️ Promouvoir Admin
            </button>
          )}

          {/* Promouvoir Modérateur — admin+ */}
          {myRank >= 3 && contextMenu.member.role === 'member' && (
            <button onClick={() => handleAction('promote', contextMenu.member.id, 'moderator')}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--t1)] hover:bg-[var(--glass-h)] transition-colors flex items-center gap-2">
              🔧 Promouvoir Modérateur
            </button>
          )}

          {/* Rétrograder — admin+ sur les rangs inférieurs */}
          {myRank >= 3 && contextMenu.member.role !== 'member' && canActOn(contextMenu.member) && (
            <button onClick={() => handleAction('demote', contextMenu.member.id, 'member')}
              className="w-full px-3 py-1.5 text-left text-[11px] text-orange-400 hover:bg-orange-500/10 transition-colors flex items-center gap-2">
              ⬇️ Rétrograder Membre
            </button>
          )}

          {/* Mute / Démute dans le salon */}
          {canActOn(contextMenu.member) && (
            <button onClick={() => handleAction('mute', contextMenu.member.id)}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--t1)] hover:bg-[var(--glass-h)] transition-colors flex items-center gap-2">
              {contextMenu.member.is_muted ? '🔊 Démuter' : '🔇 Muter dans ce salon'}
            </button>
          )}

          <div className="border-t border-[var(--border)] my-0.5" />

          {/* Kick */}
          {canActOn(contextMenu.member) && (
            <button onClick={() => handleAction('kick', contextMenu.member.id)}
              className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
              🚪 Expulser du salon
            </button>
          )}
        </div>
      )}

      {/* ⭐ Modal d'invitation */}
      {showInvite && groupId && (
        <InviteModal
          isOpen={showInvite}
          groupId={groupId}
          groupName={groupName || groupId}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
