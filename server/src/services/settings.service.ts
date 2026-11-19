/**
 * services/settings.service.ts — Réglages de l'application (table app_settings), par type de compte
 *
 * Lecture avec un cache mémoire de 30 s (pas de requête à chaque message), invalidé à chaque
 * modification depuis le panel. Toute valeur absente ou invalide retombe sur une valeur sûre.
 *
 * 🔐 Les valeurs modifiables depuis le panel sont contrôlées par validateSettingUpdate() :
 * choix fermés et bornes numériques (un délai à 0 ms ouvrirait la porte au spam, une durée de
 * conservation sous 1 an ne respecterait plus la LCEN…).
 */
import { db } from '../config/database';

export type Tier = 'guest' | 'registered' | 'premium';
export const TIERS: Tier[] = ['guest', 'registered', 'premium'];

export type MetadataMode = 'strip' | 'keep' | 'option';
export type HistoryRule = 'all' | 'before_join' | 'last';
/**
 * Suppression par un membre d'un fichier DÉJÀ posté dans des messages (un fichier jamais posté est toujours effacé) :
 *   gallery_only   : retiré de sa galerie seulement (reste visible dans les messages, compte dans le quota)
 *   erase          : fichier effacé, les messages affichent « supprimé par son auteur » (quota libéré)
 *   erase_messages : fichier effacé ET messages masqués (trace LCEN conservée)
 *   block          : suppression refusée tant que le fichier est utilisé
 *   option         : le membre choisit entre gallery_only / erase / erase_messages
 */
export type DeleteMode = 'gallery_only' | 'erase' | 'erase_messages' | 'block' | 'option';
export const DELETE_MODES: DeleteMode[] = ['gallery_only', 'erase', 'erase_messages', 'block', 'option'];
export const MEMBER_DELETE_CHOICES: DeleteMode[] = ['gallery_only', 'erase', 'erase_messages'];

/**
 * Disposition de l'écran sur téléphone / tablette en portrait (aucun effet sur un grand écran) :
 *   stack   : pile d'écrans (liste des salons → discussion plein écran)
 *   tabs    : onglets en bas (Salons · Messages · Discussion · Moi)
 *   drawers : tiroirs latéraux (discussion plein écran, salons à gauche, membres à droite)
 *   option  : le membre choisit dans son profil (users.mobile_layout ; pile d'écrans par défaut)
 */
export type MobileLayout = 'stack' | 'tabs' | 'drawers';
export type MobileLayoutRule = MobileLayout | 'option';
export const MOBILE_LAYOUTS: MobileLayout[] = ['stack', 'tabs', 'drawers'];
export const MOBILE_LAYOUT_RULES: MobileLayoutRule[] = [...MOBILE_LAYOUTS, 'option'];
export const DEFAULT_MOBILE_LAYOUT: MobileLayout = 'stack';

/**
 * Voix / vidéo / partage d'écran (Lot A, socle sans LiveKit)
 *   VoiceMode  : off (boutons invisibles) · unavailable (boutons grisés) · on (activée)
 *   VoiceCap   : voice (voix) · video (vidéo) · screen (partage d'écran), réglables indépendamment
 *   RoomKind   : public · private · dm (message privé)
 *   VoiceEntry : où apparaissent les boutons d'appel — un ou plusieurs emplacements parmi
 *                header (en-tête du salon) · members (liste des membres) · composer (zone de saisie, à droite de GIF)
 *                · send (zone de saisie, à côté du bouton envoyer) · media (dans le menu 📎). Valeur = emplacements séparés par des virgules (« both » = header,members), ou « none ».
 */
export type VoiceMode = 'off' | 'unavailable' | 'on';
export const VOICE_MODES: VoiceMode[] = ['off', 'unavailable', 'on'];
export type VoiceCap = 'voice' | 'video' | 'screen';
export const VOICE_CAPS: VoiceCap[] = ['voice', 'video', 'screen'];
export type RoomKind = 'public' | 'private' | 'dm';
export const ROOM_KINDS: RoomKind[] = ['public', 'private', 'dm'];
export const VOICE_PLACES = ['header', 'members', 'composer', 'send', 'media'] as const;
export type VoicePlace = (typeof VOICE_PLACES)[number];
/** Choix d'un membre : emplacements normalisés (« header,members »), ou « none » (aucun bouton) */
export type VoiceEntryChoice = string;
/** Règle de l'admin : « option » (chaque membre choisit) ou des emplacements imposés */
export type VoiceEntryRule = string;
export const DEFAULT_VOICE_ENTRY: VoiceEntryChoice = 'header,members';

