'use client';

import { Suspense } from 'react';
import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Users, FileDown, Save, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { getDeportistas, getDeportistasPorProyecto, getAsistencia, saveAsistencia } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_INICIAL = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM'];
const JS_DIA_A_ISO = (d: number) => d === 0 ? 7 : d;
const DIAS_ORDEN_JS = [1, 2, 3, 4, 5, 6, 0];

type Estado = 'A' | 'F' | 'S' | 'ES' | 'FA' | 'NQ' | 'C' | 'CAN' | 'SE' | '';
type AsistenciaData = Record<string, Record<string, Record<string, Record<string, Estado>>>>;

const ESTADO_ORDEN: Estado[] = ['', 'A', 'F', 'S', 'ES', 'FA', 'NQ', 'C', 'SE'];
const ESTADO_NEXT: Record<Estado, Estado> = Object.fromEntries(
  ESTADO_ORDEN.map((e, i) => [e, ESTADO_ORDEN[(i + 1) % ESTADO_ORDEN.length]])
) as Record<Estado, Estado>;

const ESTADO_LABEL: Record<string, string> = {
  'A': 'Asistió', 'F': 'Faltó', 'S': 'Salud', 'ES': 'Estudio',
  'FA': 'Familia', 'NQ': 'No quizo', 'C': 'Compite',
  'CAN': 'Cancelado', 'SE': 'Sin Empezar', '': '',
};
const ESTADO_STYLE: Record<string, string> = {
  'A':   'bg-[#16a34a] text-white',
  'F':   'bg-[#dc2626] text-white',
  'S':   'bg-[#0ea5e9] text-white',
  'ES':  'bg-[#8b5cf6] text-white',
  'FA':  'bg-[#f97316] text-white',
  'NQ':  'bg-[#6b7280] text-white',
  'C':   'bg-[#064e1e] text-white',
  'CAN': 'bg-[#1e293b] text-white',
  'SE':  'bg-[#374151] text-white',
  '':    'bg-[#f1f5f9] text-[#f1f5f9]',
};

// Colores tabla
const G    = '#16a34a';
const AZUL = '#4b5563';
const ROW1 = '#f1f5f9';
const BW   = '2px solid white';

