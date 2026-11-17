/**
 * migrations/20261118000013_uploads_dedup_expiry.ts — Doublons, expiration, motif d'effacement
 *
 * 1. uploads.content_hash : empreinte SHA-256 du fichier reçu (+ réglages de traitement). Si un membre renvoie
 *    exactement le même fichier, le serveur réutilise celui qu'il a déjà au lieu de le stocker une 2ᵉ fois
 *    (double clic sur « Envoyer », même photo envoyée deux fois…).
 * 2. uploads.deleted_reason : pourquoi le fichier a été effacé (author | moderation | expired | replaced).
 * 3. Expiration des fichiers par type de compte (Panel → Paramètres → Fichiers des membres) :
 *    upload_expiry_days_<tier> (0 = conservés sans limite). Passé ce délai, le fichier est effacé
 *    automatiquement et les messages affichent « Image expirée ».
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('uploads', (table) => {
    table.string('content_hash', 64).nullable();
    table.string('deleted_reason', 20).nullable();
  });
  await knex.raw('CREATE INDEX idx_uploads_user_hash ON uploads (user_id, content_hash) WHERE deleted_at IS NULL AND content_hash IS NOT NULL');
  await knex('app_settings').insert([
    { key: 'upload_expiry_days_registered', value: '0', type: 'integer', description: 'Durée de conservation des fichiers des inscrits, en jours (0 = sans limite)' },
    { key: 'upload_expiry_days_premium', value: '0', type: 'integer', description: 'Durée de conservation des fichiers Premium, en jours (0 = sans limite)' },
  ]).onConflict('key').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings').whereIn('key', ['upload_expiry_days_registered', 'upload_expiry_days_premium']).delete();
  await knex.raw('DROP INDEX IF EXISTS idx_uploads_user_hash');
  await knex.schema.alterTable('uploads', (table) => { table.dropColumn('content_hash'); table.dropColumn('deleted_reason'); });
}
