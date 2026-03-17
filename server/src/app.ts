/**
 * app.ts — Configuration Express (Phase 1 — tous les fixes)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from './config/passport';
import { env } from './config/env';

// Routes
import authRoutes from './routes/auth.routes';
import groupsRoutes from './routes/groups.routes';

const app = express();

// ===== MIDDLEWARES GLOBAUX =====
app.use(helmet());
app.use(cors({ origin: env.APP_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Passport (OAuth)
app.use(passport.initialize());

if (env.isDev) {
  app.use(morgan('dev'));
}

// ===== ROUTES =====
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: env.APP_NAME,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);

// ===== 404 =====
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route introuvable' });
});

// ===== ERROR HANDLER =====
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Erreur non gérée:', err.message);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: env.isDev ? err.message : 'Erreur interne du serveur',
  });
});

export default app;