function getCol(dep: Deportista, rx: RegExp) {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
function proyectoDe(dep: Deportista) {
  return getCol(dep, /^proy/i) || '__SIN_PROYECTO__';
}
function semanaNum(fecha: Date) {
  const iso = fecha.getDay() === 0 ? 7 : fecha.getDay();
  const lun = new Date(fecha);
  lun.setDate(fecha.getDate() - (iso - 1));
  lun.setHours(0, 0, 0, 0);
  return lun.getTime();
}

// ── Celda memoizada — evita re-render de todo el tbody ──────────
const CeldaEstado = memo(function CeldaEstado({
  estado, onClick,
}: { estado: Estado; onClick: () => void }) {
  return (
    <td style={{ background: ROW1, borderLeft: BW, borderRight: BW, borderBottom: BW, borderTop: BW, padding: '2px' }}
      className="text-center">
      <button
        onClick={onClick}
        title={ESTADO_LABEL[estado] || 'Sin registro'}
        className={`w-[52px] sm:w-[68px] h-9 sm:h-10 rounded font-black text-[8px] sm:text-[9px] leading-tight px-0.5 transition active:scale-90 whitespace-nowrap ${ESTADO_STYLE[estado]}`}>
        {ESTADO_LABEL[estado]}
      </button>
    </td>
  );
});

function AsistenciaInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const fromAtleta   = searchParams.get('proyecto') !== null;

  const [deportistas,  setDeportistas]  = useState<Deportista[]>([]);
  const [asistencia,   setAsistencia]   = useState<AsistenciaData>({});
  const [programa,     setPrograma]     = useState(searchParams.get('programa') ?? '');
  const [proyecto,     setProyecto]     = useState(searchParams.get('proyecto') ?? '');
  const [mes,          setMes]          = useState(new Date().getMonth());
  const [anio,         setAnio]         = useState(new Date().getFullYear());
  const [diasSel,      setDiasSel]      = useState<number[]>([3, 5]);
  const [cargando,     setCargando]     = useState(false); // cambia a false por defecto — profe no carga todo
  const [cargandoProy, setCargandoProy] = useState(false); // carga del proyecto específico
  const [guardando,    setGuardando]    = useState(false);
  const [guardado,     setGuardado]     = useState(false);
  const [controlesAbiertos, setControlesAbiertos] = useState(true);

  const esProfe = useMemo(() => {
    if (typeof document === 'undefined') return false;
    if (document.cookie.split(';').some(c => c.trim() === 'futuro-session=profesor')) return true;
    try {
      const grupos = localStorage.getItem('futuro-profe-proyectos');
      const nombre = localStorage.getItem('futuro-profe-nombre');
      if (grupos && nombre) return true;
    } catch {}
    return false;
  }, []);

  const proyectosProfe = useMemo<string[]>(() => {
    try {
      const raw = localStorage.getItem('futuro-profe-proyectos');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }, []);

  const nombreProfe = useMemo(() => {
    try {
      const raw = localStorage.getItem('futuro-profe-nombre');
      if (raw) return JSON.parse(raw) as string;
    } catch {}
    return 'Profe';
  }, []);

  const [fotoProfe, setFotoProfe] = useState('');
  useEffect(() => {
    if (nombreProfe && nombreProfe !== 'Profe') {
      const f1 = localStorage.getItem(`futuro-foto-profe-${nombreProfe.toUpperCase()}`);
      if (f1) { setFotoProfe(f1); return; }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('futuro-foto-profe-')) {
        const f2 = localStorage.getItem(k);
        if (f2) { setFotoProfe(f2); return; }
      }
    }
    const f3 = localStorage.getItem('futuro-profe-foto');
    if (f3) setFotoProfe(f3);
  }, [nombreProfe]);

  // ── Carga de datos: estrategia diferente según rol ───────────
  useEffect(() => {
    // Siempre cargamos asistencia (es localStorage, rápido)
    getAsistencia().then(data => {
      if (Object.keys(data).length) setAsistencia(data as any);
    });

    if (esProfe) {
      // Profe: NO cargamos todos. Si hay proyecto en URL, cargamos solo ese.
      const proyUrl = searchParams.get('proyecto');
      if (proyUrl) {
        setCargandoProy(true);
        getDeportistasPorProyecto(proyUrl).then(({ data }) => {
          setCargandoProy(false);
          if (data.length) setDeportistas(data);
        });
      }
      // Sin proyecto en URL → redirigir a mis-proyectos
      else {
        router.replace('/mis-proyectos');
      }
    } else {
      // Admin: carga todos (con caché en memoria)
      setCargando(true);
      getDeportistas().then(lista => {
        setCargando(false);
        if (lista.length) setDeportistas(lista);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando profe cambia de proyecto manualmente → carga los atletas del nuevo proyecto
  const proyectoAnterior = useMemo(() => proyecto, []);
  useEffect(() => {
    if (!esProfe || !proyecto || proyecto === searchParams.get('proyecto')) return;
    setCargandoProy(true);
    setDeportistas([]);
    getDeportistasPorProyecto(proyecto).then(({ data }) => {
      setCargandoProy(false);
      if (data.length) setDeportistas(data);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto, esProfe]);

  // Programas y proyectos para el admin (no se usa para profe)
  const programas = useMemo(() => {
    if (esProfe) return [];
    const set = new Set<string>();
    deportistas.forEach(d => {
      const p = getCol(d, /^program/i);
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [deportistas, esProfe]);

  const proyectos = useMemo(() => {
    if (esProfe) return proyectosProfe;
    const set = new Set<string>();
    deportistas
      .filter(d => !programa || getCol(d, /^program/i) === programa)
      .forEach(d => {
        const p = proyectoDe(d);
        if (p !== '__SIN_PROYECTO__') set.add(p);
      });
    return Array.from(set).sort();
  }, [deportistas, programa, esProfe, proyectosProfe]);

  useEffect(() => {
    if (esProfe || deportistas.length === 0) return;
    if (proyecto && !proyectos.includes(proyecto)) setProyecto('');
  }, [proyectos, deportistas.length, esProfe]);

  const atletas = useMemo(() => {
    if (!proyecto) return [];
    if (esProfe) {
      // Para profe los deportistas ya vienen filtrados del API
      return [...deportistas].sort((a, b) => a._nombre.localeCompare(b._nombre));
    }
    return deportistas
      .filter(d => proyectoDe(d) === proyecto)
      .sort((a, b) => a._nombre.localeCompare(b._nombre));
  }, [deportistas, proyecto, esProfe]);

  const diasDelMes = useMemo(() => {
    const dias: Date[] = [];
    const d = new Date(anio, mes, 1);
    while (d.getMonth() === mes) {
      if (diasSel.includes(d.getDay())) dias.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return dias.sort((a, b) => {
      const isoA = JS_DIA_A_ISO(a.getDay());
      const isoB = JS_DIA_A_ISO(b.getDay());
      const lunA = new Date(a); lunA.setDate(a.getDate() - (isoA - 1));
      const lunB = new Date(b); lunB.setDate(b.getDate() - (isoB - 1));
      const diff = lunA.getTime() - lunB.getTime();
      return diff !== 0 ? diff : isoA - isoB;
    });
  }, [mes, anio, diasSel]);

  const mesKey = `${anio}_${String(mes + 1).padStart(2, '0')}`;

  // ── Memoizar estado por celda ────────────────────────────────
  const estadoMap = useMemo(() => {
    const m: Record<string, Record<string, Estado>> = {};
    atletas.forEach(dep => {
      m[dep.id] = {};
      diasDelMes.forEach(d => {
        const fk = d.toISOString().split('T')[0];
        m[dep.id][fk] = asistencia[proyecto]?.[mesKey]?.[dep.id]?.[fk] ?? '';
      });
    });
    return m;
  }, [atletas, diasDelMes, asistencia, proyecto, mesKey]);

  // ── Memoizar totales ─────────────────────────────────────────
  const totalesMap = useMemo(() => {
    const m: Record<string, number> = {};
    atletas.forEach(dep => {
      m[dep.id] = diasDelMes.filter(d => {
        const e = estadoMap[dep.id]?.[d.toISOString().split('T')[0]] ?? '';
        return e === 'A' || e === 'C';
      }).length;
    });
    return m;
  }, [atletas, diasDelMes, estadoMap]);

  const sesionesRealizadas = useMemo(() => {
    return diasDelMes.filter(d => {
      const fk = d.toISOString().split('T')[0];
      return atletas.some(dep => {
        const e = estadoMap[dep.id]?.[fk] ?? '';
        return e !== '' && e !== 'CAN' && e !== 'SE';
      });
    }).length;
  }, [atletas, diasDelMes, estadoMap]);

  function getEstado(depId: string, fk: string): Estado {
    return estadoMap[depId]?.[fk] ?? '';
  }

  const toggleEstado = useCallback((depId: string, fecha: Date) => {
    const fk   = fecha.toISOString().split('T')[0];
    const curr = estadoMap[depId]?.[fk] ?? '';
    if (curr === 'CAN') return;
    const next = ESTADO_NEXT[curr];
    setAsistencia(prev => {
      const prevMes = prev[proyecto]?.[mesKey] ?? {};
      const newMes  = { ...prevMes, [depId]: { ...(prevMes[depId] ?? {}), [fk]: next } };
      const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
      saveAsistencia(updated);
      return updated;
    });
  }, [estadoMap, proyecto, mesKey]);

  function cancelarDia(fecha: Date) {
    const fk      = fecha.toISOString().split('T')[0];
    const diaStr  = `${DIAS_SEMANA[JS_DIA_A_ISO(fecha.getDay()) - 1]} ${fecha.getDate()}`;
    const yaCancelado = atletas.length > 0 && getEstado(atletas[0].id, fk) === 'CAN';
    if (yaCancelado) {
      if (!window.confirm(`¿Deshacer el cancelado del ${diaStr}?`)) return;
      setAsistencia(prev => {
        const prevMes = prev[proyecto]?.[mesKey] ?? {};
        const newMes  = { ...prevMes };
        atletas.forEach(d => { newMes[d.id] = { ...(newMes[d.id] ?? {}), [fk]: '' }; });
        const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
        saveAsistencia(updated);
        return updated;
      });
    } else {
      if (!window.confirm(`¿CANCELAR el día ${diaStr}?`)) return;
      setAsistencia(prev => {
        const prevMes = prev[proyecto]?.[mesKey] ?? {};
        const newMes  = { ...prevMes };
        atletas.forEach(d => { newMes[d.id] = { ...(newMes[d.id] ?? {}), [fk]: 'CAN' }; });
        const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
        saveAsistencia(updated);
        return updated;
      });
    }
  }

  function porcentaje(depId: string): string {
    if (sesionesRealizadas === 0) return '—';
    return Math.round((totalesMap[depId] / sesionesRealizadas) * 100) + '%';
  }

  function toggleDia(d: number) {
    setDiasSel(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }

  async function guardarAsistencia() {
    if (guardando) return;
    setGuardando(true);
    setGuardado(false);
    try {
      await saveAsistencia(asistencia);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    } finally {
      setGuardando(false);
    }
  }

  function descargarExcel() {
    if (!proyecto || atletas.length === 0 || diasDelMes.length === 0) return;
    const sep = ';';
    const e   = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const grupos: { semLabel: number; isos: string[] }[] = [];
    let semLabel = 0;
    diasDelMes.forEach(d => {
      const s = semanaNum(d); const iso = d.toISOString();
      if (!grupos.length || semanaNum(new Date(grupos[grupos.length - 1].isos[0])) !== s) {
        semLabel++; grupos.push({ semLabel, isos: [iso] });
      } else { grupos[grupos.length - 1].isos.push(iso); }
    });
    const fila1 = [e(`ASISTENCIA ${MESES[mes].toUpperCase()} ${anio} / ${proyecto}`), ...Array(3 + diasDelMes.length + 1).fill(e(''))].join(sep);
    const semCeldas = grupos.flatMap(g => [e(`SEMANA ${g.semLabel}`), ...Array(g.isos.length - 1).fill(e(''))]);
    const fila2 = [e(''), e(''), e(''), e(''), ...semCeldas, e('TOTAL'), e('%')].join(sep);
    const colDias = diasDelMes.map(d => { const iso = JS_DIA_A_ISO(d.getDay()); return e(`${DIAS_INICIAL[iso - 1]} ${d.getDate()}`); });
    const fila3 = [e('ESTADO'), e('CÓDIGO'), e('NOMBRE DEL DEPORTISTA'), e('AÑO'), ...colDias, e('TOTAL'), e('%')].join(sep);
    const filasData = atletas.map(dep => {
      const estado = getCol(dep, /^estado$/i); const cod = getCol(dep, /^c[oó]d/i); const año = getCol(dep, /^a[ñn]o$/i);
      const tot = totalesMap[dep.id];
      const celdas = diasDelMes.map(d => { const fk = d.toISOString().split('T')[0]; return e(ESTADO_LABEL[estadoMap[dep.id]?.[fk] ?? ''] || ''); });
      return [e(estado || ''), e(cod || ''), e(dep._nombre), e(año || ''), ...celdas, e(tot > 0 ? tot : ''), e(tot > 0 ? porcentaje(dep.id) : '')].join(sep);
    });
    const filaFinal = [e('SESIONES REALIZADAS'), e(''), e(''), e(''),
      ...diasDelMes.map(d => { const fk = d.toISOString().split('T')[0]; const r = atletas.some(dep => { const est = estadoMap[dep.id]?.[fk] ?? ''; return est !== '' && est !== 'CAN' && est !== 'SE'; }); return e(r ? '✓' : ''); }),
      e(sesionesRealizadas), e(''),
    ].join(sep);
    const contenido = [fila1, fila2, fila3, ...filasData, filaFinal].join('\r\n');
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Asistencia_${proyecto}_${MESES[mes]}_${anio}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Grupos de semanas para la cabecera
  const gruposSemana = useMemo(() => {
    const grupos: { sem: number; semLabel: number; count: number; isos: string[] }[] = [];
    let semLabel = 0;
    diasDelMes.forEach(d => {
      const s = semanaNum(d); const iso = d.toISOString();
      if (!grupos.length || grupos[grupos.length - 1].sem !== s) {
        semLabel++; grupos.push({ sem: s, semLabel, count: 1, isos: [iso] });
      } else { grupos[grupos.length - 1].count++; grupos[grupos.length - 1].isos.push(iso); }
    });
    return grupos;
  }, [diasDelMes]);

  const estaCargando = cargando || cargandoProy;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Control de Asistencia</h1>
          {proyecto && <p className="text-white/60 text-xs truncate">{proyecto}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {proyecto && atletas.length > 0 && (
            <>
              <button onClick={guardarAsistencia} disabled={guardando}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition border ${guardado ? 'bg-white text-[#16a34a] border-white' : 'bg-[#16a34a] hover:bg-[#15803d] text-white border-white/30'}`}>
                {guardado ? <><CheckCircle2 className="w-3.5 h-3.5" />¡Listo!</>
                  : guardando ? <><Save className="w-3.5 h-3.5 animate-pulse" />…</>
                  : <><Save className="w-3.5 h-3.5" />Guardar</>}
              </button>
              <button onClick={descargarExcel}
                className="hidden sm:flex items-center gap-1 bg-white/20 hover:bg-white/35 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition border border-white/30">
                <FileDown className="w-3.5 h-3.5" />CSV
              </button>
            </>
          )}
          <div className="hidden sm:block text-right leading-tight">
            <p className="text-white font-black text-xs tracking-widest">MAX 10 SPORT</p>
          </div>
        </div>
      </header>

      <main className="px-2 sm:px-3 py-2 sm:py-3 space-y-2 sm:space-y-3">

        {/* ── Bienvenida profe ───────────────────────────────── */}
        {esProfe && !proyecto && !estaCargando && (
          <div className="min-h-[80vh] flex flex-col items-center justify-center py-6 px-4">
            {/* Tarjeta compacta */}
            <div className="w-full max-w-xs mb-6">
              <div className="bg-gradient-to-br from-[#064e1e] to-[#16a34a] rounded-2xl p-6 flex flex-col items-center text-center shadow-xl">
                {fotoProfe ? (
                  <img src={fotoProfe} alt={nombreProfe}
                    className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg mb-3" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/60 flex items-center justify-center shadow-lg mb-3">
                    <span className="text-3xl font-black text-white">{nombreProfe.charAt(0)}</span>
                  </div>
                )}
                <p className="text-white/70 text-xs font-semibold tracking-widest uppercase">¡Hola,</p>
                <h2 className="text-xl font-black text-white">{nombreProfe}!</h2>
                <p className="text-white/50 text-[11px] mt-1">
                  {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
            <p className="text-gray-500 text-sm mb-5 text-center font-medium">
              {proyectosProfe.length > 0 ? 'Selecciona el proyecto:' : 'Sin proyectos asignados. Contacta al admin.'}
            </p>
            {proyectosProfe.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm">
                {proyectosProfe.map(proy => (
                  <button key={proy} onClick={() => setProyecto(proy)}
                    className="bg-white border-2 border-gray-200 hover:border-[#16a34a] rounded-2xl p-4 text-center shadow-sm hover:shadow-md transition-all active:scale-95">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#064e1e] to-[#22c55e] rounded-xl flex items-center justify-center mx-auto mb-2">
                      <svg className="w-6 h-6" viewBox="0 0 100 100" fill="none">
                        <circle cx="50" cy="50" r="40" stroke="white" strokeWidth="4"/>
                        <polygon points="50,30 64,40 59,56 41,56 36,40" fill="white"/>
                      </svg>
                    </div>
                    <p className="font-black text-[#064e1e] text-base leading-tight">{proy}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Pasar asistencia →</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Controles — colapsables en móvil ───────────────── */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-xl">
          {/* Cabecera del panel (siempre visible) */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 sm:hidden"
            onClick={() => setControlesAbiertos(v => !v)}>
            <span className="text-sm font-black text-gray-600">
              {proyecto ? `📋 ${proyecto} · ${MESES[mes]} ${anio}` : '⚙️ Configurar asistencia'}
            </span>
            {controlesAbiertos ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {/* Controles expandibles */}
          <div className={`${controlesAbiertos ? 'block' : 'hidden'} sm:block px-3 sm:px-4 pb-3 pt-0 sm:pt-3`}>
            <div className="flex flex-wrap items-end gap-3">

              {/* Programa — solo admin */}
              {!esProfe && (
                <div className="min-w-[140px]">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Programa</label>
                  <select value={programa} onChange={e => { setPrograma(e.target.value); setProyecto(''); }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    <option value="">— Todos —</option>
                    {programas.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {/* Proyecto */}
              {!esProfe && (
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Proyecto</label>
                  <select value={proyecto} onChange={e => setProyecto(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    disabled={proyectos.length === 0}>
                    <option value="">— Selecciona —</option>
                    {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {/* Mes + Año en fila */}
              <div className="flex gap-2">
                <div className="min-w-[110px]">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mes</label>
                  <select value={mes} onChange={e => setMes(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div className="min-w-[80px]">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Año</label>
                  <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Días */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Días de entreno</label>
                <div className="flex gap-1">
                  {DIAS_ORDEN_JS.map((jsDay, i) => (
                    <button key={jsDay} onClick={() => toggleDia(jsDay)}
                      className={`w-9 h-9 rounded-lg text-[10px] font-black transition ${
                        diasSel.includes(jsDay) ? 'bg-[#16a34a] text-white shadow-sm' : 'bg-gray-100 text-gray-500'
                      }`}>
                      {DIAS_SEMANA[i].slice(0, 2)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Leyenda compacta — colapsada en mobile */}
              <details className="w-full sm:w-auto">
                <summary className="text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer select-none">Leyenda ▼</summary>
                <div className="flex items-center gap-1.5 text-[9px] font-bold flex-wrap mt-2">
                  {[
                    { label: 'Asistió',  color: '#16a34a' }, { label: 'Compite',    color: '#064e1e' },
                    { label: 'Faltó',    color: '#dc2626' }, { label: 'Salud',      color: '#0ea5e9' },
                    { label: 'Estudio',  color: '#8b5cf6' }, { label: 'Familia',    color: '#f97316' },
                    { label: 'No quizo', color: '#6b7280' }, { label: 'Cancelado',  color: '#1e293b' },
                    { label: 'Sin Emp.', color: '#374151' },
                  ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-0.5">
                      <span className="rounded px-1 py-0.5 text-white font-black text-[8px]" style={{ backgroundColor: color }}>{label}</span>
                    </span>
                  ))}
                </div>
              </details>

            </div>
          </div>
        </div>

        {/* Tabla */}
        {estaCargando ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <BalonCargando />
          </div>
        ) : !proyecto ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">Selecciona un proyecto</p>
          </div>
        ) : atletas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-400 font-semibold">No hay deportistas en este proyecto</p>
          </div>
        ) : (
          <div className="rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
              <table className="border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                <thead className="sticky top-0 z-20">
                  {/* Fila 1: Título + Semanas */}
                  <tr>
                    <th colSpan={4} style={{ background: AZUL, border: BW }}
                      className="px-3 sm:px-5 py-2.5 text-left text-white font-black text-xs sm:text-sm uppercase tracking-wide whitespace-nowrap">
                      ASISTENCIA {MESES[mes].toUpperCase()} {anio} / {proyecto}
                    </th>
                    {gruposSemana.map((g, i) => (
                      <th key={i} colSpan={g.count} style={{ background: AZUL, border: BW }}
                        className="px-0 py-2.5 text-center text-white font-black text-[10px] sm:text-xs tracking-widest uppercase">
                        SEM {g.semLabel}
                      </th>
                    ))}
                    <th rowSpan={2} style={{ background: G, border: BW }}
                      className="px-2 sm:px-4 text-center text-white font-black text-xs sm:text-sm uppercase whitespace-nowrap align-middle">
                      TOT
                    </th>
                    <th rowSpan={2} style={{ background: AZUL, border: BW }}
                      className="px-2 sm:px-3 text-center text-white font-black text-xs sm:text-sm uppercase whitespace-nowrap align-middle">
                      %
                    </th>
                  </tr>
                  {/* Fila 2: Columnas */}
                  <tr>
                    <th style={{ background: G, border: BW, minWidth: 70 }}
                      className="px-2 py-2 text-center text-white font-black text-[10px] uppercase whitespace-nowrap sticky left-0 z-10">
                      EST
                    </th>
                    <th style={{ background: G, border: BW, width: 70, minWidth: 70 }}
                      className="px-2 py-2 text-center text-white font-black text-[10px] uppercase whitespace-nowrap">
                      CÓD
                    </th>
                    <th style={{ background: G, border: BW, minWidth: 160 }}
                      className="px-3 sm:px-5 py-2 text-left text-white font-black text-[10px] uppercase whitespace-nowrap">
                      NOMBRE
                    </th>
                    <th style={{ background: G, border: BW }}
                      className="px-2 py-2 text-center text-white font-black text-[10px] uppercase whitespace-nowrap">
                      AÑO
                    </th>
                    {diasDelMes.map(d => {
                      const fk = d.toISOString().split('T')[0];
                      const cancelado = atletas.length > 0 && atletas.every(dep => estadoMap[dep.id]?.[fk] === 'CAN');
                      return (
                        <th key={fk} onClick={() => cancelarDia(d)}
                          title={cancelado ? `Deshacer cancelado ${d.getDate()}` : `Cancelar día ${d.getDate()}`}
                          style={{ background: cancelado ? '#1e293b' : G, borderLeft: BW, borderRight: BW, borderBottom: BW, borderTop: BW, cursor: 'pointer' }}
                          className="py-2 text-center text-white font-black text-[10px] min-w-[52px] sm:min-w-[68px] select-none hover:opacity-80 transition-opacity">
                          <span className="block text-[10px]">{DIAS_INICIAL[JS_DIA_A_ISO(d.getDay()) - 1]}</span>
                          {cancelado
                            ? <span className="block text-[7px] font-black text-red-300 mt-0.5">✕CAN</span>
                            : <span className="block text-sm sm:text-lg font-black text-white leading-tight mt-0.5">{d.getDate()}</span>
                          }
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {atletas.map(dep => {
                    const cod    = getCol(dep, /^c[oó]d/i);
                    const año    = getCol(dep, /^a[ñn]o$/i);
                    const estado = getCol(dep, /^estado$/i);
                    const tot    = totalesMap[dep.id];
                    const estadoBg =
                      /pausa/i.test(estado) ? '#e2e8f0' :
                      /sin.*afil|afil.*sin/i.test(estado) ? '#fee2e2' : ROW1;
                    const estadoColor = /sin.*afil|afil.*sin/i.test(estado) ? '#7f1d1d' : '#111827';
                    return (
                      <tr key={dep.id}>
                        <td className="px-1 sm:px-2 py-1.5 text-center font-bold text-[10px] sticky left-0 z-10 whitespace-nowrap"
                          style={{ background: estadoBg, color: estadoColor, border: BW, minWidth: 70 }}>
                          {estado || '—'}
                        </td>
                        <td style={{ background: G, border: BW, width: 70, minWidth: 70 }}
                          className="px-2 py-1.5 text-center text-white font-black text-xs whitespace-nowrap">
                          {cod || '—'}
                        </td>
                        <td style={{ background: ROW1, border: BW, minWidth: 160 }}
                          className="px-3 sm:px-5 py-1.5 text-left text-[#111827] font-semibold text-xs sm:text-sm whitespace-nowrap">
                          {dep._nombre}
                        </td>
                        <td style={{ background: ROW1, border: BW }}
                          className="px-2 py-1.5 text-center text-[#111827] font-bold text-xs whitespace-nowrap">
                          {año}
                        </td>
                        {diasDelMes.map(d => {
                          const fk = d.toISOString().split('T')[0];
                          return (
                            <CeldaEstado
                              key={fk}
                              estado={estadoMap[dep.id]?.[fk] ?? ''}
                              onClick={() => toggleEstado(dep.id, d)}
                            />
                          );
                        })}
                        <td style={{ background: G, border: BW }}
                          className="px-2 sm:px-3 py-1.5 text-center text-white font-black text-sm whitespace-nowrap">
                          {tot > 0 ? tot : ''}
                        </td>
                        <td style={{ background: AZUL, border: BW }}
                          className="px-2 sm:px-3 py-1.5 text-center text-white font-black text-sm whitespace-nowrap">
                          {tot > 0 ? porcentaje(dep.id) : ''}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Sesiones realizadas */}
                  <tr>
                    <td colSpan={4} style={{ background: G, border: BW }}
                      className="px-3 sm:px-5 py-2.5 text-white font-black text-[10px] uppercase tracking-widest sticky left-0 z-10 whitespace-nowrap">
                      SES. REALIZADAS
                    </td>
                    {diasDelMes.map(d => {
                      const fk = d.toISOString().split('T')[0];
                      const realizado = atletas.some(dep => {
                        const e = estadoMap[dep.id]?.[fk] ?? '';
                        return e !== '' && e !== 'CAN' && e !== 'SE';
                      });
                      return (
                        <td key={fk} style={{ background: realizado ? '#16a34a' : '#334155', border: BW }}
                          className="text-center py-2.5">
                          <span className="text-white font-black text-xs">{realizado ? '✓' : '✗'}</span>
                        </td>
                      );
                    })}
                    <td style={{ background: G, border: BW }}
                      className="px-2 sm:px-3 py-2.5 text-center text-white font-black text-sm whitespace-nowrap">
                      {sesionesRealizadas}
                    </td>
                    <td style={{ background: AZUL, border: BW }}
                      className="px-2 sm:px-3 py-2.5 text-center text-white font-bold text-[10px] whitespace-nowrap">
                      de {diasDelMes.length}
                    </td>
                  </tr>
                </tbody>
              </table>
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
