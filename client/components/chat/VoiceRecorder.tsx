'use client';
/**
 * components/chat/VoiceRecorder.tsx — Bouton 🎤 (aux emplacements choisis par l'admin) + panneau d'enregistrement
 *
 * Panneau : ● enregistrement (durée / maximum) → « Terminer » ou « Annuler »
 *           puis réécoute → « Envoyer » ou « Supprimer ». Jamais d'envoi sans ce dernier clic.
 */
import { useEffect } from 'react';
import { useVoiceStore } from '@/hooks/useVoice';
import { useVoiceRecorder, recKey, type RecTarget } from '@/hooks/useVoiceRecorder';

const fmt = (s: number) => { const t = Math.max(0, Math.floor(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** Le membre peut-il envoyer un vocal ici, et à cet emplacement ? */
function useVoiceMsgRule(target: RecTarget | null) {
  const status = useVoiceStore((s) => s.status);
  const loadRoom = useVoiceStore((s) => s.loadRoom);
  const key = target?.groupId ? `g:${target.groupId}` : target?.conversationId ? `c:${target.conversationId}` : '';
  const room = useVoiceStore((s) => (key ? s.rooms[key] : undefined));
  useEffect(() => {
    if (key && status?.voicemsg) loadRoom(key, target?.groupId ? `group_id=${encodeURIComponent(target.groupId)}` : `conversation_id=${encodeURIComponent(target?.conversationId || '')}`);
  }, [key, status?.voicemsg, loadRoom, target?.groupId, target?.conversationId]);
  if (!target || !status?.voicemsg) return null;
  const allowed = room?.voicemsg ?? status.voicemsg.matrix[target.kind];
  if (!allowed) return null;
  return { places: status.voicemsg.places.split(','), maxSeconds: room?.voicemsgMax ?? status.voicemsg.max_seconds };
}

export function VoiceMsgButton({ where, target, btnClass = '', asMenuItem = false, onPicked }: {
  where: 'composer' | 'send' | 'media'; target: RecTarget | null; btnClass?: string; asMenuItem?: boolean; onPicked?: () => void;
}) {
  const rule = useVoiceMsgRule(target);
  const phase = useVoiceRecorder((s) => s.phase);
  const start = useVoiceRecorder((s) => s.start);
  if (!rule || !target || !rule.places.includes(where)) return null;
  const busy = phase !== 'idle';
  const go = () => { onPicked?.(); start(target, rule.maxSeconds); };
  if (asMenuItem) {
    return (
      <>
        <div className="h-px bg-[var(--border)] mx-2" />
        <button type="button" onClick={go} disabled={busy} data-testid={`voicemsg-${where}`}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-left text-[var(--t1)] hover:bg-[var(--glass-h)] disabled:opacity-40">
          <span>🎤</span>
          <div><div className="font-medium">Message vocal</div><div className="text-[10px] text-[var(--t3)]">Jusqu&apos;à {fmt(rule.maxSeconds)} · réécoute avant envoi</div></div>
        </button>
      </>
    );
  }
  return (
    <button type="button" onClick={go} disabled={busy} data-testid={`voicemsg-${where}`}
      aria-label="Enregistrer un message vocal" title={`Message vocal (jusqu'à ${fmt(rule.maxSeconds)})`} className={`${btnClass} disabled:opacity-40`}>
      <span aria-hidden="true">🎤</span>
    </button>
  );
}

export function VoiceRecorderPanel({ target, onSend }: {
  target: RecTarget | null;
  onSend: (p: { type: 'audio'; file_url: string; audio_duration_ms: number }) => Promise<void>;
}) {
  const { phase, elapsed, maxSeconds, url, durationMs, error } = useVoiceRecorder();
  const recTarget = useVoiceRecorder((s) => s.target);
  const { stop, cancel, send } = useVoiceRecorder.getState();

  // Changement de salon pendant l'enregistrement : on abandonne (le vocal ne doit jamais partir ailleurs)
  useEffect(() => {
    if (recTarget && recKey(recTarget) !== recKey(target)) cancel();
  }, [target, recTarget, cancel]);
  // Fermeture de la page : micro libéré
  useEffect(() => () => { if (useVoiceRecorder.getState().phase !== 'idle') useVoiceRecorder.getState().cancel(); }, []);

  if (phase === 'idle') {
    return error ? <p role="alert" className="absolute bottom-full left-3 mb-2 z-30 text-[11px] text-amber-300 bg-[rgba(18,16,32,0.97)] px-3 py-1.5 rounded-lg border border-[var(--border)]">🎤 {error}</p> : null;
  }
  const btn = 'px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-40';
  return (
    <div data-testid="voicemsg-panel" data-phase={phase}
      className="absolute bottom-full left-0 right-0 mb-2 z-30 rounded-xl p-3 flex items-center gap-3 flex-wrap"
      style={{ background: 'rgba(18,16,32,0.97)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
      {(phase === 'starting' || phase === 'recording') && (
        <>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          <span className="text-[13px] text-[var(--t1)] font-medium" data-testid="voicemsg-timer">
            {phase === 'starting' ? 'Micro…' : `Enregistrement ${fmt(elapsed)} / ${fmt(maxSeconds)}`}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-[var(--glass)] overflow-hidden min-w-[60px]">
            <div className="h-full bg-red-500 transition-[width]" style={{ width: `${Math.min(100, (elapsed / maxSeconds) * 100)}%` }} />
          </div>
          <button type="button" onClick={cancel} className={`${btn} text-[var(--t2)] border border-[var(--border)] hover:bg-[var(--glass-h)]`} data-testid="voicemsg-cancel">✖ Annuler</button>
          <button type="button" onClick={stop} disabled={phase !== 'recording'} className={`${btn} text-white bg-red-500 hover:bg-red-600`} data-testid="voicemsg-stop">⏹ Terminer</button>
        </>
      )}
      {(phase === 'review' || phase === 'sending') && (
        <>
          <span className="text-[12px] text-[var(--t2)] w-full">🎧 Réécoute ton message ({fmt(durationMs / 1000)}) avant de l&apos;envoyer :</span>
          <audio src={url} controls className="flex-1 min-w-[180px] h-9" data-testid="voicemsg-preview" />
          <button type="button" onClick={cancel} disabled={phase === 'sending'} className={`${btn} text-red-300 border border-red-500/40 hover:bg-red-500/10`} data-testid="voicemsg-discard">🗑 Supprimer</button>
          <button type="button" onClick={() => send(onSend)} disabled={phase === 'sending'} className={`${btn} text-white bg-gradient-to-br from-[var(--acc)] to-indigo-500`} data-testid="voicemsg-submit">
            {phase === 'sending' ? '⏳ Envoi…' : '➤ Envoyer'}
          </button>
        </>
      )}
      {error && <p role="alert" className="w-full text-[11px] text-amber-300">{error}</p>}
    </div>
  );
}
