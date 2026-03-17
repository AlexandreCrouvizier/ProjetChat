import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'ChatApp — Chat en ligne',
  description: 'Application de chat communautaire en temps réel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body>
        {/* Orbes animées en arrière-plan (Glassmorphism) */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          <div className="absolute w-[600px] h-[600px] rounded-full -top-[150px] -left-[150px] blur-[60px] animate-pulse"
               style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full -bottom-[120px] -right-[80px] blur-[60px] animate-pulse"
               style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.35) 0%, transparent 70%)', animationDelay: '2s' }} />
          <div className="absolute w-[450px] h-[450px] rounded-full top-[35%] left-[30%] blur-[70px] animate-pulse"
               style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)', animationDelay: '4s' }} />
        </div>

        {/* Contenu de l'app */}
        <main className="relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
