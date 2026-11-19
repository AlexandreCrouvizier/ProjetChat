/**
 * components/chat/MessageContent.tsx — Phase 4 : affichage auto des GIFs
 *
 * - GifMessage lit useGifAutoDisplay() pour savoir si affichage direct ou au clic
 * - Label "via Tenor" → dynamique selon le provider actif
 */
'use client';

import { useState } from 'react';
import { LinkPreview } from './LinkPreview';
import { safeLocalMediaUrl, safeGifUrl, thumbForImage, safeAudioUrl } from '@/lib/safeUrl';
import { AudioMessage } from './AudioMessage';
import { useGifAutoDisplay, useGifConfig } from '@/hooks/useGifConfig';

interface LinkPreviewData {
  title: string; description: string | null; image: string | null; url: string; site_name: string | null;
}
interface MessageContentProps {
  content: string;
  type?: string;
  file_url?: string | null;
  gif_url?: string | null;
  link_preview?: LinkPreviewData | null;
  currentUsername?: string;
  /** Média effacé après coup (par son auteur ou par la modération) */
  media_removed?: 'author' | 'moderation' | 'expired' | null;
  /** Message vocal : durée en ms */
  audio_duration_ms?: number | null;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const MENTION_REGEX = /@([a-zA-Z0-9_-]{3,30})/g;
const URL_REGEX     = /(https?:\/\/[^\s<]+)/g;

function fileIcon(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf')                                     return '📄';
  if (['doc','docx','odt'].includes(ext))               return '📝';
  if (['xls','xlsx','ods','csv'].includes(ext))         return '📊';
  if (['zip','rar','7z','tar','gz'].includes(ext))      return '🗜️';
  if (['mp3','wav','ogg','flac','aac'].includes(ext))   return '🎵';
  if (['mp4','mov','avi','mkv','webm'].includes(ext))   return '🎬';
  if (['js','ts','py','java','cpp','rs'].includes(ext)) return '💻';
  return '📎';
}
function fileNameFromUrl(url: string): string {
  return decodeURIComponent(url.split('/').pop() || url);
}

// ─── Placeholder générique ────────────────────────────────────────────────────

function MediaPlaceholder({
  icon, label, sublabel, onClick,
}: { icon: string; label: string; sublabel?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 mt-1.5 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg2)] hover:border-[var(--border-f)] hover:bg-[var(--glass-h)] transition-all group focus:outline-none focus:ring-2 focus:ring-[var(--acc)] max-w-xs"
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="min-w-0 text-left">
        <p className="text-[13px] font-medium text-[var(--t1)] truncate group-hover:text-[var(--acc)] transition-colors">{label}</p>
        {sublabel && <p className="text-[11px] text-[var(--t3)] mt-0.5">{sublabel}</p>}
      </div>
      <span className="text-[var(--t3)] text-sm flex-shrink-0 group-hover:text-[var(--acc)] transition-colors">▶</span>
    </button>
  );
}

// ─── Image avec lazy-load et lightbox ─────────────────────────────────────────

function ImageMessage({ src, alt }: { src: string; alt: string }) {
  const [revealed,  setRevealed]  = useState(false);
  const [open,      setOpen]      = useState(false);
  const [imgError,  setImgError]  = useState(false);
  // ⭐ Miniature (400 px) dans le fil ; l'image complète n'est chargée qu'à l'agrandissement.
  // Pas de miniature (ancienne image, GIF) → l'original.
  const [thumb, setThumb] = useState<string | null>(() => thumbForImage(src));

  if (imgError) return <span className="text-[12px] text-[var(--t3)] italic">⚠️ Image non disponible</span>;

  if (!revealed) {
    return (
      <MediaPlaceholder
        icon="🖼️"
        label={alt || 'Image'}
        sublabel="Cliquer pour afficher"
        onClick={() => setRevealed(true)}
      />
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="block mt-1.5 rounded-xl overflow-hidden max-w-xs hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--acc)]"
        title="Cliquer pour agrandir"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb || src} alt={alt}
          onError={() => { if (thumb) setThumb(null); else setImgError(true); }}
          className="max-h-72 w-auto rounded-xl object-cover"
          loading="lazy"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt}
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()} />
          <button onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 text-lg">✕</button>
          <a href={src} download target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/50 text-white text-[12px] hover:bg-black/70">
            ⬇ Télécharger
          </a>
        </div>
      )}
    </>
  );
}

// ─── GIF — affichage auto ou au clic selon les règles ──────────────────────────

function GifMessage({ src }: { src: string }) {
  const autoDisplay = useGifAutoDisplay();
  const config      = useGifConfig();
  const [revealed,  setRevealed] = useState(false);
  const [imgError,  setImgError] = useState(false);

  // Label provider dynamique
  const providerLabel: Record<string, string> = {
    klipy: 'Klipy',
    giphy: 'GIPHY',
    tenor: 'Tenor',
    none:  'GIF',
  };
  const via = `via ${providerLabel[config?.provider ?? 'none'] ?? 'GIF'}`;

  if (imgError) return <span className="text-[12px] text-[var(--t3)] italic">⚠️ GIF non disponible</span>;

  // Affichage direct si la règle le permet
  if (autoDisplay || revealed) {
    return (
      <div className="mt-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="GIF" onError={() => setImgError(true)}
          className="rounded-xl max-h-64 w-auto" loading="lazy" />
        <div className="mt-0.5 text-[10px] text-[var(--t3)]">{via}</div>
      </div>
    );
  }

  // Placeholder cliquable (comportement par défaut / masked)
  return (
    <MediaPlaceholder
      icon="🎞️"
      label="GIF animé"
      sublabel="Cliquer pour afficher"
      onClick={() => setRevealed(true)}
    />
  );
}

