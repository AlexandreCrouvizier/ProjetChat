/**
 * services/livekit.service.ts — Fabrication des jetons d'appel LiveKit (Lot B)
 *
 * 🔐 Appelé UNIQUEMENT par POST /api/voice/token, après tous les contrôles de voice.service.ts.
 *   - Identité = identifiant du compte (jamais le pseudo, qui peut changer) ; le pseudo n'est qu'un nom affiché.
 *   - Salle = nom fabriqué ici (g_<salon> / dm_<conversation>), jamais fourni par le navigateur.
 *   - Les droits sont GRAVÉS dans le jeton : une fonction non autorisée n'y figure pas, et c'est LiveKit
 *     lui-même qui refuse de la publier (même avec un navigateur trafiqué).
 *   - Pas de canal de données (le chat existe déjà), pas de modification de ses propres métadonnées.
 *   - Validité courte : le jeton ne sert qu'à se connecter ; LiveKit renouvelle ensuite la session lui-même.
 *   - La clé secrète ne quitte jamais le serveur.
 */
import { AccessToken, RoomConfiguration, TrackSource, type VideoGrant } from 'livekit-server-sdk';
import { env } from '../config/env';
import type { VoiceCap } from './settings.service';
import type { VoiceTarget } from './voice.service';

export const TOKEN_TTL_SECONDS = 10 * 60;

const SOURCES: Record<VoiceCap, TrackSource[]> = {
  voice: [TrackSource.MICROPHONE],
  video: [TrackSource.CAMERA],
  screen: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
};

/**
 * Jeton du test de connexion (profil) : salle personnelle `test_<compte>`, 1 participant, rien à publier,
 * 1 minute. Sert seulement à vérifier que l'audio peut passer entre ce navigateur et LiveKit.
 */
export async function createTestToken(userId: string, username: string): Promise<{ token: string; room: string }> {
  const room = `test_${userId}`;
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: userId, name: username.slice(0, 64), ttl: 60 });
  at.addGrant({
    room, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false, canUpdateOwnMetadata: false,
    roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false,
  });
  at.roomConfig = new RoomConfiguration({ maxParticipants: 1, emptyTimeout: 10, departureTimeout: 1 });
  return { token: await at.toJwt(), room };
}

/**
 * Vérifie que LiveKit accepte NOS clés (appel « liste des salles » signé, droit roomList seul, 1 min).
 * 'refused' : clés différentes entre le .env du serveur et LiveKit (ou horloges très décalées).
 */
export async function checkLiveKitKeys(httpUrl: string, signal: AbortSignal): Promise<'ok' | 'refused' | 'unknown'> {
  try {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { ttl: 60 });
    at.addGrant({ roomList: true });
    const res = await fetch(new URL('twirp/livekit.RoomService/ListRooms', httpUrl), {
      method: 'POST', signal, redirect: 'manual',
      headers: { Authorization: `Bearer ${await at.toJwt()}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status === 401 || res.status === 403) return 'refused';
    return res.ok ? 'ok' : 'unknown';
  } catch { return 'unknown'; }
}

/** Nom de la salle LiveKit d'un salon ou d'un message privé */
export function roomNameFor(target: Pick<VoiceTarget, 'groupId' | 'conversationId'>): string {
  if (target.groupId) return `g_${target.groupId}`;
  if (target.conversationId) return `dm_${target.conversationId}`;
  throw new Error('Cible d\'appel invalide');
}

/** Adresse LiveKit pour les navigateurs (ws/wss) ; null si non configurée */
export function publicLiveKitUrl(): string | null {
  const raw = (env.LIVEKIT_PUBLIC_URL || env.LIVEKIT_URL).trim();
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:') u.protocol = 'wss:';
    if (u.protocol === 'http:') u.protocol = 'ws:';
    if (u.protocol !== 'wss:' && !(u.protocol === 'ws:' && env.isDev)) return null; // production : wss obligatoire
    if (u.username || u.password) return null;
    return u.origin.replace(/^http/, 'ws');
  } catch { return null; }
}

export interface JoinTokenInput {
  userId: string;
  username: string;
  target: VoiceTarget;
  caps: VoiceCap[];            // fonctions autorisées DANS CE salon (déjà vérifiées)
  maxParticipants: number;
}

export async function createJoinToken({ userId, username, target, caps, maxParticipants }: JoinTokenInput): Promise<{ token: string; room: string }> {
  const room = roomNameFor(target);
  const sources = caps.flatMap((c) => SOURCES[c]);
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: username.slice(0, 64),
    ttl: TOKEN_TTL_SECONDS,
  });
  const grant: VideoGrant = {
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    roomAdmin: false,
    roomCreate: false,
    roomList: false,
    roomRecord: false,
    hidden: false,
  };
  at.addGrant(grant);
  // Appliqué par LiveKit à la création de la salle (premier arrivant) : nombre max de participants, fermeture rapide
  at.roomConfig = new RoomConfiguration({ maxParticipants, emptyTimeout: 60, departureTimeout: 20 });
  return { token: await at.toJwt(), room };
}
