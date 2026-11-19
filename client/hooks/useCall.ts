/**
 * hooks/useCall.ts — Appel en cours (LiveKit) et sonnerie des messages privés (Lot B)
 *
 * Voix (micro, participants, « qui parle »), caméra et partage d'écran (si le jeton les autorise : c'est LiveKit
 * qui refuse toute fonction non accordée par le serveur).
 *
 * 🔐 - Le jeton est demandé au serveur à chaque connexion (POST /api/voice/token) : il revérifie tout.
 *      Il n'est jamais conservé (ni dans l'état, ni dans le stockage du navigateur).
 *    - Le code de LiveKit n'est chargé qu'au moment de rejoindre un appel (le chat n'est pas alourdi).
 *    - Rien n'est publié sans clic : le micro s'allume uniquement après « rejoindre ».
 */
'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
import api from '@/lib/api';
import type { RoomKind, VoiceCap } from '@/hooks/useVoice';
import { UNAVAILABLE_MESSAGE } from '@/hooks/useVoice';
import type { VoiceRingPayload } from '@shared/types/websocket.types';
import { mediaPrefs, mediaAvailable } from '@/hooks/useMediaPrefs';

export interface CallTarget { kind: RoomKind; groupId?: string | null; conversationId?: string | null; label: string }
export interface CallParticipant { identity: string; name: string; isLocal: boolean; speaking: boolean; micOn: boolean }
export type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';
export interface IncomingCall extends VoiceRingPayload { receivedAt: number }
/** Image vidéo affichée (caméra ou écran partagé) ; la piste elle-même est gardée hors de l'état */
export interface CallTile { id: string; identity: string; name: string; source: 'camera' | 'screen'; isLocal: boolean }
const tileTracks = new Map<string, any>();
/** Piste vidéo d'une image (pour l'attacher à un élément <video>) */
export function getTileTrack(id: string): any { return tileTracks.get(id); }
/** Partage d'écran possible dans ce navigateur ? (absent sur la plupart des téléphones) */
export function canShareScreen(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator.mediaDevices as any)?.getDisplayMedia;
}

/** Délai sans réponse avant de raccrocher un appel privé sortant */
const NO_ANSWER_MS = 45_000;
/** Délai maximum pour se connecter au serveur d'appels (sinon : « injoignable », le chat continue) */
const CONNECT_TIMEOUT_MS = 30_000;
/** Délai laissé à l'audio pour s'établir (UDP, puis repli en TCP) */
const PC_TIMEOUT_MS = 25_000;

interface CallState {
  status: CallStatus;
  target: CallTarget | null;
  participants: CallParticipant[];
  caps: VoiceCap[];
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  tiles: CallTile[];
  startedAt: number;
  /** Appel privé sortant : en attente de l'autre personne */
  waiting: boolean;
  /** Le navigateur a bloqué la lecture du son : un clic sur « Activer le son » est nécessaire */
  needsAudioStart: boolean;
  note: string;
  incoming: IncomingCall | null;
  mics: { deviceId: string; label: string }[];
  micId: string;

  join: (target: CallTarget, cap: VoiceCap, opts?: { ring?: boolean }) => Promise<void>;
  leave: (note?: string) => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  startAudio: () => Promise<void>;
  loadMics: () => Promise<void>;
  switchMic: (deviceId: string) => Promise<void>;
  say: (note: string) => void;
  receiveRing: (ring: VoiceRingPayload) => void;
  clearIncoming: (conversationId?: string, note?: string) => void;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
}

// Objets LiveKit (hors de l'état : non sérialisables)
let room: any = null;
let audioBox: HTMLDivElement | null = null;
let noAnswerTimer: ReturnType<typeof setTimeout> | null = null;
let noteTimer: ReturnType<typeof setTimeout> | null = null;

