/**
 * components/chat/MessageInput.tsx — FIXED: auto-focus au changement de canal/PV
 */
'use client';

import { useState, useCallback, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { EmojiPicker } from './EmojiPicker';
import { MentionDropdown } from './MentionDropdown';
import { useMentions } from '@/hooks/useMentions';

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  onTyping: () => void;
  channelName: string;
  disabled?: boolean;
  groupId?: string | null;
}

export function MessageInput({ onSend, onTyping, channelName, disabled, groupId }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, isOpen, handleInputChange, selectMention, closeSuggestions } = useMentions(groupId || null);

  // ⭐ Auto-focus quand le canal change
  useEffect(() => {
    if (!disabled) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [channelName, disabled]);

  const handleSend = useCallback(async () => {
    if (!content.trim() || sending || disabled) return;
    closeSuggestions();
    setSending(true);
    try { await onSend(content); setContent(''); } catch {}
    setSending(false);
    inputRef.current?.focus();
  }, [content, sending, disabled, onSend, closeSuggestions]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) return;
    if (e.key === 'Enter' && !e.shiftKey && !isOpen) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape' && isOpen) closeSuggestions();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setContent(value);
    if (value.trim()) onTyping();
    handleInputChange(value, e.target.selectionStart || value.length);
  };

  const handleMentionSelect = (username: string) => {
    const { newText, newCursorPos } = selectMention(content, username);
    setContent(newText);
    setTimeout(() => { const i = inputRef.current; if (i) { i.selectionStart = i.selectionEnd = newCursorPos; i.focus(); } }, 0);
  };

  const handleEmojiSelect = (emoji: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || content.length;
      setContent(content.slice(0, start) + emoji + content.slice(start));
      setTimeout(() => { input.selectionStart = input.selectionEnd = start + emoji.length; input.focus(); }, 0);
    } else setContent(prev => prev + emoji);
  };

  return (
    <div className="px-4 py-3">
      <div className={`relative flex items-center gap-1.5 p-1.5 rounded-2xl border border-[var(--border)] bg-[var(--inp)] backdrop-blur-2xl transition-all shadow-[var(--inset)]
        ${!disabled ? 'focus-within:border-[var(--border-f)] focus-within:shadow-[0_0_40px_rgba(139,92,246,0.1)]' : 'opacity-50'}`}>
        <MentionDropdown suggestions={suggestions} isOpen={isOpen} onSelect={handleMentionSelect} onClose={closeSuggestions} />
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all flex-shrink-0" title="Joindre (Phase 4)">📎</button>
        <input ref={inputRef} type="text" value={content} onChange={handleChange} onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Sélectionnez un salon' : `Envoyer un message dans #${channelName}`}
          disabled={disabled} maxLength={4000}
          className="flex-1 py-2 px-1.5 bg-transparent text-[13px] text-[var(--t1)] outline-none placeholder:text-[var(--t3)] disabled:cursor-not-allowed" />
        <EmojiPicker onSelect={handleEmojiSelect} />
        <button onClick={handleSend} disabled={!content.trim() || sending || disabled}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--acc)] to-indigo-500 text-white flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_14px_var(--acc-g)] hover:brightness-110 hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
          title="Envoyer">➤</button>
      </div>
    </div>
  );
}
