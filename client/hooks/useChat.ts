/**
 * hooks/useChat.ts — Hook du chat temps réel
 * 
 * Gère :
 *   - Chargement de l'historique (REST)
 *   - Réception des messages en temps réel (WebSocket)
 *   - Envoi de messages (WebSocket avec callback)
 *   - Typing indicator
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface ChatMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
    tier: string;
    donor_badge: string;
  };
  group_id: string | null;
  type: string;
  is_pinned: boolean;
  reply_to_id: string | null;
  parent_message_id: string | null;
  edited_at: string | null;
  created_at: string;
}

export function useChat(groupId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Array<{ id: string; username: string }>>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  // ===== Charger l'historique (REST) =====
  const loadMessages = useCallback(async (before?: string) => {
    if (!groupId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (before) params.set('before', before);

      const { data } = await api.get(`/groups/${groupId}/messages?${params}`);
      
      if (before) {
        // Charger plus → ajouter avant les messages existants
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        // Premier chargement
        setMessages(data.messages);
      }
      setHasMore(data.has_more);
    } catch (err) {
      console.error('Erreur chargement messages:', err);
    }
    setIsLoading(false);
  }, [groupId]);

  // ===== Écouter les messages en temps réel (WebSocket) =====
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;

    // Nouveau message reçu
    const onNewMessage = (message: ChatMessage) => {
      // N'ajouter que si c'est pour le groupe actif
      if (message.group_id === groupId) {
        setMessages(prev => [...prev, message]);
      }
    };

    // Message édité
    const onMessageEdited = (data: { message_id: string; content: string; edited_at: string }) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.message_id
          ? { ...msg, content: data.content, edited_at: data.edited_at }
          : msg
      ));
    };

    // Message supprimé
    const onMessageDeleted = (data: { message_id: string }) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.message_id));
    };

    // Typing indicator
    const onTypingUpdate = (data: { group_id: string; users: Array<{ id: string; username: string }> }) => {
      if (data.group_id === groupId) {
        setTypingUsers(data.users);
      }
    };

    socket.on('message:new', onNewMessage);
    socket.on('message:edited', onMessageEdited);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('typing:update', onTypingUpdate);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:edited', onMessageEdited);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('typing:update', onTypingUpdate);
    };
  }, [groupId]);

  // ===== Charger l'historique au changement de groupe =====
  useEffect(() => {
    if (groupId) {
      setMessages([]);
      setTypingUsers([]);
      loadMessages();
    }
  }, [groupId, loadMessages]);

  // ===== Envoyer un message =====
  const sendMessage = useCallback(async (content: string, replyToId?: string) => {
    const socket = getSocket();
    if (!socket || !groupId || !content.trim()) return;

    return new Promise<ChatMessage>((resolve, reject) => {
      socket.emit('message:send', {
        content: content.trim(),
        group_id: groupId,
        reply_to_id: replyToId,
      }, (response: any) => {
        if (response.success) {
          resolve(response.message);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }, [groupId]);

  // ===== Typing indicator — émet max 1 fois / 2s =====
  const emitTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;

    const now = Date.now();
    if (now - lastTypingEmitRef.current < 2000) return;  // Throttle 2s

    lastTypingEmitRef.current = now;
    socket.emit('typing:start', { group_id: groupId });

    // Auto-stop après 3s sans frappe
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { group_id: groupId });
    }, 3000);
  }, [groupId]);

  // ===== Charger plus (scroll vers le haut) =====
  const loadMore = useCallback(() => {
    if (messages.length > 0 && hasMore) {
      loadMessages(messages[0].id);
    }
  }, [messages, hasMore, loadMessages]);

  return {
    messages,
    isLoading,
    hasMore,
    typingUsers,
    sendMessage,
    emitTyping,
    loadMore,
  };
}
