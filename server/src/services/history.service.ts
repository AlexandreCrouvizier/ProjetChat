/**
 * services/history.service.ts — Historique visible d'un salon, selon le type de compte
 *
 * Réglage admin par type de compte (Panel → Paramètres → Historique des salons) :
 *   - all          : tout l'historique (comportement d'origine)
 *   - before_join  : les N messages qui précédaient la PREMIÈRE arrivée du compte dans le salon,
 *                    puis tout ce qui a été posté depuis (la limite est figée à l'arrivée)
 *   - last         : seulement les N derniers messages du salon (fenêtre glissante, à chaque visite)
 *
 * Seuls les messages « racines » comptent (pas les réponses de fil). Un fil est visible si son
 * message de départ l'est. Les citations d'un message hors de la fenêtre sont masquées.
 *
 * 🔐 Appliqué côté serveur (historique, fils, citations) : masquer côté client ne suffirait pas,
 * l'API renverrait quand même les anciens messages.
 *
 * Les comparaisons se font en SQL (sous-requêtes), sans repasser par des dates JavaScript
 * (précision à la milliseconde) : aucun message à la frontière n'est montré ou caché par erreur.
 */
import type { Knex } from 'knex';
import { db } from '../config/database';
import { settingsService, type HistoryRule } from './settings.service';

export interface HistoryWindow {
  /** true si une partie de l'historique est cachée à ce compte */
  limited: boolean;
  rule: HistoryRule;
  limit: number;
  /** Condition SQL sur messages.created_at (null = aucune restriction) */
  clause: { sql: string; bindings: unknown[] } | null;
}

const NO_LIMIT: HistoryWindow = { limited: false, rule: 'all', limit: 0, clause: null };

/** Messages racines visibles d'un salon (base des calculs) */
const ROOT = `m.group_id = ? AND m.parent_message_id IS NULL AND m.is_hidden = false`;

export const historyService = {
  /** Première arrivée d'un compte dans un salon (jamais remise à zéro) */
  async recordArrival(groupId: string, userId: string): Promise<void> {
    await db.raw(
      'INSERT INTO group_arrivals (group_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      [groupId, userId],
    );
  },

  /**
   * Fenêtre d'historique visible pour ce compte dans ce salon.
   * user absent = visiteur non connecté (traité comme un invité, sans date d'arrivée).
   */
  async windowFor(groupId: string, user?: { userId: string; tier: string } | null): Promise<HistoryWindow> {
    if (user) {
      const row = await db('users').where({ id: user.userId }).first('app_role');
      if (row?.app_role === 'superadmin') return NO_LIMIT; // modération : tout l'historique
    }
    const { historyRule, historyLimit } = await settingsService.forTier(user?.tier);
    if (historyRule === 'all') return NO_LIMIT;

    const base = { limited: true, rule: historyRule, limit: historyLimit };
    // Pas de date d'arrivée (visiteur non connecté) : « N avant l'arrivée » = les N derniers
    let arrival: { sql: string; bindings: unknown[] } | null = null;
    if (historyRule === 'before_join' && user) {
      await this.recordArrival(groupId, user.userId);
      arrival = {
        sql: '(SELECT first_seen_at FROM group_arrivals WHERE group_id = ? AND user_id = ?)',
        bindings: [groupId, user.userId],
      };
    }

    if (historyLimit === 0) {
      // Aucun ancien message : seulement ce qui est posté après l'arrivée (ou à partir de maintenant)
      return arrival
        ? { ...base, clause: { sql: `messages.created_at >= ${arrival.sql}`, bindings: arrival.bindings } }
        : {
            ...base,
            clause: {
              sql: `messages.created_at > COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE ${ROOT}), '-infinity'::timestamptz)`,
              bindings: [groupId],
            },
          };
    }

    // Le N-ième message (racine) le plus récent — avant l'arrivée, ou dans tout le salon
    const before = arrival ? ` AND m.created_at < ${arrival.sql}` : '';
    const boundary = await db.raw(
      `SELECT m.id FROM messages m WHERE ${ROOT}${before} ORDER BY m.created_at DESC OFFSET ? LIMIT 1`,
      [groupId, ...(arrival ? arrival.bindings : []), historyLimit - 1],
    );
    const boundaryId: string | undefined = boundary.rows?.[0]?.id;
    if (!boundaryId) {
      // Moins de N messages : rien n'est caché pour l'instant
      return { ...base, limited: false, clause: null };
    }
    return {
      ...base,
      clause: { sql: 'messages.created_at >= (SELECT created_at FROM messages WHERE id = ?)', bindings: [boundaryId] },
    };
  },

  /** Restreint une requête sur la table messages à la fenêtre visible */
  apply<T extends Knex.QueryBuilder>(query: T, window: HistoryWindow): T {
    if (window.clause) query.whereRaw(window.clause.sql, window.clause.bindings as any[]);
    return query;
  },

  /** Parmi ces messages, lesquels sont visibles ? */
  async visibleIds(ids: string[], window: HistoryWindow): Promise<Set<string>> {
    if (ids.length === 0 || !window.clause) return new Set(ids);
    const rows = await this.apply(db('messages').whereIn('messages.id', ids).select('messages.id'), window);
    return new Set(rows.map((r: { id: string }) => r.id));
  },
};
