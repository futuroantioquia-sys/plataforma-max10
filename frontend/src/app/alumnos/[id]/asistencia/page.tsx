'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Calendar, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deportista } from '@/app/alumnos/importar/page';
import { DEPORTISTAS_KEY } from '@/app/alumnos/importar/page';

const ASISTENCIA_KEY = 'futuro_asistencia';
const FOTOS_KEY      = 'futuro_fotos_deportistas';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const DIAS_INICIAL = ['D','L','M','X','J','V','S'];

type Estado = 'A' | 'F' | 'S' | 'ES' | 'FA' | 'NQ' | 'C' | 'CAN' | 'SE' | '';
type AsistenciaData = Record<string, Record<string, Record<string, Record<string, Estado>>>>;

/* Colores por estado — iguales al módulo de asistencia principal */
const ESTADO_BG: Record<string, string> = {
  'A':   '#16a34a',  // verde      — Asistió
  'C':   '#064e1e',  // verde osc  — Compite
  'F':   '#dc2626',  // rojo       — Faltó
  'S':   '#ea580c',  // naranja    — Salud
  'ES':  '#d97706',  // ámbar      — Estudio
  'FA':  '#7c3aed',  // violeta    — Familia
  'NQ':  '#475569',  // gris osc   — No quizo
  'CAN': '#0a0c14',  // casi negro — Cancelado
  'SE':  '#1e3a8a',  // azul       — Sin Empezar
  '':    'transparent',
};

function estadoColor(e: Estado): string { return ESTADO_BG[e] ?? 'transparent'; }

function estadoTexto(e: Estado): string {
  if (e === 'A')   return 'A';
  if (e === 'C')   return 'C';
  if (e === 'F')   return 'F';
  if (e === 'S')   return 'S';
  if (e === 'ES')  return 'ES';
  if (e === 'FA')  return 'FA';
  if (e === 'NQ')  return 'NQ';
  if (e === 'CAN') return '✕';
  if (e === 'SE')  return 'SE';
  return '';
}

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

function gradientePrograma(val: string) {
  const v = val.toLowerCase();
  if (v.includes('selecc') || v.includes('elite')) return 'from-emerald-700 to-green-600';
  if (v.includes('formac'))                         return 'from-blue-700 to-blue-500';
  if (v.includes('estimul') || v.includes('baby'))  return 'from-[#0f1e4a] to-[#1e3a8a]';
  return 'from-[#064e1e] to-[#22c55e]';
}

