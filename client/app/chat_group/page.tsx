/**
 * app/chat_group/page.tsx — Phase 3 Étape 5 : blocage effectif
 * 
 * Changements vs version précédente :
 *   - useBlocked() hook pour récupérer la liste des IDs bloqués
 *   - blockedUserIds passé au MessageList pour filtrer les messages
 *   - refreshBlocked() appelé quand le ProfileModal se ferme (après un block/unblock)
 */
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import type { ChatMessage } from '@/hooks/useChat';
import { useDMChat } from '@/hooks/useDMChat';
import { useGroups, type Group } from '@/hooks/useGroups';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { useBlocked } from '@/hooks/useBlocked';
import { getSocket } from '@/lib/socket';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { MembersPanel } from '@/components/chat/MembersPanel';
import { ProfileModal } from '@/components/modals/ProfileModal';
import { EditProfileModal } from '@/components/modals/EditProfileModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { ReportModal } from '@/components/modals/ReportModal';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

type ChatMode = 'group' | 'dm';

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { groups, joinGroup, leaveGroup, loadGroups } = useGroups();
  const { conversations, startConversation, hideConversation } = useConversations();
  const { blockedIds, refreshBlocked } = useBlocked();

  const [mode, setMode] = useState<ChatMode>('group');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroupName, setActiveGroupName] = useState<string>('');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConvName, setActiveConvName] = useState<string>('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ messageId: string; content: string; author: string } | null>(null);
  const [muteInfo, setMuteInfo] = useState<{ duration: string; reason: string; expires_at?: string | null; admin_message?: string } | null>(null);
  const [banInfo, setBanInfo] = useState<{ duration: string; reason: string; admin_message?: string } | null>(null);

  // ⭐ État invitation : modal de confirmation inline
  const [inviteInfo, setInviteInfo] = useState<{
    code: string;
    groupName: string;
    groupId: string;
    memberCount: number;
    description: string | null;
  } | null>(null);
  const [inviteJoining, setInviteJoining] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const groupChat = useChat(mode === 'group' ? activeGroupId : null, user?.id || null);
  const dmChat = useDMChat(mode === 'dm' ? activeConvId : null, user?.id || null);
  const activeChat = mode === 'group' ? groupChat : dmChat;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      // ⭐ Sauvegarder le code d'invitation avant la redirection
      const code = searchParams?.get('invite');
      if (code) sessionStorage.setItem('pending_invite', code);
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router, searchParams]);

  // ⭐ Détecter le paramètre ?invite=CODE dans l'URL et charger les infos
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    // Récupérer le code depuis l'URL ou depuis sessionStorage (cas après login)
    const code = searchParams?.get('invite') || sessionStorage.getItem('pending_invite');
    if (!code) return;
    sessionStorage.removeItem('pending_invite');
    // Nettoyer l'URL si le code venait de l'URL
    if (searchParams?.get('invite')) router.replace('/chat_group', { scroll: false });
    // Tenter de rejoindre directement
    api.post(`/groups/invites/${code}`)
      .then(({ data }) => {
        // Succès (nouveau membre ou déjà membre) → naviguer vers le salon
        loadGroups().then(() => {
          setMode('group');
          setActiveGroupId(data.group.id);
          setActiveGroupName(data.group.name);
          joinGroup(data.group.id);
        });
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || '';
        setInviteError(msg || 'Invitation invalide ou expirée');
        setTimeout(() => setInviteError(''), 5000);
      });
  }, [searchParams, isAuthenticated, authLoading]);
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId && mode === 'group') {
      const f = groups[0]; setActiveGroupId(f.id); setActiveGroupName(f.name); joinGroup(f.id);
    }
  }, [groups, activeGroupId, joinGroup, mode]);

  // ⭐ Écouter les notifications de mute/ban
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onMuted = (data: { duration: string; reason: string; expires_at?: string | null; admin_message?: string }) => {
      setMuteInfo({ duration: data.duration, reason: data.reason, expires_at: data.expires_at, admin_message: data.admin_message });
    };
    const onBanned = (data: { duration: string; reason: string; admin_message?: string }) => {
      setBanInfo({ duration: data.duration, reason: data.reason, admin_message: data.admin_message });
      // ⭐ Forcer la déconnexion après 8s même si l'utilisateur ne clique pas
      setTimeout(() => { logout(); }, 8000);
    };
    socket.on('moderation:muted', onMuted);
    socket.on('moderation:banned', onBanned);
    return () => {
      socket.off('moderation:muted', onMuted);
      socket.off('moderation:banned', onBanned);
    };
  }, [logout]);

  const handleSelectGroup = async (g: Group) => {
    setMode('group'); setActiveGroupId(g.id); setActiveGroupName(g.name); setActiveConvId(null); await joinGroup(g.id);
  };
  const handleSelectConv = (c: Conversation) => {
    setMode('dm'); setActiveConvId(c.id); setActiveConvName(c.participant_username); setActiveGroupId(null);
  };
  const handleHideConv = async (id: string) => {
    await hideConversation(id);
    if (activeConvId === id) { setMode('group'); setActiveConvId(null); if (groups.length > 0) { setActiveGroupId(groups[0].id); setActiveGroupName(groups[0].name); } }
  };
  const handleLeaveGroup = async (groupId: string) => {
    await leaveGroup(groupId);
    if (activeGroupId === groupId) {
      const remaining = groups.filter(g => g.id !== groupId);
      if (remaining.length > 0) { setActiveGroupId(remaining[0].id); setActiveGroupName(remaining[0].name); }
      else { setActiveGroupId(null); setActiveGroupName(''); }
    }
  };
  const handleGroupCreated = async (group: any) => {
    await loadGroups();
    setMode('group'); setActiveGroupId(group.id); setActiveGroupName(group.name); setActiveConvId(null);
    await joinGroup(group.id);
  };
  const handleSendMessage = async (content: string) => {
    try { await activeChat.sendMessage(content); }
    catch (err: any) {
      const msg = err.message || '';
      // ⭐ L'erreur peut porter des données enrichies (expires_at, reason)
      if (msg.includes('muté') || msg.includes('muted') || err.muted) {
        setMuteInfo({
          duration: err.duration || '',
          reason: err.reason || msg,
          expires_at: err.expires_at || null,
          admin_message: err.admin_message,
        });
      } else { alert(msg); }
    }
  };
  const handleStartDM = async (targetId: string) => {
    const id = await startConversation(targetId);
    if (id) { setMode('dm'); setActiveConvId(id); const c = conversations.find(x => x.id === id); setActiveConvName(c?.participant_username || 'Conversation'); setActiveGroupId(null); }
  };
  const handleAvatarClick = (id: string) => {
    if (id === user?.id) setShowEditProfile(true);
    else setProfileUserId(id);
  };
  const handleReport = (msg: ChatMessage) => {
    setReportTarget({ messageId: msg.id, content: msg.content, author: msg.author?.username || 'Inconnu' });
  };

  // ⭐ Quand le ProfileModal se ferme, rafraîchir les bloqués (au cas où un block/unblock a eu lieu)
  const handleProfileClose = () => {
    setProfileUserId(null);
    refreshBlocked();
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center"><div className="text-[var(--t3)] text-sm">⏳ Chargement...</div></div>;

  return (
    <div className="h-screen flex p-3 gap-2.5">
      <Sidebar user={user} groups={groups} conversations={conversations}
        activeGroupId={mode === 'group' ? activeGroupId : null} activeConvId={mode === 'dm' ? activeConvId : null}
        onSelectGroup={handleSelectGroup} onSelectConv={handleSelectConv} onHideConv={handleHideConv}
        onLeaveGroup={handleLeaveGroup} onLogout={logout} onEditProfile={() => setShowEditProfile(true)}
        onCreateGroup={() => setShowCreateGroup(true)} />

      <div className="flex-1 glass rounded-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
          {mode === 'group' ? <span className="text-xl font-bold text-[var(--hash)]" style={{ textShadow: '0 0 14px var(--acc-g)' }}>#</span> : <span className="text-xl">💬</span>}
          <span className="text-[15px] font-semibold">{(mode === 'group' ? activeGroupName : activeConvName) || 'Sélectionnez un salon'}</span>
          <span className="w-px h-[18px] bg-[var(--border-s)] mx-1" />
          <span className="text-xs text-[var(--t3)] flex-1">{mode === 'group' ? (groups.find(g => g.id === activeGroupId)?.description || 'Discussion') : 'Conversation privée'}</span>
        </div>

        {/* ⭐ blockedUserIds passé pour filtrer les messages */}
        <MessageList messages={activeChat.messages} isLoading={activeChat.isLoading} hasMore={activeChat.hasMore}
          onLoadMore={activeChat.loadMore} onToggleReaction={activeChat.toggleReaction}
          onAvatarClick={handleAvatarClick} currentUserId={user?.id || ''} currentUserTier={user?.tier || 'guest'}
          currentUsername={user?.username} groupId={mode === 'group' ? activeGroupId : null}
          onReport={handleReport} onMuteAlert={(info) => setMuteInfo(info)} blockedUserIds={blockedIds} />

        {mode === 'group' && groupChat.typingUsers.length > 0 && (
          <div className="px-6 py-1.5 text-[11px] text-[var(--t3)] flex items-center gap-2">
            <span className="flex gap-1">{[0,1,2].map(i => <span key={i} className="w-[5px] h-[5px] rounded-full bg-[var(--acc)] opacity-50" style={{ animation: `bounce 1.4s ease-in-out ${i*0.2}s infinite` }} />)}</span>
            <strong className="text-[var(--t2)]">{groupChat.typingUsers.map(u => u.username).join(', ')}</strong>
            {groupChat.typingUsers.length === 1 ? ' est en train d\'écrire...' : ' sont en train d\'écrire...'}
          </div>
        )}

        <MessageInput onSend={handleSendMessage} onTyping={mode === 'group' ? groupChat.emitTyping : () => {}}
          channelName={mode === 'group' ? activeGroupName : activeConvName}
          disabled={mode === 'group' ? !activeGroupId : !activeConvId}
          groupId={mode === 'group' ? activeGroupId : null} />
      </div>

      {mode === 'group' && <MembersPanel groupId={activeGroupId} groupType={groups.find(g => g.id === activeGroupId)?.type} groupName={activeGroupName} onMemberClick={handleAvatarClick} />}

      {/* ⭐ ProfileModal: onClose rafraîchit les bloqués */}
      <ProfileModal userId={profileUserId} currentUserId={user?.id || ''} currentUserTier={user?.tier || 'guest'}
        isOpen={!!profileUserId} onClose={handleProfileClose} onStartDM={handleStartDM} />
      <EditProfileModal isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} />
      <CreateGroupModal isOpen={showCreateGroup} onClose={() => setShowCreateGroup(false)} onCreated={handleGroupCreated} />
      <ReportModal isOpen={!!reportTarget} messageId={reportTarget?.messageId || null}
        messageContent={reportTarget?.content || ''} authorName={reportTarget?.author || ''}
        onClose={() => setReportTarget(null)} />

      {/* ⭐ Popup notification mute */}
      {muteInfo && (() => {
        // Calcul du temps restant
        let remainingStr = '';
        if (muteInfo.expires_at) {
          const ms = new Date(muteInfo.expires_at).getTime() - Date.now();
          if (ms > 0) {
            const totalMin = Math.ceil(ms / 60000);
            if (totalMin < 60) remainingStr = `${totalMin} minute${totalMin > 1 ? 's' : ''}`;
            else if (totalMin < 1440) remainingStr = `${Math.ceil(totalMin / 60)}h`;
            else remainingStr = `${Math.ceil(totalMin / 1440)}j`;
          }
        }
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="w-[420px] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
              style={{ background: 'rgba(15,15,35,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #f97316, #ef4444, #f97316)' }} />
              <div className="p-8 text-center">
                <div className="text-5xl mb-4">🔇</div>
                <h2 className="text-xl font-bold text-white mb-3">Vous avez été muté</h2>
                <div className="p-4 rounded-xl mb-3 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {muteInfo.duration && muteInfo.duration !== '' && (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
                        ⏱ {muteInfo.duration}
                      </span>
                      {remainingStr && (
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          ({remainingStr} restant{remainingStr.includes('j') || remainingStr.includes('h') || remainingStr.includes('min') ? 'e' : 's'})
                        </span>
                      )}
                    </div>
                  )}
                  {muteInfo.reason && (
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Motif :</span> {muteInfo.reason}
                    </p>
                  )}
                  {muteInfo.admin_message && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        💬 {muteInfo.admin_message}
                      </p>
                    </div>
                  )}
                </div>
                <button onClick={() => setMuteInfo(null)}
                  className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  J&apos;ai compris
                </button>
                <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Toute récidive pourra entraîner une sanction plus sévère.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ⭐ Popup notification ban */}
      {banInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-[420px] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
            style={{ background: 'rgba(15,15,35,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #ef4444, #b91c1c, #ef4444)' }} />
            <div className="p-8 text-center">
              <div className="text-5xl mb-4">🚫</div>
              <h2 className="text-xl font-bold text-white mb-2">Compte banni</h2>
              <div className="p-4 rounded-xl mb-5 space-y-2"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {banInfo.duration && banInfo.duration !== 'permanent'
                    ? `Votre compte a été banni pour ${banInfo.duration}.`
                    : 'Votre compte a été banni définitivement.'}
                </p>
                {banInfo.reason && (
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>Motif :</span> {banInfo.reason}
                  </p>
                )}
                {banInfo.admin_message && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(239,68,68,0.15)' }}>
                    <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      💬 {banInfo.admin_message}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={async () => { setBanInfo(null); await logout(); }}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                Se déconnecter
              </button>
              <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Déconnexion automatique dans 8 secondes.
              </p>
              <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Pour contester cette décision, contactez le support.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ Toast erreur invitation */}
      {inviteError && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[90] px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.4)] animate-slideUp"
          style={{ background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(12px)' }}>
          ❌ {inviteError}
          <button onClick={() => setInviteError('')} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
