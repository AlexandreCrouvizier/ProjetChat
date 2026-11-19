'use client';
/**
 * components/admin/GroupVoiceEditor.tsx — Voix / vidéo / écran d'un salon précis (Panel → Salons)
 *
 * Chaque fonction : « Selon le type de salon » (réglage général) · « Autorisée » · « Interdite ».
 * 🔐 Une dérogation « Autorisée » ne dépasse jamais ce que permet le type de compte du membre.
 */
import { useState } from 'react';

type Ov = '' | 'on' | 'off';
interface Props {
  group: any;
  adminApi: (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => Promise<any>;
  showToast: (msg: string) => void;
  onSaved: () => void;
}
const asOv = (v: unknown): Ov => (v === 'on' || v === 'off' ? v : '');
const FIELDS: { key: 'allow_voice' | 'allow_video' | 'allow_screen' | 'allow_voicemsg'; label: string }[] = [
  { key: 'allow_voice', label: '🎙️ Voix' },
  { key: 'allow_video', label: '📹 Vidéo' },
  { key: 'allow_screen', label: '🖥️ Partage d\'écran' },
  { key: 'allow_voicemsg', label: '🎤 Messages vocaux' },
];

export function GroupVoiceEditor({ group, adminApi, showToast, onSaved }: Props) {
  const [vals, setVals] = useState<Record<string, Ov>>({
    allow_voice: asOv(group.allow_voice), allow_video: asOv(group.allow_video), allow_screen: asOv(group.allow_screen),
    allow_voicemsg: asOv(group.allow_voicemsg),
  });
  const [max, setMax] = useState<string>(group.voice_max_participants ? String(group.voice_max_participants) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = max.trim() === '' ? null : Number(max);
    if (n !== null && !(Number.isInteger(n) && n >= 2 && n <= 100)) { showToast('❌ Participants : un entier de 2 à 100, ou vide'); return; }
    setSaving(true);
    try {
      await adminApi('patch', `/groups/${group.id}/voice`, {
        allow_voice: vals.allow_voice || null, allow_video: vals.allow_video || null, allow_screen: vals.allow_screen || null,
        allow_voicemsg: vals.allow_voicemsg || null,
        voice_max_participants: n,
      });
      showToast('✅ Voix du salon enregistrée');
      onSaved();
    } catch { showToast('❌ Enregistrement impossible'); }
    setSaving(false);
  };

  return (
    <div className="px-4 py-3 space-y-3" data-testid={`group-voice-${group.id}`} style={{ background: 'rgba(139,92,246,0.05)' }}>
      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Voix, vidéo et écran de <b className="text-white">#{group.name}</b> : par défaut, le réglage de son type de salon s&apos;applique.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="space-y-1 block">
            <span className="text-[11px] text-white">{label}</span>
            <select value={vals[key]} onChange={(e) => setVals({ ...vals, [key]: e.target.value as Ov })} data-testid={`${key}-${group.id}`}
              className="w-full rounded-lg px-2 py-1.5 text-[11px] text-white" style={{ background: '#15151f', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="">Selon le type de salon</option>
              <option value="on">✔ Autorisée</option>
              <option value="off">✖ Interdite</option>
            </select>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-white">
        Participants maximum
        <input type="number" min={2} max={100} value={max} placeholder="selon le compte" onChange={(e) => setMax(e.target.value)}
          data-testid={`voice_max-${group.id}`}
          className="w-28 rounded-lg px-2 py-1.5 text-[11px] text-white bg-transparent" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
      </label>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} data-testid={`voice-save-${group.id}`}
          className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
          {saving ? '⏳…' : '💾 Enregistrer'}
        </button>
      </div>
    </div>
  );
}
