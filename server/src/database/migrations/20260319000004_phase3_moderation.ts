/**
 * Migration 004 — Phase 3 : Modération + Gestion de groupes
 * 
 * Tables créées :
 *   - reports             : Signalements de messages par les utilisateurs
 *   - moderation_actions  : Historique des actions de modération (mute, ban, warn, kick)
 *   - blocked_users       : Blocages entre utilisateurs
 *   - invitations         : Invitations par lien pour les salons privés
 * 
 * Colonnes ajoutées :
 *   - groups.invite_code  : Code d'invitation unique pour les salons privés
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {

  // ===== TABLE: reports =====
  // Quand un utilisateur signale un message, une entrée est créée ici.
  // Les modérateurs voient les signalements en attente dans le dashboard.
  // Si un message atteint 3 signalements → masqué automatiquement.
  await knex.schema.createTable('reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Le message signalé
    table.uuid('message_id').notNullable()
         .references('id').inTable('messages')
         .onDelete('CASCADE');

    // L'auteur du message signalé (dénormalisé pour faciliter le dashboard)
    table.uuid('reported_user_id')
         .references('id').inTable('users')
         .onDelete('SET NULL');

    // L'utilisateur qui signale
    table.uuid('reporter_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    // Le salon concerné (pour le contexte)
    table.uuid('group_id')
         .references('id').inTable('groups')
         .onDelete('SET NULL');

    table.uuid('conversation_id')
         .references('id').inTable('conversations')
         .onDelete('SET NULL');

    // Motif du signalement
    table.enu('reason', [
      'spam',           // Spam / pub
      'harassment',     // Harcèlement
      'hate_speech',    // Discours haineux
      'nsfw',           // Contenu inapproprié
      'misinformation', // Désinformation
      'other',          // Autre (précisé dans reason_text)
    ]).notNullable();

    table.text('reason_text');  // Détail optionnel du signalement

    // Statut du signalement
    table.enu('status', ['pending', 'reviewed', 'actioned', 'dismissed'])
         .notNullable()
         .defaultTo('pending');

    // Modérateur qui a traité le signalement
    table.uuid('reviewed_by')
         .references('id').inTable('users')
         .onDelete('SET NULL');

    table.text('review_note');  // Note du modérateur
    table.timestamp('reviewed_at', { useTz: true });

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Un utilisateur ne peut signaler un même message qu'une seule fois
  await knex.raw('CREATE UNIQUE INDEX idx_reports_unique ON reports (message_id, reporter_id)');
  await knex.raw('CREATE INDEX idx_reports_status ON reports (status)');
  await knex.raw('CREATE INDEX idx_reports_message ON reports (message_id)');
  await knex.raw('CREATE INDEX idx_reports_reported_user ON reports (reported_user_id)');
  await knex.raw('CREATE INDEX idx_reports_created ON reports (created_at DESC)');


  // ===== TABLE: moderation_actions =====
  // Historique complet des actions de modération. 
  // Permet de tracer qui a fait quoi, quand, et pourquoi.
  // Conservé 1 an (LCEN).
  await knex.schema.createTable('moderation_actions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // L'utilisateur ciblé par l'action
    table.uuid('target_user_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    // Le modérateur qui a effectué l'action
    table.uuid('moderator_id')
         .references('id').inTable('users')
         .onDelete('SET NULL');

    // Type d'action
    table.enu('action', [
      'warn',       // Avertissement
      'mute',       // Mute (ne peut plus envoyer de messages)
      'unmute',     // Démute
      'kick',       // Expulsé d'un salon
      'ban',        // Banni de la plateforme
      'unban',      // Débanni
      'hide_message', // Message masqué
    ]).notNullable();

    // Contexte (salon concerné, null si action globale)
    table.uuid('group_id')
         .references('id').inTable('groups')
         .onDelete('SET NULL');

    // Durée (null = permanent)
    table.string('duration', 20);  // '30m', '1h', '24h', '7d', '30d', 'permanent'
    table.timestamp('expires_at', { useTz: true });  // Calculé à partir de duration

    table.text('reason').notNullable();

    // Lien vers le signalement si l'action découle d'un report
    table.uuid('report_id')
         .references('id').inTable('reports')
         .onDelete('SET NULL');

    // IP du modérateur (traçabilité LCEN)
    table.specificType('ip_address', 'inet');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_mod_actions_target ON moderation_actions (target_user_id)');
  await knex.raw('CREATE INDEX idx_mod_actions_moderator ON moderation_actions (moderator_id)');
  await knex.raw('CREATE INDEX idx_mod_actions_type ON moderation_actions (action)');
  await knex.raw('CREATE INDEX idx_mod_actions_expires ON moderation_actions (expires_at) WHERE expires_at IS NOT NULL');


  // ===== TABLE: blocked_users =====
  // Quand A bloque B :
  //   - A ne voit plus les messages de B
  //   - B ne peut plus envoyer de DM à A
  //   - B ne sait pas qu'il est bloqué
  await knex.schema.createTable('blocked_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // L'utilisateur qui bloque
    table.uuid('blocker_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    // L'utilisateur bloqué
    table.uuid('blocked_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // On ne peut bloquer quelqu'un qu'une seule fois
    table.unique(['blocker_id', 'blocked_id']);
  });

  await knex.raw('CREATE INDEX idx_blocked_blocker ON blocked_users (blocker_id)');
  await knex.raw('CREATE INDEX idx_blocked_blocked ON blocked_users (blocked_id)');


  // ===== TABLE: invitations =====
  // Liens d'invitation pour les salons privés.
  // Un code unique (6 chars) est généré, accessible via /invite/CODE.
  // Peut expirer ou avoir un nombre max d'utilisations.
  await knex.schema.createTable('invitations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.uuid('group_id').notNullable()
         .references('id').inTable('groups')
         .onDelete('CASCADE');

    // L'utilisateur qui a créé l'invitation
    table.uuid('created_by').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    // Code unique d'invitation (ex: "aB3kZ9")
    table.string('code', 20).notNullable().unique();

    // Limites
    table.integer('max_uses');          // null = illimité
    table.integer('use_count').notNullable().defaultTo(0);
    table.timestamp('expires_at', { useTz: true });  // null = n'expire pas

    table.boolean('is_active').notNullable().defaultTo(true);

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_invitations_code ON invitations (code) WHERE is_active = true');
  await knex.raw('CREATE INDEX idx_invitations_group ON invitations (group_id)');


  // ===== COLONNE AJOUTÉE : groups.invite_code =====
  // Code d'invitation permanent du salon (comme Discord)
  await knex.schema.alterTable('groups', (table) => {
    table.string('invite_code', 20).unique();
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('invite_code');
  });
  await knex.schema.dropTableIfExists('invitations');
  await knex.schema.dropTableIfExists('blocked_users');
  await knex.schema.dropTableIfExists('moderation_actions');
  await knex.schema.dropTableIfExists('reports');
}
