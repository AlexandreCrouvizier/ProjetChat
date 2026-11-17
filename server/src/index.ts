/**
 * index.ts — Point d'entrée du serveur (Phase 1 complète)
 * 
 * Démarre :
 *   1. Connexions BDD (PostgreSQL + Redis)
 *   2. Serveur HTTP (Express)
 *   3. Serveur WebSocket (Socket.io)
 */

import http from 'http';
import os from 'os';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { testDatabaseConnection } from './config/database';
import { redis } from './config/redis';
import { setupWebSocket } from './websocket/index';
import { startLcenPurge } from './services/lcen.service';
import { startUploadExpiry } from './services/upload.service';
import { corsOrigin } from './utils/cors';

/** Adresses IPv4 de ce PC sur le réseau local (pour tester depuis un téléphone, etc.) */
// Cartes réseau virtuelles (WSL, Docker, Hyper-V, VirtualBox, VMware) : joignables uniquement
// depuis ce PC, inutiles pour le téléphone → on ne les affiche pas.
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|Docker|VirtualBox|VMware|vboxnet|^br-|^veth|^docker/i;

function getLanAddresses(): string[] {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL_ADAPTER.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

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
      origin: corsOrigin, // APP_URL (+ réseau local en dev)
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
    if (env.isDev) {
      const frontPort = new URL(env.APP_URL).port || '1608';
      const lan = getLanAddresses();
      if (lan.length) {
        console.log('   📱 Depuis un autre appareil du Wi-Fi (lancer le client avec npm run dev:lan) :');
        lan.forEach((ip) => console.log(`      http://${ip}:${frontPort}`));
      }
    }
    console.log('');
    // LCEN : purge des traces au-delà de la durée de conservation (au démarrage puis chaque jour)
    startLcenPurge();
    // Fichiers expirés (durée de conservation par type de compte) : au démarrage puis toutes les heures
    startUploadExpiry(app.get('io'));
  });
}

start().catch((error) => {
  console.error('❌ Erreur fatale au démarrage:', error);
  process.exit(1);
});
