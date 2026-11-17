/**
 * routes/upload.routes.ts — Phase 4.1b : compression images via Sharp
 *
 * POST /api/upload/image — tous les utilisateurs connectés
 *   - B (registered) : max 5 Mo original → WebP 1920px, qualité 82
 *   - C (premium)    : max 25 Mo original → WebP 2560px, qualité 82
 *
 * POST /api/upload/file — Premium (C) uniquement, max 100 Mo
 *
 * Compression : Sharp convertit en WebP (gain ~40-60% vs JPEG).
 * Fallback silencieux si sharp n'est pas installé.
 * Installation : npm install sharp   (dans server/)
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { db } from '../config/database';
import { getIpFromRequest } from '../utils/ip';
import { uploadService, QuotaExceededError, IMAGE_DIR, FILE_DIR, readableSize, type MetadataMode } from '../services/upload.service';
import { settingsService } from '../services/settings.service';

// ─── Sharp (optionnel) ───────────────────────────────────────────────────────
let sharp: any = null;
try { sharp = require('sharp'); } catch { /* compression désactivée */ }

/** Lit les paramètres de compression depuis la table app_settings (cache 30s) */
let settingsCache: { enabled: boolean; quality: number; maxPx: number; maxPxPremium: number } | null = null;
let settingsCachedAt = 0;

async function getCompressionSettings() {
  if (settingsCache && Date.now() - settingsCachedAt < 30_000) return settingsCache;
  try {
    const rows = await db('app_settings')
      .whereIn('key', ['compression_enabled','compression_quality','compression_max_px','compression_max_px_premium'])
      .select('key','value');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    settingsCache = {
      enabled:      map['compression_enabled']        !== 'false',
      quality:      parseInt(map['compression_quality']       || '82',   10),
      maxPx:        parseInt(map['compression_max_px']        || '1920', 10),
      maxPxPremium: parseInt(map['compression_max_px_premium']|| '2560', 10),
    };
  } catch {
    // Table pas encore créée → valeurs par défaut
    settingsCache = { enabled: true, quality: 82, maxPx: 1920, maxPxPremium: 2560 };
  }
  settingsCachedAt = Date.now();
  return settingsCache!;
}

/** Invalide le cache des settings (appelé après une mise à jour admin) */
export function invalidateSettingsCache() { settingsCache = null; }

/** Mode des métadonnées applicable au type de compte (réglage admin par tier) */
async function metadataModeFor(tier: string): Promise<MetadataMode> {
  return (await settingsService.forTier(tier)).metadataMode;
}

async function compressImage(inputPath: string, outputPath: string, maxPx: number, quality: number, keepMetadata: boolean): Promise<void> {
  // 🐛 rotate() : applique l'orientation EXIF (avant : une photo de téléphone prise en portrait
  // pouvait apparaître couchée, l'orientation étant perdue lors de la conversion)
  let pipeline = sharp(inputPath).rotate().resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true });
  // Sharp retire toutes les métadonnées par défaut ; on ne les garde que si le réglage le demande
  if (keepMetadata) pipeline = pipeline.keepMetadata();
  await pipeline.webp({ quality }).toFile(outputPath);
}

const router = express.Router();

// Dossiers de stockage : créés par services/upload.service.ts

// ─── Storages Multer ────────────────────────────────────────────────────────
const makeStorage = (dest: string) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      // 🔐 Nom 100 % généré par le serveur ; l'extension sera revalidée après réception
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 11);
      cb(null, `${crypto.randomUUID()}${ext || '.bin'}`);
    },
  });

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// 🔐 Formats d'image réellement acceptés, détectés à partir du CONTENU (pas du nom ni du type déclaré)
const IMAGE_FORMAT_EXT: Record<string, string> = { jpeg: '.jpg', png: '.png', webp: '.webp', gif: '.gif' };

// 🔐 Fichiers premium : liste blanche d'extensions. Exclus volontairement : html, htm, svg, xml,
// js, mjs, xhtml, php, exe, bat, cmd, ps1, msi, scr… (exécutables ou interprétés par le navigateur)
const FILE_EXT_ALLOWLIST = new Set([
  '.pdf', '.txt', '.md', '.csv', '.rtf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  '.zip', '.7z', '.rar', '.tar', '.gz',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac',
  '.mp4', '.webm', '.mov', '.mkv',
]);

