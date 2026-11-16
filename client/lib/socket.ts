import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types/websocket.types';
import { showModal } from '@/components/ui/AppModal';

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
 *     Maintenant : token lu dans localStorage à chaque tentative + renouvellement automatique.
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

/** Renouvelle l'access token avec le refresh token. true si réussi. */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false; // invités : pas de refresh token
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.access_token) return false;
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

/** Crée l'instance unique (sans se connecter) — navigateur uniquement */
function ensureSocket(): TypedSocket | null {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;

  socket = io(getSocketUrl(), {
    autoConnect: false,
    // Fonction → le token le plus récent est envoyé à chaque tentative de connexion
    auth: (cb) => cb({ token: localStorage.getItem('access_token') || '' }),
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

  socket.on('connect_error', async (error) => {
    console.error('❌ Erreur WebSocket:', error.message);

    // Compte banni : prévenir clairement l'utilisateur (pas de nouvelle tentative)
    if (error.message === 'Compte suspendu') {
      showModal('Votre compte est suspendu. Vous ne pouvez plus accéder au chat pour le moment.', 'error');
      return;
    }

    // Token expiré / invalide : on le renouvelle puis on retente une fois
    if (/token/i.test(error.message) && !refreshing) {
      refreshing = true;
      const ok = await refreshAccessToken();
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

/**
 * Ouvre la connexion. Le paramètre token est conservé pour compatibilité :
 * le token réellement utilisé est relu dans localStorage à chaque connexion.
 */
export function connectSocket(_token?: string): TypedSocket | null {
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
