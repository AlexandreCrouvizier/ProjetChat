/**
 * hooks/useVoiceRecorder.ts — Enregistrement d'un message vocal
 *
 * 🎤 → enregistrement (arrêt automatique à la durée maximum) → RÉÉCOUTE obligatoire → « Envoyer » ou « Supprimer ».
 * Rien n'est envoyé sans ce dernier clic : un vocal ne part jamais par erreur.
 * L'enregistrement reste dans le navigateur jusqu'à l'envoi ; le serveur revérifie tout (droit, durée, format, quota).
 */
'use client';

import { create } from 'zustand';
import { uploadAudio } from '@/lib/api';
import { mediaAvailable, mediaPrefs } from '@/hooks/useMediaPrefs';
import type { RoomKind } from '@/hooks/useVoice';

export interface RecTarget { kind: RoomKind; groupId?: string | null; conversationId?: string | null }
export type RecPhase = 'idle' | 'starting' | 'recording' | 'review' | 'sending';
export const recKey = (t: RecTarget | null) => (t ? `${t.groupId || ''}|${t.conversationId || ''}` : '');

interface State {
  phase: RecPhase; target: RecTarget | null; maxSeconds: number; elapsed: number;
  url: string; durationMs: number; error: string;
  start: (target: RecTarget, maxSeconds: number) => Promise<void>;
  stop: () => void;
  cancel: () => void;
  send: (onSend: (p: { type: 'audio'; file_url: string; audio_duration_ms: number }) => Promise<void>) => Promise<void>;
}

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let blob: Blob | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let discardOnStop = false;

function pickMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* navigateur ancien */ }
  }
  return '';
}
function release() {
  if (tick) { clearInterval(tick); tick = null; }
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
}

export const useVoiceRecorder = create<State>((set, get) => ({
  phase: 'idle', target: null, maxSeconds: 60, elapsed: 0, url: '', durationMs: 0, error: '',

  async start(target, maxSeconds) {
    if (get().phase !== 'idle') return;
    if (!mediaAvailable() || typeof MediaRecorder === 'undefined') {
      set({ error: 'Micro indisponible sur cette adresse : il faut HTTPS (ou localhost sur ce PC).' });
      setTimeout(() => set({ error: '' }), 5000);
      return;
    }
    set({ phase: 'starting', target, maxSeconds, elapsed: 0, error: '', url: '', durationMs: 0 });
    try {
      const mic = mediaPrefs().mic;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(mic ? { deviceId: { exact: mic } } : {}) },
      });
    } catch (e: any) {
      release();
      set({ phase: 'idle', target: null, error: e?.name === 'NotAllowedError' ? 'Micro refusé : autorise-le dans ton navigateur.' : 'Micro introuvable ou déjà utilisé.' });
      setTimeout(() => set({ error: '' }), 5000);
      return;
    }
    if (get().phase !== 'starting') { release(); return; } // annulé entre-temps
    const mime = pickMime();
    chunks = []; blob = null; discardOnStop = false;
    recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAt;
      release();
      if (discardOnStop) { chunks = []; return; }
      blob = new Blob(chunks, { type: recorder?.mimeType || mime || 'audio/webm' });
      chunks = [];
      set({ phase: 'review', url: URL.createObjectURL(blob), durationMs: Math.min(durationMs, get().maxSeconds * 1000) });
    };
    startedAt = Date.now();
    recorder.start(250);
    set({ phase: 'recording' });
    tick = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      set({ elapsed });
      if (elapsed >= get().maxSeconds) get().stop(); // durée maximum atteinte
    }, 200);
  },

  stop() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  },

  cancel() {
    const { phase, url } = get();
    if (phase === 'recording' || phase === 'starting') { discardOnStop = true; if (recorder && recorder.state !== 'inactive') recorder.stop(); }
    release();
    if (url) URL.revokeObjectURL(url);
    blob = null;
    set({ phase: 'idle', target: null, url: '', durationMs: 0, elapsed: 0 });
  },

  async send(onSend) {
    const { phase, durationMs } = get();
    if (phase !== 'review' || !blob) return;
    set({ phase: 'sending', error: '' });
    try {
      const up = await uploadAudio(blob, Math.max(300, durationMs));
      await onSend({ type: 'audio', file_url: up.url, audio_duration_ms: up.duration_ms });
      get().cancel();
    } catch (e: any) {
      set({ phase: 'review', error: e?.message || 'Envoi impossible' });
    }
  },
}));
