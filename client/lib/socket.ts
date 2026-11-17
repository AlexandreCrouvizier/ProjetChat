import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types/websocket.types';
import { forceBannedExit } from '@/lib/banGuard';
import { refreshSession } from '@/lib/api';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * lib/socket.ts — Connexion WebSocket unique et stable
 *
 * 🐛 Correctifs (messages qui n'apparaissaient qu'après rechargement, notification de ban absente) :
 *
 *  1. UNE SEULE instance de socket, jamais remplacée.
 *     Avant : connectSocket() détruisait et recréait le socket dès qu'il était déconnecté.
 *     Les écouteurs posés par les composants (message:new, moderation:banned…) restaient
 *     accrochés à l'ANCIEN socket → plus rien n'arrivait, même ses propres messages.
 *     De plus, si un composant s'affichait avant la connexion, getSocket() renvoyait null
 *     et il n'écoutait jamais rien. Maintenant getSocket() renvoie toujours la même instance.
 *
 *  2. Le token est relu à CHAQUE (re)connexion.
 *     Avant : le token était figé à la création. Après 15 min (expiration) ou un redémarrage
 *     du serveur, toutes les reconnexions échouaient avec « Token invalide ou expiré ».
 *     Maintenant : renouvellement automatique de la session puis nouvelle tentative.
 *
 *  3. 🔐 Le jeton n'est plus manipulé par JavaScript : il voyage dans le cookie httpOnly
 *     envoyé avec la poignée de main WebSocket (withCredentials).
 */

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
let refreshing = false;

/** Crée l'instance unique (sans se connecter) — navigateur uniquement */
function ensureSocket(): TypedSocket | null {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;

  socket = io(getSocketUrl(), {
    autoConnect: false,
    // 🔐 Le cookie de session (httpOnly) accompagne la connexion, y compris en mode « polling »
    withCredentials: true,
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

  // 🔐 Bannissement : sortie immédiate du chat (motif affiché sur l'accueil)
  socket.on('moderation:banned', (data) => {
    socket?.disconnect();
    void forceBannedExit(data || {});
  });

  socket.on('connect_error', async (error) => {
    console.error('❌ Erreur WebSocket:', error.message);

    // Compte banni (notification manquée : écran éteint, réseau coupé…) → même sortie, sans nouvelle tentative
    if (error.message === 'Compte suspendu') {
      socket?.disconnect();
      void forceBannedExit();
      return;
    }

    // Token expiré / invalide : on le renouvelle puis on retente une fois
    if (/token/i.test(error.message) && !refreshing) {
      refreshing = true;
      const ok = await refreshSession();
      refreshing = false;
      if (ok && socket && !socket.connected) socket.connect();
    }
  });

  return socket;
}

/** Toujours la même instance (connectée ou non). null uniquement côté serveur (SSR). */
export function getSocket(): TypedSocket | null {
  return ensureSocket();
}

/** Ouvre la connexion (la session est portée par le cookie httpOnly). */
export function connectSocket(): TypedSocket | null {
  const s = ensureSocket();
  if (s && !s.connected) s.connect();
  return s;
}

/**
 * Ferme la connexion (déconnexion volontaire).
 * L'instance et les écouteurs des composants sont conservés : une déconnexion
 * manuelle ne déclenche pas de reconnexion automatique dans socket.io.
 */
export function disconnectSocket(): void {
  if (socket?.connected || socket?.active) socket.disconnect();
}
