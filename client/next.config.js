/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },
};

module.exports = nextConfig;
