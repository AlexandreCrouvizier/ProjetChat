import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types/websocket.types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * URL du serveur WebSocket.
 * Par défaut : même machine que celle qui a servi la page, port 4000.
 * → fonctionne sur le PC (localhost) ET depuis un téléphone du Wi-Fi local (192.168.x.x).
 * NEXT_PUBLIC_WS_URL (client/.env.local) reste prioritaire si définie.
 */
function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket | null {
  return socket;
}

export function connectSocket(token: string): TypedSocket {
  if (socket?.connected) return socket;

  // Si un socket existe mais est déconnecté, le détruire proprement avant de recréer
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  }) as TypedSocket;

  socket.on('connect', () => {
    console.log('⚡ WebSocket connecté:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('👋 WebSocket déconnecté:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Erreur WebSocket:', error.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    // Désactiver la reconnexion automatique AVANT de déconnecter
    // Sinon socket.io tente de se reconnecter pendant la navigation vers la page de login
    socket.io.opts.reconnection = false;
    socket.io.reconnection(false);
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
