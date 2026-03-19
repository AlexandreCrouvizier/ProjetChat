/**
 * Migration 002 — Phase 2 : Expérience sociale
 * 
 * Nouvelles tables :
 *   - conversations               : Conversations privées (1 to 1)
 *   - conversation_participants   : Participants d'une conversation + accusés de lecture
 *   - reactions                    : Réactions emoji sur les messages
 * 
 * Modifications :
 *   - messages : ajout colonne conversation_id (messages privés)
 *   - messages : ajout contrainte CHECK (group_id OU conversation_id, pas les deux)
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {

  // ===== TABLE: conversations =====
  // Une conversation privée entre 2 utilisateurs.
  // Contrairement aux groupes, une conversation n'a pas de nom ni de rôles.
  // Elle est créée automatiquement quand un utilisateur clique sur le pseudo d'un autre.
  await knex.schema.createTable('conversations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Dernier message envoyé — pour trier la liste des conversations par activité
    table.timestamp('last_message_at', { useTz: true });
  });

  await knex.raw('CREATE INDEX idx_conv_last_msg ON conversations (last_message_at DESC)');

  // Trigger updated_at automatique
  await knex.raw(`
    CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at()
  `);


  // ===== TABLE: conversation_participants =====
  // Table de liaison entre conversations et users (toujours 2 participants).
  // Stocke aussi le "last_read_at" pour les accusés de lecture (✓✓).
  // 
  // Quand Paul ouvre la conversation avec John :
  //   → On met à jour last_read_at de Paul dans cette conversation
  //   → John voit que ses messages sont passés à ✓✓ (lus)
  await knex.schema.createTable('conversation_participants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.uuid('conversation_id').notNullable()
         .references('id').inTable('conversations')
         .onDelete('CASCADE');

    table.uuid('user_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    // Qui a initié la conversation ?
    // Important pour la règle : un invité ne peut recevoir un PV que si un B/C l'initie
    table.boolean('is_initiator').notNullable().defaultTo(false);

    // Accusé de lecture : date du dernier message lu par ce participant
    // Tous les messages créés avant cette date sont considérés comme "lus" (✓✓)
    table.timestamp('last_read_at', { useTz: true });

    // Notifications de cette conversation désactivées ?
    table.boolean('is_muted').notNullable().defaultTo(false);

    table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Un utilisateur ne peut participer qu'une fois à une conversation
    table.unique(['conversation_id', 'user_id']);
  });

  await knex.raw('CREATE INDEX idx_cp_user ON conversation_participants (user_id)');
  await knex.raw('CREATE INDEX idx_cp_conv ON conversation_participants (conversation_id)');


  // ===== TABLE: reactions =====
  // Réactions emoji sur les messages.
  // Un utilisateur ne peut réagir qu'une fois avec le même emoji sur le même message.
  // Toggle : si la réaction existe déjà → on la supprime.
  // 
  // Invités (tier A) : uniquement 👍 et 👎
  // Inscrits (tier B/C) : tous les emojis
  await knex.schema.createTable('reactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.uuid('message_id').notNullable()
         .references('id').inTable('messages')
         .onDelete('CASCADE');

    table.uuid('user_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    // L'emoji (ex: 👍, ❤️, 🔥)
    table.string('emoji', 20).notNullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Un utilisateur ne peut réagir qu'une fois avec le même emoji sur le même message
    table.unique(['message_id', 'user_id', 'emoji']);
  });

  await knex.raw('CREATE INDEX idx_reactions_message ON reactions (message_id)');
  await knex.raw('CREATE INDEX idx_reactions_user ON reactions (user_id)');


  // ===== MODIFICATION: messages — ajout conversation_id =====
  // Jusqu'ici les messages étaient uniquement dans des groupes.
  // Maintenant un message peut être dans un groupe OU dans une conversation privée.
  await knex.schema.alterTable('messages', (table) => {
    table.uuid('conversation_id')
         .references('id').inTable('conversations')
         .onDelete('CASCADE');
  });

  // Index pour charger l'historique d'une conversation privée
  await knex.raw('CREATE INDEX idx_msg_conv ON messages (conversation_id, created_at DESC)');

  // Contrainte CHECK : un message doit être dans un groupe OU une conversation, pas les deux
  // group_id est nullable (déjà en Phase 1), conversation_id aussi
  // Mais l'un des deux doit être rempli
  await knex.raw(`
    ALTER TABLE messages ADD CONSTRAINT chk_msg_target
    CHECK (
      (group_id IS NOT NULL AND conversation_id IS NULL) OR
      (group_id IS NULL AND conversation_id IS NOT NULL)
    )
  `);
}


// ===== ROLLBACK =====
export async function down(knex: Knex): Promise<void> {
  // Supprimer la contrainte CHECK d'abord
  await knex.raw('ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_msg_target');

  // Supprimer l'index et la colonne
  await knex.raw('DROP INDEX IF EXISTS idx_msg_conv');
  await knex.schema.alterTable('messages', (table) => {
    table.dropColumn('conversation_id');
  });

  // Supprimer les tables (ordre inverse des FK)
  await knex.schema.dropTableIfExists('reactions');
  await knex.schema.dropTableIfExists('conversation_participants');
  await knex.schema.dropTableIfExists('conversations');
}
