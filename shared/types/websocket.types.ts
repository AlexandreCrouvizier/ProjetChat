// ===== WEBSOCKET EVENT TYPES =====
// Liste des événements Socket.io RÉELLEMENT échangés entre le serveur et le client.
// ⚠️ À tenir à jour : quand on ajoute un socket.on / emit côté serveur, on l'ajoute ici.
// TypeScript refuse alors tout nom d'événement mal orthographié ou payload incorrect côté client.

import type { Message } from './message.types';

// ===== CLIENT → SERVER (emit) =====

export interface ClientToServerEvents {
  'message:send': (data: SendMessagePayload, callback: (res: MessageCallback) => void) => void;
  'dm:send': (data: SendDMPayload, callback: (res: MessageCallback) => void) => void;
  'reaction:toggle': (data: { message_id: string; emoji: string }) => void;
  'typing:start': (data: { group_id?: string; conversation_id?: string }) => void;
  'typing:stop': (data: { group_id?: string; conversation_id?: string }) => void;
  'group:join': (data: { group_id: string }, callback?: (res: { success: boolean; error?: string }) => void) => void;
  'group:leave': (data: { group_id: string }) => void;
  'conversation:join': (data: { conversation_id: string }, callback?: (res: { success: boolean; error?: string }) => void) => void;
  'conversation:read': (data: { conversation_id: string }) => void;
  'user:logout': () => void;
}

// ===== SERVER → CLIENT (listen) =====

export interface ServerToClientEvents {
  // Messages des salons
  'message:new': (data: Message) => void;
  'message:edited': (data: { message_id: string; content: string; edited_at: string }) => void;
  'message:deleted': (data: { message_id: string }) => void;
  'message:hidden': (data: MessageHiddenPayload) => void;
  'thread:new_reply': (data: { parent_message_id: string; message: Message }) => void;
  'thread:count_update': (data: { message_id: string; thread_count_increment: number; last_reply_at: string }) => void;
  'reaction:update': (data: ReactionUpdatePayload) => void;
  'typing:update': (data: TypingUpdatePayload) => void;

  // Messages privés
  'dm:new': (data: Message) => void;
  'conversations:updated': () => void;
  'conversation:read_update': (data: { conversation_id: string; user_id: string; last_read_at: string }) => void;

  // Présence
  'presence:update': (data: { user_id: string; status: 'online' | 'offline'; last_seen_at?: string }) => void;
  'presence:status_updated': (data: { user_id: string; status_text: string; status_emoji: string }) => void;

  // Salons (le contenu de `group` suit le format de l'API REST /groups)
  'group:created': (data: { group: any }) => void;
  'group:joined': (data: { group: any }) => void;
  'group:updated': (data: { group: any }) => void;
  'group:deleted': (data: { group_id: string }) => void;
  'group:member_joined': (data: { group_id: string; user: { id: string; username: string; tier: string } }) => void;
  'group:member_left': (data: { group_id: string; user_id: string; username: string }) => void;

  // Compte / modération
  'notification:new': (data: NotificationPayload) => void;
  'moderation:banned': (data: { duration?: string; reason?: string; expires_at?: string | null; admin_message?: string }) => void;
  'moderation:muted': (data: any) => void;
  'user:tier_updated': (data: { tier: string }) => void;
}

// ===== PAYLOADS =====

export interface SendMessagePayload {
  content: string;
  group_id?: string;
  conversation_id?: string;
  reply_to_id?: string;
  parent_message_id?: string;
  type?: 'text' | 'image' | 'gif' | 'file';
  file_url?: string;
  gif_url?: string;
}

export interface SendDMPayload {
  conversation_id: string;
  content: string;
  reply_to_id?: string;
}

export interface MessageCallback {
  success: boolean;
  message?: Message;
  error?: string;
  // Présents quand l'utilisateur est muté
  muted?: boolean;
  expires_at?: string | null;
  reason?: string;
  duration?: string;
}

export interface MessageHiddenPayload {
  message_id: string;
  parent_message_id: string | null;
}

export interface ReactionUpdatePayload {
  message_id: string;
  // `users` = ids des utilisateurs ayant réagi ; le client calcule lui-même `reacted`
  reactions: Array<{ emoji: string; count: number; users: string[] }>;
}

export interface TypingUpdatePayload {
  group_id?: string;
  conversation_id?: string;
  users: Array<{ id: string; username: string }>;
}

export interface NotificationPayload {
  id?: string;
  type: 'mention' | 'reply' | 'reaction' | 'report' | 'invite' | 'system' | 'dm';
  title: string;
  content: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}
