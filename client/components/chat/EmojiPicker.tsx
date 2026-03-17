/**
 * components/chat/EmojiPicker.tsx — Picker d'emojis simple
 * 
 * Un grid d'emojis courants qui s'ouvre au clic sur le bouton 😊.
 * Phase 1 : emojis statiques. Phase 2 : recherche, catégories, récents.
 */

'use client';

import { useState, useRef, useEffect } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

// Emojis classés par catégorie
const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '😎', '🥸', '🤓', '😈', '👿', '👻', '💀', '☠️', '👽', '🤖'],
  },
  {
    name: 'Gestes',
    emojis: ['👋', '🤚', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾'],
  },
  {
    name: 'Cœurs',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  },
  {
    name: 'Objets',
    emojis: ['🔥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎈', '🏆', '🥇', '🎯', '🎮', '🎲', '🎵', '🎶', '🎸', '🎹', '📱', '💻', '⌨️', '🖥️', '📷', '📹', '🎬', '📺', '📻', '🔔', '📢', '💡', '📌', '📎', '✏️', '📝'],
  },
  {
    name: 'Nature',
    emojis: ['🌞', '🌙', '⭐', '🌈', '☁️', '⛈️', '❄️', '🌸', '🌺', '🌻', '🌹', '🍀', '🌳', '🌴', '🍁', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁'],
  },
  {
    name: 'Nourriture',
    emojis: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧀', '🥐', '🍞', '🥖', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '☕', '🍵', '🥤', '🍺', '🍷', '🥂', '🍾'],
  },
];

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fermer le picker quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      {/* Bouton trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all flex-shrink-0"
        title="Emoji"
      >
        😊
      </button>

      {/* Picker popup */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-[320px] glass-strong rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.4)] overflow-hidden z-50 animate-slideUp">
          
          {/* Onglets catégories */}
          <div className="flex border-b border-[var(--border)] px-2 py-1.5 gap-1 overflow-x-auto">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(i)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all
                  ${activeCategory === i
                    ? 'bg-[var(--acc)] text-white shadow-[0_0_10px_var(--acc-g)]'
                    : 'text-[var(--t3)] hover:text-[var(--t2)] hover:bg-[var(--glass-h)]'
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Grid d'emojis */}
          <div className="p-2 h-[200px] overflow-y-auto">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSelect(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-[var(--glass-h)] transition-colors cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
