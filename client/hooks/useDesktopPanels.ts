/**
 * hooks/useDesktopPanels.ts — Panneaux latéraux sur grand écran (salons à gauche, membres à droite)
 *
 * Largeur réglable à la souris (ou au clavier), panneaux masquables. Le choix est gardé dans le
 * navigateur, pour chaque compte (clé « chatapp:panels:<id> »). Rien de sensible n'y est stocké :
 * seulement deux largeurs et deux cases à cocher, revérifiées à la lecture.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const PANEL_LIMITS = {
  sidebar: { min: 200, max: 420, def: 250 },
  members: { min: 180, max: 360, def: 200 },
} as const;
export type PanelName = keyof typeof PANEL_LIMITS;

export interface PanelsState { sidebarWidth: number; membersWidth: number; sidebarHidden: boolean; membersHidden: boolean }

const DEFAULTS: PanelsState = { sidebarWidth: PANEL_LIMITS.sidebar.def, membersWidth: PANEL_LIMITS.members.def, sidebarHidden: false, membersHidden: false };

const clamp = (name: PanelName, v: unknown) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return PANEL_LIMITS[name].def;
  return Math.min(PANEL_LIMITS[name].max, Math.max(PANEL_LIMITS[name].min, n));
};

function read(key: string): PanelsState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw);
    return {
      sidebarWidth: clamp('sidebar', v?.sidebarWidth),
      membersWidth: clamp('members', v?.membersWidth),
      sidebarHidden: v?.sidebarHidden === true,
      membersHidden: v?.membersHidden === true,
    };
  } catch { return DEFAULTS; }
}

export function useDesktopPanels(userId: string | null | undefined) {
  const key = userId ? `chatapp:panels:${userId}` : null;
  const [state, setState] = useState<PanelsState>(DEFAULTS);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => { if (key) setState(read(key)); }, [key]);

  const save = useCallback((next: PanelsState) => {
    if (!keyRef.current) return;
    try { window.localStorage.setItem(keyRef.current, JSON.stringify(next)); } catch { /* stockage indisponible : réglage gardé le temps de la visite */ }
  }, []);

  const update = useCallback((patch: Partial<PanelsState>, persist = true) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      next.sidebarWidth = clamp('sidebar', next.sidebarWidth);
      next.membersWidth = clamp('members', next.membersWidth);
      if (persist) save(next);
      return next;
    });
  }, [save]);

  const setWidth = useCallback((name: PanelName, width: number, persist = true) => {
    update(name === 'sidebar' ? { sidebarWidth: width } : { membersWidth: width }, persist);
  }, [update]);

  const toggle = useCallback((name: PanelName) => {
    setState((prev) => {
      const next = name === 'sidebar' ? { ...prev, sidebarHidden: !prev.sidebarHidden } : { ...prev, membersHidden: !prev.membersHidden };
      save(next);
      return next;
    });
  }, [save]);

  const reset = useCallback((name: PanelName) => setWidth(name, PANEL_LIMITS[name].def), [setWidth]);

  return { ...state, setWidth, toggle, reset };
}
