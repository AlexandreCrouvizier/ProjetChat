'use client';
/**
 * components/chat/VoiceButtons.tsx — Boutons voix / vidéo / partage d'écran
 *
 *   mode « off »         : rien n'est affiché
 *   mode « unavailable » : boutons grisés, « Indisponible pour le moment »
 *   mode « on »          : boutons actifs pour les fonctions que le serveur autorise dans CE salon ; un clic rejoint l'appel
 *
 * Emplacement : en-tête du salon et/ou liste des membres, selon la règle de l'admin ou le choix du membre.
 * 🔐 Chaque clic redemande un jeton au serveur, qui revérifie tout (mode, type de compte, salon).
 */
import { useEffect, useRef, useState } from 'react';
import { useCallStore } from '@/hooks/useCall';
import { useVoiceStore, entryPlaces, VOICE_CAPS, VOICE_CAP_INFO, UNAVAILABLE_MESSAGE, type VoiceCap, type RoomKind } from '@/hooks/useVoice';

interface Props {
  where: 'header' | 'member' | 'composer' | 'send' | 'media';
  kind: RoomKind;
  groupId?: string | null;
  conversationId?: string | null;
  /** Classe des boutons (taille, couleurs) */
  btnClass?: string;
  /** Nom du membre visé (liste des membres) */
  targetName?: string;
  /** Nom de l'appel affiché dans la barre d'appel (« #général », « @Alice ») */
  label?: string;
  /** Texte affiché avant les boutons (menu média), seulement s'il y a des boutons */
  caption?: string;
}

export function VoiceButtons({ where, kind, groupId, conversationId, btnClass = '', targetName, caption, label }: Props) {
  const status = useVoiceStore((s) => s.status);
  const loadRoom = useVoiceStore((s) => s.loadRoom);
  const roomKey = groupId ? `g:${groupId}` : conversationId ? `c:${conversationId}` : '';
  const room = useVoiceStore((s) => (roomKey ? s.rooms[roomKey] : undefined));
  const [note, setNote] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mode = status?.mode;
  const join = useCallStore((s) => s.join);
  const camOn = useCallStore((s) => s.camOn);
  const screenOn = useCallStore((s) => s.screenOn);
  const inThisCall = useCallStore((s) => s.status !== 'idle' && !!s.target
    && (s.target.groupId || null) === (groupId || null) && (s.target.conversationId || null) === (conversationId || null));

  useEffect(() => {
    if (mode === 'on' && roomKey) loadRoom(roomKey, groupId ? `group_id=${encodeURIComponent(groupId)}` : `conversation_id=${encodeURIComponent(conversationId || '')}`);
  }, [mode, roomKey, groupId, conversationId, loadRoom]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!status || status.mode === 'off') return null;
  const effective = status.entry?.effective ?? 'header';        // visiteur : en-tête
  if (!entryPlaces(effective).includes(where === 'member' ? 'members' : where)) return null;

  const unavailable = status.mode === 'unavailable';
  const decisions = room?.decisions ?? status.matrix?.[kind];
  const shown: VoiceCap[] = VOICE_CAPS.filter((c) => (unavailable ? status.caps[c] : decisions?.[c]?.allowed));
  if (shown.length === 0) return null;

  const say = (msg: string) => {
    setNote(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(''), 3500);
  };
  const press = async (cap: VoiceCap) => {
    if (unavailable) { say(UNAVAILABLE_MESSAGE); return; }
    await join({ kind, groupId, conversationId, label: label || (conversationId ? 'Message privé' : 'Salon') }, cap);
  };

  return (
    <div className={`relative flex items-center gap-0.5 ${where === 'media' ? 'px-3 py-2 border-t border-[var(--border)]' : 'flex-shrink-0'}`} data-testid={`voice-${where}`} data-voice-mode={status.mode}>
      {caption && <span className="text-[10px] text-[var(--t3)] mr-1.5">{caption}</span>}
      {shown.map((cap) => {
        const info = VOICE_CAP_INFO[cap];
        const active = inThisCall && (cap === 'voice' || (cap === 'video' && camOn) || (cap === 'screen' && screenOn));
        const title = unavailable ? `${info.label} — ${UNAVAILABLE_MESSAGE}`
          : active ? (cap === 'voice' ? 'Appel en cours' : `${info.label} : en cours (cliquer pour arrêter)`) : `${info.ask}${targetName ? ` avec ${targetName}` : ''}`;
        return (
          <button key={cap} type="button" onClick={(e) => { e.stopPropagation(); press(cap); }}
            aria-disabled={unavailable} aria-label={title} title={title} data-testid={`voice-${where}-${cap}`} aria-pressed={active || undefined}
            className={`${btnClass} ${unavailable ? 'opacity-40 cursor-not-allowed' : ''} ${active ? '!bg-green-500/20 ring-1 ring-green-500/50' : ''}`}>
            <span aria-hidden="true" className={where === 'member' ? 'text-[12px]' : 'text-base'}>{info.icon}</span>
          </button>
        );
      })}
      {note && (
        <span role="status" data-testid="voice-note"
          className={`${where === 'media' ? 'ml-2 text-[10px]' : `absolute ${where === 'header' || where === 'member' ? 'top-full mt-1' : 'bottom-full mb-1'} right-0 z-40 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg`}`}
          style={{ background: 'var(--bg-s, #1a1a24)', border: '1px solid var(--border-s, rgba(255,255,255,0.12))', color: 'var(--t1, #fff)' }}>
          {note}
        </span>
      )}
    </div>
  );
}
