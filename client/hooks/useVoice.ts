/**
 * hooks/useVoice.ts — Voix / vidéo / partage d'écran : état et droits côté interface (Lot A, sans LiveKit)
 *
 * Le serveur décide de tout (GET /api/voice/status et /api/voice/permissions) ; ce fichier ne fait que
 * l'afficher : mode « off » = boutons invisibles, « unavailable » = boutons grisés, « on » = actifs.
 * 🔐 Cacher ou griser un bouton ne protège rien : POST /api/voice/token revérifie tout côté serveur.
 */
'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import api from '@/lib/api';

export type VoiceMode = 'off' | 'unavailable' | 'on';
export type VoiceCap = 'voice' | 'video' | 'screen';
export type RoomKind = 'public' | 'private' | 'dm';
/** Emplacements : liste séparée par des virgules (ex. « header,composer »), ou « none » */
export type VoicePlace = 'header' | 'members' | 'composer' | 'send' | 'media';
export const VOICE_PLACES: VoicePlace[] = ['header', 'members', 'composer', 'send', 'media'];
export type VoiceEntryChoice = string;
export type VoiceEntryRule = string;
export const DEFAULT_ENTRY = 'header,members';

/** Normalise (« both » = header,members) ; null si invalide */
export function normalizeEntry(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === 'none') return 'none';
  const set = new Set<string>();
  for (const p of t.split(',').map((x) => x.trim())) {
    if (p === 'both') { set.add('header'); set.add('members'); }
    else if ((VOICE_PLACES as string[]).includes(p)) set.add(p);
    else return null;
  }
  return set.size ? VOICE_PLACES.filter((p) => set.has(p)).join(',') : null;
}
export const entryPlaces = (v: string): VoicePlace[] => (v === 'none' ? [] : (normalizeEntry(v) ?? '').split(',').filter(Boolean) as VoicePlace[]);
export interface CapDecision { allowed: boolean; reason?: string }
export type CapDecisions = Record<VoiceCap, CapDecision>;
export interface VoiceEntry { rule: VoiceEntryRule; preference: VoiceEntryChoice | null; effective: VoiceEntryChoice }

export const VOICE_CAPS: VoiceCap[] = ['voice', 'video', 'screen'];
export const VOICE_CAP_INFO: Record<VoiceCap, { icon: string; label: string; ask: string }> = {
  voice: { icon: '🎙️', label: 'Voix', ask: 'Démarrer un appel vocal' },
  video: { icon: '📹', label: 'Vidéo', ask: 'Démarrer la vidéo' },
  screen: { icon: '🖥️', label: "Partage d'écran", ask: "Partager l'écran" },
};
export const VOICE_PLACE_INFO: Record<VoicePlace, { label: string; hint: string }> = {
  header: { label: '🔝 En-tête', hint: 'En haut du salon, à côté du titre' },
  members: { label: '👥 Liste des membres', hint: 'Un bouton à côté de chaque membre' },
  composer: { label: '⌨️ À côté de GIF', hint: 'Dans la zone de saisie, à droite du bouton GIF' },
  send: { label: '➤ À côté de Envoyer', hint: 'Dans la zone de saisie, juste avant le bouton envoyer' },
  media: { label: '📎 Menu média', hint: 'Dans le menu du trombone' },
};
export const UNAVAILABLE_MESSAGE = 'Indisponible pour le moment';

export interface VoiceStatus {
  mode: VoiceMode;
  caps: Record<VoiceCap, boolean>;
  matrix: Record<RoomKind, CapDecisions>;
  max_participants: number;
  entry: VoiceEntry | null;
  /** Messages vocaux (indépendants des appels) : autorisés par type de salon, durée max, emplacements du bouton 🎤 */
  voicemsg: { matrix: Record<RoomKind, boolean>; max_seconds: number; places: string } | null;
}

const isMode = (v: unknown): v is VoiceMode => v === 'off' || v === 'unavailable' || v === 'on';
const isChoice = (v: unknown): v is VoiceEntryChoice => normalizeEntry(v) !== null;
const isRule = (v: unknown): v is VoiceEntryRule => v === 'option' || isChoice(v);

