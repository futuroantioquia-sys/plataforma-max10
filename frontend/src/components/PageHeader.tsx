'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  titulo:     string;
  subtitulo?: string;
  onBack?:    () => void;
  backTo?:    string;      /* ruta de fallback si no hay historial */
  children?:  ReactNode;  /* botones extra a la derecha */
  color?:     'verde' | 'azul' | 'dorado' | 'purple' | 'teal';
  badge?:     string;
}

const gradientes: Record<string, string> = {
  verde:  'from-[#064e1e] via-[#0a6628] to-[#16a34a]',
  azul:   'from-[#0f172a] via-[#1e3a8a] to-[#2563eb]',
  dorado: 'from-[#431407] via-[#92400e] to-[#d97706]',
  purple: 'from-[#2e1065] via-[#581c87] to-[#9333ea]',
  teal:   'from-[#042f2e] via-[#134e4a] to-[#0d9488]',
};

export function PageHeader({
  titulo, subtitulo, onBack, backTo = '/dashboard', children, color = 'verde', badge,
}: PageHeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (onBack) { onBack(); return; }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(backTo);
    }
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-20 px-4 py-3.5',
        'bg-gradient-to-r shadow-lg',
        gradientes[color],
      )}
    >
      {/* Patrón de balones */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.06]">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id={`sp-ph-${color}`} x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="10" fill="none" stroke="white" strokeWidth="1"/>
              <polygon points="24,18 29,22 27,28 21,28 19,22" fill="none" stroke="white" strokeWidth="0.7"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#sp-ph-${color})`}/>
        </svg>
      </div>

      <div className="relative flex items-center gap-3">
        {/* Botón atrás */}
        <button
          onClick={handleBack}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 transition-all flex-shrink-0 border border-white/20"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        {/* Título */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-white font-black text-base leading-tight truncate">{titulo}</h1>
            {badge && (
              <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/30 flex-shrink-0">
                {badge}
              </span>
            )}
          </div>
          {subtitulo && (
            <p className="text-white/55 text-[11px] font-semibold mt-0.5 truncate">{subtitulo}</p>
          )}
        </div>

        {/* Marca */}
        <div className="hidden sm:block text-right leading-tight flex-shrink-0">
          <p className="text-white font-black text-xs tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/40 text-[9px] font-semibold">Conecta · Gestiona · Gana</p>
        </div>

        {/* Botones extra */}
        {children && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
