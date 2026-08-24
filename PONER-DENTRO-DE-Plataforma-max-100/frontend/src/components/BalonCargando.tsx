'use client';

/**
 * Pantalla de espera de la plataforma.
 *
 * Va en el mismo gris oscuro con verde del resto de la app: se ve al entrar
 * a cualquier módulo y al refrescar con F5, así que no puede quedar en blanco.
 */

const LIENZO = '#333F50';   // fondo de la pantalla
const PANEL  = '#3C4759';   // parches del balón
const CAMPO  = '#2B3547';   // cuero del balón
const VERDE  = '#00B050';   // costuras y aro

export function BalonCargando({ texto = 'Cargando plataforma…' }: { texto?: string }) {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-5"
      style={{ background: LIENZO }}
    >
      {/* Balón de fútbol giratorio */}
      <svg
        className="w-20 h-20 animate-spin"
        style={{ animationDuration: '1.2s' }}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="50" cy="50" r="46" fill={CAMPO} stroke={VERDE} strokeWidth="3" />

        {/* Pentágono central */}
        <polygon points="50,30 66,42 60,60 40,60 34,42" fill={VERDE} stroke={VERDE} strokeWidth="1" />

        {/* Costuras desde los vértices */}
        <line x1="50" y1="30" x2="50" y2="12" stroke={VERDE} strokeWidth="2" strokeLinecap="round" />
        <line x1="66" y1="42" x2="83" y2="36" stroke={VERDE} strokeWidth="2" strokeLinecap="round" />
        <line x1="60" y1="60" x2="72" y2="76" stroke={VERDE} strokeWidth="2" strokeLinecap="round" />
        <line x1="40" y1="60" x2="28" y2="76" stroke={VERDE} strokeWidth="2" strokeLinecap="round" />
        <line x1="34" y1="42" x2="17" y2="36" stroke={VERDE} strokeWidth="2" strokeLinecap="round" />

        {/* Parches de las esquinas */}
        <polygon points="50,12 60,18 56,30 44,30 40,18" fill={PANEL} stroke={VERDE} strokeWidth="1.2" />
        <polygon points="83,36 88,47 77,54 68,47 72,36" fill={PANEL} stroke={VERDE} strokeWidth="1.2" />
        <polygon points="72,76 64,86 52,82 52,70 63,66" fill={PANEL} stroke={VERDE} strokeWidth="1.2" />
        <polygon points="28,76 36,86 48,82 48,70 37,66" fill={PANEL} stroke={VERDE} strokeWidth="1.2" />
        <polygon points="17,36 12,47 23,54 32,47 28,36" fill={PANEL} stroke={VERDE} strokeWidth="1.2" />
      </svg>

      <p className="text-white text-sm font-bold tracking-wide">{texto}</p>
    </div>
  );
}
