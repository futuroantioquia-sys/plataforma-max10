'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, ClipboardList } from 'lucide-react';
import { getDeportistas } from '@/lib/db';

export default function MisProyectosPage() {
  const router = useRouter();

  const [misGrupos,    setMisGrupos]    = useState<string[]>([]);
  const [nombreProfe,  setNombreProfe]  = useState('');
  const [fotoProfe,    setFotoProfe]    = useState('');
  const [deportistas,  setDeportistas]  = useState<any[]>([]);
  const [cargando,     setCargando]     = useState(true);

  useEffect(() => {
    try {
      const rawGrupos = localStorage.getItem('futuro-profe-proyectos');
      if (rawGrupos) setMisGrupos(JSON.parse(rawGrupos));
      const nombre = localStorage.getItem('futuro-profe-nombre');
      if (nombre) setNombreProfe(JSON.parse(nombre));
      // Foto
      const nombre2 = nombre ? JSON.parse(nombre) : '';
      if (nombre2) {
        const f1 = localStorage.getItem(`futuro-foto-profe-${nombre2.toUpperCase()}`);
        if (f1) { setFotoProfe(f1); }
        else {
          const f2 = localStorage.getItem('futuro-profe-foto');
          if (f2) setFotoProfe(f2);
        }
      }
    } catch {}

    getDeportistas().then(lista => {
      setDeportistas(lista);
      setCargando(false);
    });
  }, []);

  /* Proyectos del profe que existen realmente en la lista de deportistas */
  const proyectos = useMemo(() => {
    if (!deportistas.length || !misGrupos.length) return misGrupos;
    const set = new Set<string>();
    deportistas.forEach(d => {
      const cols = d._columnas ?? {};
      const k = Object.keys(cols).find(k => /^proy/i.test(k));
      const val = k ? String(cols[k] ?? '').trim() : '';
      if (val && misGrupos.includes(val)) set.add(val);
    });
    // Si ninguno coincidió, mostrar los asignados en storage
    return set.size > 0 ? Array.from(set).sort() : misGrupos;
  }, [deportistas, misGrupos]);

  /* Contar alumnos por proyecto */
  function alumnosDe(proyecto: string): number {
    return deportistas.filter(d => {
      const cols = d._columnas ?? {};
      const k = Object.keys(cols).find(k => /^proy/i.test(k));
      return k ? String(cols[k] ?? '').trim() === proyecto : false;
    }).length;
  }

  const primerNombre = nombreProfe ? nombreProfe.split(' ')[0] : 'Profe';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
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

        <div className="relative flex-1 min-w-0 flex items-center gap-3">
          {fotoProfe
            ? <img src={fotoProfe} alt="" className="w-9 h-9 rounded-xl object-cover border border-white/30 flex-shrink-0"/>
            : <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-sm">{primerNombre[0]}</span>
              </div>
          }
          <div>
            <h1 className="text-white font-black text-base leading-tight">Mis Proyectos</h1>
            <p className="text-white/60 text-[11px]">{nombreProfe || 'Formador'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-4">

        {/* Bienvenida */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="font-black text-[#111827] text-base leading-snug">
            ¡Hola, {primerNombre}!
          </p>
          <p className="text-gray-500 text-sm mt-0.5">
            Estos son tus proyectos,{' '}
            <span className="font-bold text-[#16a34a]">cuida mucho de ellos.</span>
          </p>
        </div>

        {/* Lista de proyectos */}
        {cargando ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-gray-400 text-sm font-semibold">Cargando proyectos…</p>
          </div>
        ) : proyectos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-gray-700 font-bold text-sm">Sin proyectos asignados</p>
            <p className="text-gray-400 text-xs mt-1">
              Pide al administrador que te asigne proyectos en Gestión de Usuarios.
            </p>
          </div>
        ) : (
          proyectos.map(proyecto => {
            const numAlumnos = alumnosDe(proyecto);
            return (
              <div key={proyecto}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Encabezado verde */}
                <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-4 py-3 flex items-center justify-between">
                  <p className="text-white font-black text-sm">{proyecto}</p>
                  {numAlumnos > 0 && (
                    <div className="flex items-center gap-1.5 bg-white/20 rounded-lg px-2.5 py-1">
                      <Users className="w-3.5 h-3.5 text-white"/>
                      <span className="text-white font-bold text-xs">{numAlumnos}</span>
                    </div>
                  )}
                </div>

                {/* Botón gestionar */}
                <div className="p-4">
                  <button
                    onClick={() => router.push(`/asistencia?proyecto=${encodeURIComponent(proyecto)}`)}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white tracking-wide
                               transition hover:opacity-90 active:scale-[.98] flex items-center justify-center gap-2"
                    style={{ background: '#16a34a' }}>
                    <ClipboardList className="w-4 h-4"/>
                    GESTIONAR ASISTENCIAS
                  </button>
                </div>
              </div>
            );
          })
        )}

      </main>
    </div>
  );
}
