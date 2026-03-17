/**
 * app/page.tsx — Landing page (avec liens légaux en footer)
 */

'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

export default function LandingPage() {
  const { loginAsGuest } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGuest = async () => {
    setLoading(true);
    try {
      await loginAsGuest();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erreur de connexion');
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
