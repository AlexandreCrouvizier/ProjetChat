/**
 * migrations/20260415000005_app_settings.ts — Phase 4.1c
 *
 * Table clé-valeur pour les paramètres globaux de l'application,
 * gérables depuis le panel admin sans redémarrage du serveur.
 *
 * Valeurs initiales : paramètres de compression d'images.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('app_settings', (table) => {
    table.string('key', 100).primary();
    table.text('value').notNullable();
    table.string('description', 300);
    table.string('type', 20).notNullable().defaultTo('string'); // string | boolean | integer
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Valeurs par défaut — compression images
  await knex('app_settings').insert([
    {
      key:         'compression_enabled',
      value:       'true',
      description: 'Activer la compression et conversion WebP des images uploadées',
      type:        'boolean',
    },
    {
      key:         'compression_quality',
      value:       '82',
      description: 'Qualité WebP (1-100). 82 = bon équilibre qualité/taille.',
      type:        'integer',
    },
    {
      key:         'compression_max_px',
      value:       '1920',
      description: 'Résolution maximale (px) pour les utilisateurs standard',
      type:        'integer',
    },
    {
      key:         'compression_max_px_premium',
      value:       '2560',
      description: 'Résolution maximale (px) pour les utilisateurs Premium',
      type:        'integer',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_settings');
}
