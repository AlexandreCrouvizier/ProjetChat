/**
 * app/auth_group/login/page.tsx — Page de connexion (avec OAuth Google)
 * 
 * Gère aussi le retour OAuth : quand Google redirige ici avec les tokens
 * en query params, on les stocke et on redirige vers le chat.
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket } from '@/lib/socket';
import api from '@/lib/api';

function LoginPageContent() {
  const { login, loginAsGuest } = useAuth();
  const { setUser } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Retour de la connexion Google/GitHub : la session est déjà dans les cookies httpOnly
  // (🔐 plus aucun jeton dans l'URL, l'historique ou les journaux)
  useEffect(() => {
    const oauthSuccess = searchParams.get('oauth_success');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      const messages: Record<string, string> = {
        oauth_email_unverified: "Votre adresse e-mail n'est pas vérifiée chez ce fournisseur : impossible de la lier à un compte existant.",
        oauth_unavailable: "Ce mode de connexion n'est pas activé sur ce serveur.",
        account_suspended: 'Ce compte est suspendu.',
      };
      setError(messages[oauthError] || 'La connexion a échoué. Veuillez réessayer.');
      // Nettoyer l'URL
      window.history.replaceState({}, '', '/auth_group/login');
      return;
    }

    if (oauthSuccess) {
      // Charger le profil et rediriger
      api.get('/auth/me').then(({ data }) => {
        setUser(data.user);
        connectSocket();
        // Nettoyer l'URL avant de rediriger
        window.history.replaceState({}, '', '/auth_group/login');
        router.push('/chat_group');
      }).catch(() => {
        setError('Erreur lors de la récupération du profil');
        window.history.replaceState({}, '', '/auth_group/login');
      });
    }
  }, [searchParams, setUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur de connexion');
    }
    setLoading(false);
  };

  // Fournisseurs OAuth configurés sur le serveur (un bouton n'apparaît que si ses clés existent)
  const [providers, setProviders] = useState<{ google: boolean; github: boolean }>({ google: false, github: false });
  useEffect(() => {
    api.get('/auth/oauth/providers').then(({ data }) => setProviders({ google: !!data?.google, github: !!data?.github })).catch(() => {});
  }, []);

  const handleOAuthLogin = (provider: 'google' | 'github') => {
    // Redirige vers le backend qui redirige vers le fournisseur
    // Même origine : relayé vers le serveur par Next.js
    window.location.href = `/api/auth/oauth/${provider}`;
  };

  const handleGuest = async () => {
    setLoading(true);
    try { await loginAsGuest(); } catch (err: any) {
      // Afficher la vraie raison (ex. « Accès suspendu jusqu'au … Motif : … ») au lieu de « Erreur »
      setError(err.response?.data?.message || 'Connexion invité impossible. Réessayez dans un instant.');
    }
    setLoading(false);
  };

  return (
    <div className="h-screen flex items-center justify-center p-5">
      <Link href="/" className="fixed top-5 left-5 text-sm text-[var(--t2)] hover:text-[var(--t1)] transition-colors">← Retour</Link>
      <div className="glass-strong rounded-2xl p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-1">Connexion</h1>
        <p className="text-sm text-[var(--t2)] mb-6">Heureux de vous revoir !</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* OAuth Google */}
        {providers.google && (
          <button
            onClick={() => handleOAuthLogin('google')}
            className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-sm font-semibold flex items-center justify-center gap-3 hover:bg-[var(--glass-h)] hover:border-[var(--border-s)] transition-all mb-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuer avec Google
          </button>
        )}

        {/* OAuth GitHub */}
        {providers.github && (
          <button
            onClick={() => handleOAuthLogin('github')}
            className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-sm font-semibold flex items-center justify-center gap-3 hover:bg-[var(--glass-h)] hover:border-[var(--border-s)] transition-all mb-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.73.5.5 5.74.5 12.04c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.55 11.55 0 0 0 23.5 12.04C23.5 5.74 18.27.5 12 .5z"/>
            </svg>
            Continuer avec GitHub
          </button>
        )}

        {(providers.google || providers.github) && (
          <div className="flex items-center gap-3 my-5 text-[11px] text-[var(--t3)]">
            <div className="flex-1 h-px bg-[var(--border)]" />
            ou
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                   placeholder="votre@email.com"
                   className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" />
          </div>
          <div className="mb-6">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                   placeholder="••••••••"
                   className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" />
          </div>
          <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:brightness-110 transition-all disabled:opacity-50">
            {loading ? '⏳ Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--t3)] mt-4">
          Pas de compte ? <Link href="/auth_group/register" className="text-[var(--acc)] hover:underline">S&apos;inscrire</Link>
        </p>
        <p className="text-center text-xs text-[var(--t3)] mt-2">
          <button onClick={handleGuest} className="text-[var(--acc)] hover:underline">Continuer en tant qu&apos;invité →</button>
        </p>
      </div>
    </div>
  );
}

// useSearchParams() lit l'adresse côté navigateur : Next.js exige une zone Suspense autour.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
