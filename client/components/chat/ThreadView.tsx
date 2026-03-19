/**
 * components/chat/ThreadView.tsx — FIXED: auto-focus sur l'input
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { MessageContent } from './MessageContent';

interface ThreadViewProps {
  parentMessageId: string;
  groupId: string;
  currentUserId: string;
  currentUsername?: string;
  onClose: () => void;
}

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}
function formatTime(d: string) { return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

export function ThreadView({ parentMessageId, groupId, currentUserId, currentUsername, onClose }: ThreadViewProps) {
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
    socket.on('thread:new_reply', onNewReply);
    return () => { socket.off('thread:new_reply', onNewReply); };
  }, [parentMessageId]);

  useEffect(() => {
    if (!loading && replies.length > 0) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [loading, replies.length]);

  // ⭐ Auto-focus sur l'input quand le thread s'ouvre
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
        else alert(res.error);
        setSending(false);
        inputRef.current?.focus();  // ⭐ Refocus après envoi
      });
    }
  }, [content, sending, groupId, parentMessageId]);

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
          const initial = authorName.charAt(0).toUpperCase();
          const color = getAvatarColor(authorName);
          return (
            <div key={reply.id} className="flex gap-2 items-start">
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
