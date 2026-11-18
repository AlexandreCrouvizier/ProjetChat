/**
 * hooks/useMobileLayout.ts — Disposition de l'écran sur téléphone / tablette en portrait
 *
 *   stack   : pile d'écrans (liste des salons → discussion plein écran, bouton ← pour revenir)
 *   tabs    : onglets en bas (Salons · Messages · Discussion · Moi)
 *   drawers : tiroirs latéraux (discussion plein écran, salons à gauche, membres à droite)
 *
 * La règle vient de l'admin (Panel → Paramètres, par type de compte). Quand elle vaut « option »,
 * le membre choisit dans son profil : le choix est enregistré sur son compte (il le suit sur tous ses appareils).
 * 🔐 Le serveur revérifie tout (choix fermé, refus si l'admin impose la disposition).
 */
'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import api from '@/lib/api';

export type MobileLayout = 'stack' | 'tabs' | 'drawers';
export type MobileLayoutRule = MobileLayout | 'option';

export const MOBILE_LAYOUT_INFO: Record<MobileLayout, { label: string; hint: string }> = {
  stack: { label: "Pile d'écrans", hint: 'Liste des salons, puis discussion en plein écran' },
  tabs: { label: 'Onglets en bas', hint: 'Salons, Messages, Discussion et Moi à portée de pouce' },
  drawers: { label: 'Tiroirs latéraux', hint: 'Discussion en plein écran, salons et membres sur les côtés' },
};

interface LayoutState {
  userId: string | null;
  rule: MobileLayoutRule;
  preference: MobileLayout | null;
  effective: MobileLayout;
  loaded: boolean;
  saving: boolean;
  error: string;
  load: (userId: string) => Promise<void>;
  choose: (layout: MobileLayout) => Promise<boolean>;
}

const isLayout = (v: unknown): v is MobileLayout => v === 'stack' || v === 'tabs' || v === 'drawers';
const isRule = (v: unknown): v is MobileLayoutRule => isLayout(v) || v === 'option';

export const useLayoutStore = create<LayoutState>((set, get) => ({
  userId: null,
  rule: 'stack',
  preference: null,
  effective: 'stack',
  loaded: false,
  saving: false,
  error: '',

  async load(userId) {
    if (get().userId === userId && get().loaded) return;
    set({ userId });
    try {
      const { data } = await api.get('/users/me/layout');
      if (get().userId !== userId) return; // un autre compte s'est connecté entre-temps
      set({
        rule: isRule(data?.rule) ? data.rule : 'stack',
        preference: isLayout(data?.preference) ? data.preference : null,
        effective: isLayout(data?.effective) ? data.effective : 'stack',
        loaded: true,
      });
    } catch {
      set({ loaded: true }); // valeurs par défaut : pile d'écrans
    }
  },

  async choose(layout) {
    if (!isLayout(layout) || get().rule !== 'option') return false;
    const before = { preference: get().preference, effective: get().effective };
    set({ preference: layout, effective: layout, saving: true, error: '' }); // appliqué tout de suite
    try {
      const { data } = await api.patch('/users/me/layout', { mobile_layout: layout });
      set({
        rule: isRule(data?.rule) ? data.rule : get().rule,
        preference: isLayout(data?.preference) ? data.preference : layout,
        effective: isLayout(data?.effective) ? data.effective : layout,
        saving: false,
      });
      return true;
    } catch (err: any) {
      set({ ...before, saving: false, error: err?.response?.data?.message || 'Enregistrement impossible' });
      return false;
    }
  },
}));

/** Charge la disposition du compte connecté et la renvoie */
export function useMobileLayout(userId: string | null | undefined) {
  const state = useLayoutStore();
  const load = state.load;
  useEffect(() => { if (userId) load(userId); }, [userId, load]);
  return state;
}
