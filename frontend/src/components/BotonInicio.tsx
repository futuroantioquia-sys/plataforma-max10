'use client';

import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';

/**
 * Botón "Volver al inicio" — se usa en el header de cada módulo.
 * Lleva siempre al dashboard (listado de módulos).
 */
export function BotonInicio({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push('/dashboard')}
      title="Volver al inicio"
      className={`flex items-center gap-1.5 bg-white/20 hover:bg-white/35 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition ${className}`}
    >
      <Home className="w-3.5 h-3.5" />
      Inicio
    </button>
  );
}