function safeUnlink(p: string) { try { fs.unlinkSync(p); } catch { /* déjà supprimé */ } }

const uploadImageMiddleware = multer({
  storage: makeStorage(IMAGE_DIR),
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Type non autorisé. Formats acceptés : JPG, PNG, GIF, WEBP'));
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo — sera re-vérifié par tier
});

const uploadFileMiddleware = multer({
  storage: makeStorage(FILE_DIR),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 Mo
});

/** Réponse « quota dépassé » (413) */
function quotaResponse(res: Response, err: QuotaExceededError) {
  return res.status(413).json({ error: err.message, code: 'STORAGE_QUOTA_EXCEEDED', used: err.used, quota: err.quota });
}

// ─── GET /api/upload/quota — espace utilisé / disponible ────────────────────
router.get('/quota', requireAuth, async (req: Request, res: Response) => {
  try {
    const [status, metadataMode, pref] = await Promise.all([
      uploadService.quotaStatus(req.user!.userId, req.user!.tier),
      metadataModeFor(req.user!.tier),
      db('users').where({ id: req.user!.userId }).first('keep_upload_metadata'),
    ]);
    // + réglage des métadonnées : le profil n'affiche le choix que si l'admin a mis « option »
    res.json({ ...status, metadata_mode: metadataMode, keep_upload_metadata: pref?.keep_upload_metadata ?? null });
  } catch {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── POST /api/upload/image ─────────────────────────────────────────────────
router.post('/image', requireAuth, rateLimit({ name: 'upload', max: 30, windowSeconds: 600, by: 'user' }), (req: Request, res: Response) => {
  uploadImageMiddleware.single('file')(req, res, async (err) => {  // ← async ici
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (maximum 25 Mo).' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    // ⭐ Vérification tier : invités non autorisés (cahier des charges : image = B+C seulement)
    const tier = (req as any).user?.tier || 'guest';
    if (tier === 'guest') {
      safeUnlink(req.file.path);
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Le partage de médias est réservé aux membres inscrits.',
      });
    }
    const maxBytes = tier === 'premium' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;

    if (req.file.size > maxBytes) {
      safeUnlink(req.file.path);
      const limit = tier === 'premium' ? '25 Mo' : '5 Mo';
      return res.status(400).json({
        error: `Image trop volumineuse. Limite pour votre abonnement : ${limit}.`,
        limit_premium: tier !== 'premium',
      });
    }

    // 🔐 Vérifier que le fichier est RÉELLEMENT une image (analyse du contenu par Sharp).
    // Avant : seul le type annoncé par le navigateur était contrôlé et, si la compression
    // échouait, l'original était gardé avec son extension → un « .html » déguisé en image
    // pouvait être servi depuis le domaine de l'app (vol de session).
    if (!sharp) {
      safeUnlink(req.file.path);
      return res.status(503).json({ error: 'Traitement d\'image indisponible sur le serveur.' });
    }
    let format: string | undefined;
    try {
      format = (await sharp(req.file.path, { limitInputPixels: 100_000_000 }).metadata()).format;
    } catch { format = undefined; }
    if (!format || !IMAGE_FORMAT_EXT[format]) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: 'Fichier image invalide. Formats acceptés : JPG, PNG, GIF, WEBP' });
    }

    const baseName = req.file.filename.replace(/\.[^.]+$/, '');
    const cs = await getCompressionSettings();
    const maxPx = tier === 'premium' ? cs.maxPxPremium : cs.maxPx;
    // Métadonnées (EXIF : GPS, appareil, date) : réglage admin, éventuellement choix du membre
    const keepMetadata = await uploadService.shouldKeepMetadata(req.user!.userId, await metadataModeFor(tier));

    let finalFilename: string;
    let finalMime: string;
    let compressed = false;

    if (cs.enabled && format !== 'gif') {
      // ⭐ Compression Sharp → WebP (les GIF animés ne sont pas recompressés : Sharp perd l'animation)
      finalFilename = `${baseName}.webp`;
      finalMime = 'image/webp';
      try {
        await compressImage(req.file.path, path.join(IMAGE_DIR, finalFilename), maxPx, cs.quality, keepMetadata);
        compressed = true;
      } catch {
        safeUnlink(req.file.path);
        safeUnlink(path.join(IMAGE_DIR, finalFilename));
        return res.status(400).json({ error: 'Image illisible ou corrompue.' });
      }
      safeUnlink(req.file.path);
    } else {
      // Pas de compression : on garde l'original MAIS avec l'extension du format détecté
      finalFilename = `${baseName}${IMAGE_FORMAT_EXT[format]}`;
      finalMime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
      if (format === 'gif' || keepMetadata) {
        // GIF : Sharp perdrait l'animation. Métadonnées conservées (réglage) : fichier d'origine intact.
        fs.renameSync(req.file.path, path.join(IMAGE_DIR, finalFilename));
      } else {
        // 🔐 Même sans compression, l'image est réécrite pour retirer ses métadonnées
        // (EXIF : position GPS de la photo, modèle d'appareil…), sauf si le réglage dit de les garder.
        // (en mémoire puis écriture : le fichier reçu peut avoir exactement le même nom que le résultat)
        let cleaned: Buffer;
        try {
          cleaned = await sharp(req.file.path, { limitInputPixels: 100_000_000 })
            .rotate()
            .toFormat(format, format === 'png' ? {} : { quality: 95 })
            .toBuffer();
        } catch {
          safeUnlink(req.file.path);
          return res.status(400).json({ error: 'Image illisible ou corrompue.' });
        }
        safeUnlink(req.file.path);
        fs.writeFileSync(path.join(IMAGE_DIR, finalFilename), cleaned);
      }
    }
    const finalSize = fs.statSync(path.join(IMAGE_DIR, finalFilename)).size;
    const finalUrl = `/uploads/images/${finalFilename}`;

    // 🔐 Quota de stockage + traçabilité (auteur, IP, date)
    try {
      await uploadService.assertQuota(req.user!.userId, tier, finalSize);
      await uploadService.record({
        userId: req.user!.userId, username: req.user!.username, kind: 'image', url: finalUrl,
        originalName: req.file.originalname, mimeType: finalMime, sizeBytes: finalSize, ip: getIpFromRequest(req),
      });
    } catch (e: any) {
      safeUnlink(path.join(IMAGE_DIR, finalFilename));
      if (e instanceof QuotaExceededError) return quotaResponse(res, e);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    res.json({
      url: finalUrl,
      filename: req.file.originalname,
      size: finalSize,
      size_readable: readableSize(finalSize),
      mimetype: finalMime,
      compressed,
    });
  });
});

