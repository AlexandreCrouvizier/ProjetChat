'use client';
/**
 * components/chat/AudioMessage.tsx — Lecteur d'un message vocal dans la discussion
 * Lecture / pause, barre de progression (cliquable), durée, vitesse ×1 / ×1,5 / ×2.
 * Un seul vocal joue à la fois.
 */
import { useEffect, useId, useRef, useState } from 'react';

const fmt = (s: number) => { const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const RATES = [1, 1.5, 2];

export function AudioMessage({ src, durationMs }: { src: string; durationMs: number | null }) {
  const id = useId();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(durationMs ? durationMs / 1000 : 0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    const stopOthers = (e: Event) => { if ((e as CustomEvent).detail !== id) ref.current?.pause(); };
    window.addEventListener('chatapp:audio-play', stopOthers);
    return () => window.removeEventListener('chatapp:audio-play', stopOthers);
  }, [id]);

  const toggle = () => {
    const a = ref.current; if (!a) return;
    if (a.paused) { window.dispatchEvent(new CustomEvent('chatapp:audio-play', { detail: id })); a.play().catch(() => setError(true)); }
    else a.pause();
  };
  const cycleRate = () => { const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; setRate(next); if (ref.current) ref.current.playbackRate = next; };

  return (
    <span className="inline-flex items-center gap-2 mt-1 px-2.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--glass)] max-w-full w-[280px]" data-testid="audio-message">
      <audio ref={ref} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
        onError={() => setError(true)} />
      <button type="button" onClick={toggle} disabled={error} aria-label={playing ? 'Pause' : 'Écouter le message vocal'} data-testid="audio-play"
        className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-[var(--acc)] to-indigo-500 disabled:opacity-40">
        {playing ? '❚❚' : '▶'}
      </button>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <input type="range" min={0} max={dur || 1} step={0.1} value={Math.min(time, dur || 1)} aria-label="Position de lecture"
          onChange={(e) => { const v = Number(e.target.value); if (ref.current) ref.current.currentTime = v; setTime(v); }}
          className="w-full accent-[var(--acc)] h-1" />
        <span className="text-[10px] text-[var(--t3)]">{error ? 'Lecture impossible' : `🎤 ${fmt(playing || time ? time : dur)}${dur ? ` / ${fmt(dur)}` : ''}`}</span>
      </span>
      <button type="button" onClick={cycleRate} aria-label="Vitesse de lecture" data-testid="audio-rate"
        className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-[var(--t2)] border border-[var(--border)] hover:bg-[var(--glass-h)]">
        ×{String(rate).replace('.', ',')}
      </button>
    </span>
  );
}
