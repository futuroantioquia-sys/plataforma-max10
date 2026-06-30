'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Search, Upload, FileSpreadsheet,
  ChevronRight, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deportista } from '@/lib/deportistas';
import { DEPORTISTAS_KEY } from '@/lib/deportistas';

const PAGOS_KEY = 'futuro_pagos_estado';

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

export default function PagosPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [allPagos,    setAllPagos]    = useState<AllPagos>({});
  const [busqueda,    setBusqueda]    = useState('');
  const [filtroPrograma, setFiltroPrograma] = useState('');

  useEffect(() => {
    try {
      const raw  = localStorage.getItem(DEPORTISTAS_KEY);
      const rawP = localStorage.getItem(PAGOS_KEY);
      if (raw)  setDeportistas(JSON.parse(raw));
      if (rawP) setAllPagos(JSON.parse(rawP));
    } catch {}
  }, []);

  const programas = useMemo(() =>
    [...new Set(deportistas.map(d => getCol(d, /^program/i)).filter(Boolean))].sort(),
    [deportistas]
  );

  const filtrados = useMemo(() => {
    return deportistas.filter(d => {
      const q = busqueda.toLowerCase();
      const prog = getCol(d, /^program/i);
      if (filtroPrograma && prog !== filtroPrograma) return false;
      if (!q) return true;
      return (
        d._nombre.toLowerCase().includes(q) ||
        codigoDe(d).toLowerCase().includes(q) ||
        prog.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      const ca = codigoDe(a), cb = codigoDe(b);
      return ca.localeCompare(cb, 'es', { numeric: true });
    });
  }, [deportistas, busqueda, filtroPrograma]);

  /* Resumen de pagos por deportista */
  function resumenPago(id: string) {
    const filas: PagoRow[] = allPagos[id] ?? [];
    const pagados   = filas.filter(r => r.estado === 'PAGÓ').length;
    const pendientes = filas.filter(r => r.estado === 'PEND').length;
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
    return { pagados, pendientes, totalPag, totalPend, total: filas.length };
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

        {/* ACCIONES */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => router.push('/pagos/importar-valores')}
            className="bg-[#16a34a] hover:bg-[#064e1e] text-white rounded-2xl p-4 flex items-center gap-3 transition shadow-sm">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-black text-sm">Subir Valores Cargados</p>
              <p className="text-white/60 text-[11px]">Cargar tarifas desde Excel</p>
            </div>
          </button>
          <button onClick={() => router.push('/pagos/importar-pagos')}
            className="bg-[#16a34a] hover:bg-[#15803d] text-white rounded-2xl p-4 flex items-center gap-3 transition shadow-sm">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-black text-sm">Subir Pagos Efectuados</p>
              <p className="text-white/60 text-[11px]">Registrar pagos desde Excel</p>
            </div>
          </button>
        </div>

        {/* TÍTULO SECCIÓN */}
        <div className="flex items-center gap-2 pt-1">
          <DollarSign className="w-5 h-5 text-[#16a34a]" />
          <h2 className="font-black text-[#111827] text-base">Estado de Cuenta por Deportista</h2>
        </div>

        {/* BÚSQUEDA Y FILTRO */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar nombre o código..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] bg-white"
            />
          </div>
          {programas.length > 0 && (
            <select value={filtroPrograma} onChange={e => setFiltroPrograma(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white min-w-[130px]">
              <option value="">Todos los programas</option>
              {programas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <span className="flex items-center text-sm font-bold text-gray-400">
            {filtrados.length} deportistas
          </span>
        </div>

        {/* LISTA DE DEPORTISTAS */}
        {deportistas.length === 0 ? (
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
                  {['CÓDIGO','NOMBRE DEL DEPORTISTA','PROGRAMA','PAGADOS','PENDIENTES','ESTADO'].map((h, i) => (
                    <th key={h} style={{
                      background: '#16a34a', color: 'white',
                      border: '1px solid white',
                      padding: '10px 10px',
                      textAlign: i === 1 ? 'left' : 'center',
                      fontSize: 10, fontWeight: 900,
                      letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                  <th style={{
                    background: G, color: 'white',
                    border: '1px solid white',
                    padding: '10px 10px',
                    textAlign: 'center',
                    fontSize: 10, fontWeight: 900,
                  }}>VER CUENTA</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((dep, idx) => {
                  const bg  = '#f1f5f9';
                  const cod = codigoDe(dep);
                  const prog = getCol(dep, /^program/i);
                  const { pagados, pendientes, totalPag, totalPend, total } = resumenPago(dep.id);
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

                      {/* PAGADOS */}
                      <td style={{
                        background: bg, border: '1px solid white',
                        padding: '6px 10px', textAlign: 'center',
                      }}>
                        {tieneDatos ? (
                          <div>
                            <span className="font-black text-green-600 text-sm">{pagados}</span>
                            {totalPag > 0 && <p className="text-[10px] text-green-500 font-semibold">{fmt(totalPag)}</p>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* PENDIENTES */}
                      <td style={{
                        background: bg, border: '1px solid white',
                        padding: '6px 10px', textAlign: 'center',
                      }}>
                        {tieneDatos ? (
                          <div>
                            <span className={cn('font-black text-sm', pendientes > 0 ? 'text-red-500' : 'text-gray-300')}>
                              {pendientes}
                            </span>
                            {totalPend > 0 && <p className="text-[10px] text-red-400 font-semibold">{fmt(totalPend)}</p>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* ESTADO chip */}
                      <td style={{
                        background: bg, border: '1px solid white',
                        padding: '6px 10px', textAlign: 'center',
                      }}>
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
