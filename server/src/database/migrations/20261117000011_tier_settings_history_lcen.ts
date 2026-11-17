/**
 * migrations/20261117000011_tier_settings_history_lcen.ts — Réglages par type de compte, historique, LCEN
 *
 * 1. Métadonnées des images : le réglage global `upload_metadata_mode` devient un réglage PAR TYPE
 *    de compte (`upload_metadata_mode_registered`, `upload_metadata_mode_premium`), initialisé avec
 *    l'ancienne valeur. Les invités ne peuvent pas envoyer d'images.
 * 2. Historique visible à l'arrivée dans un salon, par type de compte :
 *    `history_rule_<tier>` = all | before_join | last ; `history_limit_<tier>` = nombre de messages.
 *    Table `group_arrivals` : date de la PREMIÈRE arrivée d'un compte dans un salon
 *    (jamais remise à zéro : quitter puis revenir ne redonne pas accès à plus d'historique).
 * 3. Délais entre deux messages (`rate_limit_ms_<tier>`) et nombre maximum de messages par minute
 *    dans un même salon (`flood_max_per_minute_<tier>`), par type de compte.
 * 4. LCEN : durée de conservation des traces (`lcen_retention_days`, 365 j minimum) et compte rendu
 *    de la dernière purge. Les colonnes IP des messages et du journal deviennent effaçables (NULL).
 */
import type { Knex } from 'knex';

const TIERS = ['guest', 'registered', 'premium'] as const;

export async function up(knex: Knex): Promise<void> {
  // ── 1. Métadonnées par type de compte (reprend l'ancien réglage global) ─────
  const old = await knex('app_settings').where({ key: 'upload_metadata_mode' }).first('value');
  const previous = ['strip', 'keep', 'option'].includes(old?.value) ? old.value : 'strip';
  const rows: { key: string; value: string; description: string; type: string }[] = [];
  for (const tier of ['registered', 'premium']) {
    rows.push({
      key: `upload_metadata_mode_${tier}`, value: previous, type: 'string',
      description: `Métadonnées (EXIF) des images envoyées par les comptes ${tier} : strip | keep | option`,
    });
  }

  // ── 2. Historique visible à l'arrivée (défaut : tout, comme avant) ───────────
  for (const tier of TIERS) {
    rows.push({
      key: `history_rule_${tier}`, value: 'all', type: 'string',
      description: `Historique visible (${tier}) : all | before_join | last`,
    });
    rows.push({
      key: `history_limit_${tier}`, value: '50', type: 'integer',
      description: `Nombre de messages d'historique visibles (${tier})`,
    });
  }

  // ── 3. Délais et anti-flood (mêmes valeurs qu'avant) ─────────────────────────
  const delays: Record<string, number> = { guest: 10000, registered: 1000, premium: 500 };
  for (const tier of TIERS) {
    rows.push({
      key: `rate_limit_ms_${tier}`, value: String(delays[tier]), type: 'integer',
      description: `Délai minimum entre deux messages (${tier}), en millisecondes`,
    });
    rows.push({
      key: `flood_max_per_minute_${tier}`, value: '5', type: 'integer',
      description: `Messages maximum par minute dans un même salon (${tier})`,
    });
  }

  // ── 4. LCEN ──────────────────────────────────────────────────────────────────
  rows.push({
    key: 'lcen_retention_days', value: '365', type: 'integer',
    description: 'Durée de conservation des traces (IP, journaux), en jours (365 minimum)',
  });
  rows.push({
    key: 'lcen_last_purge', value: '', type: 'string',
    description: 'Compte rendu de la dernière purge automatique (lecture seule)',
  });

  await knex('app_settings').insert(rows).onConflict('key').ignore();
  await knex('app_settings').where({ key: 'upload_metadata_mode' }).delete();

  await knex.schema.createTable('group_arrivals', (table) => {
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('first_seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(['group_id', 'user_id']);
  });
  // Les membres actuels sont « arrivés » à leur date d'adhésion
  await knex.raw(`
    INSERT INTO group_arrivals (group_id, user_id, first_seen_at)
    SELECT group_id, user_id, MIN(joined_at) FROM group_members GROUP BY group_id, user_id
    ON CONFLICT DO NOTHING
  `);

  await knex.raw('ALTER TABLE messages ALTER COLUMN ip_address DROP NOT NULL');
  await knex.raw('ALTER TABLE audit_logs ALTER COLUMN ip_address DROP NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  const reg = await knex('app_settings').where({ key: 'upload_metadata_mode_registered' }).first('value');
  await knex('app_settings').insert({
    key: 'upload_metadata_mode', value: reg?.value || 'strip', type: 'string',
    description: 'Métadonnées (EXIF : GPS, appareil, date) des images envoyées : strip | keep | option',
  }).onConflict('key').ignore();
  await knex('app_settings').where('key', 'like', 'upload_metadata_mode_%').delete();
  await knex('app_settings').where('key', 'like', 'history_%').delete();
  await knex('app_settings').where('key', 'like', 'rate_limit_ms_%').delete();
  await knex('app_settings').where('key', 'like', 'flood_max_per_minute_%').delete();
  await knex('app_settings').whereIn('key', ['lcen_retention_days', 'lcen_last_purge']).delete();
  await knex.schema.dropTableIfExists('group_arrivals');
  // Les IP effacées par la purge ne peuvent pas être restaurées : valeur neutre avant de remettre NOT NULL
  await knex.raw(`UPDATE messages SET ip_address = '0.0.0.0' WHERE ip_address IS NULL`);
  await knex.raw(`UPDATE audit_logs SET ip_address = '0.0.0.0' WHERE ip_address IS NULL`);
  await knex.raw('ALTER TABLE messages ALTER COLUMN ip_address SET NOT NULL');
  await knex.raw('ALTER TABLE audit_logs ALTER COLUMN ip_address SET NOT NULL');
}
