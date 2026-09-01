'use client';

/**
 * Asignación de Proyecto — Futuro Antioquia
 * Muestra TODOS los deportistas sin proyecto asignado.
 * Columnas: CÓDIGO · NOMBRE · AÑO · MES · DÍA · SEDE ESCOGIDA · JORNADA · PROGRAMA ESCOGIDO
 * Panel derecho: selector en cascada PROGRAMA → PROYECTO
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, UserPlus, AlertCircle, Search, RefreshCw } from 'lucide-react';
import { getDeportistas, updateColumnasDeportista, invalidarCache } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import type { Deportista } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useSoloLectura } from '@/lib/permisos';

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(c => rx.test(c));
  return k ? dep._columnas[k] ?? '' : '';
}
function colPrograma(d: Deportista) { return getCol(d, /^program/i); }
function colProy(d: Deportista)     { return getCol(d, /^proy/i); }
function colCodigo(d: Deportista)   { return getCol(d, /^c[oó]d/i); }
function colAfil(d: Deportista)    { return getCol(d, /tipo.*afil|^afil/i); }

function colorCodigo(afil: string): string {
  const v = afil.toLowerCase();
  if (v.includes('nuevo'))     return '#f97316';
  if (v.includes('antigu'))    return '#16a34a';
  if (v.includes('reingreso')) return '#2563eb';
  if (v.includes('mb instit')) return '#374151';
  if (v.includes('b instit'))  return '#7c3aed';
  return '#16a34a'; // default verde
}
function colSede(d: Deportista)     { return getCol(d, /^sede/i); }
// JORNADA de ENTRENAMIENTO (nunca la de estudio)
function colJornada(d: Deportista) {
  return getCol(d, /jorn.*entren/i)               // "JORNADA DE ENTRENAMIENTO"
      || getCol(d, /^jornada_ent/i)               // "JORNADA_ENT"
      || getCol(d, /^jorn(?!.*estud)/i);          // "JORNADA" genérica, pero NO la de estudio
}
function colAno(d: Deportista)      { return getCol(d, /^a[ñn]o$/i); }
function colMes(d: Deportista)      { return getCol(d, /^mes$/i); }
function colDia(d: Deportista)      { return getCol(d, /^d[ií]a$/i) || getCol(d, /^dia_nac/i); }
function colProfe(d: Deportista)    { return getCol(d, /^profe/i); }

/** Sin proyecto asignado */
function sinProyecto(d: Deportista): boolean {
  const p = colProy(d).trim().toUpperCase();
  return !p || p === 'UBICAR';
}

/** Programas y proyectos del sistema (de deportistas YA asignados) */
function getProgramasExistentes(todos: Deportista[]): Record<string, string[]> {
  const mapa: Record<string, Set<string>> = {};
  todos.filter(d => !sinProyecto(d)).forEach(d => {
    const prog = colPrograma(d).trim();
    const proy = colProy(d).trim();
    if (!prog || !proy) return;
    if (!mapa[prog]) mapa[prog] = new Set();
    mapa[prog].add(proy);
  });
  return Object.fromEntries(
    Object.entries(mapa).map(([p, s]) => [p, [...s].sort()])
  );
}

type AsignForm = {
  programa:  string;
  proyecto:  string;
  proyNuevo: string;
};

/** Info agregada de cada grupo (proyecto), a partir de los deportistas ya asignados. */
type Grupo = { proy: string; programa: string; sede: string; jornada: string; profe: string; count: number; anios: string[] };

function topKey(o: Record<string, number>): string {
  const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : '';
}

