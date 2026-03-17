/**
 * app/chat_group/page.tsx — Interface de chat principale
 * 
 * Layout 3 colonnes Glassmorphism :
 *   [Sidebar] | [Zone de messages] | [Panneau membres]
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { useGroups, type Group } from '@/hooks/useGroups';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { MembersPanel } from '@/components/chat/MembersPanel';
import { useRouter } from 'next/navigation';

export default function ChatPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { groups, isLoading: groupsLoading, joinGroup } = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroupName, setActiveGroupName] = useState<string>('');

  const { messages, isLoading: msgsLoading, typingUsers, sendMessage, emitTyping, loadMore, hasMore } = useChat(activeGroupId);

  // Rediriger si pas connecté (après le chargement)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  // Auto-sélectionner le premier salon (et le rejoindre si nécessaire)
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      const firstGroup = groups[0];
      setActiveGroupId(firstGroup.id);
      setActiveGroupName(firstGroup.name);
      joinGroup(firstGroup.id);
    }
  }, [groups, activeGroupId, joinGroup]);

  const handleSelectGroup = async (group: Group) => {
    setActiveGroupId(group.id);
    setActiveGroupName(group.name);
    await joinGroup(group.id);
  };

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessage(content);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-[var(--t3)] text-sm">⏳ Chargement...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex p-3 gap-2.5">
      {/* SIDEBAR */}
      <Sidebar
        user={user}
        groups={groups}
        activeGroupId={activeGroupId}
        onSelectGroup={handleSelectGroup}
        onLogout={logout}
      />

      {/* ZONE DE CHAT */}
      <div className="flex-1 glass rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
          <span className="text-xl font-bold text-[var(--hash)]"
                style={{ textShadow: '0 0 14px var(--acc-g)' }}>#</span>
          <span className="text-[15px] font-semibold">{activeGroupName || 'Sélectionnez un salon'}</span>
          <span className="w-px h-[18px] bg-[var(--border-s)] mx-1" />
          <span className="text-xs text-[var(--t3)] flex-1">
            {groups.find(g => g.id === activeGroupId)?.description || 'Discussion'}
          </span>
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          isLoading={msgsLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          currentUserId={user?.id || ''}
        />

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-6 py-1.5 text-[11px] text-[var(--t3)] flex items-center gap-2">
            <span className="flex gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-[5px] h-[5px] rounded-full bg-[var(--acc)] opacity-50"
                      style={{ animation: `bounce 1.4s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </span>
            <strong className="text-[var(--t2)]">
              {typingUsers.map(u => u.username).join(', ')}
            </strong>
            {typingUsers.length === 1 ? ' est en train d\'écrire...' : ' sont en train d\'écrire...'}
          </div>
        )}

        {/* Input */}
        <MessageInput
          onSend={handleSendMessage}
          onTyping={emitTyping}
          channelName={activeGroupName}
          disabled={!activeGroupId}
        />
      </div>

      {/* PANNEAU MEMBRES */}
      <MembersPanel groupId={activeGroupId} />
    </div>
  );
}
