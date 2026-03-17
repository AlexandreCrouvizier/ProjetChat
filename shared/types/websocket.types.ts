// ===== WEBSOCKET EVENT TYPES =====
// Définit les types de tous les payloads Socket.io

import type { Message, ReactionSummary } from './message.types';

// ===== CLIENT → SERVER (emit) =====

export interface ClientToServerEvents {
  'message:send': (data: SendMessagePayload, callback: (res: MessageCallback) => void) => void;
  'message:edit': (data: EditMessagePayload) => void;
  'message:delete': (data: { message_id: string }) => void;
  'reaction:add': (data: { message_id: string; emoji: string }) => void;
  'typing:start': (data: { group_id?: string; conversation_id?: string }) => void;
  'typing:stop': (data: { group_id?: string; conversation_id?: string }) => void;
  'group:join': (data: { group_id: string }) => void;
  'group:leave': (data: { group_id: string }) => void;
  'presence:status': (data: { status_text: string; status_emoji: string }) => void;
  'conversation:read': (data: { conversation_id: string; last_read_message_id: string }) => void;
  'notification:read': (data: { notification_ids: string[] }) => void;
}

// ===== SERVER → CLIENT (listen) =====

export interface ServerToClientEvents {
  'message:new': (data: Message) => void;
  'message:edited': (data: { message_id: string; content: string; edited_at: string }) => void;
  'message:deleted': (data: { message_id: string }) => void;
  'reaction:update': (data: { message_id: string; reactions: ReactionSummary[] }) => void;
  'typing:update': (data: TypingUpdatePayload) => void;
  'presence:update': (data: { user_id: string; status: 'online' | 'offline'; last_seen_at?: string }) => void;
  'presence:status_updated': (data: { user_id: string; status_text: string; status_emoji: string }) => void;
  'group:member_joined': (data: { group_id: string; user: { id: string; username: string; tier: string } }) => void;
  'group:member_left': (data: { group_id: string; user_id: string; username: string }) => void;
  'group:updated': (data: { group_id: string; changes: Record<string, unknown> }) => void;
  'notification:new': (data: NotificationPayload) => void;
  'conversation:read_update': (data: { conversation_id: string; user_id: string; last_read_at: string }) => void;
  'moderation:message_hidden': (data: { message_id: string; reason: string }) => void;
  'moderation:user_muted': (data: { user_id: string; username: string; duration: string; group_id?: string }) => void;
}

// ===== PAYLOADS =====

export interface SendMessagePayload {
  content: string;
  group_id?: string;
  conversation_id?: string;
  reply_to_id?: string;
  parent_message_id?: string;
  type: 'text' | 'image' | 'gif';
}

export interface EditMessagePayload {
  message_id: string;
  content: string;
}

export interface MessageCallback {
  success: boolean;
  message?: Message;
  error?: string;
}

export interface TypingUpdatePayload {
  group_id?: string;
  conversation_id?: string;
  users: Array<{ id: string; username: string }>;
}

export interface NotificationPayload {
  id: string;
  type: 'mention' | 'reply' | 'reaction' | 'report' | 'invite' | 'system';
  title: string;
  content: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}
