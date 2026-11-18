/**
 * hooks/useViewport.ts — Taille de l'écran et clavier virtuel
 *
 *   compact : téléphone (portrait ou paysage) et tablette en portrait → disposition mobile
 *   wide    : assez large pour afficher la liste et la discussion côte à côte (paysage, tablette)
 *   keyboardOpen : un champ de saisie a le focus sur un écran tactile (le clavier virtuel est ouvert)
 */
'use client';

import { useEffect, useState } from 'react';

export const COMPACT_MAX_WIDTH = 899;   // < 900 px : téléphone et tablette en portrait
export const WIDE_MIN_WIDTH = 640;      // ≥ 640 px : liste + discussion côte à côte

export interface ViewportInfo { ready: boolean; width: number; height: number; compact: boolean; wide: boolean; touch: boolean; keyboardOpen: boolean }

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'color'].includes((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable;
}

export function useViewport(): ViewportInfo {
  // Rien n'est calculé côté serveur (taille inconnue) : « ready » passe à true au montage
  const [info, setInfo] = useState<ViewportInfo>({ ready: false, width: 0, height: 0, compact: false, wide: true, touch: false, keyboardOpen: false });

  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    let focused = isTextField(document.activeElement);
    const measure = () => {
      const width = window.innerWidth, height = window.innerHeight;
      setInfo({ ready: true, width, height, compact: width <= COMPACT_MAX_WIDTH, wide: width >= WIDE_MIN_WIDTH, touch, keyboardOpen: touch && focused });
    };
    const onFocusIn = (e: FocusEvent) => { focused = isTextField(e.target as Element); measure(); };
    const onFocusOut = () => { setTimeout(() => { focused = isTextField(document.activeElement); measure(); }, 0); };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return info;
}
