/**
 * app/chat_group/page.tsx — Phase 3 Étape 5 : blocage effectif
 * 
 * Changements vs version précédente :
 *   - useBlocked() hook pour récupérer la liste des IDs bloqués
 *   - blockedUserIds passé au MessageList pour filtrer les messages
 *   - refreshBlocked() appelé quand le ProfileModal se ferme (après un block/unblock)
 */
'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
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
import { MyFilesModal } from '@/components/files/MyFilesModal';
import { CreateGroupModal } from '@/components/modals/CreateGroupModal';
import { ReportModal } from '@/components/modals/ReportModal';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { showModal } from '@/components/ui/AppModal';
import { useViewport } from '@/hooks/useViewport';
import { useMobileLayout } from '@/hooks/useMobileLayout';
import { useVoice } from '@/hooks/useVoice';
import { VoiceButtons } from '@/components/chat/VoiceButtons';
import { CallBar } from '@/components/chat/CallBar';
import { CallStage } from '@/components/chat/CallStage';
import { IncomingCall } from '@/components/chat/IncomingCall';
import { useCallSignals } from '@/hooks/useCall';
import { useDesktopPanels, PANEL_LIMITS } from '@/hooks/useDesktopPanels';
import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { MobileMePanel } from '@/components/layout/MobileMePanel';
import { IconBack, IconMenu, IconUsers, IconPanelLeft, IconPanelRight, IconClose, IconHash, IconMessage, IconChat, IconUser } from '@/components/layout/icons';

type ChatMode = 'group' | 'dm';
type MobileTab = 'salons' | 'messages' | 'chat' | 'moi';