/** Normalise une liste d'emplacements ; null si invalide (valeur inconnue, vide…) */
export function normalizeVoiceEntry(raw: unknown): VoiceEntryChoice | null {
  if (typeof raw !== 'string' || raw.length > 60) return null;
  const v = raw.trim();
  if (v === 'none') return 'none';
  const parts = v.split(',').map((p) => p.trim());
  if (parts.length === 0 || parts.length > 8 || parts.some((p) => !p)) return null;
  const picked = new Set<string>();
  for (const p of parts) {
    if (p === 'both') { picked.add('header'); picked.add('members'); }
    else if ((VOICE_PLACES as readonly string[]).includes(p)) picked.add(p);
    else return null;
  }
  return VOICE_PLACES.filter((p) => picked.has(p)).join(',');
}
/** Règle admin valide ou null */
export function normalizeVoiceRule(raw: unknown): VoiceEntryRule | null {
  return typeof raw === 'string' && raw.trim() === 'option' ? 'option' : normalizeVoiceEntry(raw);
}

export type CapMatrix = Record<VoiceCap, boolean>;

/** Bornes de sécurité des réglages numériques */
export const SETTING_BOUNDS = {
  history_limit: { min: 0, max: 100000 },
  rate_limit_ms: { min: 200, max: 600000 },          // 0,2 s → 10 min
  flood_max_per_minute: { min: 1, max: 60 },
  lcen_retention_days: { min: 365, max: 3650 },      // 1 an (LCEN) → 10 ans
  storage_quota_mb: { min: 0, max: 102400 },         // 0 (envoi désactivé) → 100 Go
  upload_expiry_days: { min: 0, max: 3650 },         // 0 (sans limite) → 10 ans
  voice_max: { min: 2, max: 100 },                   // participants par appel
  voicemsg_max_seconds: { min: 5, max: 600 },        // durée d'un message vocal (5 s → 10 min)
  voicemsg_retention_days: { min: 0, max: 3650 },    // conservation des vocaux (0 = sans limite)
} as const;

/**
 * Messages vocaux : indépendants des appels (pas besoin de LiveKit).
 * Autorisés si le type de compte ET le salon (dérogation, sinon type de salon) l'autorisent.
 * Emplacements du bouton 🎤 : composer (à droite de GIF) · send (à côté de Envoyer) · media (menu 📎), ou « none ».
 */
export const VOICEMSG_PLACES = ['composer', 'send', 'media'] as const;
export type VoiceMsgPlace = (typeof VOICEMSG_PLACES)[number];
export function normalizeVoiceMsgPlaces(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const v = raw.trim();
  if (v === 'none') return 'none';
  const parts = v.split(',').map((p) => p.trim());
  if (!parts.length || parts.some((p) => !(VOICEMSG_PLACES as readonly string[]).includes(p))) return null;
  return VOICEMSG_PLACES.filter((p) => parts.includes(p)).join(',');
}
export interface VoiceMsgSettings { allowed: boolean; maxSeconds: number; retentionDays: number; places: string }
const DEFAULT_VOICEMSG: Record<Tier, VoiceMsgSettings> = {
  guest: { allowed: false, maxSeconds: 30, retentionDays: 30, places: 'send' },
  registered: { allowed: true, maxSeconds: 60, retentionDays: 30, places: 'send' },
  premium: { allowed: true, maxSeconds: 300, retentionDays: 30, places: 'send' },
};
/** Stockage autorisé aux invités pour leurs vocaux (s'ils y ont droit) : ils n'ont pas de quota de fichiers */
export const GUEST_VOICEMSG_QUOTA_BYTES = 10 * 1024 * 1024;

