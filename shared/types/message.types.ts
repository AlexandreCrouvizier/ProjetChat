// ===== MESSAGE TYPES =====

export type MessageType = 'text' | 'image' | 'file' | 'gif' | 'system' | 'audio';

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
  reply_to: { id: string; author_username: string; content: string } | null;
  type: MessageType;
  file_url: string | null;
  /** Média effacé après coup : « author » (par son auteur) ou « moderation » */
  media_removed?: 'author' | 'moderation' | 'expired' | null;
  gif_url: string | null;
  /** Message vocal : durée en millisecondes */
  audio_duration_ms?: number | null;
  link_preview: LinkPreview | null;
  is_ephemeral: boolean;
  is_pinned: boolean;
  is_hidden: boolean;
  reactions: ReactionSummary[];
  thread_count: number;
  thread_last_reply_at: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface LinkPreview {
  title: string;
  description: string | null;
  image: string | null;
  url: string;
  site_name: string | null;
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
