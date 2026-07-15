'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Search,
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
type DepEstado = 'ACTIVO' | 'PAUSO' | 'RETIRADO';
const DEP_ESTADOS_KEY = 'futuro_dep_estados';

function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas).find(k => /^c[oó]d/i.test(k));
  return k ? dep._columnas[k] : '';
}
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

/* ── Filas del año (mismas que estado-cuenta) ── */
const DETALLE_ROWS = [
  'MATRÍCULA 2026',
  'FEBRERO 2026','MARZO 2026','ABRIL 2026','MAYO 2026','JUNIO 2026',
  'JULIO 2026','AGOSTO 2026','SEPTIEMBRE 2026','OCTUBRE 2026','NOVIEMBRE 2026','DICIEMBRE 2026',
];
const MES_NUM: Record<string, number> = {
  'MATRÍCULA 2026':0,
  'FEBRERO 2026':2,'MARZO 2026':3,'ABRIL 2026':4,'MAYO 2026':5,'JUNIO 2026':6,
  'JULIO 2026':7,'AGOSTO 2026':8,'SEPTIEMBRE 2026':9,'OCTUBRE 2026':10,'NOVIEMBRE 2026':11,'DICIEMBRE 2026':12,
};
const MES_ACTUAL = new Date().getMonth() + 1;
function esFuturo(d: string) { const n = MES_NUM[d]; return n !== undefined && n > 0 && n > MES_ACTUAL; }

