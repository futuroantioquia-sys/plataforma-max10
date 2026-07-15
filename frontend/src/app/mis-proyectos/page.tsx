'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, ClipboardList } from 'lucide-react';
import { getDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';

const PROYECTOS_META_KEY = 'futuro_proyectos_meta';

const ORDEN_PROGRAMA = [
  'Estimulación','Formación','Progresión',
  'Pre-Progresión','Selección','Desarrollo',
];

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k.trim()));
  return k ? (dep._columnas[k] ?? '') : '';
}

function ordenProg(p: string) {
  const i = ORDEN_PROGRAMA.findIndex(x => x.toLowerCase() === p.trim().toLowerCase());
  return i >= 0 ? i : 999;
}

interface ProyRow {
  programa: string;
  proyecto: string;
  profe:    string;
  sede:     string;
  jornada:  string;
  horario:  string;
  count:    number;
}

export default function MisProyectosPage() {
  const router = useRouter();

  const [misGrupos,   setMisGrupos]   = useState<string[]>([]);
  const [nombreProfe, setNombreProfe] = useState('');
  const [fotoProfe,   setFotoProfe]   = useState('');
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [meta,        setMeta]        = useState<Record<string, { horario: string; calificacion: string }>>({});
  const [cargando,    setCargando]    = useState(true);

  useEffect(() => {
    try {
      const rawGrupos = localStorage.getItem('futuro-profe-proyectos');
      if (rawGrupos) setMisGrupos(JSON.parse(rawGrupos));

      const nombre = localStorage.getItem('futuro-profe-nombre');
      if (nombre) setNombreProfe(JSON.parse(nombre));

      const nombre2 = nombre ? JSON.parse(nombre) : '';
      if (nombre2) {
        const f1 = localStorage.getItem(`futuro-foto-profe-${nombre2.toUpperCase()}`);
        if (f1) { setFotoProfe(f1); }
        else {
          const f2 = localStorage.getItem('futuro-profe-foto');
          if (f2) setFotoProfe(f2);
        }
      }

      const rawMeta = localStorage.getItem(PROYECTOS_META_KEY);
      if (rawMeta) setMeta(JSON.parse(rawMeta));
    } catch {}

    getDeportistas().then(lista => {
      setDeportistas(lista);
      setCargando(false);
    });
  }, []);

  /* Agrupar por programa → proyecto, solo los del profe */
  const grupos = useMemo(() => {
    if (!deportistas.length) return [];

    const map: Record<string, Record<string, Deportista[]>> = {};
    deportistas.forEach(dep => {
      const prog = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
      const proy = getCol(dep, /^proyecto/i).trim() || '__SIN_PROYECTO__';
      // Filtrar solo proyectos asignados al profe
      if (misGrupos.length > 0 && !misGrupos.includes(proy)) return;
      if (!map[prog]) map[prog] = {};
      if (!map[prog][proy]) map[prog][proy] = [];
      map[prog][proy].push(dep);
    });

    return Object.entries(map)
      .sort(([a], [b]) => ordenProg(a) - ordenProg(b))
      .map(([programa, proyMap]) => {
        const filas: ProyRow[] = Object.entries(proyMap)
          .sort(([a], [b]) => a.localeCompare(b, 'es'))
          .map(([proyecto, deps]) => {
            const k = `${programa}::${proyecto}`;
            return {
              programa,
              proyecto,
              profe:   getCol(deps[0], /^prof/i),
              sede:    getCol(deps[0], /^sede/i),
              jornada: getCol(deps[0], /^jornada/i),
              horario: meta[k]?.horario ?? '',
              count:   deps.length,
            };
          });
        return { programa, filas };
      });
  }, [deportistas, misGrupos, meta]);

  const primerNombre = nombreProfe ? nombreProfe.split(' ')[0] : 'Profe';
  const G    = '#16a34a';
  const AZUL = '#4b5563';

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

        <div className="relative flex-1 min-w-0 flex items-center gap-3">
          {fotoProfe
            ? <img src={fotoProfe} alt="" className="w-9 h-9 rounded-xl object-cover border border-white/30 flex-shrink-0"/>
            : <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-black text-sm">{primerNombre[0]}</span>
              </div>
          }
          <div>
            <h1 className="text-white font-black text-base leading-tight">
              ¡Bienvenido, Profe {primerNombre}!
            </h1>
            <p className="text-white/60 text-[11px]">Mis proyectos · Futuro Antioquia</p>
          </div>
        </div>

        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10</p>
          <p className="text-white/60 text-[11px]">Sport</p>
        </div>
      </header>

      <main className="px-3 py-4 space-y-5">

        {/* ── Bienvenida ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="font-black text-[#111827] text-base leading-snug">
            Estos son tus proyectos,{' '}
            <span className="text-[#16a34a]">cuida mucho de ellos.</span>
          </p>
          <p className="text-gray-400 text-sm mt-0.5">
            Toca <strong className="text-[#16a34a]">GESTIONAR</strong> para registrar asistencia de cada grupo.
          </p>
        </div>

        {/* ── Tabla estilo Programas y Proyectos ── */}
        {cargando ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-gray-400 text-sm font-semibold">Cargando proyectos…</p>
          </div>

        ) : grupos.length === 0 ? (
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
          grupos.map(({ programa, filas }) => (
            <div key={programa} className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

              {/* Cabecera programa — gris oscuro igual que proyectos */}
              <div style={{ background: AZUL }} className="px-5 py-3 flex items-center gap-3">
                <span className="text-white font-black text-sm uppercase tracking-widest">
                  {programa === '__SIN_PROGRAMA__' ? 'Sin Programa' : programa}
                </span>
                <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {filas.reduce((s, f) => s + f.count, 0)} deportistas
                </span>
              </div>

              {/* Tabla */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ background: G }}>
                      <th style={{ border: '2px solid white' }}
                        className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        Proyecto
                      </th>
                      <th style={{ border: '2px solid white' }}
                        className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        Sede
                      </th>
                      <th style={{ border: '2px solid white' }}
                        className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        Días
                      </th>
                      <th style={{ border: '2px solid white' }}
                        className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        Horario
                      </th>
                      <th style={{ border: '2px solid white', background: AZUL }}
                        className="px-4 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        <Users className="w-3.5 h-3.5 inline mr-1"/>Dep.
                      </th>
                      <th style={{ border: '2px solid white', background: '#15803d' }}
                        className="px-4 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        <ClipboardList className="w-3.5 h-3.5 inline mr-1"/>Asistencias
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(row => (
                      <tr key={row.proyecto}
                        style={{ background: '#f1f5f9', borderTop: '2px solid white' }}>
                        <td className="px-4 py-2.5 font-black text-[#111827] whitespace-nowrap"
                          style={{ border: '2px solid white' }}>
                          {row.proyecto === '__SIN_PROYECTO__' ? '— Sin Proyecto —' : row.proyecto}
                        </td>
                        <td className="px-4 py-2.5 text-[#111827] whitespace-nowrap"
                          style={{ border: '2px solid white' }}>
                          {row.sede || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[#111827] whitespace-nowrap"
                          style={{ border: '2px solid white' }}>
                          {row.jornada || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[#111827] whitespace-nowrap"
                          style={{ border: '2px solid white' }}>
                          {row.horario || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center font-black text-[#111827]"
                          style={{ background: '#f1f5f9', border: '2px solid white' }}>
                          {row.count}
                        </td>
                        <td className="px-3 py-2 text-center"
                          style={{ border: '2px solid white' }}>
                          <button
                            onClick={() => router.push(`/asistencia?proyecto=${encodeURIComponent(row.proyecto)}`)}
                            className="inline-flex items-center gap-1.5 bg-[#16a34a] hover:bg-[#15803d] text-white font-black text-xs rounded-lg px-3 py-2 transition active:scale-[.97] whitespace-nowrap">
                            <ClipboardList className="w-3.5 h-3.5"/>
                            GESTIONAR
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          ))
        )}

      </main>
    </div>
  );
}
