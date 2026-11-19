import type { Knex } from 'knex';

/**
 * Migration 16 — emplacements multiples des boutons d'appel
 *
 * `users.voice_entry` passe d'une énumération (header | members | both | none) à du texte :
 * une liste d'emplacements séparés par des virgules (header, members, composer, send, media) ou « none ».
 * Les anciennes valeurs restent valides (« both » est lu comme header,members). Contrôle fait par le serveur.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'voice_entry'))) return;
  await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_voice_entry_check');
  await knex.raw('ALTER TABLE users ALTER COLUMN voice_entry TYPE VARCHAR(60)');
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'voice_entry'))) return;
  await knex.raw(`UPDATE users SET voice_entry = NULL WHERE voice_entry NOT IN ('header','members','both','none')`);
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_voice_entry_check CHECK (voice_entry IN ('header','members','both','none'))`);
}