/* ── Fecha afiliación → número de mes ── */
function fmtFecha(v: string): string {
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
function getMesAfil(cols: Record<string, string>): number {
  const k = Object.keys(cols).find(k => /fecha.*afil|afil.*fecha/i.test(k));
  if (!k) return 1;
  const f = fmtFecha(String(cols[k] ?? '').trim());
  const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 1;
  return parseInt(m[2], 10) < 2026 ? 1 : parseInt(m[1], 10);
}


export default function PagosPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [allPagos,    setAllPagos]    = useState<AllPagos>({});
  const [busqueda,         setBusqueda]         = useState('');
  const [filtroCodigo,     setFiltroCodigo]     = useState('');
  const [filtroPrograma,   setFiltroPrograma]   = useState('');
  const [filtroProyecto,   setFiltroProyecto]   = useState('');
  const [cargando,         setCargando]         = useState(true);
  const [depEstados,       setDepEstados]       = useState<Record<string, DepEstado>>({});
  const [mostrarRetirados, setMostrarRetirados] = useState(false);

  useEffect(() => {
    getDeportistas().then(lista => { setCargando(false); if (lista.length) setDeportistas(lista); });
    getPagos().then(p => { if (Object.keys(p).length) setAllPagos(p as any); });
    try {
      const raw = localStorage.getItem(DEP_ESTADOS_KEY);
      if (raw) setDepEstados(JSON.parse(raw));
    } catch {}
  }, []);

  function cambiarEstadoDep(depId: string, estado: DepEstado) {
    const nuevo = { ...depEstados, [depId]: estado };
    setDepEstados(nuevo);
    localStorage.setItem(DEP_ESTADOS_KEY, JSON.stringify(nuevo));
  }

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
      const estado = depEstados[d.id] ?? 'ACTIVO';
      if (!mostrarRetirados && estado === 'RETIRADO') return false;
      if (mostrarRetirados && estado !== 'RETIRADO') return false;
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
  }, [deportistas, busqueda, filtroCodigo, filtroPrograma, filtroProyecto, depEstados, mostrarRetirados]);

  /* Resumen de pagos por deportista — busca por dep.id Y por todos los códigos numéricos */
  function resumenPago(dep: Deportista) {
    // 1. Reunir todos los pagos guardados (dep.id + código numérico)
    const posKeys: string[] = [dep.id];
    for (const v of Object.values(dep._columnas)) {
      const digits = String(v ?? '').replace(/\D/g, '');
      if (digits.length >= 4 && digits.length <= 5) {
        const n = parseInt(digits, 10);
        if (n >= 2000 && n <= 2099 && digits.length === 4) continue; // excluir años
        const key = String(n);
        if (!posKeys.includes(key)) posKeys.push(key);
        if (digits !== key && !posKeys.includes(digits)) posKeys.push(digits);
      }
    }
    const mergeMap = new Map<string, any>();
    for (const key of posKeys) {
      for (const r of ((allPagos as any)[key] ?? [])) mergeMap.set(r.detalle, r);
    }

    // 2. Generar todas las filas esperadas del año según mes de afiliación
    const mesAfil = getMesAfil(dep._columnas);
    const fullRows = DETALLE_ROWS
      .filter(det => { const n = MES_NUM[det]; return n === 0 || n >= mesAfil; })
      .map(det => {
        const saved = mergeMap.get(det) as any;
        if (saved?.estado === 'ELIM') return null;
        if (saved) return saved;
        return { estado: esFuturo(det) ? 'PROX' : 'PEND' };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const pagados    = fullRows.filter((r: any) => r.estado === 'PAGÓ').length;
    const pendientes = fullRows.filter((r: any) => r.estado === 'PEND').length;
    const proximos   = fullRows.filter((r: any) => r.estado === 'PROX').length;
    const cargados   = pagados + pendientes + proximos;
    return { cargados, pagados, pendientes, proximos, total: fullRows.length };
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
            <div className="flex items-end gap-2 pb-0.5">
              <span className="text-sm font-black text-[#16a34a]">{filtrados.length} deportistas</span>
              <button
                onClick={() => setMostrarRetirados(v => !v)}
                className={cn(
                  'text-[10px] font-black px-2 py-1 rounded-lg border transition',
                  mostrarRetirados
                    ? 'bg-red-100 text-red-600 border-red-300'
                    : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                )}>
                {mostrarRetirados ? '← Activos' : 'RETIRADOS'}
              </button>
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
                    { h: 'ESTADO DEP',            align: 'center' },
                    { h: 'CÓDIGO',                align: 'center' },
                    { h: 'NOMBRE DEL DEPORTISTA', align: 'left'   },
                    { h: 'PROGRAMA',              align: 'center' },
                    { h: 'CARGADOS',              align: 'center' },
                    { h: 'PAGADOS',               align: 'center' },
                    { h: 'PENDIENTES',            align: 'center' },
                    { h: 'PRÓXIMOS',              align: 'center' },
                    { h: 'ESTADO PAGO',           align: 'center' },
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
                      className="hover:brightness-95 transition-all">

                      {/* ESTADO DEP */}
                      <td style={{ background: bg, border: '1px solid white', padding: '4px 6px', textAlign: 'center' }}
                          onClick={e => e.stopPropagation()}>
                        {(() => {
                          const est: DepEstado = depEstados[dep.id] ?? 'ACTIVO';
                          const colors: Record<DepEstado, string> = {
                            ACTIVO:   '#16a34a',
                            PAUSO:    '#f59e0b',
                            RETIRADO: '#ef4444',
                          };
                          return (
                            <select
                              value={est}
                              onChange={e => cambiarEstadoDep(dep.id, e.target.value as DepEstado)}
                              style={{ color: colors[est], background: 'transparent', border: 'none', fontWeight: 900, fontSize: 10, cursor: 'pointer', outline: 'none' }}>
                              <option value="ACTIVO">ACTIVO</option>
                              <option value="PAUSO">PAUSO</option>
                              <option value="RETIRADO">RETIRADO</option>
                            </select>
                          );
                        })()}
                      </td>

                      {/* CÓDIGO */}
                      <td
                        onClick={() => router.push(`/alumnos/${dep.id}/estado-cuenta`)}
                        style={{
                          background: G, color: 'white', border: '1px solid white',
                          padding: '8px 10px', textAlign: 'center',
                          fontWeight: 900, fontSize: 13, cursor: 'pointer',
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
                        <span className="font-black text-green-600 text-sm">{pagados || '—'}</span>
                      </td>

                      {/* PENDIENTES */}
                      <td style={{
                        background: pendientes > 0 ? '#fef2f2' : bg,
                        border: '1px solid white', padding: '6px 8px', textAlign: 'center',
                      }}>
                        <span className={cn('font-black text-sm', pendientes > 0 ? 'text-red-500' : 'text-gray-300')}>
                          {pendientes > 0 ? pendientes : '—'}
                        </span>
                      </td>

                      {/* PRÓXIMOS */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        <span className={cn('font-black text-sm', proximos > 0 ? 'text-blue-500' : 'text-gray-300')}>
                          {proximos || '—'}
                        </span>
                      </td>

                      {/* ESTADO chip */}
                      <td style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'center' }}>
                        {pendientes === 0 && tieneDatos
                          ? <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap">AL DÍA</span>
                          : pendientes > 0
                            ? <span className="bg-red-100 text-red-500 text-[10px] font-black px-2 py-0.5 rounded-full">PEND</span>
                            : <span className="text-gray-300 text-xs">—</span>
                        }
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
