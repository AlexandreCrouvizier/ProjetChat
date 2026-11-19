import type { Knex } from 'knex';

/**
 * Migration 17 — messages vocaux
 *   - messages.type accepte « audio » ; messages.audio_duration_ms (durée annoncée, bornée par le serveur)
 *   - groups.allow_voicemsg : dérogation du salon (on / off / null = selon le type de salon)
 *   - réglages : voicemsg_cap_<tier>, voicemsg_room_<salon>, voicemsg_max_seconds_<tier>,
 *     voicemsg_retention_days_<tier>, voicemsg_entry_<tier>
 */
const TIERS = ['guest', 'registered', 'premium'] as const;
const ROOMS = ['public', 'private', 'dm'] as const;
const TIER_LABEL: Record<string, string> = { guest: 'invités', registered: 'inscrits', premium: 'Premium' };
const ROOM_LABEL: Record<string, string> = { public: 'salons publics', private: 'salons privés', dm: 'messages privés' };

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check');
  await knex.raw(`ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text','image','file','gif','system','audio'))`);
  if (!(await knex.schema.hasColumn('messages', 'audio_duration_ms'))) {
    await knex.schema.alterTable('messages', (t) => { t.integer('audio_duration_ms').nullable().comment('Message vocal : durée en ms'); });
  }
  if (!(await knex.schema.hasColumn('groups', 'allow_voicemsg'))) {
    await knex.schema.alterTable('groups', (t) => {
      t.enu('allow_voicemsg', ['on', 'off']).nullable().defaultTo(null).comment('Messages vocaux : dérogation du salon');
    });
  }
  const rows: { key: string; value: string; type: string; description: string }[] = [];
  for (const t of TIERS) {
    rows.push({ key: `voicemsg_cap_${t}`, value: t === 'guest' ? 'off' : 'on', type: 'string', description: `Messages vocaux pour les ${TIER_LABEL[t]} : on | off` });
    rows.push({ key: `voicemsg_max_seconds_${t}`, value: t === 'premium' ? '300' : t === 'registered' ? '60' : '30', type: 'integer', description: `Durée maximum d'un vocal (${TIER_LABEL[t]}, secondes, 5 à 600)` });
    rows.push({ key: `voicemsg_retention_days_${t}`, value: '30', type: 'integer', description: `Conservation des vocaux (${TIER_LABEL[t]}, jours, 0 = sans limite)` });
    rows.push({ key: `voicemsg_entry_${t}`, value: 'send', type: 'string', description: `Bouton 🎤 (${TIER_LABEL[t]}) : composer, send, media (plusieurs possibles) ou none` });
  }
  for (const r of ROOMS) rows.push({ key: `voicemsg_room_${r}`, value: 'on', type: 'string', description: `Messages vocaux dans les ${ROOM_LABEL[r]} : on | off` });
  for (const row of rows) {
    const exists = await knex('app_settings').where({ key: row.key }).first();
    if (!exists) await knex('app_settings').insert(row);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings').where('key', 'like', 'voicemsg\\_%').del();
  if (await knex.schema.hasColumn('groups', 'allow_voicemsg')) await knex.schema.alterTable('groups', (t) => { t.dropColumn('allow_voicemsg'); });
  if (await knex.schema.hasColumn('messages', 'audio_duration_ms')) await knex.schema.alterTable('messages', (t) => { t.dropColumn('audio_duration_ms'); });
  await knex('messages').where({ type: 'audio' }).update({ type: 'file' });
  await knex.raw('ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check');
  await knex.raw(`ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text','image','file','gif','system'))`);
}
