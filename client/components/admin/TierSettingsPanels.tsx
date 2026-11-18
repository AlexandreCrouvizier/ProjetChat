'use client';
/**
 * components/admin/TierSettingsPanels.tsx — Réglages par type de compte (Panel → Paramètres)
 *
 *   - Disposition sur téléphone (Pile d'écrans / Onglets / Tiroirs / Option), par type de compte
 *   - Métadonnées des images envoyées (Supprimées / Conservées / Option), par type de compte
 *   - Historique visible à l'arrivée dans un salon (Tout / N avant l'arrivée / N derniers)
 *   - Délai entre deux messages + messages maximum par minute dans un salon
 *   - Fichiers des membres : quota de stockage + que devient un fichier déjà posté quand son auteur le supprime
 *   - Conservation des traces (LCEN) : durée + purge
 *
 * 🔐 Toutes les valeurs sont revérifiées par le serveur (choix fermés, bornes) : ce composant
 * ne fait que proposer des valeurs.
 */
import { useState } from 'react';

type Tier = 'guest' | 'registered' | 'premium';

interface Props {
  getSetting: (key: string) => string;
  updateSetting: (key: string, value: string) => void;
  settingsDirty: Record<string, string>;
  settingsSaving: boolean;
  saveSettings: () => void;
  adminApi: (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => Promise<any>;
  showToast: (msg: string) => void;
  reloadSettings: () => void;
}

const TIER_ROWS: { tier: Tier; label: string }[] = [
  { tier: 'guest', label: '👤 Invités' },
  { tier: 'registered', label: '✅ Inscrits' },
  { tier: 'premium', label: '⭐ Premium' },
];

// Paliers du curseur d'historique : 0→10 (1 par 1), 10→50 (5 par 5), 50→100 (10 par 10), puis de plus en plus larges
const HISTORY_STEPS: number[] = (() => {
  const out: number[] = [];
  for (let n = 0; n <= 10; n++) out.push(n);
  for (let n = 15; n <= 50; n += 5) out.push(n);
  for (let n = 60; n <= 100; n += 10) out.push(n);
  for (let n = 150; n <= 500; n += 50) out.push(n);
  for (let n = 600; n <= 1000; n += 100) out.push(n);
  for (let n = 1500; n <= 5000; n += 500) out.push(n);
  for (let n = 6000; n <= 10000; n += 1000) out.push(n);
  return out;
})();
const HISTORY_MAX = 100000;

// Paliers du délai entre deux messages (en millisecondes)
const DELAY_STEPS = [200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 45000, 60000, 120000, 300000, 600000];

const DEFAULT_DELAY: Record<Tier, string> = { guest: '10000', registered: '1000', premium: '500' };

// Paliers du quota de stockage (en Mo)
/** Durée de conservation des fichiers, en jours (0 = sans limite) */
const EXPIRY_STEPS = [0, 1, 2, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095, 1825, 3650];
const formatDays = (d: number) => d === 0 ? 'Sans limite' : d < 30 ? `${d} jour${d > 1 ? 's' : ''}`
  : d < 365 ? `${Math.round(d / 30)} mois (${d} j)` : `${Math.round((d / 365) * 10) / 10} an${d >= 730 ? 's' : ''} (${d} j)`;

const QUOTA_STEPS = [0, 10, 25, 50, 100, 150, 200, 300, 500, 750, 1024, 1536, 2048, 3072, 5120, 10240, 20480, 51200, 102400];
const DEFAULT_QUOTA_MB: Record<Tier, string> = { guest: '0', registered: '200', premium: '2048' };
function formatMb(mb: number): string {
  if (mb === 0) return 'Aucun envoi';
  return mb >= 1024 ? `${(mb / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${mb} Mo`;
}

const LAYOUT_CHOICES: { v: string; desc: string; hint: string }[] = [
  { v: 'stack', desc: "📚 Pile d'écrans", hint: '→ Liste des salons, puis discussion en plein écran (bouton ← et geste « retour » du téléphone)' },
  { v: 'tabs', desc: '🗂️ Onglets en bas', hint: '→ Salons · Messages · Discussion · Moi, toujours à portée de pouce (masqués quand le clavier est ouvert)' },
  { v: 'drawers', desc: '↔️ Tiroirs', hint: '→ Discussion en plein écran ; ☰ ouvre les salons à gauche, 👥 les membres à droite' },
  { v: 'option', desc: '⚙️ Option', hint: "→ Chaque membre choisit dans son profil (pile d'écrans par défaut)" },
];

const DELETE_CHOICES: { v: string; desc: string; hint: string }[] = [
  { v: 'gallery_only', desc: '🙈 Galerie seulement', hint: '→ Retiré de sa galerie uniquement : l\'image reste visible dans les messages et continue de compter dans son quota' },
  { v: 'erase', desc: '🗑️ Effacer le fichier', hint: '→ Fichier effacé (quota libéré) ; les messages affichent « supprimé par son auteur »' },
  { v: 'erase_messages', desc: '💥 Avec les messages', hint: '→ Fichier effacé et messages qui le contenaient masqués (trace LCEN conservée)' },
  { v: 'block', desc: '🔒 Interdit', hint: '→ Impossible de supprimer un fichier déjà posté (seuls les fichiers jamais utilisés peuvent l\'être)' },
  { v: 'option', desc: '⚙️ Option', hint: '→ Le membre choisit au moment de supprimer : galerie seulement, effacer le fichier, ou avec les messages' },
];

function nearestIndex(steps: number[], value: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) if (Math.abs(steps[i] - value) < Math.abs(steps[best] - value)) best = i;
  return best;
}

