/**
 * app.ts — Phase 3.5 : ajout routes admin-auth (TOTP) + admin (dashboard)
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from './config/passport';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import groupsRoutes from './routes/groups.routes';
import conversationsRoutes from './routes/conversations.routes';
import usersRoutes from './routes/users.routes';
import moderationRoutes from './routes/moderation.routes';
import adminRouter, { adminAuthRouter } from './routes/admin.routes';
import uploadRoutes from './routes/upload.routes';
import path from 'path';
import { db } from './config/database';
import { corsOrigin } from './utils/cors';
import { requireAdminGateway } from './middleware/adminGateway.middleware';
import { csrfProtection } from './middleware/csrf.middleware';

const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true })); // APP_URL (+ réseau local en dev)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
// 🔐 CSRF : requêtes qui modifient des données acceptées uniquement depuis une origine autorisée
app.use('/api', csrfProtection);
if (env.isDev) app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: env.APP_NAME, environment: env.NODE_ENV, timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/moderation', moderationRoutes);
// ⭐ Phase 4 : paramètres d'affichage GIF (publics, pas d'auth)
app.get('/api/settings/gif-display', async (_req, res) => {
  try {
    const rows = await db('app_settings')
      .whereIn('key', ['gif_display_guest', 'gif_display_registered', 'gif_display_premium', 'gif_picker_limit'])
      .select('key', 'value');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({
      guest:      map['gif_display_guest']      ?? 'masked',
      registered: map['gif_display_registered'] ?? 'option',
      premium:    map['gif_display_premium']    ?? 'visible',
      limit:      parseInt(map['gif_picker_limit'] ?? '20', 10),
    });
  } catch {
    res.json({ guest: 'masked', registered: 'option', premium: 'visible', limit: 20 });
  }
});

// ⭐ Phase 4.1g : paramètres de la liste des membres (publics, pas d'auth)
// Route perdue lors d'un patch précédent d'app.ts — utilisée par MembersPanel.tsx
app.get('/api/settings/members', async (_req, res) => {
  try {
    const rows = await db('app_settings')
      .whereIn('key', ['members_hide_offline_guests', 'members_offline_ttl_minutes'])
      .select('key', 'value');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({
      hide_offline_guests: map['members_hide_offline_guests'] === 'true',
      offline_ttl_minutes: parseInt(map['members_offline_ttl_minutes'] ?? '10', 10) || 10,
    });
  } catch {
    res.json({ hide_offline_guests: false, offline_ttl_minutes: 10 });
  }
});

// ⭐ Phase 4.1 : Fichiers uploadés servis statiquement
// 🔐 Les fichiers envoyés par les utilisateurs ne doivent JAMAIS pouvoir s'exécuter
// dans l'origine de l'application (sinon un .html/.svg piégé vole les sessions) :
//   - nosniff : le navigateur respecte le type déclaré
//   - CSP sandbox : aucun script, même si un fichier HTML passait au travers
//   - attachment : les fichiers (hors images) sont téléchargés, jamais affichés
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '7d', etag: true, dotfiles: 'deny', index: false, redirect: false,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
    if (filePath.includes(`${path.sep}files${path.sep}`)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// ⭐ Phase 4.1 : Routes upload image/fichier
app.use('/api/upload', uploadRoutes);

// 🔐 Routes admin : uniquement via la passerelle admin (PC seul, port ADMIN_PORT)
app.use('/api/admin-auth', requireAdminGateway, adminAuthRouter);  // ⭐ TOTP setup/verify
app.use('/api/admin', requireAdminGateway, adminRouter);            // ⭐ Dashboard admin (post-TOTP)

app.use((_req, res) => { res.status(404).json({ error: 'NOT_FOUND', message: 'Route introuvable' }); });
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Erreur:', err.message);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: env.isDev ? err.message : 'Erreur interne' });
});

export default app;
