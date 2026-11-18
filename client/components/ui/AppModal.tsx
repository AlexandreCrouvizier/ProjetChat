/**
 * components/ui/AppModal.tsx
 * Remplace window.alert() par un modal stylé avec le logo du site.
 * Usage : import { showModal } from '@/components/ui/AppModal';
 *         showModal('Message ici');
 */
'use client';

import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from 'react';

interface ModalState {
  open:    boolean;
  message: string;
  type:    'info' | 'error' | 'warning' | 'success';
}

interface ModalContextType {
  show: (message: string, type?: ModalState['type']) => void;
}

const ModalContext = createContext<ModalContextType>({ show: () => {} });

// Singleton pour usage en dehors de React (ex: depuis MessageInput)
let globalShow: ModalContextType['show'] = () => {};

export function showModal(message: string, type: ModalState['type'] = 'info') {
  globalShow(message, type);
}

const ICONS: Record<ModalState['type'], string> = {
  info:    'ℹ️',
  error:   '❌',
  warning: '⚠️',
  success: '✅',
};

const COLORS: Record<ModalState['type'], { border: string; bg: string; btn: string }> = {
  info:    { border: 'rgba(139,92,246,0.3)',  bg: 'rgba(139,92,246,0.08)',  btn: 'linear-gradient(135deg,#8b5cf6,#6366f1)' },
  error:   { border: 'rgba(239,68,68,0.3)',   bg: 'rgba(239,68,68,0.08)',   btn: 'linear-gradient(135deg,#ef4444,#dc2626)' },
  warning: { border: 'rgba(245,158,11,0.3)',  bg: 'rgba(245,158,11,0.08)',  btn: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  success: { border: 'rgba(34,197,94,0.3)',   bg: 'rgba(34,197,94,0.08)',   btn: 'linear-gradient(135deg,#22c55e,#16a34a)' },
};

export function AppModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>({ open: false, message: '', type: 'info' });

  const show = useCallback((message: string, type: ModalState['type'] = 'info') => {
    setModal({ open: true, message, type });
  }, []);

  const close = useCallback(() => {
    setModal(prev => ({ ...prev, open: false }));
  }, []);

  // Enregistrer le singleton
  useEffect(() => { globalShow = show; }, [show]);

  // Fermer sur Escape
  useEffect(() => {
    if (!modal.open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [modal.open, close]);

  const c = COLORS[modal.type];

  return (
    <ModalContext.Provider value={{ show }}>
      {children}

      {modal.open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="relative w-[360px] max-w-[calc(100vw-24px)] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            style={{
              background: 'rgba(15,13,28,0.98)',
              border: `1px solid ${c.border}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Barre de couleur */}
            <div className="h-1" style={{ background: c.btn }} />

            {/* Contenu */}
            <div className="px-6 pt-6 pb-5 text-center">
              {/* Logo / Icône */}
              <div className="flex flex-col items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                  {ICONS[modal.type]}
                </div>
                <span className="text-[11px] font-semibold tracking-widest uppercase"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                  ChatApp
                </span>
              </div>

              {/* Message */}
              <p className="text-[14px] leading-relaxed text-white mb-6">
                {modal.message}
              </p>

              {/* Bouton OK */}
              <button
                onClick={close}
                className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all hover:brightness-110 active:scale-95"
                style={{ background: c.btn }}
                autoFocus
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}
