import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';

const app = express();

// ===== MIDDLEWARES GLOBAUX =====

// Sécurité HTTP
app.use(helmet());

// CORS — Autorise le frontend
app.use(cors({
  origin: env.APP_URL,
  credentials: true,
}));

// Parsing JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging HTTP (dev uniquement)
if (env.isDev) {
  app.use(morgan('dev'));
}

// ===== ROUTES =====

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: env.APP_NAME,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// TODO Phase 1 : Ajouter les routes
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/groups', groupRoutes);
// app.use('/api/messages', messageRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route introuvable' });
});

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Erreur:', err.message);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: env.isDev ? err.message : 'Erreur interne du serveur',
  });
});

export default app;
