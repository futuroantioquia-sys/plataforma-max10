'use client';

/**
 * Asignación de Proyecto — Futuro Antioquia
 * Muestra TODOS los deportistas sin proyecto asignado.
 * Columnas: CÓDIGO · NOMBRE · AÑO · MES · DÍA · SEDE ESCOGIDA · JORNADA · PROGRAMA ESCOGIDO
 * Panel derecho: selector en cascada PROGRAMA → PROYECTO
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, UserPlus, AlertCircle, Search } from 'lucide-react';
import { getDeportistas, saveDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { cn } from '@/lib/utils';

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(c => rx.test(c));
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
function colJornada(d: Deportista)  { return getCol(d, /^jorn/i); }
function colAno(d: Deportista)      { return getCol(d, /^a[ñn]o$/i); }
function colMes(d: Deportista)      { return getCol(d, /^mes$/i); }
function colDia(d: Deportista)      { return getCol(d, /^d[ií]a$/i) || getCol(d, /^dia_nac/i); }

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

const G_COL   = ['CÓDIGO','NOMBRE','AÑO','MES','DÍA','SEDE ESCOGIDA','JORNADA','PROGRAMA ESCOGIDO'];
const G_STYLE  = { background: '#16a34a', color: 'white', border: '1px solid white', padding: '8px 10px', fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', whiteSpace: 'nowrap' as const, textAlign: 'center' as const };
const R_STYLE  = { background: '#f1f5f9', color: '#374151', border: '1px solid white', padding: '7px 10px', fontSize: 12, whiteSpace: 'nowrap' as const };

export default function AsignacionPage() {
  const router = useRouter();

  const [todos,      setTodos]      = useState<Deportista[]>([]);
  const [programas,  setProgramas]  = useState<Record<string, string[]>>({});
  const [busqueda,   setBusqueda]   = useState('');
  const [selected,   setSelected]   = useState<Deportista | null>(null);
  const [form,       setForm]       = useState<AsignForm>({ programa: '', proyecto: '', proyNuevo: '' });
  const [guardando,  setGuardando]  = useState(false);
  const [exito,      setExito]      = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    getDeportistas().then(lista => {
      setTodos(lista);
      setProgramas(getProgramasExistentes(lista));
    });
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

  function seleccionar(dep: Deportista) {
    setSelected(dep);
    setExito(false);
    setError('');
    const prog = colPrograma(dep).trim();
    setForm({ programa: prog, proyecto: '', proyNuevo: '' });
  }

  function cancelar() { setSelected(null); setExito(false); setError(''); }

  function guardar() {
    if (!selected) return;
    if (!form.programa.trim()) { setError('Selecciona un programa.'); return; }
    const proy = form.proyNuevo.trim() || form.proyecto.trim();
    if (!proy) { setError('Selecciona o escribe un proyecto.'); return; }

    setGuardando(true); setError('');
    try {
      const actualizada = todos.map(d => {
        if (d.id !== selected.id) return d;
        const cols = { ...d._columnas };
        const setCampo = (rx: RegExp, nombre: string, valor: string) => {
          const k = Object.keys(cols).find(c => rx.test(c)) ?? nombre;
          cols[k] = valor;
        };
        setCampo(/^program/i, 'PROGRAMA', form.programa);
        setCampo(/^proy/i,    'PROY',     proy);
        return { ...d, _columnas: cols };
      });
      saveDeportistas(actualizada);
      setTodos(actualizada);
      setProgramas(getProgramasExistentes(actualizada));
      setExito(true);
      setSelected(null);
    } catch { setError('Error al guardar.'); }
    setGuardando(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
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
        <div className="hidden sm:block text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">

        {exito && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-bold text-green-800">Proyecto asignado correctamente.</p>
          </div>
        )}

        {sinProyectoLista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mb-5">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-lg font-black text-gray-700">¡Todo asignado!</h2>
            <p className="text-gray-400 text-sm mt-1">No hay deportistas sin proyecto.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* ── Lista con tabla ── */}
            <div className="xl:col-span-2 space-y-3">

              {/* Buscador */}
              <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2 shadow-sm">
                <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <input type="text" placeholder="Buscar nombre, código o programa..."
                  value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  className="flex-1 text-sm focus:outline-none placeholder:text-gray-300 text-[#111827]" />
              </div>

              {/* Tabla */}
              <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
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
                          <td colSpan={G_COL.length} className="py-10 text-center text-gray-400 font-semibold border border-white">
                            Sin resultados
                          </td>
                        </tr>
                      ) : filtrados.map(dep => {
                        const isSel = selected?.id === dep.id;
                        return (
                          <tr key={dep.id}
                            onClick={() => seleccionar(dep)}
                            className={cn(
                              'cursor-pointer transition-all',
                              isSel ? 'outline outline-2 outline-[#16a34a]' : 'hover:brightness-95'
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
                                : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Panel de asignación ── */}
            <div>
              {!selected ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-10 flex flex-col items-center justify-center text-center h-full min-h-[200px]">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                    <UserPlus className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="font-bold text-gray-500 text-sm">Selecciona un deportista</p>
                  <p className="text-xs text-gray-400 mt-1">de la tabla para asignarle programa y proyecto</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-20">
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
                          <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Programa escogido</span>
                          <span className="bg-[#16a34a] text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{colPrograma(selected)}</span>
                        </div>
                      )}
                      {colSede(selected) && (
                        <div className="flex flex-col items-start">
                          <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Sede</span>
                          <span className="bg-[#1d4ed8] text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{colSede(selected)}</span>
                        </div>
                      )}
                      {colJornada(selected) && (
                        <div className="flex flex-col items-start">
                          <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Jornada</span>
                          <span className="bg-gray-600 text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{colJornada(selected)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-5 space-y-4">
                    {/* PROGRAMA */}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Programa</label>
                      <select value={form.programa}
                        onChange={e => setForm(f => ({ ...f, programa: e.target.value, proyecto: '', proyNuevo: '' }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white font-semibold">
                        <option value="">— Selecciona programa —</option>
                        {Object.keys(programas).sort().map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="__NUEVO_PROG__">+ Nuevo programa…</option>
                      </select>
                      {form.programa === '__NUEVO_PROG__' && (
                        <input type="text" placeholder="Nombre del nuevo programa"
                          className="mt-2 w-full border border-blue-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                          onChange={e => setForm(f => ({ ...f, programa: e.target.value }))} />
                      )}
                    </div>

                    {/* PROYECTO */}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Proyecto</label>
                      <select value={form.proyecto}
                        onChange={e => setForm(f => ({ ...f, proyecto: e.target.value, proyNuevo: '' }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white font-semibold"
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
                          className="mt-2 w-full border border-blue-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]" />
                      )}
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-600 font-medium">{error}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button onClick={cancelar}
                        className="flex-1 border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold py-3 rounded-xl transition text-sm">
                        Cancelar
                      </button>
                      <button onClick={guardar} disabled={guardando}
                        className="flex-1 bg-[#16a34a] hover:bg-[#064e1e] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm">
                        {guardando
                          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <CheckCircle className="w-4 h-4" />}
                        {guardando ? 'Guardando…' : 'Asignar Proyecto'}
                      </button>
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
