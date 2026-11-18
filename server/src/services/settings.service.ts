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

/** Bornes de sécurité des réglages numériques */
export const SETTING_BOUNDS = {
  history_limit: { min: 0, max: 100000 },
  rate_limit_ms: { min: 200, max: 600000 },          // 0,2 s → 10 min
  flood_max_per_minute: { min: 1, max: 60 },
  lcen_retention_days: { min: 365, max: 3650 },      // 1 an (LCEN) → 10 ans
  storage_quota_mb: { min: 0, max: 102400 },         // 0 (envoi désactivé) → 100 Go
  upload_expiry_days: { min: 0, max: 3650 },         // 0 (sans limite) → 10 ans
} as const;

const DEFAULT_RATE_MS: Record<Tier, number> = { guest: 10000, registered: 1000, premium: 500 };
const DEFAULT_QUOTA_MB: Record<Tier, number> = { guest: 0, registered: 200, premium: 2048 };

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
  if (key === 'lcen_retention_days') return integer(SETTING_BOUNDS.lcen_retention_days.min, SETTING_BOUNDS.lcen_retention_days.max);
  return { ok: true, value };
}
