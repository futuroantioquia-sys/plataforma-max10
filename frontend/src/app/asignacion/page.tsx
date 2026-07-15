'use client';

/**
 * Asignación de Proyecto — Futuro Antioquia
 * Panel administrativo para asignar PROGRAMA, PROYECTO y CÓDIGO
 * a deportistas nuevos que llenaron el formulario de afiliación.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, UserPlus, AlertCircle, ChevronRight, Search } from 'lucide-react';
import { getDeportistas, saveDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { cn } from '@/lib/utils';

// Helpers
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(c => rx.test(c));
  return k ? dep._columnas[k] ?? '' : '';
}
function colEstado(d: Deportista)   { return getCol(d, /^estado/i); }
function colPrograma(d: Deportista) { return getCol(d, /^program/i); }
function colProy(d: Deportista)     { return getCol(d, /^proy/i); }
function colCodigo(d: Deportista)   { return getCol(d, /^c[oó]d/i); }
function colSede(d: Deportista)     { return getCol(d, /^sede/i); }
function colJornada(d: Deportista)  { return getCol(d, /^jorn/i); }

// Un deportista pendiente es nuevo (sin código asignado aún)
function esPendiente(d: Deportista): boolean {
  return !colCodigo(d).trim() && d.id.startsWith('nuevo_');
}

// Obtener lista única de programas y proyectos del sistema
function getProgramasExistentes(todos: Deportista[]): Record<string, string[]> {
  const mapa: Record<string, Set<string>> = {};
  todos.filter(d => !esPendiente(d)).forEach(d => {
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
  programa:    string;
  proyecto:    string;
  proyNuevo:   string; // si quiere crear proyecto nuevo
  codigo:      string;
  estado:      string;
};

// ─────────────────────────────────────────────────────────────
export default function AsignacionPage() {
  const router = useRouter();
  const [todos,       setTodos]       = useState<Deportista[]>([]);
  const [pendientes,  setPendientes]  = useState<Deportista[]>([]);
  const [programas,   setProgramas]   = useState<Record<string, string[]>>({});
  const [busqueda,    setBusqueda]    = useState('');
  const [selected,    setSelected]    = useState<Deportista | null>(null);
  const [form,        setForm]        = useState<AsignForm>({ programa:'', proyecto:'', proyNuevo:'', codigo:'', estado:'1. Nuevo' });
  const [guardando,   setGuardando]   = useState(false);
  const [exito,       setExito]       = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    getDeportistas().then(lista => {
      setTodos(lista);
      setPendientes(lista.filter(esPendiente));
      setProgramas(getProgramasExistentes(lista));
    });
  }, []);

  function seleccionar(dep: Deportista) {
    setSelected(dep);
    setExito(false);
    setError('');
    // Pre-llenar programa desde los datos del deportista (si ya lo escogió en el formulario)
    const progExistente = colPrograma(dep).trim();
    setForm({ programa: progExistente, proyecto:'', proyNuevo:'', codigo:'', estado:'1. Nuevo' });
  }

  function cancelar() { setSelected(null); setExito(false); setError(''); }

  function guardar() {
    if (!selected) return;
    if (!form.programa.trim())                        { setError('Selecciona un programa.'); return; }
    const proy = form.proyNuevo.trim() || form.proyecto.trim();
    if (!proy)                                        { setError('Selecciona o escribe un proyecto.'); return; }
    if (!form.codigo.trim())                          { setError('Asigna un código al deportista.'); return; }

    setGuardando(true); setError('');
    try {
      const lista: Deportista[] = todos;

      const actualizada = lista.map(d => {
        if (d.id !== selected.id) return d;
        const cols = { ...d._columnas };

        // Buscar clave real de cada columna o crear una nueva
        const setCampo = (rx: RegExp, nombre: string, valor: string) => {
          const k = Object.keys(cols).find(c => rx.test(c)) ?? nombre;
          cols[k] = valor;
        };

        setCampo(/^program/i,  'PROGRAMA', form.programa);
        setCampo(/^proy/i,     'PROY',     proy);
        setCampo(/^c[oó]d/i,   'CODIGO',   form.codigo);
        setCampo(/^estado/i,   'ESTADO',   form.estado);

        return {
          ...d,
          id: d.id, // mantiene el id interno
          _columnas: cols,
        };
      });

      saveDeportistas(actualizada);
      setTodos(actualizada);
      setPendientes(actualizada.filter(esPendiente));
      setProgramas(getProgramasExistentes(actualizada));
      setExito(true);
      setSelected(null);
    } catch { setError('Error al guardar. Intenta de nuevo.'); }
    setGuardando(false);
  }

  const filtrados = pendientes.filter(d =>
    !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  // ── RENDER ─────────────────────────────────────────────────
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
          <p className="text-[10px] text-white/60">Deportistas nuevos pendientes de asignar</p>
        </div>
        <span className="text-xs font-bold bg-white/20 text-white px-3 py-1 rounded-full">
          {pendientes.length} pendientes
        </span>
        <div className="ml-auto text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Éxito global */}
        {exito && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-bold text-green-800">Deportista asignado correctamente. Ahora aparece en su programa y proyecto.</p>
          </div>
        )}

        {pendientes.length === 0 ? (
          /* Sin pendientes */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center mb-5">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-lg font-black text-gray-700">Sin pendientes</h2>
            <p className="text-gray-400 text-sm mt-1">
              No hay deportistas nuevos esperando asignación.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* ── Lista pendientes ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2 shadow-sm">
                <Search className="w-3.5 h-3.5 text-gray-300" />
                <input type="text" placeholder="Buscar deportista..." value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="flex-1 text-xs focus:outline-none placeholder:text-gray-300" />
              </div>

              {filtrados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Sin resultados</p>
              )}

              {filtrados.map(dep => {
                const doc     = dep._columnas['DOCUMENTO'] ?? dep._columnas['DOCUMENTO_INGRESO'] ?? '—';
                const prog    = colPrograma(dep);
                const sede    = colSede(dep);
                const jornada = colJornada(dep);
                const isSel   = selected?.id === dep.id;
                return (
                  <button key={dep.id} onClick={() => seleccionar(dep)}
                    className={cn(
                      'w-full text-left rounded-2xl border-2 p-4 transition-all',
                      isSel
                        ? 'border-[#16a34a] bg-[#f0fdf4] shadow-md'
                        : 'border-gray-100 bg-white hover:border-green-300 hover:shadow-sm'
                    )}>
                    <div className="flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                        isSel ? 'bg-[#dcfce7]' : 'bg-[#dbeafe]')}>
                        <UserPlus className={cn('w-5 h-5', isSel ? 'text-[#16a34a]' : 'text-[#1d4ed8]')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-gray-900 text-sm truncate">{dep._nombre}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">Doc: {doc}</p>
                        {/* Programa, Sede, Jornada */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {prog && (
                            <span className="bg-[#16a34a] text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                              {prog}
                            </span>
                          )}
                          {sede && (
                            <span className="bg-[#1d4ed8] text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                              {sede}
                            </span>
                          )}
                          {jornada && (
                            <span className="bg-gray-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                              {jornada}
                            </span>
                          )}
                          {!prog && !sede && !jornada && (
                            <span className="text-[10px] text-gray-400 italic">Sin datos de programa/sede</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={cn('w-4 h-4 flex-shrink-0 mt-1 transition-colors',
                        isSel ? 'text-[#16a34a]' : 'text-gray-300')} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Panel de asignación ── */}
            <div>
              {!selected ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-10 flex flex-col items-center justify-center text-center h-full">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                    <UserPlus className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="font-bold text-gray-500 text-sm">Selecciona un deportista</p>
                  <p className="text-xs text-gray-400 mt-1">para asignarle programa, proyecto y código</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Cabecera */}
                  <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-5 py-4">
                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Asignando a</p>
                    <p className="text-white font-black text-lg leading-tight">{selected._nombre}</p>
                  </div>

                  {/* Badges: Programa, Sede, Jornada */}
                  {(() => {
                    const prog    = colPrograma(selected);
                    const sede    = colSede(selected);
                    const jornada = colJornada(selected);
                    if (!prog && !sede && !jornada) return null;
                    return (
                      <div className="px-5 py-3 bg-[#f0fdf4] border-b border-green-100 flex flex-wrap gap-2">
                        {prog && (
                          <div className="flex flex-col items-start">
                            <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Programa</span>
                            <span className="bg-[#16a34a] text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{prog}</span>
                          </div>
                        )}
                        {sede && (
                          <div className="flex flex-col items-start">
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Sede</span>
                            <span className="bg-[#1d4ed8] text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{sede}</span>
                          </div>
                        )}
                        {jornada && (
                          <div className="flex flex-col items-start">
                            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Jornada</span>
                            <span className="bg-gray-600 text-white text-xs font-black px-3 py-1 rounded-lg mt-0.5">{jornada}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Datos del formulario de afiliación */}
                  <div className="px-5 py-3 bg-[#eff6ff] border-b border-blue-100">
                    <p className="text-[10px] font-bold text-[#1e3a8a] uppercase tracking-wide mb-2">Datos registrados</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {['DOCUMENTO','FECHA_NAC','AÑO','MES','DÍA','TELEFONO','EMAIL','ACUDIENTE','BARRIO','MUNICIPIO','POSICION']
                        .map(k => {
                          const v = selected._columnas[k] ?? '';
                          if (!v) return null;
                          return (
                            <div key={k}>
                              <span className="text-[10px] text-[#1d4ed8] font-bold uppercase">{k.replace(/_/g,' ')}: </span>
                              <span className="text-[11px] text-gray-700">{v}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Formulario de asignación */}
                  <div className="p-5 space-y-4">
                    {/* PROGRAMA */}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Programa
                      </label>
                      <select value={form.programa}
                        onChange={e => setForm(f => ({ ...f, programa: e.target.value, proyecto: '', proyNuevo: '' }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white">
                        <option value="">— Selecciona programa —</option>
                        {Object.keys(programas).sort().map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="__NUEVO_PROG__">+ Nuevo programa...</option>
                      </select>
                      {form.programa === '__NUEVO_PROG__' && (
                        <input type="text" placeholder="Nombre del nuevo programa"
                          className="mt-2 w-full border border-blue-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                          onChange={e => setForm(f => ({ ...f, programa: e.target.value }))} />
                      )}
                    </div>

                    {/* PROYECTO */}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Proyecto
                      </label>
                      <select value={form.proyecto}
                        onChange={e => setForm(f => ({ ...f, proyecto: e.target.value, proyNuevo: '' }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                        disabled={!form.programa || form.programa === '__NUEVO_PROG__'}>
                        <option value="">— Selecciona proyecto —</option>
                        {(programas[form.programa] ?? []).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        <option value="__NUEVO_PROY__">+ Nuevo proyecto...</option>
                      </select>
                      {form.proyecto === '__NUEVO_PROY__' && (
                        <input type="text" placeholder="Nombre del nuevo proyecto"
                          value={form.proyNuevo}
                          onChange={e => setForm(f => ({ ...f, proyNuevo: e.target.value }))}
                          className="mt-2 w-full border border-blue-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]" />
                      )}
                    </div>

                    {/* CÓDIGO */}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Código del deportista
                      </label>
                      <input type="text" placeholder="Ej: FA-2025-089"
                        value={form.codigo}
                        onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] font-mono" />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Este código es el identificador definitivo del deportista en el sistema.
                      </p>
                    </div>

                    {/* ESTADO */}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Estado
                      </label>
                      <select value={form.estado}
                        onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white">
                        <option value="1. Nuevo">1. Nuevo</option>
                        <option value="2. Antiguo">2. Antiguo</option>
                        <option value="3. Sin Afiliación">3. Sin Afiliación</option>
                      </select>
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
                        {guardando ? 'Guardando...' : 'Confirmar asignación'}
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