function getGruposInfo(todos: Deportista[]): Grupo[] {
  const map: Record<string, { programa: string; sede: Record<string, number>; jornada: Record<string, number>; profe: Record<string, number>; anios: Set<string>; count: number }> = {};
  todos.filter(d => !sinProyecto(d)).forEach(d => {
    const proy = colProy(d).trim();
    if (!proy) return;
    if (!map[proy]) map[proy] = { programa: '', sede: {}, jornada: {}, profe: {}, anios: new Set<string>(), count: 0 };
    const g = map[proy];
    g.count++;
    if (!g.programa) g.programa = colPrograma(d).trim();
    const s = colSede(d).trim();    if (s)  g.sede[s]    = (g.sede[s]    || 0) + 1;
    const j = colJornada(d).trim(); if (j)  g.jornada[j] = (g.jornada[j] || 0) + 1;
    const p = colProfe(d).trim();   if (p)  g.profe[p]   = (g.profe[p]   || 0) + 1;
    const y = colAno(d).match(/(19|20)\d{2}/); if (y) g.anios.add(y[0]);
  });
  return Object.entries(map).map(([proy, g]) => ({
    proy, programa: g.programa, sede: topKey(g.sede), jornada: topKey(g.jornada), profe: topKey(g.profe),
    count: g.count, anios: Array.from(g.anios).sort(),
  })).sort((a, b) => a.proy.localeCompare(b.proy, 'es', { numeric: true }));
}

/** Tarjeta de un grupo sugerido. */
function GrupoCard({ g, tag, activo, onClick }: { g: Grupo; tag: 'ok' | 'alt' | 'alt2'; activo: boolean; onClick: () => void }) {
  const tagInfo = tag === 'ok'
    ? { txt: 'Jornada exacta', cls: 'bg-[#16a34a] text-white' }
    : tag === 'alt'
      ? { txt: 'Otra jornada',  cls: 'bg-amber-100 text-[#E0A33A]' }
      : { txt: 'Otra sede',     cls: 'bg-blue-100 text-[#8FBEF0]' };
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'text-left border rounded-lg p-2 transition-all w-full',
        activo
          ? 'border-[#16a34a] bg-[#f0fdf4] ring-2 ring-[#16a34a]'
          : 'border-[#4A5568] hover:border-[#16a34a] hover:-translate-y-0.5 hover:shadow-md',
        tag !== 'ok' && !activo ? 'opacity-70' : '',
      )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-black text-white text-sm">{g.proy}</span>
        <span className="text-[9px] font-black text-[#5BE39B] bg-green-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">👤 {g.count}</span>
      </div>
      <div className="text-[10px] text-white/70 mt-0.5 leading-snug">
        <span className="font-bold text-white">{g.programa || '—'}</span>{g.sede ? ' · ' + g.sede : ''}
        {g.jornada && <><br />{g.jornada}</>}
        {g.profe && <> · {g.profe}</>}
      </div>
      {g.anios.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[8px] font-black text-white/40 uppercase tracking-wider">Años</span>
          {g.anios.map(a => (
            <span key={a} className="text-[9px] font-black text-[#8FBEF0] bg-[rgba(78,143,214,.14)] border border-blue-100 px-1.5 py-0.5 rounded">{a}</span>
          ))}
        </div>
      )}
      <span className={cn('inline-block mt-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full', tagInfo.cls)}>{tagInfo.txt}</span>
    </button>
  );
}

function SeccionGrupos({ titulo, grupos, tag, onPick, sel }: { titulo: string; grupos: Grupo[]; tag: 'ok' | 'alt' | 'alt2'; onPick: (g: Grupo) => void; sel: string }) {
  if (!grupos.length) return null;
  return (
    <div>
      <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1.5">{titulo}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
        {grupos.map(g => <GrupoCard key={g.proy} g={g} tag={tag} activo={sel === g.proy} onClick={() => onPick(g)} />)}
      </div>
    </div>
  );
}