export default function AsistenciaAtletaPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  /* ── Todos los hooks PRIMERO, sin returns condicionales entre ellos ── */
  const [dep,        setDep]        = useState<Deportista | null>(null);
  const [foto,       setFoto]       = useState<string | null>(null);
  const [asistencia, setAsistencia] = useState<AsistenciaData>({});
  const [mes,        setMes]        = useState(new Date().getMonth());
  const [anio,       setAnio]       = useState(new Date().getFullYear());
  const [vista,      setVista]      = useState<'mes' | 'consolidado'>('mes');

  useEffect(() => {
    try {
      const lista: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
      const found = lista.find(d => d.id === id);
      if (found) setDep(found);
      const fotos = JSON.parse(localStorage.getItem(FOTOS_KEY) ?? '{}');
      if (fotos[id]) setFoto(fotos[id]);
      const rawA = localStorage.getItem(ASISTENCIA_KEY);
      if (rawA) setAsistencia(JSON.parse(rawA));
    } catch {}
  }, [id]);

  /* Datos derivados del deportista (seguros con dep ?? null) */
  const nombre   = dep?._nombre ?? '';
  const initials = nombre.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const catVal   = dep ? getCol(dep, /^program|^categ/i) : '';
  const proyecto = dep ? (getCol(dep, /^proy/i) || '__SIN_PROYECTO__') : '__SIN_PROYECTO__';
  const gradiente = gradientePrograma(catVal);

  const mesKey = `${anio}_${String(mes+1).padStart(2,'0')}`;

  /* Días del mes actual */
  const diasMes = useMemo(() => {
    const dias: Date[] = [];
    const d = new Date(anio, mes, 1);
    while (d.getMonth() === mes) { dias.push(new Date(d)); d.setDate(d.getDate()+1); }
    return dias;
  }, [mes, anio]);

  /* Estado de un día para este deportista */
  const getEstado = (fecha: Date): Estado => {
    const fk = fecha.toISOString().split('T')[0];
    return asistencia[proyecto]?.[mesKey]?.[id]?.[fk] ?? '';
  };

  /* Resumen del mes */
  const resumenMes = useMemo(() => {
    const asistio = diasMes.filter(d => { const e = asistencia[proyecto]?.[mesKey]?.[id]?.[d.toISOString().split('T')[0]] ?? ''; return e==='A'||e==='C'; }).length;
    const falto   = diasMes.filter(d => { const e = asistencia[proyecto]?.[mesKey]?.[id]?.[d.toISOString().split('T')[0]] ?? ''; return ['F','S','ES','FA','NQ'].includes(e); }).length;
    const total   = asistio + falto;
    const pct     = total > 0 ? Math.round((asistio/total)*100) : null;
    return { asistio, falto, total, pct };
  }, [diasMes, asistencia, proyecto, id, mesKey]);

  /* Consolidado anual mes a mes */
  const consolidado = useMemo(() => {
    return MESES.map((nombreMes, mi) => {
      const mk = `${anio}_${String(mi+1).padStart(2,'0')}`;
      const registros = asistencia[proyecto]?.[mk]?.[id] ?? {};
      const dias = Object.values(registros) as Estado[];
      const asistio = dias.filter(e => e==='A'||e==='C').length;
      const falto   = dias.filter(e => ['F','S','ES','FA','NQ'].includes(e)).length;
      const total   = asistio + falto;
      const pct     = total > 0 ? Math.round((asistio/total)*100) : null;
      return { mes: nombreMes, asistio, falto, total, pct };
    });
  }, [asistencia, proyecto, id, anio]);

  /* ── Loading (DESPUÉS de todos los hooks) ── */
  if (!dep) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 font-semibold">Cargando...</p>
      </div>
    );
  }

  const G    = '#16a34a';   // verde  — encabezado MES + columna mes
  const GRAY = '#4b5563';   // gris   — encabezados datos + totales
  const ROW  = '#f1f5f9';   // gris claro — filas
  const BW   = '1px solid white';

  return (
    <div className="min-h-screen bg-[#f1f5f9]">

      {/* ── HEADER ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-as" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-as)"/>
          </svg>
        </div>
        <button onClick={() => router.back()} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight truncate">{nombre}</h1>
          <p className="text-white/60 text-xs">{catVal}{proyecto !== '__SIN_PROYECTO__' ? ` · ${proyecto}` : ''}</p>
        </div>
        <div className="relative text-right leading-tight flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-4 space-y-4">

        {/* ── TARJETA ATLETA ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#064e1e] via-[#052a10] to-black p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl ring-4 ring-white/25 overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0">
            {foto
              ? <img src={foto} alt="" className="w-full h-full object-cover" />
              : <span className="text-white font-black text-xl">{initials}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-base leading-tight">{nombre}</p>
            {catVal && <span className="inline-block mt-1 bg-white/20 text-white/90 text-xs font-semibold px-2 py-0.5 rounded-full">{catVal}</span>}
            {proyecto !== '__SIN_PROYECTO__' && (
              <p className="text-white/70 text-xs mt-0.5">Proyecto: <strong className="text-white">{proyecto}</strong></p>
            )}
          </div>
          {resumenMes.pct !== null && (
            <div className="flex-shrink-0 text-center bg-white/15 rounded-xl px-3 py-2">
              <p className="text-white font-black text-2xl leading-none">{resumenMes.pct}%</p>
              <p className="text-white/70 text-[10px] font-semibold mt-0.5">ESTE MES</p>
            </div>
          )}
        </div>

        {/* ── TABS ── */}
        <div className="flex bg-white rounded-2xl border border-gray-200 p-1 gap-1 shadow-sm">
          {(['mes','consolidado'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm transition',
                vista === v ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-400 hover:text-[#16a34a]'
              )}>
              {v === 'mes'
                ? <><Calendar className="w-4 h-4" /> Mes actual</>
                : <><BarChart2 className="w-4 h-4" /> Consolidado</>}
            </button>
          ))}
        </div>

        {/* ══════════ VISTA MES ══════════ */}
        {vista === 'mes' && (
          <>
            {/* Navegador */}
            <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm">
              <button onClick={() => { if (mes===0){setMes(11);setAnio(a=>a-1);}else setMes(m=>m-1); }}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition">
                <ChevronLeft className="w-4 h-4 text-gray-600"/>
              </button>
              <div className="text-center">
                <p className="font-black text-[#111827] text-base">{MESES[mes]} {anio}</p>
                {resumenMes.total > 0 && (
                  <p className="text-xs text-gray-400 font-semibold">
                    {resumenMes.asistio} asistencias · {resumenMes.falto} ausencias
                  </p>
                )}
              </div>
              <button onClick={() => { if (mes===11){setMes(0);setAnio(a=>a+1);}else setMes(m=>m+1); }}
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition">
                <ChevronRight className="w-4 h-4 text-gray-600"/>
              </button>
            </div>

            {/* Calendario */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-100">
                {DIAS_INICIAL.map(d => (
                  <div key={d} className="text-center py-2 text-[11px] font-black text-gray-400">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: new Date(anio, mes, 1).getDay() }).map((_,i) => (
                  <div key={`e${i}`} className="aspect-square"/>
                ))}
                {diasMes.map(fecha => {
                  const estado = getEstado(fecha);
                  const esHoy = fecha.toDateString() === new Date().toDateString();
                  const color = estadoColor(estado);
                  const txt   = estadoTexto(estado);
                  return (
                    <div key={fecha.toISOString()} className="aspect-square flex items-center justify-center border border-gray-50 p-0.5">
                      <div className={cn('w-full h-full rounded-lg flex flex-col items-center justify-center gap-0.5', esHoy && !estado ? 'ring-2 ring-[#16a34a]' : '')}
                        style={{ background: estado ? color : 'transparent' }}>
                        <span className={cn('text-xs font-black leading-none', estado ? 'text-white' : esHoy ? 'text-[#16a34a]' : 'text-gray-700')}>
                          {fecha.getDate()}
                        </span>
                        {txt && <span className="text-[8px] font-black text-white/90 leading-none">{txt}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leyenda */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
              <div className="flex flex-wrap gap-x-3 gap-y-2 justify-center">
                {([
                  ['A','Asistió'],['C','Compite'],['F','Faltó'],['S','Salud'],
                  ['ES','Estudio'],['FA','Familia'],['NQ','No quizo'],['CAN','Cancelado'],['SE','Sin empezar'],
                ] as [Estado, string][]).map(([e, label]) => (
                  <span key={e} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                      style={{ background: estadoColor(e) }}>
                      {estadoTexto(e)}
                    </span>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* KPIs */}
            {resumenMes.total > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-green-700 font-black text-2xl">{resumenMes.asistio}</p>
                  <p className="text-green-600 text-[11px] font-semibold">Asistencias</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-red-600 font-black text-2xl">{resumenMes.falto}</p>
                  <p className="text-red-500 text-[11px] font-semibold">Ausencias</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-[#16a34a] font-black text-2xl">{resumenMes.pct ?? 0}%</p>
                  <p className="text-[#16a34a] text-[11px] font-semibold">Asistencia</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2"/>
                <p className="text-gray-400 text-sm font-semibold">Sin registros en {MESES[mes]}</p>
              </div>
            )}
          </>
        )}

        {/* ══════════ CONSOLIDADO ══════════ */}
        {vista === 'consolidado' && (
          <>
            <div className="flex items-center justify-center gap-4 bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm">
              <button onClick={() => setAnio(a=>a-1)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                <ChevronLeft className="w-4 h-4 text-gray-600"/>
              </button>
              <p className="font-black text-[#111827] text-base">{anio}</p>
              <button onClick={() => setAnio(a=>a+1)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                <ChevronRight className="w-4 h-4 text-gray-600"/>
              </button>
            </div>

            {/* Tabla */}
            <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {[
                      { label:'MES',          bg: G    },
                      { label:'ASISTENCIAS',  bg: GRAY },
                      { label:'AUSENCIAS',    bg: GRAY },
                      { label:'% ASISTENCIA', bg: GRAY },
                    ].map(h => (
                      <th key={h.label} style={{ background:h.bg, color:'white', border:BW, padding:'10px 8px', textAlign:'center', fontSize:10, fontWeight:900, letterSpacing:'0.05em' }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consolidado.map((row) => (
                    <tr key={row.mes}>
                      <td style={{ background:G, color:'white', border:BW, padding:'8px 10px', textAlign:'center', fontWeight:900, fontSize:12 }}>
                        {row.mes.substring(0,3).toUpperCase()}
                      </td>
                      <td style={{ background:ROW, border:BW, padding:'8px 10px', textAlign:'center', fontWeight:900, fontSize:13, color:'#111827' }}>
                        {row.total>0 ? row.asistio : '—'}
                      </td>
                      <td style={{ background:ROW, border:BW, padding:'8px 10px', textAlign:'center', fontWeight:900, fontSize:13, color:'#111827' }}>
                        {row.total>0 ? row.falto : '—'}
                      </td>
                      <td style={{ background:ROW, border:BW, padding:'8px 10px', textAlign:'center', fontWeight:900, fontSize:13, color:'#111827' }}>
                        {row.pct!==null ? `${row.pct}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const tA = consolidado.reduce((s,r)=>s+r.asistio,0);
                    const tF = consolidado.reduce((s,r)=>s+r.falto,0);
                    const tT = tA+tF;
                    const tP = tT>0 ? Math.round((tA/tT)*100) : null;
                    return (
                      <tr>
                        <td style={{ background:GRAY, color:'white', border:BW, padding:'9px 10px', textAlign:'center', fontWeight:900, fontSize:12 }}>TOTAL</td>
                        <td style={{ background:GRAY, color:'white', border:BW, padding:'9px 10px', textAlign:'center', fontWeight:900, fontSize:13 }}>{tA}</td>
                        <td style={{ background:GRAY, color:'white', border:BW, padding:'9px 10px', textAlign:'center', fontWeight:900, fontSize:13 }}>{tF}</td>
                        <td style={{ background:GRAY, color:'white', border:BW, padding:'9px 10px', textAlign:'center', fontWeight:900, fontSize:13 }}>{tP!==null?`${tP}%`:'—'}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>

            {/* Barras */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <p className="font-black text-[#111827] text-xs uppercase tracking-widest mb-3">% Asistencia por mes</p>
              <div className="space-y-2">
                {consolidado.filter(r=>r.total>0).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4 font-semibold">Sin registros en {anio}</p>
                ) : (
                  consolidado.filter(r=>r.total>0).map(r => {
                    const pct = r.pct ?? 0;
                    return (
                      <div key={r.mes} className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-gray-500 w-8 flex-shrink-0">{r.mes.substring(0,3)}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                            style={{ width:`${pct}%`, background: pct>=80?G:pct>=60?'#ca8a04':'#dc2626' }}>
                            <span className="text-white text-[9px] font-black">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}
