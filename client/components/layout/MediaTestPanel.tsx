'use client';
/**
 * components/layout/MediaTestPanel.tsx — Tester et choisir son micro, sa caméra et sa sortie son (profil)
 *
 *   - Micro : jauge de niveau en direct + « Enregistrer 3 s » puis réécoute (rien n'est envoyé : tout reste dans le navigateur)
 *   - Caméra : aperçu en direct
 *   - Choix du périphérique (plusieurs micros / webcams) gardé dans ce navigateur et utilisé pendant les appels
 * Tout s'arrête (voyant du micro / de la caméra éteint) en quittant le test ou en fermant le profil.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaPrefs, mediaAvailable } from '@/hooks/useMediaPrefs';
import { testCallConnection } from '@/hooks/useCall';

type Dev = { deviceId: string; label: string };
const RECORD_MS = 3000;

function stop(stream: MediaStream | null) { stream?.getTracks().forEach((t) => t.stop()); }

export function MediaTestPanel() {
  const prefs = useMediaPrefs();
  const [mics, setMics] = useState<Dev[]>([]);
  const [cams, setCams] = useState<Dev[]>([]);
  const [speakers, setSpeakers] = useState<Dev[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState('');
  const [error, setError] = useState('');
  const [netTest, setNetTest] = useState<{ running: boolean; ok?: boolean; message?: string }>({ running: false });
  const runNetTest = async () => {
    setNetTest({ running: true });
    const r = await testCallConnection();
    setNetTest({ running: false, ...r });
  };
  const micStream = useRef<MediaStream | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number>(0);
  const video = useRef<HTMLVideoElement | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const available = typeof window !== 'undefined' && mediaAvailable();

  useEffect(() => { prefs.load(); }, [prefs]);

  const listDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const pick = (kind: MediaDeviceKind, name: string) => all.filter((d) => d.kind === kind && d.deviceId)
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${name} ${i + 1}` }));
      setMics(pick('audioinput', 'Micro')); setCams(pick('videoinput', 'Caméra')); setSpeakers(pick('audiooutput', 'Sortie'));
    } catch { /* liste indisponible */ }
  }, []);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stop(micStream.current); micStream.current = null;
    audioCtx.current?.close().catch(() => {}); audioCtx.current = null;
    setMicOn(false); setLevel(0);
  }, []);
  const stopCam = useCallback(() => {
    stop(camStream.current); camStream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamOn(false);
  }, []);

  useEffect(() => {
    if (!available) return;
    listDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', listDevices);
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', listDevices);
      stopMic(); stopCam();
    };
  }, [available, listDevices, stopMic, stopCam]);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip); }, [clip]);

  const startMic = async (deviceId = prefs.mic) => {
    setError(''); stopMic();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      micStream.current = s; setMicOn(true); listDevices();
      const ctx = new AudioContext(); audioCtx.current = ctx;
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Micro refusé : autorise-le dans ton navigateur (icône à gauche de l\'adresse)' : 'Micro introuvable ou déjà utilisé par une autre application');
    }
  };
  const startCam = async (deviceId = prefs.cam) => {
    setError(''); stopCam();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true });
      camStream.current = s; setCamOn(true); listDevices();
      if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Caméra refusée : autorise-la dans ton navigateur' : 'Caméra introuvable ou déjà utilisée par une autre application');
    }
  };

  const record = () => {
    const s = micStream.current;
    if (!s || recording || typeof MediaRecorder === 'undefined') return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(s);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      setRecording(false);
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      setClip(url);
      setTimeout(async () => {
        const a = player.current; if (!a) return;
        try { if (prefs.speaker && 'setSinkId' in a) await (a as any).setSinkId(prefs.speaker); } catch { /* sortie par défaut */ }
        a.play().catch(() => {});
      }, 50);
    };
    setRecording(true); rec.start(); setTimeout(() => rec.state !== 'inactive' && rec.stop(), RECORD_MS);
  };

  if (!available) {
    return (
      <p className="text-[11px] text-[var(--t3)]" data-testid="media-test-unavailable">
        🔒 Micro et caméra indisponibles sur cette adresse : le navigateur exige une connexion sécurisée (HTTPS), ou « localhost » sur ce PC.
      </p>
    );
  }

  const sel = 'w-full rounded-lg px-2 py-1.5 text-[12px] text-[var(--t1)] bg-[var(--glass)] border border-[var(--border)]';
  const btn = 'px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[var(--border)] hover:bg-[var(--glass-h)] text-[var(--t1)] disabled:opacity-40';
  return (
    <div className="space-y-4" data-testid="media-test">
      {/* Micro */}
      <div className="space-y-2">
        <label className="block text-[11px] text-[var(--t2)]">🎙️ Micro</label>
        <select className={sel} value={prefs.mic} data-testid="media-mic"
          onChange={(e) => { prefs.set({ mic: e.target.value }); if (micOn) startMic(e.target.value); }}>
          <option value="">Micro par défaut du système</option>
          {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
        </select>
        <div className="flex items-center gap-2 flex-wrap">
          {micOn
            ? <button type="button" className={btn} onClick={stopMic} data-testid="media-mic-stop">⏹ Arrêter</button>
            : <button type="button" className={btn} onClick={() => startMic()} data-testid="media-mic-test">▶ Tester le micro</button>}
          <button type="button" className={btn} onClick={record} disabled={!micOn || recording} data-testid="media-mic-record">
            {recording ? '🔴 Enregistrement…' : '⏺ Enregistrer 3 s et réécouter'}
          </button>
        </div>
        <div className="h-2 rounded-full bg-[var(--glass)] border border-[var(--border)] overflow-hidden" aria-label="Niveau du micro" role="meter"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} data-testid="media-mic-level">
          <div className="h-full transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%`, background: level > 0.8 ? '#f59e0b' : '#22c55e' }} />
        </div>
        <p className="text-[10px] text-[var(--t3)]">{micOn ? 'Parle : la barre doit bouger.' : 'La barre bouge quand le micro capte ta voix.'}</p>
        {clip && <audio ref={player} src={clip} controls className="w-full h-8" data-testid="media-mic-clip" />}
      </div>

      {/* Sortie son */}
      {speakers.length > 0 && (
        <div className="space-y-2">
          <label className="block text-[11px] text-[var(--t2)]">🔈 Sortie son (casque, haut-parleurs)</label>
          <select className={sel} value={prefs.speaker} data-testid="media-speaker" onChange={(e) => prefs.set({ speaker: e.target.value })}>
            <option value="">Sortie par défaut du système</option>
            {speakers.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
          </select>
        </div>
      )}

      {/* Caméra */}
      <div className="space-y-2">
        <label className="block text-[11px] text-[var(--t2)]">📹 Caméra</label>
        <select className={sel} value={prefs.cam} data-testid="media-cam"
          onChange={(e) => { prefs.set({ cam: e.target.value }); if (camOn) startCam(e.target.value); }}>
          <option value="">Caméra par défaut du système</option>
          {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
        </select>
        {camOn
          ? <button type="button" className={btn} onClick={stopCam} data-testid="media-cam-stop">⏹ Arrêter</button>
          : <button type="button" className={btn} onClick={() => startCam()} data-testid="media-cam-test">▶ Tester la caméra</button>}
        <video ref={video} muted playsInline autoPlay data-testid="media-cam-preview"
          className={`w-full max-w-[320px] aspect-video rounded-xl bg-black/40 object-cover ${camOn ? '' : 'hidden'}`} style={{ transform: 'scaleX(-1)' }} />
      </div>

      {/* Connexion au serveur d'appel */}
      <div className="space-y-2">
        <label className="block text-[11px] text-[var(--t2)]">📡 Connexion au serveur d&apos;appel</label>
        <button type="button" className={btn} onClick={runNetTest} disabled={netTest.running} data-testid="media-net-test">
          {netTest.running ? '⏳ Test en cours… (jusqu\'à 30 s)' : '▶ Tester la connexion'}
        </button>
        {netTest.message && (
          <p className={`text-[11px] ${netTest.ok ? 'text-green-400' : 'text-amber-300'}`} role="status" data-testid="media-net-result">{netTest.message}</p>
        )}
      </div>

      {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
      <p className="text-[10px] text-[var(--t3)]">Rien n&apos;est envoyé pendant ces tests. Ton choix est gardé dans ce navigateur et utilisé pendant les appels.</p>
    </div>
  );
}