const DEFAULT_RATE_MS: Record<Tier, number> = { guest: 10000, registered: 1000, premium: 500 };
const DEFAULT_QUOTA_MB: Record<Tier, number> = { guest: 0, registered: 200, premium: 2048 };
// Voix / vidéo : sûr par défaut (invités rien ; inscrits voix ; Premium tout ; salons publics : voix seulement)
const DEFAULT_VOICE_CAP: Record<Tier, CapMatrix> = {
  guest: { voice: false, video: false, screen: false },
  registered: { voice: true, video: false, screen: false },
  premium: { voice: true, video: true, screen: true },
};
const DEFAULT_VOICE_ROOM: Record<RoomKind, CapMatrix> = {
  public: { voice: true, video: false, screen: false },
  private: { voice: true, video: true, screen: true },
  dm: { voice: true, video: true, screen: true },
};
const DEFAULT_VOICE_MAX: Record<Tier, number> = { guest: 8, registered: 8, premium: 16 };

export interface TierSettings {
  metadataMode: MetadataMode;
  historyRule: HistoryRule;
  historyLimit: number;
  rateLimitMs: number;
  floodMaxPerMinute: number;
  /** Quota de stockage en octets (invités : 0, aucun envoi) */
  storageQuotaBytes: number;
  deleteMode: DeleteMode;
  /** Durée de conservation des fichiers en jours (0 = sans limite) */
  uploadExpiryDays: number;
  /** Disposition sur téléphone imposée, ou « option » (choix du membre) */
  mobileLayout: MobileLayoutRule;
  /** Voix / vidéo / écran autorisés pour ce type de compte (avant les règles par salon) */
  voiceCaps: CapMatrix;
  /** Participants maximum par appel */
  voiceMax: number;
  /** Où apparaissent les boutons d'appel, ou « option » (choix du membre) */
  voiceEntry: VoiceEntryRule;
  /** Messages vocaux pour ce type de compte */
  voiceMsg: VoiceMsgSettings;
}

let cache: Record<string, string> | null = null;
let cachedAt = 0;

async function all(): Promise<Record<string, string>> {
  if (cache && Date.now() - cachedAt < 30_000) return cache;
  try {
    const rows = await db('app_settings').select('key', 'value');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    cache = map;
  } catch {
    cache = {}; // table indisponible : valeurs par défaut
  }
  cachedAt = Date.now();
  return cache;
}

export function invalidateAppSettings(): void { cache = null; }

