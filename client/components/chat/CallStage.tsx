'use client';
/**
 * components/chat/CallStage.tsx — Images vidéo de l'appel (caméras, écrans partagés)
 *
 * Un écran partagé s'affiche en grand, les caméras en bandeau ; sinon une grille.
 * Double-clic (ou ⛶) : plein écran. Ma caméra est affichée en miroir (comme un miroir, pas pour les autres).
 * « Réduire » masque les images sans couper l'appel.
 */
import { useEffect, useRef, useState } from 'react';
import { useCallStore, getTileTrack, type CallTile } from '@/hooks/useCall';

function VideoTile({ tile, big = false }: { tile: CallTile; big?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = getTileTrack(tile.id);
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => { try { track.detach(el); } catch { /* déjà détachée */ } };
  }, [tile.id]);
  const fullscreen = () => { const b = box.current as any; if (!b) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else b.requestFullscreen?.().catch(() => {}); };
  return (
    <div ref={box} onDoubleClick={fullscreen} data-testid="call-tile" data-source={tile.source} data-local={tile.isLocal ? '1' : '0'}
      className={`relative rounded-xl overflow-hidden bg-black/70 ${big ? 'w-full h-full' : 'aspect-video'}`}>
      <video ref={ref} autoPlay playsInline muted className={`w-full h-full ${tile.source === 'screen' ? 'object-contain' : 'object-cover'}`}
        style={tile.isLocal && tile.source === 'camera' ? { transform: 'scaleX(-1)' } : undefined} />
      <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-md text-[10px] text-white bg-black/60">
        {tile.source === 'screen' ? '🖥️ ' : ''}{tile.name}{tile.isLocal ? ' (toi)' : ''}
      </span>
      <button type="button" onClick={fullscreen} aria-label="Plein écran" title="Plein écran"
        className="absolute right-1.5 top-1.5 w-7 h-7 rounded-md text-white bg-black/50 hover:bg-black/70 text-[13px]">⛶</button>
    </div>
  );
}

export function CallStage() {
  const tiles = useCallStore((s) => s.tiles);
  const status = useCallStore((s) => s.status);
  const [hidden, setHidden] = useState(false);
  if (status === 'idle' || tiles.length === 0) return null;
  const screens = tiles.filter((t) => t.source === 'screen');
  const cams = tiles.filter((t) => t.source === 'camera');
  const main = screens[0];
  const others = main ? [...screens.slice(1), ...cams] : cams;
  const cols = others.length <= 1 ? 1 : others.length <= 4 ? 2 : 3;

  return (
    <div data-testid="call-stage" className="border-b border-[var(--border)] bg-black/30 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-[var(--t3)]">📹 {tiles.length} image{tiles.length > 1 ? 's' : ''} · double-clic pour le plein écran</span>
        <button type="button" onClick={() => setHidden((h) => !h)} className="text-[11px] text-[var(--t2)] hover:text-[var(--t1)]" data-testid="call-stage-toggle">
          {hidden ? '▼ Afficher' : '▲ Réduire'}
        </button>
      </div>
      {!hidden && (main ? (
        <div className="flex flex-col md:flex-row gap-2 max-h-[55vh]">
          <div className="flex-1 min-h-[180px] max-h-[55vh]"><VideoTile tile={main} big /></div>
          {others.length > 0 && (
            <div className="flex md:flex-col gap-2 md:w-48 overflow-auto">
              {others.map((t) => <div key={t.id} className="w-40 md:w-full flex-shrink-0"><VideoTile tile={t} /></div>)}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-2 max-h-[55vh] overflow-auto mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols === 1 ? 560 : undefined }}>
          {others.map((t) => <VideoTile key={t.id} tile={t} />)}
        </div>
      ))}
    </div>
  );
}
