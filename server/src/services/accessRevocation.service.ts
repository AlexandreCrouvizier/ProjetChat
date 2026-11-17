/**
 * services/accessRevocation.service.ts — Couper l'accès d'un utilisateur banni
 *
 * 🔐 Un bannissement doit prendre effet IMMÉDIATEMENT, partout :
 *   1. Notification « moderation:banned » (motif, durée), envoyée en premier pour que
 *      le motif arrive avant tout refus de l'API.
 *   2. Marqueur Redis « accès révoqué » → toute requête API avec son jeton d'accès
 *      est refusée (403 ACCOUNT_SUSPENDED), sans attendre l'expiration du jeton (15 min).
 *   3. Toutes ses sessions (refresh tokens) sont supprimées → plus de renouvellement.
 *   4. Fermeture de ses WebSocket (après 1 s, pour laisser passer la notification).
 *
 * Le marqueur vit un peu plus longtemps qu'un jeton d'accès : au-delà, le jeton a expiré
 * et ne peut plus être renouvelé (sessions supprimées + vérification du ban à la connexion).
 * Il est levé au débannissement (restoreUserAccess).
 */
import type { Server as SocketIOServer } from 'socket.io';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { sessionRepository } from '../repositories/session.repository';

const REVOKED_KEY = (userId: string) => `revoked:user:${userId}`;

export interface BanNotice {
  duration?: string;
  reason?: string;
  expires_at?: string | Date | null;
  admin_message?: string;
}

/** Durée de vie maximale d'un jeton d'accès, en secondes (« 15m », « 900 », « 1h »…) + 1 min de marge */
function accessTokenLifetimeSeconds(): number {
  const raw = String(env.JWT_ACCESS_EXPIRES_IN || '15m').trim();
  const m = /^(\d+)\s*([smhd]?)$/i.exec(raw);
  const unit: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = m ? Number(m[1]) * unit[m[2].toLowerCase()] : 15 * 60;
  return seconds + 60;
}

export async function revokeUserAccess(
  io: SocketIOServer | undefined,
  userId: string,
  notice?: BanNotice,
): Promise<void> {
  // 1. Prévenir d'abord (motif, durée) : si le refus de l'API arrivait avant cette
  //    notification, le navigateur quitterait le chat et ne recevrait jamais le motif.
  //    L'envoi est immédiat (aucune attente) : la révocation suit dans la foulée.
  if (io && notice) {
    io.to(`user:${userId}`).emit('moderation:banned', {
      duration: notice.duration || 'permanent',
      reason: notice.reason,
      expires_at: notice.expires_at ?? null,
      admin_message: notice.admin_message || undefined,
    });
  }
  // 2. Refus immédiat de son jeton d'accès encore valide
  try {
    await redis.set(REVOKED_KEY(userId), '1', 'EX', accessTokenLifetimeSeconds());
  } catch (err) {
    console.error('❌ Révocation (Redis) impossible :', (err as Error)?.message);
  }
  // 3. Plus aucun renouvellement de session
  await sessionRepository.deleteAllForUser(userId);
  // 4. Fermer ses connexions temps réel (après 1 s, pour laisser passer la notification)
  if (io) {
    setTimeout(() => { io.in(`user:${userId}`).disconnectSockets(true); }, 1000);
  }
}

/** Débannissement : lever le marqueur de révocation */
export async function restoreUserAccess(userId: string): Promise<void> {
  try { await redis.del(REVOKED_KEY(userId)); } catch { /* Redis indisponible : le marqueur expirera seul */ }
}

/**
 * L'accès de cet utilisateur a-t-il été révoqué (ban) ?
 * Si Redis est indisponible on laisse passer : les sessions sont déjà supprimées
 * et le jeton expire de lui-même (disponibilité du chat préservée).
 */
export async function isAccessRevoked(userId: string): Promise<boolean> {
  try { return (await redis.exists(REVOKED_KEY(userId))) === 1; } catch { return false; }
}

/** Un bannissement temporaire dont la date est passée n'est plus actif */
export function isBanActive(user: { is_banned?: boolean; ban_expires_at?: string | Date | null }): boolean {
  if (!user?.is_banned) return false;
  if (!user.ban_expires_at) return true; // permanent
  return new Date(user.ban_expires_at).getTime() > Date.now();
}
