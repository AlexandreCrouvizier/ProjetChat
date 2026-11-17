/**
 * migrations/20261117000009_guest_secret.ts — Reconnexion des invités par secret serveur
 *
 * 🔐 Avant : l'empreinte navigateur (fp_…, générée par le navigateur et lisible par JavaScript)
 * servait aussi de « clé » : la connaître suffisait pour reprendre le compte invité de quelqu'un.
 * Maintenant : à sa création, l'invité reçoit un secret aléatoire dans un cookie httpOnly ;
 * la base n'en garde que l'empreinte SHA-256 (guest_secret_hash).
 *
 * L'empreinte navigateur reste utilisée pour la sécurité (bans, historique d'IP), mais n'est plus
 * unique : un même appareil peut avoir eu plusieurs comptes invités (cookie perdu, etc.).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('guest_secret_hash', 64).nullable().unique();
  });
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['guest_fingerprint']);
    table.index(['guest_fingerprint'], 'idx_users_guest_fingerprint');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['guest_fingerprint'], 'idx_users_guest_fingerprint');
    table.dropColumn('guest_secret_hash');
  });
  // ⚠️ Échoue si plusieurs comptes partagent la même empreinte (à nettoyer avant un retour arrière)
  await knex.schema.alterTable('users', (table) => {
    table.unique(['guest_fingerprint']);
  });
}
