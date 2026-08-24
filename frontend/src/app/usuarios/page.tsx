'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, Plus, Eye, EyeOff, Users, X, Trash2, ChevronRight } from 'lucide-react';
import { getProfes, saveProfes, deleteProfe, getDeportistas } from '@/lib/db';
import type { Profe } from '@/lib/db';
import { useSoloLectura } from '@/lib/permisos';

const PROYECTOS_META_KEY = 'futuro_proyectos_meta';
const SEDES = ['Santa Mónica', 'La 80', 'Centro', 'Sabaneta', 'Bello Niquía', 'Rionegro', 'Institucional'];
const DIAS_SEMANA_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_ORDEN_JS = [1, 2, 3, 4, 5, 6, 0];
const ANIOS_NACIMIENTO = Array.from({ length: 14 }, (_, i) => 2011 + i); // 2011–2024
const ORDEN_PROGRAMA = ['Estimulación', 'Formación', 'Progresión', 'Pre-Progresión', 'Selección', 'Desarrollo'];

function getCol(dep: any, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find((c: string) => rx.test(c.trim()));
  return k ? String(cols[k] ?? '') : '';
}

function uuid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function ordenProg(p: string) {
  const i = ORDEN_PROGRAMA.findIndex(x => x.toLowerCase() === p.trim().toLowerCase());
  return i >= 0 ? i : 999;
}

/** Conteo de deportistas por programa y por proyecto (activos y totales). Se recalcula
 *  cada vez que se vuelve a la pantalla, para reflejar altas/retiros al momento. */
function calcularConteos(deps: any[]) {
  const prog: Record<string, { act: number; tot: number }> = {};
  const proy: Record<string, { act: number; tot: number }> = {};
  deps.forEach(dep => {
    const progRaw  = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
    const progDisp = progRaw === '__SIN_PROGRAMA__' ? 'Sin Programa' : progRaw;
    const p        = getCol(dep, /^proy/i).trim();
    const activo   = getCol(dep, /^estado/i).trim().toUpperCase() === 'ACTIVO';
    if (!prog[progDisp]) prog[progDisp] = { act: 0, tot: 0 };
    prog[progDisp].tot++; if (activo) prog[progDisp].act++;
    if (p) {
      const k = `${progRaw}::${p}`;
      if (!proy[k]) proy[k] = { act: 0, tot: 0 };
      proy[k].tot++; if (activo) proy[k].act++;
    }
  });
  return { prog, proy };
}

/** Años de nacimiento (distintos, ordenados) de los deportistas de cada proyecto.
 *  Solo cuenta deportistas ACTIVOS (no retirados). */
function calcularAniosPorProyecto(deps: any[]): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  deps.forEach(dep => {
    const estado = getCol(dep, /^estado/i).trim().toUpperCase();
    if (estado === 'RETIRADO') return;
    const proy = getCol(dep, /^proy/i).trim();
    if (!proy) return;
    const raw = getCol(dep, /^a[ñn]o$/i).trim();
    const m = raw.match(/(19|20)\d{2}/);
    if (!m) return;
    if (!map[proy]) map[proy] = new Set();
    map[proy].add(m[0]);
  });
  const out: Record<string, string[]> = {};
  Object.entries(map).forEach(([k, s]) => { out[k] = Array.from(s).sort(); });
  return out;
}

interface ProyMeta {
  nombreFormador: string;
  sede: string;
  dias: number[];
  edades: number[];
  horario?: string;
  calificacion?: string;
}

interface ProyRow {
  programa: string;
  proyecto: string;
  profeId: string | null;
  profeUsuario: string;
  profeClave: string;
}

// BLINDAJE (22/08/2026): se eliminó la lista con las cédulas de los formadores.
// Estaba dentro del JavaScript que descarga cualquier visitante.

