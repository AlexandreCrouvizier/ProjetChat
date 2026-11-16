/**
 * components/chat/MessageInput.tsx — Phase 4.1b
 *
 * Nouveautés :
 *   - Drag & drop d'images sur la zone de saisie
 *   - Zone de staging : l'image/fichier est affiché AVANT envoi
 *     (miniature pour les images, icône pour les fichiers)
 *   - L'utilisateur peut ajouter un texte de légende
 *   - Annulation possible avant envoi (bouton ✕)
 *   - Enter ou bouton ➤ déclenchent l'upload + envoi
 */
'use client';

import {
  useState, useCallback, useRef, useEffect,
  type KeyboardEvent, type ChangeEvent, type DragEvent,
} from 'react';
import { EmojiPicker }     from './EmojiPicker';
import { MentionDropdown } from './MentionDropdown';
import { GifPicker }       from './GifPicker';
import { useMentions }     from '@/hooks/useMentions';
import { uploadImage, uploadFile } from '@/lib/api';

interface MessageInputProps {
  onSend:       (content: string) => Promise<void>;
  onSendMedia:  (params: { type: 'image' | 'gif' | 'file'; file_url?: string; gif_url?: string; content?: string }) => Promise<void>;
  onTyping:     () => void;
  channelName:  string;
  disabled?:    boolean;
  groupId?:     string | null;
  currentTier?: string;
}

