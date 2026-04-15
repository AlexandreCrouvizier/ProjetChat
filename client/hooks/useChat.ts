/**
 * hooks/useChat.ts — Simplifié : plus de replyTo (les threads gèrent les réponses)
 * 
 * Ce hook gère UNIQUEMENT le flux principal (messages racines).
 * Les threads sont gérés par le composant ThreadView de manière autonome.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface ReactionData { emoji: string; count: number; reacted: boolean; users?: string[]; }
export interface ReplyToData { id: string; author_username: string; content: string; }

export interface ChatMessage {
  id: string;
  content: string;
  author: { id: string; username: string; avatar_url: string | null; tier: string; donor_badge: string; };
  group_id: string | null;
  conversation_id: string | null;
  type: string;
  is_pinned: boolean;
  is_hidden: boolean;
  reply_to_id: string | null;
  reply_to: ReplyToData | null;
  parent_message_id: string | null;
  edited_at: string | null;
  created_at: string;
  reactions: ReactionData[];
  thread_count: number;
  thread_last_reply_at: string | null;
}

export function useChat(groupId: string | null, currentUserId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Array<{ id: string; username: string }>>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  const loadMessages = useCallback(async (before?: string) => {
    if (!groupId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (before) params.set('before', before);
      const { data } = await api.get(`/groups/${groupId}/messages?${params}`);
      if (before) setMessages(prev => [...data.messages, ...prev]);
      else setMessages(data.messages);
      setHasMore(data.has_more);
    } catch (err) { console.error('Erreur chargement messages:', err); }
    setIsLoading(false);
  }, [groupId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;

    // Messages racines uniquement (les threads passent par thread:new_reply)
    const onNewMessage = (message: ChatMessage) => {
      if (message.group_id === groupId && !message.parent_message_id) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, { ...message, reactions: message.reactions || [], thread_count: 0, thread_last_reply_at: null }];
        });
      }
    };

    // Mise à jour du compteur de thread sur un message parent
    const onThreadCountUpdate = (data: { message_id: string; thread_count_increment: number; last_reply_at: string }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.message_id
          ? { ...msg, thread_count: (msg.thread_count || 0) + data.thread_count_increment, thread_last_reply_at: data.last_reply_at }
          : msg
      ));
    };

    const onMessageEdited = (data: { message_id: string; content: string; edited_at: string }) => {
      setMessages(prev => prev.map(msg => msg.id === data.message_id ? { ...msg, content: data.content, edited_at: data.edited_at } : msg));
    };
    const onMessageDeleted = (data: { message_id: string }) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.message_id));
    };
    // ⭐ Message masqué par la modération : passe en is_hidden=true sans disparaître
    const onMessageHidden = (data: { message_id: string; parent_message_id: string | null }) => {
      if (!data.parent_message_id) {
        // Message racine → mettre à jour dans la liste principale
        setMessages(prev => prev.map(msg =>
          msg.id === data.message_id
            ? { ...msg, is_hidden: true, content: 'Ce message a été supprimé par la modération.' }
            : msg
        ));
      }
      // Les replies de thread sont gérées par ThreadView via le même event
    };
    const onReactionUpdate = (data: { message_id: string; reactions: Array<{ emoji: string; count: number; users: string[] }> }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id !== data.message_id) return msg;
        return { ...msg, reactions: data.reactions.map(r => ({ emoji: r.emoji, count: r.count, reacted: currentUserId ? r.users.includes(currentUserId) : false })) };
      }));
    };
    const onTypingUpdate = (data: { group_id: string; users: Array<{ id: string; username: string }> }) => {
      if (data.group_id === groupId) setTypingUsers(data.users);
    };

    socket.on('message:new', onNewMessage);
    socket.on('thread:count_update', onThreadCountUpdate);
    socket.on('message:edited', onMessageEdited);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:hidden', onMessageHidden);
    socket.on('reaction:update', onReactionUpdate);
    socket.on('typing:update', onTypingUpdate);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('thread:count_update', onThreadCountUpdate);
      socket.off('message:edited', onMessageEdited);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:hidden', onMessageHidden);
      socket.off('reaction:update', onReactionUpdate);
      socket.off('typing:update', onTypingUpdate);
    };
  }, [groupId, currentUserId]);

  useEffect(() => {
    if (groupId) { setMessages([]); setTypingUsers([]); loadMessages(); }
  }, [groupId, loadMessages]);

  // ⭐ sendMessage envoie UNIQUEMENT des messages racines (pas de parent_message_id)
  const sendMessage = useCallback(async (content: string) => {
    const socket = getSocket();
    if (!socket || !groupId || !content.trim()) return;
    return new Promise<ChatMessage>((resolve, reject) => {
      socket.emit('message:send', {
        content: content.trim(),
        group_id: groupId,
        // Pas de reply_to_id ni parent_message_id ici
      }, (response: any) => {
        if (response.success) resolve(response.message);
        else {
          // ⭐ Attacher les données enrichies mute à l'erreur pour le caller
          const err: any = new Error(response.error);
          if (response.muted) {
            err.muted = true;
            err.expires_at = response.expires_at;
            err.reason = response.reason;
          }
          reject(err);
        }
      });
    });
  }, [groupId]);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    const socket = getSocket();
    if (socket) socket.emit('reaction:toggle', { message_id: messageId, emoji });
  }, []);

  const emitTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current < 2000) return;
    lastTypingEmitRef.current = now;
    socket.emit('typing:start', { group_id: groupId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing:stop', { group_id: groupId }); }, 3000);
  }, [groupId]);

  const loadMore = useCallback(() => {
    if (messages.length > 0 && hasMore) loadMessages(messages[0].id);
  }, [messages, hasMore, loadMessages]);

  return { messages, isLoading, hasMore, typingUsers, sendMessage, toggleReaction, emitTyping, loadMore };
}
