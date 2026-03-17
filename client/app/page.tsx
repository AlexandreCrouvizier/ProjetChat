import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="h-screen flex items-center justify-center p-5">
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
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-white text-sm
                           bg-gradient-to-r from-purple-500 to-indigo-500
                           shadow-[0_0_20px_rgba(139,92,246,0.35)]
                           hover:brightness-110 hover:-translate-y-0.5 transition-all">
            Créer un compte gratuitement
          </Link>
          <Link href="/auth_group/login"
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm
                           glass border border-[var(--border-s)]
                           hover:bg-[var(--glass-h)] transition-all">
            Se connecter
          </Link>
          <Link href="/chat_group"
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm
                           text-[var(--t2)] hover:text-[var(--t1)] transition-all">
            👀 Entrer en tant qu&apos;invité
          </Link>
        </div>

        <div className="flex gap-5 mt-8 justify-center flex-wrap">
          <span className="text-xs text-[var(--t3)] flex items-center gap-1.5">🔒 Gratuit</span>
          <span className="text-xs text-[var(--t3)] flex items-center gap-1.5">⚡ Temps réel</span>
          <span className="text-xs text-[var(--t3)] flex items-center gap-1.5">🌙 Mode sombre</span>
          <span className="text-xs text-[var(--t3)] flex items-center gap-1.5">📱 PWA</span>
        </div>
      </div>
    </div>
  );
}
