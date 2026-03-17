/**
 * components/sidebar/Sidebar.tsx — Sidebar avec toggle dark/light
 */

'use client';

import type { Group } from '@/hooks/useGroups';
import { useTheme } from '@/hooks/useTheme';

interface SidebarProps {
  user: any;
  groups: Group[];
  activeGroupId: string | null;
  onSelectGroup: (group: Group) => void;
  onLogout: () => void;
}

export function Sidebar({ user, groups, activeGroupId, onSelectGroup, onLogout }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const initial = user?.username?.charAt(0).toUpperCase() || '?';
  const tierColors: Record<string, string> = {
    guest: 'from-slate-500 to-slate-600',
    registered: 'from-red-500 to-red-600',
    premium: 'from-amber-400 to-orange-500',
  };
  const avatarGradient = tierColors[user?.tier || 'guest'] || tierColors.guest;

  return (
    <div className="w-[250px] glass-strong rounded-2xl flex flex-col overflow-hidden flex-shrink-0">

      {/* Header : Logo + Theme Toggle */}
      <div className="px-4 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--acc)] to-indigo-500 flex items-center justify-center text-sm shadow-[0_0_16px_var(--acc-g)]">💬</div>
          <span className="text-[17px] font-bold text-[var(--acc)]">ChatApp</span>
        </div>
        
        {/* Toggle dark/light */}
        <button
          onClick={toggleTheme}
          className="w-[46px] h-[26px] rounded-full bg-[var(--glass-s)] border border-[var(--border)] relative cursor-pointer transition-all hover:border-[var(--border-f)]"
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        >
          <span className="absolute top-[5px] left-[6px] text-[11px]">🌙</span>
          <span className="absolute top-[5px] right-[6px] text-[11px]">☀️</span>
          <div
            className="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-gradient-to-br from-[var(--acc)] to-indigo-500 shadow-[0_0_10px_var(--acc-g)] transition-transform duration-300"
            style={{ left: theme === 'dark' ? '2px' : '22px' }}
          />
        </button>
      </div>

      {/* Recherche */}
      <div className="px-3 py-2.5">
        <input
          className="w-full px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-xs text-[var(--t1)] outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]"
          placeholder="🔍  Rechercher..."
          readOnly
        />
      </div>

      {/* Liste des salons */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        <div className="px-3 pt-3 pb-1.5 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-[.12em]">
          Salons publics
        </div>

        {groups.map(group => (
          <button
            key={group.id}
            onClick={() => onSelectGroup(group)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-sm transition-all border border-transparent
              ${activeGroupId === group.id
                ? 'bg-[var(--glass-a)] border-[rgba(139,92,246,0.2)] text-[var(--t1)] shadow-[0_0_20px_rgba(139,92,246,0.06)]'
                : 'text-[var(--t2)] hover:bg-[var(--glass-h)] hover:border-[var(--border)] hover:text-[var(--t1)]'
              }`}
          >
            <span className="text-base font-bold text-[var(--hash)] w-[22px] text-center"
                  style={{ textShadow: '0 0 12px var(--acc-g)' }}>#</span>
            <span className="flex-1 font-medium text-left">{group.name}</span>
            {group.member_count > 0 && (
              <span className="text-[10px] text-[var(--t3)]">{group.member_count}</span>
            )}
          </button>
        ))}

        {/* Messages privés — Phase 2 */}
        <div className="px-3 pt-5 pb-1.5 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-[.12em]">
          Messages privés
        </div>
        <div className="px-5 py-2 text-[11px] text-[var(--t3)] italic">
          Bientôt disponible...
        </div>
      </div>

      {/* Profil utilisateur */}
      <div className="px-3 py-3 border-t border-[var(--border)] flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-[10px] bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-[15px] font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] relative`}>
          {initial}
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--on)] border-[2.5px] border-[var(--bg)] shadow-[0_0_8px_var(--on-g)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">{user?.username || 'Invité'}</div>
          <div className="text-[10px] text-[var(--t3)]">
            {user?.tier === 'premium' ? '⭐ Premium' : user?.tier === 'guest' ? '👤 Invité' : '🟢 En ligne'}
          </div>
        </div>
        <button onClick={onLogout}
                className="text-[var(--t3)] hover:text-red-400 transition-colors text-sm"
                title="Se déconnecter">
          🚪
        </button>
      </div>
    </div>
  );
}
