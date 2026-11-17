/**
 * services/upload.service.ts — Fichiers envoyés : stockage, traçabilité, quota, avatars
 *
 * 🔐 Chaque fichier (image de message, fichier premium, avatar) est enregistré dans la table `uploads`
 * avec son auteur, son IP et sa date (LCEN). Cela permet aussi :
 *   - un quota de stockage par compte (TIER_LIMITS.*.storageQuotaBytes) ;
 *   - de n'accepter dans un message QUE les fichiers envoyés par son auteur.
 * Les avatars sont des fichiers WebP 256×256 (plus de base64 en base, plus d'URL externe).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../config/database';
import { TIER_LIMITS } from '../../../shared/constants';
import { logger } from '../utils/logger';

let sharp: any = null;
try { sharp = require('sharp'); } catch { /* traitement d'image indisponible */ }

export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
export const IMAGE_DIR = path.join(UPLOAD_ROOT, 'images');
export const FILE_DIR = path.join(UPLOAD_ROOT, 'files');
export const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
for (const dir of [UPLOAD_ROOT, IMAGE_DIR, FILE_DIR, AVATAR_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export type UploadKind = 'image' | 'file' | 'avatar';

export const AVATAR_SIZE_PX = 256;
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;   // 5 Mo avant traitement
export const AVATAR_URL_RE = /^\/uploads\/avatars\/[0-9a-f-]{36}\.webp$/;
const REMOTE_AVATAR_HOSTS = ['googleusercontent.com'];     // photo de profil Google uniquement

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

function quotaFor(tier: string): number {
  return (TIER_LIMITS as any)[tier]?.storageQuotaBytes ?? 0;
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
    const quota = quotaFor(tier);
    return { used, quota, used_readable: readableSize(used), quota_readable: readableSize(quota) };
  },

  /** 🔐 Refuse l'envoi si le quota du compte serait dépassé */
  async assertQuota(userId: string, tier: string, incomingBytes: number): Promise<void> {
    const quota = quotaFor(tier);
    const used = await this.storageUsed(userId);
    if (used + incomingBytes > quota) throw new QuotaExceededError(used, quota);
  },

  /** Enregistre un fichier envoyé (auteur, IP, date, taille) */
  async record(data: {
    userId: string; username?: string; kind: UploadKind; url: string;
    originalName?: unknown; mimeType?: string; sizeBytes: number; ip?: string;
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
    });
  },

  /** 🔐 Ce fichier a-t-il été envoyé par cet utilisateur (et existe-t-il encore) ? */
  async isOwnUpload(url: string, userId: string, kind: UploadKind): Promise<boolean> {
    const row = await db('uploads').where({ url, user_id: userId, kind }).whereNull('deleted_at').first('id');
    return !!row;
  },

  /** Efface le fichier du disque ; la trace (auteur, IP, date) reste en base */
  async markDeleted(url: string): Promise<void> {
    try { fs.unlinkSync(fileFromUrl(url)); } catch { /* déjà absent */ }
    await db('uploads').where({ url }).whereNull('deleted_at').update({ deleted_at: db.fn.now() });
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
    if (previous?.avatar_url && AVATAR_URL_RE.test(previous.avatar_url)) await this.markDeleted(previous.avatar_url);
    return url;
  },

  async removeAvatar(userId: string): Promise<void> {
    const previous = await db('users').where({ id: userId }).first('avatar_url');
    await db('users').where({ id: userId }).update({ avatar_url: null });
    if (previous?.avatar_url && AVATAR_URL_RE.test(previous.avatar_url)) await this.markDeleted(previous.avatar_url);
  },

  /**
   * Photo de profil Google : copiée UNE fois chez nous (plus aucun visiteur ne charge d'image chez Google).
   * Hôte limité à googleusercontent.com, 5 Mo max, 5 s max. Échec = pas d'avatar (non bloquant).
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
      await this.saveAvatar(Buffer.concat(chunks), user, { ip, originalName: 'photo Google' });
    } catch (error: any) {
      logger.warn(`Import de l'avatar Google impossible : ${error?.message || error}`);
    }
  },
};
