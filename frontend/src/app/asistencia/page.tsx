'use client';

import { Suspense } from 'react';
import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { DEPORTISTAS_KEY } from '@/lib/deportistas';
import type { Deportista } from '@/lib/deportistas';

const ASISTENCIA_KEY = 'futuro_asistencia';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const DIAS_SEMANA  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_INICIAL = ['DOM','LUN','MAR','MIE','JUE','VIE','SAB'];

type Estado = 'A' | 'F' | 'S' | 'ES' | 'FA' | 'NQ' | 'C' | 'CAN' | 'SE' | '';
// [proyecto][año_mes][deportistaId][fecha] = Estado
type AsistenciaData = Record<string, Record<string, Record<string, Record<string, Estado>>>>;

// CAN ya NO está en el ciclo individual — se aplica desde el encabezado del día
const ESTADO_ORDEN: Estado[] = ['', 'A', 'F', 'S', 'ES', 'FA', 'NQ', 'C', 'SE'];
const ESTADO_NEXT: Record<Estado, Estado> = Object.fromEntries(
  ESTADO_ORDEN.map((e, i) => [e, ESTADO_ORDEN[(i + 1) % ESTADO_ORDEN.length]])
) as Record<Estado, Estado>;

const ESTADO_LABEL: Record<string, string> = {
  'A':   'Asistió',
  'F':   'Faltó',
  'S':   'Salud',
  'ES':  'Estudio',
  'FA':  'Familia',
  'NQ':  'No quizo',
  'C':   'Compite',
  'CAN': 'Cancelado',
  'SE':  'Sin Empezar',
  '':    '',
};
const ESTADO_STYLE: Record<string, string> = {
  'A':   'bg-[#16a34a] text-white',   // Verde — Asistió
  'F':   'bg-[#dc2626] text-white',   // Rojo — Faltó
  'S':   'bg-[#0ea5e9] text-white',   // Azul cielo — Salud
  'ES':  'bg-[#8b5cf6] text-white',   // Morado — Estudio
  'FA':  'bg-[#f97316] text-white',   // Naranja — Familia
  'NQ':  'bg-[#6b7280] text-white',   // Gris — No quizo
  'C':   'bg-[#064e1e] text-white',   // Verde oscuro — Compite
  'CAN': 'bg-[#1e293b] text-white',   // Negro — Cancelado
  'SE':  'bg-[#374151] text-white',   // Gris oscuro — Sin Empezar
  '':    'bg-[#f1f5f9] text-[#f1f5f9]',
};

