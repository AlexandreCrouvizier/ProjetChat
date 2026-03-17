/**
 * components/chat/MessageList.tsx — Liste des messages avec auto-scroll
 */

'use client';

import { useRef, useEffect } from 'react';
import type { ChatMessage } from '@/hooks/useChat';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  currentUserId: string;
}

// Couleurs d'avatar par auteur (basé sur le hash du username)
function getAvatarColor(username: string): string {
  const colors = [
    'from-purple-500 to-indigo-500',
    'from-emerald-500 to-green-600',
    'from-amber-500 to-orange-600',
    'from-red-500 to-rose-600',
    'from-cyan-500 to-blue-500',
    'from-pink-500 to-fuchsia-600',
    'from-teal-500 to-emerald-600',
    'from-blue-500 to-violet-600',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getBadge(tier: string, donorBadge?: string): { text: string; className: string } | null {
  if (donorBadge && donorBadge !== 'none') {
    const badges: Record<string, { text: string; className: string }> = {
      supporter: { text: '❤️ SUPPORTER', className: 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/20' },
      mecene: { text: '💎 MÉCÈNE', className: 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 border border-blue-500/20' },
      fondateur: { text: '👑 FONDATEUR', className: 'bg-gradient-to-r from-amber-500/20 to-red-500/20 text-amber-300 border border-amber-500/20' },
    };
    return badges[donorBadge] || null;
  }
  if (tier === 'premium') return { text: '⭐ PREMIUM', className: 'bg-gradient-to-r from-amber-500/25 to-red-500/25 text-amber-300 border border-amber-500/20' };
  if (tier === 'guest') return { text: 'INVITÉ', className: 'bg-[var(--badge-g)] text-[var(--t3)] border border-[var(--border)]' };
  return null;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function MessageList({ messages, isLoading, hasMore, onLoadMore, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  // Auto-scroll vers le bas quand un nouveau message arrive
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      // Nouveau message → scroll en bas (sauf si l'utilisateur a scrollé vers le haut)
      const container = containerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom || messages.length - prevMsgCountRef.current === messages.length) {
          // Près du bas OU premier chargement → auto-scroll
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  // Premier chargement → scroll direct en bas (pas smooth)
  useEffect(() => {
    if (messages.length > 0 && prevMsgCountRef.current === 0) {
      bottomRef.current?.scrollIntoView();
    }
  }, [messages]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4">
      {/* Charger plus */}
      {hasMore && (
        <div className="text-center mb-4">
          <button onClick={onLoadMore} disabled={isLoading}
                  className="text-xs text-[var(--acc)] hover:underline disabled:opacity-50">
            {isLoading ? '⏳ Chargement...' : '↑ Charger les messages précédents'}
          </button>
        </div>
      )}

      {/* Loading initial */}
      {isLoading && messages.length === 0 && (
        <div className="text-center text-[var(--t3)] text-sm py-8">⏳ Chargement des messages...</div>
      )}

      {/* Pas de messages */}
      {!isLoading && messages.length === 0 && (
        <div className="text-center text-[var(--t3)] text-sm py-16">
          <div className="text-4xl mb-3">💬</div>
          <p>Aucun message pour l&apos;instant.</p>
          <p className="mt-1">Soyez le premier à écrire !</p>
        </div>
      )}

      {/* Séparateur "Aujourd'hui" */}
      {messages.length > 0 && (
        <div className="flex items-center gap-3.5 my-5">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-[10px] font-semibold text-[var(--t3)] uppercase tracking-wider bg-[var(--glass)] backdrop-blur-sm px-3 py-0.5 rounded-full border border-[var(--border)]">
            Aujourd&apos;hui
          </span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
      )}

      {/* Messages */}
      {messages.map(msg => {
        const isMe = msg.author?.id === currentUserId;
        const badge = getBadge(msg.author?.tier || '', msg.author?.donor_badge);
        const initial = msg.author?.username?.charAt(0).toUpperCase() || '?';
        const color = getAvatarColor(msg.author?.username || 'unknown');
        const isGuest = msg.author?.tier === 'guest';

        return (
          <div key={msg.id}
               className="flex gap-3 px-2.5 py-2 rounded-xl transition-colors hover:bg-[rgba(255,255,255,0.02)] group">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-base font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)] flex-shrink-0 cursor-pointer hover:scale-105 transition-transform`}>
              {initial}
            </div>

            {/* Contenu */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className={`text-[13px] font-semibold cursor-pointer hover:underline ${isGuest ? 'text-[#94a3b8] italic' : ''}`}
                      style={!isGuest ? { color: `hsl(${Math.abs(msg.author?.username?.charCodeAt(0) || 0) * 40 % 360}, 70%, 70%)` } : undefined}>
                  {msg.author?.username || 'Inconnu'}
                </span>
                {badge && (
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                    {badge.text}
                  </span>
                )}
                <span className="text-[10px] text-[var(--t3)]">{formatTime(msg.created_at)}</span>
                {msg.edited_at && <span className="text-[9px] text-[var(--t3)] italic">(modifié)</span>}
              </div>
              <div className="text-[13px] text-[var(--t2)] leading-relaxed break-words">
                {msg.content}
              </div>
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
