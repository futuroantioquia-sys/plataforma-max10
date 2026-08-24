/** @type {import('next').NextConfig} */

// ── Cabeceras de seguridad ───────────────────────────────────────────────────
// Son instrucciones que el servidor le da al navegador para que proteja a quien
// visita la plataforma. Antes no había ninguna.
const CABECERAS_SEGURIDAD = [
  // Obliga a usar siempre HTTPS durante 2 años (evita interceptación en wifi público).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Impide que OTRA web meta la plataforma dentro de un marco y engañe al usuario.
  // SAMEORIGIN (no DENY): la propia plataforma sí puede mostrarse a sí misma en
  // un iframe — lo necesitan la ficha del deportista, el estado de cuenta, etc.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Impide que el navegador "adivine" el tipo de archivo (vector de ataques).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No filtra la dirección interna que visitaba el usuario hacia otros sitios.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Apaga cámara, micrófono y ubicación: la plataforma no los necesita.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Evita que otros sitios abran ventanas con acceso a esta.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Política de contenido: solo se carga código y datos de sitios conocidos.
  // 'unsafe-inline'/'unsafe-eval' siguen permitidos porque Next.js y las páginas
  // actuales los necesitan; endurecerlo más es tarea de la Fase 3.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Se mantiene en true para no bloquear despliegues urgentes, pero conviene
    // pasarlo a false y arreglar los errores: los fallos de tipos han sido la
    // causa de varios errores en producción.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // No revelar qué servidor y versión se usa.
  poweredByHeader: false,
  images: {
    domains: [
      'gsovtgtrsqzoruvgmhed.supabase.co',
      'fykdyalpuydkwfjqguip.supabase.co',
      'lh3.googleusercontent.com',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Forzar que el navegador siempre pida la versión más nueva
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          ...CABECERAS_SEGURIDAD,
        ],
      },
    ];
  },
};

module.exports = nextConfig;
