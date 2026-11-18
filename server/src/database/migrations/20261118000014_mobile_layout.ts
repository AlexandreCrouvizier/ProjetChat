/**
 * migrations/20261118000014_mobile_layout.ts — Disposition de l'écran sur téléphone / tablette
 *
 * - Réglage admin par type de compte : mobile_layout_<tier> = stack | tabs | drawers | option
 *     stack   : pile d'écrans (liste des salons → discussion plein écran)
 *     tabs    : onglets en bas (Salons · Messages · Discussion · Moi)
 *     drawers : tiroirs latéraux (discussion plein écran, salons à gauche, membres à droite)
 *     option  : le membre choisit dans son profil (pile d'écrans par défaut)
 * - users.mobile_layout : choix du membre (null = disposition par défaut), utilisé seulement si l'admin a mis « option »
 */
import type { Knex } from 'knex';

const KEYS = ['mobile_layout_guest', 'mobile_layout_registered', 'mobile_layout_premium'];

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'mobile_layout'))) {
    await knex.schema.alterTable('users', (table) => {
      table.enu('mobile_layout', ['stack', 'tabs', 'drawers'])
        .nullable()
        .defaultTo(null)
        .comment('Disposition choisie sur téléphone (null = par défaut), si le réglage admin du type de compte est « option »');
    });
  }

  await knex('app_settings').insert([
    { key: 'mobile_layout_guest', value: 'stack', description: 'Disposition sur téléphone pour les invités : stack | tabs | drawers | option', type: 'string' },
    { key: 'mobile_layout_registered', value: 'option', description: 'Disposition sur téléphone pour les inscrits : stack | tabs | drawers | option', type: 'string' },
    { key: 'mobile_layout_premium', value: 'option', description: 'Disposition sur téléphone pour les Premium : stack | tabs | drawers | option', type: 'string' },
  ]).onConflict('key').ignore();
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('users', 'mobile_layout')) {
    await knex.schema.alterTable('users', (table) => { table.dropColumn('mobile_layout'); });
  }
  await knex('app_settings').whereIn('key', KEYS).delete();
}
