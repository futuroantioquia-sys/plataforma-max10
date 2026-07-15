'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, Users, ClipboardList, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { getDeportistas, saveDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';

const PROYECTOS_META_KEY = 'futuro_proyectos_meta';

const CAL_OPTIONS = ['', ...Array.from({ length: 46 }, (_, i) => ((i + 5) / 10).toFixed(1))];

const ORDEN_PROGRAMA = [
  'Estimulación','Formación','Progresión',
  'Pre-Progresión','Selección','Desarrollo',
];

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k.trim()));
  return k ? (dep._columnas[k] ?? '') : '';
}

function ordenProg(p: string) {
  const i = ORDEN_PROGRAMA.findIndex(x => x.toLowerCase() === p.trim().toLowerCase());
  return i >= 0 ? i : 999;
}

interface ProyMeta { horario: string; calificacion: string; }

interface ProyRow {
  programa:      string;
  proyecto:      string;
  profe:         string;
  sede:          string;
  jornada:       string;
  horario:       string;
  calificacion:  string;
  count:         number;
  deps:          Deportista[];
}

export default function GestionProyectosPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [meta,        setMeta]        = useState<Record<string, ProyMeta>>({});
  const [edits,       setEdits]       = useState<Record<string, Partial<ProyRow>>>({});
  const [guardado,    setGuardado]    = useState(false);
  const [tab,         setTab]         = useState<'proyectos'|'sedes'>('proyectos');

  // Acordeón sedes: set de claves abiertas "programa::sede"
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    getDeportistas().then(lista => { if (lista.length) setDeportistas(lista); });
    try {
      const rawMeta = localStorage.getItem(PROYECTOS_META_KEY);
      if (rawMeta) setMeta(JSON.parse(rawMeta));
    } catch {}
  }, []);

  // ── Filas por programa/proyecto ──────────────────────────────────
  const grupos = useMemo(() => {
    const map: Record<string, Record<string, Deportista[]>> = {};
    deportistas.forEach(dep => {
      const prog = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
      const proy = getCol(dep, /^proyecto/i).trim() || '__SIN_PROYECTO__';
      if (!map[prog]) map[prog] = {};
      if (!map[prog][proy]) map[prog][proy] = [];
      map[prog][proy].push(dep);
    });

    return Object.entries(map)
      .sort(([a], [b]) => ordenProg(a) - ordenProg(b))
      .map(([programa, proyMap]) => {
        const filas: ProyRow[] = Object.entries(proyMap)
          .sort(([a], [b]) => a.localeCompare(b, 'es'))
          .map(([proyecto, deps]) => {
            const k = `${programa}::${proyecto}`;
            return {
              programa,
              proyecto,
              profe:   getCol(deps[0], /^prof/i),
              sede:    getCol(deps[0], /^sede/i),
              jornada: getCol(deps[0], /^jornada/i),
              horario:      meta[k]?.horario      ?? '',
              calificacion: meta[k]?.calificacion ?? '',
              count:   deps.length,
              deps,
            };
          });
        return { programa, filas };
      });
  }, [deportistas, meta]);

  // ── Agrupación Programa → Sede → Proyectos (para tab Sedes) ─────
  const sedesGrupos = useMemo(() => {
    // map: programa → sede → ProyRow[]
    const map: Record<string, Record<string, ProyRow[]>> = {};
    grupos.forEach(({ programa, filas }) => {
      filas.forEach(row => {
        const sede = row.sede.trim() || 'Sin Sede';
        if (!map[programa]) map[programa] = {};
        if (!map[programa][sede]) map[programa][sede] = [];
        map[programa][sede].push(row);
      });
    });
    return Object.entries(map)
      .sort(([a], [b]) => ordenProg(a) - ordenProg(b))
      .map(([programa, sedeMap]) => ({
        programa,
        sedes: Object.entries(sedeMap).sort(([a], [b]) => a.localeCompare(b, 'es')),
      }));
  }, [grupos]);

  // ── Helpers ────────────────────────────────────────────────────
  function key(row: ProyRow) { return `${row.programa}::${row.proyecto}`; }

  function val(row: ProyRow, field: keyof ProyRow): string {
    const e = edits[key(row)];
    if (e && e[field] !== undefined) return String(e[field]);
    return String(row[field] ?? '');
  }

  function set(row: ProyRow, field: keyof ProyRow, value: string) {
    setEdits(prev => ({ ...prev, [key(row)]: { ...prev[key(row)], [field]: value } }));
  }

  function toggleAbierto(k: string) {
    setAbiertos(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  const hayEdits = Object.keys(edits).length > 0;

  // ── Guardar ────────────────────────────────────────────────────
  function guardar() {
    const updated = deportistas.map(dep => {
      const prog = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
      const proy = getCol(dep, /^proyecto/i).trim() || '__SIN_PROYECTO__';
      const k    = `${prog}::${proy}`;
      const e    = edits[k];
      if (!e) return dep;

      const cols = { ...dep._columnas };
      if (e.profe !== undefined) {
        const pk = Object.keys(cols).find(c => /^prof/i.test(c.trim()));
        if (pk) cols[pk] = e.profe as string;
      }
      if (e.sede !== undefined) {
        const sk = Object.keys(cols).find(c => /^sede/i.test(c.trim()));
        if (sk) cols[sk] = e.sede as string;
      }
      if (e.jornada !== undefined) {
        const jk = Object.keys(cols).find(c => /^jornada/i.test(c.trim()));
        if (jk) cols[jk] = e.jornada as string;
      }
      return { ...dep, _columnas: cols };
    });

    const newMeta = { ...meta };
    Object.entries(edits).forEach(([k, e]) => {
      if (e.horario !== undefined || e.calificacion !== undefined) {
        newMeta[k] = {
          ...(newMeta[k] ?? {}),
          ...(e.horario      !== undefined ? { horario:      e.horario      as string } : {}),
          ...(e.calificacion !== undefined ? { calificacion: e.calificacion as string } : {}),
        };
      }
    });

    saveDeportistas(updated).catch(console.error);
    localStorage.setItem(PROYECTOS_META_KEY, JSON.stringify(newMeta));
    setDeportistas(updated);
    setMeta(newMeta);
    setEdits({});
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  // ── Estilos ────────────────────────────────────────────────────
  const AZUL  = '#4b5563';
  const AZULM = '#4b5563';
  const G     = '#16a34a';
  const inputCls = 'w-full bg-transparent outline-none text-[#111827] font-semibold text-sm px-2 py-1.5 rounded-lg hover:bg-gray-100 focus:bg-gray-100 transition placeholder-gray-300';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.10]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-proy" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-proy)"/>
          </svg>
        </div>

        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Disponibilidad, Sedes y Horarios</h1>
          <p className="text-white/60 text-xs">Programas · Proyectos · Formadores · Sedes</p>
        </div>

        <button onClick={guardar} disabled={!hayEdits}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition ${
            guardado
              ? 'bg-green-400 text-white'
              : hayEdits
              ? 'bg-white text-[#16a34a] hover:bg-green-50 shadow'
              : 'bg-white/20 text-white/40 cursor-not-allowed'
          }`}>
          {guardado
            ? <><CheckCircle className="w-4 h-4" /> Guardado</>
            : <><Save className="w-4 h-4" /> Guardar cambios</>}
        </button>

        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="px-4 pt-4 flex gap-2">
        {(['proyectos', 'sedes'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl font-bold text-sm transition border ${
              tab === t
                ? 'bg-[#16a34a] text-white border-[#16a34a] shadow'
                : 'bg-white text-[#111827] border-gray-200 hover:bg-gray-50'
            }`}>
            {t === 'proyectos' ? 'Proyectos' : 'Sedes'}
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <main className="px-3 py-4 space-y-6">

        {grupos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <ClipboardList className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">No hay deportistas cargados.</p>
            <p className="text-gray-300 text-sm mt-1">Importa el Excel desde el módulo de Deportistas.</p>
          </div>

        ) : tab === 'proyectos' ? (
          /* ══ TAB PROYECTOS ══ */
          grupos.map(({ programa, filas }) => (
            <div key={programa} className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div style={{ background: AZUL }} className="px-5 py-3 flex items-center gap-3">
                <span className="text-white font-black text-sm uppercase tracking-widest">
                  {programa === '__SIN_PROGRAMA__' ? 'Sin Programa' : programa}
                </span>
                <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {filas.reduce((s, f) => s + f.count, 0)} deportistas
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ background: G }}>
                      <th style={{ border: '2px solid white' }} className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">Proyecto</th>
                      <th style={{ border: '2px solid white' }} className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">Formador / Profe</th>
                      <th style={{ border: '2px solid white' }} className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">Sede</th>
                      <th style={{ border: '2px solid white' }} className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">Días de Entrenamiento</th>
                      <th style={{ border: '2px solid white' }} className="px-4 py-2.5 text-left text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">Horario</th>
                      <th style={{ border: '2px solid white', background: '#1d4ed8' }} className="px-4 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">CAL</th>
                      <th style={{ border: '2px solid white', background: '#4b5563' }} className="px-4 py-2.5 text-center text-white font-black text-xs uppercase tracking-wider whitespace-nowrap">
                        <Users className="w-3.5 h-3.5 inline mr-1" />Deportistas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((row, idx) => {
                      const esEditado = !!edits[key(row)];
                      return (
                        <tr key={row.proyecto}
                          style={{ background: '#f1f5f9', borderTop: '2px solid white' }}
                          className="transition">
                          <td className="px-4 py-2 font-black text-[#111827] whitespace-nowrap" style={{ border: '2px solid white' }}>
                            {row.proyecto === '__SIN_PROYECTO__' ? '— Sin Proyecto —' : row.proyecto}
                          </td>
                          <td className="px-2 py-1 min-w-[160px]" style={{ border: '2px solid white' }}>
                            <input value={val(row, 'profe')} onChange={e => set(row, 'profe', e.target.value)}
                              placeholder="Nombre del formador…" className={inputCls} />
                          </td>
                          <td className="px-2 py-1 min-w-[160px]" style={{ border: '2px solid white' }}>
                            <input value={val(row, 'sede')} onChange={e => set(row, 'sede', e.target.value)}
                              placeholder="Sede…" className={inputCls} />
                          </td>
                          <td className="px-2 py-1 min-w-[180px]" style={{ border: '2px solid white' }}>
                            <input value={val(row, 'jornada')} onChange={e => set(row, 'jornada', e.target.value)}
                              placeholder="Ej: Lunes y Miércoles…" className={inputCls} />
                          </td>
                          <td className="px-2 py-1 min-w-[140px]" style={{ border: '2px solid white' }}>
                            <input value={val(row, 'horario')} onChange={e => set(row, 'horario', e.target.value)}
                              placeholder="Ej: 8:00 - 10:00 am…" className={inputCls} />
                          </td>
                          <td className="px-2 py-1 text-center" style={{ border: '2px solid white', minWidth: '80px' }}>
                            {(() => {
                              const calVal = val(row, 'calificacion');
                              const calNum = parseFloat(calVal);
                              const calColor = !calVal ? '#9ca3af' : calNum >= 4.5 ? '#16a34a' : calNum >= 3.0 ? '#f59e0b' : '#ef4444';
                              return (
                                <select
                                  value={calVal}
                                  onChange={e => set(row, 'calificacion', e.target.value)}
                                  style={{ color: calColor, fontWeight: 900, fontSize: '0.8rem', background: 'transparent', outline: 'none', cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                                  {CAL_OPTIONS.map(v => (
                                    <option key={v} value={v}>{v || '—'}</option>
                                  ))}
                                </select>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-2 text-center whitespace-nowrap" style={{ background: '#f1f5f9', border: '2px solid white' }}>
                            <span className="inline-flex items-center gap-1 font-black text-[#111827] text-base">{row.count}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))

        ) : (
          /* ══ TAB SEDES ══ */
          sedesGrupos.map(({ programa, sedes }) => {
            const progLabel = programa === '__SIN_PROGRAMA__' ? 'Sin Programa' : programa;
            const totalDep  = sedes.reduce((s, [, rows]) => s + rows.reduce((ss, r) => ss + r.count, 0), 0);

            return (
              <div key={programa} className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

                {/* Cabecera programa */}
                <div style={{ background: AZUL }} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-white font-black text-sm uppercase tracking-widest">{progLabel}</span>
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {sedes.length} sede{sedes.length !== 1 ? 's' : ''} · {totalDep} deportistas
                  </span>
                </div>

                {/* Lista de sedes desplegables */}
                <div className="divide-y divide-white">
                  {sedes.map(([sede, filas]) => {
                    const aKey  = `${programa}::${sede}`;
                    const open  = abiertos.has(aKey);
                    const total = filas.reduce((s, r) => s + r.count, 0);

                    return (
                      <div key={sede}>
                        {/* Cabecera sede — clickeable */}
                        <button
                          onClick={() => toggleAbierto(aKey)}
                          className="w-full flex items-center gap-3 px-5 py-3 bg-[#f1f5f9] hover:bg-[#e2e8f0] transition text-left">
                          <MapPin className="w-4 h-4 text-[#16a34a] flex-shrink-0" />
                          <span className="flex-1 font-black text-[#111827] text-sm">{sede}</span>
                          <span className="text-xs text-[#4b5563] font-semibold mr-2">
                            {filas.length} proyecto{filas.length !== 1 ? 's' : ''} · {total} deportistas
                          </span>
                          {open
                            ? <ChevronDown  className="w-4 h-4 text-[#4b5563]" />
                            : <ChevronRight className="w-4 h-4 text-[#4b5563]" />}
                        </button>

                        {/* Proyectos de la sede */}
                        {open && (
                          <div className="bg-white">
                            <table className="w-full border-collapse text-sm">
                              <thead>
                                <tr style={{ background: G }}>
                                  <th style={{ border: '2px solid white' }} className="px-4 py-2 text-left text-white font-black text-xs uppercase tracking-wider">Proyecto</th>
                                  <th style={{ border: '2px solid white' }} className="px-4 py-2 text-left text-white font-black text-xs uppercase tracking-wider">Formador</th>
                                  <th style={{ border: '2px solid white' }} className="px-4 py-2 text-left text-white font-black text-xs uppercase tracking-wider">Días</th>
                                  <th style={{ border: '2px solid white' }} className="px-4 py-2 text-left text-white font-black text-xs uppercase tracking-wider">Horario</th>
                                  <th style={{ border: '2px solid white', background: '#4b5563' }} className="px-4 py-2 text-center text-white font-black text-xs uppercase tracking-wider">
                                    <Users className="w-3 h-3 inline mr-1" />Dep.
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {filas.map((row, idx) => (
                                  <tr key={row.proyecto}
                                    style={{ background: '#f1f5f9', borderTop: '2px solid white' }}>
                                    <td className="px-4 py-2 font-black text-[#111827] whitespace-nowrap" style={{ border: '2px solid white' }}>
                                      {row.proyecto === '__SIN_PROYECTO__' ? '— Sin Proyecto —' : row.proyecto}
                                    </td>
                                    <td className="px-4 py-2 text-[#111827] whitespace-nowrap" style={{ border: '2px solid white' }}>{row.profe || '—'}</td>
                                    <td className="px-4 py-2 text-[#111827] whitespace-nowrap" style={{ border: '2px solid white' }}>{row.jornada || '—'}</td>
                                    <td className="px-4 py-2 text-[#111827] whitespace-nowrap" style={{ border: '2px solid white' }}>{row.horario || '—'}</td>
                                    <td className="px-4 py-2 text-center font-black text-[#111827]" style={{ background: '#f1f5f9', border: '2px solid white' }}>
                                      {row.count}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {hayEdits && (
          <p className="text-center text-xs text-[#4b5563] font-semibold">
            ⚠️ Tienes cambios sin guardar. Presiona <strong>Guardar cambios</strong> para actualizar toda la plataforma.
          </p>
        )}
      </main>
    </div>
  );
}