// ─── POST /api/upload/file ──────────────────────────────────────────────────
router.post('/file', requireAuth, rateLimit({ name: 'upload', max: 30, windowSeconds: 600, by: 'user' }), (req: Request, res: Response) => {
  // Vérification tier avant même d'accepter le fichier
  const tier = (req as any).user?.tier || 'registered';
  if (tier !== 'premium') {
    return res.status(403).json({
      error: 'Le partage de fichiers est une fonctionnalité Premium.',
      upgrade_required: true,
    });
  }

  uploadFileMiddleware.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (maximum 100 Mo).' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    // 🔐 Liste blanche d'extensions (pas de .html/.svg/.js… servis depuis notre domaine)
    const ext = path.extname(req.file.filename).toLowerCase();
    if (!FILE_EXT_ALLOWLIST.has(ext)) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: `Type de fichier non autorisé (${ext || 'sans extension'}).` });
    }

    const fileUrl = `/uploads/files/${req.file.filename}`;
    // 🔐 Quota de stockage + traçabilité (auteur, IP, date)
    try {
      await uploadService.assertQuota(req.user!.userId, tier, req.file.size);
      await uploadService.record({
        userId: req.user!.userId, username: req.user!.username, kind: 'file', url: fileUrl,
        originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, ip: getIpFromRequest(req),
      });
    } catch (e: any) {
      safeUnlink(req.file.path);
      if (e instanceof QuotaExceededError) return quotaResponse(res, e);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    res.json({
      url: fileUrl,
      filename: req.file.originalname,
      size: req.file.size,
      size_readable: readableSize(req.file.size),
      mimetype: req.file.mimetype,
    });
  });
});

export default router;
