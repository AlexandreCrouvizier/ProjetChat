/**
 * components/admin/AdminAuth.tsx — Authentification TOTP avec input visible
 */
'use client';

import { useState, useEffect, useRef } from 'react';

interface AdminAuthProps {
  totpEnabled: boolean;
  onSetup: () => Promise<{ qr_code: string; secret_manual: string } | null>;
  onVerify: (code: string) => Promise<boolean>;
  error: string;
}

export function AdminAuth({ totpEnabled, onSetup, onVerify, error }: AdminAuthProps) {
  const [mode, setMode] = useState<'loading' | 'setup' | 'verify'>(totpEnabled ? 'verify' : 'loading');
  const [qrCode, setQrCode] = useState('');
  const [secretManual, setSecretManual] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!totpEnabled && mode === 'loading') {
      onSetup().then(result => {
        if (result) {
          setQrCode(result.qr_code);
          setSecretManual(result.secret_manual);
          setMode('setup');
        }
      });
    } else if (totpEnabled) {
      setMode('verify');
    }
  }, [totpEnabled, mode, onSetup]);

  useEffect(() => {
    if (mode !== 'loading') setTimeout(() => inputRef.current?.focus(), 300);
  }, [mode]);

  const handleSubmit = async () => {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    const success = await onVerify(code);
    setVerifying(false);
    if (!success) { setCode(''); inputRef.current?.focus(); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)' }}>

      {/* Grille décorative */}
      <div className="fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-[440px] rounded-2xl overflow-hidden"
        style={{ background: 'rgba(15,15,35,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,92,246,0.15)', boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.08)' }}>

        {/* Barre de couleur */}
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6366f1, #8b5cf6)' }} />

        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(139,92,246,0.2)' }}>
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Panneau d&apos;administration</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {mode === 'setup' ? 'Configuration de l\'authentification 2FA' : 'Authentification requise'}
          </p>
        </div>

        <div className="px-8 pb-8">
          {/* Erreur */}
          {error && error !== 'NOT_SUPERADMIN' && (
            <div className="mb-4 p-3 rounded-xl text-sm text-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {/* ── SETUP : QR Code ── */}
          {mode === 'setup' && (
            <>
              <div className="mb-5 p-5 rounded-xl text-center"
                style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)' }}>
                <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Scannez ce QR code avec <strong className="text-white">Google Authenticator</strong>
                </p>
                {qrCode && (
                  <div className="inline-block p-3 bg-white rounded-xl shadow-lg">
                    <img src={qrCode} alt="QR Code TOTP" className="w-[200px] h-[200px]" />
                  </div>
                )}
              </div>

              {/* Clé manuelle */}
              <div className="mb-4">
                <button onClick={() => setShowManual(!showManual)}
                  className="text-xs transition-colors hover:text-white" style={{ color: 'rgba(139,92,246,0.8)' }}>
                  {showManual ? '▾ Masquer la clé manuelle' : '▸ Saisie manuelle ?'}
                </button>
                {showManual && (
                  <div className="mt-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Clé secrète :</p>
                    <code className="text-sm font-mono select-all break-all" style={{ color: '#a78bfa' }}>{secretManual}</code>
                  </div>
                )}
              </div>

              <div className="h-px my-5" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <p className="text-xs text-center mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Entrez le code à 6 chiffres pour activer
              </p>
            </>
          )}

          {/* ── VERIFY ── */}
          {mode === 'verify' && (
            <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Entrez le code de votre application d&apos;authentification
            </p>
          )}

          {/* ── Input code ── */}
          {(mode === 'setup' || mode === 'verify') && (
            <>
              <div className="mb-2">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) handleSubmit(); }}
                  maxLength={6}
                  className="w-full text-center text-4xl font-bold py-5 px-4 rounded-xl outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `2px solid ${code.length === 6 ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    color: 'white',
                    letterSpacing: '0.4em',
                    caretColor: '#8b5cf6',
                  }}
                />
                <p className="text-center mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {code.length}/6 chiffres
                </p>
              </div>

              <button onClick={handleSubmit}
                disabled={code.length !== 6 || verifying}
                className="w-full mt-4 py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-30"
                style={{
                  background: code.length === 6 ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'rgba(139,92,246,0.2)',
                  boxShadow: code.length === 6 ? '0 0 30px rgba(139,92,246,0.3)' : 'none',
                }}>
                {verifying ? '⏳ Vérification...' : mode === 'setup' ? '✅ Activer et accéder' : '🔓 Accéder au panel'}
              </button>
            </>
          )}

          {mode === 'loading' && (
            <div className="text-center py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>⏳ Chargement...</div>
          )}
        </div>
      </div>
    </div>
  );
}
