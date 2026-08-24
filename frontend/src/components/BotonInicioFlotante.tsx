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
    <div className="fixed z-40 bottom-20 right-4 sm:right-6 flex flex-col gap-3 items-end print:hidden">
      {/* INICIO — solo ícono; al pasar el mouse se expande y aparece la palabra */}
      <button
        onClick={() => router.push('/dashboard')}
        title="Inicio"
        className="group flex items-center h-[52px] w-[52px] hover:w-[132px] rounded-full overflow-hidden whitespace-nowrap shadow-md hover:shadow-lg transition-all duration-300 border border-white/20 bg-gradient-to-r from-[#064e1e] to-[#16a34a] text-white"
      >
        <span className="flex-none w-[52px] flex items-center justify-center">
          <Home className="w-5 h-5" />
        </span>
        <span className="font-black text-sm pr-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Inicio</span>
      </button>

      {/* SALIR */}
      <button
        onClick={() => cerrarSesion(router)}
        title="Salir"
        className="group flex items-center h-[52px] w-[52px] hover:w-[132px] rounded-full overflow-hidden whitespace-nowrap shadow-md hover:shadow-lg transition-all duration-300 border border-red-100 bg-white text-red-500 hover:text-red-600"
      >
        <span className="flex-none w-[52px] flex items-center justify-center">
          <LogOut className="w-5 h-5" />
        </span>
        <span className="font-black text-sm pr-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Salir</span>
      </button>
    </div>
  );
}