interface StagedFile {
  file:        File;
  uploadType:  'image' | 'file';
  previewUrl:  string | null; // object URL pour images
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf')                                     return '📄';
  if (['doc','docx'].includes(ext))                     return '📝';
  if (['xls','xlsx','csv'].includes(ext))               return '📊';
  if (['zip','rar','7z'].includes(ext))                 return '🗜️';
  if (['mp3','wav','ogg'].includes(ext))                return '🎵';
  if (['mp4','mov','avi','webm'].includes(ext))         return '🎬';
  return '📎';
}

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const IMAGE_EXTS = ['jpg','jpeg','png','gif','webp'];
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTS.includes(file.name.split('.').pop()?.toLowerCase() || '');
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function MessageInput({
  onSend, onSendMedia, onTyping, channelName, disabled, groupId, currentTier,
}: MessageInputProps) {
  const [content,        setContent]        = useState('');
  const [sending,        setSending]        = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState(null as string | null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker,  setShowGifPicker]  = useState(false);
  const [staged,         setStaged]         = useState(null as StagedFile | null);
  const [isDragOver,     setIsDragOver]     = useState(false);

  const inputRef      = useRef(null as HTMLInputElement | null);
  const imageInputRef = useRef(null as HTMLInputElement | null);
  const fileInputRef  = useRef(null as HTMLInputElement | null);
  const attachBtnRef  = useRef(null as HTMLButtonElement | null);

  const { suggestions, isOpen, handleInputChange, selectMention, closeSuggestions } = useMentions(groupId || null);
  const isPremium    = currentTier === 'premium';
  const isRegistered = currentTier === 'registered' || currentTier === 'premium';

  // Auto-focus au changement de canal
  useEffect(() => {
    if (!disabled) setTimeout(() => inputRef.current?.focus(), 200);
  }, [channelName, disabled]);

  // Nettoyer l'object URL quand staged change
  useEffect(() => {
    return () => { if (staged?.previewUrl) URL.revokeObjectURL(staged.previewUrl); };
  }, [staged]);

  // Fermer menu attachement au clic extérieur
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (attachBtnRef.current && !attachBtnRef.current.contains(e.target as Node))
        setShowAttachMenu(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  // ─── Stager un fichier (sans upload immédiat) ─────────────────────────────

  const stageFile = useCallback((file: File) => {
    if (disabled || uploading) return;
    setUploadError(null);
    setShowAttachMenu(false);

    const isImg = isImageFile(file);
    // ⭐ Cahier des charges : image = registered+premium seulement, fichier = premium seulement
    if (!isRegistered) {
      showModal('Le partage de médias est réservé aux membres inscrits. Créez un compte gratuitement !', 'warning');
      return;
    }
    if (!isImg && !isPremium) {
      showModal('Le partage de fichiers est réservé aux membres Premium. ⭐', 'warning');
      return;
    }

    // Vérification taille côté client (early fail)
    const maxBytes = isImg
      ? (currentTier === 'premium' ? 25 * 1024 * 1024 : 5 * 1024 * 1024)
      : 100 * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`Fichier trop volumineux (max ${readableSize(maxBytes)}).`);
      return;
    }

    const previewUrl = isImg ? URL.createObjectURL(file) : null;
    setStaged({ file, uploadType: isImg ? 'image' : 'file', previewUrl });
    // Focus sur l'input pour permettre une légende
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [disabled, uploading, currentTier]);

  const cancelStaged = useCallback(() => {
    setStaged(null);
    setUploadError(null);
  }, []);

  // ─── Envoi (texte seul ou média stagé + légende) ──────────────────────────

  const handleSend = useCallback(async () => {
    if (sending || disabled || uploading) return;

    // Cas 1 : fichier stagé → upload + envoi
    if (staged) {
      if (staged.file.size === 0) return;
      setSending(true);
      setUploading(true);
      try {
        const upFn = staged.uploadType === 'image' ? uploadImage : uploadFile;
        const { url } = await upFn(staged.file);
        await onSendMedia({
          type: staged.uploadType,
          file_url: url,
          content: content.trim() || staged.file.name,
        });
        setStaged(null);
        setContent('');
      } catch (err: any) {
        setUploadError(err.message || 'Erreur upload');
      }
      setUploading(false);
      setSending(false);
      inputRef.current?.focus();
      return;
    }

    // Cas 2 : texte seul
    if (!content.trim()) return;
    closeSuggestions();
    setSending(true);
    try { await onSend(content); setContent(''); } catch {}
    setSending(false);
    inputRef.current?.focus();
  }, [sending, disabled, uploading, staged, content, onSend, onSendMedia, closeSuggestions]);

  // ─── Keyboard ────────────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isOpen && ['ArrowDown','ArrowUp','Tab'].includes(e.key)) return;
    if (e.key === 'Enter' && !e.shiftKey && !isOpen) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') {
      if (isOpen) closeSuggestions();
      else if (staged) cancelStaged();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setContent(value);
    if (value.trim() && !staged) onTyping();
    handleInputChange(value, e.target.selectionStart || value.length);
  };

  const handleMentionSelect = (username: string) => {
    const { newText, newCursorPos } = selectMention(content, username);
    setContent(newText);
    setTimeout(() => {
      const i = inputRef.current;
      if (i) { i.selectionStart = i.selectionEnd = newCursorPos; i.focus(); }
    }, 0);
  };

  const handleEmojiSelect = (emoji: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || content.length;
      setContent(content.slice(0, start) + emoji + content.slice(start));
      setTimeout(() => { input.selectionStart = input.selectionEnd = start + emoji.length; input.focus(); }, 0);
    } else setContent(prev => prev + emoji);
  };

  // ─── File inputs (sélection classique) ────────────────────────────────────

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) stageFile(file);
    e.target.value = '';
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) stageFile(file);
    e.target.value = '';
  };

  // ─── Drag & Drop ─────────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Ne pas masquer si on glisse sur un enfant
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  };

  // ─── GIF ──────────────────────────────────────────────────────────────────

  const handleGifSelect = async (url: string) => {
    setShowGifPicker(false);
    try { await onSendMedia({ type: 'gif', gif_url: url, content: '' }); }
    catch (err: any) { setUploadError(err.message || 'Erreur envoi GIF'); }
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const canSend = !sending && !disabled && !uploading && (!!staged || !!content.trim());

  return (
    <div className="px-4 py-3"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Inputs fichier cachés */}
      <input ref={imageInputRef} type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden" onChange={handleImageChange} />
      <input ref={fileInputRef} type="file"
        className="hidden" onChange={handleFileChange} />

      {/* Overlay drag & drop */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 rounded-2xl flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(139,92,246,0.12)', border: '2px dashed var(--acc)', borderRadius: '1rem' }}>
          <div className="text-center">
            <div className="text-3xl mb-1">📎</div>
            <p className="text-[13px] font-semibold text-[var(--acc)]">Déposer pour joindre</p>
          </div>
        </div>
      )}

      {/* Message d'erreur */}
      {uploadError && (
        <div className="mb-2 px-3 py-2 rounded-xl text-[12px] text-red-400 flex items-center justify-between gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span>⚠️ {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">✕</button>
        </div>
      )}

      {/* ─── Zone de staging ─────────────────────────────────────────────── */}
      {staged && (
        <div className="mb-2 px-3 py-2.5 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>

          {/* Aperçu */}
          {staged.uploadType === 'image' && staged.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={staged.previewUrl} alt="Aperçu"
              className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
              style={{ border: '1px solid rgba(139,92,246,0.3)' }} />
          ) : (
            <span className="text-3xl flex-shrink-0">{fileIcon(staged.file.name)}</span>
          )}

          {/* Infos */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--t1)] truncate">{staged.file.name}</p>
            <p className="text-[11px] text-[var(--t3)]">
              {readableSize(staged.file.size)}
              {staged.uploadType === 'image' && ' · Image'}
              {staged.uploadType === 'file' && ' · Fichier'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(139,92,246,0.7)' }}>
              {uploading ? '⏳ Upload en cours…' : '↵ Entrée ou ➤ pour envoyer · Échap pour annuler'}
            </p>
          </div>

          {/* Annuler */}
          {!uploading && (
            <button onClick={cancelStaged}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all flex-shrink-0 text-sm">
              ✕
            </button>
          )}
        </div>
      )}

      {/* ─── Barre de saisie ─────────────────────────────────────────────── */}
      <div className={`relative flex items-center gap-1.5 p-1.5 rounded-2xl border border-[var(--border)] bg-[var(--inp)] backdrop-blur-2xl transition-all shadow-[var(--inset)]
        ${!disabled ? 'focus-within:border-[var(--border-f)] focus-within:shadow-[0_0_40px_rgba(139,92,246,0.1)]' : 'opacity-50'}
        ${isDragOver ? 'border-[var(--acc)]' : ''}`}>

        <MentionDropdown suggestions={suggestions} isOpen={isOpen} onSelect={handleMentionSelect} onClose={closeSuggestions} />

        {/* Bouton 📎 */}
        <div className="relative flex-shrink-0">
          <button ref={attachBtnRef} disabled={disabled || uploading}
            onClick={() => setShowAttachMenu(v => !v)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              uploading ? 'text-[var(--acc)] animate-pulse cursor-wait' : 'text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)]'
            }`} title="Joindre une image ou un fichier">
            {uploading ? '⏳' : '📎'}
          </button>

          {showAttachMenu && !disabled && !uploading && (
            <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl overflow-hidden z-30" style={{ background: "rgba(18, 16, 32, 0.97)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)", backdropFilter: "blur(0px)" }}>
              <button
                onClick={() => {
                  if (!isRegistered) {
                    showModal('Le partage de médias est réservé aux membres inscrits.', 'warning');
                    setShowAttachMenu(false);
                    return;
                  }
                  setShowAttachMenu(false);
                  imageInputRef.current?.click();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors text-left ${isRegistered ? 'text-[var(--t1)] hover:bg-[var(--glass-h)]' : 'text-[var(--t3)] cursor-default'}`}>
                <span>🖼️</span>
                <div>
                  <div className="font-medium flex items-center gap-1">
                    Image
                    {!isRegistered && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded">INSCRIT</span>}
                  </div>
                  <div className="text-[10px] text-[var(--t3)]">{isPremium ? 'JPG/PNG/GIF · max 25 Mo' : 'JPG/PNG/GIF · max 5 Mo'}</div>
                </div>
              </button>
              <div className="h-px bg-[var(--border)] mx-2" />
              <button
                onClick={() => {
                  if (!isPremium) { setUploadError('Le partage de fichiers est réservé aux membres Premium.'); setShowAttachMenu(false); return; }
                  setShowAttachMenu(false); fileInputRef.current?.click();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors text-left ${
                  isPremium ? 'text-[var(--t1)] hover:bg-[var(--glass-h)]' : 'text-[var(--t3)] cursor-default'
                }`}>
                <span>📁</span>
                <div>
                  <div className="font-medium flex items-center gap-1">
                    Fichier
                    {!isPremium && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">PREMIUM</span>}
                  </div>
                  <div className="text-[10px] text-[var(--t3)]">Tous types · max 100 Mo</div>
                </div>
              </button>
              <div className="h-px bg-[var(--border)] mx-2" />
              <div className="px-3 py-1.5 text-[10px] text-[var(--t3)]">💡 Glisser-déposer aussi supporté</div>
            </div>
          )}
        </div>

        {/* Bouton GIF */}
        <button disabled={disabled || uploading}
          onClick={() => { setShowGifPicker(v => !v); setShowAttachMenu(false); }}
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold transition-all flex-shrink-0 ${
            showGifPicker
              ? 'bg-[var(--acc)] text-white shadow-[0_0_10px_var(--acc-g)]'
              : 'text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)]'
          }`} title="Envoyer un GIF">
          GIF
        </button>

        {/* Champ texte */}
        <input ref={inputRef} type="text" value={content}
          onChange={handleChange} onKeyDown={handleKeyDown}
          placeholder={
            uploading   ? 'Upload en cours…' :
            staged      ? `Ajouter une légende (optionnel)…` :
            disabled    ? 'Sélectionnez un salon' :
                          `Envoyer un message dans #${channelName}`
          }
          disabled={disabled || uploading} maxLength={4000}
          className="flex-1 py-2 px-1.5 bg-transparent text-[13px] text-[var(--t1)] outline-none placeholder:text-[var(--t3)] disabled:cursor-not-allowed"
        />

        <EmojiPicker onSelect={handleEmojiSelect} />

        <button onClick={handleSend} disabled={!canSend}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--acc)] to-indigo-500 text-white flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_14px_var(--acc-g)] hover:brightness-110 hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
          title={staged ? 'Envoyer le fichier' : 'Envoyer'}>
          ➤
        </button>
      </div>

      {/* GifPicker */}
      {showGifPicker && (
        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
      )}
    </div>
  );
}
