/** @type {import('next').NextConfig} */
const os = require('os');

// 🔐 Adresses IPv4 privées de ce PC (ex. 192.168.x.y).
// Next.js 16 bloque par défaut les ressources de développement (rechargement à chaud)
// pour tout autre hôte que localhost : on autorise uniquement les adresses du PC lui-même,
// pour que le téléphone / la tablette du réseau local fonctionnent avec `npm run dev:lan`.
function getLanAddresses() {
  const privateRe = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  // Cartes virtuelles (WSL, Docker, Hyper-V…) ignorées : seul le vrai réseau local compte
  const virtualAdapter = /vEthernet|WSL|Hyper-V|Docker|VirtualBox|VMware|vboxnet|^br-|^veth|^docker/i;
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !virtualAdapter.test(name))
    .flatMap(([, list]) => list || [])
    .filter((i) => i.family === 'IPv4' && !i.internal && privateRe.test(i.address))
    .map((i) => i.address);
}

const nextConfig = {
  // Utilisé uniquement en développement (ignoré en production).
  allowedDevOrigins: getLanAddresses(),

  // 🔐 Les clés GIF ne sont jamais dans le code du navigateur : la recherche passe par
  // le serveur Express (/api/gifs/search), qui seul connaît la clé.

  // 🔐 L'optimiseur d'images de Next.js n'est pas utilisé (aucun next/image) : on le désactive.
  // Avant : remotePatterns '**' en faisait un proxy ouvert vers tout Internet.
  // Voir AMELIORATIONS.md pour la réflexion sur son éventuelle réactivation.
  images: {
    unoptimized: true,
  },

  // 🔐 En-têtes de sécurité sur toutes les réponses (la CSP est posée par proxy.ts, avec nonce)
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ];
    if (process.env.NODE_ENV === 'production') {
      // HTTPS obligatoire pendant 1 an (pris en compte uniquement derrière HTTPS)
      security.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    }
    return [{ source: '/:path*', headers: security }];
  },

  // Badge « N » de Next.js en mode développement : masqué (en bas à gauche, il recouvrait l'onglet « Salons »
  // sur téléphone). Les erreurs de compilation restent affichées en plein écran.
  devIndicators: false,

  // Ne pas annoncer « X-Powered-By: Next.js »
  poweredByHeader: false,

  // Redirige les appels API vers le backend en dev
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
      // ⭐ Proxy des fichiers uploadés (servis par Express sur :4000)
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:4000/uploads/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
