/**
 * Migration — Ajout superadmin + TOTP
 * 
 * Ajoute à la table users :
 *   - app_role : 'user' | 'superadmin'
 *   - totp_secret : secret TOTP (null si pas configuré)
 *   - totp_enabled : true quand le TOTP a été vérifié
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Vérifier si les colonnes existent déjà (pour éviter les erreurs si re-run)
  const hasAppRole = await knex.schema.hasColumn('users', 'app_role');
  
  if (!hasAppRole) {
    await knex.schema.alterTable('users', (table) => {
      table.string('app_role', 20).notNullable().defaultTo('user');
      table.text('totp_secret').nullable();
      table.boolean('totp_enabled').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAppRole = await knex.schema.hasColumn('users', 'app_role');
  
  if (hasAppRole) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('app_role');
      table.dropColumn('totp_secret');
      table.dropColumn('totp_enabled');
    });
  }
}
