import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { BotonInicioFlotante } from '@/components/BotonInicioFlotante';
import { AvisoMantenimiento } from '@/components/AvisoMantenimiento';
import { RastreoRuta } from '@/components/RastreoRuta';
import { InstalarApp } from '@/components/InstalarApp';
import './globals.css';

const inter = Inter({ subsets: ['latin'], preload: false, display: 'swap' });

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
      <body className={inter.className}>
        <RastreoRuta />
        {children}
        <BotonInicioFlotante />
        <AvisoMantenimiento />
        <InstalarApp />
      </body>
    </html>
  );
}
