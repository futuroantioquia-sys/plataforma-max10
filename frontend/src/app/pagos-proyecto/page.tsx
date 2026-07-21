'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import type { Deportista } from '@/lib/db';
import { getDeportistas, getPagos } from '@/lib/db';

/* ─── Constantes ─────────────────────────────────────────────── */
const G = '#16a34a';

const DETALLE_ROWS = [
  'MATRÍCULA','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];
const MES_NUM: Record<string, number> = {
  'MATRÍCULA':0,'MATRÍCULA 2026':0,
  'FEBRERO':2,'FEBRERO 2026':2,'MARZO':3,'MARZO 2026':3,'ABRIL':4,'ABRIL 2026':4,
  'MAYO':5,'MAYO 2026':5,'JUNIO':6,'JUNIO 2026':6,'JULIO':7,'JULIO 2026':7,
  'AGOSTO':8,'AGOSTO 2026':8,'SEPTIEMBRE':9,'SEPTIEMBRE 2026':9,
  'OCTUBRE':10,'OCTUBRE 2026':10,'NOVIEMBRE':11,'NOVIEMBRE 2026':11,
  'DICIEMBRE':12,'DICIEMBRE 2026':12,
};
const MES_ABREV: Record<string, string> = {
  'MATRÍCULA':'MAT','FEBRERO':'FEB','MARZO':'MAR','ABRIL':'ABR',
  'MAYO':'MAY','JUNIO':'JUN','JULIO':'JUL','AGOSTO':'AGO',
  'SEPTIEMBRE':'SEP','OCTUBRE':'OCT','NOVIEMBRE':'NOV','DICIEMBRE':'DIC',
};

/* Normaliza detalle quitando año: "FEBRERO 2026" → "FEBRERO" */
const nd = (s: string) => s.replace(/\s+\d{4}$/, '').trim();

function esFuturo(d: string) {
  const n = MES_NUM[d];
  return n !== undefined && n !== 0 && n > new Date().getMonth() + 1;
}

function getCol(cols: Record<string, string>, rx: RegExp): string {
  const k = Object.keys(cols).find(k => rx.test(k.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}

function colorCodigo(afil: string): string {
  const v = afil.toLowerCase();
  if (v.includes('antigu'))    return '#16a34a';
  if (v.includes('nuevo'))     return '#f97316';
  if (v.includes('reingreso')) return '#2563eb';
  if (v.includes('mb instit')) return '#374151';
  if (v.includes('b instit'))  return '#7c3aed';
  return '#6b7280';
}

function formatFechaP(v: string): string {
  if (!v) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
  const num = Number(v);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${date.getUTCFullYear()}`;
  }
  const iso = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return v;
}

function getMesAfil(cols: Record<string, string>): number {
  const k = Object.keys(cols).find(k => /fecha.*afil|afil.*fecha/i.test(k));
  if (!k) return 1;
  const f = formatFechaP(String(cols[k] ?? '').trim());
  const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 1;
  const mes = parseInt(m[1], 10), anio = parseInt(m[2], 10);
  return anio < 2026 ? 1 : mes;
}

const ORDEN_PROG = ['ESTIMULACION','FORMACION','SELECCION','DESARROLLO'];
function normStr(s: string) { return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function ordenProg(nombre: string) {
  const n = normStr(nombre);
  const i = ORDEN_PROG.findIndex(o => n.startsWith(o));
  return i === -1 ? 99 : i;
}

/* ─── Resumen de pagos ──────────────────────────────────────── */
function resumenPagos(dep: Deportista, allPagos: Record<string, any[]>) {
  const codRaw = getCol(dep._columnas, /^c[oó]d/i).replace(/\D/g, '');
  const codN   = codRaw ? String(parseInt(codRaw, 10)) : '';
  /* Normalizar claves al insertar: dep.id (último) gana sobre libro */
  const mergeMap = new Map<string, any>();
  for (const r of (allPagos[codN]   ?? [])) mergeMap.set(nd(r.detalle), r);
  if (codRaw !== codN)
    for (const r of (allPagos[codRaw] ?? [])) mergeMap.set(nd(r.detalle), r);
  for (const r of (allPagos[dep.id] ?? [])) mergeMap.set(nd(r.detalle), r);

  const mesAfil = getMesAfil(dep._columnas);
  const rowsCargados = DETALLE_ROWS.filter(d => {
    const n = MES_NUM[d]; return n === 0 || n >= mesAfil;
  });

  const getEstado = (d: string) => {
    const row = mergeMap.get(nd(d));
    if (row) return row.estado;
    return esFuturo(d) ? 'PROX' : 'PEND';
  };

  let pagados = 0, pendientes = 0, proximos = 0;
  const mesesPendientes: string[] = [];
  for (const d of rowsCargados) {
    const e = getEstado(d);
    if      (e === 'PAGÓ') pagados++;
    else if (e === 'PEND') { pendientes++; mesesPendientes.push(MES_ABREV[d] ?? d.slice(0,3)); }
    else                   proximos++;
  }
  return { cargados: rowsCargados.length, pagados, pendientes, proximos, mesesPendientes };
}

/* ══════════════════════════════════════════════════════════════ */
export default function PagosProyectoPage() {
  const router = useRouter();

  const [lista,    setLista]    = useState<Deportista[]>([]);
  const [allPagos, setAllPagos] = useState<Record<string, any[]>>({});
  const [prog,     setProg]     = useState('');
  const [proy,     setProy]     = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    getDeportistas().then(deps => { if (deps.length) setLista(deps); }).catch(() => {});
    getPagos().then(pagos => { if (Object.keys(pagos).length) setAllPagos(pagos as any); }).catch(() => {});
    const savedProg = sessionStorage.getItem('pp_prog') ?? '';
    const savedProy = sessionStorage.getItem('pp_proy') ?? '';
    if (savedProg) setProg(savedProg);
    if (savedProy) setProy(savedProy);
  }, []);

  useEffect(() => { sessionStorage.setItem('pp_prog', prog); }, [prog]);
  useEffect(() => { sessionStorage.setItem('pp_proy', proy); }, [proy]);

  const programas = useMemo(() =>
    [...new Set(lista.map(d => getCol(d._columnas, /^prog/i)).filter(Boolean))]
      .sort((a, b) => {
        const da = ordenProg(a), db = ordenProg(b);
        return da !== db ? da - db : a.localeCompare(b, 'es');
      }),
  [lista]);

  const proyectos = useMemo(() =>
    [...new Set(
      lista
        .filter(d => !prog || getCol(d._columnas, /^prog/i) === prog)
        .map(d => getCol(d._columnas, /^proy/i))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es')),
  [lista, prog]);

  const depsFiltrados = useMemo(() => {
    if (!proy) return [];
    const base = lista.filter(d =>
      (!prog || getCol(d._columnas, /^prog/i) === prog) &&
      getCol(d._columnas, /^proy/i) === proy &&
      (!busqueda ||
        d._nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        getCol(d._columnas, /^c[oó]d/i).toLowerCase().includes(busqueda.toLowerCase()))
    );
    return base.sort((a, b) => {
      const ra = resumenPagos(a, allPagos), rb = resumenPagos(b, allPagos);
      const alDiaA = ra.pendientes === 0 && ra.cargados > 0;
      const alDiaB = rb.pendientes === 0 && rb.cargados > 0;
      if (alDiaA && !alDiaB) return -1;
      if (!alDiaA && alDiaB) return 1;
      if (ra.pendientes !== rb.pendientes) return ra.pendientes - rb.pendientes;
      return a._nombre.localeCompare(b._nombre, 'es');
    });
  }, [lista, prog, proy, busqueda, allPagos]);

  const alDia = depsFiltrados.filter(d => {
    const { pendientes, cargados } = resumenPagos(d, allPagos);
    return pendientes === 0 && cargados > 0;
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20 shadow">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <Users className="w-4 h-4 text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base">Pagos por Proyecto</h1>
          <p className="text-white/60 text-[11px]">Estado de pagos por grupo</p>
        </div>
        <div className="text-right leading-tight hidden sm:block">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* Filtros */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-4 sm:px-6 py-3">
        <div className="max-w-2xl mx-auto flex gap-3 flex-wrap">
          <div className="flex flex-col min-w-[160px] flex-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Programa</label>
            <select value={prog} onChange={e => { setProg(e.target.value); setProy(''); setBusqueda(''); }}
              className="text-sm font-black text-[#111827] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#16a34a] cursor-pointer">
              <option value="">— Todos —</option>
              {programas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col min-w-[180px] flex-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Proyecto</label>
            <select value={proy} onChange={e => { setProy(e.target.value); setBusqueda(''); }}
              className="text-sm font-black text-[#111827] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#16a34a] cursor-pointer">
              <option value="">— Selecciona —</option>
              {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {!proy ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3"/>
            <p className="text-gray-400 font-semibold text-sm">Selecciona un proyecto para ver los pagos</p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center">
                <p className="text-2xl font-black text-[#111827]">{depsFiltrados.length}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase">Deportistas</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-[#16a34a]">{alDia}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase">Al día</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-red-600">{depsFiltrados.length - alDia}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase">Pendientes</p>
              </div>
            </div>

            {/* Buscador */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código..."
                className="flex-1 text-sm text-[#111827] focus:outline-none bg-transparent"/>
              {busqueda && <button onClick={() => setBusqueda('')} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>}
            </div>

            {/* Lista */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {depsFiltrados.length === 0 ? (
                <p className="text-center text-gray-400 font-semibold py-10 text-sm">Sin resultados</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {depsFiltrados.map(dep => {
                    const cod      = getCol(dep._columnas, /^c[oó]d/i);
                    const initials = dep._nombre.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
                    const { cargados, pagados, pendientes, mesesPendientes } = resumenPagos(dep, allPagos);
                    const aldiaD = pendientes === 0 && cargados > 0;
                    const pct    = cargados > 0 ? Math.round((pagados / cargados) * 100) : 0;
                    const color  = aldiaD ? G : pendientes > 0 ? '#ef4444' : '#f97316';

                    return (
                      <button key={dep.id}
                        onClick={() => router.push(`/alumnos/${dep.id}/estado-cuenta`)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition text-left">

                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                          style={{ background: color }}>
                          {initials}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-[#111827] text-sm leading-tight truncate">{dep._nombre}</p>
                            {cod && (
                              <span className="text-[10px] font-black text-white px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{ backgroundColor: colorCodigo(getCol(dep._columnas, /^afil/i)) }}>
                                {cod}
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] font-black mt-0.5 truncate" style={{ color: aldiaD ? G : '#ef4444' }}>
                            {aldiaD ? '✓ AL DÍA' : `PENDIENTE: ${mesesPendientes.join(' · ')}`}
                          </p>
                          <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden w-full">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {aldiaD
                            ? <CheckCircle className="w-4 h-4 text-[#16a34a]"/>
                            : <Clock className="w-4 h-4 text-red-400"/>}
                          <ChevronRight className="w-4 h-4 text-gray-300"/>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