function ChatPageContent() {
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
  const [showMyFiles, setShowMyFiles] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ messageId: string; content: string; author: string } | null>(null);
  const [muteInfo, setMuteInfo] = useState<{ duration: string; reason: string; expires_at?: string | null; admin_message?: string } | null>(null);

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

  // ═══════════ Disposition de l'écran ═══════════
  //   Grand écran : 3 colonnes, panneaux redimensionnables et masquables (réglage gardé dans le navigateur).
  //   Téléphone / tablette en portrait : pile d'écrans, onglets ou tiroirs (réglage admin par type de compte,
  //   ou choix du membre dans son profil si l'admin a mis « option »).
  const vp = useViewport();
  const { effective: mobileLayout } = useMobileLayout(user?.id);
  useVoice(user?.id); // 🎙️ voix / vidéo : état et droits (le serveur décide, voir /api/voice)
  useCallSignals();   // 📞 sonnerie des messages privés ; quitte l'appel en quittant la page
  const panels = useDesktopPanels(user?.id);
  const compact = vp.ready && vp.compact;
  const narrow = compact && !vp.wide;
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [tab, setTab] = useState<MobileTab>('chat');
  const [drawer, setDrawer] = useState<null | 'left' | 'right'>(null);
  const [membersSheet, setMembersSheet] = useState(false);
  const layerRef = useRef({ sheet: false, drawer: null as null | 'left' | 'right', view: 'list' as 'list' | 'chat' });
  layerRef.current = { sheet: membersSheet, drawer, view: mobileView };

  // Geste ou bouton « retour » du téléphone : ferme d'abord le volet / le tiroir, puis revient à la liste des salons
  useEffect(() => {
    const onPop = () => {
      const l = layerRef.current;
      if (l.sheet) setMembersSheet(false);
      else if (l.drawer) setDrawer(null);
      else if (l.view === 'chat') setMobileView('list');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const pushLayer = (kind: string) => { try { window.history.pushState({ chatappLayer: kind }, ''); } catch { /* historique indisponible */ } };
  const closeLayer = useCallback(() => {
    if (window.history.state?.chatappLayer) { window.history.back(); return; } // popstate fermera la bonne couche
    const l = layerRef.current;
    if (l.sheet) setMembersSheet(false);
    else if (l.drawer) setDrawer(null);
    else if (l.view === 'chat') setMobileView('list');
  }, []);
  // Changement de disposition ou de taille d'écran : plus de volet ni de tiroir ouvert
  useEffect(() => { setDrawer(null); setMembersSheet(false); }, [compact, mobileLayout]);
  useEffect(() => {
    if (!drawer && !membersSheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLayer(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, membersSheet, closeLayer]);

  /** Après le choix d'un salon / d'une conversation : afficher la discussion sur téléphone */
  const showChatOnMobile = () => {
    if (!compact) return;
    if (mobileLayout === 'stack') {
      if (layerRef.current.view !== 'chat') { setMobileView('chat'); if (narrow) pushLayer('chat'); }
    } else if (mobileLayout === 'tabs') setTab('chat');
    else if (layerRef.current.drawer) closeLayer();
  };
  const showChatRef = useRef(showChatOnMobile);
  showChatRef.current = showChatOnMobile;
  const openMembers = () => {
    if (!compact) { panels.toggle('members'); return; }
    if (mobileLayout === 'drawers') { setDrawer('right'); pushLayer('drawer'); }
    else { setMembersSheet(true); pushLayer('sheet'); }
  };
  const openSidebarDrawer = () => { setDrawer('left'); pushLayer('drawer'); };

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
          showChatRef.current();
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

  // ⭐ Écouter les notifications de mute
  // (le bannissement est géré globalement par lib/socket.ts → sortie immédiate vers l'accueil)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onMuted = (data: { duration: string; reason: string; expires_at?: string | null; admin_message?: string }) => {
      setMuteInfo({ duration: data.duration, reason: data.reason, expires_at: data.expires_at, admin_message: data.admin_message });
    };
    socket.on('moderation:muted', onMuted);
    return () => {
      socket.off('moderation:muted', onMuted);
    };
  }, []);

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
    showChatOnMobile();
    await joinGroup(group.id);
  };
  const handleSendMessage = async (content: string) => {
    try { await activeChat.sendMessage(content); }
    catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('muté') || msg.includes('muted') || err.muted) {
        setMuteInfo({
          duration: err.duration || '',
          reason: err.reason || msg,
          expires_at: err.expires_at || null,
          admin_message: err.admin_message,
        });
      } else { showModal(msg, 'warning'); }
    }
  };

  // ⭐ Phase 4.1 — Envoi d'un média (image, gif, fichier)
  const handleSendMedia = async (params: { type: 'image' | 'gif' | 'file' | 'audio'; file_url?: string; gif_url?: string; content?: string; audio_duration_ms?: number }) => {
    // Salon ou message privé : les mêmes contrôles s'appliquent côté serveur
    try { await activeChat.sendMediaMessage(params); }
    catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('muté') || msg.includes('muted') || err.muted) {
        setMuteInfo({ duration: '', reason: msg, expires_at: err.expires_at || null });
      } else { showModal(msg, 'warning'); }
    }
  };
  const handleStartDM = async (targetId: string) => {
    const id = await startConversation(targetId);
    if (id) { setMode('dm'); setActiveConvId(id); const c = conversations.find(x => x.id === id); setActiveConvName(c?.participant_username || 'Conversation'); setActiveGroupId(null); showChatOnMobile(); }
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

  // ⭐ Phase 4.1d — Drag & drop sur toute la fenêtre de chat
  const [chatDragOver, setChatDragOver] = useState(false);
  const chatDropRef = useRef<HTMLDivElement>(null);

  const handleChatDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (mode === 'group' && activeGroupId) setChatDragOver(true);
  }, [mode, activeGroupId]);

  const handleChatDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!chatDropRef.current?.contains(e.relatedTarget as Node)) setChatDragOver(false);
  }, []);

  // Dépôt dans la zone de discussion : le fichier est mis en attente dans la barre de saisie
  // (aperçu + légende possible), puis envoyé une seule fois au clic sur « Envoyer ».
  const handleChatDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setChatDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || (mode === 'group' ? !activeGroupId : !activeConvId)) return;
    setDroppedFile(file);
  }, [mode, activeGroupId, activeConvId]);
  const clearDroppedFile = useCallback(() => setDroppedFile(null), []);

  // ═══════════ Rendu ═══════════
  const dmUnread = conversations.reduce((n, c) => n + (c.unread_count || 0), 0);
  const activeGroup = groups.find(g => g.id === activeGroupId);
  const chatTitle = (mode === 'group' ? activeGroupName : activeConvName) || 'Sélectionnez un salon';
  const chatDesc = mode === 'group' ? (activeGroup?.description || 'Discussion') : 'Conversation privée';
  const membersOpen = compact ? (membersSheet || drawer === 'right') : !panels.membersHidden;
  const headerBtn = 'relative w-11 h-11 [@media(pointer:fine)]:w-8 [@media(pointer:fine)]:h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all';

  const selectGroup = (g: Group) => { showChatOnMobile(); handleSelectGroup(g); };
  const selectConv = (c: Conversation) => { showChatOnMobile(); handleSelectConv(c); };
  const sidebarProps = {
    user, groups, conversations,
    activeGroupId: mode === 'group' ? activeGroupId : null, activeConvId: mode === 'dm' ? activeConvId : null,
    onSelectGroup: selectGroup, onSelectConv: selectConv, onHideConv: handleHideConv, onLeaveGroup: handleLeaveGroup,
    onLogout: logout, onEditProfile: () => setShowEditProfile(true), onCreateGroup: () => setShowCreateGroup(true),
  };
  const membersProps = { groupId: activeGroupId, groupType: activeGroup?.type, groupName: activeGroupName, onMemberClick: handleAvatarClick };

  // Bouton à gauche du titre : retour (pile d'écrans), salons (tiroirs), masquer la liste (grand écran)
  let headerLeft: React.ReactNode = null;
  if (!compact) {
    headerLeft = (
      <button type="button" onClick={() => panels.toggle('sidebar')} className={headerBtn} data-testid="toggle-sidebar"
        aria-pressed={!panels.sidebarHidden} aria-label={panels.sidebarHidden ? 'Afficher la liste des salons' : 'Masquer la liste des salons'}
        title={panels.sidebarHidden ? 'Afficher la liste des salons' : 'Masquer la liste des salons'}>
        <IconPanelLeft />
      </button>
    );
  } else if (mobileLayout === 'stack' && narrow) {
    headerLeft = (
      <button type="button" onClick={closeLayer} className={headerBtn} data-testid="mobile-back" aria-label="Retour aux salons">
        <IconBack />
        {dmUnread > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[var(--acc)]" aria-hidden="true" />}
      </button>
    );
  } else if (mobileLayout === 'drawers') {
    headerLeft = (
      <button type="button" onClick={openSidebarDrawer} className={headerBtn} data-testid="open-sidebar" aria-label="Ouvrir les salons et messages privés" aria-expanded={drawer === 'left'}>
        <IconMenu />
        {dmUnread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--acc)] text-white text-[9px] font-bold flex items-center justify-center">{dmUnread > 9 ? '9+' : dmUnread}</span>}
      </button>
    );
  }
  const voiceHeader = (mode === 'group' ? !!activeGroupId : !!activeConvId) ? (
    <VoiceButtons where="header" kind={mode === 'dm' ? 'dm' : (activeGroup?.type === 'private' ? 'private' : 'public')}
      groupId={mode === 'group' ? activeGroupId : null} conversationId={mode === 'dm' ? activeConvId : null} btnClass={headerBtn}
      label={mode === 'group' ? `#${activeGroupName}` : `@${activeConvName}`} />
  ) : null;
  const membersButton = mode === 'group' ? (
    <button type="button" onClick={openMembers} className={headerBtn} data-testid={compact ? 'open-members' : 'toggle-members'}
      aria-expanded={membersOpen} aria-label={compact ? 'Membres du salon' : (panels.membersHidden ? 'Afficher les membres' : 'Masquer les membres')}
      title={compact ? 'Membres du salon' : (panels.membersHidden ? 'Afficher les membres' : 'Masquer les membres')}>
      {compact ? <IconUsers /> : <IconPanelRight />}
    </button>
  ) : null;
  const headerRight = <>{voiceHeader}{membersButton}</>;
  // Autres emplacements des boutons d'appel : zone de saisie (à côté de GIF / de envoyer) et menu 📎
  const voiceTarget = (mode === 'group' ? !!activeGroupId : !!activeConvId) ? {
    kind: (mode === 'dm' ? 'dm' : (activeGroup?.type === 'private' ? 'private' : 'public')) as 'dm' | 'private' | 'public',
    groupId: mode === 'group' ? activeGroupId : null,
    conversationId: mode === 'dm' ? activeConvId : null,
    label: mode === 'group' ? `#${activeGroupName}` : `@${activeConvName}`,
  } : null;
  const composerBtn = 'w-9 h-9 rounded-xl flex items-center justify-center text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)] transition-all';
  const voiceComposer = voiceTarget ? <VoiceButtons where="composer" {...voiceTarget} btnClass={composerBtn} /> : null;
  const voiceSend = voiceTarget ? <VoiceButtons where="send" {...voiceTarget} btnClass={composerBtn} /> : null;
  const voiceMedia = voiceTarget
    ? <VoiceButtons where="media" {...voiceTarget} caption="Appel" btnClass="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--glass-h)]" />
    : null;

  // Colonne de discussion (la même dans toutes les dispositions)
  const edge = compact && (narrow || mobileLayout !== 'stack');
  const chatColumn = (
      <div
        ref={chatDropRef}
        data-testid="chat-drop-zone"
        className={`flex-1 min-w-0 min-h-0 glass rounded-2xl flex flex-col overflow-hidden relative ${edge ? 'edge-to-edge' : ''}`}
        onDragOver={handleChatDragOver}
        onDragLeave={handleChatDragLeave}
        onDrop={handleChatDrop}
      >
        {/* Overlay drag & drop pleine fenêtre */}
        {chatDragOver && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none rounded-2xl"
            style={{ background: 'rgba(139,92,246,0.10)', border: '2px dashed rgba(139,92,246,0.6)' }}>
            <span className="text-5xl mb-3">📎</span>
            <p className="text-lg font-semibold" style={{ color: '#a78bfa' }}>Déposer pour joindre</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(167,139,250,0.6)' }}>Images JPG, PNG, GIF, WEBP</p>
          </div>
        )}
        <div className={`${compact ? `${headerLeft ? 'pl-1' : 'pl-4'} pr-1 py-1 min-h-[56px]` : 'pl-2.5 pr-2.5 py-2.5'} border-b border-[var(--border)] flex items-center gap-2 bg-[var(--glass)]`}>
          {headerLeft}
          {mode === 'group' ? <span className="text-xl font-bold text-[var(--hash)] flex-shrink-0" style={{ textShadow: '0 0 14px var(--acc-g)' }}>#</span> : <span className="text-xl flex-shrink-0">💬</span>}
          <div className={`flex-1 min-w-0 flex ${narrow ? 'flex-col' : 'items-center gap-2.5'}`}>
            <span className="text-[15px] font-semibold truncate" data-testid="chat-title">{chatTitle}</span>
            {narrow
              ? <span className="text-[11px] text-[var(--t3)] truncate">{chatDesc}</span>
              : <><span className="w-px h-[18px] bg-[var(--border-s)] mx-1 flex-shrink-0" /><span className="text-xs text-[var(--t3)] truncate">{chatDesc}</span></>}
          </div>
          {headerRight}
        </div>

        {/* 📞 Appel en cours (ou dernier message : appel terminé, refusé…) */}
        <CallBar />
        <CallStage />

        {/* ⭐ blockedUserIds passé pour filtrer les messages */}
        <MessageList messages={activeChat.messages} isLoading={activeChat.isLoading} hasMore={activeChat.hasMore}
          onLoadMore={activeChat.loadMore} onToggleReaction={activeChat.toggleReaction}
          onAvatarClick={handleAvatarClick} currentUserId={user?.id || ''} currentUserTier={user?.tier || 'guest'}
          currentUsername={user?.username} groupId={mode === 'group' ? activeGroupId : null}
          onReport={handleReport} onMuteAlert={(info) => setMuteInfo(info)} blockedUserIds={blockedIds}
          historyInfo={mode === 'group' ? groupChat.historyInfo : null} />

        {mode === 'group' && groupChat.typingUsers.length > 0 && (
          <div className="px-6 py-1.5 text-[11px] text-[var(--t3)] flex items-center gap-2">
            <span className="flex gap-1">{[0,1,2].map(i => <span key={i} className="w-[5px] h-[5px] rounded-full bg-[var(--acc)] opacity-50" style={{ animation: `bounce 1.4s ease-in-out ${i*0.2}s infinite` }} />)}</span>
            <strong className="text-[var(--t2)]">{groupChat.typingUsers.map(u => u.username).join(', ')}</strong>
            {groupChat.typingUsers.length === 1 ? ' est en train d\'écrire...' : ' sont en train d\'écrire...'}
          </div>
        )}

        <MessageInput onSend={handleSendMessage} onSendMedia={handleSendMedia}
          droppedFile={droppedFile} onDroppedFileUsed={clearDroppedFile}
          onTyping={mode === 'group' ? groupChat.emitTyping : () => {}}
          channelName={mode === 'group' ? activeGroupName : activeConvName}
          disabled={mode === 'group' ? !activeGroupId : !activeConvId}
          groupId={mode === 'group' ? activeGroupId : null}
          voiceComposer={voiceComposer} voiceSend={voiceSend} voiceMedia={voiceMedia}
          voiceMsg={voiceTarget ? { kind: voiceTarget.kind, groupId: voiceTarget.groupId, conversationId: voiceTarget.conversationId } : null}
          currentTier={user?.tier || 'guest'} />
      </div>
  );

  // Taille de l'écran encore inconnue (premier rendu) : rien n'est affiché, pour ne pas montrer la mauvaise disposition
  if (!vp.ready) return <div className="h-[100dvh]" aria-busy="true" />;

  let body: React.ReactNode;
  let rootClass = 'h-[100dvh] flex';
  if (!compact) {
    // ── Grand écran : salons | discussion | membres, largeurs réglables, panneaux masquables
    const showMembers = mode === 'group' && !panels.membersHidden;
    let sw = panels.sidebarHidden ? 0 : panels.sidebarWidth;
    let mw = showMembers ? panels.membersWidth : 0;
    // La discussion garde au moins 360 px : les panneaux se resserrent d'abord (sans descendre sous leur minimum)
    const over = sw + mw + 360 + 44 - vp.width;
    if (over > 0) {
      const cutM = showMembers ? Math.min(over, mw - PANEL_LIMITS.members.min) : 0;
      mw -= cutM;
      if (sw) sw -= Math.min(over - cutM, sw - PANEL_LIMITS.sidebar.min);
    }
    rootClass += ' p-3';
    body = (<>
      {!panels.sidebarHidden && (<>
        <Sidebar {...sidebarProps} className="flex-shrink-0" style={{ width: sw }} />
        <ResizeHandle side="left" width={sw} min={PANEL_LIMITS.sidebar.min} max={PANEL_LIMITS.sidebar.max}
          label="Largeur de la liste des salons" onResize={(w, persist) => panels.setWidth('sidebar', w, persist)} onReset={() => panels.reset('sidebar')} />
      </>)}
      {chatColumn}
      {showMembers && (<>
        <ResizeHandle side="right" width={mw} min={PANEL_LIMITS.members.min} max={PANEL_LIMITS.members.max}
          label="Largeur de la liste des membres" onResize={(w, persist) => panels.setWidth('members', w, persist)} onReset={() => panels.reset('members')} />
        <MembersPanel {...membersProps} className="flex-shrink-0" style={{ width: mw }} />
      </>)}
    </>);
  } else if (mobileLayout === 'tabs') {
    // ── Onglets en bas (en paysage : colonne d'onglets à gauche) ; masqués quand le clavier est ouvert
    const tabs: { id: MobileTab; label: string; icon: React.ReactNode; badge?: number }[] = [
      { id: 'salons', label: 'Salons', icon: <IconHash /> },
      { id: 'messages', label: 'Messages', icon: <IconMessage />, badge: dmUnread },
      { id: 'chat', label: 'Discussion', icon: <IconChat /> },
      { id: 'moi', label: 'Moi', icon: <IconUser /> },
    ];
    const tabBar = (
      <nav aria-label="Navigation principale" data-testid="tab-bar"
        className={vp.wide
          ? 'w-[76px] flex-shrink-0 flex flex-col items-center gap-1 py-3 glass-strong edge-to-edge border-r border-[var(--border)]'
          : 'flex-shrink-0 flex glass-strong edge-to-edge border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]'}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors
                ${vp.wide ? 'w-16 h-14 rounded-xl' : 'flex-1 h-[58px]'}
                ${active ? 'text-[var(--acc)] font-semibold' : 'text-[var(--t2)] hover:text-[var(--t1)]'} ${active && vp.wide ? 'bg-[var(--acc-s)]' : ''}`}>
              {t.icon}
              <span>{t.label}</span>
              {!!t.badge && <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--acc)] text-white text-[9px] font-bold flex items-center justify-center">{t.badge > 9 ? '9+' : t.badge}</span>}
            </button>
          );
        })}
      </nav>
    );
    const pane = (id: MobileTab) => tab === id ? 'flex flex-1 min-h-0 min-w-0' : 'hidden';
    rootClass += vp.wide ? ' flex-row' : ' flex-col';
    body = (<>
      {vp.wide && tabBar}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className={pane('salons')}><Sidebar {...sidebarProps} sections="groups" showFooter={false} className="w-full h-full edge-to-edge" /></div>
        <div className={pane('messages')}><Sidebar {...sidebarProps} sections="dms" showFooter={false} className="w-full h-full edge-to-edge" /></div>
        <div className={pane('chat')}>{chatColumn}</div>
        {tab === 'moi' && (
          <div className="flex-1 min-h-0">
            <MobileMePanel user={user} onEditProfile={() => setShowEditProfile(true)} onOpenFiles={() => setShowMyFiles(true)} onLogout={logout} />
          </div>
        )}
      </div>
      {!vp.wide && !vp.keyboardOpen && tabBar}
    </>);
  } else if (mobileLayout === 'drawers') {
    // ── Tiroirs latéraux : discussion plein écran, salons à gauche, membres à droite
    rootClass += ' flex-col';
    body = chatColumn;
  } else if (narrow) {
    // ── Pile d'écrans, téléphone en portrait : liste des salons, puis discussion en plein écran
    rootClass += ' flex-col';
    body = (<>
      <div className={mobileView === 'list' ? 'flex flex-1 min-h-0' : 'hidden'}><Sidebar {...sidebarProps} className="w-full h-full edge-to-edge" /></div>
      <div className={mobileView === 'chat' ? 'flex flex-1 min-h-0' : 'hidden'}>{chatColumn}</div>
    </>);
  } else {
    // ── Pile d'écrans en paysage / tablette : liste et discussion côte à côte
    rootClass += ' p-1.5 gap-1.5';
    body = (<>
      <Sidebar {...sidebarProps} className="flex-shrink-0 w-[260px]" />
      {chatColumn}
    </>);
  }

  return (
    <div className={rootClass} data-layout={compact ? mobileLayout : 'desktop'}>
      {body}

      {/* Téléphone : volet des membres (pile d'écrans, onglets) */}
      {compact && membersSheet && mode === 'group' && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Membres du salon">
          <button type="button" aria-label="Fermer la liste des membres" onClick={closeLayer} className="absolute inset-0 bg-black/50 animate-fadeIn" />
          <div className="relative h-[72dvh] flex flex-col glass-strong rounded-t-3xl border-b-0 anim-sheet-up overflow-hidden" data-testid="members-sheet">
            <div className="relative flex items-center justify-center h-11 flex-shrink-0">
              <span className="w-10 h-1 rounded-full bg-[var(--border-s)]" aria-hidden="true" />
              <button type="button" onClick={closeLayer} aria-label="Fermer" className="absolute right-1.5 top-0 w-11 h-11 rounded-xl flex items-center justify-center text-[var(--t2)] hover:bg-[var(--glass-h)]"><IconClose /></button>
            </div>
            <MembersPanel {...membersProps} className="w-full flex-1 min-h-0 edge-to-edge !bg-transparent !backdrop-blur-none" />
          </div>
        </div>
      )}

      {/* Téléphone : tiroirs (salons à gauche, membres à droite) */}
      {compact && drawer && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={drawer === 'left' ? 'Salons et messages privés' : 'Membres du salon'}>
          <button type="button" aria-label="Fermer le panneau" onClick={closeLayer} className="absolute inset-0 bg-black/50 animate-fadeIn" />
          {drawer === 'left' && (
            <div className="absolute inset-y-0 left-0 w-[min(310px,86vw)] flex anim-drawer-left shadow-[8px_0_40px_rgba(0,0,0,0.5)]" data-testid="drawer-left">
              <Sidebar {...sidebarProps} className="w-full h-full !rounded-none !rounded-r-2xl" />
            </div>
          )}
          {drawer === 'right' && mode === 'group' && (
            <div className="absolute inset-y-0 right-0 w-[min(300px,86vw)] flex anim-drawer-right shadow-[-8px_0_40px_rgba(0,0,0,0.5)]" data-testid="drawer-right">
              <MembersPanel {...membersProps} className="w-full h-full !rounded-none !rounded-l-2xl" />
            </div>
          )}
        </div>
      )}

      {/* 📞 Appel entrant (message privé) */}
      <IncomingCall />

      {/* ⭐ ProfileModal: onClose rafraîchit les bloqués */}
      <ProfileModal userId={profileUserId} currentUserId={user?.id || ''} currentUserTier={user?.tier || 'guest'}
        isOpen={!!profileUserId} onClose={handleProfileClose} onStartDM={handleStartDM} />
      <EditProfileModal isOpen={showEditProfile} onClose={() => setShowEditProfile(false)}
        onOpenFiles={() => { setShowEditProfile(false); setShowMyFiles(true); }} />
      <MyFilesModal isOpen={showMyFiles} onClose={() => setShowMyFiles(false)} mode="manage" />
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
            <div className="w-[420px] max-w-[calc(100vw-24px)] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
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

// useSearchParams() lit l'adresse côté navigateur : Next.js exige une zone Suspense autour.
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  );
}
