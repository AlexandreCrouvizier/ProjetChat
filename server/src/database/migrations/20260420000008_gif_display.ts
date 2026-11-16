/**
 * migrations/20260420000008_gif_display.ts
 *
 * - Colonne gif_display dans users : préférence personnelle (null = suit la règle admin)
 * - Clés dans app_settings : règle par tier + limite du picker
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Colonne préférence utilisateur
  await knex.schema.alterTable('users', (table) => {
    table.enu('gif_display', ['auto', 'click'])
      .nullable()
      .defaultTo(null)
      .comment('null = suit la règle admin du tier, auto = affichage direct, click = au clic');
  });

  // Règles admin par tier + limite picker
  await knex('app_settings').insert([
    {
      key:         'gif_display_guest',
      value:       'masked',
      description: 'Affichage GIF pour les invités : visible | masked | option',
      type:        'string',
    },
    {
      key:         'gif_display_registered',
      value:       'option',
      description: 'Affichage GIF pour les inscrits : visible | masked | option',
      type:        'string',
    },
    {
      key:         'gif_display_premium',
      value:       'visible',
      description: 'Affichage GIF pour les premium : visible | masked | option',
      type:        'string',
    },
    {
      key:         'gif_picker_limit',
      value:       '20',
      description: 'Nombre de GIFs chargés par requête dans le picker (8 à 48)',
      type:        'integer',
    },
  ]).onConflict('key').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('gif_display');
  });
  await knex('app_settings')
    .whereIn('key', ['gif_display_guest', 'gif_display_registered', 'gif_display_premium', 'gif_picker_limit'])
    .delete();
}