export default function UsuariosPage() {
  const router = useRouter();

  const [profes,      setProfes]      = useState<Profe[]>([]);
  const [proyRows,    setProyRows]    = useState<ProyRow[]>([]);
  const [meta,        setMeta]        = useState<Record<string, ProyMeta>>({});
  const [metaEdits,   setMetaEdits]   = useState<Record<string, Partial<ProyMeta>>>({});
  const [profeEdits,  setProfeEdits]  = useState<Record<string, { usuario?: string; clave?: string; nombre?: string }>>({});
  const [profesDirty, setProfesDirty] = useState(false); // reasignaciones de proyecto pendientes
  const [filtroPrograma, setFiltroPrograma] = useState('');
  const [guardando,   setGuardando]   = useState(false);
  const [guardado,    setGuardado]    = useState(false);
  const [errorGuard,  setErrorGuard]  = useState('');
  const [claveVis,    setClaveVis]    = useState<Record<string, boolean>>({});
  const [agregando,   setAgregando]   = useState(false);
  const [nuevo,       setNuevo]       = useState({ usuario: '', clave: '', nombre: '' });
  const [verFormadores, setVerFormadores] = useState(false); // modal lista de formadores
  const soloLectura = useSoloLectura(); // contabilidad: solo puede ver, no editar

  // Conteos de deportistas por programa y por proyecto (activos y totales)
  const [conteos, setConteos] = useState<{ prog: Record<string, { act: number; tot: number }>; proy: Record<string, { act: number; tot: number }> }>({ prog: {}, proy: {} });
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set()); // programas desplegados (vacío = todos plegados)
  const [modoConteo, setModoConteo] = useState<'act' | 'tot'>('act'); // 'act' = activos (por defecto), 'tot' = todos
  const [aniosProy, setAniosProy] = useState<Record<string, string[]>>({}); // años de nacimiento por proyecto
  const [cargando,   setCargando]   = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    Promise.all([getProfes(), getDeportistas()]).then(([listaProfes, deps]) => {
      // Si la base no responde, no se inventan formadores: la lista queda vacía.
      setProfes(listaProfes);

      // Construir filas de proyectos desde deportistas
      const map: Record<string, Set<string>> = {};
      deps.forEach(dep => {
        const prog = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
        const proy = getCol(dep, /^proy/i).trim();
        if (!proy) return;
        if (!map[prog]) map[prog] = new Set();
        map[prog].add(proy);
      });

      // Conteos de deportistas por programa y por proyecto
      setConteos(calcularConteos(deps));
      setAniosProy(calcularAniosPorProyecto(deps));

      const rows: ProyRow[] = [];
      Object.entries(map)
        .sort(([a], [b]) => ordenProg(a) - ordenProg(b))
        .forEach(([programa, proySet]) => {
          [...proySet].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })).forEach(proyecto => {
            // ANTES decía `inicial`, una lista de formadores escrita a mano que se
            // eliminó el 22/08/2026 por seguridad (traía las cédulas). Al quitarla
            // quedó esta línea apuntando a una variable que ya no existe: el módulo
            // reventaba justo aquí, después de pintar los formadores y antes de
            // construir los proyectos. De ahí el "0 proyectos · 25 formadores".
            // Los datos nunca se perdieron. — 22/08/2026
            const profe = listaProfes.find(p => p.proyectos.includes(proyecto));
            rows.push({
              programa,
              proyecto,
              profeId:      profe?.id ?? null,
              profeUsuario: profe?.usuario ?? '',
              profeClave:   profe?.clave ?? '',
            });
          });
        });
      setProyRows(rows);

      // Cargar meta de localStorage
      try {
        const raw = localStorage.getItem(PROYECTOS_META_KEY);
        if (raw) setMeta(JSON.parse(raw));
      } catch {}
      setCargando(false);
    }).catch((e: any) => {
      // Sin este catch, cualquier error dejaba la pantalla vacía sin decir nada.
      console.error('[usuarios] no se pudo armar la lista de proyectos:', e);
      setErrorCarga(String(e?.message ?? e));
      setCargando(false);
    });
  }, []);

  // Refrescar los conteos al volver a la pantalla (refleja altas/retiros al momento)
  useEffect(() => {
    const refrescar = () => { getDeportistas().then(deps => { setConteos(calcularConteos(deps)); setAniosProy(calcularAniosPorProyecto(deps)); }).catch(() => {}); };
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') refrescar(); };
    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refrescar);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Migración (una sola vez): sube a la BD los nombres de formador que estaban solo en la
  // configuración local del navegador. Así aparecen en todas partes (incluido Vercel).
  // En un navegador sin esa config local, no encuentra nada y no hace nada.
  const migradoNombresRef = useRef(false);
  useEffect(() => {
    if (migradoNombresRef.current) return;
    if (profes.length === 0 || proyRows.length === 0) return;
    const actualizados = profes.map(p => {
      if (p.nombre && p.nombre.trim()) return p;
      const nm = nombreDeProfe(p);
      return nm ? { ...p, nombre: nm } : p;
    });
    const cambio = actualizados.some((p, i) => (p.nombre ?? '') !== (profes[i].nombre ?? ''));
    migradoNombresRef.current = true;
    if (cambio) {
      setProfes(actualizados);
      saveProfes(actualizados).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profes, proyRows, meta]);

  // ── Helpers ────────────────────────────────────────────────────
  function metaKey(row: ProyRow): string {
    return `${row.programa}::${row.proyecto}`;
  }

  function getMetaVal<K extends keyof ProyMeta>(row: ProyRow, field: K): ProyMeta[K] {
    const k = metaKey(row);
    const edit = metaEdits[k];
    if (edit && field in edit) return edit[field] as ProyMeta[K];
    const saved = meta[k];
    if (saved && field in saved) return saved[field] as ProyMeta[K];
    if (field === 'dias' || field === 'edades') return [] as unknown as ProyMeta[K];
    return '' as unknown as ProyMeta[K];
  }

  function setMetaEdit(row: ProyRow, field: keyof ProyMeta, value: unknown) {
    const k = metaKey(row);
    setMetaEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: value } }));
  }

  function getDias(row: ProyRow): number[] {
    return getMetaVal(row, 'dias') as number[];
  }

  function toggleDia(row: ProyRow, jsDay: number) {
    const curr   = getDias(row);
    const newDias = curr.includes(jsDay) ? curr.filter(d => d !== jsDay) : [...curr, jsDay].sort();
    setMetaEdit(row, 'dias', newDias);
    // Auto-save para que /asistencia lo lea de inmediato
    try { localStorage.setItem(`futuro_dias_${row.proyecto}`, JSON.stringify(newDias)); } catch {}
  }

  function getEdades(row: ProyRow): number[] {
    return getMetaVal(row, 'edades') as number[];
  }

  function toggleEdad(row: ProyRow, anio: number) {
    const curr = getEdades(row);
    if (curr.includes(anio))    setMetaEdit(row, 'edades', curr.filter(a => a !== anio));
    else if (curr.length < 5)   setMetaEdit(row, 'edades', [...curr, anio].sort());
  }

  function getProfeVal(row: ProyRow, field: 'usuario' | 'clave'): string {
    if (!row.profeId) return '';
    const edit = profeEdits[row.profeId];
    if (edit && field in edit) return edit[field] ?? '';
    return field === 'usuario' ? row.profeUsuario : row.profeClave;
  }

  function setProfeEdit(row: ProyRow, field: 'usuario' | 'clave', value: string) {
    if (!row.profeId) return;
    setProfeEdits(prev => ({ ...prev, [row.profeId!]: { ...prev[row.profeId!], [field]: value } }));
  }

  /** Nombre completo conocido de un profe: su campo `nombre`, o el que ya tenga
   *  escrito en algún proyecto que le pertenezca. Sirve para autocompletar al reasignar. */
  function nombreDeProfe(profe: Profe | undefined): string {
    if (!profe) return '';
    if (profe.nombre && profe.nombre.trim()) return profe.nombre.trim();
    for (const r of proyRows) {
      if (r.profeId === profe.id) {
        const nm = String(getMetaVal(r, 'nombreFormador') || '').trim();
        if (nm) return nm;
      }
    }
    return '';
  }

  /** Nombre a mostrar en la columna "Nombre del formador".
   *  Si el proyecto tiene profe asignado → es el "Nombre completo" del profe (relación directa).
   *  Si no tiene profe → texto libre del proyecto. */
  function getNombreFormador(row: ProyRow): string {
    if (row.profeId) {
      const edit = profeEdits[row.profeId];
      if (edit && edit.nombre !== undefined) return edit.nombre;
      const profe = profes.find(p => p.id === row.profeId);
      return nombreDeProfe(profe);
    }
    return getMetaVal(row, 'nombreFormador') as string;
  }

  /** Editar el nombre en la tabla actualiza el "Nombre completo" del profe (se refleja en
   *  todos sus proyectos y en "Ver formadores"). Si no hay profe, queda como texto del proyecto. */
  function setNombreFormador(row: ProyRow, value: string) {
    if (row.profeId) {
      setProfeEdits(prev => ({ ...prev, [row.profeId!]: { ...prev[row.profeId!], nombre: value.toUpperCase() } }));
    } else {
      setMetaEdit(row, 'nombreFormador', value);
    }
  }

  // ── Guardar ────────────────────────────────────────────────────
  async function guardar() {
    setGuardando(true); setErrorGuard('');

    // 1. Meta → localStorage
    const newMeta: Record<string, ProyMeta> = { ...meta };
    Object.entries(metaEdits).forEach(([k, edits]) => {
      newMeta[k] = {
        nombreFormador: '', sede: '', dias: [], edades: [],
        ...(newMeta[k] ?? {}),
        ...edits,
      };
      const proy = k.split('::').slice(1).join('::');
      if (proy && Array.isArray(newMeta[k].dias)) {
        try { localStorage.setItem(`futuro_dias_${proy}`, JSON.stringify(newMeta[k].dias)); } catch {}
      }
    });
    localStorage.setItem(PROYECTOS_META_KEY, JSON.stringify(newMeta));
    setMeta(newMeta);
    setMetaEdits({});

    // 2. Profes → Supabase
    if (Object.keys(profeEdits).length > 0 || profesDirty) {
      const updatedProfes = profes.map(p => {
        const edit = profeEdits[p.id];
        if (!edit) return p;
        return {
          ...p,
          usuario: (edit.usuario !== undefined ? edit.usuario : p.usuario).toUpperCase(),
          clave:    edit.clave   !== undefined ? edit.clave   : p.clave,
          nombre:   edit.nombre  !== undefined ? edit.nombre  : (p.nombre ?? ''),
        };
      });
      const { ok, msg } = await saveProfes(updatedProfes);
      if (!ok) { setErrorGuard(msg ?? 'Error al guardar'); setTimeout(() => setErrorGuard(''), 8000); }
      setProfes(updatedProfes);
      setProyRows(prev => prev.map(row => {
        if (!row.profeId) return row;
        const edit = profeEdits[row.profeId];
        if (!edit) return row;
        return {
          ...row,
          profeUsuario: (edit.usuario !== undefined ? edit.usuario : row.profeUsuario).toUpperCase(),
          profeClave:    edit.clave   !== undefined ? edit.clave   : row.profeClave,
        };
      }));
      setProfeEdits({});
      setProfesDirty(false);
    }

    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  function agregarProfe() {
    if (!nuevo.usuario.trim() || !nuevo.clave.trim() || !nuevo.nombre.trim()) return;
    const p: Profe = {
      id: uuid(),
      usuario: nuevo.usuario.trim().toUpperCase(),
      clave: nuevo.clave.trim(),
      nombre: nuevo.nombre.trim().toUpperCase(),
      proyectos: [],
    };
    const nuevos = [...profes, p];
    setProfes(nuevos);
    saveProfes(nuevos).catch(() => {}); // persistir el nuevo formador de una vez
    setNuevo({ usuario: '', clave: '', nombre: '' });
    setAgregando(false);
  }

  /** Elimina un formador (botón de borrar en la ventana de formadores). */
  async function eliminarProfe(id: string, usuario: string) {
    if (!confirm(`¿Eliminar al formador "${usuario}"? Esta acción no se puede deshacer.`)) return;
    const nuevos = profes.filter(p => p.id !== id);
    setProfes(nuevos);
    setProyRows(prev => prev.map(r => r.profeId === id ? { ...r, profeId: null, profeUsuario: '', profeClave: '' } : r));
    await deleteProfe(id);
  }

  /** Asigna (o cambia) el formador de un proyecto desde el desplegable de Usuario. */
  function asignarProfe(row: ProyRow, profeId: string) {
    const profe = profes.find(p => p.id === profeId);
    // Actualizar los arreglos de proyectos: quitar este proyecto a todos y dárselo al elegido
    const nuevos = profes.map(p => {
      const sinEste = p.proyectos.filter(pr => pr !== row.proyecto);
      if (profe && p.id === profe.id) return { ...p, proyectos: [...sinEste, row.proyecto] };
      return { ...p, proyectos: sinEste };
    });
    setProfes(nuevos);
    setProfesDirty(true);
    // Actualizar la fila visible
    setProyRows(prev => prev.map(r =>
      (r.programa === row.programa && r.proyecto === row.proyecto)
        ? { ...r, profeId: profe?.id ?? null, profeUsuario: profe?.usuario ?? '', profeClave: profe?.clave ?? '' }
        : r
    ));
    // El nombre del formador se deriva del profe (relación directa), no hace falta fijarlo aquí.
  }

  const programas = useMemo(() => {
    const set = new Set<string>();
    proyRows.forEach(r => { if (r.programa !== '__SIN_PROGRAMA__') set.add(r.programa); });
    return [...set].sort((a, b) => ordenProg(a) - ordenProg(b));
  }, [proyRows]);

  const gruposDisplay = useMemo(() => {
    const filtered = filtroPrograma ? proyRows.filter(r => r.programa === filtroPrograma) : proyRows;
    const map: Record<string, ProyRow[]> = {};
    filtered.forEach(row => {
      const prog = row.programa === '__SIN_PROGRAMA__' ? 'Sin Programa' : row.programa;
      if (!map[prog]) map[prog] = [];
      map[prog].push(row);
    });
    return Object.entries(map).sort(([a], [b]) => ordenProg(a) - ordenProg(b));
  }, [proyRows, filtroPrograma]);

  const hayEdits = Object.keys(metaEdits).length > 0 || Object.keys(profeEdits).length > 0 || profesDirty;
  const G  = '#16a34a';
  const BW = '2px solid white';
  const inputCls = 'w-full bg-transparent outline-none text-[#111827] font-semibold text-[11px] px-1.5 py-1 rounded hover:bg-gray-100 focus:bg-gray-100 transition';

  function toggleAbierto(prog: string) {
    setAbiertos(prev => {
      const n = new Set(prev);
      if (n.has(prog)) n.delete(prog); else n.add(prog);
      return n;
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-usr2" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-usr2)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Información de Proyectos y Formadores</h1>
          <p className="text-white/60 text-xs">{proyRows.length} proyectos · {profes.length} formadores</p>
        </div>
        {!soloLectura && (
        <div className="relative flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setAgregando(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Plus className="w-3.5 h-3.5" /> Nuevo formador
          </button>
          <button onClick={() => setVerFormadores(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Users className="w-3.5 h-3.5" /> Ver formadores
          </button>
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={guardar} disabled={guardando}
              className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl transition shadow-sm ${
                guardado   ? 'bg-white text-green-700'
                : errorGuard ? 'bg-red-500 text-white'
                : 'bg-white text-green-700 hover:bg-gray-100'}`}>
              {guardando ? 'Guardando…' : guardado ? <><CheckCircle className="w-3.5 h-3.5" />¡Guardado!</> : <><Save className="w-3.5 h-3.5" />Guardar cambios</>}
            </button>
            {errorGuard && <span className="text-red-200 text-[9px] max-w-[180px] text-right leading-tight">{errorGuard}</span>}
          </div>
        </div>
        )}
      </header>

      {/* Modal nuevo formador */}
      {agregando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-black text-gray-900 text-lg mb-4">Nuevo formador</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Nombre completo</label>
                <input value={nuevo.nombre}
                  onChange={e => setNuevo(p => ({ ...p, nombre: e.target.value.toUpperCase() }))}
                  placeholder="NOMBRE Y APELLIDOS"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Usuario (apellido)</label>
                <input value={nuevo.usuario}
                  onChange={e => setNuevo(p => ({ ...p, usuario: e.target.value.toUpperCase() }))}
                  placeholder="APELLIDO"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Contraseña</label>
                <input value={nuevo.clave}
                  onChange={e => setNuevo(p => ({ ...p, clave: e.target.value }))}
                  placeholder="Número de cédula"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setAgregando(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={agregarProfe}
                className="flex-1 py-2.5 rounded-xl bg-[#16a34a] text-white text-sm font-bold hover:bg-[#064e1e] transition">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: lista de formadores creados (ver / editar usuario y contraseña) */}
      {verFormadores && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setVerFormadores(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-black text-gray-900 text-lg">Formadores creados</h2>
                <p className="text-xs text-gray-400">{profes.length} formadores · edita nombre, usuario y contraseña</p>
              </div>
              <button onClick={() => setVerFormadores(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {profes.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Aún no hay formadores creados.</p>}
              {[...profes].sort((a, b) => a.usuario.localeCompare(b.usuario, 'es')).map(p => {
                const u = profeEdits[p.id]?.usuario ?? p.usuario;
                const c = profeEdits[p.id]?.clave ?? p.clave;
                const vis = !!claveVis['fm-' + p.id];
                return (
                  <div key={p.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-end gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre completo</label>
                        <input value={profeEdits[p.id]?.nombre ?? nombreDeProfe(p)}
                          onChange={e => setProfeEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], nombre: e.target.value.toUpperCase() } }))}
                          placeholder="NOMBRE Y APELLIDOS"
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <button type="button" onClick={() => eliminarProfe(p.id, p.usuario)}
                        title="Eliminar formador"
                        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Usuario (apellido)</label>
                        <input value={u}
                          onChange={e => setProfeEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], usuario: e.target.value.toUpperCase() } }))}
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contraseña</label>
                        <div className="relative mt-1">
                          <input type={vis ? 'text' : 'password'} value={c}
                            onChange={e => setProfeEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], clave: e.target.value } }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm font-bold text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                          <button type="button" onClick={() => setClaveVis(prev => ({ ...prev, ['fm-' + p.id]: !prev['fm-' + p.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {vis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    {p.proyectos && p.proyectos.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-2 truncate">📋 Proyectos: {p.proyectos.join(', ')}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setVerFormadores(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition">Cerrar</button>
              <button onClick={() => { guardar(); setVerFormadores(false); }} disabled={guardando || !hayEdits}
                className="px-4 py-2 rounded-xl bg-[#16a34a] text-white text-sm font-bold hover:bg-[#064e1e] disabled:opacity-40 transition flex items-center gap-1.5">
                <Save className="w-4 h-4" /> Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="px-3 py-4 space-y-5">

        {/* Filtro programa */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Programa:</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroPrograma('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                !filtroPrograma ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#16a34a]'}`}>
              Todos
            </button>
            {programas.map(p => (
              <button key={p} onClick={() => setFiltroPrograma(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                  filtroPrograma === p ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#16a34a]'}`}>
                {p}
              </button>
            ))}
          </div>

          {/* Toggle Activos / Todos (por defecto: Activos) */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Contar:</span>
            <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setModoConteo('act')}
                className={`px-3 py-1.5 text-xs font-black transition ${modoConteo === 'act' ? 'bg-[#16a34a] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Activos</button>
              <button onClick={() => setModoConteo('tot')}
                className={`px-3 py-1.5 text-xs font-black transition ${modoConteo === 'tot' ? 'bg-[#064e1e] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Todos</button>
            </div>
          </div>
        </div>

        {/* Tabla por programa */}
        {gruposDisplay.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            {cargando ? (
              <p className="text-gray-400 font-semibold text-sm">Cargando proyectos…</p>
            ) : errorCarga ? (
              <div className="space-y-3">
                <p className="text-red-600 font-black text-sm">No se pudo cargar la lista de proyectos.</p>
                <p className="text-gray-500 text-xs max-w-md mx-auto break-words">{errorCarga}</p>
                <button onClick={() => window.location.reload()}
                  className="bg-[#16a34a] text-white font-black text-xs px-4 py-2 rounded-lg hover:bg-[#15803d] transition">
                  Reintentar
                </button>
              </div>
            ) : (
              <p className="text-gray-400 font-semibold text-sm">
                Se leyeron los deportistas, pero ninguno tiene proyecto asignado.<br/>
                Revisa la columna PROY en el consolidado de afiliados.
              </p>
            )}
          </div>
        ) : gruposDisplay.map(([programa, filas]) => {
          const pc = conteos.prog[programa]?.[modoConteo] ?? 0;
          return (
          <div key={programa} className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

            {/* Cabecera programa (título fijo) */}
            <div style={{ background: 'linear-gradient(90deg, #064e1e, #16a34a)' }}
              className="w-full px-5 py-2.5 flex items-center gap-3">
              <span className="text-white font-black text-sm uppercase tracking-widest">{programa}</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {filas.length} proyecto{filas.length !== 1 ? 's' : ''}
              </span>
              <span className="flex-1" />
              <span className="flex items-center gap-1 bg-white/20 text-white text-xs font-black px-2.5 py-0.5 rounded-full flex-shrink-0" title="Deportistas en el programa">
                <Users className="w-3.5 h-3.5" /> {pc}
              </span>
            </div>

            <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
              <table className="w-full border-collapse" style={{ minWidth: 920 }}>
                <thead>
                  <tr>
                    {[
                      { h: 'PROYECTO',         w: 64  },
                      { h: '# DEP',            w: 80  },
                      { h: 'SEDE',             w: 120 },
                      { h: 'EDAD',             w: 120 },
                      { h: 'DÍAS ENTRENO',     w: 180 },
                      { h: 'NOMBRE FORMADOR',  w: 140 },
                      { h: 'USUARIO',          w: 100 },
                      { h: 'CONTRASEÑA',       w: 110 },
                    ].map(({ h, w }) => (
                      <th key={h} style={{ border: BW, minWidth: w, background: G, position: 'sticky', top: 0, zIndex: 2 }}
                        className="px-3 py-2 text-left text-white font-black text-[10px] uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(row => {
                    const sede          = getMetaVal(row, 'sede') as string;
                    const nombreFormador = getMetaVal(row, 'nombreFormador') as string;
                    const dias          = getDias(row);
                    const edades        = getEdades(row);
                    const idVis         = `${row.proyecto}_clave`;
                    const visible       = !!claveVis[idVis];

                    return (
                      <tr key={row.proyecto} style={{ background: '#f1f5f9', borderTop: BW }}>

                        {/* PROYECTO — solo el código, recuadro verde con letra blanca */}
                        <td style={{ border: BW, padding: '4px 6px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 58, height: 34, padding: 0,
                            background: '#16a34a', color: '#fff',
                            fontWeight: 900, fontSize: '1.1rem', lineHeight: 1,
                            borderRadius: 9, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            whiteSpace: 'nowrap',
                          }}>
                            {row.proyecto}
                          </span>
                        </td>

                        {/* # DEP — cantidad de deportistas, recuadro naranja, número blanco grande */}
                        <td style={{ border: BW, padding: '4px 6px', textAlign: 'center' }}>
                          <span title="Deportistas en el grupo" style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 42, height: 34, padding: '0 10px',
                            background: '#f97316', color: '#fff',
                            fontWeight: 900, fontSize: '1.1rem', lineHeight: 1,
                            borderRadius: 9, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          }}>
                            {conteos.proy[`${row.programa}::${row.proyecto}`]?.[modoConteo] ?? 0}
                          </span>
                        </td>

                        {/* SEDE */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <select
                            value={sede}
                            onChange={e => setMetaEdit(row, 'sede', e.target.value)}
                            style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.7rem', color: '#111827', cursor: 'pointer' }}>
                            <option value="">— Sede —</option>
                            {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>

                        {/* EDAD — años de nacimiento de los deportistas del proyecto (automático) */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.72rem', color: '#111827', whiteSpace: 'nowrap' }}>
                            {(aniosProy[row.proyecto] && aniosProy[row.proyecto].length) ? aniosProy[row.proyecto].join(' / ') : '—'}
                          </span>
                        </td>

                        {/* DÍAS ENTRENO */}
                        <td style={{ border: BW, padding: '6px 8px' }}>
                          <div className="flex gap-1 flex-wrap">
                            {DIAS_ORDEN_JS.map((jsDay, i) => {
                              const sel = dias.includes(jsDay);
                              return (
                                <button key={jsDay} onClick={() => toggleDia(row, jsDay)}
                                  className={`w-7 h-7 rounded text-[9px] font-black transition select-none ${
                                    sel ? 'bg-[#16a34a] text-white shadow-sm' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                  }`}>
                                  {DIAS_SEMANA_LABELS[i].slice(0, 2)}
                                </button>
                              );
                            })}
                          </div>
                        </td>

                        {/* NOMBRE FORMADOR — solo lectura (se edita en "Ver formadores") */}
                        <td style={{ border: BW, padding: '8px 12px' }}>
                          {getNombreFormador(row)
                            ? <span className="font-semibold text-[#111827] text-[11px]">{getNombreFormador(row)}</span>
                            : <span className="text-gray-400 text-[10px] italic">— (edítalo en Ver formadores)</span>}
                        </td>

                        {/* USUARIO */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <select
                            value={row.profeId ?? ''}
                            onChange={e => asignarProfe(row, e.target.value)}
                            style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.7rem', color: row.profeId ? '#111827' : '#9ca3af', cursor: 'pointer' }}>
                            <option value="">— Sin asignar —</option>
                            {[...profes].sort((a, b) => a.usuario.localeCompare(b.usuario)).map(p => (
                              <option key={p.id} value={p.id}>{p.usuario}</option>
                            ))}
                          </select>
                        </td>

                        {/* CONTRASEÑA */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          {row.profeId ? (
                            <div className="flex items-center gap-1">
                              <input
                                type={visible ? 'text' : 'password'}
                                value={getProfeVal(row, 'clave')}
                                onChange={e => setProfeEdit(row, 'clave', e.target.value)}
                                placeholder="•••• (vacío = no cambiar)"
                                title="Por seguridad la contraseña no se muestra. Escribe una nueva solo si quieres cambiarla."
                                className={`flex-1 bg-transparent outline-none font-semibold text-[11px] px-1.5 py-1 rounded hover:bg-gray-100 focus:bg-gray-100 transition text-[#111827]`}
                              />
                              <button onClick={() => setClaveVis(v => ({ ...v, [idVis]: !v[idVis] }))}
                                className="text-gray-400 hover:text-gray-600 p-0.5 flex-shrink-0">
                                {visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[10px] italic px-1.5">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          );
        })}

      </main>

      {/* Barra inferior fija con botón Guardar (solo para quien puede editar) */}
      {!soloLectura && (
      <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-gray-500">
          {hayEdits ? '⚠️ Tienes cambios sin guardar' : '✓ Todo guardado'}
        </span>
        <button onClick={guardar} disabled={guardando}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm shadow transition ${
            guardado ? 'bg-green-600 text-white'
            : errorGuard ? 'bg-red-500 text-white'
            : 'bg-[#16a34a] text-white hover:bg-[#064e1e]'}`}>
          {guardando ? 'Guardando…' : guardado ? <><CheckCircle className="w-4 h-4" />¡Guardado!</> : <><Save className="w-4 h-4" />Guardar cambios</>}
        </button>
      </div>
      )}
    </div>
  );
}
