'use client';
/**
 * components/files/MyFilesModal.tsx — Galerie « Mes fichiers » d'un membre
 *
 *   - mode « manage » (depuis le profil) : voir, agrandir, supprimer ses fichiers
 *   - mode « pick » (depuis la zone de saisie) : renvoyer un fichier déjà envoyé
 *     → aucun nouvel envoi, aucune place supplémentaire sur le serveur
 *
 * Compteur discret : éléments, place utilisée / quota, estimation du nombre d'envois restants
 * (d'après la taille moyenne de ses envois). La suppression suit le réglage de son type de compte
 * (Panel → Paramètres → Fichiers des membres) ; le serveur revérifie tout.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchMyFiles, deleteMyFile, readableBytes, fileIconFor, DELETE_CHOICE_LABELS,
  type GalleryItem, type GalleryStats, type DeleteChoice, expiresIn,
} from '@/lib/files';
import { safeLocalMediaUrl, safeThumbUrl } from '@/lib/safeUrl';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'manage' | 'pick';
  /** Fichiers proposés au renvoi (ex. un inscrit ne peut renvoyer que des images) */
  pickKinds?: Array<'image' | 'file'>;
  onPick?: (item: GalleryItem) => void;
}

type Filter = 'all' | 'image' | 'file';

export function MyFilesModal({ isOpen, onClose, mode = 'manage', pickKinds = ['image', 'file'], onPick }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [stats, setStats] = useState<GalleryStats | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [confirm, setConfirm] = useState<GalleryItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (more = false) => {
    setLoading(true); setError('');
    try {
      const kind = filter === 'all' ? undefined : filter;
      const data = await fetchMyFiles({ kind, before: more ? items[items.length - 1]?.id : undefined });
      setItems((prev) => (more ? [...prev, ...data.items] : data.items));
      setHasMore(data.has_more);
      setStats(data.stats);
    } catch {
      setError('Impossible de charger vos fichiers.');
    }
    setLoading(false);
  }, [filter, items]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen) { setPreview(null); setConfirm(null); load(false); } }, [isOpen, filter]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (preview) setPreview(null); else if (confirm) setConfirm(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, preview, confirm, onClose]);

  if (!isOpen) return null;

  const remove = async (item: GalleryItem, choice?: DeleteChoice) => {
    setBusy(true); setError('');
    try {
      const res = await deleteMyFile(item.id, choice);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setStats(res.stats);
      setConfirm(null); setPreview(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Suppression impossible.');
    }
    setBusy(false);
  };

  const pickable = (it: GalleryItem) => mode === 'pick' && pickKinds.includes(it.kind);
  const usedPct = stats && stats.quota_bytes > 0 ? Math.min(100, (stats.used_bytes / stats.quota_bytes) * 100) : 0;
  const barColor = usedPct > 90 ? '#f87171' : usedPct > 75 ? '#fbbf24' : 'var(--acc)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Mes fichiers"
        className="glass-strong rounded-2xl w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden">

        {/* En-tête + compteur discret */}
        <div className="px-5 pt-4 pb-3 border-b border-[var(--border)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-[var(--t1)] flex items-center gap-2">
              📁 Mes fichiers
              {mode === 'pick' && <span className="text-[11px] font-normal text-[var(--t3)]">· choisir un fichier à renvoyer</span>}
            </h2>
            <button onClick={onClose} aria-label="Fermer"
              className="w-8 h-8 rounded-lg text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--glass-h)]">✕</button>
          </div>
          {stats && (
            <div className="mt-2.5" data-testid="files-stats">
              <div className="h-1 rounded-full bg-[var(--glass)] overflow-hidden"
                title={`${readableBytes(stats.used_bytes)} utilisés sur ${readableBytes(stats.quota_bytes)}`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${usedPct}%`, background: barColor }} />
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--t3)] flex flex-wrap gap-x-2">
                <span>{stats.count} élément{stats.count > 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{readableBytes(stats.used_bytes)} / {readableBytes(stats.quota_bytes)}</span>
                {stats.remaining_estimate !== null && (
                  <>
                    <span>·</span>
                    <span title={`Estimation d'après la taille moyenne de vos envois (${readableBytes(stats.average_bytes)})`}>
                      ≈ {stats.remaining_estimate.toLocaleString('fr-FR')} envoi{stats.remaining_estimate > 1 ? 's' : ''} restant{stats.remaining_estimate > 1 ? 's' : ''}
                    </span>
                  </>
                )}
                {!!stats.expiry_days && (
                  <span title="Passé ce délai, vos fichiers sont effacés automatiquement">
                    · conservés {stats.expiry_days} jour{stats.expiry_days > 1 ? 's' : ''}
                  </span>
                )}
                {stats.hidden_bytes > 0 && (
                  <span title="Fichiers retirés de votre galerie mais encore visibles dans des messages">
                    · dont {readableBytes(stats.hidden_bytes)} hors galerie
                  </span>
                )}
              </p>
            </div>
          )}
          <div className="mt-3 flex gap-1.5">
            {([['all', 'Tout'], ['image', '🖼️ Images'], ['file', '📎 Fichiers']] as Array<[Filter, string]>).map(([v, label]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${filter === v
                  ? 'bg-[var(--acc-s)] text-[var(--acc)] border border-[var(--border-f)]'
                  : 'text-[var(--t3)] hover:text-[var(--t1)] border border-transparent'}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'pick' && (
            <p className="mt-2 text-[10px] text-[var(--t3)]">💡 Renvoyer un fichier déjà envoyé ne prend aucune place supplémentaire.</p>
          )}
        </div>

        {/* Grille */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 text-[12px] text-red-400">{error}</p>}
          {!loading && items.length === 0 && (
            <div className="py-12 text-center text-[var(--t3)] text-[13px]">
              <div className="text-3xl mb-2">🗂️</div>
              Aucun fichier pour l&apos;instant.
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5" data-testid="files-grid">
            {items.map((it) => {
              const thumb = safeThumbUrl(it.thumb_url) || (it.kind === 'image' ? safeLocalMediaUrl(it.url) : null);
              const disabledPick = mode === 'pick' && !pickable(it);
              return (
                <div key={it.id} className="group relative" data-file-id={it.id}>
                  <button
                    onClick={() => (mode === 'pick' ? (pickable(it) && onPick?.(it)) : setPreview(it))}
                    disabled={disabledPick}
                    title={`${it.original_name || 'Fichier'} · ${readableBytes(it.size_bytes)}`}
                    className={`w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg2)] flex items-center justify-center transition-all
                      ${disabledPick ? 'opacity-35 cursor-not-allowed' : 'hover:border-[var(--border-f)] hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]'}`}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={it.original_name || 'Image'} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex flex-col items-center gap-1 px-2 text-center">
                        <span className="text-2xl">{fileIconFor(it.original_name || it.url)}</span>
                        <span className="text-[10px] text-[var(--t2)] line-clamp-2 break-all">{it.original_name || 'Fichier'}</span>
                      </span>
                    )}
                  </button>
                  <div className="pointer-events-none absolute bottom-1 left-1 right-1 flex justify-between text-[9px]">
                    <span className="px-1.5 py-0.5 rounded bg-black/55 text-white/80">{readableBytes(it.size_bytes)}</span>
                    {it.uses > 0 && <span className="px-1.5 py-0.5 rounded bg-black/55 text-white/80" title="Messages qui l'utilisent">💬 {it.uses}</span>}
                  </div>
                  {(() => {
                    // Badge discret seulement quand l'expiration approche (7 jours ou moins)
                    const exp = expiresIn(it.expires_at);
                    return exp && exp.days <= 7 ? (
                      <span data-testid="file-expiry" className="pointer-events-none absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] bg-amber-500/80 text-black">
                        ⌛ {exp.label}
                      </span>
                    ) : null;
                  })()}
                  {mode === 'manage' && (
                    <button onClick={() => setConfirm(it)} aria-label={`Supprimer ${it.original_name || 'ce fichier'}`}
                      className="absolute top-1 right-1 w-7 h-7 rounded-lg bg-black/60 text-white/80 text-[12px] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-500/80 transition-all">
                      🗑
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="text-center mt-4">
              <button onClick={() => load(true)} disabled={loading} className="text-[12px] text-[var(--acc)] hover:underline disabled:opacity-50">
                {loading ? '⏳ Chargement…' : 'Afficher plus'}
              </button>
            </div>
          )}
          {loading && items.length === 0 && <p className="text-center text-[12px] text-[var(--t3)] py-8">⏳ Chargement…</p>}
        </div>
      </div>

      {/* Aperçu */}
      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="flex flex-col items-center gap-3 max-w-full max-h-full">
            {preview.kind === 'image' && safeLocalMediaUrl(preview.url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeLocalMediaUrl(preview.url)!} alt={preview.original_name || 'Image'}
                className="max-w-[90vw] max-h-[75vh] rounded-2xl object-contain shadow-2xl" />
            ) : (
              <div className="glass-strong rounded-2xl p-8 text-center">
                <div className="text-5xl mb-2">{fileIconFor(preview.original_name || preview.url)}</div>
                <p className="text-[13px] text-[var(--t1)] break-all">{preview.original_name || 'Fichier'}</p>
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-white/70">
              <span>{readableBytes(preview.size_bytes)}</span>
              {preview.width && preview.height && <span>· {preview.width}×{preview.height}</span>}
              <span>· {new Date(preview.created_at).toLocaleDateString('fr-FR')}</span>
              {preview.uses > 0 && <span>· utilisé dans {preview.uses} message{preview.uses > 1 ? 's' : ''}</span>}
              {preview.expires_at && <span>· {expiresIn(preview.expires_at)?.label} ({new Date(preview.expires_at).toLocaleDateString('fr-FR')})</span>}
            </div>
            <div className="flex gap-2">
              {safeLocalMediaUrl(preview.url) && (
                <a href={safeLocalMediaUrl(preview.url)!} target="_blank" rel="noopener noreferrer" download
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[12px] hover:bg-white/20">⬇ Télécharger</a>
              )}
              <button onClick={() => setConfirm(preview)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[12px] hover:bg-red-500/70">🗑 Supprimer</button>
              <button onClick={() => setPreview(null)} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[12px] hover:bg-white/20">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation de suppression (selon le réglage de l'administrateur) */}
      {confirm && stats && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setConfirm(null); }}>
          <div role="alertdialog" aria-label="Supprimer le fichier" className="glass-strong rounded-2xl p-5 w-full max-w-sm space-y-3">
            <p className="text-[14px] font-semibold text-[var(--t1)]">Supprimer « {confirm.original_name || 'ce fichier'} » ?</p>
            {confirm.uses === 0 ? (
              <>
                <p className="text-[12px] text-[var(--t2)]">Il n&apos;est utilisé dans aucun message : il sera effacé et la place libérée.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirm(null)} disabled={busy} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--t2)] hover:bg-[var(--glass-h)]">Annuler</button>
                  <button onClick={() => remove(confirm)} disabled={busy} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-red-500/80 hover:bg-red-500 disabled:opacity-50">
                    {busy ? '⏳' : 'Supprimer'}
                  </button>
                </div>
              </>
            ) : stats.delete_mode === 'block' ? (
              <>
                <p className="text-[12px] text-[var(--t2)]">🔒 Ce fichier est utilisé dans {confirm.uses} message{confirm.uses > 1 ? 's' : ''} : il ne peut pas être supprimé.</p>
                <div className="flex justify-end">
                  <button onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--t2)] hover:bg-[var(--glass-h)]">Compris</button>
                </div>
              </>
            ) : stats.delete_mode === 'option' ? (
              <>
                <p className="text-[12px] text-[var(--t2)]">Il est utilisé dans {confirm.uses} message{confirm.uses > 1 ? 's' : ''}. Que souhaitez-vous faire ?</p>
                <div className="space-y-1.5">
                  {stats.delete_choices.map((c) => (
                    <button key={c} onClick={() => remove(confirm, c)} disabled={busy} data-choice={c}
                      className="w-full text-left px-3 py-2 rounded-xl border border-[var(--border)] hover:border-[var(--border-f)] hover:bg-[var(--glass-h)] transition-all disabled:opacity-50">
                      <span className="text-[12px] font-medium text-[var(--t1)]">{DELETE_CHOICE_LABELS[c].icon} {DELETE_CHOICE_LABELS[c].title}</span>
                      <span className="block text-[10px] text-[var(--t3)]">{DELETE_CHOICE_LABELS[c].detail}</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setConfirm(null)} disabled={busy} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--t2)] hover:bg-[var(--glass-h)]">Annuler</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12px] text-[var(--t2)]">
                  Il est utilisé dans {confirm.uses} message{confirm.uses > 1 ? 's' : ''}.{' '}
                  {DELETE_CHOICE_LABELS[stats.delete_mode as DeleteChoice]?.detail}
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirm(null)} disabled={busy} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--t2)] hover:bg-[var(--glass-h)]">Annuler</button>
                  <button onClick={() => remove(confirm)} disabled={busy} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-red-500/80 hover:bg-red-500 disabled:opacity-50">
                    {busy ? '⏳' : DELETE_CHOICE_LABELS[stats.delete_mode as DeleteChoice]?.title || 'Supprimer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
