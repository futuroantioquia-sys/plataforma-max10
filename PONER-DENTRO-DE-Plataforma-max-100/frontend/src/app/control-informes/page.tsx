'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, RefreshCw, Search, X } from 'lucide-react';
import { getDeportistas, getEvaluacionesResumen, getProfes } from '@/lib/db';
import type { Deportista, EvaluacionResumen, Profe } from '@/lib/db';

/* ── Helpers para leer columnas del deportista ── */
function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas ?? {}).find(c => /^c[oó]d/i.test(c.trim()));
  return k ? (dep._columnas[k] ?? '').trim() : '';
}
function programaDe(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => /^program/i.test(c.trim()))
        ?? Object.keys(cols).find(c => /^categ/i.test(c.trim()))
        ?? Object.keys(cols).find(c => /^sub/i.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}
function proyectoDe(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => /^proy/i.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}
/* ESTADO del deportista (Activo / Retirado / Sin afiliación…) */
function estadoDe(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => /^estado/i.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}
/** Solo deportistas ACTIVOS entran a este control. */
const esActivo = (dep: Deportista) => /activ/i.test(estadoDe(dep));

type Fila = {
  id: string; codigo: string; nombre: string; estado: string; programa: string; proyecto: string; profe: string;
  total: number; inf1: string; inf2: string; ultima: string;
};

