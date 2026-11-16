/**
 * services/accessRevocation.service.ts — Couper l'accès d'un utilisateur banni
 *
 * 🔐 Avant : un bannissement n'envoyait qu'un événement au navigateur du banni
 * (qui pouvait l'ignorer) et ses sessions restaient valides → il continuait
 * à renouveler ses tokens et à rester connecté.
 *
 * Maintenant :
 *   1. Toutes ses sessions (refresh tokens) sont supprimées → plus de renouvellement
 *   2. Ses connexions WebSocket sont fermées (après 1 s, pour laisser passer la notification)
 * Son access token restant expire de lui-même en 15 min maximum.
 */
import type { Server as SocketIOServer } from 'socket.io';
import { sessionRepository } from '../repositories/session.repository';

export async function revokeUserAccess(io: SocketIOServer | undefined, userId: string): Promise<void> {
  await sessionRepository.deleteAllForUser(userId);
  if (io) {
    setTimeout(() => { io.in(`user:${userId}`).disconnectSockets(true); }, 1000);
  }
}

/** Un bannissement temporaire dont la date est passée n'est plus actif */
export function isBanActive(user: { is_banned?: boolean; ban_expires_at?: string | Date | null }): boolean {
  if (!user?.is_banned) return false;
  if (!user.ban_expires_at) return true; // permanent
  return new Date(user.ban_expires_at).getTime() > Date.now();
}
