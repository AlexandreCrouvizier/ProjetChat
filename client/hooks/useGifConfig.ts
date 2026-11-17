/**
 * hooks/useGifConfig.ts
 *
 * Charge une seule fois la config GIF (provider + règles d'affichage par tier + limite)
 * et retourne si le GIF courant doit s'afficher automatiquement ou nécessiter un clic.
 *
 * Logique :
 *   1. L'admin définit par tier : 'visible' | 'masked' | 'option'
 *   2. Si 'option' → l'utilisateur choisit dans ses préférences (gif_display = 'auto' | 'click')
 *   3. Si 'visible'  → toujours auto
 *   4. Si 'masked'   → toujours clic (comportement actuel)
 */
'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

export interface GifDisplaySettings {
  guest:      'visible' | 'masked' | 'option';
  registered: 'visible' | 'masked' | 'option';
  premium:    'visible' | 'masked' | 'option';
  limit:      number;
}

// 🔐 Plus de clé API ici : la recherche passe par le serveur (/api/gifs/search)
export interface GifConfig {
  provider: string;
  display:  GifDisplaySettings;
}

// Cache module-level pour éviter des fetches répétés
let cachedConfig: GifConfig | null = null;
let fetchPromise: Promise<GifConfig> | null = null;

async function loadGifConfig(): Promise<GifConfig> {
  if (cachedConfig) return cachedConfig;
  if (fetchPromise) return fetchPromise;

  fetchPromise = api.get<GifConfig>('/gifs/config')
    .then(({ data }) => {
      cachedConfig = data;
      fetchPromise = null;
      return data;
    })
    .catch(() => {
      fetchPromise = null;
      const fallback: GifConfig = {
        provider: 'none',
        display: { guest: 'masked', registered: 'option', premium: 'visible', limit: 20 },
      };
      return fallback;
    });

  return fetchPromise;
}

/** Invalider le cache (ex: après modification admin) */
export function invalidateGifConfigCache() {
  cachedConfig = null;
}

/**
 * Retourne true si le GIF doit s'afficher automatiquement pour l'utilisateur courant.
 * false = comportement "cliquer pour afficher" (actuel).
 */
export function useGifAutoDisplay(): boolean {
  const { user } = useAuthStore();
  const [autoDisplay, setAutoDisplay] = useState(false);

  useEffect(() => {
    loadGifConfig().then((config) => {
      const tier  = (user?.tier || 'guest') as keyof GifDisplaySettings;
      const rule  = config.display[tier] as string ?? 'masked';
      const pref  = user?.gif_display ?? null;

      if (rule === 'visible') {
        setAutoDisplay(true);
      } else if (rule === 'masked') {
        setAutoDisplay(false);
      } else {
        // 'option' → suit la préférence utilisateur (null = masked par défaut)
        setAutoDisplay(pref === 'auto');
      }
    });
  }, [user]);

  return autoDisplay;
}

/** Retourne la config complète (pour le GifPicker et les settings) */
export function useGifConfig() {
  const [config, setConfig] = useState(null as GifConfig | null);

  useEffect(() => {
    loadGifConfig().then(setConfig);
  }, []);

  return config;
}
