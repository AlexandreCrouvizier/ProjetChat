/**
 * app/auth_group/register/page.tsx — Page d'inscription
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(username, email, password);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de l\'inscription');
    }
    setLoading(false);
  };

  return (
    <div className="h-screen flex items-center justify-center p-5">
      <Link href="/" className="fixed top-5 left-5 text-sm text-[var(--t2)] hover:text-[var(--t1)] transition-colors">← Retour</Link>
      <div className="glass-strong rounded-2xl p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-1">Créer un compte</h1>
        <p className="text-sm text-[var(--t2)] mb-6">Rejoignez la communauté en 30 secondes</p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Pseudo</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
                   placeholder="votre_pseudo" minLength={3} maxLength={30}
                   className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" />
          </div>
          <div className="mb-4">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                   placeholder="votre@email.com"
                   className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" />
          </div>
          <div className="mb-6">
            <label className="block text-[9px] font-semibold text-[var(--t3)] uppercase tracking-wider mb-1.5">Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                   placeholder="Min 8 car., 1 majuscule, 1 chiffre" minLength={8}
                   className="w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--glass)] backdrop-blur-sm text-[var(--t1)] text-sm outline-none focus:border-[var(--border-f)] transition-all placeholder:text-[var(--t3)]" />
          </div>
          <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:brightness-110 transition-all disabled:opacity-50">
            {loading ? '⏳ Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--t3)] mt-4">
          Déjà un compte ? <Link href="/auth_group/login" className="text-[var(--acc)] hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
