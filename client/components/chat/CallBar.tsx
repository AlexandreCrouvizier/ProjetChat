'use client';
/**
 * components/chat/CallBar.tsx — Barre de l'appel en cours (en haut de la discussion)
 *
 * Nom de l'appel, durée, participants (anneau vert quand ils parlent, 🔇 micro coupé),
 * couper / rétablir le micro, choix du micro, « Activer le son » si le navigateur l'a bloqué, raccrocher.
 */
import { useEffect, useState } from 'react';
import { useCallStore, canShareScreen } from '@/hooks/useCall';

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function CallBar() {
  const status = useCallStore((s) => s.status);
  const target = useCallStore((s) => s.target);
  const participants = useCallStore((s) => s.participants);
  const micOn = useCallStore((s) => s.micOn);
  const camOn = useCallStore((s) => s.camOn);
  const screenOn = useCallStore((s) => s.screenOn);
  const caps = useCallStore((s) => s.caps);
  const startedAt = useCallStore((s) => s.startedAt);
  const waiting = useCallStore((s) => s.waiting);
  const needsAudioStart = useCallStore((s) => s.needsAudioStart);
  const note = useCallStore((s) => s.note);
  const mics = useCallStore((s) => s.mics);
  const micId = useCallStore((s) => s.micId);
  const { leave, toggleMic, toggleCam, toggleScreen, startAudio, loadMics, switchMic } = useCallStore.getState();
  const [now, setNow] = useState(Date.now());
  const [showMics, setShowMics] = useState(false);

  useEffect(() => {
    if (status !== 'connected') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  if (status === 'idle') {
    return note ? (
      <div role="status" data-testid="call-note" className="px-4 py-1.5 text-[11px] text-[var(--t2)] border-b border-[var(--border)] bg-[var(--glass)]">
        🔔 {note}
      </div>
    ) : null;
  }

  const btn = 'h-8 px-2.5 rounded-lg flex items-center justify-center gap-1 text-[12px] font-medium transition-all flex-shrink-0';
  const canMic = caps.includes('voice');
  const label = status === 'connecting' ? 'Connexion…'
    : status === 'reconnecting' ? 'Reconnexion…'
    : waiting ? 'Ça sonne…' : duration(now - startedAt);

  return (
    <div data-testid="call-bar" data-call-status={status}
      className="relative px-3 py-2 border-b border-[var(--border)] flex items-center gap-2 flex-wrap"
      style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.10), rgba(139,92,246,0.08))' }}>
      <span className="text-base flex-shrink-0" aria-hidden="true">🔊</span>
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-[12px] font-semibold text-[var(--t1)] truncate">Appel · {target?.label}</span>
        <span className="text-[10px] text-[var(--t3)]" data-testid="call-timer">{label} · {participants.length} participant{participants.length > 1 ? 's' : ''}</span>
      </div>

      <ul className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto" aria-label="Participants de l'appel" data-testid="call-participants">
        {participants.map((p) => (
          <li key={p.identity} title={`${p.name}${p.isLocal ? ' (toi)' : ''}${p.micOn ? '' : ' — micro coupé'}`}
            data-speaking={p.speaking ? '1' : '0'} data-local={p.isLocal ? '1' : '0'}
            className="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 transition-shadow"
            style={{
              background: p.isLocal ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'linear-gradient(135deg, #10b981, #0ea5e9)',
              boxShadow: p.speaking ? '0 0 0 2px #22c55e, 0 0 10px rgba(34,197,94,0.6)' : '0 0 0 1px rgba(255,255,255,0.15)',
            }}>
            {p.name.slice(0, 1).toUpperCase()}
            {!p.micOn && <span className="absolute -bottom-1 -right-1 text-[9px]" aria-hidden="true">🔇</span>}
          </li>
        ))}
      </ul>

      {needsAudioStart && status === 'connected' && (
        <button type="button" onClick={startAudio} className={`${btn} bg-amber-500/20 text-amber-300`} data-testid="call-start-audio">
          🔈 Activer le son
        </button>
      )}
      {canMic && (
        <>
          <button type="button" onClick={toggleMic} disabled={status !== 'connected'} data-testid="call-mic" aria-pressed={!micOn}
            aria-label={micOn ? 'Couper le micro' : 'Rétablir le micro'} title={micOn ? 'Couper le micro' : 'Rétablir le micro'}
            className={`${btn} ${micOn ? 'bg-[var(--glass-h)] text-[var(--t1)]' : 'bg-red-500/20 text-red-300'}`}>
            {micOn ? '🎙️' : '🔇'}
          </button>
          <button type="button" onClick={() => { if (!showMics) loadMics(); setShowMics((v) => !v); }} data-testid="call-mic-choice"
            aria-expanded={showMics} aria-label="Choisir le micro" title="Choisir le micro"
            className={`${btn} text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)]`}>⚙️</button>
        </>
      )}
      {caps.includes('video') && (
        <button type="button" onClick={toggleCam} disabled={status !== 'connected'} data-testid="call-cam" aria-pressed={camOn}
          aria-label={camOn ? 'Couper la caméra' : 'Allumer la caméra'} title={camOn ? 'Couper la caméra' : 'Allumer la caméra'}
          className={`${btn} ${camOn ? 'bg-green-500/20 text-green-300' : 'text-[var(--t2)] hover:bg-[var(--glass-h)]'}`}>
          📹
        </button>
      )}
      {caps.includes('screen') && canShareScreen() && (
        <button type="button" onClick={toggleScreen} disabled={status !== 'connected'} data-testid="call-screen" aria-pressed={screenOn}
          aria-label={screenOn ? 'Arrêter le partage d\'écran' : 'Partager mon écran'} title={screenOn ? 'Arrêter le partage d\'écran' : 'Partager mon écran'}
          className={`${btn} ${screenOn ? 'bg-green-500/20 text-green-300' : 'text-[var(--t2)] hover:bg-[var(--glass-h)]'}`}>
          🖥️
        </button>
      )}
      <button type="button" onClick={() => leave()} data-testid="call-leave" aria-label="Quitter l'appel" title="Quitter l'appel"
        className={`${btn} bg-red-500 text-white hover:bg-red-600`}>
        📞 Quitter
      </button>

      {showMics && (
        <div className="absolute right-3 top-full mt-1 z-40 w-64 rounded-xl p-2 space-y-1 shadow-xl"
          style={{ background: 'rgba(18,16,32,0.97)', border: '1px solid rgba(255,255,255,0.12)' }} data-testid="call-mic-list">
          <p className="text-[10px] text-[var(--t3)] px-1 pb-1">Micro utilisé</p>
          {mics.length === 0 && <p className="text-[11px] text-[var(--t3)] px-1">Aucun micro trouvé</p>}
          {mics.map((m) => (
            <button key={m.deviceId} type="button" onClick={() => { switchMic(m.deviceId); setShowMics(false); }}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[12px] truncate hover:bg-[var(--glass-h)] ${micId === m.deviceId ? 'text-[var(--acc)]' : 'text-[var(--t1)]'}`}>
              {micId === m.deviceId ? '✔ ' : ''}{m.label}
            </button>
          ))}
        </div>
      )}
      {note && (
        <p role="status" data-testid="call-note" className="w-full text-[11px] text-[var(--t2)]">🔔 {note}</p>
      )}
    </div>
  );
}
