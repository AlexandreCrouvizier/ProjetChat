/**
 * services/voice.service.ts — Voix / vidéo / partage d'écran : droits et état du service (Lot A, sans LiveKit)
 *
 * 🔐 Règle n° 1 : le contrôle est TOUJOURS fait ici, côté serveur. Cacher ou griser un bouton ne protège rien :
 * aucun jeton d'appel n'est délivré (routes/voice.routes.ts) tant que toutes les conditions ne sont pas réunies.
 *
 * Une fonction (voix, vidéo, partage d'écran) est autorisée seulement si TOUT est vrai :
 *   1. le mode effectif est « on » (réglage admin « on » ET LiveKit configuré et qui répond) ;
 *   2. le type de compte de l'utilisateur l'autorise (réglage par type de compte et par fonction) ;
 *   3. le salon l'autorise : sa dérogation (on/off) si elle existe, sinon le réglage du type de salon
 *      (public / privé / message privé) ;
 *   4. l'utilisateur a le droit d'accéder au salon (membre d'un salon privé, participant d'un message privé).
 * Une dérogation « on » d'un salon ne dépasse jamais le type de compte : un invité n'obtient rien.
 *
 * Santé : sans LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET, ou si LiveKit ne répond pas,
 * le mode effectif passe en « unavailable » (boutons grisés) sans rien casser.
 */
import { env } from '../config/env';
import { db } from '../config/database';
import { groupRepository } from '../repositories/group.repository';
import { conversationRepository } from '../repositories/conversation.repository';
import { canReadGroup } from './access.service';
import { checkLiveKitKeys } from './livekit.service';
import { NotFoundError } from '../utils/errors';
import {
  settingsService, normalizeTier, VOICE_CAPS, normalizeVoiceEntry, DEFAULT_VOICE_ENTRY,
  type VoiceMode, type VoiceCap, type RoomKind, type Tier, type VoiceEntryChoice, type VoiceEntryRule, type CapMatrix,
} from './settings.service';

export type VoiceReason = 'MODE_OFF' | 'MODE_UNAVAILABLE' | 'TIER' | 'ROOM_TYPE' | 'ROOM_OVERRIDE';
export interface CapDecision { allowed: boolean; reason?: VoiceReason }
export type CapDecisions = Record<VoiceCap, CapDecision>;

// ─── Santé de LiveKit ───────────────────────────────────────────────────────────────────────────

export interface VoiceHealth { configured: boolean; ok: boolean; checkedAt: number; detail: string }
let health: VoiceHealth = { configured: false, ok: false, checkedAt: 0, detail: 'non vérifié' };
let inFlight: Promise<VoiceHealth> | null = null;
const HEALTH_TTL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 2_000;

