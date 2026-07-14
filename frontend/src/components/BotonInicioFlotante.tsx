'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut } from 'lucide-react';

const RUTAS_EXCLUIDAS = ['/', '/login', '/dashboard'];

function cerrarSesion(router: ReturnType<typeof useRouter>) {
  document.cookie = 'futuro-session=; path=/; max-age=0; SameSite=Lax';
  try {
    localStorage.removeItem('futuro-profe-proyectos');
    localStorage.removeItem('futuro-profe-nombre');
  } catch {}
  router.push('/login');
}

export function BotonInicioFlotante() {
  const pathname = usePathname();
  const router   = useRouter();

  const ocultar = RUTAS_EXCLUIDAS.some(r => pathname === r);
  if (ocultar) return null;

  return (
    <div className="fixed bottom-5 right-4 z-50 flex flex-col gap-2 items-end">
      <button
        onClick={() => router.push('/dashboard')}
        title="Volver al inicio"
        className="flex items-center gap-2 bg-gradient-to-r from-[#064e1e] to-[#16a34a] hover:opacity-90 text-white text-xs font-black px-4 py-2.5 rounded-2xl shadow-lg transition-all duration-200 hover:-translate-y-0.5 border border-white/20"
      >
        <Home className="w-3.5 h-3.5" />
        Inicio
      </button>

      <button
        onClick={() => cerrarSesion(router)}
        title="Cerrar sesión"
        className="flex items-center gap-2 bg-white hover:bg-red-50 text-red-500 hover:text-red-600 text-xs font-black px-4 py-2.5 rounded-2xl shadow-lg transition-all duration-200 hover:-translate-y-0.5 border border-red-100"
      >
        <LogOut className="w-3.5 h-3.5" />
        Salir
      </button>
    </div>
  );
}