function formatDelay(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toLocaleString('fr-FR')} s`;
  if (ms < 60000) return `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  return `${(ms / 60000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} min`;
}

const card = 'rounded-2xl p-5 space-y-4 mt-4 max-w-2xl ml-6';
const cardStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' };
const muted = { color: 'rgba(255,255,255,0.35)' };
const faint = { color: 'rgba(255,255,255,0.25)' };

function choiceStyle(active: boolean, disabled = false) {
  return {
    background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
    border: active ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
    color: disabled ? 'rgba(255,255,255,0.18)' : active ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const;
}

function Header({ icon, title, subtitle, help }: { icon: string; title: string; subtitle: string; help?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            {title}
            {help && (
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
                aria-label={`Aide : ${title}`} title="Comment ça marche ?"
                className="w-5 h-5 rounded-full text-[11px] font-bold leading-none"
                style={{ background: open ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)', color: '#c4b5fd' }}>
                ?
              </button>
            )}
          </h3>
          <p className="text-[11px]" style={muted}>{subtitle}</p>
        </div>
      </div>
      {help && open && (
        <div className="mt-3 text-[11px] leading-relaxed rounded-lg px-3 py-2.5 space-y-1.5"
          style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)', color: 'rgba(255,255,255,0.65)' }}>
          {help}
        </div>
      )}
    </div>
  );
}

function SaveButton({ show, saving, onSave }: { show: boolean; saving: boolean; onSave: () => void }) {
  if (!show) return null;
  return (
    <div className="flex justify-end pt-2">
      <button onClick={onSave} disabled={saving}
        className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
        {saving ? '⏳…' : '💾 Sauvegarder'}
      </button>
    </div>
  );
}

/** Curseur à paliers + saisie libre (valeur personnalisée) */
function StepSlider({ steps, value, min, max, onChange, format, unit, inputScale = 1, inputStep = 1, label }: {
  steps: number[]; value: number; min: number; max: number; onChange: (v: number) => void;
  format: (v: number) => string; unit?: string; inputScale?: number; inputStep?: number; label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const n = Math.round(Number(raw.replace(',', '.')) * inputScale);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={0} max={steps.length - 1} step={1}
        value={nearestIndex(steps, value)} aria-label={label}
        onChange={(e) => onChange(steps[Number(e.target.value)])}
        className="flex-1 accent-purple-500" />
      <div className="flex items-center gap-1">
        <input type="number" inputMode="decimal" min={min / inputScale} max={max / inputScale} step={inputStep}
          aria-label={`${label} (valeur personnalisée)`}
          value={draft ?? String(value / inputScale)}
          onChange={(e) => setDraft(e.target.value)}
          // Clic dans le champ : tout est sélectionné, la saisie remplace la valeur
          onFocus={(e) => e.target.select()}
          onMouseUp={(e) => e.preventDefault()}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
          className="w-20 px-2 py-1 rounded-md text-[12px] text-right text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
        {unit && <span className="text-[11px]" style={muted}>{unit}</span>}
      </div>
      <span className="w-20 text-right text-[12px] font-bold text-purple-400">{format(value)}</span>
    </div>
  );
}

export function TierSettingsPanels({ getSetting, updateSetting, settingsDirty, settingsSaving, saveSettings, adminApi, showToast, reloadSettings }: Props) {
  const dirty = (prefixes: string[]) => Object.keys(settingsDirty).some((k) => prefixes.some((p) => k.startsWith(p)));
  const [purging, setPurging] = useState(false);

  const runPurge = async () => {
    setPurging(true);
    try {
      const d = await adminApi('post', '/lcen/purge');
      showToast(`✅ Purge terminée : ${d?.result?.total ?? 0} trace(s) effacée(s)`);
      reloadSettings();
    } catch {
      showToast('❌ Purge impossible');
    }
    setPurging(false);
  };

  let lastPurge: any = null;
  try { lastPurge = getSetting('lcen_last_purge') ? JSON.parse(getSetting('lcen_last_purge')) : null; } catch { lastPurge = null; }

  return (
    <>
      {/* ═════════════ Disposition sur téléphone, par type de compte ═════════════ */}
      <div className={card} style={cardStyle} data-testid="mobile-layout-card">
        <Header icon="📱" title="Affichage sur téléphone"
          subtitle="Disposition de l'écran sur téléphone et tablette en portrait (le grand écran garde ses trois colonnes)"
          help={<>
            <p><b>📚 Pile d&apos;écrans</b> : comme la plupart des messageries. La liste des salons et des messages privés s&apos;affiche d&apos;abord ; un appui ouvre la discussion en plein écran, le bouton ← ou le geste « retour » du téléphone ramène à la liste. En paysage et sur tablette, la liste et la discussion sont côte à côte.</p>
            <p><b>🗂️ Onglets en bas</b> : quatre onglets (Salons, Messages, Discussion, Moi). L&apos;onglet « Moi » regroupe le profil, Mes fichiers, le thème et la déconnexion. La barre d&apos;onglets disparaît quand le clavier est ouvert ; en paysage, elle passe sur le côté gauche.</p>
            <p><b>↔️ Tiroirs</b> : la discussion occupe tout l&apos;écran ; ☰ fait glisser les salons depuis la gauche, 👥 les membres depuis la droite.</p>
            <p><b>⚙️ Option</b> : chaque membre choisit dans « Modifier le profil » (et dans l&apos;onglet « Moi »). Son choix est enregistré sur son compte et le suit sur tous ses appareils. Sans choix : pile d&apos;écrans.</p>
          </>} />
        {TIER_ROWS.map(({ tier, label }) => {
          const key = `mobile_layout_${tier}`;
          const val = getSetting(key) || (tier === 'guest' ? 'stack' : 'option');
          return (
            <div key={tier} className="space-y-1.5">
              <p className="text-[12px] font-medium text-white">{label}</p>
              <div className="grid grid-cols-4 gap-2">
                {LAYOUT_CHOICES.map(({ v, desc }) => (
                  <button key={v} onClick={() => updateSetting(key, v)} data-testid={`${key}-${v}`}
                    className="py-2 rounded-lg text-[11px] font-medium transition-all"
                    style={choiceStyle(val === v)}>
                    {desc}
                  </button>
                ))}
              </div>
              <p className="text-[10px]" style={faint}>{LAYOUT_CHOICES.find((c) => c.v === val)?.hint}</p>
            </div>
          );
        })}
        <SaveButton show={dirty(['mobile_layout_'])} saving={settingsSaving} onSave={saveSettings} />
      </div>

      {/* ═════════════ Métadonnées des images, par type de compte ═════════════ */}
      <div className={card} style={cardStyle}>
        <Header icon="🛰️" title="Métadonnées des images envoyées"
          subtitle="Données EXIF cachées dans les photos : position GPS, modèle d'appareil, date et heure de prise de vue"
          help={<>
            <p><b>🧹 Supprimées</b> : retirées de toutes les images (recommandé, protège la vie privée).</p>
            <p><b>📎 Conservées</b> : les images sont publiées avec leurs métadonnées ; la position GPS d&apos;une photo prise chez soi devient visible par tous.</p>
            <p><b>⚙️ Option</b> : supprimées par défaut, chaque membre peut choisir de les conserver dans « Modifier le profil ».</p>
            <p>Les avatars sont toujours nettoyés. Les fichiers Premium (PDF, vidéos…) sont transmis tels quels.</p>
          </>} />
        {TIER_ROWS.map(({ tier, label }) => {
          const key = `upload_metadata_mode_${tier}`;
          const disabled = tier === 'guest';
          const val = disabled ? '' : (getSetting(key) || 'strip');
          return (
            <div key={tier} className="space-y-1.5">
              <p className="text-[12px] font-medium text-white">{label}</p>
              <div className="flex gap-2">
                {([
                  { v: 'strip', desc: '🧹 Supprimées' },
                  { v: 'keep', desc: '📎 Conservées' },
                  { v: 'option', desc: '⚙️ Option' },
                ]).map(({ v, desc }) => (
                  <button key={v} disabled={disabled} onClick={() => updateSetting(key, v)}
                    className="flex-1 py-2 rounded-lg text-[11px] font-medium transition-all"
                    style={choiceStyle(val === v, disabled)}>
                    {desc}
                  </button>
                ))}
              </div>
              <p className="text-[10px]" style={faint}>
                {disabled ? '→ Les invités ne peuvent pas envoyer d\'images'
                  : val === 'strip' ? '→ Retirées de toutes les images'
                  : val === 'keep' ? '→ Publiées avec leurs métadonnées'
                  : '→ Chaque membre choisit dans son profil (supprimées par défaut)'}
              </p>
              {val === 'keep' && (
                <p className="text-[11px] px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(251,191,36,0.07)', color: 'rgba(251,191,36,0.7)', border: '1px solid rgba(251,191,36,0.12)' }}>
                  ⚠️ Les membres ne sont pas prévenus : à réserver à un usage précis.
                </p>
              )}
            </div>
          );
        })}
        <SaveButton show={dirty(['upload_metadata_mode_'])} saving={settingsSaving} onSave={saveSettings} />
      </div>

      {/* ═════════════ Historique visible à l'arrivée dans un salon ═════════════ */}
      <div className={card} style={cardStyle}>
        <Header icon="📜" title="Historique des salons"
          subtitle="Messages déjà postés qu'un compte peut lire quand il arrive dans un salon"
          help={<>
            <p><b>♾️ Tout</b> : tout l&apos;historique du salon est visible, depuis le premier message.</p>
            <p><b>⏮️ Avant l&apos;arrivée</b> : le compte voit les <b>N messages qui précédaient sa première arrivée</b> dans le salon, puis tout ce qui est posté ensuite. La limite est fixée une fois pour toutes : quitter le salon et revenir ne donne pas accès à plus d&apos;anciens messages, et son historique grandit normalement avec la conversation.</p>
            <p><b>🔢 Derniers</b> : à chaque visite, le compte ne voit que les <b>N derniers messages</b> du salon, même s&apos;il est membre depuis longtemps (fenêtre glissante). Utile pour réserver l&apos;historique complet aux comptes inscrits ou Premium.</p>
            <p>N = 0 : aucun ancien message (seulement ce qui est posté après l&apos;arrivée, ou après l&apos;ouverture du salon pour « Derniers »).</p>
            <p>Seuls les messages principaux comptent (les réponses d&apos;un fil suivent leur message). Une citation d&apos;un message trop ancien affiche « Message antérieur non disponible ». Les visiteurs non connectés suivent la règle des invités, en mode « Derniers ». Le superadmin voit toujours tout.</p>
          </>} />
        {TIER_ROWS.map(({ tier, label }) => {
          const ruleKey = `history_rule_${tier}`;
          const limitKey = `history_limit_${tier}`;
          const rule = getSetting(ruleKey) || 'all';
          const limit = Number(getSetting(limitKey) || '50');
          return (
            <div key={tier} className="space-y-1.5">
              <p className="text-[12px] font-medium text-white">{label}</p>
              <div className="flex gap-2">
                {([
                  { v: 'all', desc: '♾️ Tout' },
                  { v: 'before_join', desc: '⏮️ Avant l\'arrivée' },
                  { v: 'last', desc: '🔢 Derniers' },
                ]).map(({ v, desc }) => (
                  <button key={v} onClick={() => updateSetting(ruleKey, v)}
                    className="flex-1 py-2 rounded-lg text-[11px] font-medium transition-all"
                    style={choiceStyle(rule === v)}>
                    {desc}
                  </button>
                ))}
              </div>
              {rule !== 'all' && (
                <StepSlider steps={HISTORY_STEPS} value={limit} min={0} max={HISTORY_MAX}
                  label={`Nombre de messages visibles (${label})`}
                  onChange={(v) => updateSetting(limitKey, String(v))}
                  format={(v) => `${v.toLocaleString('fr-FR')} msg`} />
              )}
              <p className="text-[10px]" style={faint}>
                {rule === 'all' ? '→ Tout l\'historique est visible'
                  : rule === 'before_join' ? `→ Les ${limit.toLocaleString('fr-FR')} message(s) précédant son arrivée, puis tout ce qui suit`
                  : `→ Seulement les ${limit.toLocaleString('fr-FR')} dernier(s) message(s) du salon, à chaque visite`}
              </p>
            </div>
          );
        })}
        <SaveButton show={dirty(['history_'])} saving={settingsSaving} onSave={saveSettings} />
      </div>

      {/* ═════════════ Délais entre messages + anti-flood ═════════════ */}
      <div className={card} style={cardStyle}>
        <Header icon="⏱️" title="Rythme d'envoi des messages"
          subtitle="Délai minimum entre deux messages et nombre maximum de messages par minute dans un salon"
          help={<>
            <p><b>Délai minimum</b> : temps à attendre entre deux messages (salons et messages privés). Entre 0,2 s et 10 min.</p>
            <p><b>Messages par minute</b> : nombre maximum de messages d&apos;un même compte dans un même salon (ou une même conversation privée) sur une minute glissante. Entre 1 et 60.</p>
            <p>Les deux règles s&apos;additionnent : avec 1 s et 5 messages/min, un membre peut envoyer 5 messages rapides puis doit attendre. Un message identique répété 3 fois en une minute est toujours refusé.</p>
          </>} />
        {TIER_ROWS.map(({ tier, label }) => {
          const delayKey = `rate_limit_ms_${tier}`;
          const floodKey = `flood_max_per_minute_${tier}`;
          const delay = Number(getSetting(delayKey) || DEFAULT_DELAY[tier]);
          const flood = Number(getSetting(floodKey) || '5');
          return (
            <div key={tier} className="space-y-2">
              <p className="text-[12px] font-medium text-white">{label}</p>
              <div>
                <p className="text-[10px] mb-1" style={muted}>Délai minimum entre deux messages</p>
                <StepSlider steps={DELAY_STEPS} value={delay} min={200} max={600000}
                  label={`Délai entre deux messages (${label})`} unit="s" inputScale={1000} inputStep={0.1}
                  onChange={(v) => updateSetting(delayKey, String(v))} format={formatDelay} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={muted}>Messages maximum par minute dans un salon</p>
                <StepSlider steps={Array.from({ length: 60 }, (_, i) => i + 1)} value={flood} min={1} max={60}
                  label={`Messages par minute (${label})`}
                  onChange={(v) => updateSetting(floodKey, String(v))} format={(v) => `${v} / min`} />
              </div>
            </div>
          );
        })}
        <SaveButton show={dirty(['rate_limit_ms_', 'flood_max_per_minute_'])} saving={settingsSaving} onSave={saveSettings} />
      </div>

      {/* ═════════════ Fichiers des membres : quota + suppression ═════════════ */}
      <div className={card} style={cardStyle}>
        <Header icon="📁" title="Fichiers des membres"
          subtitle="Espace de stockage, suppression par l'auteur et durée de conservation des fichiers de chaque compte"
          help={<>
            <p><b>Quota</b> : place totale des images et fichiers d&apos;un compte (avatar compris). Les miniatures ne comptent pas. 0 = aucun envoi.</p>
            <p><b>Suppression d&apos;un fichier déjà posté</b> (un fichier jamais utilisé est toujours effacé) :</p>
            <p>🙈 <b>Galerie seulement</b> : il disparaît de « Mes fichiers » mais reste visible dans les messages — il occupe toujours de la place.</p>
            <p>🗑️ <b>Effacer le fichier</b> : le fichier est effacé du serveur (place libérée), les messages restent avec la mention « Image supprimée par son auteur ».</p>
            <p>💥 <b>Avec les messages</b> : le fichier est effacé et les messages qui le contenaient sont masqués (ils restent consultables par la modération : obligation LCEN).</p>
            <p>🔒 <b>Interdit</b> : un fichier utilisé dans un message ne peut pas être supprimé (utile pour garder des conversations complètes).</p>
            <p>⚙️ <b>Option</b> : le membre choisit, au moment de supprimer, parmi les trois premières possibilités.</p>
            <p>⌛ <b>Durée de conservation</b> : passé ce délai, les images et fichiers (pas les avatars) sont effacés automatiquement (vérification toutes les heures) ; les messages affichent « Image expirée ». Si vous raccourcissez le délai, les fichiers devenus trop anciens sont effacés à la vérification suivante. 0 = conservés sans limite.</p>
            <p>Dans tous les cas, la trace de l&apos;envoi (auteur, date, IP) est conservée selon la durée LCEN.</p>
          </>} />
        {TIER_ROWS.map(({ tier, label }) => {
          const quotaKey = `storage_quota_mb_${tier}`;
          const modeKey = `upload_delete_mode_${tier}`;
          const expiryKey = `upload_expiry_days_${tier}`;
          const expiry = Number(getSetting(expiryKey) || 0);
          const disabled = tier === 'guest';
          const quota = Number(getSetting(quotaKey) || DEFAULT_QUOTA_MB[tier]);
          const mode = getSetting(modeKey) || 'option';
          return (
            <div key={tier} className="space-y-2">
              <p className="text-[12px] font-medium text-white">{label}</p>
              {disabled ? (
                <p className="text-[10px]" style={faint}>→ Les invités ne peuvent pas envoyer de fichiers</p>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] mb-1" style={muted}>Quota de stockage</p>
                    <StepSlider steps={QUOTA_STEPS} value={quota} min={0} max={102400}
                      label={`Quota de stockage (${label})`} unit="Mo"
                      onChange={(v) => updateSetting(quotaKey, String(v))} format={formatMb} />
                  </div>
                  <div>
                    <p className="text-[10px] mb-1" style={muted}>Suppression d&apos;un fichier déjà posté</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {DELETE_CHOICES.map(({ v, desc }) => (
                        <button key={v} onClick={() => updateSetting(modeKey, v)}
                          className="py-2 px-1 rounded-lg text-[10px] font-medium transition-all leading-tight"
                          style={choiceStyle(mode === v)}>
                          {desc}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1" style={faint}>{DELETE_CHOICES.find((c) => c.v === mode)?.hint}</p>
                  </div>
                  <div>
                    <p className="text-[10px] mb-1" style={muted}>Durée de conservation des fichiers</p>
                    <StepSlider steps={EXPIRY_STEPS} value={expiry} min={0} max={3650}
                      label={`Durée de conservation (${label})`} unit="jours"
                      onChange={(v) => updateSetting(expiryKey, String(v))} format={formatDays} />
                  </div>
                </>
              )}
            </div>
          );
        })}
        <SaveButton show={dirty(['storage_quota_mb_', 'upload_delete_mode_', 'upload_expiry_days_'])} saving={settingsSaving} onSave={saveSettings} />
      </div>

      {/* ═════════════ Conservation des traces (LCEN) ═════════════ */}
      <div className={card} style={cardStyle}>
        <Header icon="🗄️" title="Conservation des traces (LCEN)"
          subtitle="Adresses IP et journaux de connexion : gardés le temps exigé par la loi, puis effacés"
          help={<>
            <p>La LCEN impose de conserver pendant <b>1 an</b> les données permettant d&apos;identifier l&apos;auteur d&apos;un contenu (IP, date). Le RGPD interdit de les garder plus longtemps que nécessaire.</p>
            <p>Chaque nuit (et au démarrage du serveur), les traces plus anciennes que la durée choisie sont effacées : IP des messages, des fichiers envoyés et des sessions, journal des connexions et des actions, historique IP des invités, sessions expirées.</p>
            <p><b>Les messages eux-mêmes ne sont pas supprimés</b> : seule l&apos;adresse IP associée est effacée. Les bannissements actifs sont conservés.</p>
          </>} />
        <div>
          <p className="text-[10px] mb-1" style={muted}>Durée de conservation (365 jours minimum)</p>
          <StepSlider steps={[365, 400, 450, 500, 547, 600, 730, 1095, 1460, 1825, 3650]}
            value={Number(getSetting('lcen_retention_days') || '365')} min={365} max={3650}
            label="Durée de conservation des traces" unit="j"
            onChange={(v) => updateSetting('lcen_retention_days', String(v))}
            format={(v) => (v % 365 === 0 ? `${v / 365} an${v >= 730 ? 's' : ''}` : `${v} j`)} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px]" style={faint}>
            {lastPurge?.at
              ? `Dernière purge : ${new Date(lastPurge.at).toLocaleString('fr-FR')} — ${lastPurge.total ?? 0} trace(s) effacée(s)`
              : 'Aucune purge effectuée pour l\'instant'}
          </p>
          <button onClick={runPurge} disabled={purging}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
            {purging ? '⏳ Purge…' : '🧹 Lancer la purge maintenant'}
          </button>
        </div>
        <SaveButton show={dirty(['lcen_'])} saving={settingsSaving} onSave={saveSettings} />
      </div>
    </>
  );
}
