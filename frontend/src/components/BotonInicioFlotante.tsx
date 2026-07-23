'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Home, LogOut } from 'lucide-react';

const RUTAS_EXCLUIDAS = ['/', '/login', '/dashboard', '/mis-proyectos'];

function esProfeActivo(): boolean {
  if (typeof document === 'undefined') return false;
  const cookies = document.cookie.split(';').map(c => c.trim());
  if (cookies.some(c => c === 'futuro-session=1')) return false;
  if (cookies.some(c => c === 'futuro-session=profesor')) return true;
  try {
    const nombre = localStorage.getItem('futuro-profe-nombre');
    const grupos = localStorage.getItem('futuro-profe-proyectos');
    if (nombre && grupos) return true;
  } catch {}
  return false;
}

function homeDestino(): string {
  return esProfeActivo() ? '/mis-proyectos' : '/dashboard';
}

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

  // Referencia al bloque de botones estáticos del fondo
  const staticRef = useRef<HTMLDivElement>(null);
  // true = botones estáticos visibles en pantalla → ocultar flotantes
  const [staticVisible, setStaticVisible] = useState(false);

  useEffect(() => {
    const el = staticRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setStaticVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pathname]);

  const ocultar = RUTAS_EXCLUIDAS.some(r => pathname === r);
  if (ocultar) return null;

  const handleInicio = () => router.push(homeDestino());
  const handleSalir  = () => cerrarSesion(router);

  return (
    <>
      {/* ── Botones flotantes: visibles mientras se desplaza,
          se ocultan automáticamente cuando los estáticos entran en pantalla ── */}
      <div
        className="fixed bottom-5 right-4 z-50 flex flex-col gap-2 items-end print:hidden transition-all duration-300"
        style={{ opacity: staticVisible ? 0 : 1, pointerEvents: staticVisible ? 'none' : 'auto' }}
      >
        <button
          onClick={handleInicio}
          title="Volver al inicio"
          className="flex items-center gap-2 bg-gradient-to-r from-[#064e1e] to-[#16a34a] hover:opacity-90 text-white text-xs font-black px-4 py-2.5 rounded-2xl shadow-lg transition-all duration-200 hover:-translate-y-0.5 border border-white/20"
        >
          <Home className="w-3.5 h-3.5" />
          Inicio
        </button>
        <button
          onClick={handleSalir}
          title="Cerrar sesión"
          className="flex items-center gap-2 bg-white hover:bg-red-50 text-red-500 hover:text-red-600 text-xs font-black px-4 py-2.5 rounded-2xl shadow-lg transition-all duration-200 hover:-translate-y-0.5 border border-red-100"
        >
          <LogOut className="w-3.5 h-3.5" />
          Salir
        </button>
      </div>

      {/* ── Botones estáticos al fondo: aparecen debajo de todo el contenido.
          Cuando son visibles, los flotantes se ocultan solos. ── */}
      <div
        ref={staticRef}
        className="flex justify-center gap-3 px-4 pt-4 pb-6 print:hidden"
      >
        <button
          onClick={handleInicio}
          className="flex items-center gap-2 bg-gradient-to-r from-[#064e1e] to-[#16a34a] hover:opacity-90 text-white text-sm font-black px-6 py-3 rounded-2xl shadow-lg transition-all duration-200 border border-white/20"
        >
          <Home className="w-4 h-4" />
          Inicio
        </button>
        <button
          onClick={handleSalir}
          className="flex items-center gap-2 bg-white hover:bg-red-50 text-red-500 hover:text-red-600 text-sm font-black px-6 py-3 rounded-2xl shadow-lg transition-all duration-200 border border-red-100"
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>
      </div>
    </>
  );
}
