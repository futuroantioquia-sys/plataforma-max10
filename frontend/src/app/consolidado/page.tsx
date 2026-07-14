'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { getDeportistas, getAsistencia } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

// Feb=1 … Dic=11  (índice JS 0-based)
const MESES_CONSOLIDADO = [
  { idx: 1,  label: 'Feb' },
  { idx: 2,  label: 'Mar' },
  { idx: 3,  label: 'Abr' },
  { idx: 4,  label: 'May' },
  { idx: 5,  label: 'Jun' },
  { idx: 6,  label: 'Jul' },
  { idx: 7,  label: 'Ago' },
  { idx: 8,  label: 'Sep' },
  { idx: 9,  label: 'Oct' },
  { idx: 10, label: 'Nov' },
  { idx: 11, label: 'Dic' },
];

type Estado = 'A' | 'F' | 'S' | 'ES' | 'FA' | 'NQ' | 'C' | 'CAN' | 'SE' | '';
type AsistenciaData = Record<string, Record<string, Record<string, Record<string, Estado>>>>;

function getCol(dep: Deportista, rx: RegExp) {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
function proyectoDe(dep: Deportista) {
  return getCol(dep, /^proy/i) || '__SIN_PROYECTO__';
}
function codigoDe(dep: Deportista) {
  const k = Object.keys(dep._columnas).find(k => /^c[oó]d/i.test(k));
  return k ? dep._columnas[k] : '';
}

export default function ConsolidadoPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [asistencia,  setAsistencia]  = useState<AsistenciaData>({});
  const [programa,    setPrograma]    = useState('');
  const [proyecto,    setProyecto]    = useState('');
  const [anio,        setAnio]        = useState(new Date().getFullYear());

  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getDeportistas().then(lista => { setCargando(false); if (lista.length) setDeportistas(lista); });
    getAsistencia().then(data   => { if (Object.keys(data).length) setAsistencia(data as any); });
  }, []);

  const programas = useMemo(() => {
    const s = new Set<string>();
    deportistas.forEach(d => { const p = getCol(d, /^program/i); if (p) s.add(p); });
    return Array.from(s).sort();
  }, [deportistas]);

  const proyectos = useMemo(() => {
    const s = new Set<string>();
    deportistas
      .filter(d => !programa || getCol(d, /^program/i) === programa)
      .forEach(d => { const p = proyectoDe(d); if (p !== '__SIN_PROYECTO__') s.add(p); });
    return Array.from(s).sort();
  }, [deportistas, programa]);

  useEffect(() => {
    if (proyecto && !proyectos.includes(proyecto)) setProyecto('');
  }, [proyectos]);

  const atletas = useMemo(() => {
    if (!proyecto) return [];
    return deportistas
      .filter(d => proyectoDe(d) === proyecto)
      .sort((a, b) => a._nombre.localeCompare(b._nombre, 'es'));
  }, [deportistas, proyecto]);

  // Contar asistencias (A o C) de un deportista en un mes
  function contarMes(depId: string, mesIdx: number): number {
    const mk = `${anio}_${String(mesIdx + 1).padStart(2, '0')}`;
    const registros = asistencia[proyecto]?.[mk]?.[depId] ?? {};
    return Object.values(registros).filter(e => e === 'A' || e === 'C').length;
  }

  function totalAnio(depId: string): number {
    return MESES_CONSOLIDADO.reduce((s, m) => s + contarMes(depId, m.idx), 0);
  }

  // Sesiones realizadas por mes: fechas con al menos un estado distinto de '', CAN, SE
  function sesionesRealizadasMes(mesIdx: number): number {
    const mk = `${anio}_${String(mesIdx + 1).padStart(2, '0')}`;
    const mesDat = asistencia[proyecto]?.[mk] ?? {};
    const fechas = new Set<string>();
    Object.values(mesDat).forEach(depReg => {
      Object.entries(depReg as Record<string, Estado>).forEach(([fecha, estado]) => {
        if (estado && estado !== 'CAN' && estado !== 'SE') fechas.add(fecha);
      });
    });
    return fechas.size;
  }

  function totalSesionesAnio(): number {
    return MESES_CONSOLIDADO.reduce((s, m) => s + sesionesRealizadasMes(m.idx), 0);
  }

  function porcentaje(depId: string): string {
    const total = totalSesionesAnio();
    if (total === 0) return '—';
    return Math.round((totalAnio(depId) / total) * 100) + '%';
  }

  const AZUL  = '#4b5563';
  const G     = '#16a34a';
  const BW    = '2px solid white';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.10]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-cons" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-cons)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/asistencia')}
          className="relative text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Consolidado de Asistencia</h1>
          <p className="text-white/60 text-xs">Febrero – Diciembre · por deportista</p>
        </div>

        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* Filtros */}
      <div className="px-4 py-4 flex flex-wrap gap-3 items-end bg-white border-b border-gray-100 shadow-sm">

        {/* Año */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Año</p>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Programa */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Programa</p>
          <select value={programa} onChange={e => { setPrograma(e.target.value); setProyecto(''); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white min-w-[140px]">
            <option value="">Todos</option>
            {programas.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Proyecto */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Proyecto</p>
          <select value={proyecto} onChange={e => setProyecto(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white min-w-[160px]">
            <option value="">— Selecciona —</option>
            {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {proyecto && (
          <div className="ml-auto flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <BarChart3 className="w-4 h-4 text-[#16a34a]" />
            <span className="text-sm font-bold text-[#111827]">{atletas.length} deportistas</span>
          </div>
        )}
      </div>


      {/* Tabla */}
      <main className="px-3 py-4">
        {cargando ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <BalonCargando />
          </div>
        ) : !proyecto ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <BarChart3 className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">Selecciona un proyecto para ver el consolidado.</p>
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl shadow-sm border border-gray-200"
               style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table className="border-collapse text-sm" style={{ minWidth: 900 }}>
              <thead className="sticky top-0 z-20">
                {/* Fila 1: título proyecto + meses */}
                <tr>
                  {/* CÓDIGO */}
                  <th rowSpan={2} style={{
                    background: G, color: 'white', borderRight: BW, borderBottom: BW,
                    minWidth: 90, padding: '8px 10px', textAlign: 'center',
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.06em',
                    position: 'sticky', left: 0, zIndex: 30,
                  }}>CÓD</th>

                  {/* NOMBRE */}
                  <th rowSpan={2} style={{
                    background: G, color: 'white', borderRight: BW, borderBottom: BW,
                    minWidth: 180, padding: '8px 12px', textAlign: 'left',
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.06em',
                    position: 'sticky', left: 90, zIndex: 30,
                  }}>NOMBRE DEL DEPORTISTA</th>

                  {/* Título proyecto */}
                  <th colSpan={MESES_CONSOLIDADO.length} style={{
                    background: AZUL, color: 'white', borderBottom: BW,
                    padding: '8px 12px', textAlign: 'center',
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
                  }}>
                    ASISTENCIA {anio} — {proyecto.toUpperCase()}
                  </th>

                  {/* TOTAL */}
                  <th rowSpan={2} style={{
                    background: G, color: 'white', borderLeft: BW, borderBottom: BW,
                    minWidth: 70, padding: '8px 10px', textAlign: 'center',
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.06em',
                  }}>TOTAL</th>

                  {/* % */}
                  <th rowSpan={2} style={{
                    background: AZUL, color: 'white', borderLeft: BW, borderBottom: BW,
                    minWidth: 70, padding: '8px 10px', textAlign: 'center',
                    fontSize: 12, fontWeight: 900,
                  }}>%</th>
                </tr>

                {/* Fila 2: nombres de meses */}
                <tr>
                  {MESES_CONSOLIDADO.map(m => (
                    <th key={m.idx} style={{
                      background: G, color: 'white', borderRight: BW, borderBottom: BW,
                      minWidth: 56, padding: '6px 4px', textAlign: 'center',
                      fontSize: 11, fontWeight: 900,
                    }}>{m.label}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {atletas.map((dep, rowIdx) => {
                  const cod    = codigoDe(dep);
                  const total  = totalAnio(dep.id);
                  const bgRow  = '#f1f5f9';

                  return (
                    <tr key={dep.id}>
                      {/* CÓD */}
                      <td style={{
                        background: G, color: 'white', borderRight: BW,
                        borderBottom: BW,
                        padding: '6px 8px', textAlign: 'center',
                        fontWeight: 800, fontSize: 13,
                        position: 'sticky', left: 0, zIndex: 10,
                      }}>{cod}</td>

                      {/* NOMBRE */}
                      <td style={{
                        background: bgRow, color: AZUL,
                        borderRight: BW, borderBottom: BW,
                        padding: '6px 12px', fontWeight: 700, fontSize: 13,
                        position: 'sticky', left: 90, zIndex: 10,
                        whiteSpace: 'nowrap',
                      }}>{dep._nombre}</td>

                      {/* Celdas por mes */}
                      {MESES_CONSOLIDADO.map(m => {
                        const n = contarMes(dep.id, m.idx);
                        return (
                          <td key={m.idx} style={{
                            background: bgRow,
                            borderRight: BW,
                            borderBottom: BW,
                            padding: '6px 4px', textAlign: 'center',
                            fontWeight: 900, fontSize: 15,
                            color: n > 0 ? '#16a34a' : '#cbd5e1',
                          }}>
                            {n > 0 ? n : ''}
                          </td>
                        );
                      })}

                      {/* TOTAL */}
                      <td style={{
                        background: G, color: 'white',
                        borderLeft: BW, borderBottom: BW,
                        padding: '6px 10px', textAlign: 'center',
                        fontWeight: 900, fontSize: 15,
                      }}>{total > 0 ? total : ''}</td>

                      {/* % */}
                      <td style={{
                        background: AZUL, color: 'white',
                        borderLeft: BW, borderBottom: BW,
                        padding: '6px 10px', textAlign: 'center',
                        fontWeight: 900, fontSize: 14,
                      }}>{porcentaje(dep.id)}</td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
