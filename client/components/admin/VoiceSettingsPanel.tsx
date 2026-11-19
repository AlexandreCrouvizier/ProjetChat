'use client';
/**
 * components/admin/VoiceSettingsPanel.tsx — Voix / vidéo / partage d'écran (Panel → Paramètres)
 *
 *   - Mode général : Désactivée (boutons invisibles) · Indisponible (boutons grisés) · Activée
 *   - Ce que permet chaque type de compte (voix, vidéo, partage d'écran, indépendamment) + participants maximum
 *   - Ce que permet chaque type de salon (public, privé, message privé)
 *   - Où apparaissent les boutons d'appel, par type de compte (ou au choix du membre)
 *   - État de LiveKit (configuré ? répond ?)
 *
 * 🔐 Le serveur revérifie tout (valeurs fermées, bornes) et applique les droits à chaque demande d'appel.
 * Les dérogations d'un salon précis se règlent dans l'onglet « Salons ».
 */
import { useState } from 'react';

type Tier = 'guest' | 'registered' | 'premium';
type Cap = 'voice' | 'video' | 'screen';
type Room = 'public' | 'private' | 'dm';

interface Props {
  getSetting: (key: string) => string;
  updateSetting: (key: string, value: string) => void;
  settingsDirty: Record<string, string>;
  settingsSaving: boolean;
  saveSettings: () => void;
  adminApi: (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => Promise<any>;
  showToast: (msg: string) => void;
}

const TIERS: { tier: Tier; label: string }[] = [
  { tier: 'guest', label: '👤 Invités' },
  { tier: 'registered', label: '✅ Inscrits' },
  { tier: 'premium', label: '⭐ Premium' },
];
const CAPS: { cap: Cap; label: string }[] = [
  { cap: 'voice', label: '🎙️ Voix' },
  { cap: 'video', label: '📹 Vidéo' },
  { cap: 'screen', label: '🖥️ Écran' },
];
const ROOMS: { room: Room; label: string }[] = [
  { room: 'public', label: '🌐 Salons publics' },
  { room: 'private', label: '🔒 Salons privés' },
  { room: 'dm', label: '💬 Messages privés' },
];
const MODES = [
  { v: 'off', desc: '🚫 Désactivée', hint: 'Aucun bouton d\'appel n\'est affiché. Rien ne peut être démarré.' },
  { v: 'unavailable', desc: '⏳ Indisponible', hint: 'Les boutons sont visibles mais grisés, avec « Indisponible pour le moment ». Aucun appel possible.' },
  { v: 'on', desc: '✅ Activée', hint: 'Les appels sont possibles selon les droits ci-dessous, tant que LiveKit répond (sinon : indisponible).' },
];
const PLACES = [
  { v: 'header', desc: '🔝 En-tête' },
  { v: 'members', desc: '👥 Membres' },
  { v: 'composer', desc: '⌨️ Près de GIF' },
  { v: 'send', desc: '➤ Près de Envoyer' },
  { v: 'media', desc: '📎 Menu média' },
];
const placesOf = (val: string): string[] => (val === 'option' || val === 'none' ? [] : val.split(',').map((x) => (x === 'both' ? 'header,members' : x)).join(',').split(',').filter(Boolean));

// Valeurs par défaut (identiques à celles du serveur : migration 15)
const defCap = (tier: Tier, cap: Cap) => (tier === 'guest' ? 'off' : tier === 'registered' ? (cap === 'voice' ? 'on' : 'off') : 'on');
const defRoom = (room: Room, cap: Cap) => (room === 'public' ? (cap === 'voice' ? 'on' : 'off') : 'on');

const card = 'rounded-2xl p-5 space-y-4 mt-4 max-w-2xl ml-6';
const cardStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' };
const muted = { color: 'rgba(255,255,255,0.35)' };
const faint = { color: 'rgba(255,255,255,0.25)' };
const choiceStyle = (active: boolean) => ({
  background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
  border: active ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
  color: active ? '#c4b5fd' : 'rgba(255,255,255,0.4)', cursor: 'pointer',
} as const);

function Toggle({ on, onClick, testid }: { on: boolean; onClick: () => void; testid: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={on}
      className="w-full py-1.5 rounded-lg text-[11px] font-medium transition-all"
      style={on ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }
        : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
      {on ? '✔ Autorisé' : '✖ Interdit'}
    </button>
  );
}

export function VoiceSettingsPanel({ getSetting, updateSetting, settingsDirty, settingsSaving, saveSettings, adminApi, showToast }: Props) {
  const [health, setHealth] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const dirty = Object.keys(settingsDirty).some((k) => k.startsWith('voice_') || k.startsWith('voicemsg_'));
  const mode = getSetting('voice_mode') || 'off';
  const flip = (key: string, current: string) => updateSetting(key, current === 'on' ? 'off' : 'on');

  const check = async () => {
    setChecking(true);
    try { setHealth(await adminApi('get', '/voice/health')); } catch { showToast('❌ Vérification impossible'); }
    setChecking(false);
  };

  return (
    <div className={card} style={cardStyle} data-testid="voice-card">
      <div className="flex items-center gap-3">
        <span className="text-xl">🎙️</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Voix, vidéo et partage d&apos;écran</h3>
          <p className="text-[11px]" style={muted}>Appels dans les salons et les messages privés. Chaque fonction se règle séparément.</p>
        </div>
      </div>

      {/* Mode général */}
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-white">Mode général</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(({ v, desc }) => (
            <button key={v} onClick={() => updateSetting('voice_mode', v)} data-testid={`voice_mode-${v}`}
              className="py-2 rounded-lg text-[11px] font-medium transition-all" style={choiceStyle(mode === v)}>{desc}</button>
          ))}
        </div>
        <p className="text-[10px]" style={faint}>{MODES.find((m) => m.v === mode)?.hint}</p>
      </div>

      {/* Santé de LiveKit */}
      <div className="rounded-lg px-3 py-2.5 space-y-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-medium text-white flex-1">Serveur LiveKit</p>
          <button onClick={check} disabled={checking} data-testid="voice-health-check"
            className="px-3 py-1 rounded-lg text-[11px] font-medium disabled:opacity-50" style={choiceStyle(false)}>
            {checking ? '⏳…' : '🔍 Vérifier'}
          </button>
        </div>
        {health ? (
          <p className="text-[11px]" data-testid="voice-health" style={{ color: health.reachable ? '#4ade80' : health.configured ? '#fbbf24' : 'rgba(255,255,255,0.45)' }}>
            {!health.configured ? 'Non configuré (variables LIVEKIT_* absentes du .env du serveur) : les boutons restent grisés.'
              : health.reachable ? 'Configuré et joignable.' : `Configuré mais injoignable (${health.detail}) : les boutons restent grisés.`}
            {' '}Mode appliqué : <b>{health.effective === 'on' ? 'activée' : health.effective === 'unavailable' ? 'indisponible' : 'désactivée'}</b>.
          </p>
        ) : (
          <p className="text-[10px]" style={faint}>Sans LiveKit, le chat fonctionne normalement ; seuls les appels sont indisponibles.</p>
        )}
      </div>

      {/* Par type de compte */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-white">Ce que chaque type de compte peut faire</p>
        <div className="grid grid-cols-[110px_repeat(3,1fr)_70px] gap-2 items-center text-[10px]" style={muted}>
          <span />{CAPS.map((c) => <span key={c.cap} className="text-center">{c.label}</span>)}<span className="text-center">Max</span>
        </div>
        {TIERS.map(({ tier, label }) => (
          <div key={tier} className="grid grid-cols-[110px_repeat(3,1fr)_70px] gap-2 items-center">
            <span className="text-[12px] text-white">{label}</span>
            {CAPS.map(({ cap }) => {
              const key = `voice_cap_${cap}_${tier}`; const val = getSetting(key) || defCap(tier, cap);
              return <Toggle key={cap} on={val === 'on'} onClick={() => flip(key, val)} testid={key} />;
            })}
            <input type="number" min={2} max={100} data-testid={`voice_max_${tier}`}
              value={getSetting(`voice_max_${tier}`) || (tier === 'premium' ? '16' : '8')}
              onChange={(e) => updateSetting(`voice_max_${tier}`, e.target.value)}
              className="w-full py-1.5 rounded-lg text-[11px] text-center text-white bg-transparent"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }} aria-label={`Participants maximum — ${label}`} />
          </div>
        ))}
        <p className="text-[10px]" style={faint}>« Max » : participants maximum par appel (de 2 à 100).</p>
      </div>

      {/* Par type de salon */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-white">Ce que chaque type de salon autorise</p>
        <div className="grid grid-cols-[130px_repeat(3,1fr)] gap-2 items-center text-[10px]" style={muted}>
          <span />{CAPS.map((c) => <span key={c.cap} className="text-center">{c.label}</span>)}
        </div>
        {ROOMS.map(({ room, label }) => (
          <div key={room} className="grid grid-cols-[130px_repeat(3,1fr)] gap-2 items-center">
            <span className="text-[12px] text-white">{label}</span>
            {CAPS.map(({ cap }) => {
              const key = `voice_room_${cap}_${room}`; const val = getSetting(key) || defRoom(room, cap);
              return <Toggle key={cap} on={val === 'on'} onClick={() => flip(key, val)} testid={key} />;
            })}
          </div>
        ))}
        <p className="text-[10px]" style={faint}>
          Exemple : vidéo interdite dans les salons publics, autorisée dans les salons privés. Une fonction n&apos;est possible que si le type de compte
          <b> et</b> le salon l&apos;autorisent. Pour un salon précis, utiliser l&apos;onglet « Salons » (bouton 🎙️).
        </p>
      </div>

      {/* Emplacement des boutons */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-white">Où apparaissent les boutons d&apos;appel</p>
        {TIERS.map(({ tier, label }) => {
          const key = `voice_entry_${tier}`; const val = getSetting(key) || (tier === 'guest' ? 'header' : 'option');
          const chosen = placesOf(val);
          const toggle = (v: string) => {
            const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v];
            updateSetting(key, next.length ? PLACES.map((p) => p.v).filter((p) => next.includes(p)).join(',') : 'none');
          };
          return (
            <div key={tier} className="space-y-1">
              <p className="text-[11px] text-white">{label}</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => updateSetting(key, 'option')} data-testid={`${key}-option`}
                  className="py-2 rounded-lg text-[11px] font-medium transition-all col-span-3" style={choiceStyle(val === 'option')}>
                  ⚙️ Option — chaque membre choisit dans son profil
                </button>
                {PLACES.map(({ v, desc }) => (
                  <button key={v} onClick={() => toggle(v)} data-testid={`${key}-${v}`} aria-pressed={chosen.includes(v)}
                    className="py-2 rounded-lg text-[11px] font-medium transition-all" style={choiceStyle(chosen.includes(v))}>
                    {chosen.includes(v) ? '✔ ' : ''}{desc}
                  </button>
                ))}
              </div>
              {val === 'none' && <p className="text-[10px]" style={faint}>🙈 Aucun bouton pour ce type de compte.</p>}
            </div>
          );
        })}
        <p className="text-[10px]" style={faint}>Plusieurs emplacements peuvent être imposés ensemble. « Option » : chaque membre choisit dans son profil (un ou plusieurs emplacements, ou aucun bouton).</p>
      </div>

      {/* ── Messages vocaux ─────────────────────────────────────────────── */}
      <div className="space-y-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} data-testid="voicemsg-settings">
        <p className="text-[13px] font-bold text-white">🎤 Messages vocaux</p>
        <p className="text-[10px]" style={faint}>
          Enregistrés puis envoyés dans la discussion (réécoute obligatoire avant l&apos;envoi). Indépendants des appels : fonctionnent même sans LiveKit.
          Comptent dans le quota de stockage du membre (invités : 10 Mo réservés aux vocaux).
        </p>
        <div className="grid grid-cols-[100px_80px_1fr_1fr] gap-2 items-center text-[10px]" style={muted}>
          <span /><span className="text-center">Autorisé</span><span className="text-center">Durée max (s)</span><span className="text-center">Conservation (jours, 0 = illimitée)</span>
        </div>
        {TIERS.map(({ tier, label }) => {
          const capKey = `voicemsg_cap_${tier}`; const cap = getSetting(capKey) || (tier === 'guest' ? 'off' : 'on');
          const maxKey = `voicemsg_max_seconds_${tier}`; const retKey = `voicemsg_retention_days_${tier}`;
          return (
            <div key={tier} className="grid grid-cols-[100px_80px_1fr_1fr] gap-2 items-center">
              <span className="text-[12px] text-white">{label}</span>
              <Toggle on={cap === 'on'} onClick={() => flip(capKey, cap)} testid={capKey} />
              <input type="number" min={5} max={600} data-testid={maxKey} aria-label={`Durée maximum — ${label}`}
                value={getSetting(maxKey) || (tier === 'premium' ? '300' : tier === 'registered' ? '60' : '30')}
                onChange={(e) => updateSetting(maxKey, e.target.value)}
                className="w-full py-1.5 rounded-lg text-[11px] text-center text-white bg-transparent" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
              <input type="number" min={0} max={3650} data-testid={retKey} aria-label={`Conservation — ${label}`}
                value={getSetting(retKey) || '30'} onChange={(e) => updateSetting(retKey, e.target.value)}
                className="w-full py-1.5 rounded-lg text-[11px] text-center text-white bg-transparent" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
          );
        })}
        <p className="text-[10px]" style={faint}>Recommandé : invités non, inscrits 60 s, Premium 300 s (5 min) ; conservation 30 jours.</p>

        <p className="text-[12px] font-medium text-white pt-1">Par type de salon</p>
        <div className="grid grid-cols-3 gap-2">
          {ROOMS.map(({ room, label }) => {
            const key = `voicemsg_room_${room}`; const val = getSetting(key) || 'on';
            return (
              <div key={room} className="space-y-1">
                <p className="text-[11px] text-white">{label}</p>
                <Toggle on={val === 'on'} onClick={() => flip(key, val)} testid={key} />
              </div>
            );
          })}
        </div>

        <p className="text-[12px] font-medium text-white pt-1">Emplacement du bouton 🎤</p>
        {TIERS.map(({ tier, label }) => {
          const key = `voicemsg_entry_${tier}`; const val = getSetting(key) || 'send';
          const chosen = val === 'none' ? [] : val.split(',');
          const all = [{ v: 'composer', desc: '⌨️ Près de GIF' }, { v: 'send', desc: '➤ Près de Envoyer' }, { v: 'media', desc: '📎 Menu média' }];
          const toggle = (v: string) => {
            const next = chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v];
            updateSetting(key, next.length ? all.map((a) => a.v).filter((a) => next.includes(a)).join(',') : 'none');
          };
          return (
            <div key={tier} className="space-y-1">
              <p className="text-[11px] text-white">{label}</p>
              <div className="grid grid-cols-3 gap-2">
                {all.map(({ v, desc }) => (
                  <button key={v} onClick={() => toggle(v)} data-testid={`${key}-${v}`} aria-pressed={chosen.includes(v)}
                    className="py-2 rounded-lg text-[11px] font-medium transition-all" style={choiceStyle(chosen.includes(v))}>
                    {chosen.includes(v) ? '✔ ' : ''}{desc}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[10px]" style={faint}>Le bouton 🎤 n&apos;envoie jamais rien seul : le membre réécoute puis choisit « Envoyer » ou « Supprimer ».</p>
      </div>

      {dirty && (
        <div className="flex justify-end pt-2">
          <button onClick={saveSettings} disabled={settingsSaving} data-testid="voice-save"
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
            {settingsSaving ? '⏳…' : '💾 Sauvegarder'}
          </button>
        </div>
      )}
    </div>
  );
}
