'use client';
/**
 * components/admin/AdminFilesGallery.tsx — Galerie des fichiers envoyés (Panel admin)
 *
 *   - onglet « Fichiers » : tous les fichiers (filtres : type, état, recherche nom / pseudo)
 *   - fenêtre « Fichiers de … » depuis le tableau des utilisateurs (même composant, filtré sur le membre)
 *   - clic sur un fichier → panneau latéral : trace complète (auteur, date, IP), dimensions,
 *     métadonnées EXIF (appareil, date de prise de vue, position GPS…), messages qui l'utilisent,
 *     et retrait par la modération.
 *
 * 🔐 Toutes les données viennent des routes /api/admin/uploads (superadmin + TOTP + passerelle).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeLocalMediaUrl, safeThumbUrl, safeAvatarUrl } from '@/lib/safeUrl';
import { readableBytes, fileIconFor } from '@/lib/files';

type AdminApi = (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: any) => Promise<any>;

interface AdminFile {
  id: string; kind: 'image' | 'file' | 'avatar'; url: string; thumb_url: string | null;
  original_name: string | null; mime_type: string | null; size_bytes: number;
  width: number | null; height: number | null; created_at: string; uses: number;
  user_id: string | null; username: string | null; tier: string | null; ip: string | null;
  deleted_at: string | null; deleted_reason?: 'author' | 'moderation' | 'expired' | 'replaced' | null; hidden_by_owner_at: string | null;
}

interface AdminFileDetail extends AdminFile {
  email: string | null;
  image: Record<string, any> | null;
  exif: { appareil?: string; logiciel?: string; date_prise?: string; gps?: { lat: number; lon: number }; copyright?: string; auteur?: string; champs?: Record<string, unknown> } | null;
  messages: Array<{ id: string; created_at: string; is_hidden: boolean; media_removed: string | null; group_id: string | null; conversation_id: string | null; group_name: string | null; excerpt: string | null }>;
}

const muted = { color: 'rgba(255,255,255,0.35)' };
const panelStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' };

function chip(active: boolean) {
  return {
    background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
    border: active ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
    color: active ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
  } as const;
}

/** Aperçu d'un fichier (miniature si possible) — nos adresses uniquement */
function previewSrc(f: AdminFile): string | null {
  if (f.deleted_at) return null;
  if (f.kind === 'avatar') return safeAvatarUrl(f.url);
  return safeThumbUrl(f.thumb_url) || (f.kind === 'image' ? safeLocalMediaUrl(f.url) : null);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[11px] border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      <span style={muted}>{label}</span>
      <span className="text-right text-white/80 break-all">{children}</span>
    </div>
  );
}

const DELETED_REASON_LABELS: Record<string, string> = {
  author: 'par son auteur', moderation: 'par la modération', expired: 'durée de conservation dépassée', replaced: 'avatar remplacé',
};

