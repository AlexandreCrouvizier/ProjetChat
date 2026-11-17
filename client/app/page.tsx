/**
 * app/page.tsx — Landing page (avec liens légaux en footer)
 */

'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { showModal } from '@/components/ui/AppModal';
import { BAN_EVENT, takeBanNotice, type BanNotice } from '@/lib/banGuard';

/** Texte de la durée d'un bannissement (« 1h », « 7d », « permanent »…) */
function banDurationText(n: BanNotice): string {
  if (n.expires_at) {
    const d = new Date(n.expires_at);
    if (!Number.isNaN(d.getTime())) {
      return `Votre compte est suspendu jusqu'au ${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
    }
  }
  if (n.duration && n.duration !== 'permanent') return `Votre compte a été suspendu pour ${n.duration}.`;
  if (n.duration === 'permanent') return 'Votre compte a été banni définitivement.';
  return 'Votre compte est suspendu : vous ne pouvez plus accéder au chat pour le moment.';
}

export default function LandingPage() {
  const { loginAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);
  // 🔐 Motif du bannissement (l'utilisateur vient d'être sorti du chat)
  const [banNotice, setBanNotice] = useState<BanNotice | null>(null);

  useEffect(() => {
    const show = () => {
      const n = takeBanNotice();
      if (n) setBanNotice(n);
      // Nettoyer l'adresse (?banned=1) sans recharger
      if (window.location.search.includes('banned')) window.history.replaceState(null, '', '/');
    };
    show();
    window.addEventListener(BAN_EVENT, show);
    return () => window.removeEventListener(BAN_EVENT, show);
  }, []);

  const handleGuest = async () => {
    setLoading(true);
    try {
      await loginAsGuest();
    } catch (err: any) {
      showModal(err.response?.data?.message || 'Connexion invité impossible. Réessayez dans un instant.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5">
      <div className="glass-strong rounded-3xl p-14 max-w-lg w-full text-center">
        <div className="text-5xl mb-4">💬</div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-purple-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
          ChatApp
        </h1>
        <p className="text-[var(--t2)] text-base mb-9 leading-relaxed">
          Rejoignez une communauté de discussion en temps réel.
          Salons publics, messages privés, et bien plus encore.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/auth_group/register"
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:brightness-110 hover:-translate-y-0.5 transition-all text-center">
            Créer un compte gratuitement
          </Link>
          <Link href="/auth_group/login"
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm glass border border-[var(--border-s)] hover:bg-[var(--glass-h)] transition-all text-center">
            Se connecter
          </Link>
          <button onClick={handleGuest} disabled={loading}
                  className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm text-[var(--t2)] hover:text-[var(--t1)] transition-all disabled:opacity-50">
            {loading ? '⏳ Connexion...' : '👀 Entrer en tant qu\'invité'}
          </button>
        </div>
        <div className="flex gap-5 mt-8 justify-center flex-wrap">
          {['🔒 Gratuit', '⚡ Temps réel', '🌙 Mode sombre', '📱 PWA'].map(f => (
            <span key={f} className="text-xs text-[var(--t3)]">{f}</span>
          ))}
        </div>
      </div>

      {/* 🚫 Message de bannissement */}
      {banNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="alertdialog" aria-modal="true" aria-labelledby="ban-title">
          <div className="w-full max-w-[420px] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
            style={{ background: 'rgba(15,15,35,0.98)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #ef4444, #b91c1c, #ef4444)' }} />
            <div className="p-8 text-center">
              <div className="text-5xl mb-4">🚫</div>
              <h2 id="ban-title" className="text-xl font-bold text-white mb-2">Compte suspendu</h2>
              <div className="p-4 rounded-xl mb-5 space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{banDurationText(banNotice)}</p>
                {banNotice.reason && (
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>Motif :</span> {banNotice.reason}
                  </p>
                )}
                {banNotice.admin_message && (
                  <p className="text-xs italic pt-2" style={{ color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
                    💬 {banNotice.admin_message}
                  </p>
                )}
              </div>
              <button onClick={() => setBanNotice(null)}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm"
                style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                J&apos;ai compris
              </button>
              <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Pour contester cette décision, contactez le support.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer légal */}
      <div className="flex gap-4 mt-8 text-[11px] text-[var(--t3)]">
        <Link href="/legal/mentions" className="hover:text-[var(--acc)] transition-colors">Mentions légales</Link>
        <span>•</span>
        <Link href="/legal/privacy" className="hover:text-[var(--acc)] transition-colors">Confidentialité</Link>
        <span>•</span>
        <Link href="/legal/cgu" className="hover:text-[var(--acc)] transition-colors">CGU</Link>
      </div>
    </div>
  );
}
