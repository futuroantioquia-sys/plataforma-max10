/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Los errores de tipo no bloquean el build de producción
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: [
      'fykdyalpuydkwfjqguip.supabase.co',
      'lh3.googleusercontent.com',
    ],
  },
};

module.exports = nextConfig;
