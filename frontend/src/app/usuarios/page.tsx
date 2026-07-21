'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, Plus, Eye, EyeOff } from 'lucide-react';
import { getProfes, saveProfes, getDeportistas } from '@/lib/db';
import type { Profe } from '@/lib/db';

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

const PROFES_INICIALES: Omit<Profe, 'id'>[] = [
  { usuario: 'CASTRO',   clave: '1214734807', proyectos: [] },
  { usuario: 'MEJIA',    clave: '1152192324', proyectos: [] },
  { usuario: 'RAMIREZ',  clave: '1017258984', proyectos: [] },
  { usuario: 'SAMUEL',   clave: '1000415036', proyectos: [] },
  { usuario: 'TABARES',  clave: '1000084856', proyectos: [] },
  { usuario: 'CHALARCA', clave: '1128389946', proyectos: [] },
  { usuario: 'RIOS',     clave: '1036639022', proyectos: [] },
];

export default function UsuariosPage() {
  const router = useRouter();

  const [profes,      setProfes]      = useState<Profe[]>([]);
  const [proyRows,    setProyRows]    = useState<ProyRow[]>([]);
  const [meta,        setMeta]        = useState<Record<string, ProyMeta>>({});
  const [metaEdits,   setMetaEdits]   = useState<Record<string, Partial<ProyMeta>>>({});
  const [profeEdits,  setProfeEdits]  = useState<Record<string, { usuario?: string; clave?: string }>>({});
  const [filtroPrograma, setFiltroPrograma] = useState('');
  const [guardando,   setGuardando]   = useState(false);
  const [guardado,    setGuardado]    = useState(false);
  const [errorGuard,  setErrorGuard]  = useState('');
  const [claveVis,    setClaveVis]    = useState<Record<string, boolean>>({});
  const [agregando,   setAgregando]   = useState(false);
  const [nuevo,       setNuevo]       = useState({ usuario: '', clave: '' });

  useEffect(() => {
    Promise.all([getProfes(), getDeportistas()]).then(([listaProfes, deps]) => {
      const inicial = listaProfes.length
        ? listaProfes
        : PROFES_INICIALES.map(p => ({ ...p, id: uuid() }));
      if (!listaProfes.length) saveProfes(inicial).catch(() => {});
      setProfes(inicial);

      // Construir filas de proyectos desde deportistas
      const map: Record<string, Set<string>> = {};
      deps.forEach(dep => {
        const prog = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
        const proy = getCol(dep, /^proy/i).trim();
        if (!proy) return;
        if (!map[prog]) map[prog] = new Set();
        map[prog].add(proy);
      });

      const rows: ProyRow[] = [];
      Object.entries(map)
        .sort(([a], [b]) => ordenProg(a) - ordenProg(b))
        .forEach(([programa, proySet]) => {
          [...proySet].sort().forEach(proyecto => {
            const profe = inicial.find(p => p.proyectos.includes(proyecto));
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
    });
  }, []);

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
    if (Object.keys(profeEdits).length > 0) {
      const updatedProfes = profes.map(p => {
        const edit = profeEdits[p.id];
        if (!edit) return p;
        return {
          ...p,
          usuario: (edit.usuario !== undefined ? edit.usuario : p.usuario).toUpperCase(),
          clave:    edit.clave   !== undefined ? edit.clave   : p.clave,
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
    }

    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  function agregarProfe() {
    if (!nuevo.usuario.trim() || !nuevo.clave.trim()) return;
    const p: Profe = { id: uuid(), usuario: nuevo.usuario.trim().toUpperCase(), clave: nuevo.clave.trim(), proyectos: [] };
    setProfes(prev => [...prev, p]);
    setNuevo({ usuario: '', clave: '' });
    setAgregando(false);
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

  const hayEdits = Object.keys(metaEdits).length > 0 || Object.keys(profeEdits).length > 0;
  const G  = '#16a34a';
  const BW = '2px solid white';
  const inputCls = 'w-full bg-transparent outline-none text-[#111827] font-semibold text-[11px] px-1.5 py-1 rounded hover:bg-gray-100 focus:bg-gray-100 transition';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
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
        <div className="relative flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setAgregando(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Plus className="w-3.5 h-3.5" /> Nuevo formador
          </button>
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={guardar} disabled={guardando || !hayEdits}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                guardado   ? 'bg-white text-green-700'
                : errorGuard ? 'bg-red-500 text-white'
                : hayEdits   ? 'bg-white/20 hover:bg-white/30 text-white'
                : 'bg-white/10 text-white/40 cursor-not-allowed'}`}>
              {guardando ? 'Guardando…' : guardado ? <><CheckCircle className="w-3.5 h-3.5" />¡Guardado!</> : <><Save className="w-3.5 h-3.5" />Guardar cambios</>}
            </button>
            {errorGuard && <span className="text-red-200 text-[9px] max-w-[180px] text-right leading-tight">{errorGuard}</span>}
          </div>
        </div>
      </header>

      {/* Modal nuevo formador */}
      {agregando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-black text-gray-900 text-lg mb-4">Nuevo formador</h2>
            <div className="space-y-3">
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
        </div>

        {/* Tabla por programa */}
        {gruposDisplay.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <p className="text-gray-400 font-semibold text-sm">No hay proyectos cargados.<br/>Importa el Excel de deportistas primero.</p>
          </div>
        ) : gruposDisplay.map(([programa, filas]) => (
          <div key={programa} className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

            {/* Cabecera programa */}
            <div style={{ background: '#4b5563' }} className="px-5 py-2.5 flex items-center gap-3">
              <span className="text-white font-black text-sm uppercase tracking-widest">{programa}</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {filas.length} proyecto{filas.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 920 }}>
                <thead>
                  <tr style={{ background: G }}>
                    {[
                      { h: 'PROYECTO',         w: 150 },
                      { h: 'SEDE',             w: 120 },
                      { h: 'DÍAS ENTRENO',     w: 180 },
                      { h: 'NOMBRE FORMADOR',  w: 140 },
                      { h: 'USUARIO',          w: 100 },
                      { h: 'CONTRASEÑA',       w: 110 },
                      { h: 'EDAD',             w: 120 },
                    ].map(({ h, w }) => (
                      <th key={h} style={{ border: BW, minWidth: w }}
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

                        {/* PROYECTO */}
                        <td style={{ border: BW, padding: '8px 12px' }}>
                          <span className="font-black text-[#111827] text-[11px]">{row.proyecto}</span>
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

                        {/* NOMBRE FORMADOR */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <input
                            value={nombreFormador}
                            onChange={e => setMetaEdit(row, 'nombreFormador', e.target.value)}
                            placeholder="Nombre completo…"
                            className={inputCls}
                          />
                        </td>

                        {/* USUARIO */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          {row.profeId ? (
                            <input
                              value={getProfeVal(row, 'usuario')}
                              onChange={e => setProfeEdit(row, 'usuario', e.target.value.toUpperCase())}
                              className={inputCls}
                            />
                          ) : (
                            <span className="text-gray-300 text-[10px] italic px-1.5">Sin asignar</span>
                          )}
                        </td>

                        {/* CONTRASEÑA */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          {row.profeId ? (
                            <div className="flex items-center gap-1">
                              <input
                                type={visible ? 'text' : 'password'}
                                value={getProfeVal(row, 'clave')}
                                onChange={e => setProfeEdit(row, 'clave', e.target.value)}
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

                        {/* EDAD */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <select
                            value={edades[0] ?? ''}
                            onChange={e => setMetaEdit(row, 'edades', e.target.value ? [Number(e.target.value)] : [])}
                            style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.7rem', color: '#111827', cursor: 'pointer' }}>
                            <option value="">— Año nac. —</option>
                            {ANIOS_NACIMIENTO.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {hayEdits && (
          <p className="text-center text-xs text-gray-500 font-semibold">
            ⚠️ Tienes cambios sin guardar. Pulsa <strong>Guardar cambios</strong> para actualizar.
          </p>
        )}
      </main>
    </div>
  );
}
