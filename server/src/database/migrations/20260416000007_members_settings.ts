/**
 * migrations/20260416000007_members_settings.ts — Phase 4.1g
 *
 * Ajoute dans app_settings les paramètres de la liste des membres :
 *   - members_hide_offline_guests  : masquer les invités déconnectés (toutes listes)
 *   - members_offline_ttl_minutes  : durée max (en minutes) d'affichage hors-ligne
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('app_settings').insert([
    {
      key:         'members_hide_offline_guests',
      value:       'false',
      description: 'Masquer les invités déconnectés dans toutes les listes de membres',
      type:        'boolean',
    },
    {
      key:         'members_offline_ttl_minutes',
      value:       '10',
      description: 'Durée max (en minutes) pendant laquelle un membre déconnecté reste visible',
      type:        'integer',
    },
  ]).onConflict('key').ignore(); // idempotent
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings')
    .whereIn('key', ['members_hide_offline_guests', 'members_offline_ttl_minutes'])
    .delete();
}