// ─── Fichier téléchargeable ───────────────────────────────────────────────────

function FileMessage({ url }: { url: string }) {
  const icon = fileIcon(url);
  const name = fileNameFromUrl(url);
  const ext  = name.split('.').pop()?.toUpperCase() || 'FILE';
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer" download
      className="flex items-center gap-3 mt-1.5 px-4 py-3 rounded-xl transition-all group max-w-xs"
      style={{
        background: 'rgba(30, 27, 50, 0.95)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
      }}
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white truncate group-hover:text-[var(--acc)] transition-colors">{name}</p>
        <p className="text-[11px] text-white/40">{ext}</p>
      </div>
      <span className="text-white/40 text-sm flex-shrink-0 group-hover:text-[var(--acc)] transition-colors">⬇</span>
    </a>
  );
}

// ─── Texte + mentions + URLs ──────────────────────────────────────────────────

function TextWithMentions({ content, currentUsername }: { content: string; currentUsername?: string }) {
  const parts: Array<{ type: 'text' | 'mention' | 'url'; value: string; isSelf?: boolean }> = [];
  let lastIndex = 0;
  const combined = new RegExp(`(${MENTION_REGEX.source})|(${URL_REGEX.source})`, 'g');
  let m;
  while ((m = combined.exec(content)) !== null) {
    if (m.index > lastIndex) parts.push({ type: 'text', value: content.substring(lastIndex, m.index) });
    if (m[1]) {
      const isSelf = currentUsername ? m[2].toLowerCase() === currentUsername.toLowerCase() : false;
      parts.push({ type: 'mention', value: m[2], isSelf });
    } else if (m[3]) {
      parts.push({ type: 'url', value: m[3] });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) parts.push({ type: 'text', value: content.substring(lastIndex) });
  if (parts.length === 0) return <span>{content}</span>;

  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === 'mention') return (
          <span key={i}
            className={`inline-block px-0.5 rounded font-semibold cursor-pointer transition-colors ${
              part.isSelf
                ? 'bg-[var(--acc)] text-white shadow-[0_0_8px_var(--acc-g)]'
                : 'bg-[var(--acc-s)] text-[var(--acc)] hover:bg-[rgba(139,92,246,0.2)]'
            }`}
            title={`Voir le profil de ${part.value}`}>@{part.value}</span>
        );
        if (part.type === 'url') return (
          <a key={i} href={part.value} target="_blank" rel="noopener noreferrer"
             className="text-[var(--acc)] hover:underline break-all">{part.value}</a>
        );
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function MessageContent({
  content, type = 'text', file_url, gif_url, link_preview, currentUsername, media_removed, audio_duration_ms,
}: MessageContentProps) {
  if (type === 'audio') {
    if (media_removed) {
      return (
        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1.5 rounded-lg text-[11px] italic text-[var(--t3)] border border-dashed border-[var(--border)]">
          {media_removed === 'moderation' ? '🛡️ Message vocal retiré par la modération'
            : media_removed === 'expired' ? '⌛ Message vocal expiré (durée de conservation dépassée)'
            : '🗑️ Message vocal supprimé par son auteur'}
        </span>
      );
    }
    const src = safeAudioUrl(file_url);
    return src ? <AudioMessage src={src} durationMs={audio_duration_ms ?? null} /> : <span className="text-[11px] italic text-[var(--t3)]">🎤 Message vocal indisponible</span>;
  }
  // Image / fichier effacé après coup : le texte reste, le média est remplacé par une mention
  if (media_removed && (type === 'image' || type === 'file')) {
    const what = type === 'image' ? 'Image' : 'Fichier';
    const e = type === 'image' ? 'e' : '';
    return (
      <span>
        {content && type === 'image' && <span className="block text-[13px] text-[var(--t1)] mb-0.5 leading-snug">{content}</span>}
        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1.5 rounded-lg text-[11px] italic text-[var(--t3)] border border-dashed border-[var(--border)]">
          {media_removed === 'moderation' ? `🛡️ ${what} retiré${e} par la modération`
            : media_removed === 'expired' ? `⌛ ${what} expiré${e} (durée de conservation dépassée)`
            : `🗑️ ${what} supprimé${e} par son auteur`}
        </span>
      </span>
    );
  }
  // 🔐 Médias affichés : nos fichiers uniquement, GIF hébergés par un fournisseur uniquement
  // (toute autre adresse — javascript:, data:, site tiers — est ignorée)
  const safeFile = safeLocalMediaUrl(file_url);
  const safeGif  = safeGifUrl(gif_url);
  file_url = safeFile ?? undefined;
  gif_url  = safeGif ?? undefined;

  if (type === 'image' && file_url) {
    return (
      <span>
        {content && <span className="block text-[13px] text-[var(--t1)] mb-0.5 leading-snug">{content}</span>}
        <ImageMessage src={file_url} alt={content || 'Image'} />
      </span>
    );
  }
  if (type === 'gif' && gif_url) {
    return <GifMessage src={gif_url} />;
  }
  if (type === 'file' && file_url) {
    return (
      <span>
        {content && <span className="block text-[13px] text-[var(--t1)] mb-0.5">{content}</span>}
        <FileMessage url={file_url} />
      </span>
    );
  }
  return (
    <span>
      <TextWithMentions content={content} currentUsername={currentUsername} />
      {link_preview && <LinkPreview preview={link_preview} />}
    </span>
  );
}
