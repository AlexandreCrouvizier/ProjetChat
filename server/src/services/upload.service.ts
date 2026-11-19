/**
 * services/upload.service.ts — Fichiers envoyés : stockage, traçabilité, quota, avatars
 *
 * 🔐 Chaque fichier (image de message, fichier premium, avatar) est enregistré dans la table `uploads`
 * avec son auteur, son IP et sa date (LCEN). Cela permet aussi :
 *   - un quota de stockage par compte (réglable par type de compte : Panel → Paramètres) ;
 *   - de n'accepter dans un message QUE les fichiers envoyés par son auteur.
 * Les avatars sont des fichiers WebP 256×256 (plus de base64 en base, plus d'URL externe).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { settingsService, MEMBER_DELETE_CHOICES, type DeleteMode } from './settings.service';

let sharp: any = null;
try { sharp = require('sharp'); } catch { /* traitement d'image indisponible */ }

export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
export const IMAGE_DIR = path.join(UPLOAD_ROOT, 'images');
export const FILE_DIR = path.join(UPLOAD_ROOT, 'files');
export const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
export const PREVIEW_DIR = path.join(UPLOAD_ROOT, 'previews'); // images d'aperçu de liens (copiées par le serveur)
export const THUMB_DIR = path.join(UPLOAD_ROOT, 'thumbs');
export const AUDIO_DIR = path.join(UPLOAD_ROOT, 'audio');      // messages vocaux     // miniatures 400 px des images envoyées
for (const dir of [UPLOAD_ROOT, IMAGE_DIR, FILE_DIR, AVATAR_DIR, PREVIEW_DIR, THUMB_DIR, AUDIO_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export type UploadKind = 'image' | 'file' | 'avatar' | 'audio';

export const AVATAR_SIZE_PX = 256;
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;   // 5 Mo avant traitement
export const AVATAR_URL_RE = /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/;
const REMOTE_AVATAR_HOSTS = ['googleusercontent.com', 'avatars.githubusercontent.com']; // photos de profil Google / GitHub uniquement

export class InvalidImageError extends Error {}

export class QuotaExceededError extends Error {
  constructor(public used: number, public quota: number) {
    super(quota === 0
      ? 'L\'envoi de fichiers est réservé aux membres inscrits.'
      : `Espace de stockage plein (${readableSize(used)} utilisés sur ${readableSize(quota)}).`);
  }
}

export function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

/** Nom d'origine nettoyé (affichage / traçabilité) : pas de chemin, pas de caractères de contrôle */
export function sanitizeOriginalName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = path.basename(name).replace(/[\u0000-\u001f\u007f<>"\\]/g, '').trim();
  return clean ? clean.slice(0, 255) : null;
}

// ── Métadonnées des images (EXIF : position GPS, appareil, date…) ──────────
export type MetadataMode = 'strip' | 'keep' | 'option';
export const METADATA_MODES: MetadataMode[] = ['strip', 'keep', 'option'];

/** Réglage admin (app_settings.upload_metadata_mode) ; toute valeur inconnue = supprimer (sûr par défaut) */
export function parseMetadataMode(value: unknown): MetadataMode {
  return METADATA_MODES.includes(value as MetadataMode) ? (value as MetadataMode) : 'strip';
}

/** Quota de stockage du type de compte (Panel → Paramètres ; invités : 0) */
async function quotaFor(tier: string): Promise<number> {
  return (await settingsService.forTier(tier)).storageQuotaBytes;
}

export const THUMB_SIZE_PX = 400;
const IMAGE_URL_RE = /^\/uploads\/images\/([0-9a-f-]{36})\.(webp|jpe?g|png|gif)$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Erreur « métier » des opérations sur les fichiers (code HTTP + message lisible) */
export class UploadActionError extends Error {
  constructor(public status: number, message: string, public code = 'UPLOAD_ACTION') { super(message); }
}

/** Ce que voit un membre dans sa galerie (jamais l'IP) */
function galleryItem(row: any, expiryDays = 0) {
  return {
    expires_at: expiryDays > 0 && row.created_at
      ? new Date(new Date(row.created_at).getTime() + expiryDays * 86_400_000).toISOString() : null,
    id: row.id, kind: row.kind, url: row.url, thumb_url: row.thumb_url || null,
    original_name: row.original_name, mime_type: row.mime_type, size_bytes: Number(row.size_bytes || 0),
    width: row.width ?? null, height: row.height ?? null, created_at: row.created_at,
    uses: Number(row.uses || 0),
  };
}

/** Nombre de messages (encore visibles, média non retiré) qui utilisent ce fichier */
const USES_SQL = `(SELECT COUNT(*) FROM messages m WHERE m.file_url = uploads.url AND m.is_hidden = false AND m.media_removed IS NULL)`;

export type DeletedReason = 'author' | 'moderation' | 'expired' | 'replaced';

/** Empreinte d'un fichier reçu + réglages qui changent le résultat (deux envois identiques → même empreinte) */
export function contentHash(filePath: string, processing: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).update(`|${processing}`).digest('hex');
  } catch { return null; }
}

function fileFromUrl(url: string): string {
  return path.join(UPLOAD_ROOT, url.replace(/^\/uploads\//, ''));
}

export const uploadService = {
  /**
   * Faut-il CONSERVER les métadonnées des images de cet utilisateur ?
   * keep → oui ; strip → non ; option → seulement si le membre l'a explicitement demandé.
   */
  async shouldKeepMetadata(userId: string, mode: MetadataMode): Promise<boolean> {
    if (mode === 'keep') return true;
    if (mode !== 'option') return false;
    const row = await db('users').where({ id: userId }).first('keep_upload_metadata');
    return row?.keep_upload_metadata === true;
  },

  /** Octets occupés par les fichiers encore présents de cet utilisateur */
  async storageUsed(userId: string): Promise<number> {
    const row = await db('uploads').where({ user_id: userId }).whereNull('deleted_at')
      .sum({ total: 'size_bytes' }).first();
    return Number((row as any)?.total || 0);
  },

  async quotaStatus(userId: string, tier: string) {
    const used = await this.storageUsed(userId);
    const quota = await quotaFor(tier);
    return { used, quota, used_readable: readableSize(used), quota_readable: readableSize(quota) };
  },

  /** 🔐 Refuse l'envoi si le quota du compte serait dépassé */
  async assertQuota(userId: string, tier: string, incomingBytes: number): Promise<void> {
    const quota = await quotaFor(tier);
    const used = await this.storageUsed(userId);
    if (used + incomingBytes > quota) throw new QuotaExceededError(used, quota);
  },

  /** Enregistre un fichier envoyé (auteur, IP, date, taille) */
  async record(data: {
    userId: string; username?: string; kind: UploadKind; url: string;
    originalName?: unknown; mimeType?: string; sizeBytes: number; ip?: string;
    thumbUrl?: string | null; width?: number | null; height?: number | null; contentHash?: string | null;
  }): Promise<void> {
    await db('uploads').insert({
      user_id: data.userId,
      username_snapshot: data.username ?? null,
      kind: data.kind,
      url: data.url,
      original_name: sanitizeOriginalName(data.originalName),
      mime_type: data.mimeType ?? null,
      size_bytes: data.sizeBytes,
      ip_address: data.ip || null,
      thumb_url: data.thumbUrl ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      content_hash: data.contentHash ?? null,
    });
  },

  /**
   * Miniature d'une image envoyée : WebP 400 px max, sans métadonnées, première image d'un GIF.
   * Échec = pas de miniature (le client affiche alors l'image d'origine). Ne compte pas dans le quota.
   */
  async makeThumbnail(imageUrl: string): Promise<{ thumbUrl: string | null; width: number | null; height: number | null }> {
    const m = IMAGE_URL_RE.exec(imageUrl);
    if (!m || !sharp) return { thumbUrl: null, width: null, height: null };
    const source = path.join(IMAGE_DIR, path.basename(imageUrl));
    try {
      const meta = await sharp(source, { limitInputPixels: 100_000_000 }).metadata();
      await sharp(source, { limitInputPixels: 100_000_000, pages: 1 }).rotate()
        .resize(THUMB_SIZE_PX, THUMB_SIZE_PX, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72 }).toFile(path.join(THUMB_DIR, `${m[1]}.webp`));
      // Dimensions affichées (orientation EXIF appliquée : largeur/hauteur échangées si besoin)
      const swap = (meta.orientation ?? 1) >= 5;
      const w = meta.width ?? null, h = meta.pageHeight ?? meta.height ?? null;
      return { thumbUrl: `/uploads/thumbs/${m[1]}.webp`, width: swap ? h : w, height: swap ? w : h };
    } catch (error: any) {
      logger.warn(`Miniature impossible pour ${imageUrl} : ${error?.message || error}`);
      return { thumbUrl: null, width: null, height: null };
    }
  },

  /** 🔐 Ce fichier a-t-il été envoyé par cet utilisateur (et existe-t-il encore) ? */
  async isOwnUpload(url: string, userId: string, kind: UploadKind): Promise<boolean> {
    const row = await db('uploads').where({ url, user_id: userId, kind }).whereNull('deleted_at').first('id');
    return !!row;
  },

  /** Efface le fichier du disque ; la trace (auteur, IP, date) reste en base */
  async markDeleted(url: string, reason: DeletedReason = 'author'): Promise<void> {
    try { fs.unlinkSync(fileFromUrl(url)); } catch { /* déjà absent */ }
    const row = await db('uploads').where({ url }).first('thumb_url');
    if (row?.thumb_url) { try { fs.unlinkSync(fileFromUrl(row.thumb_url)); } catch { /* déjà absente */ } }
    await db('uploads').where({ url }).whereNull('deleted_at').update({ deleted_at: db.fn.now(), deleted_reason: reason });
  },

  /**
   * Fichier identique déjà envoyé par ce membre (même contenu, mêmes réglages de traitement) et toujours en ligne ?
   * → on le réutilise au lieu d'en stocker une 2ᵉ copie (double clic sur « Envoyer », même photo renvoyée…).
   * S'il avait été retiré de la galerie, il y revient.
   */
  async findDuplicate(userId: string, kind: 'image' | 'file', contentHash: string) {
    const row = await db('uploads').where({ user_id: userId, kind, content_hash: contentHash }).whereNull('deleted_at')
      .orderBy('created_at', 'desc').first('id', 'url', 'thumb_url', 'size_bytes', 'mime_type', 'hidden_by_owner_at');
    if (!row) return null;
    if (!fs.existsSync(fileFromUrl(row.url))) return null; // fichier disparu du disque : on stocke la nouvelle copie
    if (row.hidden_by_owner_at) await db('uploads').where({ id: row.id }).update({ hidden_by_owner_at: null });
    return row as { id: string; url: string; thumb_url: string | null; size_bytes: number; mime_type: string | null };
  },

  /**
   * Expiration : fichiers (images et fichiers, pas les avatars) plus anciens que la durée de conservation
   * du type de compte de leur auteur → effacés, messages « expiré ». Retourne le nombre de fichiers effacés.
   */
  async expireOld(io?: any): Promise<number> {
    let total = 0;
    for (const tier of ['registered', 'premium'] as const) {
      const days = (await settingsService.forTier(tier)).uploadExpiryDays;
      if (!days) continue;
      const rows = await db('uploads').join('users', 'uploads.user_id', 'users.id')
        .where('users.tier', tier).whereIn('uploads.kind', ['image', 'file']).whereNull('uploads.deleted_at')
        .whereRaw(`uploads.created_at < now() - (? || ' days')::interval`, [String(days)])
        .select('uploads.url').limit(500);
      for (const r of rows) {
        await this.removeFromMessages(r.url, 'expired', false, io);
        await this.markDeleted(r.url, 'expired');
        total++;
      }
    }
    // Messages vocaux : durée de conservation propre à chaque type de compte (invités compris)
    for (const tier of ['guest', 'registered', 'premium'] as const) {
      const days = (await settingsService.forTier(tier)).voiceMsg.retentionDays;
      if (!days) continue;
      const rows = await db('uploads').join('users', 'uploads.user_id', 'users.id')
        .where('users.tier', tier).where('uploads.kind', 'audio').whereNull('uploads.deleted_at')
        .whereRaw(`uploads.created_at < now() - (? || ' days')::interval`, [String(days)])
        .select('uploads.url').limit(500);
      for (const r of rows) {
        await this.removeFromMessages(r.url, 'expired', false, io);
        await this.markDeleted(r.url, 'expired');
        total++;
      }
    }
    if (total > 0) logger.info(`⌛ Fichiers expirés effacés : ${total}`);
    return total;
  },

  // ════════════════════════════════════════════════════════════════════════
  // Galerie « Mes fichiers » (membre)
  // ════════════════════════════════════════════════════════════════════════

  /** Fichiers d'un membre (images et fichiers, hors avatars, hors fichiers effacés ou retirés de sa galerie) */
  async gallery(userId: string, opts: { kind?: unknown; before?: unknown; limit?: unknown; tier?: string }) {
    const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
    const q = db('uploads').where({ user_id: userId }).whereNull('deleted_at').whereNull('hidden_by_owner_at')
      .whereIn('kind', opts.kind === 'image' || opts.kind === 'file' ? [opts.kind] : ['image', 'file'])
      .select('uploads.*', db.raw(`${USES_SQL} AS uses`))
      .orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit + 1);
    if (typeof opts.before === 'string' && UUID_RE.test(opts.before)) {
      q.whereRaw('(created_at, id) < (SELECT created_at, id FROM uploads WHERE id = ?)', [opts.before]);
    }
    const rows = await q;
    const expiryDays = opts.tier ? (await settingsService.forTier(opts.tier)).uploadExpiryDays : 0;
    return { items: rows.slice(0, limit).map((r: any) => galleryItem(r, expiryDays)), has_more: rows.length > limit };
  },

  /**
   * Compteurs de la galerie : éléments, place occupée / quota, taille moyenne d'un envoi
   * et estimation du nombre d'envois encore possibles à ce rythme.
   */
  async galleryStats(userId: string, tier: string) {
    const [active] = await db('uploads').where({ user_id: userId }).whereNull('deleted_at')
      .select(
        db.raw(`COUNT(*) FILTER (WHERE kind IN ('image','file') AND hidden_by_owner_at IS NULL) AS count`),
        db.raw(`COALESCE(SUM(size_bytes), 0) AS used`),
        db.raw(`COALESCE(SUM(size_bytes) FILTER (WHERE hidden_by_owner_at IS NOT NULL), 0) AS hidden_bytes`),
      );
    // Taille moyenne des 100 derniers envois (images et fichiers, y compris effacés depuis : c'est l'habitude du membre)
    const avgRow = await db.raw(
      `SELECT COALESCE(AVG(size_bytes), 0) AS avg FROM (SELECT size_bytes FROM uploads WHERE user_id = ? AND kind IN ('image','file') ORDER BY created_at DESC LIMIT 100) t`,
      [userId],
    );
    const settings = await settingsService.forTier(tier);
    const used = Number((active as any)?.used || 0);
    const quota = settings.storageQuotaBytes;
    const average = Math.round(Number(avgRow.rows?.[0]?.avg || 0));
    const free = Math.max(0, quota - used);
    return {
      count: Number((active as any)?.count || 0),
      used_bytes: used,
      hidden_bytes: Number((active as any)?.hidden_bytes || 0),
      quota_bytes: quota,
      average_bytes: average,
      remaining_estimate: average > 0 ? Math.floor(free / average) : null,
      delete_mode: settings.deleteMode,
      delete_choices: settings.deleteMode === 'option' ? MEMBER_DELETE_CHOICES : [],
      expiry_days: settings.uploadExpiryDays,
    };
  },

  /**
   * Retire le média des messages qui l'utilisent.
   * hide = true : les messages sont masqués (trace LCEN conservée), sinon « média supprimé ».
   * Prévient en temps réel les salons / conversations concernés.
   */
  async removeFromMessages(url: string, reason: 'author' | 'moderation' | 'expired', hide: boolean, io?: any): Promise<number> {
    const affected: Array<{ id: string; group_id: string | null; conversation_id: string | null; parent_message_id: string | null }> =
      await db('messages').where({ file_url: url, is_hidden: false }).whereNull('media_removed')
        .update(hide
          ? { media_removed: reason, is_hidden: true, hidden_reason: reason === 'author' ? 'Supprimé par son auteur (avec le fichier)' : 'Fichier retiré par la modération' }
          : { media_removed: reason })
        .returning(['id', 'group_id', 'conversation_id', 'parent_message_id']);
    if (io) {
      for (const m of affected) {
        const room = m.group_id ? `group:${m.group_id}` : m.conversation_id ? `conv:${m.conversation_id}` : null;
        if (!room) continue;
        if (hide) io.to(room).emit('message:hidden', { message_id: m.id, parent_message_id: m.parent_message_id || null, by: reason });
        else io.to(room).emit('message:media_removed', { message_id: m.id, media_removed: reason });
      }
    }
    return affected.length;
  },

  /**
   * Suppression d'un fichier par son auteur, selon le réglage de son type de compte.
   * Un fichier jamais utilisé dans un message est toujours effacé.
   */
  async deleteOwn(userId: string, tier: string, uploadId: unknown, requested: unknown, io?: any) {
    if (typeof uploadId !== 'string' || !UUID_RE.test(uploadId)) throw new UploadActionError(404, 'Fichier introuvable');
    const row = await db('uploads').where({ id: uploadId, user_id: userId }).whereIn('kind', ['image', 'file'])
      .whereNull('deleted_at').first('*', db.raw(`${USES_SQL} AS uses`));
    if (!row) throw new UploadActionError(404, 'Fichier introuvable');
    const uses = Number(row.uses || 0);

    let mode: DeleteMode = 'erase';
    if (uses > 0) {
      const setting = (await settingsService.forTier(tier)).deleteMode;
      if (setting === 'option') {
        if (!MEMBER_DELETE_CHOICES.includes(requested as DeleteMode)) {
          throw new UploadActionError(400, 'Choisissez ce que deviennent les messages qui utilisent ce fichier.', 'DELETE_MODE_REQUIRED');
        }
        mode = requested as DeleteMode;
      } else if (setting === 'block') {
        throw new UploadActionError(409, `Ce fichier est utilisé dans ${uses} message(s) : il ne peut pas être supprimé.`, 'FILE_IN_USE');
      } else {
        mode = setting;
      }
    }

    let messages = 0;
    if (mode === 'gallery_only') {
      await db('uploads').where({ id: row.id }).update({ hidden_by_owner_at: db.fn.now() });
    } else {
      messages = await this.removeFromMessages(row.url, 'author', mode === 'erase_messages', io);
      await this.markDeleted(row.url, 'author');
    }
    return { mode, messages, uses };
  },

  // ════════════════════════════════════════════════════════════════════════
  // Galerie du panel (superadmin) : tous les fichiers, ou ceux d'un membre
  // ════════════════════════════════════════════════════════════════════════

  async adminList(opts: { userId?: unknown; kind?: unknown; status?: unknown; q?: unknown; before?: unknown; limit?: unknown }) {
    const limit = Math.min(Math.max(Number(opts.limit) || 60, 1), 200);
    const base = () => {
      const q = db('uploads').leftJoin('users', 'uploads.user_id', 'users.id');
      if (typeof opts.userId === 'string' && UUID_RE.test(opts.userId)) q.where('uploads.user_id', opts.userId);
      if (opts.kind === 'image' || opts.kind === 'file' || opts.kind === 'avatar') q.where('uploads.kind', opts.kind);
      if (opts.status === 'deleted') q.whereNotNull('uploads.deleted_at');
      else if (opts.status !== 'all') q.whereNull('uploads.deleted_at');
      if (typeof opts.q === 'string' && opts.q.trim()) {
        const term = `%${opts.q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        q.where((w) => w.whereILike('uploads.original_name', term)
          .orWhereILike('users.username', term).orWhereILike('uploads.username_snapshot', term));
      }
      return q;
    };
    const list = base().select(
      'uploads.*', 'users.username', 'users.tier', db.raw(`host(uploads.ip_address) AS ip`), db.raw(`${USES_SQL} AS uses`),
    ).orderBy('uploads.created_at', 'desc').orderBy('uploads.id', 'desc').limit(limit + 1);
    if (typeof opts.before === 'string' && UUID_RE.test(opts.before)) {
      list.whereRaw('(uploads.created_at, uploads.id) < (SELECT created_at, id FROM uploads WHERE id = ?)', [opts.before]);
    }
    const [rows, totals] = await Promise.all([
      list,
      base().first(db.raw('COUNT(*) AS count'), db.raw('COALESCE(SUM(uploads.size_bytes) FILTER (WHERE uploads.deleted_at IS NULL), 0) AS bytes')),
    ]);
    return {
      items: rows.slice(0, limit).map((r: any) => ({
        ...galleryItem(r),
        user_id: r.user_id, username: r.username || r.username_snapshot || null, tier: r.tier || null,
        ip: r.ip || null, deleted_at: r.deleted_at, deleted_reason: r.deleted_reason || null, hidden_by_owner_at: r.hidden_by_owner_at,
      })),
      has_more: rows.length > limit,
      total: { count: Number((totals as any)?.count || 0), bytes: Number((totals as any)?.bytes || 0) },
    };
  },

  /** Détail d'un fichier pour le panel : trace complète, dimensions, EXIF, messages qui l'utilisent */
  async adminDetail(uploadId: unknown) {
    if (typeof uploadId !== 'string' || !UUID_RE.test(uploadId)) throw new UploadActionError(404, 'Fichier introuvable');
    const row = await db('uploads').leftJoin('users', 'uploads.user_id', 'users.id').where('uploads.id', uploadId)
      .first('uploads.*', 'users.username', 'users.tier', 'users.email', db.raw('host(uploads.ip_address) AS ip'));
    if (!row) throw new UploadActionError(404, 'Fichier introuvable');

    let image: Record<string, unknown> | null = null;
    let exif: Record<string, unknown> | null = null;
    if (row.kind !== 'file' && !row.deleted_at && sharp) {
      try {
        const meta = await sharp(fileFromUrl(row.url), { limitInputPixels: 100_000_000 }).metadata();
        image = {
          format: meta.format, width: meta.width, height: meta.pageHeight ?? meta.height, pages: meta.pages ?? 1,
          space: meta.space, channels: meta.channels, density: meta.density ?? null, orientation: meta.orientation ?? null,
          has_alpha: meta.hasAlpha ?? false, has_profile: meta.hasProfile ?? false,
          has_exif: !!meta.exif, has_xmp: !!meta.xmp, has_iptc: !!meta.iptc,
        };
        if (meta.exif) exif = readExif(meta.exif);
      } catch { image = null; }
    }

    const messages = await db('messages as m')
      .leftJoin('groups as g', 'm.group_id', 'g.id')
      .where('m.file_url', row.url)
      .select('m.id', 'm.created_at', 'm.is_hidden', 'm.media_removed', 'm.group_id', 'm.conversation_id',
        'g.name as group_name', db.raw('LEFT(m.content, 120) AS excerpt'))
      .orderBy('m.created_at', 'desc').limit(50);

    return {
      ...galleryItem({ ...row, uses: messages.filter((m: any) => !m.is_hidden && !m.media_removed).length }),
      user_id: row.user_id, username: row.username || row.username_snapshot || null, email: row.email || null,
      tier: row.tier || null, ip: row.ip || null, deleted_at: row.deleted_at, deleted_reason: row.deleted_reason || null,
      hidden_by_owner_at: row.hidden_by_owner_at, image, exif, messages,
    };
  },

  /** Retrait d'un fichier par la modération (messages : « retiré par la modération », ou masqués) */
  async adminRemove(uploadId: unknown, withMessages: boolean, io?: any) {
    if (typeof uploadId !== 'string' || !UUID_RE.test(uploadId)) throw new UploadActionError(404, 'Fichier introuvable');
    const row = await db('uploads').where({ id: uploadId }).whereNull('deleted_at').first('id', 'url', 'kind', 'user_id');
    if (!row) throw new UploadActionError(404, 'Fichier introuvable ou déjà effacé');
    if (row.kind === 'avatar') {
      await db('users').where({ id: row.user_id, avatar_url: row.url }).update({ avatar_url: null });
      await this.markDeleted(row.url, 'moderation');
      return { messages: 0, url: row.url, user_id: row.user_id };
    }
    const messages = await this.removeFromMessages(row.url, 'moderation', withMessages, io);
    await this.markDeleted(row.url, 'moderation');
    return { messages, url: row.url, user_id: row.user_id };
  },

  /**
   * Avatar : image quelconque (JPG/PNG/WebP/GIF) → WebP 256×256, métadonnées (GPS…) supprimées.
   * L'ancien avatar est effacé du disque. Retourne la nouvelle URL.
   */
  async saveAvatar(input: Buffer, user: { id: string; username?: string }, meta: { ip?: string; originalName?: unknown }): Promise<string> {
    if (!sharp) throw new Error('Traitement d\'image indisponible sur le serveur');
    let format: string | undefined;
    try { format = (await sharp(input, { limitInputPixels: 50_000_000 }).metadata()).format; } catch { format = undefined; }
    if (!format || !['jpeg', 'png', 'webp', 'gif'].includes(format)) {
      throw new InvalidImageError('Image invalide. Formats acceptés : JPG, PNG, WEBP, GIF');
    }
    const name = `${crypto.randomUUID()}.webp`;
    const out = path.join(AVATAR_DIR, name);
    await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()                                                        // orientation EXIF appliquée…
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: 'cover' })
      .webp({ quality: 85 })                                           // …puis métadonnées retirées
      .toFile(out);
    const url = `/uploads/avatars/${name}`;

    const previous = await db('users').where({ id: user.id }).first('avatar_url');
    await this.record({
      userId: user.id, username: user.username, kind: 'avatar', url,
      originalName: meta.originalName, mimeType: 'image/webp', sizeBytes: fs.statSync(out).size, ip: meta.ip,
    });
    await db('users').where({ id: user.id }).update({ avatar_url: url });
    if (previous?.avatar_url && AVATAR_URL_RE.test(previous.avatar_url)) await this.markDeleted(previous.avatar_url, 'replaced');
    return url;
  },

  async removeAvatar(userId: string): Promise<void> {
    const previous = await db('users').where({ id: userId }).first('avatar_url');
    await db('users').where({ id: userId }).update({ avatar_url: null });
    if (previous?.avatar_url && AVATAR_URL_RE.test(previous.avatar_url)) await this.markDeleted(previous.avatar_url);
  },

  /**
   * Photo de profil Google / GitHub : copiée UNE fois chez nous (aucun visiteur ne charge d'image chez eux).
   * Hôtes limités à googleusercontent.com / avatars.githubusercontent.com, 5 Mo max, 5 s max. Échec = pas d'avatar (non bloquant).
   */
  async importRemoteAvatar(remoteUrl: unknown, user: { id: string; username?: string }, ip?: string): Promise<void> {
    try {
      if (typeof remoteUrl !== 'string') return;
      const u = new URL(remoteUrl);
      const host = u.hostname.toLowerCase();
      if (u.protocol !== 'https:' || !REMOTE_AVATAR_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return;
      const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!res.ok || !res.body) return;
      if (Number(res.headers.get('content-length') || 0) > AVATAR_MAX_INPUT_BYTES) return;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > AVATAR_MAX_INPUT_BYTES) { await reader.cancel(); return; }
        chunks.push(value);
      }
      await this.saveAvatar(Buffer.concat(chunks), user, { ip, originalName: 'photo de profil' });
    } catch (error: any) {
      logger.warn(`Import de l'avatar Google impossible : ${error?.message || error}`);
    }
  },
};

// ─── Lecture des métadonnées EXIF (panel admin) ──────────────────────────────
let exifReader: ((buf: Buffer) => any) | null = null;
try { exifReader = require('exif-reader'); } catch { /* lecture EXIF indisponible */ }

/** Convertit une coordonnée GPS EXIF (degrés, minutes, secondes + N/S/E/O) en degrés décimaux */
function gpsToDecimal(dms: unknown, ref: unknown): number | null {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [d, m, sec] = dms.map(Number);
  if (![d, m, sec].every(Number.isFinite)) return null;
  const value = d + m / 60 + sec / 3600;
  return Math.round((ref === 'S' || ref === 'W' ? -value : value) * 1e6) / 1e6;
}

/** EXIF lisible : champs utiles mis en avant (appareil, date, GPS) + le reste à plat, valeurs courtes */
export function readExif(buffer: Buffer): Record<string, unknown> | null {
  if (!exifReader) return null;
  try {
    const raw = exifReader(buffer) || {};
    const out: Record<string, unknown> = {};
    const flat: Record<string, unknown> = {};
    for (const [section, values] of Object.entries(raw)) {
      if (!values || typeof values !== 'object' || Buffer.isBuffer(values)) continue;
      for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
        if (Buffer.isBuffer(v) || v === undefined) continue;
        let val: unknown = v instanceof Date ? v.toISOString() : v;
        if (typeof val === 'string') val = val.replace(/[\u0000-\u001f]/g, '').slice(0, 200);
        if (Array.isArray(val)) val = val.slice(0, 8);
        flat[`${section}.${k}`] = val;
      }
    }
    const img = (raw.Image || {}) as any, photo = (raw.Photo || {}) as any, gps = (raw.GPSInfo || {}) as any;
    if (img.Make || img.Model) out.appareil = [img.Make, img.Model].filter(Boolean).join(' ');
    if (img.Software) out.logiciel = img.Software;
    const taken = photo.DateTimeOriginal || img.DateTime;
    if (taken) out.date_prise = taken instanceof Date ? taken.toISOString() : String(taken);
    const lat = gpsToDecimal(gps.GPSLatitude, gps.GPSLatitudeRef);
    const lon = gpsToDecimal(gps.GPSLongitude, gps.GPSLongitudeRef);
    if (lat !== null && lon !== null) out.gps = { lat, lon };
    if (img.Copyright) out.copyright = String(img.Copyright).slice(0, 200);
    if (img.Artist) out.auteur = String(img.Artist).slice(0, 200);
    out.champs = flat;
    return out;
  } catch {
    return null;
  }
}

// ─── Expiration automatique des fichiers (durée de conservation par type de compte) ──
let expiryTimer: ReturnType<typeof setInterval> | null = null;

/** Au démarrage (après 90 s) puis toutes les heures */
export function startUploadExpiry(io?: any): void {
  if (expiryTimer) return;
  const run = () => uploadService.expireOld(io).catch((err) => logger.warn(`Expiration des fichiers impossible : ${err?.message || err}`));
  setTimeout(run, 90_000).unref?.();
  expiryTimer = setInterval(run, 60 * 60 * 1000);
  expiryTimer.unref?.();
}
