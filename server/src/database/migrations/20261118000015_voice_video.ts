/**
 * migrations/20261118000015_voice_video.ts — Voix / vidéo / partage d'écran (Lot A : socle, sans LiveKit)
 *
 * Réglages admin (table app_settings) :
 *   voice_mode                      off | unavailable | on        (général ; défaut : off)
 *   voice_cap_<cap>_<tier>          on | off                      (par type de compte ET par fonction)
 *   voice_room_<cap>_<type>         on | off                      (par type de salon : public | private | dm)
 *   voice_max_<tier>                2 → 100                       (participants maximum par appel)
 *   voice_entry_<tier>              header | members | both | option   (où apparaissent les boutons)
 *   <cap> = voice | video | screen   (voix, vidéo, partage d'écran : réglables indépendamment)
 *
 * Par salon (colonnes de `groups`, null = suit le réglage du type de salon) :
 *   allow_voice / allow_video / allow_screen : on | off, voice_max_participants : entier ou null
 *
 * Par membre : users.voice_entry (header | members | both | none), utilisé si l'admin a mis « option ».
 *
 * Valeurs par défaut : tout est désactivé (voice_mode = off). Une fois activé : invités rien ;
 * inscrits voix ; Premium voix + vidéo + écran ; salons publics voix seulement (pas de vidéo à 30 personnes).
 */
import type { Knex } from 'knex';

const CAPS = ['voice', 'video', 'screen'] as const;
const TIERS = ['guest', 'registered', 'premium'] as const;
const ROOMS = ['public', 'private', 'dm'] as const;

const CAP_LABEL: Record<string, string> = { voice: 'la voix', video: 'la vidéo', screen: 'le partage d\'écran' };
const TIER_LABEL: Record<string, string> = { guest: 'invités', registered: 'inscrits', premium: 'Premium' };
const ROOM_LABEL: Record<string, string> = { public: 'salons publics', private: 'salons privés', dm: 'messages privés' };

function defaultCap(tier: string, cap: string): string {
  if (tier === 'guest') return 'off';
  if (tier === 'registered') return cap === 'voice' ? 'on' : 'off';
  return 'on';
}
function defaultRoom(room: string, cap: string): string {
  if (room === 'public') return cap === 'voice' ? 'on' : 'off';
  return 'on';
}

export function voiceSettingRows() {
  const rows: { key: string; value: string; description: string; type: string }[] = [
    { key: 'voice_mode', value: 'off', type: 'string', description: 'Voix / vidéo : off (boutons invisibles) | unavailable (boutons grisés) | on (activée)' },
  ];
  for (const t of TIERS) for (const c of CAPS) {
    rows.push({ key: `voice_cap_${c}_${t}`, value: defaultCap(t, c), type: 'string', description: `Autoriser ${CAP_LABEL[c]} pour les ${TIER_LABEL[t]} : on | off` });
  }
  for (const r of ROOMS) for (const c of CAPS) {
    rows.push({ key: `voice_room_${c}_${r}`, value: defaultRoom(r, c), type: 'string', description: `Autoriser ${CAP_LABEL[c]} dans les ${ROOM_LABEL[r]} : on | off` });
  }
  for (const t of TIERS) {
    rows.push({ key: `voice_max_${t}`, value: t === 'premium' ? '16' : '8', type: 'integer', description: `Participants maximum par appel pour les ${TIER_LABEL[t]} (2 à 100)` });
    rows.push({ key: `voice_entry_${t}`, value: t === 'guest' ? 'header' : 'option', type: 'string', description: `Boutons d'appel pour les ${TIER_LABEL[t]} : header | members | both | option` });
  }
  return rows;
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'voice_entry'))) {
    await knex.schema.alterTable('users', (table) => {
      table.enu('voice_entry', ['header', 'members', 'both', 'none']).nullable().defaultTo(null)
        .comment('Où le membre veut les boutons d\'appel (null = les deux), si le réglage admin du type de compte est « option »');
    });
  }
  for (const col of ['allow_voice', 'allow_video', 'allow_screen']) {
    if (!(await knex.schema.hasColumn('groups', col))) {
      await knex.schema.alterTable('groups', (table) => {
        table.enu(col, ['on', 'off']).nullable().defaultTo(null).comment('Dérogation du salon (null = suit le réglage du type de salon)');
      });
    }
  }
  if (!(await knex.schema.hasColumn('groups', 'voice_max_participants'))) {
    await knex.schema.alterTable('groups', (table) => {
      table.integer('voice_max_participants').nullable().defaultTo(null).comment('Participants maximum pour ce salon (null = réglage du type de compte)');
    });
  }
  await knex('app_settings').insert(voiceSettingRows()).onConflict('key').ignore();
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'voice_entry')) {
    await knex.schema.alterTable('users', (table) => { table.dropColumn('voice_entry'); });
  }
  for (const col of ['allow_voice', 'allow_video', 'allow_screen', 'voice_max_participants']) {
    if (await knex.schema.hasColumn('groups', col)) {
      await knex.schema.alterTable('groups', (table) => { table.dropColumn(col); });
    }
  }
  await knex('app_settings').whereIn('key', voiceSettingRows().map((r) => r.key)).delete();
}