/** Adresse HTTP du serveur LiveKit (ws → http, wss → https) ; null si absente ou invalide. En production : https/wss seulement. */
export function liveKitHttpUrl(): string | null {
  const raw = env.LIVEKIT_URL.trim();
  if (!raw || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  try {
    const u = new URL(raw);
    const secure = u.protocol === 'wss:' || u.protocol === 'https:';
    if (!secure && !env.isDev) return null;                      // production : jamais en clair
    if (!['ws:', 'wss:', 'http:', 'https:'].includes(u.protocol)) return null;
    if (u.username || u.password) return null;
    if (!env.isDev && env.LIVEKIT_API_SECRET.length < 32) return null; // production : secret long obligatoire
    u.protocol = secure ? 'https:' : 'http:';
    return u.toString();
  } catch { return null; }
}

async function probe(): Promise<VoiceHealth> {
  const url = liveKitHttpUrl();
  if (!url) return { configured: false, ok: false, checkedAt: Date.now(), detail: 'LiveKit non configuré' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    if (res.status < 200 || res.status >= 400) return { configured: true, ok: false, checkedAt: Date.now(), detail: `HTTP ${res.status}` };
    // LiveKit répond : accepte-t-il nos clés ? (sinon aucun appel ne pourrait se connecter)
    if (await checkLiveKitKeys(url, ctrl.signal) === 'refused') {
      return { configured: true, ok: false, checkedAt: Date.now(), detail: 'clés refusées par LiveKit (LIVEKIT_API_KEY / LIVEKIT_API_SECRET différents, ou horloge décalée)' };
    }
    return { configured: true, ok: true, checkedAt: Date.now(), detail: `HTTP ${res.status}` };
  } catch (e: any) {
    return { configured: true, ok: false, checkedAt: Date.now(), detail: e?.name === 'AbortError' ? 'délai dépassé' : 'injoignable' };
  } finally {
    clearTimeout(timer);
  }
}

/** État de LiveKit (mémorisé 30 s ; un seul contrôle à la fois). Ne lève jamais d'erreur. */
export async function getVoiceHealth(force = false): Promise<VoiceHealth> {
  if (!force && Date.now() - health.checkedAt < HEALTH_TTL_MS) return health;
  if (!inFlight) inFlight = probe().then((h) => { health = h; return h; }).catch(() => health).finally(() => { inFlight = null; });
  return inFlight;
}

/** Pour les tests : oublie l'état mémorisé */
export function resetVoiceHealth(): void { health = { configured: false, ok: false, checkedAt: 0, detail: 'non vérifié' }; }

/** Mode réellement appliqué : réglage admin, ramené à « unavailable » si LiveKit n'est pas prêt */
export async function effectiveVoiceMode(): Promise<VoiceMode> {
  const set = await settingsService.voiceMode();
  if (set !== 'on') return set;
  return (await getVoiceHealth()).ok ? 'on' : 'unavailable';
}

// ─── Droits ─────────────────────────────────────────────────────────────────────────────────────

type Override = 'on' | 'off' | null | undefined;
const asOverride = (v: unknown): Override => (v === 'on' || v === 'off' ? v : null);

/** Décision pour chaque fonction : mode, type de compte, type de salon, dérogation du salon */
export function decide(mode: VoiceMode, tierCaps: CapMatrix, roomKind: CapMatrix,
  overrides?: Partial<Record<VoiceCap, Override>>): CapDecisions {
  const out = {} as CapDecisions;
  for (const cap of VOICE_CAPS) {
    if (mode === 'off') { out[cap] = { allowed: false, reason: 'MODE_OFF' }; continue; }
    if (mode === 'unavailable') { out[cap] = { allowed: false, reason: 'MODE_UNAVAILABLE' }; continue; }
    if (!tierCaps[cap]) { out[cap] = { allowed: false, reason: 'TIER' }; continue; }
    const ov = asOverride(overrides?.[cap]);
    if (ov === 'off') { out[cap] = { allowed: false, reason: 'ROOM_OVERRIDE' }; continue; }
    if (ov === 'on') { out[cap] = { allowed: true }; continue; }
    out[cap] = roomKind[cap] ? { allowed: true } : { allowed: false, reason: 'ROOM_TYPE' };
  }
  return out;
}

export interface VoiceTarget {
  kind: RoomKind;
  groupId?: string;
  conversationId?: string;
  overrides: Partial<Record<VoiceCap, Override>>;
  maxParticipants: number | null;
  /** Messages vocaux : dérogation du salon (null = selon le type de salon) */
  voiceMsgOverride?: Override;
}

/** Message vocal autorisé ? type de compte ET (dérogation du salon, sinon type de salon). Indépendant de LiveKit. */
export function decideVoiceMsg(tierAllowed: boolean, roomKindAllowed: boolean, override: Override): boolean {
  if (!tierAllowed) return false;
  if (override === 'off') return false;
  if (override === 'on') return true;
  return roomKindAllowed;
}

/** Salon ou message privé visé ; 404 si introuvable ou inaccessible (on ne confirme pas son existence) */
export async function resolveTarget(userId: string, ref: { groupId?: unknown; conversationId?: unknown }): Promise<VoiceTarget> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof ref.groupId === 'string' && uuid.test(ref.groupId)) {
    const group: any = await groupRepository.findById(ref.groupId);
    if (!group || !['active', 'inactive'].includes(group.status) || !(await canReadGroup(group, userId))) {
      throw new NotFoundError('Salon introuvable');
    }
    return {
      kind: group.type === 'private' ? 'private' : 'public',
      groupId: group.id,
      overrides: { voice: asOverride(group.allow_voice), video: asOverride(group.allow_video), screen: asOverride(group.allow_screen) },
      maxParticipants: Number.isInteger(group.voice_max_participants) ? group.voice_max_participants : null,
      voiceMsgOverride: asOverride(group.allow_voicemsg),
    };
  }
  if (typeof ref.conversationId === 'string' && uuid.test(ref.conversationId)) {
    if (!(await conversationRepository.isParticipant(ref.conversationId, userId))) throw new NotFoundError('Conversation introuvable');
    return { kind: 'dm', conversationId: ref.conversationId, overrides: {}, maxParticipants: null };
  }
  throw new NotFoundError('Salon introuvable');
}