interface VoiceState {
  userId: string | null;
  status: VoiceStatus | null;
  rooms: Record<string, { at: number; mode: VoiceMode; decisions: CapDecisions; voicemsg?: boolean; voicemsgMax?: number }>;
  saving: boolean;
  error: string;
  load: (userId: string) => Promise<void>;
  loadRoom: (key: string, query: string) => Promise<void>;
  chooseEntry: (choice: VoiceEntryChoice | null) => Promise<boolean>;
}

function parseEntry(e: any): VoiceEntry | null {
  if (!e || !isRule(e.rule)) return null;
  return {
    rule: e.rule === 'option' ? 'option' : normalizeEntry(e.rule)!,
    preference: normalizeEntry(e.preference),
    effective: normalizeEntry(e.effective) ?? DEFAULT_ENTRY,
  };
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  userId: null,
  status: null,
  rooms: {},
  saving: false,
  error: '',

  async load(userId) {
    set({ userId });
    try {
      const { data } = await api.get('/voice/status');
      if (get().userId !== userId) return; // un autre compte s'est connecté entre-temps
      const mode: VoiceMode = isMode(data?.mode) ? data.mode : 'off';
      set({
        status: {
          mode,
          caps: { voice: !!data?.caps?.voice, video: !!data?.caps?.video, screen: !!data?.caps?.screen },
          matrix: data?.matrix,
          max_participants: Number(data?.max_participants) || 0,
          entry: parseEntry(data?.entry),
          voicemsg: data?.voicemsg && typeof data.voicemsg.places === 'string' ? {
            matrix: { public: !!data.voicemsg.matrix?.public, private: !!data.voicemsg.matrix?.private, dm: !!data.voicemsg.matrix?.dm },
            max_seconds: Number(data.voicemsg.max_seconds) || 60, places: data.voicemsg.places,
          } : null,
        },
        rooms: mode === get().status?.mode ? get().rooms : {},
      });
    } catch {
      // Service injoignable : les boutons restent invisibles, le chat n'est pas touché
      if (get().userId === userId) set({ status: null });
    }
  },

  async loadRoom(key, query) {
    const cached = get().rooms[key];
    if (cached && Date.now() - cached.at < 30_000 && cached.mode === get().status?.mode) return;
    try {
      const { data } = await api.get(`/voice/permissions?${query}`);
      if (!data?.decisions) return;
      set({ rooms: { ...get().rooms, [key]: {
        at: Date.now(), mode: isMode(data.mode) ? data.mode : 'off', decisions: data.decisions,
        voicemsg: data.voicemsg === true, voicemsgMax: Number(data.voicemsg_max_seconds) || undefined,
      } } });
    } catch { /* on garde les droits par type de salon */ }
  },

  async chooseEntry(choice) {
    const st = get().status;
    if (!st?.entry || st.entry.rule !== 'option') return false;
    if (choice !== null && !isChoice(choice)) return false;
    if (choice !== null) choice = normalizeEntry(choice);
    const before = st.entry;
    set({ saving: true, error: '', status: { ...st, entry: { ...before, preference: choice, effective: choice ?? DEFAULT_ENTRY } } }); // appliqué tout de suite
    try {
      const { data } = await api.patch('/voice/entry', { voice_entry: choice });
      const entry = parseEntry(data);
      set({ saving: false, status: { ...get().status!, entry: entry ?? before } });
      return true;
    } catch (err: any) {
      set({ saving: false, status: { ...get().status!, entry: before }, error: err?.response?.data?.message || 'Enregistrement impossible' });
      return false;
    }
  },
}));

/** Charge l'état voix du compte connecté (et le rafraîchit chaque minute : l'admin peut changer le mode) */
export function useVoice(userId: string | null | undefined) {
  const state = useVoiceStore();
  const load = state.load;
  useEffect(() => {
    if (!userId) return;
    load(userId);
    const t = setInterval(() => load(userId), 60_000);
    return () => clearInterval(t);
  }, [userId, load]);
  return state;
}
