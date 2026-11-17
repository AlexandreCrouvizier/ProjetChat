/**
 * lib/banGuard.ts — Sortie immédiate et propre d'un utilisateur banni
 *
 * 🐛 Avant : le banni voyait un message, cliquait « OK »… et restait sur la page du chat,
 * à moitié déconnecté (plus de messages, plus d'envoi) avec ses cookies encore valides.
 *
 * Maintenant, dès que le serveur signale un bannissement, quelle que soit la façon
 * (notification temps réel, refus de reconnexion « Compte suspendu », API 403 ACCOUNT_SUSPENDED) :
 *   1. le motif est gardé pour l'afficher sur la page d'accueil,
 *   2. l'état local est vidé et les cookies de session sont effacés par le serveur,
 *   3. le navigateur recharge la page d'accueil (navigation complète : plus rien du chat en mémoire).
 */
import { useAuthStore } from '@/stores/authStore';

export interface BanNotice {
  duration?: string;
  reason?: string;
  expires_at?: string | null;
  admin_message?: string;
}

const STORAGE_KEY = 'chatapp_ban_notice';
/** Événement émis quand le bannissement est détecté alors qu'on est déjà sur l'accueil */
export const BAN_EVENT = 'chatapp:banned';

let leaving = false;

export async function forceBannedExit(notice: BanNotice = {}): Promise<void> {
  if (typeof window === 'undefined') return;

  // Le motif est enregistré AVANT le verrou « leaving » : si un refus générique (API 403,
  // reconnexion refusée) arrive une fraction de seconde avant la notification temps réel
  // détaillée, celle-ci complète quand même le message affiché sur l'accueil.
  try {
    // On ne remplace pas un motif détaillé par un message générique
    const previous = sessionStorage.getItem(STORAGE_KEY);
    if (!previous || notice.reason || notice.duration) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
    }
  } catch { /* stockage indisponible : message générique sur l'accueil */ }

  if (leaving) return;
  leaving = true;

  useAuthStore.getState().logout();

  // Le serveur efface les cookies httpOnly (inaccessibles au JavaScript)
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch { /* réseau coupé : les cookies sont de toute façon refusés par le serveur */ }

  if (window.location.pathname === '/') {
    // Déjà sur l'accueil : pas de rechargement (évite toute boucle), on affiche le message
    leaving = false;
    window.dispatchEvent(new Event(BAN_EVENT));
    return;
  }
  window.location.replace('/?banned=1');
}

/** Lit (et efface) le motif du bannissement à afficher sur l'accueil */
export function takeBanNotice(): BanNotice | null {
  if (typeof window === 'undefined') return null;
  // Sortie en cours : la déconnexion peut afficher l'accueil (navigation interne) juste
  // avant le rechargement complet. On ne consomme pas le motif maintenant, sinon la page
  // rechargée ne le trouverait plus et afficherait le message générique.
  if (leaving) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      sessionStorage.removeItem(STORAGE_KEY);
      return JSON.parse(raw) as BanNotice;
    }
  } catch { /* ignore */ }
  return new URLSearchParams(window.location.search).has('banned') ? {} : null;
}