// Orden "natural" para proyectos (2, 5, 40, SUB 8A…)
const cmpNat = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export default function ControlInformesPage() {
  const router = useRouter();
  const [deps, setDeps]       = useState<Deportista[]>([]);
  const [evals, setEvals]     = useState<EvaluacionResumen[]>([]);
  const [profes, setProfes]   = useState<Profe[]>([]);
  const [cargando, setCargando] = useState(true);
  // Los informes se cargan aparte para no retrasar la aparicion de la tabla
  const [cargandoInf, setCargandoInf] = useState(true);

  // Filtros
  const [fPrograma, setFPrograma] = useState('');
  const [fProfe, setFProfe]       = useState('');
  const [fProyecto, setFProyecto] = useState('');
  const [fEstado, setFEstado]     = useState('');   // '', 'con', 'sin'
  const [q, setQ]                 = useState('');

  /* Carga en DOS tiempos:
       1) deportistas + formadores  -> la tabla aparece de inmediato
       2) resumen de informes       -> las columnas Informe 1 / 2 / # se llenan
     Antes se esperaba a que las tres consultas terminaran (y una de ellas
     traia varios MB), por eso la pantalla se quedaba en blanco tanto rato. */
  function cargar() {
    setCargando(true);
    Promise.all([getDeportistas(), getProfes()])
      .then(([d, p]) => { setDeps(d); setProfes(p); })
      .finally(() => setCargando(false));

    setCargandoInf(true);
    getEvaluacionesResumen()
      .then(setEvals)
      .catch(() => {})
      .finally(() => setCargandoInf(false));
  }
  useEffect(() => { cargar(); }, []);

  /* Al volver desde la ficha del deportista se restauran los filtros que traía la URL. */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setFPrograma(sp.get('programa') || '');
      setFProyecto(sp.get('proyecto') || '');
      setFProfe(sp.get('profe')       || '');
      setFEstado(sp.get('estado')     || '');
      setQ(sp.get('q')                || '');
    } catch { /* noop */ }
  }, []);

  /** Ruta de regreso a ESTA pantalla conservando los filtros activos. */
  function urlRegreso(): string {
    const sp = new URLSearchParams();
    if (fPrograma) sp.set('programa', fPrograma);
    if (fProyecto) sp.set('proyecto', fProyecto);
    if (fProfe)    sp.set('profe',    fProfe);
    if (fEstado)   sp.set('estado',   fEstado);
    if (q.trim())  sp.set('q',        q.trim());
    const s = sp.toString();
    return '/control-informes' + (s ? `?${s}` : '');
  }

  // Proyecto (mayúsculas) → nombre del formador
  const profePorProy = useMemo(() => {
    const map: Record<string, string> = {};
    profes.forEach(p => (p.proyectos ?? []).forEach(proy => {
      const k = (proy ?? '').trim().toUpperCase();
      if (k) map[k] = (p.nombre && p.nombre.trim()) ? p.nombre.trim() : p.usuario;
    }));
    return map;
  }, [profes]);

  // Evaluaciones agrupadas por código
  const evalsPorCod = useMemo(() => {
    const map: Record<string, EvaluacionResumen[]> = {};
    evals.forEach(e => {
      const k = (e.codigo ?? '').trim().toUpperCase();
      if (!k) return;
      (map[k] ||= []).push(e);
    });
    return map;
  }, [evals]);

  // Una fila por deportista — SOLO ACTIVOS
  const filas = useMemo<Fila[]>(() => {
    return deps.filter(esActivo).map(dep => {
      const codigo = codigoDe(dep).toUpperCase();
      const proyecto = proyectoDe(dep);
      const mis = evalsPorCod[codigo] ?? [];
      const buscarInf = (n: string) => mis.find(e => String(e.numeroInforme ?? '').trim() === n);
      const i1 = buscarInf('1');
      const i2 = buscarInf('2');
      const ultima = mis.reduce((acc, e) => (e.fecha && e.fecha > acc ? e.fecha : acc), '');
      return {
        id: dep.id,
        codigo,
        nombre: dep._nombre,
        estado: estadoDe(dep),
        programa: programaDe(dep),
        proyecto,
        profe: profePorProy[proyecto.trim().toUpperCase()] ?? '',
        total: mis.length,
        inf1: i1 ? (i1.fecha || '✓') : '',
        inf2: i2 ? (i2.fecha || '✓') : '',
        ultima,
      };
    });
  }, [deps, evalsPorCod, profePorProy]);

  /* ── Opciones de los filtros: EN CASCADA ──────────────────────────────
     Cada lista se calcula con los OTROS filtros ya aplicados, de modo que
     al elegir un Programa solo aparecen los proyectos y formadores que
     realmente pertenecen a ese programa (y nunca combinaciones vacías).  */
  const uniqSort = (vals: string[], cmp = cmpNat) => Array.from(new Set(vals.filter(Boolean))).sort(cmp);
  const cmpTxt = (a: string, b: string) => a.localeCompare(b, 'es');

  // 1) PROGRAMA: siempre la lista completa
  const programas = useMemo(() => uniqSort(filas.map(f => f.programa)), [filas]);

  // 2) PROYECTO: solo los del programa elegido
  const proyectos = useMemo(
    () => uniqSort(filas
      .filter(f => !fPrograma || f.programa === fPrograma)
      .map(f => f.proyecto)),
    [filas, fPrograma]);

  // 3) FORMADOR: solo los del programa + proyecto elegidos
  const formadores = useMemo(
    () => uniqSort(filas
      .filter(f => !fPrograma || f.programa === fPrograma)
      .filter(f => !fProyecto || f.proyecto === fProyecto)
      .map(f => f.profe), cmpTxt),
    [filas, fPrograma, fProyecto]);

  /* Si al cambiar un filtro superior el de abajo deja de ser válido, se limpia solo
     (así nunca queda una combinación imposible como "Desarrollo + Proyecto 3"). */
  useEffect(() => {
    if (filas.length && fProyecto && !proyectos.includes(fProyecto)) setFProyecto('');
  }, [proyectos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (filas.length && fProfe && !formadores.includes(fProfe)) setFProfe('');
  }, [formadores]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aplicar filtros
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter(f => {
      if (fPrograma && f.programa !== fPrograma) return false;
      if (fProfe && f.profe !== fProfe) return false;
      if (fProyecto && f.proyecto !== fProyecto) return false;
      if (fEstado === 'con' && f.total === 0) return false;
      if (fEstado === 'sin' && f.total > 0) return false;
      if (t && !(f.nombre.toLowerCase().includes(t) || f.codigo.toLowerCase().includes(t))) return false;
      return true;
    }).sort((a, b) => cmpNat(a.proyecto, b.proyecto) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [filas, fPrograma, fProfe, fProyecto, fEstado, q]);

  // Resumen (sobre lo filtrado)
  const totDeport = filtradas.length;
  const conInforme = filtradas.filter(f => f.total > 0).length;
  const sinInforme = totDeport - conInforme;
  const totInformes = filtradas.reduce((a, f) => a + f.total, 0);

  const hayFiltro = !!(fPrograma || fProfe || fProyecto || fEstado || q);
  function limpiar() { setFPrograma(''); setFProfe(''); setFProyecto(''); setFEstado(''); setQ(''); }

  const th: React.CSSProperties = { background: '#6d28d9', color: '#fff', border: '1px solid #fff', padding: '9px 10px', fontSize: 11, fontWeight: 900, letterSpacing: '0.03em', textAlign: 'left', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { border: '1px solid #ede9fe', padding: '7px 10px', fontSize: 13, color: '#111827', whiteSpace: 'nowrap' };
  const selCls = 'w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400';

  function chipInf(val: string) {
    if (val) return <span className="inline-block bg-green-100 text-green-800 border border-green-200 text-[11px] font-black px-2 py-0.5 rounded-md">✓ {val}</span>;
    return <span className="inline-block text-gray-300 text-[13px] font-black">—</span>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#5b21b6] to-[#7c3aed] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => { window.location.href = '/dashboard'; }} title="Volver al menú principal" className="text-white/80 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <ClipboardList className="w-6 h-6 text-white" />
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">Control de Informes</h1>
          <p className="text-white/70 text-xs">Valoraciones de deportistas ACTIVOS · por programa, proyecto y formador</p>
        </div>
        {cargandoInf && <span className="text-white/70 text-[11px] font-bold hidden sm:inline">cargando informes…</span>}
        <button onClick={cargar} title="Actualizar" className="text-white/80 hover:text-white transition"><RefreshCw className={`w-4 h-4 ${cargandoInf ? 'animate-spin' : ''}`} /></button>
      </header>

      <main className="max-w-6xl mx-auto px-3 py-4 space-y-4">
        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Programa</label>
              <select value={fPrograma} onChange={e => setFPrograma(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                {programas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Proyecto</label>
              <select value={fProyecto} onChange={e => setFProyecto(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Formador (profe)</label>
              <select value={fProfe} onChange={e => setFProfe(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                {formadores.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Estado</label>
              <select value={fEstado} onChange={e => setFEstado(e.target.value)} className={selCls}>
                <option value="">Todos</option>
                <option value="con">Con informe</option>
                <option value="sin">Sin informe</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por código o nombre…"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            {hayFiltro && (
              <button onClick={limpiar} className="flex items-center gap-1 text-[12px] font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-3 py-2">
                <X className="w-3.5 h-3.5" /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { n: totDeport,    l: 'Activos',       c: 'text-gray-900' },
            { n: conInforme,   l: 'Con informe',   c: 'text-green-700' },
            { n: sinInforme,   l: 'Sin informe',   c: 'text-red-600' },
            { n: totInformes,  l: 'Total informes', c: 'text-purple-700' },
          ].map(s => (
            <div key={s.l} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
              <p className={`font-black text-2xl leading-none ${s.c}`}>{s.n}</p>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wide mt-1">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {cargando ? (
            <p className="text-center text-gray-400 text-sm py-12">Cargando informes…</p>
          ) : filtradas.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-12">No hay deportistas activos para estos filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Estado</th>
                    <th style={th}>Código</th>
                    <th style={th}>Deportista</th>
                    <th style={th}>Programa</th>
                    <th style={th}>Proyecto</th>
                    <th style={th}>Formador</th>
                    <th style={{ ...th, textAlign: 'center' }}>Informe 1</th>
                    <th style={{ ...th, textAlign: 'center' }}>Informe 2</th>
                    <th style={{ ...th, textAlign: 'center' }}># Total</th>
                    <th style={{ ...th, textAlign: 'center' }}>Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
                    <tr key={f.id} className="hover:bg-purple-50/50">
                      <td style={td}><span className="inline-block bg-green-100 text-green-800 border border-green-200 text-[11px] font-black px-2 py-0.5 rounded-md">{f.estado || 'Activo'}</span></td>
                      <td style={td}><span className="bg-purple-600 text-white text-[11px] font-black px-2 py-0.5 rounded-md">{f.codigo || '—'}</span></td>
                      <td style={{ ...td, whiteSpace: 'normal', minWidth: 180 }}>
                        <button onClick={() => router.push(`/alumnos/${f.id}?volver=${encodeURIComponent(urlRegreso())}`)} className="font-bold text-gray-900 hover:text-purple-700 text-left">{f.nombre}</button>
                      </td>
                      <td style={td}>{f.programa || '—'}</td>
                      <td style={td}>{f.proyecto || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{f.profe || <span className="text-gray-300">sin asignar</span>}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{chipInf(f.inf1)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{chipInf(f.inf2)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span className={`inline-block min-w-[28px] text-[12px] font-black px-2 py-0.5 rounded-md ${f.total > 0 ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-400'}`}>{f.total}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {f.total > 0 ? (
                          <button onClick={() => router.push(`/valoracion-dinamica?cod=${encodeURIComponent(f.codigo)}&volver=${encodeURIComponent(urlRegreso())}`)}
                            className="bg-green-600 hover:bg-green-700 text-white text-[11px] font-black px-2.5 py-1 rounded-lg">📊 Ver</button>
                        ) : <span className="text-gray-300 text-[13px]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="h-6" />
      </main>
    </div>
  );
}
