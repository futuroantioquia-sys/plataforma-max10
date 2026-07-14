'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import type { Deportista } from '@/lib/db';
import { getDeportistas, getPagos } from '@/lib/db';

const PAGOS_KEY = 'futuro_pagos_estado';
const G         = '#16a34a';

const DETALLE_ROWS = [
  'MATRÍCULA','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];
const MES_NUM: Record<string, number> = {
  'MATRÍCULA':0,'FEBRERO':2,'MARZO':3,'ABRIL':4,'MAYO':5,'JUNIO':6,
  'JULIO':7,'AGOSTO':8,'SEPTIEMBRE':9,'OCTUBRE':10,'NOVIEMBRE':11,'DICIEMBRE':12,
};

function esFuturo(d: string) {
  const n = MES_NUM[d];
  return n !== undefined && n !== 0 && n > new Date().getMonth() + 1;
}

function getCol(cols: Record<string, string>, rx: RegExp): string {
  const k = Object.keys(cols).find(k => rx.test(k.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}

function resumenPagos(depId: string, allPagos: Record<string, any[]>) {
  const filas   = allPagos[depId] ?? [];
  const activos = DETALLE_ROWS.filter(d => !esFuturo(d));
  const pagados = activos.filter(d =>
    filas.find((r: any) => r.detalle === d)?.estado === 'PAGÓ'
  ).length;
  return { pagados, total: activos.length };
}

// Orden fijo de programas
const ORDEN_PROG = ['ESTIMULACION','FORMACION','SELECCION','DESARROLLO'];
function normStr(s: string) {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function ordenProg(nombre: string) {
  const n = normStr(nombre);
  const i = ORDEN_PROG.findIndex(o => n.startsWith(o));
  return i === -1 ? 99 : i;
}

export default function PagosProyectoPage() {
  const router = useRouter();

  const [lista,    setLista]    = useState<Deportista[]>([]);
  const [allPagos, setAllPagos] = useState<Record<string, any[]>>({});
  const [prog,     setProg]     = useState('');
  const [proy,     setProy]     = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    getDeportistas().then(deps => { if (deps.length) setLista(deps); }).catch(() => {});
    getPagos().then(pagos => { if (Object.keys(pagos).length) setAllPagos(pagos); }).catch(() => {});

    // Restaurar filtros al volver con el botón atrás
    const savedProg = sessionStorage.getItem('pp_prog') ?? '';
    const savedProy = sessionStorage.getItem('pp_proy') ?? '';
    if (savedProg) setProg(savedProg);
    if (savedProy) setProy(savedProy);
  }, []);

  // Guardar filtros cada vez que cambian
  useEffect(() => { sessionStorage.setItem('pp_prog', prog); }, [prog]);
  useEffect(() => { sessionStorage.setItem('pp_proy', proy); }, [proy]);

  // Programas únicos con orden personalizado
  const programas = useMemo(() =>
    [...new Set(lista.map(d => getCol(d._columnas, /^prog/i)).filter(Boolean))]
      .sort((a, b) => {
        const da = ordenProg(a), db = ordenProg(b);
        return da !== db ? da - db : a.localeCompare(b, 'es');
      }),
  [lista]);

  // Proyectos del programa seleccionado
  const proyectos = useMemo(() =>
    [...new Set(
      lista
        .filter(d => !prog || getCol(d._columnas, /^prog/i) === prog)
        .map(d => getCol(d._columnas, /^proy/i))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es')),
  [lista, prog]);

  // Deportistas del proyecto seleccionado
  const depsFiltrados = useMemo(() => {
    if (!proy) return [];
    return lista
      .filter(d =>
        (!prog || getCol(d._columnas, /^prog/i) === prog) &&
        getCol(d._columnas, /^proy/i) === proy &&
        (!busqueda ||
          d._nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
          getCol(d._columnas, /^c[oó]d/i).toLowerCase().includes(busqueda.toLowerCase()))
      )
      .sort((a, b) => a._nombre.localeCompare(b._nombre, 'es'));
  }, [lista, prog, proy, busqueda]);

  // KPIs
  const alDia = depsFiltrados.filter(d => {
    const r = resumenPagos(d.id, allPagos);
    return r.pagados === r.total && r.total > 0;
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
          <p className="text-white/60 text-[11px]">Estado de cuenta por grupo</p>
        </div>
        <div className="text-right leading-tight hidden sm:block">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* Filtros */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-4 sm:px-6 py-3">
        <div className="max-w-2xl mx-auto flex gap-3 flex-wrap">

          {/* PROGRAMA */}
          <div className="flex flex-col min-w-[160px] flex-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Programa</label>
            <select
              value={prog}
              onChange={e => { setProg(e.target.value); setProy(''); setBusqueda(''); }}
              className="text-sm font-black text-[#111827] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#16a34a] cursor-pointer">
              <option value="">— Todos —</option>
              {programas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* PROYECTO */}
          <div className="flex flex-col min-w-[180px] flex-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Proyecto</label>
            <select
              value={proy}
              onChange={e => { setProy(e.target.value); setBusqueda(''); }}
              className="text-sm font-black text-[#111827] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#16a34a] cursor-pointer">
              <option value="">— Selecciona —</option>
              {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {!proy ? (
          /* Estado vacío */
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
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
              )}
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
                    const { pagados, total } = resumenPagos(dep.id, allPagos);
                    const aldiaD  = pagados === total && total > 0;
                    const pct     = total > 0 ? Math.round((pagados / total) * 100) : 0;
                    const color   = aldiaD ? G : pagados > 0 ? '#f97316' : '#ef4444';

                    return (
                      <button key={dep.id}
                        onClick={() => router.push(`/alumnos/${dep.id}/estado-cuenta`)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition text-left">

                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                          style={{ background: color }}>
                          {initials}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-black text-[#111827] text-sm leading-tight truncate">{dep._nombre}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {cod && <span className="text-[10px] font-black text-[#16a34a] bg-green-50 px-1.5 py-0.5 rounded">{cod}</span>}
                            <span className="text-[10px] text-gray-400 font-semibold">{pagados}/{total} pagos</span>
                          </div>
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
