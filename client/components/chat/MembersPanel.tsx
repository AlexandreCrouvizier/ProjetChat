/**
 * components/chat/MembersPanel.tsx — Phase 4.1g : visibilité par tier
 *
 * Règles d'affichage de la liste hors-ligne :
 *
 *   guest      → liste EN LIGNE uniquement (hors-ligne invisible)
 *   registered → en ligne + hors-ligne déconnectés depuis ≤ ttl minutes
 *                les invités déconnectés sont masqués selon paramètre admin
 *   premium    → liste complète + recherche + toggle "masquer invités déco"
 *
 * Paramètres admin (app_settings) :
 *   members_hide_offline_guests   : masque globalement les invités déco
 *   members_offline_ttl_minutes   : durée max hors-ligne visible (défaut 10min)
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

const ROLE_LABELS:    Record<string, string> = { creator: '👑 Créateur', admin: '🛡️ Admin', moderator: '🔧 Modérateur', member: '' };
const ROLE_COLORS:    Record<string, string> = { creator: 'text-amber-400', admin: 'text-red-400', moderator: 'text-blue-400', member: 'text-[var(--t2)]' };
const ROLE_HIERARCHY: Record<string, number> = { creator: 4, admin: 3, moderator: 2, member: 1 };

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1)  return 'à l\'instant';
  if (diff < 60) return `il y a ${diff}min`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

export function MembersPanel({ groupId, groupType, groupName, onMemberClick }: MembersPanelProps) {
  const { user } = useAuth();
  const [members,     setMembers]     = useState<Member[]>([]);
  const [onlineIds,   setOnlineIds]   = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ member: Member; x: number; y: number } | null>(null);
  const [showInvite,  setShowInvite]  = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ─── Paramètres admin ──────────────────────────────────────────────────────
  const [adminHideGuests, setAdminHideGuests] = useState(false);
  const [adminTtlMin,     setAdminTtlMin]     = useState(10);

  // ─── Préférences premium ───────────────────────────────────────────────────
  const [premiumSearch,    setPremiumSearch]    = useState('');
  const [premiumHideGuests,setPremiumHideGuests]= useState(false);
  const [premiumFullList,  setPremiumFullList]  = useState(false); // true = liste complète

  const myTier = user?.tier || 'guest';
  const isPremium    = myTier === 'premium';
  const isRegistered = myTier === 'registered' || isPremium;

  // ─── Charger les settings admin ────────────────────────────────────────────
  useEffect(() => {
    api.get('/settings/members').then(({ data }) => {
      setAdminHideGuests(data.hide_offline_guests === true || data.hide_offline_guests === 'true');
      setAdminTtlMin(parseInt(data.offline_ttl_minutes || '10', 10));
    }).catch(() => {/* settings non critiques */});
  }, []);

  // ─── Charger les membres ───────────────────────────────────────────────────
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
  useEffect(() => {
    if (!groupId) return;
    const interval = setInterval(loadMembers, 15000);
    return () => clearInterval(interval);
  }, [groupId, loadMembers]);

  // ─── WebSocket présence ────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = (d: { user_id: string; status: string }) => {
      setOnlineIds(prev => { const n = new Set(prev); d.status === 'online' ? n.add(d.user_id) : n.delete(d.user_id); return n; });
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
    return () => { socket.off('presence:update', onPresence); socket.off('group:member_joined', onJoined); socket.off('group:member_left', onLeft); };
  }, [groupId]);

  // ─── Fermer menu contextuel ────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ─── Rôle courant ──────────────────────────────────────────────────────────
  const myMembership = members.find(m => m.id === user?.id);
  const myRole  = myMembership?.role || 'member';
  const myRank  = ROLE_HIERARCHY[myRole] || 0;
  const canActOn     = (t: Member) => myRank > (ROLE_HIERARCHY[t.role] || 0) && t.id !== user?.id;
  const canModerate  = myRank >= 2;

  const handleContextMenu = (e: React.MouseEvent, member: Member) => {
    e.preventDefault();
    if (member.id === user?.id || !canModerate) return;
    setContextMenu({ member, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 280) });
  };

  const handleAction = async (action: string, targetId: string, payload?: any) => {
    try {
      if (action === 'promote' || action === 'demote') await api.patch(`/groups/${groupId}/members/${targetId}`, { role: payload });
      else if (action === 'kick') { if (!window.confirm('Expulser ce membre du salon ?')) return; await api.post(`/groups/${groupId}/members/${targetId}/kick`); }
      else if (action === 'mute') await api.post(`/groups/${groupId}/members/${targetId}/mute`);
      await loadMembers();
    } catch (err: any) { alert(err.response?.data?.message || 'Erreur'); }
    setContextMenu(null);
  };

  if (!groupId) return null;

  // ─── Calcul des listes selon le tier ──────────────────────────────────────

  const now = Date.now();
  const ttlMs = adminTtlMin * 60 * 1000;

  const onlineMembers = members.filter(m => onlineIds.has(m.id));

  // Offline : filtrés selon tier et paramètres
  let offlineMembers: Member[] = [];

  if (myTier === 'guest') {
    // Invités : AUCUN hors-ligne visible
    offlineMembers = [];

  } else if (myTier === 'registered') {
    // Registered : déconnectés depuis ≤ ttl minutes, sans les invités si admin l'a désactivé
    offlineMembers = members.filter(m => {
      if (onlineIds.has(m.id)) return false;
      if (!m.last_seen_at) return false;
      const age = now - new Date(m.last_seen_at).getTime();
      if (age > ttlMs) return false;
      if (adminHideGuests && m.tier === 'guest') return false;
      return true;
    });

  } else {
    // Premium : selon préférences utilisateur
    if (premiumFullList) {
      offlineMembers = members.filter(m => {
        if (onlineIds.has(m.id)) return false;
        if ((adminHideGuests || premiumHideGuests) && m.tier === 'guest') return false;
        return true;
      });
    } else {
      offlineMembers = members.filter(m => {
        if (onlineIds.has(m.id)) return false;
        if (!m.last_seen_at) return false;
        const age = now - new Date(m.last_seen_at).getTime();
        if (age > ttlMs) return false;
        if ((adminHideGuests || premiumHideGuests) && m.tier === 'guest') return false;
        return true;
      });
    }
  }

  // Recherche premium
  const filterBySearch = (list: Member[]) => {
    if (!isPremium || !premiumSearch.trim()) return list;
    const q = premiumSearch.toLowerCase();
    return list.filter(m => m.username.toLowerCase().includes(q));
  };

  const visibleOnline  = filterBySearch(onlineMembers);
  const visibleOffline = filterBySearch(offlineMembers);

  // ─── Rendu d'un membre ─────────────────────────────────────────────────────
  const renderMember = (member: Member, isOnline: boolean) => {
    const initial = member.username.charAt(0).toUpperCase();
    const color   = getAvatarColor(member.username);
    const isGuest = member.tier === 'guest';

    return (
      <div key={member.id}
        onClick={() => onMemberClick(member.id)}
        onContextMenu={e => handleContextMenu(e, member)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--glass-h)] transition-all group/member">

        <div className="relative flex-shrink-0">
          {member.avatar_url
            ? <img src={member.avatar_url} alt={member.username}
                className="w-[30px] h-[30px] rounded-[9px] object-cover shadow-[0_3px_10px_rgba(0,0,0,0.2)]" />
            : <div className={`w-[30px] h-[30px] rounded-[9px] bg-gradient-to-br ${color} flex items-center justify-center text-xs font-bold text-white shadow-[0_3px_10px_rgba(0,0,0,0.2)]`}>{initial}</div>
          }
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg)] ${isOnline ? 'bg-[var(--on)]' : 'bg-gray-500'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[12px] font-medium truncate ${ROLE_COLORS[member.role] || ''} ${!isOnline ? 'opacity-50' : ''} ${isGuest ? 'italic' : ''}`}>
              {member.username}
            </span>
            {member.is_muted && <span className="text-[9px]" title="Muté dans ce salon">🔇</span>}
          </div>
          {ROLE_LABELS[member.role]
            ? <div className="text-[9px] text-[var(--t3)] leading-tight">{ROLE_LABELS[member.role]}</div>
            : !isOnline && member.last_seen_at && (
                <div className="text-[9px] text-[var(--t3)] leading-tight">{timeAgo(member.last_seen_at)}</div>
              )
          }
        </div>

        {isGuest && !ROLE_LABELS[member.role] && (
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-[var(--badge-g)] text-[var(--t3)] flex-shrink-0">INV</span>
        )}
      </div>
    );
  };

  // ─── Rendu principal ───────────────────────────────────────────────────────
  return (
    <div className="w-[200px] glass-strong rounded-2xl flex flex-col overflow-hidden flex-shrink-0"
      onClick={() => setContextMenu(null)}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-[10px] font-semibold text-[var(--t3)] uppercase tracking-wider flex items-center gap-2">
          En ligne
          <span className="bg-[var(--on)] text-white text-[8px] font-bold px-1.5 py-px rounded-full">
            {visibleOnline.length}
          </span>
          {groupType === 'private' && (myRole === 'creator' || myRole === 'admin') && (
            <button onClick={() => setShowInvite(true)}
              className="ml-auto px-2 py-0.5 rounded-lg text-[9px] font-semibold text-[var(--acc)] transition-all hover:bg-[var(--acc-s)]"
              style={{ border: '1px solid rgba(139,92,246,0.3)' }}>
              🔗 Inviter
            </button>
          )}
        </div>

        {/* ── Barre recherche premium ─────────────────────────────────────── */}
        {isPremium && (
          <div className="mt-2 space-y-1.5">
            <input
              type="text"
              value={premiumSearch}
              onChange={e => setPremiumSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--t1)' }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => setPremiumHideGuests(v => !v)}
                title={premiumHideGuests ? 'Afficher les invités déco' : 'Masquer les invités déco'}
                className={`flex-1 px-1.5 py-1 rounded-lg text-[9px] font-medium transition-all ${
                  premiumHideGuests ? 'text-amber-300' : 'text-[var(--t3)] hover:text-[var(--t1)]'
                }`}
                style={{
                  background: premiumHideGuests ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                  border: premiumHideGuests ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                {premiumHideGuests ? '👻 Invités cachés' : '👁 Invités visibles'}
              </button>
              <button
                onClick={() => setPremiumFullList(v => !v)}
                title={premiumFullList ? 'Passer en liste allégée' : 'Voir la liste complète'}
                className={`flex-1 px-1.5 py-1 rounded-lg text-[9px] font-medium transition-all ${
                  premiumFullList ? 'text-purple-300' : 'text-[var(--t3)] hover:text-[var(--t1)]'
                }`}
                style={{
                  background: premiumFullList ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
                  border: premiumFullList ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                {premiumFullList ? '📋 Complète' : '⚡ Allégée'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Liste ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {visibleOnline.map(m => renderMember(m, true))}

        {/* Hors-ligne (selon tier) */}
        {visibleOffline.length > 0 && (
          <>
            <div className="px-4 pt-3 pb-1 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider flex items-center gap-1.5">
              Hors ligne
              <span className="opacity-60">— {visibleOffline.length}</span>
              {!isPremium && myTier === 'registered' && (
                <span className="ml-auto text-[8px] opacity-40">≤{adminTtlMin}min</span>
              )}
            </div>
            {visibleOffline.map(m => renderMember(m, false))}
          </>
        )}

        {/* Message si liste vide */}
        {visibleOnline.length === 0 && visibleOffline.length === 0 && (
          <div className="text-center text-[var(--t3)] text-[11px] py-4">Aucun membre</div>
        )}

        {/* Info invités : message discret si liste hors-ligne masquée */}
        {myTier === 'guest' && members.filter(m => !onlineIds.has(m.id)).length > 0 && (
          <div className="px-3 py-2 mt-1 mx-2 rounded-lg text-center text-[10px]"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.25)' }}>
            Connectez-vous pour voir les membres hors-ligne
          </div>
        )}
      </div>

      {/* ── Menu contextuel ───────────────────────────────────────────────── */}
      {contextMenu && canActOn(contextMenu.member) && (
        <div ref={menuRef}
          className="fixed glass-strong rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1 z-50 min-w-[170px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="px-3 py-1.5 text-[10px] text-[var(--t3)] font-semibold border-b border-[var(--border)]">
            {contextMenu.member.username} — {ROLE_LABELS[contextMenu.member.role] || 'Membre'}
          </div>
          {myRole === 'creator' && contextMenu.member.role !== 'admin' && (
            <button onClick={() => handleAction('promote', contextMenu.member.id, 'admin')}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--t1)] hover:bg-[var(--glass-h)] transition-colors flex items-center gap-2">
              🛡️ Promouvoir Admin
            </button>
          )}
          {myRank >= 3 && contextMenu.member.role === 'member' && (
            <button onClick={() => handleAction('promote', contextMenu.member.id, 'moderator')}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--t1)] hover:bg-[var(--glass-h)] transition-colors flex items-center gap-2">
              🔧 Promouvoir Modérateur
            </button>
          )}
          {myRank >= 3 && contextMenu.member.role !== 'member' && canActOn(contextMenu.member) && (
            <button onClick={() => handleAction('demote', contextMenu.member.id, 'member')}
              className="w-full px-3 py-1.5 text-left text-[11px] text-orange-400 hover:bg-orange-500/10 transition-colors flex items-center gap-2">
              ⬇️ Rétrograder Membre
            </button>
          )}
          {canActOn(contextMenu.member) && (
            <button onClick={() => handleAction('mute', contextMenu.member.id)}
              className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--t1)] hover:bg-[var(--glass-h)] transition-colors flex items-center gap-2">
              {contextMenu.member.is_muted ? '🔊 Démuter' : '🔇 Muter dans ce salon'}
            </button>
          )}
          <div className="border-t border-[var(--border)] my-0.5" />
          {canActOn(contextMenu.member) && (
            <button onClick={() => handleAction('kick', contextMenu.member.id)}
              className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
              🚪 Expulser du salon
            </button>
          )}
        </div>
      )}

      {showInvite && groupId && (
        <InviteModal isOpen={showInvite} groupId={groupId} groupName={groupName || groupId} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