/** Type de compte à jour (lu en base : le jeton d'accès peut dater de 15 min) */
export async function tierOf(userId: string): Promise<Tier> {
  const row = await db('users').where({ id: userId }).first('tier');
  return normalizeTier(row?.tier);
}

/** Règles des messages vocaux pour un membre dans un salon / message privé (404 si inaccessible) */
export async function voiceMsgRules(userId: string, ref: { groupId?: unknown; conversationId?: unknown }) {
  const tier = await tierOf(userId);
  const target = await resolveTarget(userId, ref);
  const [ts, vr] = await Promise.all([settingsService.forTier(tier), settingsService.voiceMsgRooms()]);
  return { allowed: decideVoiceMsg(ts.voiceMsg.allowed, vr[target.kind], target.voiceMsgOverride), maxSeconds: ts.voiceMsg.maxSeconds, tier };
}

export const voiceService = {
  /** Résumé pour un type de compte : mode effectif + ce que chaque type de salon permet (sans dérogation de salon) */
  async status(tier: Tier) {
    const [mode, ts, rooms] = await Promise.all([effectiveVoiceMode(), settingsService.forTier(tier), settingsService.voiceRooms()]);
    return {
      mode,
      caps: ts.voiceCaps,
      matrix: {
        public: decide(mode, ts.voiceCaps, rooms.public),
        private: decide(mode, ts.voiceCaps, rooms.private),
        dm: decide(mode, ts.voiceCaps, rooms.dm),
      },
      max_participants: ts.voiceMax,
      voicemsg: await (async () => {
        const vr = await settingsService.voiceMsgRooms();
        const m = ts.voiceMsg;
        return {
          matrix: { public: m.allowed && vr.public, private: m.allowed && vr.private, dm: m.allowed && vr.dm },
          max_seconds: m.maxSeconds, places: m.places,
        };
      })(),
    };
  },

  /** Droits d'un utilisateur dans un salon ou un message privé précis (avec dérogations) */
  async permissions(userId: string, ref: { groupId?: unknown; conversationId?: unknown }) {
    const tier = await tierOf(userId);
    const target = await resolveTarget(userId, ref);
    const [mode, ts, rooms] = await Promise.all([effectiveVoiceMode(), settingsService.forTier(tier), settingsService.voiceRooms()]);
    const max = Math.min(ts.voiceMax, target.maxParticipants ?? Infinity);
    const vr = await settingsService.voiceMsgRooms();
    return {
      mode, target, decisions: decide(mode, ts.voiceCaps, rooms[target.kind], target.overrides), max_participants: max,
      voicemsg: decideVoiceMsg(ts.voiceMsg.allowed, vr[target.kind], target.voiceMsgOverride),
      voicemsg_max_seconds: ts.voiceMsg.maxSeconds,
    };
  },

  /** Où le membre veut ses boutons : règle de l'admin, choix du membre, valeur appliquée */
  async entry(userId: string, tier: Tier): Promise<{ rule: VoiceEntryRule; preference: VoiceEntryChoice | null; effective: VoiceEntryChoice }> {
    const rule = (await settingsService.forTier(tier)).voiceEntry;
    const row = await db('users').where({ id: userId }).first('voice_entry');
    const preference: VoiceEntryChoice | null = normalizeVoiceEntry(row?.voice_entry);
    const effective: VoiceEntryChoice = rule === 'option' ? (preference ?? DEFAULT_VOICE_ENTRY) : rule;
    return { rule, preference, effective };
  },
};
