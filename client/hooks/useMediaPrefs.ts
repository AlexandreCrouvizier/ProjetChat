/**
 * hooks/useMediaPrefs.ts — Micro, caméra et sortie son choisis par le membre (gardés dans ce navigateur)
 *
 * Les identifiants de périphériques sont propres à ce site et à ce navigateur (rien de sensible) :
 * stockage local, lu dans try/catch, valeurs vérifiées (texte court).
 */
'use client';

import { create } from 'zustand';

export interface MediaPrefs { mic: string; cam: string; speaker: string }
const KEY = 'chatapp:media';
const clean = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : '');

function read(): MediaPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { mic: clean(raw.mic), cam: clean(raw.cam), speaker: clean(raw.speaker) };
  } catch { return { mic: '', cam: '', speaker: '' }; }
}

interface State extends MediaPrefs { loaded: boolean; load: () => void; set: (p: Partial<MediaPrefs>) => void }

export const useMediaPrefs = create<State>((set, get) => ({
  mic: '', cam: '', speaker: '', loaded: false,
  load() { if (!get().loaded) set({ ...read(), loaded: true }); },
  set(p) {
    const next = { mic: get().mic, cam: get().cam, speaker: get().speaker, ...p };
    set(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  },
}));

/** Préférences actuelles (hors composant) */
export function mediaPrefs(): MediaPrefs {
  const s = useMediaPrefs.getState();
  if (!s.loaded) s.load();
  const { mic, cam, speaker } = useMediaPrefs.getState();
  return { mic, cam, speaker };
}

/** Micro / caméra utilisables sur cette page ? (HTTPS ou localhost obligatoire) */
export function mediaAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}
