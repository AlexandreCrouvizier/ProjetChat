/**
 * components/layout/MobileMePanel.tsx — Onglet « Moi » (disposition « Onglets en bas »)
 *
 * Profil, Mes fichiers, disposition (si l'admin laisse le choix), thème, déconnexion.
 */
'use client';

import { safeAvatarUrl } from '@/lib/safeUrl';
import { useTheme } from '@/hooks/useTheme';
import { LayoutPicker } from './LayoutPicker';
import { useLayoutStore } from '@/hooks/useMobileLayout';
import { VoiceEntryPicker, useShowVoiceEntry } from './VoiceEntryPicker';

interface Props {
  user: any;
  onEditProfile: () => void;
  onOpenFiles: () => void;
  onLogout: () => void;
}

const TIER_LABEL: Record<string, string> = { guest: '👤 Invité', registered: '✅ Compte inscrit', premium: '⭐ Premium' };

export function MobileMePanel({ user, onEditProfile, onOpenFiles, onLogout }: Props) {
  const { theme, toggleTheme } = useTheme();
  const rule = useLayoutStore((s) => s.rule);
  const showVoiceEntry = useShowVoiceEntry();
  const avatar = safeAvatarUrl(user?.avatar_url);
  const isGuest = user?.tier === 'guest';
  const row = 'w-full flex items-center gap-3 px-4 min-h-[52px] rounded-xl text-left text-[15px] text-[var(--t1)] hover:bg-[var(--glass-h)] active:bg-[var(--glass-h)] transition-colors';

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-3" data-testid="me-panel">
      <h2 className="text-[22px] font-bold px-1">Moi</h2>

      <button type="button" onClick={onEditProfile}
        className="w-full flex items-center gap-4 p-4 rounded-2xl glass-strong text-left">
        {avatar
          ? <img src={avatar} alt="" className="w-14 h-14 rounded-2xl object-cover" />
          : <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--acc)] to-indigo-500 flex items-center justify-center text-xl font-bold text-white">{user?.username?.charAt(0).toUpperCase() || '?'}</span>}
        <span className="flex flex-col min-w-0">
          <span className="text-[17px] font-semibold truncate">{user?.username || 'Invité'}</span>
          <span className="text-[12px] text-[var(--t2)]">{TIER_LABEL[user?.tier] || TIER_LABEL.guest}</span>
          {user?.status_text && <span className="text-[12px] text-[var(--t3)] truncate">{user?.status_emoji} {user.status_text}</span>}
        </span>
      </button>

      <div className="glass rounded-2xl p-1.5">
        {!isGuest && <button type="button" onClick={onEditProfile} className={row}><span aria-hidden="true">✏️</span>Modifier le profil</button>}
        {!isGuest && <button type="button" onClick={onOpenFiles} className={row}><span aria-hidden="true">📁</span>Mes fichiers</button>}
        <button type="button" onClick={toggleTheme} className={row}>
          <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
          {theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
        </button>
        <button type="button" onClick={onLogout} className={`${row} !text-red-400`}><span aria-hidden="true">🚪</span>Se déconnecter</button>
      </div>

      {rule === 'option' && (
        <div className="glass rounded-2xl p-3.5 space-y-2.5">
          <p className="text-[11px] font-semibold text-[var(--t3)] uppercase tracking-wider">📱 Disposition de l&apos;écran</p>
          <LayoutPicker compact />
        </div>
      )}

      {showVoiceEntry && (
        <div className="glass rounded-2xl p-3.5 space-y-2.5">
          <p className="text-[11px] font-semibold text-[var(--t3)] uppercase tracking-wider">🎙️ Boutons voix / vidéo / écran</p>
          <VoiceEntryPicker />
        </div>
      )}
    </div>
  );
}
