/**
 * hooks/useDMChat.ts — Simplifié : même interface que useChat
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { ChatMessage } from './useChat';

export function useDMChat(conversationId: string | null, currentUserId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const convIdRef = useRef(conversationId);

  useEffect(() => { convIdRef.current = conversationId; }, [conversationId]);

  const loadMessages = useCallback(async (before?: string) => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (before) params.set('before', before);
      const { data } = await api.get(`/conversations/${conversationId}/messages?${params}`);
      if (before) setMessages(prev => [...data.messages, ...prev]);
      else setMessages(data.messages || []);
      setHasMore(data.has_more);
    } catch (err) { console.error('Erreur chargement DM:', err); }
    setIsLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    const socket = getSocket();
    if (socket) {
      socket.emit('conversation:join', { conversation_id: conversationId });
      socket.emit('conversation:read', { conversation_id: conversationId });
    }
    loadMessages();
  }, [conversationId, loadMessages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return;

    const onNewDM = (message: any) => {
      if (message.conversation_id === convIdRef.current) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, { ...message, reactions: message.reactions || [] }];
        });
        socket.emit('conversation:read', { conversation_id: conversationId });
      }
    };
    const onReactionUpdate = (data: { message_id: string; reactions: any[] }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id !== data.message_id) return msg;
        return { ...msg, reactions: data.reactions.map(r => ({ emoji: r.emoji, count: r.count, reacted: currentUserId ? r.users.includes(currentUserId) : false })) };
      }));
    };
    // ⭐ Message masqué par la modération dans un DM
    const onMessageHidden = (data: { message_id: string; parent_message_id: string | null }) => {
      if (!data.parent_message_id) {
        setMessages(prev => prev.map(msg =>
          msg.id === data.message_id
            ? { ...msg, is_hidden: true, content: 'Ce message a été supprimé par la modération.' }
            : msg
        ));
      }
    };

    socket.on('dm:new', onNewDM);
    socket.on('reaction:update', onReactionUpdate);
    socket.on('message:hidden', onMessageHidden);
    return () => {
      socket.off('dm:new', onNewDM);
      socket.off('reaction:update', onReactionUpdate);
      socket.off('message:hidden', onMessageHidden);
    };
  }, [conversationId, currentUserId]);

  const sendMessage = useCallback(async (content: string) => {
    const socket = getSocket();
    if (!socket || !conversationId || !content.trim()) return;
    return new Promise<ChatMessage>((resolve, reject) => {
      socket.emit('dm:send', { conversation_id: conversationId, content: content.trim() }, (response: any) => {
        if (response.success) resolve(response.message);
        else reject(new Error(response.error));
      });
    });
  }, [conversationId]);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    const socket = getSocket();
    if (socket) socket.emit('reaction:toggle', { message_id: messageId, emoji });
  }, []);

  const loadMore = useCallback(() => {
    if (messages.length > 0 && hasMore) loadMessages(messages[0].id);
  }, [messages, hasMore, loadMessages]);

  return { messages, isLoading, hasMore, typingUsers: [] as any[], sendMessage, toggleReaction, emitTyping: () => {}, loadMore };
}
