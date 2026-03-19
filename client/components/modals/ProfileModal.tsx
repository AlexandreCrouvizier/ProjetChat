/**
 * components/modals/ProfileModal.tsx — FIXED: DM vers guests + avatar image
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

interface ProfileModalProps {
  userId: string | null;
  currentUserId: string;
  currentUserTier: string;
  isOpen: boolean;
  onClose: () => void;
  onStartDM: (userId: string) => void;
}

interface UserProfile {
  id: string; username: string; avatar_url: string | null; bio: string | null;
  tier: string; donor_badge: string; status_text: string | null; status_emoji: string | null;
  last_seen_at: string | null; created_at: string;
}

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}
function isOnline(ls: string | null) { return !!ls && Date.now() - new Date(ls).getTime() < 5 * 60 * 1000; }
function formatDate(d: string) { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }

export function ProfileModal({ userId, currentUserId, currentUserTier, isOpen, onClose, onStartDM }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId || !isOpen) return;
    setLoading(true);
    api.get(`/users/${userId}`).then(({ data }) => setProfile(data.user)).catch(() => setProfile(null)).finally(() => setLoading(false));
  }, [userId, isOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose(); };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
      return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleEscape); };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const isMe = userId === currentUserId;
  const online = profile ? isOnline(profile.last_seen_at) : false;

  // ⭐ Un registered/premium peut envoyer un DM à N'IMPORTE QUI (même un guest)
  // Un guest ne peut PAS initier de DM
  const canSendDM = !isMe && currentUserTier !== 'guest';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div ref={modalRef} className="glass-strong rounded-2xl w-[340px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slideUp">
        <div className="h-[90px] bg-gradient-to-r from-[var(--acc)] to-indigo-500 relative">
          <button onClick={onClose} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/20 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/30 transition-all flex items-center justify-center text-sm">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--t3)] text-sm">⏳ Chargement...</div>
        ) : profile ? (
          <>
            <div className="px-5 -mt-[38px]">
              <div className="relative inline-block">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-[76px] h-[76px] rounded-2xl border-4 border-[var(--bg)] shadow-[0_8px_24px_rgba(0,0,0,0.3)] object-cover" />
                ) : (
                  <div className={`w-[76px] h-[76px] rounded-2xl border-4 border-[var(--bg)] bg-gradient-to-br ${getAvatarColor(profile.username)} flex items-center justify-center text-2xl font-bold text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)]`}>
                    {profile.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-[3px] border-[var(--bg)] ${online ? 'bg-[var(--on)]' : 'bg-[var(--t3)]'}`} />
              </div>
            </div>

            <div className="px-5 pt-3 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold">{profile.username}</h2>
                {profile.tier === 'premium' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/25 to-red-500/25 text-amber-300 border border-amber-500/20">⭐ PREMIUM</span>}
                {profile.tier === 'guest' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--badge-g)] text-[var(--t3)] border border-[var(--border)]">INVITÉ</span>}
                {profile.donor_badge && profile.donor_badge !== 'none' && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/20">
                    {profile.donor_badge === 'supporter' ? '❤️' : profile.donor_badge === 'mecene' ? '💎' : '👑'} {profile.donor_badge.toUpperCase()}
                  </span>
                )}
              </div>

              {profile.status_text && (
                <div className="text-xs text-[var(--t2)] mb-2 flex items-center gap-1.5">
                  {profile.status_emoji && <span>{profile.status_emoji}</span>}
                  <span>{profile.status_text}</span>
                </div>
              )}

              <div className="text-[11px] text-[var(--t3)] mb-3">
                {online ? '🟢 En ligne' : profile.last_seen_at ? `Vu ${formatDate(profile.last_seen_at)}` : 'Hors ligne'}
              </div>

              <div className="h-px bg-[var(--border)] my-3" />

              <div className="mb-3">
                <div className="text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1">À propos</div>
                <div className="text-[12px] text-[var(--t2)] leading-relaxed">{profile.bio || 'Aucune description.'}</div>
              </div>

              <div className="mb-4">
                <div className="text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1">Membre depuis</div>
                <div className="text-[12px] text-[var(--t2)]">{formatDate(profile.created_at)}</div>
              </div>

              {/* ⭐ Bouton DM — visible pour registered/premium vers N'IMPORTE QUI */}
              {canSendDM && (
                <button onClick={() => { onStartDM(profile.id); onClose(); }}
                  className="w-full py-2.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_16px_var(--acc-g)] hover:brightness-110 transition-all">
                  💬 Envoyer un message
                </button>
              )}
              {isMe && <div className="text-center text-[10px] text-[var(--t3)]">C&apos;est votre profil</div>}
              {!isMe && currentUserTier === 'guest' && (
                <div className="text-center text-[10px] text-[var(--t3)]">Créez un compte pour envoyer des messages privés</div>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-[var(--t3)] text-sm">Utilisateur introuvable</div>
        )}
      </div>
    </div>
  );
}
