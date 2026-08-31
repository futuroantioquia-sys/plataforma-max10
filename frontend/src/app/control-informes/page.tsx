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
      /* SOLO EL NOMBRE DE USUARIO (dirección, 29/08/2026): "CASTRO", no
         "ALEJANDRO CASTRO ESTRADA". Es como se le dice al profe en toda la
         plataforma y así la columna no engorda la fila. */
      if (k) map[k] = String(p.usuario ?? '').trim().toUpperCase();
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
      /* ── QUÉ INFORME ES CADA UNO ────────────────────────────────────────
         Antes esto solo miraba el campo "numeroInforme". Problema: muchas
         evaluaciones viejas se guardaron SIN ese número (quedó vacío), y otras
         quedaron numeradas mal. Esas no aparecían en ninguna de las dos
         columnas, y el profe que acababa de guardar su informe veía la casilla
         vacía y creía que no se había guardado.

         Ahora: las que traen número bueno (1 a 4) se respetan tal cual; las que
         no lo traen se acomodan por FECHA en los puestos que queden libres. Así
         ninguna evaluación guardada se pierde de vista. — 25/08/2026 */
      const esNum = (e: any) => ['1', '2', '3', '4'].includes(String(e?.numeroInforme ?? '').trim());
      const porPuesto: Record<string, any> = {};
      mis.filter(esNum).forEach(e => {
        const n = String(e.numeroInforme).trim();
        if (!porPuesto[n]) porPuesto[n] = e;          // si hay dos con el mismo, manda el primero
      });
      const sueltas = mis
        .filter(e => !esNum(e) || porPuesto[String(e.numeroInforme).trim()] !== e)
        .sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')));
      for (const e of sueltas) {
        const libre = ['1', '2', '3', '4'].find(n => !porPuesto[n]);
        if (!libre) break;
        porPuesto[libre] = e;
      }
      const i1 = porPuesto['1'];
      const i2 = porPuesto['2'];
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const totInformes = filtradas.reduce((a, f) => a + f.total, 0);   // por si vuelve
  /* CUÁNTOS TIENEN EL PRIMERO Y CUÁNTOS EL SEGUNDO (dirección, 29/08/2026):
     el total solo no decía en cuál de los dos informes va el atraso. */
  const conInf1 = filtradas.filter(f => !!f.inf1).length;
  const conInf2 = filtradas.filter(f => !!f.inf2).length;

  const hayFiltro = !!(fPrograma || fProfe || fProyecto || fEstado || q);
  function limpiar() { setFPrograma(''); setFProfe(''); setFProyecto(''); setFEstado(''); setQ(''); }

  /* DISEÑO DE LA CASA (dirección, 29/08/2026): gris y verde, como todos los
     demás módulos. Antes esta pantalla era morada y desentonaba. */
  const th: React.CSSProperties = { background: '#00B050', color: '#fff', border: '1px solid #fff', padding: '9px 10px', fontSize: 11, fontWeight: 900, letterSpacing: '0.03em', textAlign: 'left', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { background: '#2B3547', border: '1px solid #ffffff', padding: '7px 10px', fontSize: 13, color: '#ffffff', fontWeight: 700, whiteSpace: 'nowrap' };
  /** EL BOTÓN DE FILTRO ESTÁNDAR DE LA APP: transparente con borde blanco,
   *  y NARANJA cuando está filtrando. — dirección, 29/08/2026 */
  const botonFiltro = (encendido: boolean): React.CSSProperties => ({
    background: encendido ? '#E0A33A' : 'transparent',
    border: `1px solid ${encendido ? '#E0A33A' : 'rgba(255,255,255,.6)'}`,
    color: '#ffffff',
    height: 32,
  });
  const opcion: React.CSSProperties = { color: '#111827', backgroundColor: 'white' };

  const selCls = 'w-full text-sm border border-[#4A5568] rounded-xl px-3 py-2 bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-[#00B050]';

  function chipInf(val: string) {
    if (val) return <span className="inline-block text-[#5BE39B] border border-[rgba(0,176,80,.45)] text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(0,176,80,.18)' }}>✓ {val}</span>;
    return <span className="inline-block text-white/40 text-[13px] font-black">—</span>;
  }

  return (
    <div className="min-h-screen bg-[#333F50]">
      <header className="px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20"
        style={{ background: 'linear-gradient(to right, #333F50, #0EA142)' }}>
        <button onClick={() => { window.location.href = '/dashboard'; }} title="Volver al menú principal" className="text-white/80 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <ClipboardList className="w-6 h-6 text-white" />
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">Control de Informes</h1>
          <p className="text-white/70 text-xs">Valoraciones de deportistas ACTIVOS · por programa, proyecto y formador</p>
        </div>
        {cargandoInf && <span className="text-white/70 text-[11px] font-bold hidden sm:inline">cargando informes…</span>}
        <button onClick={cargar} title="Actualizar" className="text-white/80 hover:text-white transition"><RefreshCw className={`w-4 h-4 ${cargandoInf ? 'animate-spin' : ''}`} /></button>
        {/* EL LOGO, COMO EN TODOS LOS MÓDULOS (dirección, 29/08/2026). */}
        <div className="hidden sm:flex flex-col items-end flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/80 text-[9px] font-semibold tracking-wide mt-0.5 text-right leading-tight">
            CONECTA · GESTIONA · GANA
          </p>
        </div>
      </header>

      {/* MÁS ANCHO (dirección, 29/08/2026): con seis columnas de datos, el
          cuadro no cabía en 6xl y la última —VER— quedaba cortada. */}
      <main className="mx-auto px-3 py-4 space-y-4 w-full" style={{ maxWidth: 1550 }}>
        {/* ── LOS FILTROS, EN LA BARRA VERDE ────────────────────────────────
            DISEÑO ESTÁNDAR DE LA APP (dirección, 29/08/2026): todos los
            filtros de todos los módulos se ven igual —barra verde, botones
            transparentes con borde blanco y letra blanca, y NARANJA el que
            esté filtrando en ese momento—. Así uno sabe de una dónde está
            parado, sin importar en qué pantalla esté. */}
        <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2"
             style={{ background: 'linear-gradient(to right, #05502A, #00B050)' }}>
          <ClipboardList className="w-5 h-5 text-white shrink-0" />
          <div className="min-w-0 mr-2">
            <h2 className="text-white font-black text-[15px] tracking-wide leading-tight">INFORMES</h2>
            <p className="text-white/75 text-[11px] font-semibold">{filas.length} deportistas</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <select value={fPrograma} onChange={e => setFPrograma(e.target.value)}
              title="Ver solo un programa" style={botonFiltro(!!fPrograma)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={opcion}>TODOS LOS PROGRAMAS</option>
              {programas.map(p => <option key={p} value={p} style={opcion}>{p}</option>)}
            </select>

            <select value={fProyecto} onChange={e => setFProyecto(e.target.value)}
              title="Ver solo un proyecto" style={botonFiltro(!!fProyecto)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={opcion}>TODOS LOS PROYECTOS</option>
              {proyectos.map(p => <option key={p} value={p} style={opcion}>{p}</option>)}
            </select>

            <select value={fProfe} onChange={e => setFProfe(e.target.value)}
              title="Ver solo los de un formador" style={botonFiltro(!!fProfe)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={opcion}>TODOS LOS PROFES</option>
              {formadores.map(p => <option key={p} value={p} style={opcion}>{p}</option>)}
            </select>

            <select value={fEstado} onChange={e => setFEstado(e.target.value)}
              title="Con informe o sin informe" style={botonFiltro(!!fEstado)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={opcion}>TODOS LOS ESTADOS</option>
              <option value="con" style={opcion}>CON INFORME</option>
              <option value="sin" style={opcion}>SIN INFORME</option>
            </select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                      style={{ color: q ? '#ffffff' : 'rgba(255,255,255,.7)' }} />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="BUSCAR CÓDIGO O NOMBRE"
                style={{ ...botonFiltro(!!q), width: 250 }}
                className="rounded-lg pl-8 pr-2 text-[11.5px] font-black outline-none
                  placeholder:text-white/60 placeholder:font-black" />
            </div>

            {hayFiltro && (
              <button onClick={limpiar} title="Quitar los filtros"
                style={botonFiltro(false)}
                className="rounded-lg px-2.5 flex items-center gap-1 text-[11px] font-black">
                <X className="w-3.5 h-3.5" /> VER TODOS
              </button>
            )}
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { n: totDeport,    l: 'Activos',       c: 'text-white' },
            { n: conInforme,   l: 'Con informe',   c: 'text-[#5BE39B]' },
            { n: sinInforme,   l: 'Sin informe',   c: 'text-[#F08A87]' },
            { n: conInf1,      l: 'Inf 1',          c: 'text-[#5BE39B]' },
            { n: conInf2,      l: 'Inf 2',          c: 'text-[#5BE39B]' },
            /* "TOTAL INFORMES" SE QUITÓ POR AHORA (dirección, 29/08/2026):
               con INF 1 e INF 2 se lee mejor dónde está el atraso. */
          ].map(s => (
            <div key={s.l} className="bg-[#3C4759] rounded-xl border border-[#4A5568] shadow-sm px-2 py-2 text-center">
              <p className={`font-black text-xl leading-none ${s.c}`}>{s.n}</p>
              <p className="text-white/40 text-[9px] font-bold uppercase tracking-wide mt-1 whitespace-nowrap">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden">
          {cargando ? (
            <p className="text-center text-white/40 text-sm py-12">Cargando informes…</p>
          ) : filtradas.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-12">No hay deportistas activos para estos filtros.</p>
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
                    <tr key={f.id} className="hover:brightness-110">
                      <td style={td}><span className="inline-block text-[#5BE39B] border border-[rgba(0,176,80,.45)] text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: 'rgba(0,176,80,.18)' }}>{f.estado || 'Activo'}</span></td>
                      <td style={td}><span className="text-white text-[11px] font-black px-2 py-0.5 rounded-md" style={{ background: '#00B050' }}>{f.codigo || '—'}</span></td>
                      {/* TODAS LAS FILAS DEL MISMO ALTO (dirección, 29/08/2026):
                          el nombre no se parte en dos renglones; la columna se
                          hace ancha y punto. */}
                      <td style={{ ...td, minWidth: 260 }}>
                        <button onClick={() => router.push(`/alumnos/${f.id}?volver=${encodeURIComponent(urlRegreso())}`)} className="font-bold text-white hover:text-[#5BE39B] text-left">{f.nombre}</button>
                      </td>
                      <td style={td}>{f.programa || '—'}</td>
                      <td style={td}>{f.proyecto || '—'}</td>
                      <td style={{ ...td, minWidth: 140 }}>{f.profe || <span className="text-white/40">sin asignar</span>}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{chipInf(f.inf1)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{chipInf(f.inf2)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span className={`inline-block min-w-[28px] text-[12px] font-black px-2 py-0.5 rounded-md ${f.total > 0 ? 'bg-[rgba(0,176,80,.18)] text-[#5BE39B] border border-[rgba(0,176,80,.45)]' : 'bg-[#20293a] text-white/35'}`}>{f.total}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {f.total > 0 ? (
                          <button onClick={() => router.push(`/valoracion-dinamica?cod=${encodeURIComponent(f.codigo)}&volver=${encodeURIComponent(urlRegreso())}`)}
                            className="bg-green-600 hover:bg-green-700 text-white text-[11px] font-black px-2.5 py-1 rounded-lg">📊 Ver</button>
                        ) : <span className="text-white/40 text-[13px]">—</span>}
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
