/**
 * components/modals/CreateGroupModal.tsx — Créer un salon public ou privé
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (group: any) => void;
}

export function CreateGroupModal({ isOpen, onClose, onCreated }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [rules, setRules] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(''); setDescription(''); setType('public'); setRules('');
      setError(''); setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 100);
    }
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

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 3) { setError('Le nom doit faire au moins 3 caractères'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/groups', {
        name: name.trim(), description: description.trim() || undefined,
        type, rules: rules.trim() || undefined,
      });
      onCreated(data.group);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création');
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div ref={modalRef} className="glass-strong rounded-2xl w-[420px] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slideUp">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-bold">Créer un salon</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all text-sm">✕</button>
        </div>

        <div className="p-6">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          {/* Type */}
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">Type de salon</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setType('public')}
                className={`p-3 rounded-xl border text-left transition-all ${type === 'public' ? 'bg-[var(--acc-s)] border-[var(--acc)] text-[var(--t1)]' : 'border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)]'}`}>
                <div className="text-lg mb-1">#</div>
                <div className="text-[12px] font-semibold">Public</div>
                <div className="text-[10px] text-[var(--t3)]">Visible par tous</div>
              </button>
              <button onClick={() => setType('private')}
                className={`p-3 rounded-xl border text-left transition-all ${type === 'private' ? 'bg-[var(--acc-s)] border-[var(--acc)] text-[var(--t1)]' : 'border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)]'}`}>
                <div className="text-lg mb-1">🔒</div>
                <div className="text-[12px] font-semibold">Privé</div>
                <div className="text-[10px] text-[var(--t3)]">Sur invitation uniquement</div>
              </button>
            </div>
          </div>

          {/* Nom */}
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Nom du salon</label>
            <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
              maxLength={100} minLength={3} placeholder="ex: jeux-vidéo, musique, dev-web..."
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all" />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">
              Description <span className="text-[var(--t3)]">(optionnel)</span>
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              maxLength={500} rows={2} placeholder="De quoi parle ce salon ?"
              className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all resize-none" />
          </div>

          {/* Règles */}
          <div className="mb-5">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">
              Règles <span className="text-[var(--t3)]">(optionnel)</span>
            </label>
            <textarea value={rules} onChange={e => setRules(e.target.value)}
              maxLength={1000} rows={2} placeholder="Règles de conduite dans ce salon..."
              className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all resize-none" />
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)] transition-all">Annuler</button>
            <button onClick={handleCreate} disabled={saving || !name.trim() || name.trim().length < 3}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_16px_var(--acc-g)] hover:brightness-110 transition-all disabled:opacity-50">
              {saving ? '⏳ Création...' : `Créer le salon ${type === 'private' ? '🔒' : '#'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
