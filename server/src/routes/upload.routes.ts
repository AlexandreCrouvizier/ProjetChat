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
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.middleware';
import { db } from '../config/database';

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

async function compressImage(inputPath: string, outputPath: string, maxPx: number, quality: number): Promise<void> {
  await sharp(inputPath)
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(outputPath);
}

const router = express.Router();

// ─── Dossiers de stockage ───────────────────────────────────────────────────
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const IMAGE_DIR   = path.join(UPLOAD_ROOT, 'images');
const FILE_DIR    = path.join(UPLOAD_ROOT, 'files');

[UPLOAD_ROOT, IMAGE_DIR, FILE_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Storages Multer ────────────────────────────────────────────────────────
const makeStorage = (dest: string) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `${uuidv4()}${ext || '.bin'}`);
    },
  });

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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

// ─── Utilitaire taille lisible ──────────────────────────────────────────────
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ─── POST /api/upload/image ─────────────────────────────────────────────────
router.post('/image', requireAuth, (req: Request, res: Response) => {
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
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Le partage de médias est réservé aux membres inscrits.',
      });
    }
    const maxBytes = tier === 'premium' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;

    if (req.file.size > maxBytes) {
      fs.unlinkSync(req.file.path);
      const limit = tier === 'premium' ? '25 Mo' : '5 Mo';
      return res.status(400).json({
        error: `Image trop volumineuse. Limite pour votre abonnement : ${limit}.`,
        limit_premium: tier !== 'premium',
      });
    }

    // ⭐ Compression Sharp → WebP (paramètres depuis admin/app_settings)
    let finalFilename = req.file.filename;
    let finalSize     = req.file.size;

    const cs = await getCompressionSettings();
    const maxPx = tier === 'premium' ? cs.maxPxPremium : cs.maxPx;

    if (sharp && cs.enabled && req.file.mimetype !== 'image/gif') {
      // Les GIFs animés ne sont pas recompressés (Sharp perd l'animation)
      try {
        const webpFilename = `${req.file.filename.replace(/\.[^.]+$/, '')}.webp`;
        const webpPath     = path.join(IMAGE_DIR, webpFilename);
        await compressImage(req.file.path, webpPath, maxPx, cs.quality);
        fs.unlinkSync(req.file.path);
        finalFilename = webpFilename;
        finalSize     = fs.statSync(webpPath).size;
      } catch {
        // Compression échouée → conserver l'original
      }
    }

    res.json({
      url: `/uploads/images/${finalFilename}`,
      filename: req.file.originalname,
      size: finalSize,
      size_readable: readableSize(finalSize),
      mimetype: sharp && req.file.mimetype !== 'image/gif' ? 'image/webp' : req.file.mimetype,
      compressed: !!(sharp && req.file.mimetype !== 'image/gif'),
    });
  });
});

// ─── POST /api/upload/file ──────────────────────────────────────────────────
router.post('/file', requireAuth, (req: Request, res: Response) => {
  // Vérification tier avant même d'accepter le fichier
  const tier = (req as any).user?.tier || 'registered';
  if (tier !== 'premium') {
    return res.status(403).json({
      error: 'Le partage de fichiers est une fonctionnalité Premium.',
      upgrade_required: true,
    });
  }

  uploadFileMiddleware.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (maximum 100 Mo).' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    res.json({
      url: `/uploads/files/${req.file.filename}`,
      filename: req.file.originalname,
      size: req.file.size,
      size_readable: readableSize(req.file.size),
      mimetype: req.file.mimetype,
    });
  });
});

export default router;