export function AdminFilesGallery({ adminApi, userId, userLabel, showToast }: {
  adminApi: AdminApi; userId?: string; userLabel?: string; showToast?: (m: string) => void;
}) {
  const [items, setItems] = useState<AdminFile[]>([]);
  const [total, setTotal] = useState<{ count: number; bytes: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<'' | 'image' | 'file' | 'avatar'>('');
  const [status, setStatus] = useState<'active' | 'deleted' | 'all'>('active');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdminFileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAllExif, setShowAllExif] = useState(false);
  const [withMessages, setWithMessages] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // showToast change à chaque rendu du panel : passé par une ref pour ne pas relancer le chargement en boucle
  const toastRef = useRef(showToast);
  useEffect(() => { toastRef.current = showToast; }, [showToast]);
  const toast = useCallback((m: string) => toastRef.current?.(m), []);

  const load = useCallback(async (more = false, from: AdminFile[] = []) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set('user_id', userId);
      if (kind) params.set('kind', kind);
      params.set('status', status);
      if (query) params.set('q', query);
      if (more && from.length) params.set('before', from[from.length - 1].id);
      const d = await adminApi('get', `/uploads?${params.toString()}`);
      setItems(more ? [...from, ...(d?.items || [])] : (d?.items || []));
      setHasMore(!!d?.has_more);
      setTotal(d?.total || null);
    } catch {
      toast('❌ Chargement des fichiers impossible');
    }
    setLoading(false);
  }, [adminApi, userId, kind, status, query, toast]);

  useEffect(() => { load(false); }, [load]);

  const open = async (f: AdminFile) => {
    setDetailLoading(true); setShowAllExif(false); setConfirmRemove(false); setWithMessages(false);
    try {
      setSelected(await adminApi('get', `/uploads/${f.id}`));
    } catch {
      toast('❌ Détail indisponible');
    }
    setDetailLoading(false);
  };

  const remove = async () => {
    if (!selected) return;
    try {
      const r = await adminApi('delete', `/uploads/${selected.id}`, { with_messages: withMessages });
      toast(`✅ Fichier retiré${r?.messages ? ` (${r.messages} message(s) concerné(s))` : ''}`);
      setSelected(null);
      load(false);
    } catch {
      toast('❌ Retrait impossible');
    }
  };

  return (
    <div className="flex gap-4 items-start">
      {/* ── Liste ── */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {([['', 'Tout'], ['image', '🖼️ Images'], ['file', '📎 Fichiers'], ['avatar', '👤 Avatars']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setKind(v)} className="px-3 py-1 rounded-lg text-[11px] font-medium" style={chip(kind === v)}>{l}</button>
          ))}
          <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
          {([['active', 'En ligne'], ['deleted', 'Effacés'], ['all', 'Tous']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className="px-3 py-1 rounded-lg text-[11px] font-medium" style={chip(status === v)}>{l}</button>
          ))}
          {!userId && (
            <form onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }} className="ml-auto flex gap-1.5">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom de fichier ou pseudo…" aria-label="Rechercher un fichier"
                className="px-2.5 py-1 rounded-lg text-[11px] text-white outline-none w-48"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <button type="submit" className="px-2.5 py-1 rounded-lg text-[11px]" style={chip(false)}>🔍</button>
            </form>
          )}
        </div>
        {total && (
          <p className="text-[11px]" style={muted} data-testid="admin-files-total">
            {userLabel ? `${userLabel} — ` : ''}{total.count.toLocaleString('fr-FR')} fichier(s) · {readableBytes(total.bytes)} sur le serveur
          </p>
        )}

        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }} data-testid="admin-files-grid">
          {items.map((f) => {
            const src = previewSrc(f);
            return (
              <button key={f.id} onClick={() => open(f)} data-file-id={f.id}
                title={`${f.original_name || f.kind} · ${readableBytes(f.size_bytes)}`}
                className="relative aspect-square rounded-xl overflow-hidden flex items-center justify-center transition-all hover:brightness-110"
                style={{ ...panelStyle, outline: selected?.id === f.id ? '2px solid rgba(139,92,246,0.6)' : 'none' }}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={f.original_name || 'Image'} loading="lazy" className="w-full h-full object-cover" style={{ opacity: f.hidden_by_owner_at ? 0.5 : 1 }} />
                ) : (
                  <span className="flex flex-col items-center gap-1 px-2 text-center">
                    <span className="text-2xl">{f.deleted_at ? '🗑️' : fileIconFor(f.original_name || f.url)}</span>
                    <span className="text-[9px] text-white/60 line-clamp-2 break-all">{f.original_name || f.kind}</span>
                  </span>
                )}
                <span className="absolute bottom-1 left-1 right-1 flex justify-between text-[9px] pointer-events-none">
                  {!userId && <span className="px-1 rounded bg-black/60 text-white/80 truncate max-w-[70%]">{f.username || '—'}</span>}
                  <span className="px-1 rounded bg-black/60 text-white/70 ml-auto">{readableBytes(f.size_bytes)}</span>
                </span>
                {f.deleted_at && <span className="absolute top-1 left-1 text-[9px] px-1 rounded bg-red-500/70 text-white">{f.deleted_reason === 'expired' ? 'expiré' : 'effacé'}</span>}
                {!f.deleted_at && f.hidden_by_owner_at && <span className="absolute top-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white/80">hors galerie</span>}
              </button>
            );
          })}
        </div>
        {!loading && items.length === 0 && <p className="text-center py-10 text-[12px]" style={muted}>Aucun fichier.</p>}
        {loading && <p className="text-center py-4 text-[12px]" style={muted}>⏳ Chargement…</p>}
        {hasMore && !loading && (
          <div className="text-center"><button onClick={() => load(true, items)} className="text-[12px] text-purple-300 hover:underline">Afficher plus</button></div>
        )}
      </div>

      {/* ── Panneau latéral : détail + métadonnées ── */}
      {(selected || detailLoading) && (
        <aside className="w-80 flex-shrink-0 rounded-2xl p-4 space-y-3 sticky top-20 max-h-[80vh] overflow-y-auto" style={panelStyle}
          aria-label="Détail du fichier" data-testid="admin-file-detail">
          {detailLoading && <p className="text-[12px]" style={muted}>⏳ Chargement…</p>}
          {selected && !detailLoading && (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-white break-all">{selected.original_name || selected.kind}</p>
                <button onClick={() => setSelected(null)} aria-label="Fermer le détail" className="text-white/40 hover:text-white">✕</button>
              </div>
              {previewSrc(selected) && (
                <a href={safeLocalMediaUrl(selected.url) || safeAvatarUrl(selected.url) || '#'} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSrc(selected)!} alt="" className="w-full max-h-56 object-contain rounded-xl" style={{ background: 'rgba(0,0,0,0.3)' }} />
                </a>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wide mb-1" style={muted}>Envoi</p>
                <Row label="Auteur">{selected.username || '—'}{selected.tier ? ` (${selected.tier})` : ''}</Row>
                {selected.email && <Row label="E-mail">{selected.email}</Row>}
                <Row label="Date">{new Date(selected.created_at).toLocaleString('fr-FR')}</Row>
                <Row label="Adresse IP">{selected.ip || 'effacée (durée LCEN dépassée)'}</Row>
                <Row label="Type">{selected.kind}{selected.mime_type ? ` · ${selected.mime_type}` : ''}</Row>
                <Row label="Taille">{readableBytes(selected.size_bytes)}</Row>
                {selected.width && selected.height && <Row label="Dimensions">{selected.width} × {selected.height}</Row>}
                <Row label="État">
                  {selected.deleted_at ? `effacé le ${new Date(selected.deleted_at).toLocaleDateString('fr-FR')}${DELETED_REASON_LABELS[selected.deleted_reason || ''] ? ` — ${DELETED_REASON_LABELS[selected.deleted_reason || '']}` : ''}`
                    : selected.hidden_by_owner_at ? 'retiré de la galerie par son auteur' : 'en ligne'}
                </Row>
              </div>

              {selected.image && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={muted}>Image</p>
                  <Row label="Format">{String(selected.image.format)}{selected.image.pages > 1 ? ` · ${selected.image.pages} images` : ''}</Row>
                  <Row label="Espace couleur">{String(selected.image.space || '—')}</Row>
                  <Row label="Métadonnées">
                    {[selected.image.has_exif && 'EXIF', selected.image.has_xmp && 'XMP', selected.image.has_iptc && 'IPTC', selected.image.has_profile && 'profil ICC']
                      .filter(Boolean).join(', ') || 'aucune'}
                  </Row>
                </div>
              )}

              {selected.exif && (
                <div data-testid="admin-file-exif">
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={muted}>EXIF</p>
                  {selected.exif.appareil && <Row label="Appareil">{selected.exif.appareil}</Row>}
                  {selected.exif.logiciel && <Row label="Logiciel">{selected.exif.logiciel}</Row>}
                  {selected.exif.date_prise && <Row label="Prise de vue">{selected.exif.date_prise}</Row>}
                  {selected.exif.auteur && <Row label="Auteur (EXIF)">{selected.exif.auteur}</Row>}
                  {selected.exif.copyright && <Row label="Copyright">{selected.exif.copyright}</Row>}
                  {selected.exif.gps && (
                    <div className="mt-1.5 px-2.5 py-2 rounded-lg text-[11px]" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)', color: 'rgba(251,191,36,0.85)' }}>
                      📍 Position GPS : {selected.exif.gps.lat}, {selected.exif.gps.lon}
                      <a href={`https://www.openstreetmap.org/?mlat=${selected.exif.gps.lat}&mlon=${selected.exif.gps.lon}#map=16/${selected.exif.gps.lat}/${selected.exif.gps.lon}`}
                        target="_blank" rel="noopener noreferrer" className="block underline mt-0.5">Voir sur une carte</a>
                    </div>
                  )}
                  {selected.exif.champs && Object.keys(selected.exif.champs).length > 0 && (
                    <>
                      <button onClick={() => setShowAllExif((v) => !v)} className="mt-1.5 text-[10px] text-purple-300 hover:underline">
                        {showAllExif ? 'Masquer' : `Tous les champs (${Object.keys(selected.exif.champs).length})`}
                      </button>
                      {showAllExif && Object.entries(selected.exif.champs).map(([k, v]) => (
                        <Row key={k} label={k}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</Row>
                      ))}
                    </>
                  )}
                </div>
              )}
              {selected.image && !selected.exif && <p className="text-[10px]" style={muted}>Aucune donnée EXIF (retirées à l&apos;envoi).</p>}

              <div>
                <p className="text-[10px] uppercase tracking-wide mb-1" style={muted}>Messages ({selected.messages.length})</p>
                {selected.messages.length === 0 && <p className="text-[11px]" style={muted}>Utilisé dans aucun message.</p>}
                {selected.messages.map((m) => (
                  <div key={m.id} className="py-1 text-[11px] border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                    <span className="text-white/80">{m.group_name ? `# ${m.group_name}` : m.conversation_id ? '✉️ Message privé' : '—'}</span>
                    <span style={muted}> · {new Date(m.created_at).toLocaleString('fr-FR')}</span>
                    {(m.is_hidden || m.media_removed) && <span className="text-red-300"> · {m.is_hidden ? 'masqué' : 'média retiré'}</span>}
                    {m.excerpt && <span className="block text-white/50 truncate">{m.excerpt}</span>}
                  </div>
                ))}
              </div>

              {!selected.deleted_at && (
                <div className="pt-1 space-y-2">
                  {!confirmRemove ? (
                    <button onClick={() => setConfirmRemove(true)} className="w-full py-2 rounded-lg text-[12px] font-medium text-red-300"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      🛡️ Retirer ce fichier
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-lg p-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <p className="text-[11px] text-white/80">Le fichier sera effacé du serveur (la trace reste). Les messages afficheront « retiré par la modération ».</p>
                      {selected.kind !== 'avatar' && (
                        <label className="flex items-center gap-2 text-[11px] text-white/70">
                          <input type="checkbox" checked={withMessages} onChange={(e) => setWithMessages(e.target.checked)} />
                          Masquer aussi les messages qui le contiennent
                        </label>
                      )}
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setConfirmRemove(false)} className="px-3 py-1 rounded-lg text-[11px] text-white/60">Annuler</button>
                        <button onClick={remove} className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-red-500/80 hover:bg-red-500">Retirer</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
