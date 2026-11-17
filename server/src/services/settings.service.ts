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

/** Bornes de sécurité des réglages numériques */
export const SETTING_BOUNDS = {
  history_limit: { min: 0, max: 100000 },
  rate_limit_ms: { min: 200, max: 600000 },          // 0,2 s → 10 min
  flood_max_per_minute: { min: 1, max: 60 },
  lcen_retention_days: { min: 365, max: 3650 },      // 1 an (LCEN) → 10 ans
} as const;

const DEFAULT_RATE_MS: Record<Tier, number> = { guest: 10000, registered: 1000, premium: 500 };

export interface TierSettings {
  metadataMode: MetadataMode;
  historyRule: HistoryRule;
  historyLimit: number;
  rateLimitMs: number;
  floodMaxPerMinute: number;
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
  if (key === 'lcen_retention_days') return integer(SETTING_BOUNDS.lcen_retention_days.min, SETTING_BOUNDS.lcen_retention_days.max);
  return { ok: true, value };
}
