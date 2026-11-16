/**
 * app/api/config/gif/route.ts
 *
 * Retourne la clé API GIF active + les paramètres d'affichage par tier + la limite du picker.
 * Lit le .env racine manuellement car Next.js tourne depuis client/ et ne charge pas le .env racine.
 */
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function readRootEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '..', '.env');
  if (!existsSync(envPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (val) vars[key] = val;
  }
  return vars;
}

export async function GET() {
  // ── Clé API ──────────────────────────────────────────────────────────────
  let klipy = process.env.GIF_KLIPY_API_KEY || '';
  let giphy = process.env.GIF_GIPHY_API_KEY || '';
  let tenor = process.env.GIF_TENOR_API_KEY || '';

  if (!klipy && !giphy && !tenor) {
    const root = readRootEnv();
    klipy = root.GIF_KLIPY_API_KEY || '';
    giphy = root.GIF_GIPHY_API_KEY || '';
    tenor = root.GIF_TENOR_API_KEY || '';
  }

  const provider = klipy ? 'klipy' : giphy ? 'giphy' : tenor ? 'tenor' : 'none';
  const key      = klipy || giphy || tenor;

  // ── Paramètres d'affichage depuis app_settings ──────────────────────────
  // On les lit depuis l'API backend pour ne pas avoir besoin d'une connexion DB ici
  // Valeurs par défaut si l'API est inaccessible
  let displaySettings = {
    guest:      'masked',
    registered: 'option',
    premium:    'visible',
    limit:      20,
  };

  try {
    const settingsRes = await fetch('http://localhost:4000/api/settings/gif-display', {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      displaySettings = { ...displaySettings, ...data };
    }
  } catch {
    // Backend inaccessible → garder les valeurs par défaut
  }

  return NextResponse.json({ provider, key, display: displaySettings });
}
