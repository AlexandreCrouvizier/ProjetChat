'use client';
/**
 * components/chat/IncomingCall.tsx — « X t'appelle » (message privé) : Décrocher / Refuser
 *
 * Petite sonnerie générée par le navigateur (aucun fichier externe) et vibration sur téléphone.
 * Sans réponse dans le délai annoncé par le serveur : « Appel manqué ».
 */
import { useEffect } from 'react';
import { useCallStore } from '@/hooks/useCall';

function ringOnce(ctx: AudioContext) {
  const now = ctx.currentTime;
  for (const [start, freq] of [[0, 880], [0.25, 660]] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.15, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + 0.25);
  }
}

export function IncomingCall() {
  const incoming = useCallStore((s) => s.incoming);
  const { accept, decline, clearIncoming } = useCallStore.getState();

  useEffect(() => {
    if (!incoming) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); } catch { ctx = null; }
    const tick = () => {
      if (ctx) { try { ringOnce(ctx); } catch { /* son bloqué par le navigateur */ } }
      try { navigator.vibrate?.([300, 150, 300]); } catch { /* pas de vibreur */ }
    };
    tick();
    const loop = setInterval(tick, 2000);
    const ms = Math.min(Math.max(incoming.expires_in, 5), 60) * 1000;
    const expire = setTimeout(() => clearIncoming(incoming.conversation_id, `Appel manqué de ${incoming.from.username}`), ms);
    return () => { clearInterval(loop); clearTimeout(expire); ctx?.close().catch(() => {}); };
  }, [incoming, clearIncoming]);

  if (!incoming) return null;
  return (
    <div role="alertdialog" aria-label={`${incoming.from.username} t'appelle`} data-testid="incoming-call"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,360px)] rounded-2xl p-4 shadow-2xl"
      style={{ background: 'rgba(18,16,32,0.97)', border: '1px solid rgba(34,197,94,0.4)' }}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-white animate-pulse"
          style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}>
          {incoming.from.username.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-white truncate">{incoming.from.username}</p>
          <p className="text-[12px] text-[var(--t3)]">t&apos;appelle {incoming.capabilities.includes('video') ? '(vidéo)' : '(vocal)'}…</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button type="button" onClick={decline} data-testid="incoming-decline"
          className="py-2.5 rounded-xl text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600">✖ Refuser</button>
        <button type="button" onClick={accept} data-testid="incoming-accept"
          className="py-2.5 rounded-xl text-[13px] font-semibold text-white bg-green-600 hover:bg-green-500">📞 Décrocher</button>
      </div>
    </div>
  );
}
