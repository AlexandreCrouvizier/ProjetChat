/**
 * components/admin/AdminDashboard.tsx — Dashboard admin complet
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  adminApi: (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => Promise<any>;
  getTimeRemaining: () => number;
  onLogout: () => void;
}

type Tab = 'stats' | 'moderation' | 'users' | 'groups';

export function AdminDashboard({ adminApi, getTimeRemaining, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [reportFilter, setReportFilter] = useState('pending');
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [toast, setToast] = useState('');

  // ⭐ État modal mute
  const [muteTarget, setMuteTarget] = useState<{ id: string; name: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState('30m');
  const [muteReason, setMuteReason] = useState('');
  const [muteCustomReason, setMuteCustomReason] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  useEffect(() => {
    const i = setInterval(() => setTimeLeft(getTimeRemaining()), 1000);
    return () => clearInterval(i);
  }, [getTimeRemaining]);

  useEffect(() => { if (timeLeft <= 0 && stats) onLogout(); }, [timeLeft, stats, onLogout]);

  const loadStats = useCallback(async () => { setLoading(true); try { setStats(await adminApi('get', '/stats')); } catch {} setLoading(false); }, [adminApi]);
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: '1', limit: '50' });
      if (reportFilter !== 'all') p.set('status', reportFilter);
      const d = await adminApi('get', `/reports?${p}`);
      setReports(d?.reports || []);
    } catch {} setLoading(false);
  }, [adminApi, reportFilter]);
  const loadUsers = useCallback(async () => { setLoading(true); try { const d = await adminApi('get', '/users'); setUsers(d?.users || []); } catch {} setLoading(false); }, [adminApi]);
  const loadGroups = useCallback(async () => { setLoading(true); try { const d = await adminApi('get', '/groups'); setGroups(d?.groups || []); } catch {} setLoading(false); }, [adminApi]);

  useEffect(() => {
    if (tab === 'stats') loadStats();
    else if (tab === 'moderation') loadReports();
    else if (tab === 'users') loadUsers();
    else if (tab === 'groups') loadGroups();
  }, [tab, loadStats, loadReports, loadUsers, loadGroups]);

  const reviewReport = async (id: string, status: string) => {
    try { await adminApi('patch', `/reports/${id}`, { status }); showToast(status === 'actioned' ? 'Signalement traité' : 'Signalement rejeté'); loadReports(); loadStats(); } catch {}
  };
  const banUser = async (id: string, name: string) => {
    if (!confirm(`Bannir ${name} ?`)) return;
    try { await adminApi('post', `/users/${id}/ban`, { duration: 'permanent', reason: 'Banni par admin' }); showToast(`${name} banni`); loadUsers(); } catch {}
  };
  const unbanUser = async (id: string) => {
    try { await adminApi('post', `/users/${id}/unban`); showToast('Débanni'); loadUsers(); } catch {}
  };
  const muteUser = (id: string, name: string) => {
    setMuteTarget({ id, name });
    setMuteDuration('30m');
    setMuteReason('');
    setMuteCustomReason('');
  };
  const handleMuteSubmit = async () => {
    if (!muteTarget || !muteReason) return;
    const reason = muteReason === 'other' ? muteCustomReason.trim() : muteReason;
    if (!reason) return;
    try {
      await adminApi('post', `/users/${muteTarget.id}/mute`, { duration: muteDuration, reason });
      showToast(`${muteTarget.name} muté (${muteDuration})`);
      setMuteTarget(null);
      loadUsers();
    } catch {}
  };
  const unmuteUser = async (id: string) => {
    try { await adminApi('post', `/users/${id}/unmute`); showToast('Démuté'); loadUsers(); } catch {}
  };
  const cleanup = async () => {
    try { const r = await adminApi('post', '/cleanup'); showToast(`${r.inactivated} inactivés, ${r.archived} archivés, ${r.deleted} supprimés`); loadGroups(); loadStats(); } catch {}
  };

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'stats', icon: '📊', label: 'Statistiques' },
    { id: 'moderation', icon: '🚩', label: 'Modération' },
    { id: 'users', icon: '👥', label: 'Utilisateurs' },
    { id: 'groups', icon: '💬', label: 'Salons' },
  ];

  const c = (base: string, active: string, isActive: boolean) => isActive ? `${base} ${active}` : base;

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
          <button onClick={onLogout} className="text-xs text-red-400 hover:text-red-300 transition-colors">🔒 Verrouiller</button>
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
          {loading && <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Chargement...</div>}

          {/* ════ STATS ════ */}
          {tab === 'stats' && stats && !loading && (
            <div>
              <h2 className="text-xl font-bold text-white mb-5">📊 Vue d&apos;ensemble</h2>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Utilisateurs', value: stats.users.total, icon: '👥', grad: 'rgba(139,92,246,0.12)' },
                  { label: 'Salons', value: stats.groups.total, icon: '💬', grad: 'rgba(34,197,94,0.12)' },
                  { label: 'Messages', value: stats.messages.total, icon: '✉️', grad: 'rgba(251,191,36,0.12)' },
                  { label: 'Aujourd\'hui', value: stats.messages.today, icon: '📈', grad: 'rgba(56,189,248,0.12)' },
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

          {/* ════ MODÉRATION ════ */}
          {tab === 'moderation' && !loading && (
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
                  {reports.map(r => (
                    <div key={r.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-sm">
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Par </span>
                          <span className="font-semibold text-white">{r.reporter_username}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}> → </span>
                          <span className="font-semibold text-red-400">{r.reported_username}</span>
                          {r.group_name && <span style={{ color: 'rgba(255,255,255,0.4)' }}> dans #{r.group_name}</span>}
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg"
                          style={{ background: r.status === 'pending' ? 'rgba(251,191,36,0.15)' : r.status === 'actioned' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                            color: r.status === 'pending' ? '#fbbf24' : r.status === 'actioned' ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                          {r.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Motif : <strong className="text-white">{r.reason}</strong></div>
                      {r.reason_text && <div className="text-xs italic mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>« {r.reason_text} »</div>}
                      {r.message_content && (
                        <div className="p-2 rounded-lg mb-2 text-xs line-clamp-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>{r.message_content}</div>
                      )}
                      <div className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>{new Date(r.created_at).toLocaleString('fr-FR')}</div>
                      {r.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => reviewReport(r.id, 'actioned')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}>⚡ Agir</button>
                          <button onClick={() => reviewReport(r.id, 'dismissed')} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>✕ Rejeter</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════ UTILISATEURS ════ */}
          {tab === 'users' && !loading && (
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
                        <td className="px-4 py-3 text-right">
                          {u.app_role !== 'superadmin' && (
                            <div className="flex gap-2 justify-end">
                              {u.is_muted
                                ? <button onClick={() => unmuteUser(u.id)} className="text-[10px] text-blue-400 hover:underline">Démuter</button>
                                : <button onClick={() => muteUser(u.id, u.username)} className="text-[10px] text-orange-400 hover:underline">Muter</button>
                              }
                              {u.is_banned
                                ? <button onClick={() => unbanUser(u.id)} className="text-[10px] text-green-400 hover:underline">Débannir</button>
                                : <button onClick={() => banUser(u.id, u.username)} className="text-[10px] text-red-400 hover:underline">Bannir</button>
                              }
                            </div>
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
          {tab === 'groups' && !loading && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-white">💬 Salons ({groups.length})</h2>
                <button onClick={cleanup} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>🧹 Nettoyage</button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Nom', 'Type', 'Statut', 'Membres', 'Officiel', 'Créé', 'Dernier msg'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={g.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 text-sm font-medium text-white">#{g.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: g.type === 'public' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                              color: g.type === 'public' ? '#4ade80' : '#fbbf24' }}>{g.type?.toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: g.status === 'active' ? 'rgba(34,197,94,0.15)' : g.status === 'inactive' ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)',
                              color: g.status === 'active' ? '#4ade80' : g.status === 'inactive' ? '#fbbf24' : '#f87171' }}>{g.status?.toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white">{g.member_count || 0}</td>
                        <td className="px-4 py-3">{g.is_official ? '⭐' : '—'}</td>
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
