/**
 * lib/files.ts — Galerie « Mes fichiers » : appels API, formats d'affichage
 */
import api from '@/lib/api';

export interface GalleryItem {
  id: string;
  kind: 'image' | 'file';
  url: string;
  thumb_url: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  /** Nombre de messages (visibles) qui utilisent ce fichier */
  uses: number;
  /** Date à laquelle le fichier sera effacé automatiquement (null = conservé sans limite) */
  expires_at?: string | null;
}

export type DeleteChoice = 'gallery_only' | 'erase' | 'erase_messages';
export type DeleteMode = DeleteChoice | 'block' | 'option';

export interface GalleryStats {
  count: number;
  used_bytes: number;
  hidden_bytes: number;
  quota_bytes: number;
  average_bytes: number;
  remaining_estimate: number | null;
  delete_mode: DeleteMode;
  delete_choices: DeleteChoice[];
  /** Durée de conservation des fichiers pour ce type de compte, en jours (0 = sans limite) */
  expiry_days?: number;
}

export const DELETE_CHOICE_LABELS: Record<DeleteChoice, { icon: string; title: string; detail: string }> = {
  gallery_only: { icon: '🙈', title: 'Retirer de ma galerie', detail: 'Reste visible dans les messages et continue d\'occuper de la place.' },
  erase: { icon: '🗑️', title: 'Effacer le fichier', detail: 'Place libérée. Les messages affichent « supprimé par son auteur ».' },
  erase_messages: { icon: '💥', title: 'Effacer avec les messages', detail: 'Place libérée. Les messages qui le contenaient disparaissent.' },
};

export async function fetchMyFiles(params: { kind?: 'image' | 'file'; before?: string } = {}) {
  const { data } = await api.get('/upload/mine', { params });
  return data as { items: GalleryItem[]; has_more: boolean; stats: GalleryStats };
}

export async function deleteMyFile(id: string, mode?: DeleteChoice) {
  const { data } = await api.delete(`/upload/mine/${encodeURIComponent(id)}`, { data: mode ? { mode } : {} });
  return data as { mode: string; messages: number; uses: number; stats: GalleryStats };
}

export function readableBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;
}

export function fileIconFor(name: string | null | undefined): string {
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx', 'odt', 'txt', 'md', 'rtf'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return '🎬';
  return '📎';
}

/** Qui a fait disparaître un message ou son fichier (message:hidden / media_removed) */
export type RemovedBy = 'author' | 'moderation' | 'expired';

/** Texte affiché à la place d'un message masqué */
export function hiddenMessageLabel(by?: string | null, short = false): string {
  if (by === 'author') return short ? 'Message supprimé par son auteur.' : 'Ce message a été supprimé par son auteur.';
  if (by === 'expired') return short ? 'Fichier expiré.' : 'Ce fichier a expiré et a été supprimé.';
  return short ? 'Message supprimé par la modération.' : 'Ce message a été supprimé par la modération.';
}

/** « dans 3 jours », « aujourd'hui »… pour une date d'expiration (null si aucune) */
export function expiresIn(expiresAt?: string | null): { days: number; label: string } | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(ms / 86_400_000));
  const label = days <= 0 ? "expire aujourd'hui" : days === 1 ? 'expire demain' : `expire dans ${days} j`;
  return { days, label };
}