function getCol(dep: Deportista, rx: RegExp) {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

function proyectoDe(dep: Deportista) {
  return getCol(dep, /^proy/i) || '__SIN_PROYECTO__';
}

function semanaNum(fecha: Date) {
  return Math.ceil(fecha.getDate() / 7);
}

function AsistenciaInner() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const fromAtleta    = searchParams.get('proyecto') !== null; // vino desde perfil

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [asistencia,  setAsistencia]  = useState<AsistenciaData>({});
  const [programa,    setPrograma]    = useState(searchParams.get('programa') ?? '');
  const [proyecto,    setProyecto]    = useState(searchParams.get('proyecto') ?? '');
  const [mes,         setMes]         = useState(new Date().getMonth());
  const [anio,        setAnio]        = useState(new Date().getFullYear());
  const [diasSel,     setDiasSel]     = useState<number[]>([3, 5]); // Mié y Vie por defecto

  useEffect(() => {
    try {
      const raw  = localStorage.getItem(DEPORTISTAS_KEY);
      const rawA = localStorage.getItem(ASISTENCIA_KEY);
      if (raw)  setDeportistas(JSON.parse(raw));
      if (rawA) setAsistencia(JSON.parse(rawA));
    } catch {}
  }, []);

  // Lista de programas disponibles
  const programas = useMemo(() => {
    const set = new Set<string>();
    deportistas.forEach(d => {
      const p = getCol(d, /^program/i);
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [deportistas]);

  // Lista de proyectos filtrados por programa
  const proyectos = useMemo(() => {
    const set = new Set<string>();
    deportistas
      .filter(d => !programa || getCol(d, /^program/i) === programa)
      .forEach(d => {
        const p = proyectoDe(d);
        if (p !== '__SIN_PROYECTO__') set.add(p);
      });
    return Array.from(set).sort();
  }, [deportistas, programa]);

  // Resetear proyecto si ya no existe en los proyectos filtrados
  // (solo cuando los deportistas ya cargaron, para no borrar el valor que llegó por URL)
  useEffect(() => {
    if (deportistas.length === 0) return;
    if (proyecto && !proyectos.includes(proyecto)) setProyecto('');
  }, [proyectos, deportistas.length]);

  // Deportistas del proyecto seleccionado
  const atletas = useMemo(() => {
    if (!proyecto) return [];
    return deportistas
      .filter(d => proyectoDe(d) === proyecto)
      .sort((a, b) => a._nombre.localeCompare(b._nombre));
  }, [deportistas, proyecto]);

  // Días de entrenamiento del mes
  const diasDelMes = useMemo(() => {
    const dias: Date[] = [];
    const d = new Date(anio, mes, 1);
    while (d.getMonth() === mes) {
      if (diasSel.includes(d.getDay())) dias.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return dias;
  }, [mes, anio, diasSel]);

  const mesKey = `${anio}_${String(mes + 1).padStart(2, '0')}`;

  function getEstado(depId: string, fecha: Date): Estado {
    const fk = fecha.toISOString().split('T')[0];
    return asistencia[proyecto]?.[mesKey]?.[depId]?.[fk] ?? '';
  }

  function toggleEstado(depId: string, fecha: Date) {
    const fk   = fecha.toISOString().split('T')[0];
    const curr = getEstado(depId, fecha);
    // Si la celda está en CAN (día cancelado), no permitir cambio individual
    if (curr === 'CAN') return;
    const next = ESTADO_NEXT[curr];
    setAsistencia(prev => {
      const prevMes = prev[proyecto]?.[mesKey] ?? {};
      const newMes  = {
        ...prevMes,
        [depId]: { ...(prevMes[depId] ?? {}), [fk]: next },
      };
      const updated: AsistenciaData = {
        ...prev,
        [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes },
      };
      try { localStorage.setItem(ASISTENCIA_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function cancelarDia(fecha: Date) {
    const fk      = fecha.toISOString().split('T')[0];
    const diaStr  = `${DIAS_SEMANA[fecha.getDay()]} ${fecha.getDate()}`;
    // ¿Ya está cancelado? → preguntar si se quiere deshacer
    const yaCancelado = atletas.length > 0 && getEstado(atletas[0].id, fecha) === 'CAN';

    if (yaCancelado) {
      const ok = window.confirm(`¿Deshacer el cancelado del ${diaStr}?\n\nSe borrarán los registros de todos los deportistas en ese día.`);
      if (!ok) return;
      setAsistencia(prev => {
        const prevMes = prev[proyecto]?.[mesKey] ?? {};
        const newMes  = { ...prevMes };
        atletas.forEach(d => { newMes[d.id] = { ...(newMes[d.id] ?? {}), [fk]: '' }; });
        const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
        try { localStorage.setItem(ASISTENCIA_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    } else {
      const ok = window.confirm(`¿CANCELAR el día ${diaStr}?\n\nTodos los deportistas quedarán marcados como Cancelado. ¿Autoriza?`);
      if (!ok) return;
      setAsistencia(prev => {
        const prevMes = prev[proyecto]?.[mesKey] ?? {};
        const newMes  = { ...prevMes };
        atletas.forEach(d => { newMes[d.id] = { ...(newMes[d.id] ?? {}), [fk]: 'CAN' }; });
        const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
        try { localStorage.setItem(ASISTENCIA_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  }

  function totalA(depId: string) {
    return diasDelMes.filter(d => {
      const e = getEstado(depId, d);
      return e === 'A' || e === 'C';
    }).length;
  }

  // Un día es "realizado" si al menos un deportista tiene estado distinto de '', CAN y SE
  function esDiaRealizado(d: Date): boolean {
    return atletas.some(dep => {
      const e = getEstado(dep.id, d);
      return e !== '' && e !== 'CAN' && e !== 'SE';
    });
  }

  const sesionesRealizadas = diasDelMes.filter(esDiaRealizado).length;

  function porcentaje(depId: string): string {
    if (sesionesRealizadas === 0) return '—';
    return Math.round((totalA(depId) / sesionesRealizadas) * 100) + '%';
  }

  function toggleDia(d: number) {
    setDiasSel(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        {/* Patrón de balones */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-asi" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
                <line x1="36" y1="28" x2="36" y2="18" stroke="white" strokeWidth="0.8"/>
                <line x1="43" y1="33" x2="52" y2="30" stroke="white" strokeWidth="0.8"/>
                <line x1="41" y1="42" x2="47" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="31" y1="42" x2="25" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="29" y1="33" x2="20" y2="30" stroke="white" strokeWidth="0.8"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-asi)"/>
          </svg>
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 opacity-[0.09]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="3"/>
            <polygon points="50,24 70,38 62,62 38,62 30,38" fill="none" stroke="white" strokeWidth="3"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative">
          <h1 className="text-white font-black text-lg">Control de Asistencia</h1>
          <p className="text-white/60 text-xs">
            {fromAtleta && proyecto ? `Proyecto: ${proyecto}` : 'Registro mensual por proyecto'}
          </p>
        </div>
        <div className="relative ml-auto flex-shrink-0 flex items-center gap-3">
          <button onClick={() => router.push('/consolidado')}
            className="relative flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Users className="w-3.5 h-3.5" />
            Ver consolidado
          </button>
          <div className="text-right leading-tight">
            <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
            <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      <main className="px-3 py-3 space-y-3">

        {/* Panel de controles — barra compacta horizontal */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-3">
          <div className="flex flex-wrap items-end gap-4">

            {/* Programa */}
            <div className="min-w-[160px]">
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Programa</label>
              <select value={programa} onChange={e => { setPrograma(e.target.value); setProyecto(''); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                <option value="">— Todos —</option>
                {programas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Proyecto */}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Proyecto</label>
              <select value={proyecto} onChange={e => setProyecto(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                disabled={proyectos.length === 0}>
                <option value="">— Selecciona —</option>
                {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Mes */}
            <div className="min-w-[130px]">
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Mes</label>
              <select value={mes} onChange={e => setMes(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>

            {/* Año */}
            <div className="min-w-[90px]">
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Año</label>
              <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Días de entrenamiento */}
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Días de entreno</label>
              <div className="flex gap-1.5">
                {DIAS_SEMANA.map((d, i) => (
                  <button key={i} onClick={() => toggleDia(i)}
                    className={`w-9 h-9 rounded-lg text-[11px] font-black transition ${
                      diasSel.includes(i)
                        ? 'bg-[#16a34a] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Leyenda compacta */}
            <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap ml-auto">
              {[
                { label: 'Asistió',     color: '#16a34a', note: '✓ suma' },
                { label: 'Compite',     color: '#064e1e', note: '✓ suma' },
                { label: 'Faltó',       color: '#dc2626', note: '' },
                { label: 'Salud',       color: '#0ea5e9', note: '' },
                { label: 'Estudio',     color: '#8b5cf6', note: '' },
                { label: 'Familia',     color: '#f97316', note: '' },
                { label: 'No quizo',    color: '#6b7280', note: '' },
                { label: 'Cancelado',   color: '#1e293b', note: '← clic en día' },
                { label: 'Sin Empezar', color: '#374151', note: '' },
              ].map(({ label, color, note }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="rounded px-1.5 py-0.5 text-white font-black text-[9px]" style={{ backgroundColor: color }}>{label}</span>
                  {note && <span className="text-[#16a34a] font-black">{note}</span>}
                </span>
              ))}
            </div>

          </div>
        </div>

        {/* Tabla */}
        {!proyecto ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-14 text-center">
            <Users className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold text-base">Selecciona un proyecto para ver la asistencia</p>
          </div>
        ) : atletas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-14 text-center">
            <p className="text-gray-400 font-semibold text-base">No hay deportistas en este proyecto</p>
          </div>
        ) : (
          <div className="rounded-2xl shadow-sm border border-gray-200">
            <div className="overflow-auto max-h-[calc(100vh-260px)]">
              {(() => {
                // Grupos de semanas
                const grupos: { sem: number; count: number; isos: string[] }[] = [];
                const iniciosSemana = new Set<string>();
                diasDelMes.forEach(d => {
                  const s = semanaNum(d);
                  const iso = d.toISOString();
                  if (!grupos.length || grupos[grupos.length - 1].sem !== s) {
                    grupos.push({ sem: s, count: 1, isos: [iso] });
                    iniciosSemana.add(iso);
                  } else {
                    grupos[grupos.length - 1].count++;
                    grupos[grupos.length - 1].isos.push(iso);
                  }
                });

                // Colores base
                const AZUL = '#4b5563'; // gris medio oscuro → título tabla, semanas, %
                const AZULM= '#4b5563'; // gris → TOTAL data
                const G    = '#16a34a'; // verde → CÓDIGO, AÑO, días, TOTAL
                const GD   = '#16a34a'; // verde → consistencia
                const ROW1 = '#f1f5f9'; // gris claro filas (uniforme, sin alternado)
                const BW   = '2px solid white';

                return (
                  <table className="border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                    <thead className="sticky top-0 z-20">
                      {/* ── Fila 1: Título + Semanas + TOTAL (rowSpan 2) ── */}
                      <tr>
                        <th colSpan={4}
                          style={{ background: AZUL, border: BW }}
                          className="px-5 py-3 text-left text-white font-black text-sm uppercase tracking-wide whitespace-nowrap">
                          ASISTENCIA {MESES[mes].toUpperCase()} {anio} / {proyecto}
                        </th>
                        {grupos.map((g, i) => (
                          <th key={i} colSpan={g.count}
                            style={{ background: AZUL, border: BW }}
                            className="px-0 py-3 text-center text-white font-black text-xs tracking-widest uppercase">
                            SEMANA {g.sem}
                          </th>
                        ))}
                        {/* TOTAL — ocupa las 2 filas */}
                        <th rowSpan={2}
                          style={{ background: G, border: BW }}
                          className="px-4 text-center text-white font-black text-sm uppercase tracking-wider whitespace-nowrap align-middle">
                          TOTAL
                        </th>
                        {/* % — ocupa las 2 filas */}
                        <th rowSpan={2}
                          style={{ background: AZUL, border: BW }}
                          className="px-3 text-center text-white font-black text-sm uppercase tracking-wider whitespace-nowrap align-middle">
                          %
                        </th>
                      </tr>

                      {/* ── Fila 2: Nombres de columnas ── */}
                      <tr>
                        <th style={{ background: G, border: BW, minWidth: 90 }}
                          className="px-3 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap sticky left-0 z-10">
                          ESTADO
                        </th>
                        <th style={{ background: G, border: BW, width: 90, minWidth: 90 }}
                          className="px-3 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                          CÓDIGO
                        </th>
                        <th style={{ background: G, border: BW, minWidth: 200 }}
                          className="px-5 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                          NOMBRE DEL DEPORTISTA
                        </th>
                        <th style={{ background: G, border: BW }}
                          className="px-3 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                          AÑO
                        </th>
                        {diasDelMes.map(d => {
                          const iso = d.toISOString();
                          const fk  = iso.split('T')[0];
                          const cancelado = atletas.length > 0 &&
                            atletas.every(dep => asistencia[proyecto]?.[mesKey]?.[dep.id]?.[fk] === 'CAN');
                          return (
                            <th key={iso}
                              onClick={() => cancelarDia(d)}
                              title={cancelado ? `Clic para deshacer cancelado del ${d.getDate()}` : `Clic para CANCELAR el día ${d.getDate()}`}
                              style={{
                                background:   cancelado ? '#1e293b' : G,
                                borderLeft:   BW,
                                borderRight:  BW,
                                borderBottom: BW,
                                borderTop:    BW,
                                cursor:       'pointer',
                              }}
                              className="py-2 text-center text-white font-black text-xs min-w-[72px] select-none hover:opacity-80 transition-opacity">
                              <span className="block">{DIAS_INICIAL[d.getDay()]}</span>
                              {cancelado
                                ? <span className="block text-[8px] font-black text-red-300 tracking-widest mt-0.5">✕ CAN</span>
                                : <span className="block text-[8px] font-normal text-white/40 tracking-wider mt-0.5">{d.getDate()}</span>
                              }
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {atletas.map((dep, idx) => {
                        const cod    = getCol(dep, /^c[oó]d/i);
                        const año    = getCol(dep, /^a[ñn]o$/i);
                        const estado = getCol(dep, /^estado$/i);
                        const tot    = totalA(dep.id);
                        const rowBg  = '#f1f5f9';
                        const estadoBg =
                          /pausa/i.test(estado)         ? '#e2e8f0' :
                          /sin.*afil|afil.*sin/i.test(estado) ? '#fee2e2' :
                          ROW1;
                        const estadoColor =
                          /pausa/i.test(estado)         ? '#111827' :
                          /sin.*afil|afil.*sin/i.test(estado) ? '#7f1d1d' :
                          '#111827';
                        return (
                          <tr key={dep.id}>
                            {/* ESTADO — sticky */}
                            <td className="px-2 py-2 text-center font-bold text-xs sticky left-0 z-10 whitespace-nowrap"
                              style={{ background: estadoBg, color: estadoColor, border: BW, minWidth: 90 }}>
                              {estado || '—'}
                            </td>
                            {/* CÓDIGO */}
                            <td style={{ background: G, border: BW, width: 90, minWidth: 90 }}
                              className="px-3 py-2 text-center text-white font-black text-sm whitespace-nowrap">
                              {cod || '—'}
                            </td>
                            {/* NOMBRE */}
                            <td style={{ background: ROW1, border: BW, minWidth: 200 }}
                              className="px-5 py-2 text-left text-[#111827] font-semibold text-sm whitespace-nowrap">
                              {dep._nombre}
                            </td>
                            {/* AÑO */}
                            <td style={{ background: rowBg, border: BW }}
                              className="px-3 py-2 text-center text-[#111827] font-bold text-sm whitespace-nowrap">
                              {año}
                            </td>
                            {/* Celdas de días */}
                            {diasDelMes.map(d => {
                              const iso    = d.toISOString();
                              const estado = getEstado(dep.id, d);
                              return (
                                <td key={iso}
                                  style={{
                                    background:   rowBg,
                                    borderLeft:   BW,
                                    borderRight:  BW,
                                    borderBottom: BW,
                                    borderTop:    BW,
                                    padding: '2px',
                                  }}
                                  className="text-center">
                                  <button
                                    onClick={() => toggleEstado(dep.id, d)}
                                    title={ESTADO_LABEL[estado] || 'Sin registro'}
                                    className={`min-w-[68px] h-8 rounded font-black text-[9px] leading-tight px-1 transition active:scale-90 whitespace-nowrap ${ESTADO_STYLE[estado]}`}>
                                    {ESTADO_LABEL[estado]}
                                  </button>
                                </td>
                              );
                            })}
                            {/* TOTAL */}
                            <td style={{ background: G, border: BW }}
                              className="px-3 py-2 text-center text-white font-black text-base whitespace-nowrap">
                              {tot > 0 ? tot : ''}
                            </td>
                            {/* % */}
                            <td style={{ background: AZUL, border: BW }}
                              className="px-3 py-2 text-center text-white font-black text-base whitespace-nowrap">
                              {tot > 0 ? porcentaje(dep.id) : ''}
                            </td>
                          </tr>
                        );
                      })}

                      {/* ── Fila de sesiones realizadas ── */}
                      <tr>
                        <td colSpan={4}
                          style={{ background: G, border: BW }}
                          className="px-5 py-3 text-white font-black text-xs uppercase tracking-widest sticky left-0 z-10 whitespace-nowrap">
                          SESIONES REALIZADAS
                        </td>
                        {diasDelMes.map(d => {
                          const iso       = d.toISOString();
                          const realizado = esDiaRealizado(d);
                          return (
                            <td key={iso}
                              style={{
                                background:  realizado ? '#16a34a' : '#334155',
                                border:      BW,
                              }}
                              className="text-center py-3">
                              <span className="text-white font-black text-xs">
                                {realizado ? '✓' : '✗'}
                              </span>
                            </td>
                          );
                        })}
                        {/* Total sesiones */}
                        <td style={{ background: G, border: BW }}
                          className="px-3 py-3 text-center text-white font-black text-base whitespace-nowrap">
                          {sesionesRealizadas}
                        </td>
                        <td style={{ background: AZUL, border: BW }}
                          className="px-3 py-3 text-center text-white font-bold text-xs whitespace-nowrap">
                          de {diasDelMes.length}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AsistenciaPage() {
  return (
    <Suspense>
      <AsistenciaInner />
    </Suspense>
  );
}
