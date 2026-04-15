/**
 * hooks/useAdmin.ts — Authentification admin + appels API protégés
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import api from '@/lib/api';

export function useAdmin() {
  const [status, setStatus] = useState<{ is_superadmin: boolean; totp_enabled: boolean } | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const adminTokenRef = useRef<string | null>(null);
  const tokenExpiresRef = useRef<number>(0);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin-auth/status');
      setStatus(data);
      setLoading(false);
      return data;
    } catch (err: any) {
      setStatus(null);
      setLoading(false);
      setError(err.response?.status === 404 ? 'NOT_SUPERADMIN' : 'Erreur de connexion');
      return null;
    }
  }, []);

  const setupTotp = useCallback(async () => {
    try {
      const { data } = await api.post('/admin-auth/setup');
      return data;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur setup TOTP');
      return null;
    }
  }, []);

  const verifyTotp = useCallback(async (code: string): Promise<boolean> => {
    setError('');
    try {
      const { data } = await api.post('/admin-auth/verify', { code });
      adminTokenRef.current = data.admin_token;
      tokenExpiresRef.current = Date.now() + (data.expires_in * 1000);
      setAuthenticated(true);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Code invalide');
      return false;
    }
  }, []);

  const adminApi = useCallback(async (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => {
    if (!adminTokenRef.current) throw new Error('Non authentifié');
    if (Date.now() > tokenExpiresRef.current) {
      setAuthenticated(false);
      adminTokenRef.current = null;
      throw new Error('SESSION_EXPIRED');
    }
    const config = { headers: { 'X-Admin-Token': adminTokenRef.current } };
    if (method === 'get') return (await api.get(`/admin${url}`, config)).data;
    if (method === 'post') return (await api.post(`/admin${url}`, body, config)).data;
    if (method === 'patch') return (await api.patch(`/admin${url}`, body, config)).data;
    if (method === 'delete') return (await api.delete(`/admin${url}`, config)).data;
  }, []);

  const getTimeRemaining = useCallback(() => {
    if (!adminTokenRef.current) return 0;
    return Math.max(0, Math.floor((tokenExpiresRef.current - Date.now()) / 1000));
  }, []);

  const logout = useCallback(() => {
    adminTokenRef.current = null;
    tokenExpiresRef.current = 0;
    setAuthenticated(false);
  }, []);

  return {
    status, authenticated, loading, error,
    checkStatus, setupTotp, verifyTotp,
    adminApi, getTimeRemaining, logout,
  };
}
