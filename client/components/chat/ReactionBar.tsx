/**
 * components/chat/ReactionBar.tsx — Barre de réactions sous un message
 * 
 * Affiche les réactions existantes + un bouton "+" pour en ajouter.
 * Cliquer sur une réaction existante = toggle (ajouter/retirer).
 * Le bouton "+" ouvre un mini picker d'emojis rapides.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import type { ReactionData } from '@/hooks/useChat';

interface ReactionBarProps {
  reactions: ReactionData[];
  onToggle: (emoji: string) => void;
  isGuest?: boolean;
}

// Emojis rapides pour le picker compact
const QUICK_EMOJIS = ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '🎉', '👏', '🤔'];
const GUEST_EMOJIS = ['👍', '👎'];

export function ReactionBar({ reactions, onToggle, isGuest = false }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fermer le picker quand on clique en dehors
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showPicker]);

  const handleEmojiClick = (emoji: string) => {
    onToggle(emoji);
    setShowPicker(false);
  };

  const allowedEmojis = isGuest ? GUEST_EMOJIS : QUICK_EMOJIS;

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {/* Réactions existantes */}
      {reactions.map(reaction => (
        <button
          key={reaction.emoji}
          onClick={() => onToggle(reaction.emoji)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] transition-all cursor-pointer backdrop-blur-sm
            ${reaction.reacted
              ? 'bg-[var(--acc-s)] border border-[var(--acc)] text-[var(--acc)] shadow-[0_0_8px_rgba(139,92,246,0.15)]'
              : 'bg-[var(--glass)] border border-[var(--border)] text-[var(--t2)] hover:border-[var(--acc)] hover:bg-[var(--acc-s)]'
            }`}
        >
          <span>{reaction.emoji}</span>
          <span className="font-semibold">{reaction.count}</span>
        </button>
      ))}

      {/* Bouton "+" pour ajouter une réaction */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-6 h-6 rounded-full bg-[var(--glass)] border border-[var(--border)] text-[var(--t3)] hover:text-[var(--t1)] hover:border-[var(--border-s)] transition-all flex items-center justify-center text-xs opacity-0 group-hover:opacity-100"
          style={{ opacity: showPicker ? 1 : undefined }}
          title="Ajouter une réaction"
        >
          +
        </button>

        {/* Mini picker */}
        {showPicker && (
          <div className="absolute bottom-8 left-0 glass-strong rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-1.5 flex gap-0.5 z-50 animate-slideUp">
            {allowedEmojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-[var(--glass-h)] transition-colors cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
