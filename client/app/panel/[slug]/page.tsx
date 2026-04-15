/**
 * app/panel/[slug]/page.tsx — Panel admin (fichier unique)
 *
 * Architecture : state machine simple persistée en sessionStorage.
 * Plus de hooks externes, plus de composants séparés.
 *
 * Écrans :
 *   loading  → vérification auth + statut superadmin
 *   denied   → fausse 404 (pas superadmin)
 *   setup    → QR code TOTP (première config)
 *   verify   → saisie code TOTP
 *   dashboard → panel complet
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

// ─── SessionStorage helpers ───────────────────────────────────────
const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_EXPIRES_KEY = 'admin_expires';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const expires = Number(sessionStorage.getItem(ADMIN_EXPIRES_KEY) || '0');
  if (token && Date.now() < expires) return token;
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_EXPIRES_KEY);
  return null;
}

function storeToken(token: string, expiresIn: number) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  sessionStorage.setItem(ADMIN_EXPIRES_KEY, String(Date.now() + expiresIn * 1000));
}

function clearToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_EXPIRES_KEY);
}

// ─── Types ────────────────────────────────────────────────────────
type Screen = 'loading' | 'login' | 'denied' | 'setup' | 'verify' | 'dashboard';
type Tab = 'stats' | 'moderation' | 'users' | 'groups';

// ══════════════════════════════════════════════════════════════════
//  PAGE PRINCIPALE
// ══════════════════════════════════════════════════════════════════
export default function AdminPanelPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // L'écran initial dépend de sessionStorage (synchrone)
  const [screen, setScreen] = useState<Screen>(() => (getStoredToken() ? 'dashboard' : 'loading'));

  // Token admin en ref (rapide, pas de re-render)
  const adminTokenRef = useRef<string | null>(getStoredToken());
  const tokenExpiresRef = useRef<number>(
    Number(typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_EXPIRES_KEY) || '0' : '0')
  );

  // ─── TOTP state ───
  const [error, setError] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secretManual, setSecretManual] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Login state ───
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // ─── Dashboard state ───
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [reportFilter, setReportFilter] = useState('pending');
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [toast, setToast] = useState('');

  // ⭐ État modal mute (onglet utilisateurs)
  const [muteTarget, setMuteTarget] = useState<{ id: string; name: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState('30m');
  const [muteReason, setMuteReason] = useState('');
  const [muteCustomReason, setMuteCustomReason] = useState('');
  const [muteMessage, setMuteMessage] = useState('');

  // ⭐ État modal ban (onglet utilisateurs)
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [banDuration, setBanDuration] = useState('permanent');
  const [banReason, setBanReason] = useState('');
  const [banCustomReason, setBanCustomReason] = useState('');
  const [banMessage, setBanMessage] = useState('');

  // ⭐ État modal action sur signalement (masquer / muter / bannir)
  const [actionTarget, setActionTarget] = useState<{ report: any } | null>(null);
  const [actionType, setActionType] = useState<'hide' | 'hide_mute' | 'hide_ban'>('hide');
  const [actionDuration, setActionDuration] = useState('1h');
  const [actionReason, setActionReason] = useState('');
  const [actionCustomReason, setActionCustomReason] = useState('');
  const [actionNotify, setActionNotify] = useState(true);
  const [actionMessage, setActionMessage] = useState('');

  // ⭐ État modal création salon officiel
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupType, setNewGroupType] = useState<'public' | 'private'>('public');
  const [newGroupRules, setNewGroupRules] = useState('');
  const [createGroupLoading, setCreateGroupLoading] = useState(false);

  // ─── Helpers ───
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ─── Admin API wrapper ───
  const adminApi = useCallback(async (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => {
    const token = adminTokenRef.current;
    if (!token) throw new Error('Non authentifié');
    if (Date.now() > tokenExpiresRef.current) {
      clearToken();
      adminTokenRef.current = null;
      setScreen('verify');
      throw new Error('SESSION_EXPIRED');
    }
    const config = { headers: { 'X-Admin-Token': token } };
    const fullUrl = `/admin${url}`;
    if (method === 'get') return (await api.get(fullUrl, config)).data;
    if (method === 'post') return (await api.post(fullUrl, body, config)).data;
    if (method === 'patch') return (await api.patch(fullUrl, body, config)).data;
    if (method === 'delete') return (await api.delete(fullUrl, config)).data;
  }, []);

  // ══════════════════════════════════════════════════════════════
  //  EFFET : boot — vérifie auth utilisateur + statut superadmin
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { setScreen('login'); return; }

    // Si on a déjà un token valide → dashboard
    if (getStoredToken()) {
      adminTokenRef.current = getStoredToken();
      tokenExpiresRef.current = Number(sessionStorage.getItem(ADMIN_EXPIRES_KEY) || '0');
      setScreen('dashboard');
      return;
    }

    // Sinon : vérifier statut superadmin
    (async () => {
      try {
        const { data } = await api.get('/admin-auth/status');
        if (!data.is_superadmin) { setScreen('denied'); return; }
        if (data.totp_enabled) {
          setScreen('verify');
        } else {
          // Setup TOTP
          const setup = await api.post('/admin-auth/setup');
          if (setup.data) {
            setQrCode(setup.data.qr_code);
            setSecretManual(setup.data.secret_manual);
          }
          setScreen('setup');
        }
      } catch (err: any) {
        if (err.response?.status === 404) setScreen('denied');
        else setError('Erreur de connexion');
      }
    })();
  }, [authLoading, isAuthenticated, router]);

  // ─── Focus input quand l'écran auth s'affiche ───
  useEffect(() => {
    if (screen === 'setup' || screen === 'verify') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [screen]);

  // ─── Timer session admin ───
  useEffect(() => {
    if (screen !== 'dashboard') return;
    const i = setInterval(() => {
      const remaining = Math.max(0, Math.floor((tokenExpiresRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearToken();
        adminTokenRef.current = null;
        setScreen('verify');
      }
    }, 1000);
    return () => clearInterval(i);
  }, [screen]);

  // ─── Chargement données dashboard selon tab ───
  const loadStats = useCallback(async () => { setDashLoading(true); try { setStats(await adminApi('get', '/stats')); } catch {} setDashLoading(false); }, [adminApi]);

  // ⭐ Fix 1+5 : version silencieuse (sans spinner) pour les polls automatiques
  const silentLoadReports = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: '1', limit: '50' });
      if (reportFilter !== 'all') p.set('status', reportFilter);
      const d = await adminApi('get', `/reports?${p}`);
      setReports(d?.groups || d?.reports || []);
    } catch {}
  }, [adminApi, reportFilter]);

  const loadReports = useCallback(async () => {
    setDashLoading(true);
    try {
      const p = new URLSearchParams({ page: '1', limit: '50' });
      if (reportFilter !== 'all') p.set('status', reportFilter);
      const d = await adminApi('get', `/reports?${p}`);
      setReports(d?.groups || d?.reports || []);
    } catch {} setDashLoading(false);
  }, [adminApi, reportFilter]);

  const loadUsers = useCallback(async () => {
    setDashLoading(true);
    try { const d = await adminApi('get', '/users'); setUsers(d?.users || []); } catch {}
    setDashLoading(false);
  }, [adminApi]);

  const loadGroups = useCallback(async () => {
    setDashLoading(true);
    try {
      const d = await adminApi('get', '/groups');
      const list = d?.groups || [];
      setGroups(list);
    } catch (err: any) {
      const detail = err?.response?.data || err?.message || 'erreur inconnue';
      showToast(`Erreur chargement salons : ${JSON.stringify(detail)}`);
      console.error('loadGroups error:', detail);
    }
    setDashLoading(false);
  }, [adminApi]);

  useEffect(() => {
    if (screen !== 'dashboard') return;
    if (tab === 'stats') loadStats();
    else if (tab === 'moderation') loadReports();
    else if (tab === 'users') loadUsers();
    else if (tab === 'groups') loadGroups();
  }, [screen, tab, loadStats, loadReports, loadUsers, loadGroups]);

  // ⭐ Fix 1 — Auto-refresh signalements toutes les 15s quand l'onglet est actif (silencieux)
  useEffect(() => {
    if (screen !== 'dashboard' || tab !== 'moderation') return;
    const poll = setInterval(() => { silentLoadReports(); }, 15000);
    return () => clearInterval(poll);
  }, [screen, tab, silentLoadReports]);

  // ═══════════════════════════════════════════════════
  //  HANDLERS
  // ═══════════════════════════════════════════════════
    const handleLogin = async () => {
        if (!loginIdentifier.trim() || !loginPassword || loginLoading) return;
        setLoginLoading(true);
        setError('');
        try {
            const { data } = await api.post('/auth/login', {
                email: loginIdentifier.trim(),
                password: loginPassword,
            });
            // Stocker les tokens comme le fait useAuth
            localStorage.setItem('access_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
            // Forcer le rechargement pour que useAuth récupère l'utilisateur
            window.location.reload();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Identifiant ou mot de passe incorrect');
        }
        setLoginLoading(false);
    };

    const handleVerify = async () => {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    setError('');
    try {
      const { data } = await api.post('/admin-auth/verify', { code });
      adminTokenRef.current = data.admin_token;
      tokenExpiresRef.current = Date.now() + data.expires_in * 1000;
      storeToken(data.admin_token, data.expires_in);
      setScreen('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Code invalide');
      setCode('');
      inputRef.current?.focus();
    }
    setVerifying(false);
  };

  const handleLogout = () => {
    clearToken();
    adminTokenRef.current = null;
    tokenExpiresRef.current = 0;
    setStats(null);
    setScreen('verify');
  };

  const reviewReport = async (id: string, status: string, messageId?: string) => {
    try {
      // ⭐ Si messageId fourni → traiter tous les reports du message d'un coup
      await adminApi('patch', `/reports/${id}`, { status, message_id: messageId || undefined });
      showToast(status === 'actioned' ? 'Signalement traité — message masqué' : 'Signalement rejeté');
      silentLoadReports(); loadStats();
    } catch {}
  };
  // ⭐ Fix 6 : Bannir → ouvre le modal au lieu de confirm()
  const banUser = (id: string, name: string) => {
    setBanTarget({ id, name });
    setBanDuration('permanent');
    setBanReason('');
    setBanCustomReason('');
    setBanMessage('');
  };
  const handleBanSubmit = async () => {
    if (!banTarget || !banReason) return;
    const reason = banReason === 'other' ? banCustomReason.trim() : banReason;
    if (!reason) return;
    try {
      await adminApi('post', `/users/${banTarget.id}/ban`, {
        duration: banDuration,
        reason,
        admin_message: banMessage.trim() || undefined,
      });
      showToast(`${banTarget.name} banni (${banDuration})`);
      setBanTarget(null);
      loadUsers();
    } catch (err: any) {
      showToast(`Erreur : ${err?.response?.data?.message || err?.message || 'Erreur serveur'}`);
    }
  };
  const unbanUser = async (id: string) => {
    try { await adminApi('post', `/users/${id}/unban`); showToast('Débanni'); loadUsers(); } catch {}
  };
  const muteUser = (id: string, name: string) => {
    setMuteTarget({ id, name });
    setMuteDuration('30m');
    setMuteReason('');
    setMuteCustomReason('');
    setMuteMessage('');
  };
  // ⭐ Fix 5 : handleMuteSubmit avec gestion d'erreur + admin_message
  const handleMuteSubmit = async () => {
    if (!muteTarget || !muteReason) return;
    const reason = muteReason === 'other' ? muteCustomReason.trim() : muteReason;
    if (!reason) return;
    try {
      await adminApi('post', `/users/${muteTarget.id}/mute`, {
        duration: muteDuration,
        reason,
        admin_message: muteMessage.trim() || undefined,
      });
      showToast(`${muteTarget.name} muté (${muteDuration})`);
      setMuteTarget(null);
      loadUsers();
    } catch (err: any) {
      showToast(`Erreur : ${err?.response?.data?.message || err?.message || 'Erreur serveur'}`);
    }
  };
  const unmuteUser = async (id: string) => {
    try { await adminApi('post', `/users/${id}/unmute`); showToast('Démuté'); loadUsers(); } catch {}
  };

  // ⭐ Ouvrir le modal d'action sur un signalement
  const openActionModal = (report: any) => {
    setActionTarget({ report });
    setActionType('hide');
    setActionDuration('1h');
    setActionReason('');
    setActionCustomReason('');
    setActionNotify(true);
    setActionMessage('');
  };

  // ⭐ Exécuter l'action composite (masquer ± muter ± bannir)
  const executeAction = async () => {
    if (!actionTarget || !actionReason) return;
    const reason = actionReason === 'other' ? actionCustomReason.trim() : actionReason;
    if (!reason) return;
    const r = actionTarget.report;
    try {
      await adminApi('post', '/reports/action', {
        report_ids: r.report_ids || [r.id],
        message_id: r.message_id || undefined,
        reported_user_id: r.reported_user_id,
        action: actionType,
        duration: actionType !== 'hide' ? actionDuration : undefined,
        reason,
        notify: actionNotify,
        admin_message: actionMessage.trim() || undefined,
      });
      const labels: Record<string, string> = {
        hide: 'Message masqué',
        hide_mute: 'Message masqué + utilisateur muté',
        hide_ban: 'Message masqué + utilisateur banni',
      };
      showToast(labels[actionType] || 'Action effectuée');
      setActionTarget(null);
      silentLoadReports(); loadStats();
    } catch (err: any) {
      showToast(`Erreur : ${err?.response?.data?.message || err?.message || 'Erreur serveur'}`);
    }
  };

  // ⭐ Rejeter tous les reports d'un message
  const dismissReport = async (r: any) => {
    const firstId = r.report_ids?.[0] || r.id;
    try {
      await adminApi('patch', `/reports/${firstId}`, { status: 'dismissed', message_id: r.message_id || undefined });
      showToast('Signalement rejeté');
      silentLoadReports(); loadStats();
    } catch {}
  };
  const cleanup = async () => {
    try { const r = await adminApi('post', '/cleanup'); showToast(`${r.inactivated} inactivés, ${r.archived} archivés, ${r.deleted} supprimés`); loadGroups(); loadStats(); } catch {}
  };

  // ⭐ Créer un salon officiel depuis l'admin
  const handleCreateOfficialGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreateGroupLoading(true);
    try {
      await adminApi('post', '/groups', {
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || undefined,
        type: newGroupType,
        rules: newGroupRules.trim() || undefined,
      });
      showToast(`Salon officiel "${newGroupName}" créé`);
      setShowCreateGroup(false);
      setNewGroupName(''); setNewGroupDesc(''); setNewGroupRules(''); setNewGroupType('public');
      loadGroups(); loadStats();
    } catch (err: any) {
      showToast(`Erreur : ${err?.response?.data?.message || err?.message || 'Erreur serveur'}`);
    }
    setCreateGroupLoading(false);
  };

  // ═══════════════════════════════════════════════════
  //  RENDERS
  // ═══════════════════════════════════════════════════

  // ── Loading ──
  if (authLoading || screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a1a' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Vérification...</div>
      </div>
    );
  }

    // ── Login ──
    if (screen === 'login') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4"
                 style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)' }}>

                {/* Grille décorative */}
                <div className="fixed inset-0 opacity-[0.03]"
                     style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

                <div className="relative w-[420px] rounded-2xl overflow-hidden"
                     style={{ background: 'rgba(15,15,35,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,92,246,0.15)', boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.08)' }}>

                    <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6366f1, #8b5cf6)' }} />

                    <div className="px-8 pt-8 pb-4 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl"
                             style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(139,92,246,0.2)' }}>
                            🔐
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-1">Panneau d&apos;administration</h1>
                        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Connexion requise</p>
                    </div>

                    <div className="px-8 pb-8 space-y-4">
                        {error && (
                            <div className="p-3 rounded-xl text-sm text-center"
                                 style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                                   style={{ color: 'rgba(255,255,255,0.4)' }}>Identifiant ou e-mail</label>
                            <input
                                type="text"
                                value={loginIdentifier}
                                onChange={e => setLoginIdentifier(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                                autoComplete="username"
                                placeholder="Your@Mail.fr"
                                className="w-full px-4 py-3 rounded-xl outline-none text-sm text-white transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', caretColor: '#8b5cf6' }}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                                   style={{ color: 'rgba(255,255,255,0.4)' }}>Mot de passe</label>
                            <input
                                type="password"
                                value={loginPassword}
                                onChange={e => setLoginPassword(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="w-full px-4 py-3 rounded-xl outline-none text-sm text-white transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', caretColor: '#8b5cf6' }}
                            />
                        </div>

                        <button
                            onClick={handleLogin}
                            disabled={!loginIdentifier.trim() || !loginPassword || loginLoading}
                            className="w-full mt-2 py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-30"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                            {loginLoading ? '⏳ Connexion…' : '→ Se connecter'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

  // ── Denied (fausse 404) ──
  if (screen === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a1a' }}>
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ color: 'rgba(255,255,255,0.15)' }}>404</div>
          <div style={{ color: 'rgba(255,255,255,0.3)' }}>Page introuvable</div>
          <a href="/chat_group" className="text-sm mt-4 inline-block" style={{ color: '#8b5cf6' }}>← Retour au chat</a>
        </div>
      </div>
    );
  }

  // ── Auth (setup ou verify) ──
  if (screen === 'setup' || screen === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)' }}>

        {/* Grille décorative */}
        <div className="fixed inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative w-[440px] rounded-2xl overflow-hidden"
          style={{ background: 'rgba(15,15,35,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,92,246,0.15)', boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.08)' }}>

          {/* Barre de couleur */}
          <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6366f1, #8b5cf6)' }} />

          {/* Header */}
          <div className="px-8 pt-8 pb-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(139,92,246,0.2)' }}>
              🛡️
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Panneau d&apos;administration</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {screen === 'setup' ? "Configuration de l'authentification 2FA" : 'Authentification requise'}
            </p>
          </div>

          <div className="px-8 pb-8">
            {/* Erreur */}
            {error && (
              <div className="mb-4 p-3 rounded-xl text-sm text-center"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {error}
              </div>
            )}

            {/* ── SETUP : QR Code ── */}
            {screen === 'setup' && (
              <>
                <div className="mb-5 p-5 rounded-xl text-center"
                  style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Scannez ce QR code avec <strong className="text-white">Google Authenticator</strong>
                  </p>
                  {qrCode && (
                    <div className="inline-block p-3 bg-white rounded-xl shadow-lg">
                      <img src={qrCode} alt="QR Code TOTP" className="w-[200px] h-[200px]" />
                    </div>
                  )}
                </div>

                {/* Clé manuelle */}
                <div className="mb-4">
                  <button onClick={() => setShowManual(!showManual)}
                    className="text-xs transition-colors hover:text-white" style={{ color: 'rgba(139,92,246,0.8)' }}>
                    {showManual ? '▾ Masquer la clé manuelle' : '▸ Saisie manuelle ?'}
                  </button>
                  {showManual && (
                    <div className="mt-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Clé secrète :</p>
                      <code className="text-sm font-mono select-all break-all" style={{ color: '#a78bfa' }}>{secretManual}</code>
                    </div>
                  )}
                </div>

                <div className="h-px my-5" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <p className="text-xs text-center mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Entrez le code à 6 chiffres pour activer
                </p>
              </>
            )}

            {/* ── VERIFY ── */}
            {screen === 'verify' && (
              <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Entrez le code de votre application d&apos;authentification
              </p>
            )}

            {/* ── Input code (commun setup + verify) ── */}
            <div className="mb-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) handleVerify(); }}
                maxLength={6}
                className="w-full text-center text-4xl font-bold py-5 px-4 rounded-xl outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `2px solid ${code.length === 6 ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: 'white',
                  letterSpacing: '0.4em',
                  caretColor: '#8b5cf6',
                }}
              />
              <p className="text-center mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {code.length}/6 chiffres
              </p>
            </div>

            <button onClick={handleVerify}
              disabled={code.length !== 6 || verifying}
              className="w-full mt-4 py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-30"
              style={{
                background: code.length === 6 ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'rgba(139,92,246,0.2)',
                boxShadow: code.length === 6 ? '0 0 30px rgba(139,92,246,0.3)' : 'none',
              }}>
              {verifying ? '⏳ Vérification...' : screen === 'setup' ? '✅ Activer et accéder' : '🔓 Accéder au panel'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════════
  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'stats', icon: '📊', label: 'Statistiques' },
    { id: 'moderation', icon: '🚩', label: 'Modération' },
    { id: 'users', icon: '👥', label: 'Utilisateurs' },
    { id: 'groups', icon: '💬', label: 'Salons' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)' }}>

      {/* ═══ Top bar ═══ */}
      <div className="sticky top-0 z-50 px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(10,10,26,0.8)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))', border: '1px solid rgba(139,92,246,0.2)' }}>🛡️</div>
          <span className="text-lg font-bold" style={{ color: '#a78bfa' }}>Admin Panel</span>
          {toast && <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>{toast}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-xs font-mono ${timeLeft < 300 ? 'text-red-400' : ''}`} style={{ color: timeLeft < 300 ? undefined : 'rgba(255,255,255,0.3)' }}>
            ⏱ {formatTime(timeLeft)}
          </span>
          <a href="/chat_group" className="text-xs hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.4)' }}>← Chat</a>
          <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 transition-colors">🔒 Verrouiller</button>
        </div>
      </div>

      <div className="flex">
        {/* ═══ Sidebar ═══ */}
        <div className="w-[220px] min-h-[calc(100vh-52px)] p-4 flex-shrink-0"
          style={{ background: 'rgba(10,10,26,0.5)', borderRight: '1px solid rgba(139,92,246,0.08)' }}>
          <div className="space-y-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: tab === t.id ? 'rgba(139,92,246,0.12)' : 'transparent',
                  border: tab === t.id ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
                  color: tab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                }}>
                <span>{t.icon}</span> {t.label}
                {t.id === 'moderation' && stats?.moderation?.pending_reports > 0 && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-px rounded-full bg-red-500 text-white">{stats.moderation.pending_reports}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ Contenu ═══ */}
        <div className="flex-1 p-6 max-w-[1200px]">
          {dashLoading && groups.length === 0 && tab === 'groups' && <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Chargement...</div>}
          {dashLoading && users.length === 0 && tab === 'users' && <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Chargement...</div>}
          {dashLoading && reports.length === 0 && tab === 'moderation' && <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Chargement...</div>}
          {dashLoading && !stats && tab === 'stats' && <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Chargement...</div>}

          {/* ════ STATS ════ */}
          {tab === 'stats' && stats && (
            <div>
              <h2 className="text-xl font-bold text-white mb-5">📊 Vue d&apos;ensemble</h2>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Utilisateurs', value: stats.users.total, icon: '👥', grad: 'rgba(139,92,246,0.12)' },
                  { label: 'Salons', value: stats.groups.total, icon: '💬', grad: 'rgba(34,197,94,0.12)' },
                  { label: 'Messages', value: stats.messages.total, icon: '✉️', grad: 'rgba(251,191,36,0.12)' },
                  { label: "Aujourd'hui", value: stats.messages.today, icon: '📈', grad: 'rgba(56,189,248,0.12)' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-5"
                    style={{ background: s.grad, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-2xl mb-2">{s.icon}</div>
                    <div className="text-3xl font-bold text-white">{(s.value || 0).toLocaleString()}</div>
                    <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Par tier</h3>
                  {Object.entries(stats.users.by_tier || {}).map(([tier, count]) => (
                    <div key={tier} className="flex justify-between py-1.5 text-sm">
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{tier === 'guest' ? '👤 Invités' : tier === 'registered' ? '✅ Inscrits' : '⭐ Premium'}</span>
                      <span className="font-semibold text-white">{String(count)}</span>
                    </div>
                  ))}
                  {stats.users.banned > 0 && (
                    <div className="flex justify-between py-1.5 text-sm text-red-400">
                      <span>🚫 Bannis</span><span className="font-semibold">{stats.users.banned}</span>
                    </div>
                  )}
                </div>
                <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Salons par statut</h3>
                  {Object.entries(stats.groups.by_status || {}).map(([s, count]) => (
                    <div key={s} className="flex justify-between py-1.5 text-sm">
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{s === 'active' ? '🟢 Actifs' : s === 'inactive' ? '💤 Inactifs' : '📦 Archivés'}</span>
                      <span className="font-semibold text-white">{String(count)}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Modération</h3>
                  <div className="flex justify-between py-1.5 text-sm"><span style={{ color: 'rgba(255,255,255,0.6)' }}>🚩 Reports en attente</span><span className="font-semibold text-orange-400">{stats.moderation.pending_reports}</span></div>
                  <div className="flex justify-between py-1.5 text-sm"><span style={{ color: 'rgba(255,255,255,0.6)' }}>⚡ Actions (7j)</span><span className="font-semibold text-white">{stats.moderation.actions_this_week}</span></div>
                  <div className="flex justify-between py-1.5 text-sm"><span style={{ color: 'rgba(255,255,255,0.6)' }}>💬 PV actives</span><span className="font-semibold text-white">{stats.conversations.total}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* ════ MODÉRATION (reports regroupés par message) ════ */}
          {tab === 'moderation' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-white">🚩 Signalements</h2>
                <div className="flex gap-1">
                  {[{ v: 'pending', l: 'En attente' }, { v: 'actioned', l: 'Traités' }, { v: 'dismissed', l: 'Rejetés' }, { v: 'all', l: 'Tous' }].map(f => (
                    <button key={f.v} onClick={() => setReportFilter(f.v)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: reportFilter === f.v ? 'rgba(139,92,246,0.15)' : 'transparent', color: reportFilter === f.v ? '#a78bfa' : 'rgba(255,255,255,0.4)' }}>{f.l}</button>
                  ))}
                </div>
              </div>
              {reports.length === 0 ? (
                <div className="text-center py-16"><div className="text-4xl mb-3">✅</div><p style={{ color: 'rgba(255,255,255,0.4)' }}>Aucun signalement {reportFilter === 'pending' ? 'en attente' : ''}</p></div>
              ) : (
                <div className="space-y-3">
                  {reports.map((r: any, idx: number) => {
                    const reporters = r.reporters || [{ reporter_username: r.reporter_username, reason: r.reason, reason_text: r.reason_text, created_at: r.created_at }];
                    const reportCount = reporters.length;
                    const firstReportId = r.report_ids?.[0] || r.id;

                    return (
                      <div key={r.message_id || r.id || idx} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-sm">
                            <span className="font-semibold text-red-400">{r.reported_username}</span>
                            {r.group_name && <span style={{ color: 'rgba(255,255,255,0.4)' }}> dans #{r.group_name}</span>}
                            {r.message_parent_id && <span className="text-[9px] ml-1.5 px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>thread</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {reportCount > 1 && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                                {reportCount}× signalé
                              </span>
                            )}
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg"
                              style={{ background: r.status === 'pending' ? 'rgba(251,191,36,0.15)' : r.status === 'actioned' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                                color: r.status === 'pending' ? '#fbbf24' : r.status === 'actioned' ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                              {r.status === 'pending' ? 'EN ATTENTE' : r.status === 'actioned' ? 'TRAITÉ' : 'REJETÉ'}
                            </span>
                            {r.message_is_hidden && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>MASQUÉ</span>
                            )}
                          </div>
                        </div>

                        {/* Message signalé */}
                        {r.message_content && (
                          <div className={`p-2.5 rounded-lg mb-3 text-xs ${r.message_is_hidden ? 'line-through opacity-50' : ''}`}
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
                            {r.message_content}
                          </div>
                        )}

                        {/* Liste des reporters + raisons */}
                        <div className="space-y-1.5 mb-3">
                          {reporters.map((rep: any, i: number) => (
                            <div key={rep.id || i} className="flex items-start gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                              <span className="flex-shrink-0">🚩</span>
                              <div>
                                <span className="text-white font-medium">{rep.reporter_username}</span>
                                <span className="mx-1">—</span>
                                <span className="font-semibold" style={{ color: '#fbbf24' }}>{rep.reason}</span>
                                {rep.reason_text && <span className="italic ml-1">« {rep.reason_text} »</span>}
                                <span className="ml-2 text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                  {new Date(rep.created_at).toLocaleString('fr-FR')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Actions */}
                        {r.status === 'pending' && (
                          <div className="flex gap-2">
                            <button onClick={() => openActionModal(r)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                              style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>
                              ⚡ Agir {reportCount > 1 ? `(${reportCount})` : ''}
                            </button>
                            <button onClick={() => dismissReport(r)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                              ✕ Rejeter {reportCount > 1 ? `(${reportCount})` : ''}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════ UTILISATEURS ════ */}
          {tab === 'users' && (
            <div>
              <h2 className="text-xl font-bold text-white mb-5">👥 Utilisateurs ({users.length})</h2>
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Utilisateur', 'Email', 'Tier', 'Rôle', 'Statut', 'Inscrit', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 text-sm font-medium text-white">{u.username}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{u.email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: u.tier === 'premium' ? 'rgba(251,191,36,0.15)' : u.tier === 'registered' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                              color: u.tier === 'premium' ? '#fbbf24' : u.tier === 'registered' ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                            {u.tier?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{u.app_role === 'superadmin' ? '🛡️' : '—'}</td>
                        <td className="px-4 py-3">
                          {u.is_banned ? <span className="text-[9px] font-bold text-red-400">BANNI</span>
                            : u.is_muted ? <span className="text-[9px] font-bold text-orange-400">MUTÉ</span>
                            : <span className="text-[9px] text-green-400">OK</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {u.app_role !== 'superadmin' && (
                            <>
                              {u.is_muted
                                ? <button onClick={() => unmuteUser(u.id)} className="text-[10px] text-blue-400 hover:underline">Démuter</button>
                                : <button onClick={() => muteUser(u.id, u.username)} className="text-[10px] text-orange-400 hover:underline">Muter</button>
                              }
                              {u.is_banned
                                ? <button onClick={() => unbanUser(u.id)} className="text-[10px] text-green-400 hover:underline">Débannir</button>
                                : <button onClick={() => banUser(u.id, u.username)} className="text-[10px] text-red-400 hover:underline">Bannir</button>
                              }
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════ SALONS ════ */}
          {tab === 'groups' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-white">💬 Salons ({groups.length})</h2>
                <div className="flex gap-2">
                  <button onClick={() => setShowCreateGroup(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(109,40,217,0.3))', border: '1px solid rgba(139,92,246,0.4)' }}>
                    ⭐ Créer salon officiel
                  </button>
                  <button onClick={cleanup} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>🧹 Nettoyage</button>
                </div>
              </div>

              {/* Légende */}
              <div className="flex items-center gap-4 mb-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.5)' }} />
                  Salon officiel (jamais supprimé)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} />
                  Salon utilisateur (cycle de vie automatique)
                </span>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      {['Nom', 'Type', 'Statut', 'Membres', 'Créateur', 'Créé', 'Dernier msg'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.length === 0 && !dashLoading && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          Aucun salon — créez un salon officiel ou attendez que des utilisateurs en créent.
                        </td>
                      </tr>
                    )}
                    {groups.map(g => (
                      <tr key={g.id} className="transition-colors" style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: g.is_official ? 'rgba(139,92,246,0.06)' : 'transparent',
                      }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {g.is_official && <span className="text-[9px]">⭐</span>}
                            <span className="text-sm font-medium" style={{ color: g.is_official ? '#c4b5fd' : 'white' }}>
                              #{g.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: g.type === 'public' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                              color: g.type === 'public' ? '#4ade80' : '#fbbf24' }}>{g.type?.toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: g.status === 'active' ? 'rgba(34,197,94,0.15)' : g.status === 'inactive' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                              color: g.status === 'active' ? '#4ade80' : g.status === 'inactive' ? '#fbbf24' : '#f87171' }}>
                            {g.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white">{g.member_count || 0}</td>
                        <td className="px-4 py-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {g.creator_username || <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{new Date(g.created_at).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{g.last_message_at ? new Date(g.last_message_at).toLocaleDateString('fr-FR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ⭐ Modal Création salon officiel */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[460px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            style={{ background: 'rgba(15,15,35,0.97)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6d28d9, #8b5cf6)' }} />
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">⭐ Créer un salon officiel</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Jamais supprimé automatiquement</p>
              </div>
              <button onClick={() => setShowCreateGroup(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'public', icon: '#', label: 'Public', desc: 'Visible par tous' }, { v: 'private', icon: '🔒', label: 'Privé', desc: 'Sur invitation' }].map(t => (
                    <button key={t.v} onClick={() => setNewGroupType(t.v as 'public' | 'private')}
                      className="p-3 rounded-xl text-left transition-all"
                      style={{
                        background: newGroupType === t.v ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${newGroupType === t.v ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}>
                      <div className="text-sm font-bold text-white">{t.icon} {t.label}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              {/* Nom */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Nom du salon *</label>
                <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                  placeholder="ex: actualités, gaming, support..." maxLength={100}
                  className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: newGroupName.trim() ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)' }} />
              </div>
              {/* Description */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Description <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optionnel)</span>
                </label>
                <input type="text" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                  placeholder="Description courte du salon..." maxLength={500}
                  className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }} />
              </div>
              {/* Règles */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Règles <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optionnel)</span>
                </label>
                <textarea value={newGroupRules} onChange={e => setNewGroupRules(e.target.value)}
                  placeholder="Règles de conduite du salon..." maxLength={2000} rows={3}
                  className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all resize-none"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }} />
              </div>
              {/* Boutons */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowCreateGroup(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                  Annuler
                </button>
                <button onClick={handleCreateOfficialGroup}
                  disabled={!newGroupName.trim() || createGroupLoading}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  {createGroupLoading ? '⏳ Création...' : '⭐ Créer le salon'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Modal Action sur signalement */}
      {actionTarget && (() => {
        const r = actionTarget.report;
        const reportCount = r.reporters?.length || 1;
        const needsDuration = actionType !== 'hide';
        const reasonFinal = actionReason === 'other' ? actionCustomReason.trim() : actionReason;
        const canSubmit = !!actionReason && (actionReason !== 'other' || !!actionCustomReason.trim());

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[500px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
              style={{ background: 'rgba(15,15,35,0.97)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444)' }} />

              {/* Header */}
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">⚡ Agir sur le signalement</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {reportCount > 1 ? `${reportCount} signalements` : '1 signalement'} — <span className="text-red-400 font-medium">{r.reported_username}</span>
                    {r.group_name ? ` dans #${r.group_name}` : ''}
                  </p>
                </div>
                <button onClick={() => setActionTarget(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm">✕</button>
              </div>

              <div className="p-6 space-y-5">
                {/* Message concerné */}
                {r.message_content && (
                  <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                    <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Message signalé</div>
                    <div className="line-clamp-2 italic">{r.message_content}</div>
                  </div>
                )}

                {/* Choix de l'action */}
                <div>
                  <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Action à effectuer</label>
                  <div className="space-y-1.5">
                    {[
                      { value: 'hide', icon: '🙈', label: 'Masquer le message uniquement', desc: 'Le message est grisé, l\'utilisateur peut toujours écrire' },
                      { value: 'hide_mute', icon: '🔇', label: 'Masquer + Muter l\'utilisateur', desc: 'Message masqué et utilisateur ne peut plus envoyer de messages' },
                      { value: 'hide_ban', icon: '🚫', label: 'Masquer + Bannir l\'utilisateur', desc: 'Message masqué et utilisateur expulsé de la plateforme' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setActionType(opt.value as any)}
                        className="w-full p-3 rounded-xl text-left transition-all"
                        style={{
                          background: actionType === opt.value
                            ? opt.value === 'hide_ban' ? 'rgba(239,68,68,0.12)' : opt.value === 'hide_mute' ? 'rgba(249,115,22,0.12)' : 'rgba(139,92,246,0.12)'
                            : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${actionType === opt.value
                            ? opt.value === 'hide_ban' ? 'rgba(239,68,68,0.4)' : opt.value === 'hide_mute' ? 'rgba(249,115,22,0.4)' : 'rgba(139,92,246,0.3)'
                            : 'rgba(255,255,255,0.05)'}`,
                        }}>
                        <div className="text-xs font-semibold text-white">{opt.icon} {opt.label}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Durée (si mute ou ban) */}
                {needsDuration && (
                  <div>
                    <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">
                      Durée {actionType === 'hide_mute' ? 'du mute' : 'du ban'}
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(actionType === 'hide_mute'
                        ? ['5m','15m','30m','1h','2h','6h','12h','24h','7d','30d','permanent']
                        : ['1h','6h','24h','7d','30d','permanent']
                      ).map(d => (
                        <button key={d} onClick={() => setActionDuration(d)}
                          className="py-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: actionDuration === d ? (d === 'permanent' ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.2)') : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${actionDuration === d ? (d === 'permanent' ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.3)') : 'rgba(255,255,255,0.06)'}`,
                            color: actionDuration === d ? (d === 'permanent' ? '#f87171' : '#a78bfa') : 'rgba(255,255,255,0.5)',
                          }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Motif */}
                <div>
                  <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Motif de la décision</label>
                  <div className="space-y-1.5">
                    {[
                      { value: 'Contenu inapproprié', icon: '🔞' },
                      { value: 'Spam / Publicité', icon: '📢' },
                      { value: 'Harcèlement', icon: '😤' },
                      { value: 'Discours haineux', icon: '🚫' },
                      { value: 'Désinformation', icon: '❌' },
                      { value: 'Comportement toxique', icon: '☠️' },
                      { value: 'other', icon: '📝', label: 'Autre (personnalisé)' },
                    ].map(opt => (
                      <button key={opt.value}
                        onClick={() => { setActionReason(opt.value); if (opt.value !== 'other') setActionCustomReason(''); }}
                        className="w-full p-3 rounded-xl text-left transition-all"
                        style={{
                          background: actionReason === opt.value ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${actionReason === opt.value ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                        }}>
                        <span className="text-xs font-semibold text-white">{opt.icon} {('label' in opt ? opt.label : opt.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Champ libre si "Autre" */}
                {actionReason === 'other' && (
                  <div>
                    <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Précisez le motif</label>
                    <input type="text" value={actionCustomReason} onChange={e => setActionCustomReason(e.target.value)}
                      placeholder="Motif personnalisé..." maxLength={200}
                      className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} />
                  </div>
                )}

                {/* Notifier l'utilisateur */}
                {actionType !== 'hide' && (
                  <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <button onClick={() => setActionNotify(v => !v)}
                      className="w-9 h-5 rounded-full transition-all flex-shrink-0 relative"
                      style={{ background: actionNotify ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ left: actionNotify ? '18px' : '2px' }} />
                    </button>
                    <div>
                      <div className="text-xs font-semibold text-white">Notifier l&apos;utilisateur</div>
                      <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Envoie une notification WebSocket temps réel</div>
                    </div>
                  </div>
                )}

                {/* ⭐ Message optionnel à l'utilisateur */}
                {(actionType !== 'hide' && actionNotify) && (
                  <div>
                    <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                      Message à l&apos;utilisateur <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optionnel)</span>
                    </label>
                    <textarea value={actionMessage} onChange={e => setActionMessage(e.target.value)}
                      placeholder="Ajoutez un message personnalisé visible par l'utilisateur..." maxLength={400} rows={2}
                      className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all resize-none"
                      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} />
                  </div>
                )}

                {/* Boutons */}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setActionTarget(null)}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
                    style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                    Annuler
                  </button>
                  <button onClick={executeAction} disabled={!canSubmit}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-30"
                    style={{
                      background: actionType === 'hide_ban'
                        ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                        : actionType === 'hide_mute'
                          ? 'linear-gradient(135deg, #f97316, #ef4444)'
                          : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                    }}>
                    {actionType === 'hide' ? '🙈 Masquer' : actionType === 'hide_mute' ? `🔇 Masquer + Muter (${actionDuration})` : `🚫 Masquer + Bannir (${actionDuration})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ⭐ Modal Ban (onglet utilisateurs) */}
      {banTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            style={{ background: 'rgba(15,15,35,0.95)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #ef4444, #b91c1c, #ef4444)' }} />
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">🚫 Bannir {banTarget.name}</h2>
              <button onClick={() => setBanTarget(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm">✕</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Durée */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Durée du ban</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['1h','6h','24h','7d','30d','permanent'].map(d => (
                    <button key={d} onClick={() => setBanDuration(d)}
                      className="py-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: banDuration === d ? (d === 'permanent' ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.2)') : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${banDuration === d ? (d === 'permanent' ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.3)') : 'rgba(255,255,255,0.06)'}`,
                        color: banDuration === d ? (d === 'permanent' ? '#f87171' : '#a78bfa') : 'rgba(255,255,255,0.5)',
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              {/* Motif */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Motif</label>
                <div className="space-y-1.5">
                  {[
                    { value: 'Contenu inapproprié', icon: '🔞' },
                    { value: 'Spam / Publicité', icon: '📢' },
                    { value: 'Harcèlement', icon: '😤' },
                    { value: 'Discours haineux', icon: '🚫' },
                    { value: 'Comportement toxique', icon: '☠️' },
                    { value: 'Fraude / Usurpation', icon: '🎭' },
                    { value: 'other', icon: '📝', label: 'Autre (personnalisé)' },
                  ].map(r => (
                    <button key={r.value} onClick={() => { setBanReason(r.value); if (r.value !== 'other') setBanCustomReason(''); }}
                      className="w-full p-3 rounded-xl text-left transition-all"
                      style={{
                        background: banReason === r.value ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${banReason === r.value ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      }}>
                      <span className="text-xs font-semibold text-white">{'icon' in r ? r.icon : ''} {'label' in r ? r.label : r.value}</span>
                    </button>
                  ))}
                </div>
              </div>
              {banReason === 'other' && (
                <div>
                  <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Précisez le motif</label>
                  <input type="text" value={banCustomReason} onChange={e => setBanCustomReason(e.target.value)}
                    placeholder="Raison personnalisée..." maxLength={200}
                    className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} />
                </div>
              )}
              {/* Message optionnel */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Message à l&apos;utilisateur <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optionnel)</span>
                </label>
                <textarea value={banMessage} onChange={e => setBanMessage(e.target.value)}
                  placeholder="Ajoutez un message visible par l'utilisateur lors de son bannissement..." maxLength={400} rows={2}
                  className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all resize-none"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setBanTarget(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                  Annuler
                </button>
                <button onClick={handleBanSubmit}
                  disabled={!banReason || (banReason === 'other' && !banCustomReason.trim())}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-30"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                  🚫 Bannir ({banDuration})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Modal Mute */}
      {muteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[480px] max-h-[85vh] overflow-y-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            style={{ background: 'rgba(15,15,35,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #f97316, #ef4444, #f97316)' }} />

            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">🔇 Muter {muteTarget.name}</h2>
              <button onClick={() => setMuteTarget(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Durée */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Durée du mute</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {['5m','10m','15m','30m','1h','2h','3h','6h','12h','24h','7d','30d','permanent'].map(d => (
                    <button key={d} onClick={() => setMuteDuration(d)}
                      className="py-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: muteDuration === d ? (d === 'permanent' ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.2)') : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${muteDuration === d ? (d === 'permanent' ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.3)') : 'rgba(255,255,255,0.06)'}`,
                        color: muteDuration === d ? (d === 'permanent' ? '#f87171' : '#a78bfa') : 'rgba(255,255,255,0.5)',
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Motif */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-2">Motif</label>
                <div className="space-y-1.5">
                  {[
                    { value: 'Contenu inapproprié', icon: '🔞' },
                    { value: 'Spam / Publicité', icon: '📢' },
                    { value: 'Harcèlement', icon: '😤' },
                    { value: 'Discours haineux', icon: '🚫' },
                    { value: 'Comportement toxique', icon: '☠️' },
                    { value: 'Flood / Abus', icon: '🌊' },
                    { value: 'other', icon: '📝', label: 'Autre (personnalisé)' },
                  ].map(r => (
                    <button key={r.value} onClick={() => { setMuteReason(r.value); if (r.value !== 'other') setMuteCustomReason(''); }}
                      className="w-full p-3 rounded-xl text-left transition-all"
                      style={{
                        background: muteReason === r.value ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${muteReason === r.value ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      }}>
                      <span className="text-xs font-semibold text-white">{r.icon} {r.label || r.value}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Champ libre si "Autre" */}
              {muteReason === 'other' && (
                <div>
                  <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Précisez le motif</label>
                  <input type="text" value={muteCustomReason} onChange={e => setMuteCustomReason(e.target.value)}
                    placeholder="Raison personnalisée..." maxLength={200}
                    className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} />
                </div>
              )}

              {/* ⭐ Message optionnel à l'utilisateur */}
              <div>
                <label className="block text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Message à l&apos;utilisateur <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optionnel)</span>
                </label>
                <textarea value={muteMessage} onChange={e => setMuteMessage(e.target.value)}
                  placeholder="Ajoutez un message personnalisé visible par l'utilisateur..." maxLength={400} rows={2}
                  className="w-full p-2.5 rounded-lg border text-sm text-white outline-none transition-all resize-none"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }} />
              </div>

              {/* Boutons */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setMuteTarget(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                  Annuler
                </button>
                <button onClick={handleMuteSubmit}
                  disabled={!muteReason || (muteReason === 'other' && !muteCustomReason.trim())}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-30"
                  style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}>
                  🔇 Muter ({muteDuration})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
