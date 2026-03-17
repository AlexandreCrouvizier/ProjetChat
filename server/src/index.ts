import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { testDatabaseConnection } from './config/database';
import { redis } from './config/redis';

async function start() {
  console.log('🚀 Démarrage du serveur...');
  console.log(`   Environnement : ${env.NODE_ENV}`);
  console.log(`   Port          : ${env.PORT}`);

  // 1. Tester les connexions
  await testDatabaseConnection();
  await redis.ping();

  // 2. Créer le serveur HTTP
  const server = http.createServer(app);

  // 3. Configurer Socket.io
  const io = new SocketIOServer(server, {
    cors: {
      origin: env.APP_URL,
      credentials: true,
    },
    // Transports : WebSocket prioritaire, polling en fallback
    transports: ['websocket', 'polling'],
  });

  // 4. Connexion WebSocket
  io.on('connection', (socket) => {
    console.log(`⚡ Client connecté : ${socket.id}`);

    // TODO Phase 1 : Vérifier le JWT depuis socket.handshake.auth.token
    // TODO Phase 1 : Rejoindre les rooms des groupes de l'utilisateur
    // TODO Phase 1 : Gérer les événements (message:send, etc.)

    socket.on('disconnect', (reason) => {
      console.log(`👋 Client déconnecté : ${socket.id} (${reason})`);
    });
  });

  // 5. Lancer le serveur
  server.listen(env.PORT, () => {
    console.log('');
    console.log(`✅ Serveur prêt !`);
    console.log(`   API   : http://localhost:${env.PORT}/api/health`);
    console.log(`   WS    : ws://localhost:${env.PORT}`);
    console.log('');
  });
}

start().catch((error) => {
  console.error('❌ Erreur fatale au démarrage:', error);
  process.exit(1);
});
