/**
 * app/chat_group/page.tsx — FIXED: passe currentUserTier au ProfileModal
 */
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useDMChat } from '@/hooks/useDMChat';
import { useGroups, type Group } from '@/hooks/useGroups';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { MembersPanel } from '@/components/chat/MembersPanel';
import { ProfileModal } from '@/components/modals/ProfileModal';
import { EditProfileModal } from '@/components/modals/EditProfileModal';
import { useRouter } from 'next/navigation';

type ChatMode = 'group' | 'dm';

export default function ChatPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { groups, joinGroup } = useGroups();
  const { conversations, startConversation, hideConversation } = useConversations();

  const [mode, setMode] = useState<ChatMode>('group');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroupName, setActiveGroupName] = useState<string>('');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConvName, setActiveConvName] = useState<string>('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const groupChat = useChat(mode === 'group' ? activeGroupId : null, user?.id || null);
  const dmChat = useDMChat(mode === 'dm' ? activeConvId : null, user?.id || null);
  const activeChat = mode === 'group' ? groupChat : dmChat;

  useEffect(() => { if (!authLoading && !isAuthenticated) router.push('/'); }, [authLoading, isAuthenticated, router]);
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId && mode === 'group') {
      const f = groups[0]; setActiveGroupId(f.id); setActiveGroupName(f.name); joinGroup(f.id);
    }
  }, [groups, activeGroupId, joinGroup, mode]);

  const handleSelectGroup = async (g: Group) => { setMode('group'); setActiveGroupId(g.id); setActiveGroupName(g.name); setActiveConvId(null); await joinGroup(g.id); };
  const handleSelectConv = (c: Conversation) => { setMode('dm'); setActiveConvId(c.id); setActiveConvName(c.participant_username); setActiveGroupId(null); };
  const handleHideConv = async (id: string) => { await hideConversation(id); if (activeConvId === id) { setMode('group'); setActiveConvId(null); if (groups.length > 0) { setActiveGroupId(groups[0].id); setActiveGroupName(groups[0].name); } } };
  const handleSendMessage = async (content: string) => { try { await activeChat.sendMessage(content); } catch (err: any) { alert(err.message); } };
  const handleStartDM = async (targetId: string) => {
    const id = await startConversation(targetId);
    if (id) { setMode('dm'); setActiveConvId(id); const c = conversations.find(x => x.id === id); setActiveConvName(c?.participant_username || 'Conversation'); setActiveGroupId(null); }
  };
  const handleAvatarClick = (id: string) => { if (id === user?.id) setShowEditProfile(true); else setProfileUserId(id); };

  if (authLoading) return <div className="h-screen flex items-center justify-center"><div className="text-[var(--t3)] text-sm">⏳ Chargement...</div></div>;

  return (
    <div className="h-screen flex p-3 gap-2.5">
      <Sidebar user={user} groups={groups} conversations={conversations}
        activeGroupId={mode === 'group' ? activeGroupId : null} activeConvId={mode === 'dm' ? activeConvId : null}
        onSelectGroup={handleSelectGroup} onSelectConv={handleSelectConv} onHideConv={handleHideConv}
        onLogout={logout} onEditProfile={() => setShowEditProfile(true)} />

      <div className="flex-1 glass rounded-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
          {mode === 'group' ? <span className="text-xl font-bold text-[var(--hash)]" style={{ textShadow: '0 0 14px var(--acc-g)' }}>#</span> : <span className="text-xl">💬</span>}
          <span className="text-[15px] font-semibold">{(mode === 'group' ? activeGroupName : activeConvName) || 'Sélectionnez un salon'}</span>
          <span className="w-px h-[18px] bg-[var(--border-s)] mx-1" />
          <span className="text-xs text-[var(--t3)] flex-1">{mode === 'group' ? (groups.find(g => g.id === activeGroupId)?.description || 'Discussion') : 'Conversation privée'}</span>
        </div>

        <MessageList messages={activeChat.messages} isLoading={activeChat.isLoading} hasMore={activeChat.hasMore}
          onLoadMore={activeChat.loadMore} onToggleReaction={activeChat.toggleReaction}
          onAvatarClick={handleAvatarClick} currentUserId={user?.id || ''} currentUserTier={user?.tier || 'guest'}
          currentUsername={user?.username} groupId={mode === 'group' ? activeGroupId : null} />

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

      {mode === 'group' && <MembersPanel groupId={activeGroupId} onMemberClick={handleAvatarClick} />}

      {/* ⭐ Passe currentUserTier pour autoriser/bloquer le bouton DM */}
      <ProfileModal userId={profileUserId} currentUserId={user?.id || ''} currentUserTier={user?.tier || 'guest'}
        isOpen={!!profileUserId} onClose={() => setProfileUserId(null)} onStartDM={handleStartDM} />
      <EditProfileModal isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} />
    </div>
  );
}
