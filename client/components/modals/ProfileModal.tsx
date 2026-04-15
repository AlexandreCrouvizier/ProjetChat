/**
 * components/modals/ProfileModal.tsx — Phase 3 Étape 5
 * 
 * Actions disponibles sur le profil d'un autre utilisateur :
 *   - 💬 Envoyer un message (DM) — registered/premium uniquement
 *   - 🚫 Bloquer / Débloquer — registered/premium uniquement
 *   - 🚩 Signaler l'utilisateur — registered/premium uniquement
 * 
 * Le bouton Signaler ouvre une mini-modale inline (pas le ReportModal de message)
 * Le blocage se fait via POST/DELETE /api/users/:id/block
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

const REPORT_REASONS = [
  { value: 'spam', label: '📢 Spam' },
  { value: 'harassment', label: '😤 Harcèlement' },
  { value: 'hate_speech', label: '🚫 Discours haineux' },
  { value: 'inappropriate', label: '🔞 Contenu inapproprié' },
  { value: 'fake_account', label: '🎭 Faux compte' },
  { value: 'other', label: '📝 Autre' },
];

export function ProfileModal({ userId, currentUserId, currentUserTier, isOpen, onClose, onStartDM }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  // Report inline
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportText, setReportText] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);

  // Charger le profil + statut de blocage
  useEffect(() => {
    if (!userId || !isOpen) return;
    setLoading(true);
    setShowReport(false);
    setReportSuccess(false);
    setReportError('');
    setReportReason('');
    setReportText('');

    Promise.all([
      api.get(`/users/${userId}`),
      currentUserTier !== 'guest'
        ? api.get(`/users/${userId}/block-status`).catch(() => ({ data: { is_blocked: false } }))
        : Promise.resolve({ data: { is_blocked: false } }),
    ]).then(([profileRes, blockRes]) => {
      setProfile(profileRes.data.user);
      setIsBlocked(blockRes.data.is_blocked);
    }).catch(() => {
      setProfile(null);
    }).finally(() => {
      setLoading(false);
    });
  }, [userId, isOpen, currentUserTier]);

  // Fermer au clic extérieur / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose(); };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (showReport) setShowReport(false); else onClose(); } };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
      return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleEscape); };
    }
  }, [isOpen, onClose, showReport]);

  // Bloquer / Débloquer
  const handleToggleBlock = async () => {
    if (!profile) return;
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await api.delete(`/users/${profile.id}/block`);
        setIsBlocked(false);
      } else {
        if (!confirm(`Bloquer ${profile.username} ? Cette personne ne pourra plus vous envoyer de messages privés et vous ne verrez plus ses messages.`)) {
          setBlockLoading(false);
          return;
        }
        await api.post(`/users/${profile.id}/block`);
        setIsBlocked(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
    setBlockLoading(false);
  };

  // Signaler l'utilisateur
  const handleReportSubmit = async () => {
    if (!reportReason) { setReportError('Sélectionnez un motif'); return; }
    if (reportReason === 'other' && !reportText.trim()) { setReportError('Précisez le motif'); return; }
    setReportSending(true);
    setReportError('');
    try {
      // On utilise l'API modération existante — on crée un report sans message_id
      // mais avec le reported_user_id. Le backend gère les deux cas.
      await api.post('/moderation/reports', {
        reported_user_id: profile?.id,
        reason: reportReason,
        reason_text: reportText.trim() || undefined,
      });
      setReportSuccess(true);
      setTimeout(() => setShowReport(false), 1500);
    } catch (err: any) {
      setReportError(err.response?.data?.message || 'Erreur lors du signalement');
    }
    setReportSending(false);
  };

  if (!isOpen) return null;
  const isMe = userId === currentUserId;
  const online = profile ? isOnline(profile.last_seen_at) : false;
  const canInteract = !isMe && currentUserTier !== 'guest';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div ref={modalRef} className="glass-strong rounded-2xl w-[340px] max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slideUp">
        {/* Bannière */}
        <div className="h-[90px] bg-gradient-to-r from-[var(--acc)] to-indigo-500 relative">
          <button onClick={onClose} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/20 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/30 transition-all flex items-center justify-center text-sm">✕</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[var(--t3)] text-sm">⏳ Chargement...</div>
        ) : profile ? (
          <>
            {/* Avatar */}
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
              {/* Nom + badges */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-lg font-bold">{profile.username}</h2>
                {profile.tier === 'premium' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/25 to-red-500/25 text-amber-300 border border-amber-500/20">⭐ PREMIUM</span>}
                {profile.tier === 'guest' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--badge-g)] text-[var(--t3)] border border-[var(--border)]">INVITÉ</span>}
                {profile.donor_badge && profile.donor_badge !== 'none' && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/20">
                    {profile.donor_badge === 'supporter' ? '❤️' : profile.donor_badge === 'mecene' ? '💎' : '👑'} {profile.donor_badge.toUpperCase()}
                  </span>
                )}
                {isBlocked && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/20">🚫 BLOQUÉ</span>}
              </div>

              {/* Statut */}
              {profile.status_text && (
                <div className="text-xs text-[var(--t2)] mb-2 flex items-center gap-1.5">
                  {profile.status_emoji && <span>{profile.status_emoji}</span>}
                  <span>{profile.status_text}</span>
                </div>
              )}

              {/* En ligne / Hors ligne */}
              <div className="text-[11px] text-[var(--t3)] mb-3">
                {online ? '🟢 En ligne' : profile.last_seen_at ? `Vu ${formatDate(profile.last_seen_at)}` : 'Hors ligne'}
              </div>

              <div className="h-px bg-[var(--border)] my-3" />

              {/* Bio */}
              <div className="mb-3">
                <div className="text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1">À propos</div>
                <div className="text-[12px] text-[var(--t2)] leading-relaxed">{profile.bio || 'Aucune description.'}</div>
              </div>

              {/* Membre depuis */}
              <div className="mb-4">
                <div className="text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1">Membre depuis</div>
                <div className="text-[12px] text-[var(--t2)]">{formatDate(profile.created_at)}</div>
              </div>

              {/* ⭐ Actions — visibles uniquement pour registered/premium sur un autre user */}
              {canInteract && !showReport && (
                <div className="space-y-2">
                  {/* DM — pas si bloqué */}
                  {!isBlocked && (
                    <button onClick={() => { onStartDM(profile.id); onClose(); }}
                      className="w-full py-2.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_16px_var(--acc-g)] hover:brightness-110 transition-all">
                      💬 Envoyer un message
                    </button>
                  )}

                  <div className="flex gap-2">
                    {/* Bloquer / Débloquer */}
                    <button onClick={handleToggleBlock} disabled={blockLoading}
                      className={`flex-1 py-2 rounded-xl font-semibold text-sm border transition-all disabled:opacity-50
                        ${isBlocked
                          ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                          : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                        }`}>
                      {blockLoading ? '⏳' : isBlocked ? '✅ Débloquer' : '🚫 Bloquer'}
                    </button>

                    {/* Signaler */}
                    <button onClick={() => { setShowReport(true); setReportSuccess(false); setReportError(''); setReportReason(''); }}
                      className="flex-1 py-2 rounded-xl font-semibold text-sm border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all">
                      🚩 Signaler
                    </button>
                  </div>
                </div>
              )}

              {/* ⭐ Formulaire de signalement inline */}
              {canInteract && showReport && (
                <div className="mt-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--glass)]">
                  {reportSuccess ? (
                    <div className="text-center py-3">
                      <div className="text-2xl mb-1">✅</div>
                      <div className="text-sm font-semibold text-[var(--t1)]">Signalement envoyé</div>
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] font-semibold text-[var(--t1)] mb-2">Signaler {profile.username}</div>
                      {reportError && <div className="mb-2 text-[11px] text-red-400">{reportError}</div>}

                      <div className="grid grid-cols-2 gap-1 mb-2">
                        {REPORT_REASONS.map(r => (
                          <button key={r.value} onClick={() => setReportReason(r.value)}
                            className={`px-2 py-1.5 rounded-lg text-[10px] text-left border transition-all
                              ${reportReason === r.value ? 'bg-[var(--acc-s)] border-[var(--acc)] text-[var(--acc)]' : 'border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)]'}`}>
                            {r.label}
                          </button>
                        ))}
                      </div>

                      {reportReason === 'other' && (
                        <textarea value={reportText} onChange={e => setReportText(e.target.value)}
                          maxLength={300} rows={2} placeholder="Précisez..."
                          className="w-full mb-2 p-2 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[var(--t1)] text-[11px] outline-none focus:border-[var(--border-f)] resize-none" />
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => setShowReport(false)}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)] transition-all">
                          Annuler
                        </button>
                        <button onClick={handleReportSubmit} disabled={reportSending || !reportReason}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-gradient-to-r from-red-500 to-orange-500 hover:brightness-110 transition-all disabled:opacity-50">
                          {reportSending ? '⏳' : 'Envoyer'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Message pour soi-même */}
              {isMe && <div className="text-center text-[10px] text-[var(--t3)]">C&apos;est votre profil</div>}

              {/* Message pour les invités */}
              {!isMe && currentUserTier === 'guest' && (
                <div className="text-center text-[10px] text-[var(--t3)]">Créez un compte pour interagir</div>
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
