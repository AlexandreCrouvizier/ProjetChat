/**
 * migrations/20261118000012_files_gallery_thumbs.ts — Galerie des fichiers, miniatures, quotas réglables
 *
 * 1. uploads : miniature (thumb_url), dimensions (width, height), retrait de la galerie par son auteur
 *    (hidden_by_owner_at : le fichier reste visible dans les messages et compte toujours dans le quota).
 * 2. messages.media_removed : image/fichier effacé après coup (« author » = par son auteur,
 *    « moderation » = par l'administrateur). Le message reste, le média n'est plus servi.
 * 3. Réglages par type de compte (Panel → Paramètres) :
 *      storage_quota_mb_<tier>      : quota de stockage (avant : fixé dans shared/constants.ts)
 *      upload_delete_mode_<tier>    : que se passe-t-il quand un membre supprime un fichier déjà posté
 *        gallery_only | erase | erase_messages | block | option
 * 4. Miniatures (400 px, WebP, sans métadonnées) des images déjà envoyées.
 *
 * ⚠️ À lancer depuis server/ (npm run migrate) : les fichiers sont dans server/uploads/.
 */
import type { Knex } from 'knex';
import fs from 'fs';
import path from 'path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const THUMB_DIR = path.join(UPLOAD_ROOT, 'thumbs');
const IMAGE_URL_RE = /^\/uploads\/images\/([0-9a-f-]{36})\.(webp|jpe?g|png|gif)$/i;

let sharp: any = null;
try { sharp = require('sharp'); } catch { /* miniatures générées plus tard */ }

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('uploads', (table) => {
    table.string('thumb_url', 200).nullable();
    table.integer('width').nullable();
    table.integer('height').nullable();
    table.timestamp('hidden_by_owner_at', { useTz: true }).nullable();
  });
  await knex.schema.alterTable('messages', (table) => {
    table.string('media_removed', 20).nullable();
  });

  const rows: { key: string; value: string; description: string; type: string }[] = [
    { key: 'storage_quota_mb_registered', value: '200', type: 'integer', description: 'Quota de stockage des comptes inscrits (Mo)' },
    { key: 'storage_quota_mb_premium', value: '2048', type: 'integer', description: 'Quota de stockage des comptes Premium (Mo)' },
    { key: 'upload_delete_mode_registered', value: 'option', type: 'string', description: 'Suppression d\'un fichier déjà posté (inscrits) : gallery_only | erase | erase_messages | block | option' },
    { key: 'upload_delete_mode_premium', value: 'option', type: 'string', description: 'Suppression d\'un fichier déjà posté (Premium) : gallery_only | erase | erase_messages | block | option' },
  ];
  await knex('app_settings').insert(rows).onConflict('key').ignore();

  // Miniatures des images existantes (non bloquant : une image illisible garde simplement l'original)
  if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
  const images = await knex('uploads').where({ kind: 'image' }).whereNull('deleted_at').select('id', 'url');
  let done = 0;
  for (const img of images) {
    const m = IMAGE_URL_RE.exec(img.url);
    if (!m || !sharp) continue;
    const source = path.join(UPLOAD_ROOT, 'images', path.basename(img.url));
    if (!fs.existsSync(source)) continue;
    try {
      const meta = await sharp(source, { limitInputPixels: 100_000_000 }).metadata();
      const thumbUrl = `/uploads/thumbs/${m[1]}.webp`;
      await sharp(source, { limitInputPixels: 100_000_000, pages: 1 }).rotate()
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72 }).toFile(path.join(THUMB_DIR, `${m[1]}.webp`));
      await knex('uploads').where({ id: img.id }).update({
        thumb_url: thumbUrl, width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null,
      });
      done++;
    } catch { /* image illisible : pas de miniature */ }
  }
  if (images.length) console.log(`   🖼️  Miniatures : ${done}/${images.length} image(s)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings').whereIn('key', [
    'storage_quota_mb_registered', 'storage_quota_mb_premium',
    'upload_delete_mode_registered', 'upload_delete_mode_premium',
  ]).delete();
  await knex.schema.alterTable('messages', (table) => { table.dropColumn('media_removed'); });
  await knex.schema.alterTable('uploads', (table) => {
    table.dropColumn('thumb_url'); table.dropColumn('width'); table.dropColumn('height'); table.dropColumn('hidden_by_owner_at');
  });
  // Les fichiers de miniatures restent sur le disque (sans effet) : dossier uploads/thumbs à supprimer à la main si besoin
}