export function normalizeTier(tier: unknown): Tier {
  return TIERS.includes(tier as Tier) ? (tier as Tier) : 'guest';
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Lit trois réglages on/off (voix, vidéo, écran) ; valeur absente ou inconnue = défaut sûr */
function capMatrix(s: Record<string, string>, keyOf: (c: VoiceCap) => string, fallback: CapMatrix): CapMatrix {
  const read = (c: VoiceCap) => { const v = s[keyOf(c)]; return v === 'on' ? true : v === 'off' ? false : fallback[c]; };
  return { voice: read('voice'), video: read('video'), screen: read('screen') };
}

export const settingsService = {
  async get(key: string): Promise<string | undefined> {
    return (await all())[key];
  },

  /** Réglages applicables à un type de compte (inconnu ou visiteur anonyme = invité) */
  async forTier(rawTier: unknown): Promise<TierSettings> {
    const tier = normalizeTier(rawTier);
    const s = await all();
    const meta = s[`upload_metadata_mode_${tier}`];
    const rule = s[`history_rule_${tier}`];
    return {
      // Invités : aucun envoi d'image ; valeur inconnue = supprimées (sûr par défaut)
      metadataMode: tier !== 'guest' && (meta === 'keep' || meta === 'option') ? meta : 'strip',
      historyRule: rule === 'before_join' || rule === 'last' ? rule : 'all',
      historyLimit: intIn(s[`history_limit_${tier}`], SETTING_BOUNDS.history_limit.min, SETTING_BOUNDS.history_limit.max, 50),
      rateLimitMs: intIn(s[`rate_limit_ms_${tier}`], SETTING_BOUNDS.rate_limit_ms.min, SETTING_BOUNDS.rate_limit_ms.max, DEFAULT_RATE_MS[tier]),
      floodMaxPerMinute: intIn(s[`flood_max_per_minute_${tier}`], SETTING_BOUNDS.flood_max_per_minute.min, SETTING_BOUNDS.flood_max_per_minute.max, 5),
      storageQuotaBytes: tier === 'guest' ? 0
        : intIn(s[`storage_quota_mb_${tier}`], SETTING_BOUNDS.storage_quota_mb.min, SETTING_BOUNDS.storage_quota_mb.max, DEFAULT_QUOTA_MB[tier]) * 1024 * 1024,
      // Valeur inconnue : « option » (le membre choisit, rien n'est effacé sans son accord)
      deleteMode: DELETE_MODES.includes(s[`upload_delete_mode_${tier}`] as DeleteMode) ? (s[`upload_delete_mode_${tier}`] as DeleteMode) : 'option',
      // Valeur inconnue : 0 (rien n'expire : aucun fichier n'est effacé par erreur)
      uploadExpiryDays: tier === 'guest' ? 0
        : intIn(s[`upload_expiry_days_${tier}`], SETTING_BOUNDS.upload_expiry_days.min, SETTING_BOUNDS.upload_expiry_days.max, 0),
      // Valeur inconnue : pile d'écrans (la disposition par défaut)
      mobileLayout: MOBILE_LAYOUT_RULES.includes(s[`mobile_layout_${tier}`] as MobileLayoutRule)
        ? (s[`mobile_layout_${tier}`] as MobileLayoutRule) : DEFAULT_MOBILE_LAYOUT,
      voiceCaps: capMatrix(s, (c) => `voice_cap_${c}_${tier}`, DEFAULT_VOICE_CAP[tier]),
      voiceMax: intIn(s[`voice_max_${tier}`], SETTING_BOUNDS.voice_max.min, SETTING_BOUNDS.voice_max.max, DEFAULT_VOICE_MAX[tier]),
      // Valeur inconnue : « option » (chaque membre choisit) ; invités : en-tête par défaut
      voiceEntry: normalizeVoiceRule(s[`voice_entry_${tier}`]) ?? (tier === 'guest' ? 'header' : 'option'),
      voiceMsg: {
        allowed: s[`voicemsg_cap_${tier}`] === 'on' ? true : s[`voicemsg_cap_${tier}`] === 'off' ? false : DEFAULT_VOICEMSG[tier].allowed,
        maxSeconds: intIn(s[`voicemsg_max_seconds_${tier}`], SETTING_BOUNDS.voicemsg_max_seconds.min, SETTING_BOUNDS.voicemsg_max_seconds.max, DEFAULT_VOICEMSG[tier].maxSeconds),
        retentionDays: intIn(s[`voicemsg_retention_days_${tier}`], SETTING_BOUNDS.voicemsg_retention_days.min, SETTING_BOUNDS.voicemsg_retention_days.max, DEFAULT_VOICEMSG[tier].retentionDays),
        places: normalizeVoiceMsgPlaces(s[`voicemsg_entry_${tier}`]) ?? DEFAULT_VOICEMSG[tier].places,
      },
    };
  },

  /** Messages vocaux autorisés par type de salon (défaut : partout) */
  async voiceMsgRooms(): Promise<Record<RoomKind, boolean>> {
    const s = await all();
    const read = (r: RoomKind) => s[`voicemsg_room_${r}`] !== 'off';
    return { public: read('public'), private: read('private'), dm: read('dm') };
  },

  /** Mode général voix/vidéo réglé par l'admin (valeur inconnue = off : sûr par défaut) */
  async voiceMode(): Promise<VoiceMode> {
    const v = (await all())['voice_mode'];
    return VOICE_MODES.includes(v as VoiceMode) ? (v as VoiceMode) : 'off';
  },

  /** Ce que permet chaque type de salon (public, privé, message privé) */
  async voiceRooms(): Promise<Record<RoomKind, CapMatrix>> {
    const s = await all();
    return {
      public: capMatrix(s, (c) => `voice_room_${c}_public`, DEFAULT_VOICE_ROOM.public),
      private: capMatrix(s, (c) => `voice_room_${c}_private`, DEFAULT_VOICE_ROOM.private),
      dm: capMatrix(s, (c) => `voice_room_${c}_dm`, DEFAULT_VOICE_ROOM.dm),
    };
  },

  async lcenRetentionDays(): Promise<number> {
    const b = SETTING_BOUNDS.lcen_retention_days;
    return intIn((await all())['lcen_retention_days'], b.min, b.max, 365);
  },
};

/**
 * Contrôle une valeur envoyée par le panel. Renvoie la valeur normalisée, ou un message d'erreur.
 * Les clés sans règle particulière sont acceptées telles quelles (comportement historique).
 */
export function validateSettingUpdate(key: string, raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '').trim();
  const choice = (allowed: string[]) => allowed.includes(value)
    ? { ok: true as const, value }
    : { ok: false as const, error: `Valeur invalide pour ${key} (${allowed.join(' | ')})` };
  const integer = (min: number, max: number) => {
    const n = Number(value);
    return /^\d+$/.test(value) && n >= min && n <= max
      ? { ok: true as const, value: String(n) }
      : { ok: false as const, error: `Valeur invalide pour ${key} : nombre entier entre ${min} et ${max} attendu` };
  };

  if (key === 'lcen_last_purge') return { ok: false, error: 'Réglage en lecture seule' };
  if (/^upload_metadata_mode_(registered|premium)$/.test(key)) return choice(['strip', 'keep', 'option']);
  if (/^history_rule_(guest|registered|premium)$/.test(key)) return choice(['all', 'before_join', 'last']);
  if (/^history_limit_(guest|registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.history_limit.min, SETTING_BOUNDS.history_limit.max);
  if (/^rate_limit_ms_(guest|registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.rate_limit_ms.min, SETTING_BOUNDS.rate_limit_ms.max);
  if (/^flood_max_per_minute_(guest|registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.flood_max_per_minute.min, SETTING_BOUNDS.flood_max_per_minute.max);
  if (/^storage_quota_mb_(registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.storage_quota_mb.min, SETTING_BOUNDS.storage_quota_mb.max);
  if (/^upload_delete_mode_(registered|premium)$/.test(key)) return choice([...DELETE_MODES]);
  if (/^upload_expiry_days_(registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.upload_expiry_days.min, SETTING_BOUNDS.upload_expiry_days.max);
  if (/^mobile_layout_(guest|registered|premium)$/.test(key)) return choice([...MOBILE_LAYOUT_RULES]);
  if (key === 'voice_mode') return choice([...VOICE_MODES]);
  if (/^voice_cap_(voice|video|screen)_(guest|registered|premium)$/.test(key)) return choice(['on', 'off']);
  if (/^voice_room_(voice|video|screen)_(public|private|dm)$/.test(key)) return choice(['on', 'off']);
  if (/^voice_max_(guest|registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.voice_max.min, SETTING_BOUNDS.voice_max.max);
  if (/^voicemsg_cap_(guest|registered|premium)$/.test(key)) return choice(['on', 'off']);
  if (/^voicemsg_room_(public|private|dm)$/.test(key)) return choice(['on', 'off']);
  if (/^voicemsg_max_seconds_(guest|registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.voicemsg_max_seconds.min, SETTING_BOUNDS.voicemsg_max_seconds.max);
  if (/^voicemsg_retention_days_(guest|registered|premium)$/.test(key)) return integer(SETTING_BOUNDS.voicemsg_retention_days.min, SETTING_BOUNDS.voicemsg_retention_days.max);
  if (/^voicemsg_entry_(guest|registered|premium)$/.test(key)) {
    const p = normalizeVoiceMsgPlaces(value);
    return p ? { ok: true, value: p } : { ok: false, error: `Valeur invalide pour ${key} (none, ou : ${VOICEMSG_PLACES.join(', ')})` };
  }
  if (/^voice_entry_(guest|registered|premium)$/.test(key)) {
    const rule = normalizeVoiceRule(value);
    return rule ? { ok: true, value: rule } : { ok: false, error: `Valeur invalide pour ${key} (option, none, ou emplacements : ${VOICE_PLACES.join(', ')})` };
  }
  if (key === 'lcen_retention_days') return integer(SETTING_BOUNDS.lcen_retention_days.min, SETTING_BOUNDS.lcen_retention_days.max);
  return { ok: true, value };
}
