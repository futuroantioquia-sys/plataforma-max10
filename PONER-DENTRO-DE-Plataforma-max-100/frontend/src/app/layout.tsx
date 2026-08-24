import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { BotonInicioFlotante } from '@/components/BotonInicioFlotante';
import { AvisoMantenimiento } from '@/components/AvisoMantenimiento';
import { RastreoRuta } from '@/components/RastreoRuta';
import './globals.css';

const inter = Inter({ subsets: ['latin'], preload: false, display: 'swap' });

export const metadata: Metadata = {
  title:       'Futuro Antioquia — Plataforma Digital',
  description: 'Gestión deportiva, física, nutricional y formativa para escuelas de fútbol infantil',
  icons:       { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <RastreoRuta />
        {children}
        <BotonInicioFlotante />
        <AvisoMantenimiento />
      </body>
    </html>
  );
}
