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
      /* cdn.sheetjs.com es el LECTOR DE EXCEL. La plataforma lo baja de ahí cada
         vez que alguien sube o descarga un archivo de Excel: importar
         deportistas, subir estratos, cargar torneos, el libro contable.
         Al poner esta política el 24/08/2026 se olvidó incluirlo, y desde esa
         mañana toda subida de Excel fallaba con "No se pudo cargar el lector de
         Excel" — tanto en internet como en el computador local. — 25/08/2026 */
      /* cdnjs.cloudflare.com trae las dos librerías que arman el PDF de la
         Valoración Dinámica (html2canvas y jsPDF). Se bajan solo cuando el
         formador oprime DESCARGAR PDF, igual que el lector de Excel.
         Se hace así, y no instalándolas en el proyecto, para no obligar a
         reinstalar nada en el computador cada vez. — 25/08/2026 */
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.sheetjs.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://cdn.sheetjs.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
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
  /* ── QUÉ SE GUARDA EN COPIA Y QUÉ NO ──────────────────────────────────────
     (dirección, 01/09/2026 — ESTE ERA EL HUECO DE LOS 31 GB)

     QUÉ PASABA: aquí abajo había UNA sola regla, `no-store`, puesta sobre
     TODAS las direcciones. `no-store` quiere decir "no guardes copia de esto
     en ninguna parte, nunca". Y aplicaba a todo: a las pantallas, sí, pero
     también al programa de la plataforma, a los dibujos, al escudo, a las
     letras. Absolutamente todo se volvía a bajar del servidor en cada clic
     de cada persona.

     Se veía en los números de Vercel: el servidor mandó 31 GB y a la gente
     le llegaron 25. El servidor entregaba MÁS de lo que la gente recibía —
     eso solo pasa cuando ni siquiera la red de Vercel guarda copia.

     LA CURA — tres reglas en vez de una, según qué sea la cosa:

       1. EL PROGRAMA DE LA PLATAFORMA (/_next/static)
          Se guarda un año. Suena arriesgado y no lo es: Next.js le pone a
          cada archivo un nombre distinto cada vez que publicamos. Un archivo
          viejo y uno nuevo NUNCA se llaman igual, así que no hay forma de
          quedarse con el viejo. Esta es la regla que trae Next de fábrica y
          que la regla anterior estaba tapando.

       2. LOS DIBUJOS (escudos, mascota, fondos, íconos)
          Se guardan un día. Si algún día usted cambia un dibujo por otro con
          el mismo nombre, la gente lo ve al día siguiente. Es lo único que se
          pierde, y a cambio esa imagen de 1,3 MB deja de bajarse en cada
          visita.

       3. LAS PANTALLAS
          Siguen SIEMPRE frescas. Cambiamos `no-store` por `no-cache`, que se
          parecen pero no son lo mismo:
             no-store  = no guardes nada, bájalo todo otra vez, siempre.
             no-cache  = guárdalo, pero pregunta antes de usarlo.
          Con `no-cache` el navegador pregunta "¿cambió?" y si no cambió el
          servidor contesta "no" con dos letras en vez de mandar la pantalla
          entera. Nadie ve nunca información vieja, y se deja de gastar.

     LAS CABECERAS DE SEGURIDAD VAN EN LAS TRES. Eso no se toca. */
  async headers() {
    return [
      {
        // 1 · El programa: nombres únicos por publicación, se puede guardar sin miedo.
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          ...CABECERAS_SEGURIDAD,
        ],
      },
      {
        // 2 · Dibujos y letras: un día guardados, y una semana más mientras
        //     se busca la versión nueva por detrás (stale-while-revalidate).
        source: '/:todo*.:ext(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|otf)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
          ...CABECERAS_SEGURIDAD,
        ],
      },
      {
        // 3 · Todo lo demás —las pantallas— siempre fresco, pero preguntando.
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
          ...CABECERAS_SEGURIDAD,
        ],
      },
    ];
  },
};

module.exports = nextConfig;
