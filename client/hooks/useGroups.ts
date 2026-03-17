/**
 * hooks/useGroups.ts — Hook de gestion des salons
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: string;
  member_count: number;
  status: string;
  last_message_at: string | null;
}

export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      const { data } = await api.get('/groups');
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Erreur chargement salons:', err);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const joinGroup = useCallback(async (groupId: string): Promise<boolean> => {
    const socket = getSocket();
    if (!socket) return false;

    return new Promise((resolve) => {
      socket.emit('group:join', { group_id: groupId }, (response: any) => {
        if (response.success) {
          loadGroups(); // Rafraîchir la liste
          resolve(true);
        } else {
          alert(response.error);
          resolve(false);
        }
      });
    });
  }, [loadGroups]);

  return { groups, isLoading, loadGroups, joinGroup };
}
