/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⭐ Expose les clés GIF du .env racine vers le client Next.js
  // Les variables GIF_* ne sont pas NEXT_PUBLIC_ mais sont rendues accessibles ici
  env: {
    NEXT_PUBLIC_GIF_KLIPY_KEY:  process.env.GIF_KLIPY_API_KEY  || '',
    NEXT_PUBLIC_GIF_GIPHY_KEY:  process.env.GIF_GIPHY_API_KEY  || '',
    NEXT_PUBLIC_GIF_TENOR_KEY:  process.env.GIF_TENOR_API_KEY  || '',
  },
  // 🔐 L'optimiseur d'images de Next.js n'est pas utilisé (aucun next/image) : on le désactive.
  // Avant : remotePatterns '**' en faisait un proxy ouvert vers tout Internet, et Next 14
  // a des failles critiques connues dans cet optimiseur (exécution de code à distance).
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
