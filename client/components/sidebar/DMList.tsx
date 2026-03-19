/**
 * components/sidebar/DMList.tsx — FIXED: Masquer au lieu de Quitter
 */
'use client';

import type { Conversation } from '@/hooks/useConversations';

interface DMListProps {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelect: (conv: Conversation) => void;
  onHide: (convId: string) => void;
}

function getAvatarColor(u: string): string {
  const c = ['from-purple-500 to-indigo-500','from-emerald-500 to-green-600','from-amber-500 to-orange-600','from-red-500 to-rose-600','from-cyan-500 to-blue-500','from-pink-500 to-fuchsia-600'];
  let h = 0; for (let i = 0; i < u.length; i++) h = u.charCodeAt(i) + ((h << 5) - h); return c[Math.abs(h) % c.length];
}
function isOnline(lastSeen: string | null): boolean { return !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000; }

export function DMList({ conversations, activeConvId, onSelect, onHide }: DMListProps) {
  if (conversations.length === 0) return <div className="px-5 py-2 text-[11px] text-[var(--t3)] italic">Aucune conversation</div>;

  return (
    <div>
      {conversations.map(conv => {
        const initial = conv.participant_username.charAt(0).toUpperCase();
        const color = getAvatarColor(conv.participant_username);
        const online = isOnline(conv.participant_last_seen_at);

        return (
          <div key={conv.id} className="relative group/dm">
            <button onClick={() => onSelect(conv)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-sm transition-all border border-transparent pr-8
                ${activeConvId === conv.id ? 'bg-[var(--glass-a)] border-[rgba(139,92,246,0.2)] text-[var(--t1)]' : 'text-[var(--t2)] hover:bg-[var(--glass-h)] hover:border-[var(--border)] hover:text-[var(--t1)]'}`}>
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 relative`}>
                {initial}
                {online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--on)] border-2 border-[var(--bg)]" />}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[12px] font-medium truncate">{conv.participant_username}</div>
                {conv.last_message_content && (
                  <div className="text-[10px] text-[var(--t3)] truncate">
                    {conv.last_message_author === conv.participant_username ? '' : 'Vous : '}{conv.last_message_content}
                  </div>
                )}
              </div>
              {conv.unread_count > 0 && (
                <span className="w-5 h-5 rounded-full bg-[var(--acc)] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 shadow-[0_0_8px_var(--acc-g)]">
                  {conv.unread_count > 9 ? '9+' : conv.unread_count}
                </span>
              )}
            </button>
            {/* ⭐ Masquer (pas supprimer — la conv réapparaîtra si l'autre écrit) */}
            <button onClick={(e) => { e.stopPropagation(); onHide(conv.id); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-[10px] text-[var(--t3)] hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/dm:opacity-100"
              title="Masquer la conversation">
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
