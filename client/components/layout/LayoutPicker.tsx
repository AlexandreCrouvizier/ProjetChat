/**
 * components/layout/LayoutPicker.tsx — Choix de la disposition sur téléphone (profil, onglet « Moi »)
 *
 * Affiché seulement quand l'admin laisse le choix (« option ») pour le type de compte.
 * Chaque carte montre une petite illustration de la disposition. Le choix est appliqué tout de suite
 * et enregistré sur le compte.
 */
'use client';

import { useLayoutStore, MOBILE_LAYOUT_INFO, type MobileLayout } from '@/hooks/useMobileLayout';

const ORDER: MobileLayout[] = ['stack', 'tabs', 'drawers'];

/** Petite illustration d'un téléphone (60×100) — couleurs via style (les variables CSS du thème) */
function Thumb({ layout, active }: { layout: MobileLayout; active: boolean }) {
  const acc = { fill: active ? 'var(--acc)' : 'var(--t3)' };
  const accSoft = { ...acc, opacity: 0.6 };
  const line = { fill: 'var(--border-s)' };
  const panel = { fill: 'var(--glass-s)', stroke: active ? 'var(--acc)' : 'var(--t3)', strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 60 100" className="w-[46px] h-[76px] flex-shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="58" height="98" rx="9" style={{ fill: 'var(--glass)', stroke: active ? 'var(--acc)' : 'var(--border-s)', strokeWidth: 2 }} />
      {layout === 'stack' && (<>
        <rect x="7" y="10" width="20" height="5" rx="2" style={acc} />
        {[22, 32, 42, 52].map((y) => <rect key={y} x="7" y={y} width="18" height="6" rx="2" style={line} />)}
        <rect x="31" y="8" width="23" height="84" rx="5" style={panel} />
        <rect x="35" y="14" width="10" height="3" rx="1.5" style={acc} />
        <rect x="35" y="30" width="15" height="4" rx="2" style={line} />
        <rect x="35" y="40" width="12" height="4" rx="2" style={line} />
        <rect x="34" y="82" width="17" height="6" rx="3" style={accSoft} />
        <path d="M24 60 l5 -4 l0 8 z" style={acc} />
      </>)}
      {layout === 'tabs' && (<>
        <rect x="7" y="10" width="26" height="4" rx="2" style={acc} />
        {[22, 30, 38].map((y) => <rect key={y} x="7" y={y} width={y === 30 ? 30 : 40} height="4" rx="2" style={line} />)}
        <rect x="6" y="70" width="48" height="6" rx="3" style={accSoft} />
        <rect x="1" y="81" width="58" height="1.5" style={line} />
        {[12, 24, 36, 48].map((x, i) => <circle key={x} cx={x} cy="90" r="3" style={i === 2 ? acc : line} />)}
      </>)}
      {layout === 'drawers' && (<>
        <rect x="7" y="10" width="46" height="5" rx="2" style={line} />
        {[24, 32, 40].map((y) => <rect key={y} x="26" y={y} width="26" height="4" rx="2" style={line} />)}
        <rect x="6" y="84" width="48" height="6" rx="3" style={accSoft} />
        <rect x="1" y="1" width="22" height="98" rx="9" style={panel} />
        {[12, 20, 28, 36].map((y) => <rect key={y} x="6" y={y} width="12" height="4" rx="2" style={y === 12 ? acc : line} />)}
      </>)}
    </svg>
  );
}

export function LayoutPicker({ compact = false }: { compact?: boolean }) {
  const { rule, effective, preference, choose, saving, error, loaded } = useLayoutStore();
  if (!loaded || rule !== 'option') return null;

  return (
    <div data-testid="layout-picker">
      <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-3'}`} role="radiogroup" aria-label="Disposition sur téléphone">
        {ORDER.map((l) => {
          const active = effective === l;
          return (
            <button key={l} type="button" role="radio" aria-checked={active} disabled={saving}
              data-layout={l} onClick={() => { if (!active || preference === null) choose(l); }}
              className={`flex ${compact ? 'flex-row text-left gap-3 p-2.5 min-h-[56px]' : 'flex-col items-center text-center gap-1.5 p-2.5'} rounded-xl border transition-all
                ${active ? 'border-[var(--acc)] bg-[var(--acc-s)] shadow-[0_0_20px_rgba(139,92,246,0.12)]' : 'border-[var(--border)] bg-[var(--glass)] hover:bg-[var(--glass-h)]'}`}>
              <Thumb layout={l} active={active} />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className={`text-[12px] font-semibold ${active ? 'text-[var(--t1)]' : 'text-[var(--t2)]'}`}>{MOBILE_LAYOUT_INFO[l].label}</span>
                <span className="text-[10px] leading-snug text-[var(--t3)]">{MOBILE_LAYOUT_INFO[l].hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--t3)] mt-2">
        S&apos;applique sur téléphone et tablette en portrait · enregistré sur votre compte
        {saving && ' · ⏳ enregistrement…'}
      </p>
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}
