/**
 * components/chat/MessageInput.tsx — Zone de saisie avec emoji picker fonctionnel
 */

'use client';

import { useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { EmojiPicker } from './EmojiPicker';

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  onTyping: () => void;
  channelName: string;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTyping, channelName, disabled }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async () => {
    if (!content.trim() || sending || disabled) return;
    setSending(true);
    try {
      await onSend(content);
      setContent('');
    } catch {
      // L'erreur est gérée par le parent
    }
    setSending(false);
    // Refocus l'input après envoi
    inputRef.current?.focus();
  }, [content, sending, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (value: string) => {
    setContent(value);
    if (value.trim()) onTyping();
  };

  // Quand on sélectionne un emoji, l'insérer à la position du curseur
  const handleEmojiSelect = (emoji: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || content.length;
      const newContent = content.slice(0, start) + emoji + content.slice(start);
      setContent(newContent);
      // Repositionner le curseur après l'emoji
      setTimeout(() => {
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();
      }, 0);
    } else {
      setContent(prev => prev + emoji);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl border border-[var(--border)] bg-[var(--inp)] backdrop-blur-2xl transition-all shadow-[var(--inset)]
        ${!disabled ? 'focus-within:border-[var(--border-f)] focus-within:shadow-[0_0_40px_rgba(139,92,246,0.1)]' : 'opacity-50'}`}>
        
        {/* Bouton fichier (Phase 4) */}
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all flex-shrink-0"
                title="Joindre un fichier (Phase 4)">
          📎
        </button>

        {/* Input texte */}
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Sélectionnez un salon' : `Envoyer un message dans #${channelName}`}
          disabled={disabled}
          maxLength={4000}
          className="flex-1 py-2 px-1.5 bg-transparent text-[13px] text-[var(--t1)] outline-none placeholder:text-[var(--t3)] disabled:cursor-not-allowed"
        />

        {/* Emoji picker (fonctionnel !) */}
        <EmojiPicker onSelect={handleEmojiSelect} />

        {/* Bouton envoyer */}
        <button
          onClick={handleSend}
          disabled={!content.trim() || sending || disabled}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--acc)] to-indigo-500 text-white flex items-center justify-center flex-shrink-0 transition-all
            shadow-[0_0_14px_var(--acc-g)] hover:brightness-110 hover:scale-105 hover:shadow-[0_0_22px_var(--acc-g)]
            disabled:opacity-30 disabled:hover:scale-100 disabled:hover:brightness-100"
          title="Envoyer">
          ➤
        </button>
      </div>
    </div>
  );
}
