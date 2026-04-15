/**
 * components/chat/MessageList.tsx — Phase 3 : signaler + filtrage bloqués + messages masqués
 *
 * FIX: messages masqués (is_hidden) affichés grisés avec contenu remplacé
 * FIX: onReport passé au ThreadView pour signaler des messages de thread
 */
'use client';

import { useRef, useEffect, useState } from 'react';
import type { ChatMessage } from '@/hooks/useChat';
import { ReactionBar } from './ReactionBar';
import { MessageContent } from './MessageContent';
import { ThreadView } from './ThreadView';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onAvatarClick?: (userId: string) => void;
  onReport?: (msg: ChatMessage) => void;
  onMuteAlert?: (info: { duration: string; reason: string; expires_at?: string | null; admin_message?: string }) => void;
  currentUserId: string;
  currentUserTier: string;
  currentUsername?: string;
  groupId?: string | null;
  blockedUserIds?: Set<string>;
}

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600','from-teal-500 to-emerald-600','from-blue-500 to-violet-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}
function getBadge(tier: string, db?: string) {
  if (db && db !== 'none') {
    const b: Record<string,{text:string;cls:string}> = {supporter:{text:'❤️ SUPPORTER',cls:'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/20'},mecene:{text:'💎 MÉCÈNE',cls:'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 border border-blue-500/20'},fondateur:{text:'👑 FONDATEUR',cls:'bg-gradient-to-r from-amber-500/20 to-red-500/20 text-amber-300 border border-amber-500/20'}};
    return b[db] ? { text: b[db].text, className: b[db].cls } : null;
  }
  if (tier === 'premium') return { text: '⭐ PREMIUM', className: 'bg-gradient-to-r from-amber-500/25 to-red-500/25 text-amber-300 border border-amber-500/20' };
  if (tier === 'guest') return { text: 'INVITÉ', className: 'bg-[var(--badge-g)] text-[var(--t3)] border border-[var(--border)]' };
  return null;
}
function formatTime(d: string) { return new Date(d).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }
function formatTimeAgo(d: string) { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return 'à l\'instant'; if(m<60)return `il y a ${m}min`; const h=Math.floor(m/60); if(h<24)return `il y a ${h}h`; return `il y a ${Math.floor(h/24)}j`; }

function Avatar({ username, avatarUrl, size = 'md', onClick }: { username: string; avatarUrl?: string | null; size?: 'md' | 'sm'; onClick?: () => void }) {
  const initial = username.charAt(0).toUpperCase();
  const color = getAvatarColor(username);
  const sizeClasses = size === 'md' ? 'w-10 h-10 rounded-xl text-base' : 'w-6 h-6 rounded-lg text-[9px]';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={username} onClick={onClick} className={`${sizeClasses} object-cover shadow-[0_4px_14px_rgba(0,0,0,0.25)] flex-shrink-0 cursor-pointer hover:scale-105 transition-transform`} />;
  }
  return (
    <div onClick={onClick} className={`${sizeClasses} bg-gradient-to-br ${color} flex items-center justify-center font-bold text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)] flex-shrink-0 cursor-pointer hover:scale-105 transition-transform`}>
      {initial}
    </div>
  );
}

