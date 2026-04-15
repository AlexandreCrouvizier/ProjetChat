/**
 * hooks/useBlocked.ts — Gestion des utilisateurs bloqués côté client
 * 
 * Fournit :
 *   - blockedIds: Set<string> — IDs des utilisateurs bloqués (pour filtrage rapide)
 *   - refreshBlocked(): void — rafraîchir après un block/unblock
 *   - isBlocked(userId): boolean — vérifier si un utilisateur est bloqué
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export function useBlocked() {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const refreshBlocked = useCallback(async () => {
    if (!user || user.tier === 'guest') {
      setBlockedIds(new Set());
      return;
    }
    try {
      const { data } = await api.get('/users/me/blocked');
      const ids = (data.blocked || []).map((b: any) => b.id);
      setBlockedIds(new Set(ids));
    } catch {
      // Silencieux — pas critique
    }
  }, [user]);

  useEffect(() => {
    refreshBlocked();
  }, [refreshBlocked]);

  const isBlocked = useCallback((userId: string) => blockedIds.has(userId), [blockedIds]);

  return { blockedIds, refreshBlocked, isBlocked };
}
