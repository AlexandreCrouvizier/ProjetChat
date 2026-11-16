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

const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true })); // APP_URL (+ réseau local en dev)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
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

// ⭐ Phase 4.1 : Fichiers uploadés servis statiquement
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '7d', etag: true,
}));

// ⭐ Phase 4.1 : Routes upload image/fichier
app.use('/api/upload', uploadRoutes);

app.use('/api/admin-auth', adminAuthRouter);  // ⭐ TOTP setup/verify
app.use('/api/admin', adminRouter);            // ⭐ Dashboard admin (post-TOTP)

app.use((_req, res) => { res.status(404).json({ error: 'NOT_FOUND', message: 'Route introuvable' }); });
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Erreur:', err.message);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: env.isDev ? err.message : 'Erreur interne' });
});

export default app;
