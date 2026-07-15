'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Search, Upload, FileSpreadsheet,
  ChevronRight, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeportistas, getPagos } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

type PagoRow = {
  detalle: string; vCargado: string; estado: 'PAGÓ' | 'PEND';
  destino: string; fecha: string; vPagado: string;
};
type AllPagos = Record<string, PagoRow[]>;

function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas).find(k => /^c[oó]d/i.test(k));
  return k ? dep._columnas[k] : '';
}
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

/* ─── Helpers para mes de afiliación ─── */
function fmtFechaP(v: string): string {
  if (!v) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
  const num = Number(v);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  const iso = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : v;
}
function getMesAfilP(cols: Record<string, string>): number {
  const k = Object.keys(cols).find(k => /fecha.*afil|afil.*fecha/i.test(k));
  if (!k) return 1;
  const f = fmtFechaP(String(cols[k] ?? '').trim());
  const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 1;
  return parseInt(m[2], 10) < 2026 ? 1 : parseInt(m[1], 10);
}
/* Meses del año (0=matrícula, 2-12 = feb-dic) */
const MESES_AÑO = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MES_ACTUAL = new Date().getMonth() + 1; // 1-based

export default function PagosPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [allPagos,    setAllPagos]    = useState<AllPagos>({});
  const [busqueda,       setBusqueda]       = useState('');
  const [filtroCodigo,   setFiltroCodigo]   = useState('');
  const [filtroPrograma, setFiltroPrograma] = useState('');
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [cargando,       setCargando]       = useState(true);

  useEffect(() => {
    getDeportistas().then(lista => { setCargando(false); if (lista.length) setDeportistas(lista); });
    getPagos().then(p => { if (Object.keys(p).length) setAllPagos(p as any); });
  }, []);

  const programas = useMemo(() =>
    [...new Set(deportistas.map(d => getCol(d, /^program/i)).filter(Boolean))].sort(),
    [deportistas]
  );

  const proyectos = useMemo(() => {
    const base = filtroPrograma
      ? deportistas.filter(d => getCol(d, /^program/i) === filtroPrograma)
      : deportistas;
    return [...new Set(base.map(d => getCol(d, /^proy/i)).filter(Boolean))].sort();
  }, [deportistas, filtroPrograma]);

  const filtrados = useMemo(() => {
    return deportistas.filter(d => {
      const q    = busqueda.toLowerCase();
      const cod  = codigoDe(d).toLowerCase();
      const prog = getCol(d, /^program/i);
      const proy = getCol(d, /^proy/i);
      if (filtroPrograma && prog !== filtroPrograma) return false;
      if (filtroProyecto && proy !== filtroProyecto) return false;
      if (filtroCodigo && !cod.includes(filtroCodigo.toLowerCase())) return false;
      if (!q) return true;
      return d._nombre.toLowerCase().includes(q) || cod.includes(q);
    }).sort((a, b) => {
      const ca = codigoDe(a), cb = codigoDe(b);
      return ca.localeCompare(cb, 'es', { numeric: true });
    });
  }, [deportistas, busqueda, filtroCodigo, filtroPrograma, filtroProyecto]);

  /* Resumen de pagos por deportista */
  function resumenPago(dep: Deportista) {
    const filas: PagoRow[] = (allPagos[dep.id] ?? []).filter((r: any) => r.estado !== 'ELIM');
    const mesAfil   = getMesAfilP(dep._columnas);
    const cargados  = MESES_AÑO.filter(n => n === 0 || n >= mesAfil).length;
    const pagados   = filas.filter(r => r.estado === 'PAGÓ').length;
    const pendientes = filas.filter(r => r.estado === 'PEND').length;
    const proximos  = filas.filter(r => r.estado === 'PROX').length;
    const totalPag  = filas.reduce((s, r) => {
      if (r.estado !== 'PAGÓ') return s;
      const n = parseInt((r.vPagado || '0').replace(/\D/g, ''));
      return s + (isNaN(n) ? 0 : n);
    }, 0);
    const totalPend = filas.reduce((s, r) => {
      if (r.estado !== 'PEND') return s;
      const n = parseInt((r.vCargado || '0').replace(/\D/g, ''));
      return s + (isNaN(n) ? 0 : n);
    }, 0);
    return { cargados, pagados, pendientes, proximos, totalPag, totalPend, total: filas.length };
  }

  function fmt(n: number) {
    if (!n) return '';
    return '$' + n.toLocaleString('es-CO').replace(/,/g, '.');
  }

  const BL = '#4b5563';
  const G  = '#16a34a';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-pag" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-pag)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')} className="relative text-white/70 hover:text-white transition">
          ← Volver
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Control de Pagos</h1>
          <p className="text-white/60 text-xs">{deportistas.length} deportistas registrados</p>
        </div>
        <div className="relative text-right leading-tight border-l border-white/30 pl-3">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* TÍTULO SECCIÓN */}
        <div className="flex items-center gap-2 pt-1">
          <DollarSign className="w-5 h-5 text-[#16a34a]" />
          <h2 className="font-black text-[#111827] text-base">Estado de Cuenta por Deportista</h2>
        </div>

        {/* FILTROS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
          {/* Fila 1: PROGRAMA + PROYECTO */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Programa</label>
              <select value={filtroPrograma}
                onChange={e => { setFiltroPrograma(e.target.value); setFiltroProyecto(''); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                <option value="">Todos los programas</option>
                {programas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Proyecto</label>
              <select value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
                <option value="">Todos los proyectos</option>
                {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 2: CÓDIGO + NOMBRE */}
          <div className="flex gap-3 flex-wrap">
            <div className="w-[130px]">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Código</label>
              <input
                value={filtroCodigo}
                onChange={e => setFiltroCodigo(e.target.value)}
                placeholder="Ej: 2018"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] bg-white"
              />
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Nombre</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar nombre..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] bg-white"
                />
              </div>
            </div>
            <div className="flex items-end pb-0.5">
              <span className="text-sm font-black text-[#16a34a]">{filtrados.length} deportistas</span>
            </div>
          </div>
        </div>

        {/* LISTA DE DEPORTISTAS */}
        {cargando ? (
          <BalonCargando />
        ) : deportistas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <User className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold text-sm">
              No hay deportistas cargados.<br/>
              Importa el archivo en <strong>Vista General</strong> primero.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    { h: 'CÓDIGO',                align: 'center' },
                    { h: 'NOMBRE DEL DEPORTISTA', align: 'left'   },
                    { h: 'PROGRAMA',              align: 'center' },
                    { h: 'CARGADOS',              align: 'center' },
                    { h: 'PAGADOS',               align: 'center' },
                    { h: 'PENDIENTES',            align: 'center' },
                    { h: 'PRÓXIMOS',              align: 'center' },
                    { h: 'ESTADO',                align: 'center' },
                    { h: 'VER CUENTA',            align: 'center' },
                  ].map(({ h, align }) => (
                    <th key={h} style={{
                      background: '#16a34a', color: 'white',
                      border: '1px solid white',
                      padding: '10px 8px',
                      textAlign: align as any,
                      fontSize: 10, fontWeight: 900,
                      letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((dep, idx) => {
                  const bg  = '#f1f5f9';
                  const cod = codigoDe(dep);
                  const prog = getCol(dep, /^program/i);
                  const { cargados, pagados, pendientes, proximos, totalPag, totalPend, total } = resumenPago(dep);
                  const tieneDatos = total > 0;

                  return (
                    <tr key={dep.id}
                      className="cursor-pointer hover:brightness-95 transition-all"
                      onClick={() => router.push(`/alumnos/${dep.id}/estado-cuenta`)}>

                      {/* CÓDIGO */}
                      <td style={{
                        background: G, color: 'white', border: '1px solid white',
                        padding: '8px 10px', textAlign: 'center',
                        fontWeight: 900, fontSize: 13,
                      }}>{cod || '—'}</td>

                      {/* NOMBRE */}
                      <td style={{
                        background: bg, color: BL, border: '1px solid white',
                        padding: '8px 12px', fontWeight: 700, fontSize: 13,
                        whiteSpace: 'nowrap',
                      }}>{dep._nombre}</td>

                      {/* PROGRAMA */}
                      <td style={{
                        background: bg, color: '#374151', border: '1px solid white',
                        padding: '8px 10px', textAlign: 'center',
                        fontSize: 11, whiteSpace: 'nowrap',
                      }}>{prog || '—'}</td>

                      {/* CARGADOS */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        <span className="font-black text-gray-600 text-sm">{cargados}</span>
                      </td>

                      {/* PAGADOS */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        {tieneDatos ? (
                          <div>
                            <span className="font-black text-green-600 text-sm">{pagados}</span>
                            {totalPag > 0 && <p className="text-[10px] text-green-500 font-semibold">{fmt(totalPag)}</p>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* PENDIENTES */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        {tieneDatos ? (
                          <div>
                            <span className={cn('font-black text-sm', pendientes > 0 ? 'text-red-500' : 'text-gray-300')}>
                              {pendientes}
                            </span>
                            {totalPend > 0 && <p className="text-[10px] text-red-400 font-semibold">{fmt(totalPend)}</p>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* PRÓXIMOS */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        <span className={cn('font-black text-sm', proximos > 0 ? 'text-blue-500' : 'text-gray-300')}>
                          {proximos || '—'}
                        </span>
                      </td>

                      {/* ESTADO chip */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        {tieneDatos ? (
                          pendientes === 0
                            ? <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full">AL DÍA</span>
                            : pagados === 0
                              ? <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">SIN PAGO</span>
                              : <span className="bg-yellow-100 text-yellow-700 text-[10px] font-black px-2 py-0.5 rounded-full">PARCIAL</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full">SIN DATOS</span>
                        )}
                      </td>

                      {/* BOTÓN */}
                      <td style={{
                        background: bg, border: '1px solid white',
                        padding: '6px 10px', textAlign: 'center',
                      }}>
                        <span className="inline-flex items-center gap-1 bg-[#16a34a] text-white text-[10px] font-black px-3 py-1.5 rounded-lg">
                          Ver <ChevronRight className="w-3 h-3" />
                        </span>
                      </td>
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
