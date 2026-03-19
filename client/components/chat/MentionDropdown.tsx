/**
 * components/chat/MentionDropdown.tsx — Dropdown autocomplete pour les @mentions
 * 
 * S'affiche au-dessus de l'input quand l'utilisateur tape @...
 * Montre les pseudos correspondants avec avatar et tier.
 * Navigation clavier : ↑↓ pour naviguer, Entrée pour sélectionner, Échap pour fermer.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MentionSuggestion } from '@/hooks/useMentions';

interface MentionDropdownProps {
  suggestions: MentionSuggestion[];
  isOpen: boolean;
  onSelect: (username: string) => void;
  onClose: () => void;
}

function getAvatarColor(username: string): string {
  const colors = [
    'from-purple-500 to-indigo-500', 'from-emerald-500 to-green-600',
    'from-amber-500 to-orange-600', 'from-red-500 to-rose-600',
    'from-cyan-500 to-blue-500', 'from-pink-500 to-fuchsia-600',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function MentionDropdown({ suggestions, isOpen, onSelect, onClose }: MentionDropdownProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset l'index quand les suggestions changent
  useEffect(() => { setActiveIndex(0); }, [suggestions]);

  // Navigation clavier
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (suggestions[activeIndex]) {
        onSelect(suggestions[activeIndex].username);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [isOpen, suggestions, activeIndex, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || suggestions.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 glass-strong rounded-xl shadow-[0_-8px_32px_rgba(0,0,0,0.3)] overflow-hidden z-50 animate-slideUp max-h-[250px] overflow-y-auto">
      <div className="px-3 py-1.5 text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider border-b border-[var(--border)]">
        Membres — tapez pour filtrer
      </div>
      {suggestions.map((user, index) => {
        const initial = user.username.charAt(0).toUpperCase();
        const color = getAvatarColor(user.username);
        const isActive = index === activeIndex;

        return (
          <button
            key={user.id}
            onClick={() => onSelect(user.username)}
            onMouseEnter={() => setActiveIndex(index)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 transition-all text-left
              ${isActive
                ? 'bg-[var(--acc-s)] text-[var(--t1)]'
                : 'text-[var(--t2)] hover:bg-[var(--glass-h)]'
              }`}
          >
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold">
                <span className="text-[var(--acc)]">@</span>{user.username}
              </span>
            </div>
            <span className="text-[9px] text-[var(--t3)] flex-shrink-0">
              {user.tier === 'premium' ? '⭐' : user.tier === 'guest' ? '👤' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
