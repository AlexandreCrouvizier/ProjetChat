/**
 * app/legal/layout.tsx — Layout partagé pour les pages légales
 */

import Link from 'next/link';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen py-12 px-5">
      <div className="max-w-3xl mx-auto">
        {/* Navigation retour */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--t2)] hover:text-[var(--t1)] transition-colors mb-8">
          ← Retour à l&apos;accueil
        </Link>

        {/* Contenu */}
        <div className="glass-strong rounded-2xl p-8 sm:p-10">
          {children}
        </div>

        {/* Navigation entre pages légales */}
        <div className="flex justify-center gap-6 mt-8 text-xs text-[var(--t3)]">
          <Link href="/legal/mentions" className="hover:text-[var(--acc)] transition-colors">Mentions légales</Link>
          <span>•</span>
          <Link href="/legal/privacy" className="hover:text-[var(--acc)] transition-colors">Confidentialité</Link>
          <span>•</span>
          <Link href="/legal/cgu" className="hover:text-[var(--acc)] transition-colors">CGU</Link>
        </div>
      </div>
    </div>
  );
}
