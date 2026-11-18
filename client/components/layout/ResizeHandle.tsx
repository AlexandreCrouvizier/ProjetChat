/**
 * components/layout/ResizeHandle.tsx — Poignée entre deux panneaux (grand écran)
 *
 * Souris : glisser pour changer la largeur, double-clic pour revenir à la largeur par défaut.
 * Clavier : Tab jusqu'à la poignée, puis ← / → (16 px), Début / Fin (minimum / maximum).
 */
'use client';

import { useRef } from 'react';

interface Props {
  /** Panneau réglé : à gauche de la poignée (salons) ou à droite (membres) */
  side: 'left' | 'right';
  width: number; min: number; max: number;
  label: string;
  /** persist = false pendant le glissement, true au relâchement */
  onResize: (width: number, persist: boolean) => void;
  onReset: () => void;
}

export function ResizeHandle({ side, width, min, max, label, onResize, onReset }: Props) {
  const drag = useRef<{ x: number; w: number; last: number } | null>(null);
  const dir = side === 'left' ? 1 : -1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: width, last: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const w = Math.min(max, Math.max(min, drag.current.w + (e.clientX - drag.current.x) * dir));
    drag.current.last = w;
    onResize(w, false);
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const w = drag.current.last;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    onResize(w, true);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    let w: number | null = null;
    if (e.key === 'ArrowRight') w = width + step * dir;
    else if (e.key === 'ArrowLeft') w = width - step * dir;
    else if (e.key === 'Home') w = min;
    else if (e.key === 'End') w = max;
    if (w === null) return;
    e.preventDefault();
    onResize(Math.min(max, Math.max(min, w)), true);
  };

  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      aria-valuenow={Math.round(width)} aria-valuemin={min} aria-valuemax={max}
      title={`${label} — glisser pour régler, double-clic pour la largeur par défaut`}
      data-testid={`resize-${side === 'left' ? 'sidebar' : 'members'}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}
      onDoubleClick={onReset} onKeyDown={onKeyDown}
      className="group w-2.5 flex-shrink-0 cursor-col-resize flex items-center justify-center outline-none touch-none">
      <span className="w-[3px] h-12 rounded-full bg-[var(--border-s)] opacity-0 transition-all group-hover:opacity-100 group-hover:bg-[var(--acc)] group-focus-visible:opacity-100 group-focus-visible:bg-[var(--acc)] group-active:opacity-100 group-active:bg-[var(--acc)]" />
    </div>
  );
}
