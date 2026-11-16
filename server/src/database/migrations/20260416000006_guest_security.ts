/**
 * migrations/20260416000006_guest_security.ts
 *
 * Tables pour la sécurité des invités :
 *   - Ajout colonne guest_fingerprint dans users
 *   - guest_ip_history  : historique IP par fingerprint
 *   - banned_fingerprints : fingerprints bannis + motif
 *   - banned_ips        : IPs permabannies (auto après 3 bans distincts)
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {

  // ── 1. Colonne fingerprint sur users ──────────────────────────────────────
  await knex.schema.alterTable('users', (table) => {
    // Identifiant persistant côté client (localStorage + cookie)
    table.string('guest_fingerprint', 80).nullable().unique();
  });

  // ── 2. Historique des IPs par fingerprint ─────────────────────────────────
  await knex.schema.createTable('guest_ip_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Le fingerprint (pas forcément un userId si le compte a été supprimé)
    table.string('fingerprint', 80).notNullable();

    // L'utilisateur associé (peut être NULL si compte supprimé)
    table.uuid('user_id').nullable()
         .references('id').inTable('users')
         .onDelete('SET NULL');

    table.specificType('ip_address', 'inet').notNullable();

    // Contexte de la visite
    table.string('user_agent', 500).nullable();
    table.timestamp('seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Un fingerprint ne logue la même IP qu'une fois par heure max
    table.unique(['fingerprint', 'ip_address']);
  });

  await knex.raw('CREATE INDEX idx_gip_fingerprint ON guest_ip_history (fingerprint)');
  await knex.raw('CREATE INDEX idx_gip_ip ON guest_ip_history (ip_address)');

  // ── 3. Fingerprints bannis ────────────────────────────────────────────────
  await knex.schema.createTable('banned_fingerprints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.string('fingerprint', 80).notNullable().unique();

    // L'utilisateur banni (snapshot du username au moment du ban)
    table.string('username_snapshot', 100).nullable();
    table.specificType('last_known_ip', 'inet').nullable();

    table.text('reason').nullable();
    table.boolean('is_permanent').notNullable().defaultTo(false);

    // Qui a banni (superadmin ou modérateur)
    table.string('banned_by', 100).nullable();

    table.timestamp('expires_at', { useTz: true }).nullable(); // NULL = permanent
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_bfp_fingerprint ON banned_fingerprints (fingerprint)');

  // ── 4. IPs permabannies ───────────────────────────────────────────────────
  await knex.schema.createTable('banned_ips', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.specificType('ip_address', 'inet').notNullable().unique();

    // Nombre de fingerprints distincts bannis sur cette IP (trigger auto à 3)
    table.integer('ban_count').notNullable().defaultTo(1);

    table.text('reason').nullable();
    table.boolean('is_auto').notNullable().defaultTo(true); // auto = déclenché par le système
    table.string('banned_by', 100).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_bips_ip ON banned_ips (ip_address)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('banned_ips');
  await knex.schema.dropTableIfExists('banned_fingerprints');
  await knex.schema.dropTableIfExists('guest_ip_history');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('guest_fingerprint');
  });
}
