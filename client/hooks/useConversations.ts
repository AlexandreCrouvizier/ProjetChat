/**
 * hooks/useConversations.ts — FIXED: hideConversation au lieu de leaveConversation
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface Conversation {
  id: string;
  participant_id: string;
  participant_username: string;
  participant_avatar_url: string | null;
  participant_tier: string;
  participant_donor_badge: string;
  participant_last_seen_at: string | null;
  last_message_content: string | null;
  last_message_author: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    try { const { data } = await api.get('/conversations'); setConversations(data.conversations || []); }
    catch (err) { console.error('Erreur chargement conversations:', err); }
    setIsLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => loadConversations();
    socket.on('conversations:updated', refresh);
    socket.on('dm:new', refresh);
    return () => { socket.off('conversations:updated', refresh); socket.off('dm:new', refresh); };
  }, [loadConversations]);

  const startConversation = useCallback(async (targetUserId: string): Promise<string | null> => {
    try {
      const { data } = await api.post('/conversations', { target_user_id: targetUserId });
      const convId = data.conversation.id;
      const socket = getSocket();
      if (socket) socket.emit('conversation:join', { conversation_id: convId });
      await loadConversations();
      return convId;
    } catch (err: any) { alert(err.response?.data?.message || 'Erreur'); return null; }
  }, [loadConversations]);

  /** ⭐ Masquer une conversation (ne supprime rien, réapparaîtra si l'autre écrit) */
  const hideConversation = useCallback(async (convId: string): Promise<void> => {
    try {
      await api.delete(`/conversations/${convId}`);
      setConversations(prev => prev.filter(c => c.id !== convId));
    } catch (err: any) { alert(err.response?.data?.message || 'Erreur'); }
  }, []);

  return { conversations, isLoading, loadConversations, startConversation, hideConversation };
}
