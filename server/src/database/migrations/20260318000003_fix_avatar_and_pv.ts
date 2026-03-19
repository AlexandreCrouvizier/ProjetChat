/**
 * Migration 003 — Fix avatar_url + PV hide/show
 * 
 * - avatar_url : varchar(500) → TEXT (base64 images are 100K+ chars)
 * - conversation_participants : ajout colonne is_hidden (masquer un PV sans le supprimer)
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Fix avatar_url : base64 data URLs font 100K+ caractères, varchar(500) est trop petit
  await knex.schema.alterTable('users', (table) => {
    table.text('avatar_url_new');
  });
  // Copier les données existantes
  await knex.raw('UPDATE users SET avatar_url_new = avatar_url');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('avatar_url');
  });
  await knex.schema.alterTable('users', (table) => {
    table.renameColumn('avatar_url_new', 'avatar_url');
  });

  // PV : ajout is_hidden pour masquer une conversation sans la supprimer
  // Quand l'utilisateur clique ✕, is_hidden = true
  // Quand l'autre envoie un message, is_hidden = false (la conv réapparaît)
  await knex.schema.alterTable('conversation_participants', (table) => {
    table.boolean('is_hidden').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversation_participants', (table) => {
    table.dropColumn('is_hidden');
  });
  // On ne peut pas revenir à varchar(500) sans perdre les données longues
}
