/**
 * hooks/useGroups.ts — Phase 3 : créer, quitter, explorer les salons
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface Group {
  id: string; name: string; description: string | null; type: string;
  is_official: boolean; status: string; member_count: number;
  last_message_at: string | null; created_at: string;
  is_member?: boolean; my_role?: string | null;
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      const { data } = await api.get('/groups?mode=mine');
      setGroups(data.groups || []);
    } catch (err) { console.error('Erreur chargement groupes:', err); }
    setIsLoading(false);
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ⭐ Temps réel : nouveau salon public créé → l'ajouter immédiatement pour tous
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onGroupCreated = (data: { group: Group }) => {
      if (data.group.type === 'public') {
        setGroups(prev => {
          // Eviter le doublon si c'est le créateur (il recharge déjà via createGroup)
          if (prev.some(g => g.id === data.group.id)) return prev;
          return [data.group, ...prev];
        });
      }
    };

    // Rejoint un salon privé via invitation → l'ajouter à la sidebar
    const onGroupJoined = (data: { group: Group }) => {
      setGroups(prev => {
        if (prev.some(g => g.id === data.group.id)) return prev;
        return [data.group, ...prev];
      });
    };

    // Salon supprimé par cleanup ou admin → retirer de la liste
    const onGroupDeleted = (data: { group_id: string }) => {
      setGroups(prev => prev.filter(g => g.id !== data.group_id));
    };

    // Mise à jour d'un salon (nom, statut...) → sync locale
    const onGroupUpdated = (data: { group: Group }) => {
      setGroups(prev => prev.map(g => g.id === data.group.id ? { ...g, ...data.group } : g));
    };

    socket.on('group:created', onGroupCreated);
    socket.on('group:joined', onGroupJoined);
    socket.on('group:deleted', onGroupDeleted);
    socket.on('group:updated', onGroupUpdated);

    return () => {
      socket.off('group:created', onGroupCreated);
      socket.off('group:joined', onGroupJoined);
      socket.off('group:deleted', onGroupDeleted);
      socket.off('group:updated', onGroupUpdated);
    };
  }, []);

  const joinGroup = useCallback(async (groupId: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('group:join', { group_id: groupId });
    }
    // S'assurer qu'on est membre côté API aussi
    try { await api.post(`/groups/${groupId}/join`); } catch {}
  }, []);

  const leaveGroup = useCallback(async (groupId: string) => {
    try {
      await api.post(`/groups/${groupId}/leave`);
      const socket = getSocket();
      if (socket) socket.emit('group:leave', { group_id: groupId });
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }, []);

  const createGroup = useCallback(async (data: { name: string; description?: string; type: string; rules?: string }): Promise<Group | null> => {
    try {
      const { data: result } = await api.post('/groups', data);
      await loadGroups(); // Rafraîchir la liste
      return result.group;
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
      return null;
    }
  }, [loadGroups]);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      await api.delete(`/groups/${groupId}`);
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur');
    }
  }, []);

  return { groups, isLoading, loadGroups, joinGroup, leaveGroup, createGroup, deleteGroup };
}

/** Hook pour explorer les salons publics (avec recherche et tri) */
export function useExploreGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });

  const search = useCallback(async (params: { query?: string; sort?: string; page?: number }) => {
    setIsLoading(true);
    try {
      const searchParams = new URLSearchParams();
      if (params.query) searchParams.set('search', params.query);
      if (params.sort) searchParams.set('sort', params.sort);
      searchParams.set('page', String(params.page || 1));
      searchParams.set('limit', '20');

      const { data } = await api.get(`/groups?${searchParams}`);
      setGroups(data.groups || []);
      setPagination(data.pagination || { page: 1, total: 0, pages: 0 });
    } catch (err) { console.error('Erreur recherche groupes:', err); }
    setIsLoading(false);
  }, []);

  return { groups, isLoading, pagination, search };
}
