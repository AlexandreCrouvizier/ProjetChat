/**
 * components/chat/LinkPreview.tsx — Phase 4.1 : Carte de prévisualisation de lien
 *
 * Affiche le titre, la description et l'image OpenGraph d'un lien.
 * Données générées côté serveur par linkPreview.service.ts et stockées
 * dans la colonne link_preview JSONB de la table messages.
 */
'use client';

import { useState } from 'react';
import { safeMediaUrl, safeHttpsUrl } from '@/lib/safeUrl';

interface LinkPreviewData {
  title:       string;
  description: string;
  image:       string | null;
  url:         string;
  site_name:   string | null;
}

interface LinkPreviewProps {
  preview: LinkPreviewData;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

export function LinkPreview({ preview }: LinkPreviewProps) {
  const [imgError, setImgError] = useState(false);
  // 🔐 Lien et image d'aperçu filtrés (pas de javascript: / data:)
  const href  = safeMediaUrl(preview.url);
  const image = safeHttpsUrl(preview.image);
  if (!href) return null;
  const domain = getDomain(href);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg2)] overflow-hidden hover:border-[var(--border-f)] hover:bg-[var(--glass-h)] transition-all group"
    >
      {/* Image de couverture */}
      {image && !imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={preview.title}
          onError={() => setImgError(true)}
          className="w-full h-32 object-cover border-b border-[var(--border)]"
        />
      )}

      <div className="p-3 flex flex-col gap-1">
        {/* Domaine / site_name */}
        <span className="text-[10px] uppercase tracking-wide text-[var(--t3)] font-medium">
          {preview.site_name || domain}
        </span>

        {/* Titre */}
        <span className="text-[13px] font-semibold text-[var(--t1)] leading-snug group-hover:text-[var(--acc)] transition-colors line-clamp-2">
          {preview.title}
        </span>

        {/* Description */}
        {preview.description && (
          <span className="text-[12px] text-[var(--t2)] leading-snug line-clamp-2">
            {preview.description}
          </span>
        )}

        {/* URL tronquée */}
        <span className="text-[10px] text-[var(--t3)] truncate mt-0.5">
          🔗 {preview.url.length > 60 ? preview.url.substring(0, 60) + '…' : preview.url}
        </span>
      </div>
    </a>
  );
}
