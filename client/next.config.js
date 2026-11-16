/** @type {import('next').NextConfig} */
const os = require('os');

// 🔐 Adresses IPv4 privées de ce PC (ex. 192.168.1.102).
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

  // 🔐 Les clés GIF ne sont plus recopiées dans le code du navigateur via `env` :
  // elles étaient inutilisées côté client (la clé est servie par /api/config/gif).

  // 🔐 L'optimiseur d'images de Next.js n'est pas utilisé (aucun next/image) : on le désactive.
  // Avant : remotePatterns '**' en faisait un proxy ouvert vers tout Internet.
  // Voir AMELIORATIONS.md pour la réflexion sur son éventuelle réactivation.
  images: {
    unoptimized: true,
  },

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
