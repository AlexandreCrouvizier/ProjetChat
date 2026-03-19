/**
 * app/layout.tsx — FIXED: suppressHydrationWarning pour éviter l'erreur DOM
 * 
 * Le problème : le serveur rend <html class="dark"> mais le client peut
 * changer la classe en "light" au montage, ce qui cause un mismatch DOM.
 * Solution : suppressHydrationWarning sur <html> et <body>.
 */

import type { Metadata } from 'next';
import '../styles/globals.css';
import { AuthProvider } from '@/components/ui/AuthProvider';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { ThemeInitScript } from '@/components/ui/ThemeInitScript';

export const metadata: Metadata = {
  title: 'ChatApp — Chat en ligne',
  description: 'Application de chat communautaire en temps réel',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Script inline qui applique le thème AVANT le rendu React = pas de flash */}
        <ThemeInitScript />
      </head>
      <body suppressHydrationWarning>
        {/* Orbes Glassmorphism */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          <div className="orb-1" />
          <div className="orb-2" />
          <div className="orb-3" />
          <div className="orb-4" />
        </div>
        <AuthProvider>
          <main className="relative z-10">{children}</main>
          <CookieBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
