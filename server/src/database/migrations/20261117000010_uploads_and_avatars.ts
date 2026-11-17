/**
 * migrations/20261117000010_uploads_and_avatars.ts — Traçabilité des fichiers + avatars en fichiers
 *
 * 1. Table `uploads` : chaque fichier envoyé (image, fichier, avatar) est rattaché à son auteur,
 *    avec son IP et la date (obligation LCEN : pouvoir identifier qui a publié un contenu).
 *    Sert aussi au quota de stockage et à vérifier qu'un message n'utilise que SES propres fichiers.
 * 2. Fichiers déjà envoyés : retrouvés à partir des messages (auteur, IP, date, taille sur le disque).
 * 4. Métadonnées des images (EXIF : position GPS, appareil, date) : réglage admin `upload_metadata_mode`
 *    = strip (supprimées, défaut) | keep (conservées) | option (chaque membre choisit, colonne
 *    `users.keep_upload_metadata`, null = supprimées).
 * 3. Avatars : avant, l'image était stockée en base64 dans `users.avatar_url` (jusqu'à 700 Ko,
 *    renvoyée avec CHAQUE message) ou pointait vers un site externe (traçage d'IP des lecteurs).
 *    → converties en fichiers WebP 256×256 dans uploads/avatars/ ; les URLs externes sont retirées.
 *
 * ⚠️ À lancer depuis server/ (npm run migrate) : les fichiers sont dans server/uploads/.
 */
import type { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
const LOCAL_MEDIA_RE = /^\/uploads\/(images|files)\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i;

function sizeOnDisk(url: string): number {
  try { return fs.statSync(path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ''))).size; } catch { return 0; }
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('uploads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    // Conservé même si le compte est supprimé (SET NULL + pseudo figé) : traçabilité LCEN
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('username_snapshot', 100).nullable();
    table.string('kind', 10).notNullable();             // image | file | avatar
    table.string('url', 200).notNullable().unique();     // /uploads/images/<uuid>.webp
    table.string('original_name', 255).nullable();
    table.string('mime_type', 100).nullable();
    table.bigInteger('size_bytes').notNullable().defaultTo(0);
    table.specificType('ip_address', 'inet').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true }).nullable(); // fichier effacé du disque (la trace reste)
  });
  await knex.raw('CREATE INDEX idx_uploads_user_active ON uploads (user_id) WHERE deleted_at IS NULL');

  // ── 4. Métadonnées des images : réglage admin + choix du membre ──────────
  await knex.schema.alterTable('users', (table) => {
    table.boolean('keep_upload_metadata').nullable().defaultTo(null)
      .comment('Choix du membre si upload_metadata_mode = option (null/false = supprimées)');
  });
  await knex('app_settings').insert({
    key: 'upload_metadata_mode',
    value: 'strip',
    description: 'Métadonnées (EXIF : GPS, appareil, date) des images envoyées : strip | keep | option',
    type: 'string',
  }).onConflict('key').ignore();

  // ── 2. Fichiers déjà envoyés dans des messages ────────────────────────────
  const media = await knex('messages as m')
    .leftJoin('users as u', 'u.id', 'm.author_id')
    .whereIn('m.type', ['image', 'file'])
    .whereNotNull('m.file_url')
    .orderBy('m.created_at', 'asc')
    .select('m.file_url', 'm.type', 'm.author_id', 'm.ip_address', 'm.created_at', 'u.username');
  const seen = new Set<string>();
  for (const m of media) {
    if (seen.has(m.file_url) || !LOCAL_MEDIA_RE.test(m.file_url)) continue;
    seen.add(m.file_url);
    await knex('uploads').insert({
      user_id: m.author_id,
      username_snapshot: m.username,
      kind: m.type,
      url: m.file_url,
      size_bytes: sizeOnDisk(m.file_url),
      ip_address: m.ip_address,
      created_at: m.created_at,
    }).onConflict('url').ignore();
  }

  // ── 3. Avatars base64 → fichiers ; URLs externes retirées ─────────────────
  const users = await knex('users').whereNotNull('avatar_url').select('id', 'username', 'avatar_url', 'last_ip');
  if (users.length) fs.mkdirSync(AVATAR_DIR, { recursive: true });
  let sharp: any = null;
  try { sharp = require('sharp'); } catch { /* sans sharp : avatars base64 simplement retirés */ }

  for (const u of users) {
    const value: string = u.avatar_url || '';
    if (/^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/.test(value)) continue; // déjà au bon format
    let newUrl: string | null = null;
    const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
    if (match && sharp) {
      try {
        const name = `${crypto.randomUUID()}.webp`;
        const out = path.join(AVATAR_DIR, name);
        await sharp(Buffer.from(match[2], 'base64'), { limitInputPixels: 50_000_000 })
          .rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toFile(out);
        newUrl = `/uploads/avatars/${name}`;
        await knex('uploads').insert({
          user_id: u.id, username_snapshot: u.username, kind: 'avatar', url: newUrl,
          original_name: 'avatar (converti)', mime_type: 'image/webp',
          size_bytes: fs.statSync(out).size, ip_address: u.last_ip || null,
        });
      } catch {
        newUrl = null; // image illisible → avatar retiré
      }
    }
    await knex('users').where({ id: u.id }).update({ avatar_url: newUrl });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Les avatars restent des fichiers (le format /uploads/avatars/… reste lisible par l'ancienne version)
  await knex.schema.dropTableIfExists('uploads');
  await knex('app_settings').where({ key: 'upload_metadata_mode' }).delete();
  await knex.schema.alterTable('users', (table) => { table.dropColumn('keep_upload_metadata'); });
}
