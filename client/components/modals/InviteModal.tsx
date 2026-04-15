/**
 * components/modals/InviteModal.tsx — Gestion des invitations à un salon privé
 *
 * Permet au créateur / admin de :
 *   - Générer un lien d'invitation (durée + nb d'utilisations max)
 *   - Copier le lien en un clic
 *   - Voir les liens actifs existants
 *   - Désactiver un lien
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

interface Invitation {
  id: string;
  code: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  created_at: string;
}

interface InviteModalProps {
  isOpen: boolean;
  groupId: string;
  groupName: string;
  onClose: () => void;
}

const DURATIONS = [
  { label: '30 min', hours: 0.5 },
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7j', hours: 168 },
  { label: 'Permanent', hours: 0 },
];
const MAX_USES_OPTIONS = [
  { label: '1 utilisation', value: 1 },
  { label: '5 utilisations', value: 5 },
  { label: '10 utilisations', value: 10 },
  { label: '25 utilisations', value: 25 },
  { label: 'Illimité', value: 0 },
];

export function InviteModal({ isOpen, groupId, groupName, onClose }: InviteModalProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(6); // index dans DURATIONS
  const [selectedMaxUses, setSelectedMaxUses] = useState(4);   // index dans MAX_USES_OPTIONS
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/groups/${groupId}/invitations`);
      setInvitations(data.invitations || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setNewLink(null);
      setCopied(false);
      loadInvitations();
    }
  }, [isOpen, groupId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      document.addEventListener('mousedown', handleClick);
      return () => {
        document.removeEventListener('keydown', handleKey);
        document.removeEventListener('mousedown', handleClick);
      };
    }
  }, [isOpen, onClose]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const dur = DURATIONS[selectedDuration];
      const maxU = MAX_USES_OPTIONS[selectedMaxUses];
      const { data } = await api.post(`/groups/${groupId}/invite`, {
        expires_in_hours: dur.hours || undefined,
        max_uses: maxU.value || undefined,
      });
      const link = `${appUrl}/chat_group?invite=${data.invitation.code}`;
      setNewLink(link);
      await loadInvitations();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur lors de la création');
    }
    setCreating(false);
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const deactivate = async (id: string) => {
    try {
      await api.delete(`/groups/${groupId}/invitations/${id}`);
      setInvitations(prev => prev.filter(i => i.id !== id));
    } catch {}
  };

  const formatExpiry = (exp: string | null) => {
    if (!exp) return 'Permanent';
    const d = new Date(exp);
    if (d < new Date()) return 'Expiré';
    return `Expire ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div ref={modalRef}
        className="glass-strong rounded-2xl w-[480px] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slideUp">

        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">🔗 Inviter dans #{groupName}</h2>
            <p className="text-xs mt-0.5 text-[var(--t3)]">Partagez ce lien pour inviter des membres</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all text-sm">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Lien généré */}
          {newLink && (
            <div className="p-4 rounded-xl animate-slideUp"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <div className="text-[10px] font-semibold text-[var(--acc)] uppercase tracking-wider mb-2">
                ✅ Lien créé — copiez-le maintenant
              </div>
              <div className="flex items-center gap-2">
                <input readOnly value={newLink}
                  className="flex-1 p-2 rounded-lg text-xs text-[var(--t1)] outline-none truncate"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  onClick={e => (e.target as HTMLInputElement).select()} />
                <button onClick={() => copyLink(newLink)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all flex-shrink-0"
                  style={{ background: copied ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.4)', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.5)'}` }}>
                  {copied ? '✓ Copié !' : '📋 Copier'}
                </button>
              </div>
            </div>
          )}

          {/* Configurateur */}
          <div className="space-y-4">
            <div>
              <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">
                Durée de validité
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {DURATIONS.map((d, i) => (
                  <button key={i} onClick={() => setSelectedDuration(i)}
                    className="py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: selectedDuration === i ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedDuration === i ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: selectedDuration === i ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                    }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">
                Nombre d&apos;utilisations maximum
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {MAX_USES_OPTIONS.map((m, i) => (
                  <button key={i} onClick={() => setSelectedMaxUses(i)}
                    className="py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: selectedMaxUses === i ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedMaxUses === i ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: selectedMaxUses === i ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                    }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
              {creating ? '⏳ Génération...' : '🔗 Générer un lien d\'invitation'}
            </button>
          </div>

          {/* Liens actifs existants */}
          {invitations.length > 0 && (
            <div>
              <div className="text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">
                Liens actifs ({invitations.length})
              </div>
              <div className="space-y-2">
                {invitations.map(inv => {
                  const link = `${appUrl}/chat_group?invite=${inv.code}`;
                  const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
                  return (
                    <div key={inv.id}
                      className="flex items-center gap-2 p-2.5 rounded-xl"
                      style={{
                        background: expired ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${expired ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        opacity: expired ? 0.6 : 1,
                      }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-mono text-[var(--t2)] truncate">?invite={inv.code}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-[var(--t3)]">
                          <span>🎟 {inv.use_count}{inv.max_uses ? `/${inv.max_uses}` : ''} utilisations</span>
                          <span>·</span>
                          <span style={{ color: expired ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                            {formatExpiry(inv.expires_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {!expired && (
                          <button onClick={() => copyLink(link)} title="Copier"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all text-xs">
                            📋
                          </button>
                        )}
                        <button onClick={() => deactivate(inv.id)} title="Désactiver"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs">
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
