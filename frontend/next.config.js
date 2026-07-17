/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: [
      'gsovtgtrsqzoruvgmhed.supabase.co',
      'fykdyalpuydkwfjqguip.supabase.co',
      'lh3.googleusercontent.com',
    ],
  },
  // Forzar que el navegador siempre pida la versión más nueva
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
