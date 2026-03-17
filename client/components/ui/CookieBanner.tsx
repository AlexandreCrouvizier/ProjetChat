/**
 * components/ui/CookieBanner.tsx — Bandeau de consentement RGPD
 * 
 * Obligations légales :
 *   - Informer l'utilisateur AVANT tout dépôt de cookies
 *   - Permettre d'accepter ou de refuser
 *   - Conserver le choix (localStorage)
 *   - Lien vers la politique de confidentialité
 * 
 * Note : pour le MVP, on n'utilise pas encore de cookies tiers (AdSense viendra en Phase 4).
 * Mais le bandeau est nécessaire dès maintenant pour :
 *   - Le JWT stocké en localStorage (pas un cookie, mais bonne pratique d'informer)
 *   - Les données de connexion conservées 1 an (LCEN)
 *   - La conformité anticipée pour AdSense
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Vérifie si l'utilisateur a déjà fait son choix
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      // Petit délai pour ne pas afficher immédiatement au chargement
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'accepted');
    localStorage.setItem('cookie_consent_date', new Date().toISOString());
    setVisible(false);
  };

  const handleRefuse = () => {
    localStorage.setItem('cookie_consent', 'refused');
    localStorage.setItem('cookie_consent_date', new Date().toISOString());
    setVisible(false);
    // Note : même en cas de refus, les cookies essentiels (auth) restent actifs
    // car ils sont nécessaires au fonctionnement du service (base légale : intérêt légitime)
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slideUp">
      <div className="max-w-3xl mx-auto glass-strong rounded-2xl p-5 shadow-[0_-8px_40px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          
          {/* Texte */}
          <div className="flex-1">
            <p className="text-sm text-[var(--t2)] leading-relaxed">
              <span className="text-[var(--t1)] font-semibold">🍪 Votre vie privée compte.</span>{' '}
              Nous utilisons des données essentielles pour faire fonctionner ce service 
              (authentification, sessions). Conformément à la loi LCEN, vos données de connexion 
              sont conservées pendant 1 an.{' '}
              <Link href="/legal/privacy" className="text-[var(--acc)] hover:underline">
                Politique de confidentialité
              </Link>
            </p>
          </div>

          {/* Boutons */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleRefuse}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--t2)] border border-[var(--border)] hover:bg-[var(--glass-h)] transition-all"
            >
              Refuser
            </button>
            <button
              onClick={handleAccept}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_16px_var(--acc-g)] hover:brightness-110 transition-all"
            >
              Accepter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
