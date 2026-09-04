import type { Metadata, Viewport } from 'next';
import { BotonInicioFlotante } from '@/components/BotonInicioFlotante';
import { AvisoMantenimiento } from '@/components/AvisoMantenimiento';
import { RastreoRuta } from '@/components/RastreoRuta';
import { InstalarApp } from '@/components/InstalarApp';
import { AvisoVersion } from '@/components/AvisoVersion';
import './globals.css';

/* ── SE QUITÓ LA LETRA DE GOOGLE (dirección, 04/09/2026) ────────────────────
   Aquí decía:  const inter = Inter({ ... })  —la letra "Inter", bajada de
   fonts.googleapis.com cada vez que se compila.

   El problema no era la letra: era que si ese servidor no contesta —antivirus,
   red de la sede, proveedor, o un tropiezo de Google—, Next NO logra armar el
   archivo de diseño y la plataforma sale SIN NADA de estilos: fondo blanco,
   letra negra y los balones del fondo del tamaño de la pantalla. Se cae toda
   la app por una letra.

   La letra ahora se pone en globals.css con las que ya trae cada computador
   (Segoe UI, San Francisco, Roboto). Se ven casi idénticas y no hay que bajar
   nada: el servidor local arranca aunque no haya internet. */

export const metadata: Metadata = {
  title:       'Futuro Antioquia — Plataforma Digital',
  description: 'Gestión deportiva, física, nutricional y formativa para escuelas de fútbol infantil',

  /* ───────────────────────────────────────────────────────────────────────
     PARA QUE SE PUEDA INSTALAR EN EL CELULAR  ·  dirección, 31/08/2026
     El manifest es la "cédula" de la app: nombre, ícono y colores. Con esto
     Chrome ofrece "Instalar aplicación" y el iPhone la agrega a la pantalla.
     ─────────────────────────────────────────────────────────────────────── */
  manifest: '/manifest.json',
  applicationName: 'Futuro Antioquia',
  appleWebApp: {
    capable: true,
    title: 'Futuro Antioquia',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#00B050',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <RastreoRuta />
        {children}
        <BotonInicioFlotante />
        <AvisoMantenimiento />
        <InstalarApp />
        {/* Dice qué versión está viendo cada quien, avisa cuando hay una nueva,
            y detecta si alguien entró por una dirección vieja de Vercel que
            nunca se actualiza. — dirección, 01/09/2026 */}
        <AvisoVersion />
      </body>
    </html>
  );
}