const G_COL   = ['CÓDIGO','NOMBRE','AÑO','MES','DÍA','SEDE ESCOGIDA','JORNADA','PROGRAMA ESCOGIDO'];
const G_STYLE  = { background: '#16a34a', color: 'white', border: '1px solid white', padding: '8px 10px', fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', whiteSpace: 'nowrap' as const, textAlign: 'center' as const };
const R_STYLE  = { background: '#f1f5f9', color: '#374151', border: '1px solid white', padding: '7px 10px', fontSize: 12, whiteSpace: 'nowrap' as const };

export default function AsignacionPage() {
  const router = useRouter();

  const [todos,      setTodos]      = useState<Deportista[]>([]);
  const [programas,  setProgramas]  = useState<Record<string, string[]>>({});
  // Sede CONFIGURADA de cada proyecto (jornadas_proyecto) — más confiable que la de los miembros
  const [sedePorProy, setSedePorProy] = useState<Record<string, string>>({});
  const [busqueda,   setBusqueda]   = useState('');
  const [selected,   setSelected]   = useState<Deportista | null>(null);
  const [form,       setForm]       = useState<AsignForm>({ programa: '', proyecto: '', proyNuevo: '' });
  const [guardando,  setGuardando]  = useState(false);
  const soloLectura = useSoloLectura(); // contabilidad: solo ver
  const [exito,      setExito]      = useState(false);
  const [error,      setError]      = useState('');

  /* ── LEER LAS FICHAS ─────────────────────────────────────────────────────
     `refrescar` vuelve a pedirlas a la nube, sin la copia que el navegador
     tiene guardada en memoria.

     POR QUÉ HACÍA FALTA (dirección, 27/08/2026): las fichas se leen UNA vez y
     quedan guardadas mientras la pestaña esté abierta. Si el proyecto se
     arregla desde otro lado —Total Afiliados, u otra pantalla—, esta lista
     seguía mostrando gente que ya tenía proyecto, y parecía que no se hubiera
     guardado. Con el botón ACTUALIZAR se vuelve a preguntar y listo. */
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async (deNuevo = false) => {
    if (deNuevo) { setRefrescando(true); invalidarCache(); }
    try {
      const lista = await getDeportistas();
      setTodos(lista);
      setProgramas(getProgramasExistentes(lista));
    } finally {
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Cargar la sede configurada de cada proyecto (para sugerir bien aunque los
  // deportistas del grupo no tengan la sede llena en su ficha).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient().from('jornadas_proyecto').select('proyecto,sede');
        const m: Record<string, string> = {};
        (data ?? []).forEach((r: any) => {
          const p = String(r.proyecto ?? '').trim();
          const s = String(r.sede ?? '').trim();
          if (p && s) m[p] = s;
        });
        setSedePorProy(m);
      } catch { /* noop */ }
    })();
  }, []);

  const sinProyectoLista = useMemo(() =>
    todos.filter(sinProyecto).sort((a, b) => a._nombre.localeCompare(b._nombre, 'es')),
    [todos]
  );

  const filtrados = useMemo(() => {
    if (!busqueda) return sinProyectoLista;
    const q = busqueda.toLowerCase();
    return sinProyectoLista.filter(d =>
      d._nombre.toLowerCase().includes(q) ||
      colCodigo(d).toLowerCase().includes(q) ||
      colPrograma(d).toLowerCase().includes(q)
    );
  }, [sinProyectoLista, busqueda]);

  // Info de todos los grupos existentes (para sugerir según programa · sede · jornada)
  const gruposInfo = useMemo(() => getGruposInfo(todos), [todos]);

  // Grupos sugeridos. FILTROS en orden: 1) PROGRAMA  2) SEDE  3) AÑO cercano (±1).
  // Si el programa o la sede no coinciden, o el año no es cercano, el grupo NO aparece.
  const sugeridos = useMemo(() => {
    if (!selected) return null;
    const prog = colPrograma(selected).trim();
    const sede = colSede(selected).trim();
    const jor  = colJornada(selected).trim();
    const anioTxt = (colAno(selected).match(/(19|20)\d{2}/) || [])[0] || '';
    const anioDep = anioTxt ? parseInt(anioTxt, 10) : 0;
    const up = (s: string) => s.trim().toUpperCase();
    // ±1 año: un 2018 acepta grupos con 2017, 2018 o 2019.
    const anioCerca = (g: Grupo) => {
      if (!anioDep) return true;
      return g.anios.some(a => { const n = parseInt(a, 10); return !!n && Math.abs(n - anioDep) <= 1; });
    };
    // Comparación sin tildes ni dobles espacios (BELLO NIQUÍA == BELLO NIQUIA)
    const norm = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    // Sede del grupo: primero la CONFIGURADA del proyecto; si no, la de los miembros.
    const sedeDe = (g: Grupo) => (sedePorProy[g.proy] || g.sede || '').trim();
    const base0 = (prog && sede)
      ? gruposInfo.filter(g => {
          const gSede = sedeDe(g);
          return norm(g.programa) === norm(prog) && !!gSede && norm(gSede) === norm(sede) && anioCerca(g);
        })
      : [];
    // Mostrar la sede configurada en la tarjeta del grupo
    const base = base0.map(g => ({ ...g, sede: sedeDe(g) }));
    const exactos = base.filter(g => jor && norm(g.jornada) === norm(jor));
    const otros   = base.filter(g => !(jor && norm(g.jornada) === norm(jor)));
    return { prog, sede, jor, anio: anioTxt, exactos, otros, total: base.length };
  }, [selected, gruposInfo, sedePorProy]);

  // Al elegir un grupo sugerido, se autocompleta el formulario (solo falta confirmar).
  function elegirGrupo(g: Grupo) {
    setError('');
    setForm(f => ({ ...f, programa: g.programa || f.programa, proyecto: g.proy, proyNuevo: '' }));
  }

  function seleccionar(dep: Deportista) {
    setSelected(dep);
    setExito(false);
    setError('');
    const prog = colPrograma(dep).trim();
    setForm({ programa: prog, proyecto: '', proyNuevo: '' });
  }

  function cancelar() { setSelected(null); setExito(false); setError(''); }

  /* ── SE GUARDA UNA FICHA, NO LAS MIL CIENTO SESENTA Y OCHO ────────────────
     (dirección, 01/09/2026 — «a varios de estos deportistas ya se les había
      puesto el proyecto, ¿por qué se les quitó?»)

     QUÉ PASABA. Al asignar UN deportista, esta pantalla mandaba a guardar la
     lista COMPLETA de la academia — las 1.168 fichas — con la copia que tenía
     cargada desde que se abrió. Dos daños, los dos silenciosos:

       1. PISABA LO DE OTROS. Todo lo que se hubiera cambiado en otra pantalla,
          en otra pestaña o desde otro computador DESPUÉS de abrir esta se
          volvía a escribir como estaba antes. Ahí es donde un proyecto ya
          puesto "se quitaba" solo.

       2. NI SIQUIERA ESPERABA. El guardado salía sin `await`: la pantalla
          decía "¡Asignado!" de una, sin saber si la nube había recibido algo.
          Mandar 1.168 fichas tarda; si en ese momento se cambiaba de pantalla
          o se cerraba, el envío se cortaba a medias y no quedaba nada — pero
          en la pantalla se había visto el mensaje de éxito.

     LA CURA. Se escribe SOLO la ficha del deportista escogido, con la
     herramienta que ya existía para eso (`updateColumnasDeportista`). Es un
     envío chiquito, se espera a que la nube conteste, y el "¡Asignado!" ya solo
     aparece cuando de verdad quedó guardado. Si falla, lo dice. */
  async function guardar() {
    if (!selected) return;
    if (!form.programa.trim()) { setError('Selecciona un programa.'); return; }
    const proy = form.proyNuevo.trim() || form.proyecto.trim();
    if (!proy) { setError('Selecciona o escribe un proyecto.'); return; }

    setGuardando(true); setError('');

    /* La versión más fresca de la ficha, por si la lista se actualizó. */
    const actual = todos.find(d => d.id === selected.id) ?? selected;
    const cols = { ...actual._columnas };
    const setCampo = (rx: RegExp, nombre: string, valor: string) => {
      const k = Object.keys(cols).find(c => rx.test(c)) ?? nombre;
      cols[k] = valor;
    };
    setCampo(/^program/i, 'PROGRAMA', form.programa);
    setCampo(/^proy/i,    'PROY',     proy);

    let quedo = false;
    try { quedo = await updateColumnasDeportista(actual.id, cols); }
    catch { quedo = false; }

    if (!quedo) {
      setGuardando(false);
      setError('No se pudo guardar en la nube: el deportista NO quedó asignado. Intente otra vez.');
      return;
    }

    const actualizada = todos.map(d => (d.id === actual.id ? { ...d, _columnas: cols } : d));
    setTodos(actualizada);
    setProgramas(getProgramasExistentes(actualizada));
    setExito(true);
    setSelected(null);
    setGuardando(false);
  }

  return (
    <div className="min-h-screen bg-[#333F50]">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => router.push('/dashboard')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <UserPlus className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-black text-white text-sm leading-tight">Asignación de Proyecto</p>
          <p className="text-[10px] text-white/60">Deportistas sin proyecto asignado</p>
        </div>
        <span className="text-xs font-bold bg-white/20 text-white px-3 py-1 rounded-full">
          {sinProyectoLista.length} sin proyecto
        </span>
        {/* Vuelve a preguntarle a la nube, por si el proyecto se arregló desde
            otra pantalla. — dirección, 27/08/2026 */}
        <button
          onClick={() => cargar(true)}
          disabled={refrescando}
          title="Volver a leer las fichas desde la nube"
          className="flex items-center gap-1.5 text-[11px] font-black text-white bg-white/20 hover:bg-white/35
            px-3 py-1.5 rounded-xl transition disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refrescando ? 'animate-spin' : ''}`} />
          ACTUALIZAR
        </button>
        <div className="hidden sm:block text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/75 text-[9px] font-semibold tracking-wide">CONECTA · GESTIONA · GANA</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">

        {exito && (
          <div className="flex items-center gap-3 bg-[rgba(0,176,80,.14)] border border-[rgba(0,176,80,.45)] rounded-2xl px-5 py-4">
            <CheckCircle className="w-5 h-5 text-[#5BE39B] flex-shrink-0" />
            <p className="text-sm font-bold text-green-800">Proyecto asignado correctamente.</p>
          </div>
        )}

        {sinProyectoLista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mb-5">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-lg font-black text-white">¡Todo asignado!</h2>
            <p className="text-white/40 text-sm mt-1">No hay deportistas sin proyecto.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">

            {/* ── Lista con tabla ── */}
            <div className="space-y-3">

              {/* Buscador */}
              <div className="flex items-center gap-2 bg-[#3C4759] rounded-xl border border-[#4A5568] px-3 py-2 shadow-sm">
                <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
                {/* EL BUSCADOR ESCRIBÍA EN BLANCO SOBRE BLANCO (dirección,
                    01/09/2026). La casilla tenía la letra blanca, pero no se le
                    había dicho que el fondo fuera el de la barra: el navegador
                    le ponía el suyo, que es blanco. Se escribía bien, pero no se
                    veía nada. Con `bg-transparent` toma el fondo oscuro de la
                    barra y la letra blanca vuelve a verse. */}
                <input type="text" placeholder="Buscar nombre, código o programa..."
                  value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-white/40 text-white" />
              </div>

              {/* Tabla */}
              <div className="rounded-2xl overflow-hidden shadow-sm border border-[#4A5568]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 700 }}>
                    <thead>
                      <tr>
                        {G_COL.map(h => (
                          <th key={h} style={G_STYLE}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr>
                          <td colSpan={G_COL.length} className="py-10 text-center text-white/40 font-semibold border border-white">
                            Sin resultados
                          </td>
                        </tr>
                      ) : filtrados.map(dep => {
                        const isSel = selected?.id === dep.id;
                        return (
                          <tr key={dep.id}
                            onClick={() => { if (!soloLectura) seleccionar(dep); }}
                            className={cn(
                              'transition-all',
                              soloLectura ? 'cursor-default' : 'cursor-pointer',
                              isSel ? 'outline outline-2 outline-[#16a34a]' : (!soloLectura ? 'hover:brightness-95' : '')
                            )}>
                            <td style={{ ...R_STYLE, background: colorCodigo(colAfil(dep)), color: 'white', fontWeight: 900, textAlign: 'center' }}>
                              {colCodigo(dep) || '—'}
                            </td>
                            <td style={{ ...R_STYLE, fontWeight: 700, color: '#111827', minWidth: 180 }}>
                              {dep._nombre}
                            </td>
                            <td style={{ ...R_STYLE, textAlign: 'center' }}>{colAno(dep) || '—'}</td>
                            <td style={{ ...R_STYLE, textAlign: 'center' }}>{colMes(dep) || '—'}</td>
                            <td style={{ ...R_STYLE, textAlign: 'center' }}>{colDia(dep) || '—'}</td>
                            <td style={{ ...R_STYLE, textAlign: 'center' }}>{colSede(dep) || '—'}</td>
                            <td style={{ ...R_STYLE, textAlign: 'center' }}>{colJornada(dep) || '—'}</td>
                            <td style={{ ...R_STYLE, textAlign: 'center' }}>
                              {colPrograma(dep)
                                ? <span className="bg-[#16a34a] text-white text-[9px] font-black px-2 py-0.5 rounded-full">{colPrograma(dep)}</span>
                                : <span className="text-white/40">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Panel flotante: grupos sugeridos (programa · sede · jornada) ── */}
              {selected && sugeridos && (
                <div className="rounded-2xl border border-[rgba(0,176,80,.45)] bg-[#3C4759] shadow-lg overflow-hidden animate-fade-up">
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ background: 'linear-gradient(90deg,#065f46,#16a34a)' }}>
                    <span>🎯</span>
                    <span className="text-white font-black text-sm">Grupos sugeridos</span>
                    {sugeridos.prog && <span className="text-[10px] font-black text-white px-2.5 py-0.5 rounded-full" style={{ background: '#16a34a' }}>Programa: {sugeridos.prog}</span>}
                    {sugeridos.sede && <span className="text-[10px] font-black text-white px-2.5 py-0.5 rounded-full" style={{ background: '#1d4ed8' }}>Sede: {sugeridos.sede}</span>}
                    {sugeridos.anio && <span className="text-[10px] font-black text-white px-2.5 py-0.5 rounded-full" style={{ background: '#7c3aed' }}>Año: {sugeridos.anio} (±1)</span>}
                    {sugeridos.jor && <span className="text-[10px] font-black text-white px-2.5 py-0.5 rounded-full" style={{ background: '#4b5563' }}>Jornada: {sugeridos.jor}</span>}
                  </div>
                  <div className="p-3">
                    {!sugeridos.prog ? (
                      <p className="text-center text-white/40 text-sm font-semibold py-6">Este deportista no tiene programa escogido. Elige primero el programa en el panel de la derecha.</p>
                    ) : !sugeridos.sede ? (
                      <p className="text-center text-white/40 text-sm font-semibold py-6">Este deportista no tiene sede escogida, no se pueden sugerir grupos por sede.</p>
                    ) : sugeridos.total === 0 ? (
                      <p className="text-center text-white/40 text-sm font-semibold py-6">No hay grupos en <b>{sugeridos.prog}</b> · <b>{sugeridos.sede}</b> con edades cercanas a <b>{sugeridos.anio || '—'}</b>.</p>
                    ) : (
                      <div className="space-y-3">
                        <SeccionGrupos titulo="✅ Coinciden con la jornada" grupos={sugeridos.exactos} tag="ok"  onPick={elegirGrupo} sel={form.proyecto} />
                        <SeccionGrupos titulo="Otra jornada"                grupos={sugeridos.otros}   tag="alt" onPick={elegirGrupo} sel={form.proyecto} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel de asignación ── */}
            <div>
              {!selected ? (
                <div className="bg-[#3C4759] rounded-2xl border-2 border-dashed border-[#4A5568] p-10 flex flex-col items-center justify-center text-center h-full min-h-[200px]">
                  <div className="w-14 h-14 bg-[#2B3547] rounded-2xl flex items-center justify-center mb-3">
                    <UserPlus className="w-7 h-7 text-white/40" />
                  </div>
                  <p className="font-bold text-white/70 text-sm">Selecciona un deportista</p>
                  <p className="text-xs text-white/40 mt-1">de la tabla para asignarle programa y proyecto</p>
                </div>
              ) : (
                <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden sticky top-20">
                  {/* Cabecera */}
                  <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-5 py-4">
                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Asignando a</p>
                    <p className="text-white font-black text-lg leading-tight">{selected._nombre}</p>
                  </div>

                  {/* Info del deportista */}
                  {(colSede(selected) || colJornada(selected) || colPrograma(selected)) && (
                    <div className="px-5 py-3 bg-[#f0fdf4] border-b border-green-100 flex flex-wrap gap-2">
                      {colPrograma(selected) && (
                        <div className="flex flex-col items-start">
                          <span className="text-[9px] font-black text-[#5BE39B] uppercase tracking-widest">Programa escogido</span>
                          <span className="bg-[#16a34a] text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{colPrograma(selected)}</span>
                        </div>
                      )}
                      {colSede(selected) && (
                        <div className="flex flex-col items-start">
                          <span className="text-[9px] font-black text-[#8FBEF0] uppercase tracking-widest">Sede</span>
                          <span className="bg-[#1d4ed8] text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{colSede(selected)}</span>
                        </div>
                      )}
                      {colJornada(selected) && (
                        <div className="flex flex-col items-start">
                          <span className="text-[9px] font-black text-white/70 uppercase tracking-widest">Jornada</span>
                          <span className="bg-gray-600 text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{colJornada(selected)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-5 space-y-4">
                    {/* PROGRAMA */}
                    <div>
                      <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wide">Programa</label>
                      <select value={form.programa}
                        onChange={e => setForm(f => ({ ...f, programa: e.target.value, proyecto: '', proyNuevo: '' }))}
                        className="w-full border border-[#4A5568] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-[#3C4759] font-semibold">
                        <option value="">— Selecciona programa —</option>
                        {Object.keys(programas).sort().map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="__NUEVO_PROG__">+ Nuevo programa…</option>
                      </select>
                      {form.programa === '__NUEVO_PROG__' && (
                        <input type="text" placeholder="Nombre del nuevo programa"
                          className="mt-2 w-full border border-[#4A5568] rounded-xl px-4 py-2.5 text-sm bg-[#2B3547] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                          onChange={e => setForm(f => ({ ...f, programa: e.target.value }))} />
                      )}
                    </div>

                    {/* PROYECTO */}
                    <div>
                      <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wide">Proyecto</label>
                      <select value={form.proyecto}
                        onChange={e => setForm(f => ({ ...f, proyecto: e.target.value, proyNuevo: '' }))}
                        className="w-full border border-[#4A5568] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-[#3C4759] font-semibold"
                        disabled={!form.programa || form.programa === '__NUEVO_PROG__'}>
                        <option value="">— Selecciona proyecto —</option>
                        {(programas[form.programa] ?? []).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="__NUEVO_PROY__">+ Nuevo proyecto…</option>
                      </select>
                      {form.proyecto === '__NUEVO_PROY__' && (
                        <input type="text" placeholder="Nombre del nuevo proyecto"
                          value={form.proyNuevo}
                          onChange={e => setForm(f => ({ ...f, proyNuevo: e.target.value }))}
                          className="mt-2 w-full border border-[#4A5568] rounded-xl px-4 py-2.5 text-sm bg-[#2B3547] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]" />
                      )}
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 bg-[rgba(192,80,77,.14)] border border-[rgba(192,80,77,.45)] rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 text-[#F08A87] flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-[#F08A87] font-medium">{error}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button onClick={cancelar}
                        className="flex-1 border border-[#4A5568] text-white/70 hover:bg-[#333F50] font-bold py-3 rounded-xl transition text-sm">
                        Cancelar
                      </button>
                      {!soloLectura && (
                      <button onClick={guardar} disabled={guardando}
                        className="flex-1 bg-[#16a34a] hover:bg-[#064e1e] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm">
                        {guardando
                          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <CheckCircle className="w-4 h-4" />}
                        {guardando ? 'Guardando…' : 'Asignar Proyecto'}
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
