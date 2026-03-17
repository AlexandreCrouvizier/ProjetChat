/**
 * index.ts — Point d'entrée du serveur (Phase 1 complète)
 * 
 * Démarre :
 *   1. Connexions BDD (PostgreSQL + Redis)
 *   2. Serveur HTTP (Express)
 *   3. Serveur WebSocket (Socket.io)
 */

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { testDatabaseConnection } from './config/database';
import { redis } from './config/redis';
import { setupWebSocket } from './websocket/index';

async function start() {
  console.log('');
  console.log('🚀 Démarrage du serveur...');
  console.log(`   Environnement : ${env.NODE_ENV}`);
  console.log(`   Port          : ${env.PORT}`);
  console.log('');

  // 1. Tester les connexions
  await testDatabaseConnection();
  await redis.ping().then(() => console.log('✅ Redis connecté'));

  // 2. Créer le serveur HTTP (Express dessus)
  const server = http.createServer(app);

  // 3. Configurer Socket.io
  const io = new SocketIOServer(server, {
    cors: {
      origin: env.APP_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // 4. Setup WebSocket (auth, handlers, rooms)
  setupWebSocket(io);

  // Rendre io accessible globalement (pour les controllers qui en auraient besoin)
  app.set('io', io);

  // 5. Lancer le serveur
  server.listen(env.PORT, () => {
    console.log('');
    console.log('✅ Serveur prêt !');
    console.log(`   🌐 API REST  : http://localhost:${env.PORT}/api/health`);
    console.log(`   ⚡ WebSocket : ws://localhost:${env.PORT}`);
    console.log(`   📡 Frontend  : ${env.APP_URL}`);
    console.log('');
  });
}

start().catch((error) => {
  console.error('❌ Erreur fatale au démarrage:', error);
  process.exit(1);
});
