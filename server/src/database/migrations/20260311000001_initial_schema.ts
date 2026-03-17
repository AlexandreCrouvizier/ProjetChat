/**
 * Migration 001 — Schéma initial (Phase 1)
 * 
 * Tables créées :
 *   - users          : Tous les utilisateurs (invités, inscrits, premium)
 *   - sessions       : Sessions actives (refresh tokens JWT)
 *   - groups         : Salons publics et groupes privés
 *   - group_members  : Adhésions aux groupes + rôles
 *   - messages       : Tous les messages (groupes + PV) — LCEN
 *   - audit_logs     : Logs de connexion et actions — LCEN (1 an)
 * 
 * Extensions PostgreSQL :
 *   - uuid-ossp   : Génération d'UUID v4
 *   - pgcrypto    : Chiffrement (pour plus tard)
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  
  // ===== EXTENSIONS =====
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ===== TABLE: users =====
  // C'est le cœur. Chaque personne qui utilise l'app a une entrée ici,
  // même les invités (tier = 'guest'). Le tier contrôle tout ce que
  // l'utilisateur peut faire (voir shared/constants.ts → TIER_LIMITS).
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Identité
    table.string('username', 30).notNullable().unique();
    table.string('email', 255).unique();              // NULL pour les invités
    table.string('password_hash', 255);                // NULL si OAuth

    // OAuth
    table.string('oauth_provider', 20);                // 'google', 'github'
    table.string('oauth_id', 255);                     // ID chez le provider
    
    // Tier : détermine les permissions (guest, registered, premium)
    // C'est LE champ le plus important pour la logique métier
    table.enu('tier', ['guest', 'registered', 'premium'])
         .notNullable()
         .defaultTo('registered');

    // Profil (Phase 2 pour avatar/bio, mais on crée les colonnes maintenant)
    table.string('avatar_url', 500);
    table.string('bio', 500);
    table.string('status_text', 100);
    table.string('status_emoji', 10);

    // Badges donateurs (Phase 4, mais la colonne est prête)
    table.enu('donor_badge', ['none', 'supporter', 'mecene', 'fondateur'])
         .notNullable()
         .defaultTo('none');

    // Préférences
    table.enu('theme', ['light', 'dark']).notNullable().defaultTo('dark');
    table.string('chat_color', 7);           // Premium : couleur hex
    table.string('notification_sound', 50);  // Premium : son custom

    // Modération
    table.boolean('is_banned').notNullable().defaultTo(false);
    table.text('ban_reason');
    table.timestamp('ban_expires_at', { useTz: true });  // NULL = permanent
    table.boolean('is_muted').notNullable().defaultTo(false);
    table.timestamp('mute_expires_at', { useTz: true });

    // Tracking (LCEN : on doit savoir qui s'est connecté quand et d'où)
    table.timestamp('last_seen_at', { useTz: true });
    table.specificType('last_ip', 'inet');               // Type PostgreSQL natif pour les IP

    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Index sur users
  // L'index unique sur (oauth_provider, oauth_id) évite les doublons OAuth
  await knex.raw(`
    CREATE UNIQUE INDEX idx_users_oauth 
    ON users (oauth_provider, oauth_id) 
    WHERE oauth_provider IS NOT NULL
  `);
  // Index sur le tier pour filtrer rapidement (ex: lister les premium)
  await knex.raw('CREATE INDEX idx_users_tier ON users (tier)');
  // Index sur last_seen pour trier par activité
  await knex.raw('CREATE INDEX idx_users_last_seen ON users (last_seen_at)');


  // ===== TABLE: sessions =====
  // Stocke les refresh tokens JWT. Quand un utilisateur se connecte,
  // il reçoit un access token (15min, pas stocké en BDD) et un refresh
  // token (7j, stocké ici sous forme de hash). Le refresh token permet
  // de demander un nouvel access token sans se reconnecter.
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.uuid('user_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');  // Si le user est supprimé, ses sessions aussi

    table.string('refresh_token_hash', 255).notNullable();  // JAMAIS le token en clair
    table.specificType('ip_address', 'inet').notNullable();  // LCEN
    table.text('user_agent');  // Navigateur/OS pour identifier l'appareil

    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_sessions_user ON sessions (user_id)');
  await knex.raw('CREATE INDEX idx_sessions_expires ON sessions (expires_at)');


  // ===== TABLE: groups =====
  // Un "salon" dans l'interface. Peut être public (visible et rejoignable
  // par tous) ou privé (sur invitation). Le champ last_message_at est
  // crucial pour le système d'auto-suppression des salons inactifs.
  await knex.schema.createTable('groups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.string('name', 100).notNullable();
    table.string('description', 500);
    table.enu('type', ['public', 'private']).notNullable().defaultTo('public');

    // Créateur du salon (SET NULL si le compte est supprimé, le salon reste)
    table.uuid('creator_id')
         .references('id').inTable('users')
         .onDelete('SET NULL');

    // Les salons officiels ne sont jamais auto-supprimés
    table.boolean('is_official').notNullable().defaultTo(false);
    
    // Statut pour le système d'auto-suppression en 3 étapes
    table.enu('status', ['active', 'inactive', 'archived'])
         .notNullable()
         .defaultTo('active');

    table.text('rules');  // Règles du salon (Phase 3)
    table.integer('max_members');
    
    // Compteur dénormalisé — évite un COUNT(*) sur group_members à chaque affichage
    table.integer('member_count').notNullable().defaultTo(0);

    // Dates clés pour l'auto-suppression
    table.timestamp('last_message_at', { useTz: true });     // Reset à chaque message
    table.timestamp('inactive_since', { useTz: true });       // Quand le salon est passé inactif

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_groups_type_status ON groups (type, status)');
  await knex.raw('CREATE INDEX idx_groups_creator ON groups (creator_id)');
  await knex.raw('CREATE INDEX idx_groups_last_msg ON groups (last_message_at)');


  // ===== TABLE: group_members =====
  // Table de liaison N:N entre users et groups, avec un rôle.
  // Le rôle détermine ce que le membre peut faire dans le groupe
  // (creator > admin > moderator > member).
  await knex.schema.createTable('group_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.uuid('group_id').notNullable()
         .references('id').inTable('groups')
         .onDelete('CASCADE');

    table.uuid('user_id').notNullable()
         .references('id').inTable('users')
         .onDelete('CASCADE');

    table.enu('role', ['creator', 'admin', 'moderator', 'member'])
         .notNullable()
         .defaultTo('member');

    table.boolean('is_muted').notNullable().defaultTo(false);  // Notifs désactivées pour ce groupe
    table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Un utilisateur ne peut être membre d'un groupe qu'une seule fois
    table.unique(['group_id', 'user_id']);
  });

  await knex.raw('CREATE INDEX idx_gm_user ON group_members (user_id)');
  await knex.raw('CREATE INDEX idx_gm_role ON group_members (group_id, role)');


  // ===== TABLE: messages =====
  // LA table la plus importante. Stocke TOUS les messages : groupes ET
  // conversations privées. Chaque message a obligatoirement une IP (LCEN).
  // 
  // Points clés :
  //   - group_id OU conversation_id est rempli (jamais les deux)
  //   - parent_message_id = thread (message enfant d'un thread)
  //   - reply_to_id = quote/reply (répond à un message spécifique)
  //   - is_hidden = soft delete (le message reste en BDD pour LCEN)
  await knex.schema.createTable('messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    table.text('content').notNullable();

    // Auteur (SET NULL si le compte est supprimé, le message reste pour LCEN)
    table.uuid('author_id')
         .references('id').inTable('users')
         .onDelete('SET NULL');

    // Destination : groupe OU conversation privée (jamais les deux)
    table.uuid('group_id')
         .references('id').inTable('groups')
         .onDelete('CASCADE');

    // conversation_id sera ajouté dans une migration Phase 2
    // Pour l'instant, tous les messages sont dans des groupes

    // Thread et Reply
    table.uuid('parent_message_id')
         .references('id').inTable('messages')
         .onDelete('SET NULL');

    table.uuid('reply_to_id')
         .references('id').inTable('messages')
         .onDelete('SET NULL');

    // Type de message
    table.enu('type', ['text', 'image', 'file', 'gif', 'system'])
         .notNullable()
         .defaultTo('text');

    // Médias (Phase 4)
    table.string('file_url', 500);
    table.string('gif_url', 500);
    table.jsonb('link_preview');  // {title, description, image, url}

    // Messages éphémères (Phase 5, Premium)
    table.boolean('is_ephemeral').notNullable().defaultTo(false);
    table.integer('ephemeral_ttl');  // Durée en secondes
    table.timestamp('expires_at', { useTz: true });

    // Modération
    table.boolean('is_pinned').notNullable().defaultTo(false);
    table.boolean('is_hidden').notNullable().defaultTo(false);  // Soft delete
    table.string('hidden_reason', 255);

    // ⚠️ LCEN — OBLIGATOIRE : IP de l'auteur à chaque message
    table.specificType('ip_address', 'inet').notNullable();

    table.timestamp('edited_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Index composites pour les requêtes les plus fréquentes :
  // "Donne-moi les messages du groupe X, triés par date décroissante"
  await knex.raw('CREATE INDEX idx_msg_group ON messages (group_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_msg_author ON messages (author_id)');
  await knex.raw('CREATE INDEX idx_msg_parent ON messages (parent_message_id)');
  await knex.raw('CREATE INDEX idx_msg_created ON messages (created_at)');

  // Index partiel : uniquement sur les messages éphémères (économise de l'espace)
  await knex.raw(`
    CREATE INDEX idx_msg_ephemeral ON messages (expires_at) 
    WHERE is_ephemeral = true
  `);

  // Index full-text pour la recherche dans les messages (Phase 5)
  // tsvector transforme le texte en tokens recherchables
  // 'french' = dictionnaire français (gère les accents, stop words, etc.)
  await knex.raw(`
    CREATE INDEX idx_msg_search ON messages 
    USING GIN (to_tsvector('french', content))
  `);


  // ===== TABLE: audit_logs =====
  // Obligation LCEN : conserver les données de connexion pendant 1 AN.
  // Cette table enregistre TOUT : connexions, envois de messages,
  // inscriptions, actions de modération, etc.
  // 
  // BIGSERIAL car cette table va devenir TRÈS volumineuse.
  // Un cron job quotidien purgera les entrées > 1 an.
  await knex.schema.createTable('audit_logs', (table) => {
    table.bigIncrements('id').primary();  // BIGSERIAL, pas UUID (volume)

    table.uuid('user_id')
         .references('id').inTable('users')
         .onDelete('SET NULL');

    // Action : login, logout, register, message_send, message_delete, 
    //          ban, mute, report, etc.
    table.string('action', 50).notNullable();

    // ⚠️ LCEN — IP obligatoire
    table.specificType('ip_address', 'inet').notNullable();
    table.text('user_agent');

    // Données supplémentaires (flexible grâce au JSONB)
    // Ex: { "group_id": "uuid", "message_id": "uuid" }
    table.jsonb('metadata');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_audit_user ON audit_logs (user_id)');
  await knex.raw('CREATE INDEX idx_audit_action ON audit_logs (action)');
  await knex.raw('CREATE INDEX idx_audit_created ON audit_logs (created_at)');
  await knex.raw('CREATE INDEX idx_audit_ip ON audit_logs (ip_address)');


  // ===== TRIGGER : updated_at automatique =====
  // Cette fonction met à jour automatiquement le champ updated_at
  // à chaque UPDATE sur une ligne. Plus besoin de le faire manuellement.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Applique le trigger sur les tables qui ont un updated_at
  for (const tableName of ['users', 'groups']) {
    await knex.raw(`
      CREATE TRIGGER trg_${tableName}_updated_at
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at()
    `);
  }
}


// ===== ROLLBACK =====
// Si la migration échoue ou qu'on veut revenir en arrière
export async function down(knex: Knex): Promise<void> {
  // Suppression dans l'ordre inverse (à cause des foreign keys)
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('group_members');
  await knex.schema.dropTableIfExists('groups');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('users');

  // Supprime le trigger
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at CASCADE');
}
