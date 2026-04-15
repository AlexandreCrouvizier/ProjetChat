/**
 * components/modals/ReportModal.tsx — Signaler un message
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

interface ReportModalProps {
  isOpen: boolean;
  messageId: string | null;
  messageContent: string;
  authorName: string;
  onClose: () => void;
}

const REASONS = [
  { value: 'spam', label: '📢 Spam / Publicité', desc: 'Messages promotionnels, répétitifs ou non sollicités' },
  { value: 'harassment', label: '😤 Harcèlement', desc: 'Intimidation, menaces ou messages ciblés' },
  { value: 'hate_speech', label: '🚫 Discours haineux', desc: 'Racisme, sexisme, homophobie ou discrimination' },
  { value: 'nsfw', label: '🔞 Contenu inapproprié', desc: 'Contenu sexuel, violent ou choquant' },
  { value: 'misinformation', label: '❌ Désinformation', desc: 'Fausses informations ou manipulation' },
  { value: 'other', label: '📝 Autre', desc: 'Précisez dans le champ ci-dessous' },
];

export function ReportModal({ isOpen, messageId, messageContent, authorName, onClose }: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) { setReason(''); setReasonText(''); setError(''); setSuccess(false); setSending(false); }
  }, [isOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose(); };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
      return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleEscape); };
    }
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    if (!reason) { setError('Sélectionnez un motif'); return; }
    if (reason === 'other' && !reasonText.trim()) { setError('Précisez le motif'); return; }
    setSending(true); setError('');
    try {
      await api.post('/moderation/reports', {
        message_id: messageId,
        reason,
        reason_text: reasonText.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du signalement');
    }
    setSending(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div ref={modalRef} className="glass-strong rounded-2xl w-[440px] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slideUp">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-bold">🚩 Signaler un message</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all text-sm">✕</button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-lg font-semibold text-[var(--t1)]">Signalement envoyé</div>
              <div className="text-sm text-[var(--t3)] mt-1">Merci, nos modérateurs examineront ce message.</div>
            </div>
          ) : (
            <>
              {/* Message signalé */}
              <div className="mb-4 p-3 rounded-xl bg-[var(--glass)] border border-[var(--border)]">
                <div className="text-[10px] text-[var(--t3)] mb-1">Message de <strong className="text-[var(--t2)]">{authorName}</strong></div>
                <div className="text-sm text-[var(--t1)] line-clamp-3">{messageContent}</div>
              </div>

              {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

              {/* Motifs */}
              <div className="mb-4">
                <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">Motif du signalement</label>
                <div className="space-y-1.5">
                  {REASONS.map(r => (
                    <button key={r.value} onClick={() => setReason(r.value)}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${reason === r.value ? 'bg-[var(--acc-s)] border-[var(--acc)]' : 'border-[var(--border)] hover:bg-[var(--glass-h)]'}`}>
                      <div className="text-[12px] font-semibold text-[var(--t1)]">{r.label}</div>
                      <div className="text-[10px] text-[var(--t3)]">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Détail optionnel */}
              <div className="mb-5">
                <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">
                  Détails {reason === 'other' ? '' : '(optionnel)'}
                </label>
                <textarea value={reasonText} onChange={e => setReasonText(e.target.value)}
                  maxLength={500} rows={2} placeholder="Précisions supplémentaires..."
                  className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all resize-none" />
              </div>

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)] transition-all">Annuler</button>
                <button onClick={handleSubmit} disabled={sending || !reason}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-red-500 to-orange-500 hover:brightness-110 transition-all disabled:opacity-50">
                  {sending ? '⏳ Envoi...' : '🚩 Signaler'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
