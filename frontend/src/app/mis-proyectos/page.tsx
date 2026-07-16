'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { getProfes, getDeportistas } from '@/lib/db';

function getCol(dep: any, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find((c: string) => rx.test(c.trim()));
  return k ? String(cols[k] ?? '') : '';
}

export default function MisProyectosPage() {
  const router = useRouter();

  const [nombreProfe, setNombreProfe] = useState('');
  const [fotoProfe,   setFotoProfe]   = useState('');
  const [proyectosProfe, setProyectosProfe] = useState<string[]>([]);
  const [deportistas,    setDeportistas]    = useState<any[]>([]);
  const [cargando,       setCargando]       = useState(true);

  useEffect(() => {
    // 1. Nombre y foto desde localStorage (inmediato)
    try {
      const rawNombre = localStorage.getItem('futuro-profe-nombre');
      const nombre = rawNombre ? JSON.parse(rawNombre) : '';
      if (nombre) {
        setNombreProfe(nombre);
        const f1 = localStorage.getItem(`futuro-foto-profe-${nombre.toUpperCase()}`);
        if (f1) { setFotoProfe(f1); }
        else {
          const f2 = localStorage.getItem('futuro-profe-foto');
          if (f2) setFotoProfe(f2);
        }
      }
    } catch {}

    // 2. Proyectos: primero localStorage (rápido), luego Supabase (preciso)
    async function cargar() {
      try {
        const rawNombre = localStorage.getItem('futuro-profe-nombre');
        const nombre = rawNombre ? JSON.parse(rawNombre) : '';

        // Intentar desde localStorage primero (rápido)
        const rawLS = localStorage.getItem('futuro-profe-proyectos');
        const proyLS: string[] = rawLS ? JSON.parse(rawLS) : [];
        if (proyLS.length) setProyectosProfe(proyLS);

        // Luego desde Supabase para garantizar data fresca
        if (nombre) {
          const listaProfes = await getProfes();
          const profe = listaProfes.find(
            p => p.usuario.toUpperCase() === nombre.toUpperCase()
          );
          if (profe && profe.proyectos.length > 0) {
            setProyectosProfe(profe.proyectos);
            // Actualizar localStorage también
            try {
              localStorage.setItem('futuro-profe-proyectos', JSON.stringify(profe.proyectos));
            } catch {}
          }
        }
      } catch {}

      // 3. Cargar deportistas para contar alumnos por proyecto
      try {
        const lista = await getDeportistas();
        setDeportistas(lista);
      } catch {}

      setCargando(false);
    }
    cargar();
  }, []);

  // Contar deportistas por proyecto
  const conteoProyecto = useMemo(() => {
    const map: Record<string, number> = {};
    deportistas.forEach(dep => {
      const proy = getCol(dep, /^proy/i).trim();
      if (proy) map[proy] = (map[proy] ?? 0) + 1;
    });
    return map;
  }, [deportistas]);

  const primerNombre = nombreProfe ? nombreProfe.split(' ')[0] : 'Profe';
  const G = '#16a34a';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] via-[#0f5a25] to-[#052a10] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 shadow overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" aria-hidden>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-mp" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/>
                <polygon points="30,22 37,27 34,35 26,35 23,27" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-mp)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Mis Proyectos</h1>
          <p className="text-white/60 text-[11px]">Futuro Antioquia · MAX 10</p>
        </div>
        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10</p>
          <p className="text-white/60 text-[11px]">Sport</p>
        </div>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">

        {/* ── Tarjeta Bienvenida con foto grande ── */}
        <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
          {/* Banda verde superior */}
          <div style={{ background: G }} className="h-20 relative flex items-end justify-center pb-0">
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-10">
              {fotoProfe
                ? <img src={fotoProfe} alt={primerNombre}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"/>
                : <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-[#064e1e] flex items-center justify-center">
                    <span className="text-white font-black text-4xl">{primerNombre[0]}</span>
                  </div>
              }
            </div>
          </div>
          {/* Contenido bajo la foto */}
          <div className="pt-16 pb-6 px-6 text-center">
            <h2 className="text-[#111827] font-black text-xl leading-tight">
              ¡Bienvenido, Profe {primerNombre}!
            </h2>
            <p className="text-[#16a34a] font-bold text-sm mt-1">
              Estos son tus proyectos,{' '}
              <span className="text-[#111827]">cuida mucho de ellos.</span>
            </p>
          </div>
        </div>

        {/* ── Lista de proyectos ── */}
        {cargando ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin"/>
            <p className="text-gray-400 text-sm font-semibold">Cargando tus proyectos…</p>
          </div>

        ) : proyectosProfe.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-gray-700 font-bold text-sm">Sin proyectos asignados</p>
            <p className="text-gray-400 text-xs mt-1">
              Pide al administrador que te asigne proyectos en Gestión de Usuarios.
            </p>
          </div>

        ) : (
          <div className="space-y-3">
            {proyectosProfe.map(proy => {
              const alumnos = conteoProyecto[proy] ?? 0;
              return (
                <button
                  key={proy}
                  onClick={() => router.push(`/alumnos?proyecto=${encodeURIComponent(proy)}`)}
                  className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-left active:scale-[.98] transition-transform hover:shadow-md">
                  <div className="flex items-center gap-4 p-4">
                    {/* Ícono proyecto */}
                    <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-inner"
                      style={{ background: G }}>
                      <span className="text-white">
                        <svg viewBox="0 0 40 40" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="18" fill="none" stroke="white" strokeWidth="2"/>
                          <polygon points="20,13 26,17 24,24 16,24 14,17" fill="none" stroke="white" strokeWidth="2"/>
                          <circle cx="20" cy="20" r="3" fill="white"/>
                        </svg>
                      </span>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[#111827] text-base leading-tight truncate">{proy}</p>
                      <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 inline"/>
                        {alumnos > 0 ? `${alumnos} deportistas` : 'Cargando…'}
                      </p>
                    </div>
                    {/* Flecha */}
                    <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