export function MessageList({ messages, isLoading, hasMore, onLoadMore, onToggleReaction, onAvatarClick, onReport, onMuteAlert, currentUserId, currentUserTier, currentUsername, groupId, blockedUserIds }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length > prevCount.current) {
      const c = containerRef.current;
      if (c) {
        const near = c.scrollHeight - c.scrollTop - c.clientHeight < 150;
        if (near || messages.length - prevCount.current === messages.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevCount.current = messages.length;
  }, [messages.length]);

  useEffect(() => { if (messages.length > 0 && prevCount.current === 0) bottomRef.current?.scrollIntoView(); }, [messages]);
  useEffect(() => { setOpenThreadId(null); }, [groupId]);

  const handleReply = (messageId: string) => { setOpenThreadId(prev => prev === messageId ? null : messageId); };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4">
      {hasMore && <div className="text-center mb-4"><button onClick={onLoadMore} disabled={isLoading} className="text-xs text-[var(--acc)] hover:underline disabled:opacity-50">{isLoading ? '⏳ Chargement...' : '↑ Charger les messages précédents'}</button></div>}
      {isLoading && messages.length === 0 && <div className="text-center text-[var(--t3)] text-sm py-8">⏳ Chargement des messages...</div>}
      {!isLoading && messages.length === 0 && <div className="text-center text-[var(--t3)] text-sm py-16"><div className="text-4xl mb-3">💬</div><p>Aucun message pour l&apos;instant.</p><p className="mt-1">Soyez le premier à écrire !</p></div>}

      {messages.length > 0 && (
        <div className="flex items-center gap-3.5 my-5">
          <div className="flex-1 h-px bg-[var(--border)]" /><span className="text-[10px] font-semibold text-[var(--t3)] uppercase tracking-wider bg-[var(--glass)] backdrop-blur-sm px-3 py-0.5 rounded-full border border-[var(--border)]">Aujourd&apos;hui</span><div className="flex-1 h-px bg-[var(--border)]" />
        </div>
      )}

      {messages.map(msg => {
        const isOwnMessage = msg.author?.id === currentUserId;
        const authorId = msg.author?.id || '';
        const isHidden = msg.is_hidden === true;

        // ⭐ Masquer les messages des utilisateurs bloqués
        if (blockedUserIds && blockedUserIds.has(authorId) && !isOwnMessage) {
          return (
            <div key={msg.id} className="flex gap-3 px-2.5 py-2 rounded-xl opacity-40">
              <div className="w-10 h-10 rounded-xl bg-[var(--glass)] flex items-center justify-center text-[var(--t3)] text-sm flex-shrink-0">🚫</div>
              <div className="flex-1 min-w-0 flex items-center">
                <span className="text-[11px] text-[var(--t3)] italic">Message d&apos;un utilisateur bloqué</span>
              </div>
            </div>
          );
        }

        // ⭐ MESSAGE MASQUÉ PAR LA MODÉRATION
        if (isHidden) {
          const isThreadOpen = openThreadId === msg.id;
          return (
            <div key={msg.id}>
              <div className="flex gap-3 px-2.5 py-2 rounded-xl opacity-50">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--t3)] text-lg flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  🗑️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold text-[var(--t3)] italic">{msg.author?.username || 'Inconnu'}</span>
                    <span className="text-[10px] text-[var(--t3)]">{formatTime(msg.created_at)}</span>
                  </div>
                  <div className="text-[12px] text-[var(--t3)] italic flex items-center gap-1.5">
                    <span className="inline-block w-1 h-1 rounded-full bg-red-400/40" />
                    Ce message a été supprimé par la modération.
                  </div>

                  {/* ⭐ Le thread reste accessible même si le message parent est masqué */}
                  {(msg.thread_count > 0 || isThreadOpen) && (
                    <button onClick={() => handleReply(msg.id)}
                      className={`flex items-center gap-1.5 mt-1.5 text-[11px] cursor-pointer transition-colors rounded-md px-2 py-1 -ml-2
                        ${isThreadOpen ? 'bg-[var(--acc-s)] text-[var(--acc)] font-semibold' : 'text-[var(--acc)] hover:bg-[var(--acc-s)]'}`}>
                      <span>{isThreadOpen ? '▾' : '▸'}</span>
                      <span className="font-semibold">💬 {msg.thread_count || 0} réponse{(msg.thread_count || 0) !== 1 ? 's' : ''}</span>
                    </button>
                  )}
                </div>
              </div>

              {isThreadOpen && groupId && (
                <ThreadView parentMessageId={msg.id} groupId={groupId} currentUserId={currentUserId}
                  currentUsername={currentUsername} currentUserTier={currentUserTier}
                  onClose={() => setOpenThreadId(null)} onReport={onReport} onMuteAlert={onMuteAlert} />
              )}
            </div>
          );
        }

        // MESSAGE NORMAL
        const badge = getBadge(msg.author?.tier || '', msg.author?.donor_badge);
        const isGuest = msg.author?.tier === 'guest';
        const isThreadOpen = openThreadId === msg.id;

        return (
          <div key={msg.id}>
            <div className={`flex gap-3 px-2.5 py-2 rounded-xl transition-colors group relative ${isThreadOpen ? 'bg-[rgba(139,92,246,0.04)] border-l-2 border-[var(--acc)]' : 'hover:bg-[rgba(255,255,255,0.02)]'}`}>
              <Avatar
                username={msg.author?.username || 'Inconnu'}
                avatarUrl={msg.author?.avatar_url}
                onClick={() => msg.author?.id && onAvatarClick?.(msg.author.id)}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span onClick={() => msg.author?.id && onAvatarClick?.(msg.author.id)}
                    className={`text-[13px] font-semibold cursor-pointer hover:underline ${isGuest ? 'text-[#94a3b8] italic' : ''}`}
                    style={!isGuest ? { color: `hsl(${Math.abs(msg.author?.username?.charCodeAt(0) || 0) * 40 % 360}, 70%, 70%)` } : undefined}>
                    {msg.author?.username || 'Inconnu'}
                  </span>
                  {badge && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>{badge.text}</span>}
                  <span className="text-[10px] text-[var(--t3)]">{formatTime(msg.created_at)}</span>
                  {msg.edited_at && <span className="text-[9px] text-[var(--t3)] italic">(modifié)</span>}
                </div>

                <div className="text-[13px] text-[var(--t2)] leading-relaxed break-words">
                  <MessageContent content={msg.content} currentUsername={currentUsername} />
                </div>

                {(msg.thread_count > 0 || isThreadOpen) && (
                  <button onClick={() => handleReply(msg.id)}
                    className={`flex items-center gap-1.5 mt-1.5 text-[11px] cursor-pointer transition-colors rounded-md px-2 py-1 -ml-2
                      ${isThreadOpen ? 'bg-[var(--acc-s)] text-[var(--acc)] font-semibold' : 'text-[var(--acc)] hover:bg-[var(--acc-s)]'}`}>
                    <span>{isThreadOpen ? '▾' : '▸'}</span>
                    <span className="font-semibold">💬 {msg.thread_count || 0} réponse{(msg.thread_count || 0) !== 1 ? 's' : ''}</span>
                    {msg.thread_last_reply_at && !isThreadOpen && <span className="text-[var(--t3)] font-normal">— dernière {formatTimeAgo(msg.thread_last_reply_at)}</span>}
                  </button>
                )}

                <ReactionBar reactions={msg.reactions || []} onToggle={(emoji) => onToggleReaction(msg.id, emoji)} isGuest={currentUserTier === 'guest'} />
              </div>

              {/* Boutons hover : signaler + thread */}
              <div className="absolute top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                {!isOwnMessage && onReport && (
                  <button onClick={() => onReport(msg)}
                    className="w-7 h-7 rounded-lg backdrop-blur-sm border bg-[var(--glass-s)] border-[var(--border)] text-[var(--t3)] hover:text-red-400 hover:border-red-400 flex items-center justify-center transition-all text-xs"
                    title="Signaler ce message">🚩</button>
                )}
                <button onClick={() => handleReply(msg.id)}
                  className={`w-7 h-7 rounded-lg backdrop-blur-sm border flex items-center justify-center transition-all text-xs
                    ${isThreadOpen ? 'bg-[var(--acc)] border-[var(--acc)] text-white shadow-[0_0_10px_var(--acc-g)]' : 'bg-[var(--glass-s)] border-[var(--border)] text-[var(--t3)] hover:text-[var(--t1)] hover:border-[var(--acc)]'}`}
                  title={isThreadOpen ? 'Fermer le thread' : 'Répondre dans le thread'}>
                  {isThreadOpen ? '✕' : '↩'}
                </button>
              </div>
            </div>

            {isThreadOpen && groupId && (
              <ThreadView parentMessageId={msg.id} groupId={groupId} currentUserId={currentUserId}
                currentUsername={currentUsername} currentUserTier={currentUserTier}
                onClose={() => setOpenThreadId(null)} onReport={onReport} onMuteAlert={onMuteAlert} />
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