const sameTarget = (a: CallTarget | null, b: CallTarget | null) =>
  !!a && !!b && (a.groupId || null) === (b.groupId || null) && (a.conversationId || null) === (b.conversationId || null);

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Adresses LiveKit possibles vues de ce navigateur, dans l'ordre d'essai.
 * LiveKit annoncé sur « localhost » (développement) : d'abord l'adresse de cette page (téléphone du Wi-Fi),
 * puis localhost (le PC lui-même ouvert par son adresse Wi-Fi, LiveKit n'écoutant que sur 127.0.0.1).
 */
function candidateUrls(url: string): string[] {
  try {
    const u = new URL(url);
    const page = window.location.hostname;
    if (!LOOPBACK.includes(u.hostname)) return [u.origin];
    const list: string[] = [];
    if (!LOOPBACK.includes(page)) { const v = new URL(u.origin); v.hostname = page; list.push(v.origin); }
    list.push(u.origin);
    if (u.hostname !== '127.0.0.1') { const v = new URL(u.origin); v.hostname = '127.0.0.1'; list.push(v.origin); }
    return [...new Set(list)];
  } catch { return [url]; }
}

/** LiveKit répond-il à cette adresse ? (requête simple, sans lecture de la réponse) */
async function reachable(wsUrl: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(wsUrl.replace(/^ws/, 'http'), { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch { return false; } finally { clearTimeout(t); }
}

/** Paires ICE (chemins réseau essayés) d'une salle LiveKit — pour le diagnostic */
async function icePairs(r: any): Promise<{ selected: string; all: string[] }> {
  const out = { selected: '', all: [] as string[] };
  for (const pc of [r?.engine?.pcManager?.subscriber, r?.engine?.pcManager?.publisher].filter(Boolean)) {
    let stats: RTCStatsReport | undefined;
    try { stats = await pc.getStats?.(); } catch { continue; }
    if (!stats) continue;
    const byId = new Map<string, any>(); let pairId = '';
    stats.forEach((v: any) => { byId.set(v.id, v); if (v.type === 'transport' && v.selectedCandidatePairId) pairId = v.selectedCandidatePairId; });
    const fmt = (c: any) => `${c?.candidateType || '?'}/${String(c?.protocol || '?').toUpperCase()} ${c?.address || ''}:${c?.port ?? '?'}`;
    stats.forEach((v: any) => {
      if (v.type !== 'candidate-pair') return;
      if (!pairId && v.state === 'succeeded' && (v.selected || v.nominated)) pairId = v.id;
      out.all.push(`${fmt(byId.get(v.localCandidateId))} → ${fmt(byId.get(v.remoteCandidateId))} [${v.state}]`);
    });
    const pair = byId.get(pairId);
    if (pair && !out.selected) {
      const rem = byId.get(pair.remoteCandidateId) || {}; const loc = byId.get(pair.localCandidateId) || {};
      const proto = String(rem.protocol || loc.protocol || '').toUpperCase();
      const where = rem.address ? `${rem.address}:${rem.port}` : rem.port ? `port ${rem.port}` : '';
      out.selected = `${proto === 'TCP' ? 'TCP (repli, un peu moins fluide)' : proto === 'UDP' ? 'UDP (idéal)' : 'réseau'}${where ? ` → ${where}` : ''}${rem.candidateType === 'prflx' ? ' (adresse traduite en route)' : ''}`;
    }
  }
  return out;
}

/** Message clair à partir d'une erreur de connexion LiveKit (le détail technique va dans la console) */
function explain(e: any, url: string): string {
  const status = Number(e?.status) || 0;
  console.warn('[Appel] connexion impossible', { url, raison: e?.reasonName ?? e?.reason, status, message: e?.message });
  if (status === 401 || status === 403) return 'Le serveur d\'appel refuse l\'accès (clés LiveKit ou horloge) — l\'admin peut cliquer « Vérifier »';
  if (/délai|pc connection|peer ?connection|timed? ?out/i.test(String(e?.message))) return 'Le serveur d\'appel répond mais la connexion audio n\'aboutit pas (ports 7881 / 7882)';
  return `Serveur d'appel injoignable depuis cet appareil (${url.replace(/^wss?:\/\//, '')})`;
}

function ensureAudioBox(): HTMLDivElement {
  if (audioBox && document.body.contains(audioBox)) return audioBox;
  audioBox = document.createElement('div');
  audioBox.dataset.testid = 'call-audio';
  audioBox.style.display = 'none';
  document.body.appendChild(audioBox);
  return audioBox;
}

function clearTimers() {
  if (noAnswerTimer) { clearTimeout(noAnswerTimer); noAnswerTimer = null; }
}

export const useCallStore = create<CallState>((set, get) => {
  /** Recalcule la liste des participants depuis la salle */
  const refresh = () => {
    if (!room) return;
    const lp = room.localParticipant;
    const list: CallParticipant[] = [{
      identity: lp.identity, name: lp.name || 'Moi', isLocal: true, speaking: !!lp.isSpeaking, micOn: !!lp.isMicrophoneEnabled,
    }];
    for (const p of room.remoteParticipants.values()) {
      list.push({ identity: p.identity, name: p.name || 'Membre', isLocal: false, speaking: !!p.isSpeaking, micOn: !!p.isMicrophoneEnabled });
    }
    const waiting = get().waiting && list.length < 2;
    if (!waiting) clearTimers();
    // Images vidéo : caméras et écrans partagés (les miennes et celles des autres)
    const tiles: CallTile[] = [];
    tileTracks.clear();
    const collect = (p: any, isLocal: boolean) => {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind !== 'video' || !pub.track || pub.isMuted) continue;
        const source = pub.source === 'screen_share' ? 'screen' : pub.source === 'camera' ? 'camera' : null;
        if (!source) continue;
        const id = `${p.identity}:${pub.trackSid}`;
        tileTracks.set(id, pub.track);
        tiles.push({ id, identity: p.identity, name: p.name || (isLocal ? 'Moi' : 'Membre'), source, isLocal });
      }
    };
    collect(lp, true);
    for (const p of room.remoteParticipants.values()) collect(p, false);
    set({ participants: list, micOn: !!lp.isMicrophoneEnabled, camOn: !!lp.isCameraEnabled, screenOn: !!lp.isScreenShareEnabled, tiles, waiting });
  };

  const cleanup = () => {
    clearTimers();
    room = null;
    if (audioBox) audioBox.replaceChildren();
    tileTracks.clear();
    set({ status: 'idle', target: null, participants: [], caps: [], micOn: false, camOn: false, screenOn: false, tiles: [], waiting: false, needsAudioStart: false, startedAt: 0 });
  };

  return {
    status: 'idle', target: null, participants: [], caps: [], micOn: false, camOn: false, screenOn: false, tiles: [], startedAt: 0,
    waiting: false, needsAudioStart: false, note: '', incoming: null, mics: [], micId: '',

    say(note) {
      set({ note });
      if (noteTimer) clearTimeout(noteTimer);
      if (note) noteTimer = setTimeout(() => set({ note: '' }), 5000);
    },

    async join(target, cap, opts) {
      const st = get();
      if (st.status === 'connecting') return;
      if (st.status !== 'idle' && sameTarget(st.target, target)) {
        if (cap === 'voice' && !st.micOn && st.caps.includes('voice')) await get().toggleMic();
        else if (cap === 'video') await get().toggleCam();
        else if (cap === 'screen') await get().toggleScreen();
        return;
      }
      if (st.status !== 'idle') await get().leave();

      set({ status: 'connecting', target, participants: [], note: '' });
      let data: any;
      try {
        ({ data } = await api.post('/voice/token', {
          group_id: target.groupId || undefined, conversation_id: target.conversationId || undefined,
          capabilities: [cap], ring: opts?.ring ?? true,
        }));
      } catch (err: any) {
        cleanup();
        get().say(err?.response?.data?.message || UNAVAILABLE_MESSAGE);
        return;
      }

      // Message privé : la sonnerie part dès le jeton (même si la connexion audio met du temps)
      const ringing = !!target.conversationId && data.ring === 'sent';
      if (ringing) {
        set({ waiting: true });
        noAnswerTimer = setTimeout(() => {
          if (get().waiting) get().leave(`${target.label.replace(/^@/, '')} n'a pas répondu`);
        }, NO_ANSWER_MS);
      } else if (target.conversationId && data.ring === 'unavailable') {
        get().say('Ton interlocuteur ne peut pas recevoir d\'appel pour le moment');
      }

      // Adresse de LiveKit joignable depuis ce navigateur
      const urls = candidateUrls(String(data.url));
      let url = '';
      for (const c of urls) { if (await reachable(c)) { url = c; break; } }
      if (get().target !== target) return; // quitté entre-temps
      if (!url) {
        console.warn('[Appel] LiveKit ne répond à aucune de ces adresses :', urls);
        await get().leave(`Serveur d'appel injoignable depuis cet appareil (${urls[0].replace(/^wss?:\/\//, '')})`);
        return;
      }

      let lk: typeof import('livekit-client');
      try { lk = await import('livekit-client'); } catch { cleanup(); get().say(UNAVAILABLE_MESSAGE); return; }
      const prefs = mediaPrefs();
      const r = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          ...(prefs.mic ? { deviceId: prefs.mic } : {}),
        },
        videoCaptureDefaults: { resolution: { width: 960, height: 540, frameRate: 24 }, ...(prefs.cam ? { deviceId: prefs.cam } : {}) },
        ...(prefs.speaker ? { audioOutput: { deviceId: prefs.speaker } } : {}),
      });
      room = r;
      const E = lk.RoomEvent;
      r.on(E.ParticipantConnected, refresh)
        .on(E.ParticipantDisconnected, (p: any) => {
          refresh();
          const t = get().target;
          // Message privé : l'autre a raccroché → on termine l'appel
          if (t?.conversationId && r.remoteParticipants.size === 0) get().leave(`${p?.name || 'Ton interlocuteur'} a raccroché`);
        })
        .on(E.ActiveSpeakersChanged, refresh)
        .on(E.TrackMuted, refresh)
        .on(E.TrackUnmuted, refresh)
        .on(E.LocalTrackPublished, refresh)
        .on(E.LocalTrackUnpublished, refresh)
        .on(E.TrackPublished, refresh)
        .on(E.TrackUnpublished, refresh)
        .on(E.ParticipantNameChanged, refresh)
        .on(E.TrackSubscribed, (track: any) => {
          if (track.kind === lk.Track.Kind.Audio) ensureAudioBox().appendChild(track.attach());
          refresh();
        })
        .on(E.TrackUnsubscribed, (track: any) => { track.detach().forEach((el: HTMLElement) => el.remove()); refresh(); })
        .on(E.AudioPlaybackStatusChanged, () => set({ needsAudioStart: !r.canPlaybackAudio }))
        .on(E.Reconnecting, () => set({ status: 'reconnecting' }))
        .on(E.Reconnected, () => { set({ status: 'connected' }); refresh(); })
        .on(E.Disconnected, (reason?: number) => {
          if (room !== r) return; // déjà quitté volontairement
          if (get().status === 'connecting') return; // échec de connexion : expliqué plus bas
          const R = lk.DisconnectReason;
          const msg = reason === R.PARTICIPANT_REMOVED ? 'Tu as été retiré de l\'appel'
            : reason === R.ROOM_DELETED ? 'L\'appel a été fermé'
            : reason === R.DUPLICATE_IDENTITY ? 'Tu as rejoint cet appel depuis un autre appareil'
            : reason === R.JOIN_FAILURE ? 'Connexion à l\'appel impossible' : 'Appel terminé';
          cleanup();
          get().say(msg);
        })
        .on(E.MediaDevicesError, () => get().say('Micro inaccessible : vérifie l\'autorisation du navigateur'));

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          r.connect(url, String(data.token), { autoSubscribe: true, peerConnectionTimeout: PC_TIMEOUT_MS }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('délai dépassé')), CONNECT_TIMEOUT_MS); }),
        ]);
      } catch (e) {
        if (room !== r) { r.disconnect().catch(() => {}); return; } // quitté pendant la connexion
        icePairs(r).then((p) => console.warn('[Appel] chemins réseau essayés (local → LiveKit) :', p.all.length ? p.all : 'aucun')).catch(() => {});
        room = null;                         // l'événement « Disconnected » qui suit est ignoré
        r.disconnect().catch(() => {});
        await get().leave(explain(e, url));
        return;
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (room !== r) { r.disconnect(); return; } // quitté pendant la connexion

      const caps: VoiceCap[] = Array.isArray(data.capabilities) ? data.capabilities : [];
      set({ status: 'connected', startedAt: Date.now(), caps });
      r.startAudio().catch(() => {}).finally(() => set({ needsAudioStart: !r.canPlaybackAudio })); // suite du clic : son autorisé
      if (caps.includes('voice')) {
        if (!mediaAvailable()) get().say('Micro indisponible sur cette adresse : il faut HTTPS (ou localhost sur ce PC). Tu entends les autres.');
        else {
          try { await r.localParticipant.setMicrophoneEnabled(true); }
          catch { get().say('Micro refusé : autorise-le dans ton navigateur (icône à gauche de l\'adresse)'); }
        }
      }
      if (cap === 'video' && caps.includes('video')) await get().toggleCam();
      if (cap === 'screen' && caps.includes('screen')) {
        // Le navigateur exige souvent un clic récent : sinon, on invite à recliquer sur 🖥️
        try { await r.localParticipant.setScreenShareEnabled(true, { audio: true }); }
        catch (e: any) { if (e?.name !== 'NotAllowedError') get().say('Clique sur 🖥️ dans la barre d\'appel pour partager ton écran'); }
      }
      refresh();
    },

    async toggleCam() {
      if (!room || !get().caps.includes('video')) return;
      if (!mediaAvailable()) { get().say('Caméra indisponible sur cette adresse : il faut HTTPS (ou localhost sur ce PC)'); return; }
      try { await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled); }
      catch (e: any) { get().say(e?.name === 'NotAllowedError' ? 'Caméra refusée : autorise-la dans ton navigateur' : 'Caméra introuvable ou déjà utilisée'); }
      refresh();
    },

    async toggleScreen() {
      if (!room || !get().caps.includes('screen')) return;
      if (!canShareScreen()) { get().say('Partage d\'écran impossible sur cet appareil'); return; }
      try { await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled, { audio: true }); }
      catch (e: any) { if (e?.name !== 'NotAllowedError') get().say('Partage d\'écran impossible'); }
      refresh();
    },

    async leave(note) {
      const r = room;
      const st = get();
      // Message privé : l'autre est prévenu (« Appel manqué » s'il n'a pas décroché, « a raccroché » sinon)
      if (st.status !== 'idle' && st.target?.conversationId) {
        api.post('/voice/ring/cancel', { conversation_id: st.target.conversationId }).catch(() => {});
      }
      cleanup();
      if (r) { try { await r.disconnect(); } catch { /* déjà fermé */ } }
      if (note) get().say(note);
    },

    async toggleMic() {
      if (!room || !get().caps.includes('voice')) return;
      try { await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled); }
      catch { get().say('Micro refusé : autorise-le dans ton navigateur'); }
      refresh();
    },

    async startAudio() {
      if (!room) return;
      try { await room.startAudio(); } catch { /* le navigateur refuse encore */ }
      set({ needsAudioStart: !room.canPlaybackAudio });
    },

    async loadMics() {
      try {
        const { Room } = await import('livekit-client');
        const list = await Room.getLocalDevices('audioinput', false);
        set({ mics: list.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micro ${i + 1}` })) });
      } catch { set({ mics: [] }); }
    },

    async switchMic(deviceId) {
      if (!room) return;
      try { await room.switchActiveDevice('audioinput', deviceId); set({ micId: deviceId }); }
      catch { get().say('Impossible d\'utiliser ce micro'); }
    },

    receiveRing(ring) {
      const st = get();
      // Déjà dans cet appel : rien à faire
      if (st.status !== 'idle' && st.target?.conversationId === ring.conversation_id) return;
      set({ incoming: { ...ring, receivedAt: Date.now() } });
    },

    clearIncoming(conversationId, note) {
      const inc = get().incoming;
      if (!inc || (conversationId && inc.conversation_id !== conversationId)) return;
      set({ incoming: null });
      if (note) get().say(note);
    },

    async accept() {
      const inc = get().incoming;
      if (!inc) return;
      set({ incoming: null });
      await get().join({ kind: 'dm', conversationId: inc.conversation_id, label: `@${inc.from.username}` },
        inc.capabilities.includes('voice') ? 'voice' : inc.capabilities[0] || 'voice', { ring: false });
    },

    async decline() {
      const inc = get().incoming;
      if (!inc) return;
      set({ incoming: null });
      api.post('/voice/ring/decline', { conversation_id: inc.conversation_id }).catch(() => {});
    },
  };
});

/**
 * Test de connexion (profil) : rejoint une salle personnelle vide et indique par où passe l'audio.
 * Rien n'est publié (ni micro ni caméra).
 */
export async function testCallConnection(): Promise<{ ok: boolean; message: string }> {
  let data: any;
  try { ({ data } = await api.post('/voice/test-token')); }
  catch (err: any) { return { ok: false, message: err?.response?.data?.message || UNAVAILABLE_MESSAGE }; }
  const urls = candidateUrls(String(data.url));
  let url = '';
  for (const c of urls) { if (await reachable(c)) { url = c; break; } }
  if (!url) return { ok: false, message: `❌ Serveur d'appel injoignable depuis cet appareil (${urls.join(', ').replace(/wss?:\/\//g, '')})` };
  const lk = await import('livekit-client');
  const r = new lk.Room();
  const t0 = performance.now();
  try {
    await r.connect(url, String(data.token), { autoSubscribe: false, peerConnectionTimeout: PC_TIMEOUT_MS });
    const ms = Math.round(performance.now() - t0);
    const p = await icePairs(r);
    return { ok: true, message: `✅ Connexion audio établie en ${(ms / 1000).toFixed(1)} s${p.selected ? ` — ${p.selected}` : ''}` };
  } catch (e) {
    const p = await icePairs(r).catch(() => ({ all: [] as string[] }));
    console.warn('[Appel] chemins réseau essayés (local → LiveKit) :', p.all.length ? p.all : 'aucun');
    return { ok: false, message: `❌ ${explain(e, url)}${p.all.length ? ` — ${p.all.length} chemin(s) essayé(s), détail dans la console (F12)` : ''}` };
  } finally {
    r.disconnect().catch(() => {});
  }
}

/**
 * Écoute la sonnerie des messages privés (à monter une fois, sur la page de discussion).
 * Quitte l'appel en cours quand la page est fermée (déconnexion, changement de page).
 */
export function useCallSignals(): void {
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const st = useCallStore.getState;
    const onRing = (d: VoiceRingPayload) => st().receiveRing(d);
    const onStop = (d: { conversation_id: string }) => st().clearIncoming(d.conversation_id);
    const onCancelled = (d: { conversation_id: string; by: { username: string } }) => {
      const s = st();
      if (s.incoming?.conversation_id === d.conversation_id) { s.clearIncoming(d.conversation_id, `Appel manqué de ${d.by.username}`); return; }
      // Déjà en appel avec lui : s'il n'est plus dans l'appel (ou n'y est jamais arrivé), on termine
      if (s.status !== 'idle' && s.target?.conversationId === d.conversation_id && !s.participants.some((p) => !p.isLocal)) {
        s.leave(`${d.by.username} a raccroché`);
      }
    };
    const onDeclined = (d: { conversation_id: string; by: { username: string } }) => {
      const s = st();
      const msg = `${d.by.username} ne veut pas répondre pour le moment`;
      if (s.status !== 'idle' && s.target?.conversationId === d.conversation_id) s.leave(msg);
      else s.say(msg);
    };
    socket.on('voice:ring', onRing);
    socket.on('voice:ring_stop', onStop);
    socket.on('voice:ring_cancelled', onCancelled);
    socket.on('voice:ring_declined', onDeclined);
    return () => {
      socket.off('voice:ring', onRing);
      socket.off('voice:ring_stop', onStop);
      socket.off('voice:ring_cancelled', onCancelled);
      socket.off('voice:ring_declined', onDeclined);
      st().leave();
      st().clearIncoming();
    };
  }, []);
}
