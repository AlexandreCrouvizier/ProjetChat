// ===== MESSAGE TYPES =====

export type MessageType = 'text' | 'image' | 'file' | 'gif' | 'system';

export interface Message {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
    tier: string;
    donor_badge: string;
  };
  group_id: string | null;
  conversation_id: string | null;
  parent_message_id: string | null;  // Thread
  reply_to_id: string | null;        // Quote
  type: MessageType;
  file_url: string | null;
  gif_url: string | null;
  link_preview: LinkPreview | null;
  is_ephemeral: boolean;
  is_pinned: boolean;
  is_hidden: boolean;
  reactions: ReactionSummary[];
  thread_count: number;
  edited_at: string | null;
  created_at: string;
}

export interface LinkPreview {
  title: string;
  description: string | null;
  image: string | null;
  url: string;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;  // L'utilisateur courant a-t-il réagi ?
}

export interface MessageListResponse {
  messages: Message[];
  has_more: boolean;
}
