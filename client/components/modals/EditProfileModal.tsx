/**
 * components/modals/EditProfileModal.tsx — FIXED: emoji picker statut + avatar save
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface EditProfileModalProps { isOpen: boolean; onClose: () => void; }

const STATUS_PRESETS = [
  { emoji: '🟢', text: 'En ligne' },
  { emoji: '🎮', text: 'En pleine game' },
  { emoji: '💼', text: 'Au travail' },
  { emoji: '🎵', text: 'Écoute de la musique' },
  { emoji: '📚', text: 'En train d\'étudier' },
  { emoji: '😴', text: 'Ne pas déranger' },
  { emoji: '🍕', text: 'En train de manger' },
  { emoji: '🏃', text: 'AFK' },
];

const STATUS_EMOJIS = ['😀','😎','🤓','🎮','💼','🎵','📚','😴','🍕','🏃','🔥','❤️','⭐','🌙','☀️','🎯','🎨','✈️','🏠','💻'];
const BIO_MAX = 500;

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { user, setUser } = useAuthStore();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusEmoji, setStatusEmoji] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      setUsername(user.username || '');
      setBio(user.bio || '');
      setStatusText(user.status_text || '');
      setStatusEmoji(user.status_emoji || '');
      setAvatarPreview(user.avatar_url || null);
      setAvatarChanged(false);
      setShowEmojiPicker(false);
      setError(''); setSuccess('');
    }
  }, [isOpen, user]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (showEmojiPicker) setShowEmojiPicker(false); else onClose(); } };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
      return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleEscape); };
    }
  }, [isOpen, onClose, showEmojiPicker]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Seules les images sont acceptées'); return; }
    if (file.size > 500 * 1024) { setError('Image trop volumineuse (max 500KB)'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => { setAvatarPreview(event.target?.result as string); setAvatarChanged(true); };
    reader.readAsDataURL(file);
  };

  const handleDeleteAvatar = () => { setAvatarPreview(null); setAvatarChanged(true); };

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      // 1. Profil
      const { data: profileData } = await api.patch('/users/me', { username: username.trim(), bio: bio.trim() });

      // 2. Avatar si modifié
      if (avatarChanged) {
        if (avatarPreview) {
          await api.patch('/users/me/avatar', { avatar_url: avatarPreview });
        } else {
          await api.delete('/users/me/avatar');
        }
      }

      // 3. Statut
      await api.patch('/users/me/status', { status_text: statusText.trim(), status_emoji: statusEmoji.trim() });

      setUser({ ...profileData.user, avatar_url: avatarChanged ? avatarPreview : profileData.user.avatar_url, status_text: statusText.trim(), status_emoji: statusEmoji.trim() });
      setSuccess('Profil mis à jour !');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde');
    }
    setSaving(false);
  };

  if (!isOpen) return null;
  const bioRemaining = BIO_MAX - bio.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div ref={modalRef} className="glass-strong rounded-2xl w-[420px] max-h-[85vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slideUp">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-bold">Modifier le profil</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all text-sm">✕</button>
        </div>

        <div className="p-6">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          {success && <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">{success}</div>}

          {/* Avatar */}
          <div className="mb-5">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-2">Avatar</label>
            <div className="flex items-center gap-4">
              <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border-2 border-[var(--border)] group-hover:border-[var(--acc)] transition-colors" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--acc)] to-indigo-500 flex items-center justify-center text-2xl font-bold text-white">{username.charAt(0).toUpperCase() || '?'}</div>
                )}
                <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">📷</div>
              </div>
              <div>
                <button onClick={() => fileInputRef.current?.click()} className="text-xs text-[var(--acc)] hover:underline">Changer</button>
                {avatarPreview && <button onClick={handleDeleteAvatar} className="text-xs text-red-400 hover:underline ml-3">Supprimer</button>}
                <p className="text-[10px] text-[var(--t3)] mt-0.5">JPG, PNG, GIF — Max 500KB</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
          </div>

          {/* Pseudo */}
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Pseudo</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} maxLength={30} minLength={3}
              className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all" />
          </div>

          {/* Bio */}
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">
              Bio <span className={`ml-1 ${bioRemaining < 50 ? (bioRemaining < 0 ? 'text-red-400' : 'text-amber-400') : 'text-[var(--t3)]'}`}>({bio.length}/{BIO_MAX})</span>
            </label>
            <textarea value={bio} onChange={e => { if (e.target.value.length <= BIO_MAX) setBio(e.target.value); }} maxLength={BIO_MAX} rows={3} placeholder="Parlez de vous..."
              className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all resize-none" />
            <div className="w-full h-1 rounded-full bg-[var(--border)] mt-1 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${bioRemaining < 50 ? (bioRemaining < 0 ? 'bg-red-500' : 'bg-amber-500') : 'bg-[var(--acc)]'}`}
                style={{ width: `${Math.min((bio.length / BIO_MAX) * 100, 100)}%` }} />
            </div>
          </div>

          {/* ⭐ Statut — emoji picker au lieu de text input */}
          <div className="mb-5">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Statut</label>
            <div className="flex gap-2 mb-2">
              {/* ⭐ Emoji : bouton qui ouvre un mini picker */}
              <div className="relative" ref={emojiPickerRef}>
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-12 h-[42px] rounded-lg border border-[var(--border)] bg-[var(--glass)] text-center text-lg flex items-center justify-center hover:border-[var(--border-f)] transition-all cursor-pointer"
                >
                  {statusEmoji || '😀'}
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-14 left-0 glass-strong rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-2 z-50 animate-slideUp">
                    <div className="grid grid-cols-5 gap-1">
                      {STATUS_EMOJIS.map(emoji => (
                        <button key={emoji} onClick={() => { setStatusEmoji(emoji); setShowEmojiPicker(false); }}
                          className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-colors cursor-pointer
                            ${statusEmoji === emoji ? 'bg-[var(--acc-s)] border border-[var(--acc)]' : 'hover:bg-[var(--glass-h)]'}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {statusEmoji && (
                      <button onClick={() => { setStatusEmoji(''); setShowEmojiPicker(false); }}
                        className="w-full mt-1 text-[10px] text-red-400 hover:underline text-center py-1">
                        Retirer l&apos;emoji
                      </button>
                    )}
                  </div>
                )}
              </div>
              <input type="text" value={statusText} onChange={e => setStatusText(e.target.value)} maxLength={100} placeholder="Que faites-vous ?"
                className="flex-1 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all" />
            </div>
            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {STATUS_PRESETS.map(preset => {
                const isActive = statusEmoji === preset.emoji && statusText === preset.text;
                return (
                  <button key={preset.text} onClick={() => { setStatusEmoji(preset.emoji); setStatusText(preset.text); }}
                    className={`text-[10px] px-2 py-1 rounded-lg border transition-all
                      ${isActive ? 'bg-[var(--acc-s)] border-[var(--acc)] text-[var(--acc)]' : 'bg-[var(--glass)] border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)]'}`}>
                    {preset.emoji} {preset.text}
                  </button>
                );
              })}
            </div>
            {(statusText || statusEmoji) && (
              <button onClick={() => { setStatusText(''); setStatusEmoji(''); }} className="text-[10px] text-red-400 hover:underline mt-1.5">Effacer le statut</button>
            )}
          </div>

          {/* Boutons */}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-[var(--border)] text-[var(--t2)] hover:bg-[var(--glass-h)] transition-all">Annuler</button>
            <button onClick={handleSave} disabled={saving || !username.trim()}
              className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_16px_var(--acc-g)] hover:brightness-110 transition-all disabled:opacity-50">
              {saving ? '⏳ Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
