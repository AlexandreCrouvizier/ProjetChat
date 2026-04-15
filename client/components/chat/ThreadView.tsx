/**
 * components/chat/ThreadView.tsx — FIX: signalement + messages masqués dans les threads
 *
 * FIX: bouton 🚩 signaler sur chaque message de thread
 * FIX: messages masqués (is_hidden) affichés grisés
 * FIX: écoute event message:hidden pour mise à jour live
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { MessageContent } from './MessageContent';
import type { ChatMessage } from '@/hooks/useChat';

interface ThreadViewProps {
  parentMessageId: string;
  groupId: string;
  currentUserId: string;
  currentUsername?: string;
  currentUserTier?: string;
  onClose: () => void;
  onReport?: (msg: ChatMessage) => void;
  onMuteAlert?: (info: { duration: string; reason: string; expires_at?: string | null; admin_message?: string }) => void;
}

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}
function formatTime(d: string) { return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

export function ThreadView({ parentMessageId, groupId, currentUserId, currentUsername, currentUserTier, onClose, onReport, onMuteAlert }: ThreadViewProps) {
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/groups/${groupId}/messages/${parentMessageId}/thread`)
      .then(({ data }) => setReplies(data.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [parentMessageId, groupId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNewReply = (data: { parent_message_id: string; message: any }) => {
      if (data.parent_message_id === parentMessageId) {
        setReplies(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
      }
    };

    // ⭐ Écouter les messages masqués dans ce thread
    const onMessageHidden = (data: { message_id: string; parent_message_id: string | null }) => {
      if (data.parent_message_id === parentMessageId) {
        setReplies(prev => prev.map(r =>
          r.id === data.message_id
            ? { ...r, is_hidden: true, content: 'Ce message a été supprimé par la modération.', reactions: [] }
            : r
        ));
      }
    };

    socket.on('thread:new_reply', onNewReply);
    socket.on('message:hidden', onMessageHidden);
    return () => {
      socket.off('thread:new_reply', onNewReply);
      socket.off('message:hidden', onMessageHidden);
    };
  }, [parentMessageId]);

  useEffect(() => {
    if (!loading && replies.length > 0) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [loading, replies.length]);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading]);

  const handleSend = useCallback(async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    const socket = getSocket();
    if (socket) {
      socket.emit('message:send', {
        content: content.trim(), group_id: groupId, parent_message_id: parentMessageId,
      }, (res: any) => {
        if (res.success) setContent('');
        else {
          const errMsg: string = res.error || '';
          if (res.muted || errMsg.includes('muté') || errMsg.includes('muted')) {
            onMuteAlert?.({
              duration: res.duration || '',
              reason: res.reason || errMsg,
              expires_at: res.expires_at || null,
            });
          } else {
            alert(errMsg);
          }
        }
        setSending(false);
        inputRef.current?.focus();
      });
    }
  }, [content, sending, groupId, parentMessageId, onMuteAlert]);

  // Convertir un reply en ChatMessage pour le report
  const replyToChatMessage = (reply: any): ChatMessage => ({
    id: reply.id,
    content: reply.content,
    author: reply.author || { id: '', username: 'Inconnu', avatar_url: null, tier: 'registered', donor_badge: 'none' },
    group_id: groupId,
    conversation_id: null,
    type: reply.type || 'text',
    is_pinned: false,
    is_hidden: reply.is_hidden || false,
    reply_to_id: null,
    reply_to: null,
    parent_message_id: parentMessageId,
    edited_at: null,
    created_at: reply.created_at,
    reactions: reply.reactions || [],
    thread_count: 0,
    thread_last_reply_at: null,
  });

  return (
    <div className="mt-2 ml-12 rounded-xl border border-[var(--acc)] border-opacity-30 bg-[var(--acc-s)] backdrop-blur-sm overflow-hidden animate-slideUp">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--glass)]">
        <span className="text-[11px] font-semibold text-[var(--acc)]">
          💬 Thread — {replies.length} réponse{replies.length !== 1 ? 's' : ''}
        </span>
        <button onClick={onClose} className="text-[var(--t3)] hover:text-[var(--t1)] text-xs transition-colors">✕</button>
      </div>

      <div ref={scrollRef} className="max-h-[200px] overflow-y-auto px-3 py-2 space-y-2">
        {loading && <div className="text-[10px] text-[var(--t3)] text-center py-2">⏳ Chargement...</div>}
        {replies.map(reply => {
          const authorName = reply.author?.username || 'Inconnu';
          const isHidden = reply.is_hidden === true;
          const isOwnMessage = reply.author?.id === currentUserId;

          // ⭐ Message de thread masqué
          if (isHidden) {
            return (
              <div key={reply.id} className="flex gap-2 items-start opacity-50">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>🗑️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--t3)] italic">{authorName}</span>
                    <span className="text-[9px] text-[var(--t3)]">{formatTime(reply.created_at)}</span>
                  </div>
                  <div className="text-[10px] text-[var(--t3)] italic flex items-center gap-1">
                    <span className="inline-block w-1 h-1 rounded-full bg-red-400/40" />
                    Message supprimé par la modération.
                  </div>
                </div>
              </div>
            );
          }

          // Message de thread normal
          const initial = authorName.charAt(0).toUpperCase();
          const color = getAvatarColor(authorName);
          return (
            <div key={reply.id} className="flex gap-2 items-start group/reply relative">
              <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0`}>{initial}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: `hsl(${Math.abs(authorName.charCodeAt(0)) * 40 % 360}, 70%, 70%)` }}>{authorName}</span>
                  <span className="text-[9px] text-[var(--t3)]">{formatTime(reply.created_at)}</span>
                </div>
                <div className="text-[11px] text-[var(--t2)] leading-relaxed break-words">
                  <MessageContent content={reply.content} currentUsername={currentUsername} />
                </div>
              </div>

              {/* ⭐ Bouton signaler sur hover dans le thread */}
              {!isOwnMessage && onReport && (
                <button onClick={() => onReport(replyToChatMessage(reply))}
                  className="absolute top-0 right-0 w-5 h-5 rounded text-[9px] opacity-0 group-hover/reply:opacity-100 transition-opacity
                    bg-[var(--glass-s)] border border-[var(--border)] text-[var(--t3)] hover:text-red-400 hover:border-red-400 flex items-center justify-center"
                  title="Signaler ce message">🚩</button>
              )}
            </div>
          );
        })}
        {!loading && replies.length === 0 && <div className="text-[10px] text-[var(--t3)] text-center py-2">Aucune réponse</div>}
      </div>

      <div className="px-3 py-2 border-t border-[var(--border)]">
        <div className="flex gap-1.5">
          <input ref={inputRef} type="text" value={content} onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } if (e.key === 'Escape') onClose(); }}
            placeholder="Répondre dans le thread..." maxLength={4000}
            className="flex-1 py-1.5 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] text-[11px] text-[var(--t1)] outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" />
          <button onClick={handleSend} disabled={!content.trim() || sending}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--acc)] text-white text-[10px] font-semibold disabled:opacity-30 hover:brightness-110 transition-all">➤</button>
        </div>
      </div>
    </div>
  );
}
