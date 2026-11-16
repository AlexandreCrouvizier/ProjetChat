/**
 * components/chat/GifPicker.tsx — version finale
 *
 * - Clé GIF via /api/config/gif (route serveur, lit .env racine)
 * - Limite configurable depuis app_settings (gif_picker_limit)
 * - Providers : Klipy > Giphy > Tenor
 * - Provider label dynamique
 *
 * .env racine :
 *   GIF_KLIPY_API_KEY=ta_clé    ← recommandé (Tenor arrêté le 30/06/2026)
 *   GIF_GIPHY_API_KEY=ta_clé    ← optionnel
 *   GIF_TENOR_API_KEY=ta_clé    ← legacy
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGifConfig } from '@/hooks/useGifConfig';

interface GifResult {
  id:       string;
  title:    string;
  preview:  string;
  original: string;
}

interface GifPickerProps {
  onSelect: (url: string, title: string) => void;
  onClose:  () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  klipy: 'Klipy',
  giphy: 'GIPHY',
  tenor: 'Tenor',
  none:  '',
};

// ─── Fetch GIFs selon le provider ────────────────────────────────────────────
async function fetchGifs(q: string, provider: string, key: string, limit: number): Promise<GifResult[]> {
  try {
    if (provider === 'klipy') {
      const base = 'https://api.klipy.com/v2';
      const url = q.trim()
        ? `${base}/search?q=${encodeURIComponent(q)}&key=${key}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`
        : `${base}/featured?key=${key}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data?.results || []).map((item: any) => ({
        id:       String(item.id),
        title:    item.title || 'GIF',
        preview:  item.media_formats?.tinygif?.url || item.media_formats?.nanogif?.url || item.media_formats?.gif?.url || '',
        original: item.media_formats?.gif?.url     || item.media_formats?.tinygif?.url || '',
      }));
    }

    if (provider === 'giphy') {
      const base = 'https://api.giphy.com/v1/gifs';
      const url = q.trim()
        ? `${base}/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=${limit}&lang=fr`
        : `${base}/trending?api_key=${key}&limit=${limit}`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data?.data || []).map((item: any) => ({
        id:       item.id,
        title:    item.title || 'GIF',
        preview:  item.images?.fixed_height_small?.url || item.images?.downsized?.url || '',
        original: item.images?.original?.url           || item.images?.downsized?.url || '',
      }));
    }

    if (provider === 'tenor') {
      const base = 'https://tenor.googleapis.com/v2';
      const url = q.trim()
        ? `${base}/search?q=${encodeURIComponent(q)}&key=${key}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`
        : `${base}/featured?key=${key}&limit=${limit}&media_filter=tinygif,gif&locale=fr_FR`;
      const res  = await fetch(url);
      const data = await res.json();
      return (data?.results || []).map((item: any) => ({
        id:       item.id,
        title:    item.title || 'GIF',
        preview:  item.media_formats?.tinygif?.url || item.media_formats?.gif?.url || '',
        original: item.media_formats?.gif?.url     || item.media_formats?.tinygif?.url || '',
      }));
    }
  } catch {
    return [];
  }
  return [];
}

// ─── Composant ───────────────────────────────────────────────────────────────
export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const config  = useGifConfig();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null as NodeJS.Timeout | null);
  const inputRef    = useRef<HTMLInputElement>(null);

  const limit    = config?.display?.limit ?? 20;
  const provider = config?.provider ?? 'none';
  const key      = config?.key ?? '';

  const load = useCallback(async (q: string) => {
    if (!config || provider === 'none') return;
    setLoading(true);
    setResults(await fetchGifs(q, provider, key, limit));
    setLoading(false);
  }, [config, provider, key, limit]);

  useEffect(() => {
    if (config && provider !== 'none') {
      load('');
      inputRef.current?.focus();
    } else if (config) {
      setLoading(false);
    }
  }, [config, provider, load]);

  useEffect(() => {
    if (!config) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, config, load]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const noKey = config?.provider === 'none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm mx-2 mb-20 sm:mb-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: '420px',
          background: 'rgba(18, 16, 32, 0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-white/10">
          <span className="text-lg">🎞️</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={provider === 'klipy' ? 'Search KLIPY…' : 'Rechercher un GIF…'}
            className="flex-1 bg-transparent text-[13px] text-[var(--t1)] outline-none placeholder:text-[var(--t3)]"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="text-[var(--t3)] hover:text-[var(--t1)] text-xs px-1">✕</button>
          )}
          <button onClick={onClose}
            className="text-[var(--t3)] hover:text-[var(--t1)] ml-1 text-sm">✕</button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-2">
          {config === null ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 rounded-full border-2 border-[var(--acc)] border-t-transparent animate-spin" />
            </div>

          ) : noKey ? (
            <div className="flex flex-col items-center justify-center h-36 gap-2 text-center px-4">
              <span className="text-2xl">🔑</span>
              <p className="text-[12px] text-[var(--t1)] font-medium">Aucune clé API configurée.</p>
              <p className="text-[11px] text-[var(--t3)] leading-relaxed">
                Ajoute dans <code className="bg-white/10 px-1 rounded">.env</code> (racine) :
              </p>
              <code className="text-[10px] bg-white/8 px-2 py-1.5 rounded-lg text-purple-300 text-left w-full">
                GIF_KLIPY_API_KEY=ta_clé
              </code>
              <a href="https://klipy.com/developers" target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-[var(--acc)] hover:underline mt-1">
                Obtenir une clé Klipy gratuite →
              </a>
            </div>

          ) : loading ? (
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: limit }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-white/10 animate-pulse" />
              ))}
            </div>

          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[var(--t3)] text-[12px]">
              {query ? `Aucun résultat pour « ${query} »` : 'Aucun GIF disponible'}
            </div>

          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {results.map(gif => (
                <button
                  key={gif.id}
                  onClick={() => onSelect(gif.original, gif.title)}
                  className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-[var(--acc)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--acc)] bg-white/5"
                  title={gif.title}
                >
                  {gif.preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gif.preview} alt={gif.title}
                      className="w-full h-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {provider !== 'none' && (
          <div className="px-3 py-1.5 border-t border-white/8 flex justify-end">
            <span className="text-[10px] text-[var(--t3)]">
              Powered by {PROVIDER_LABELS[provider] ?? provider}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
