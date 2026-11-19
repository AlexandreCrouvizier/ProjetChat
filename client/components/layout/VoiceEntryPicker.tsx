/**
 * components/layout/VoiceEntryPicker.tsx — Où afficher les boutons voix / vidéo / écran (profil, onglet « Moi »)
 *
 * Affiché seulement quand l'admin laisse le choix (« option ») et que la voix n'est pas désactivée.
 * Plusieurs emplacements peuvent être cochés ensemble ; aucun coché = aucun bouton.
 * Le choix est appliqué tout de suite et enregistré sur le compte (le serveur revérifie).
 */
'use client';

import { useVoiceStore, VOICE_PLACES, VOICE_PLACE_INFO, entryPlaces, DEFAULT_ENTRY, type VoicePlace } from '@/hooks/useVoice';

/** true si le sélecteur doit être affiché */
export function useShowVoiceEntry(): boolean {
  return useVoiceStore((s) => !!s.status && s.status.mode !== 'off' && s.status.entry?.rule === 'option');
}

export function VoiceEntryPicker() {
  const entry = useVoiceStore((s) => s.status?.entry);
  const saving = useVoiceStore((s) => s.saving);
  const error = useVoiceStore((s) => s.error);
  const choose = useVoiceStore((s) => s.chooseEntry);
  if (!entry || entry.rule !== 'option') return null;

  const active = new Set<VoicePlace>(entryPlaces(entry.effective));
  const toggle = (p: VoicePlace) => {
    const next = new Set(active);
    if (next.has(p)) next.delete(p); else next.add(p);
    choose(next.size ? VOICE_PLACES.filter((x) => next.has(x)).join(',') : 'none');
  };

  return (
    <div data-testid="voice-entry-picker">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Emplacements des boutons d'appel">
        {VOICE_PLACES.map((p) => {
          const on = active.has(p);
          return (
            <button key={p} type="button" role="checkbox" aria-checked={on} disabled={saving} data-place={p} onClick={() => toggle(p)}
              className={`flex flex-col gap-0.5 text-left p-2.5 min-h-[56px] rounded-xl border transition-all
                ${on ? 'border-[var(--acc)] bg-[var(--acc-s)]' : 'border-[var(--border)] bg-[var(--glass)] hover:bg-[var(--glass-h)]'}`}>
              <span className={`text-[12px] font-semibold ${on ? 'text-[var(--t1)]' : 'text-[var(--t2)]'}`}>{on ? '✔ ' : ''}{VOICE_PLACE_INFO[p].label}</span>
              <span className="text-[10px] leading-snug text-[var(--t3)]">{VOICE_PLACE_INFO[p].hint}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--t3)]">
        <span className="flex-1">{active.size === 0 ? '🙈 Aucun bouton affiché' : 'Plusieurs emplacements possibles'} · enregistré sur votre compte{saving && ' · ⏳'}</span>
        {entry.preference !== null && (
          <button type="button" disabled={saving} onClick={() => choose(null)} data-testid="voice-entry-reset"
            className="underline hover:text-[var(--t1)]">Par défaut ({entryPlaces(DEFAULT_ENTRY).length} emplacements)</button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}
