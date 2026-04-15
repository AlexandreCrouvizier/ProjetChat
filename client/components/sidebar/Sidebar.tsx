/**
 * components/sidebar/Sidebar.tsx — Phase 3 : bouton + créer salon + quitter
 */
'use client';

import { useState } from 'react';
import type { Group } from '@/hooks/useGroups';
import type { Conversation } from '@/hooks/useConversations';
import { DMList } from './DMList';
import { useTheme } from '@/hooks/useTheme';

interface SidebarProps {
  user: any; groups: Group[]; conversations: Conversation[];
  activeGroupId: string | null; activeConvId: string | null;
  onSelectGroup: (g: Group) => void; onSelectConv: (c: Conversation) => void;
  onHideConv: (convId: string) => void; onLeaveGroup: (groupId: string) => void;
  onLogout: () => void; onEditProfile?: () => void; onCreateGroup?: () => void;
}

export function Sidebar({ user, groups, conversations, activeGroupId, activeConvId, onSelectGroup, onSelectConv, onHideConv, onLeaveGroup, onLogout, onEditProfile, onCreateGroup }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [contextMenu, setContextMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const initial = user?.username?.charAt(0).toUpperCase() || '?';
  const tierColors: Record<string, string> = { guest: 'from-slate-500 to-slate-600', registered: 'from-red-500 to-red-600', premium: 'from-amber-400 to-orange-500' };
  const avatarGradient = tierColors[user?.tier || 'guest'] || tierColors.guest;
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  const handleContextMenu = (e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    setContextMenu({ groupId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-[250px] glass-strong rounded-2xl flex flex-col overflow-hidden flex-shrink-0"
      onClick={() => setContextMenu(null)}>
      <div className="px-4 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--acc)] to-indigo-500 flex items-center justify-center text-sm shadow-[0_0_16px_var(--acc-g)]">💬</div>
          <span className="text-[17px] font-bold text-[var(--acc)]">ChatApp</span>
        </div>
        <button onClick={toggleTheme} className="w-[46px] h-[26px] rounded-full bg-[var(--glass-s)] border border-[var(--border)] relative cursor-pointer transition-all hover:border-[var(--border-f)]"
          title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
          <span className="absolute top-[5px] left-[6px] text-[11px]">🌙</span>
          <span className="absolute top-[5px] right-[6px] text-[11px]">☀️</span>
          <div className="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-gradient-to-br from-[var(--acc)] to-indigo-500 shadow-[0_0_10px_var(--acc-g)] transition-transform duration-300"
            style={{ left: theme === 'dark' ? '2px' : '22px' }} />
        </button>
      </div>

      <div className="px-3 py-2.5">
        <input className="w-full px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-xs text-[var(--t1)] outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" placeholder="🔍  Rechercher..." readOnly />
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {/* ⭐ Header salons avec bouton + */}
        <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-[var(--t3)] uppercase tracking-[.12em]">Salons</span>
          {user?.tier !== 'guest' && (
            <button onClick={onCreateGroup}
              className="w-5 h-5 rounded-md flex items-center justify-center text-[var(--t3)] hover:text-[var(--acc)] hover:bg-[var(--acc-s)] transition-all text-xs"
              title="Créer un salon">
              +
            </button>
          )}
        </div>

        {groups.map(group => (
          <button key={group.id}
            onClick={() => onSelectGroup(group)}
            onContextMenu={(e) => !group.is_official && handleContextMenu(e, group.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-sm transition-all border border-transparent
              ${activeGroupId === group.id && !activeConvId ? 'bg-[var(--glass-a)] border-[rgba(139,92,246,0.2)] text-[var(--t1)] shadow-[0_0_20px_rgba(139,92,246,0.06)]' : 'text-[var(--t2)] hover:bg-[var(--glass-h)] hover:border-[var(--border)] hover:text-[var(--t1)]'}`}>
            <span className="text-base font-bold w-[22px] text-center" style={{ textShadow: '0 0 12px var(--acc-g)' }}>
              {group.type === 'private' ? '🔒' : <span className="text-[var(--hash)]">#</span>}
            </span>
            <span className="flex-1 font-medium text-left truncate">{group.name}</span>
            {group.member_count > 0 && <span className="text-[10px] text-[var(--t3)]">{group.member_count}</span>}
          </button>
        ))}

        <div className="px-3 pt-5 pb-1.5 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-[.12em] flex items-center gap-2">
          Messages privés {totalUnread > 0 && <span className="bg-[var(--acc)] text-white text-[8px] font-bold px-1.5 py-px rounded-full">{totalUnread}</span>}
        </div>
        <DMList conversations={conversations} activeConvId={activeConvId} onSelect={onSelectConv} onHide={onHideConv} />
      </div>

      {/* Profil */}
      <div className="px-3 py-3 border-t border-[var(--border)] flex items-center gap-2.5">
        <div onClick={onEditProfile} className={`w-9 h-9 rounded-[10px] bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-[15px] font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] relative cursor-pointer hover:scale-105 transition-transform`}>
          {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full rounded-[10px] object-cover" /> : initial}
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--on)] border-[2.5px] border-[var(--bg)] shadow-[0_0_8px_var(--on-g)]" />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onEditProfile}>
          <div className="text-[13px] font-semibold truncate">{user?.username || 'Invité'}</div>
          <div className="text-[10px] text-[var(--t3)]">{user?.tier === 'premium' ? '⭐ Premium' : user?.tier === 'guest' ? '👤 Invité' : '🟢 En ligne'}</div>
        </div>
        <button onClick={onLogout} className="text-[var(--t3)] hover:text-red-400 transition-colors text-sm" title="Se déconnecter">🚪</button>
      </div>

      {/* ⭐ Menu contextuel (clic droit) sur un salon */}
      {contextMenu && (
        <div className="fixed glass-strong rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] py-1 z-50 animate-scaleIn min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            onClick={() => {
              if (confirm('Quitter ce salon ?')) onLeaveGroup(contextMenu.groupId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-[12px] text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2">
            🚪 Quitter le salon
          </button>
        </div>
      )}
    </div>
  );
}
