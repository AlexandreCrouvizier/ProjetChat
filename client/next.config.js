/** @type {import('next').NextConfig} */
const nextConfig = {
  // ⭐ Expose les clés GIF du .env racine vers le client Next.js
  // Les variables GIF_* ne sont pas NEXT_PUBLIC_ mais sont rendues accessibles ici
  env: {
    NEXT_PUBLIC_GIF_KLIPY_KEY:  process.env.GIF_KLIPY_API_KEY  || '',
    NEXT_PUBLIC_GIF_GIPHY_KEY:  process.env.GIF_GIPHY_API_KEY  || '',
    NEXT_PUBLIC_GIF_TENOR_KEY:  process.env.GIF_TENOR_API_KEY  || '',
  },
  // Autorise les images depuis n'importe quel domaine (avatars, GIFs, etc.)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
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
