'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  DirectorioFinanzas — tabla editable para NÓMINA y PROVEEDORES.
//  Columnas: nombre, documento, cuenta, banco. Edición en línea (se guarda al
//  salir de la casilla). Agregar / eliminar / buscar. Datos en Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Fila = { id: string; nombre: string; documento: string; cuenta: string; banco: string };

export function DirectorioFinanzas({
  tabla, titulo, subtitulo, docLabel, pestanas,
}: {
  tabla: 'nomina' | 'proveedores';
  titulo: string;
  subtitulo: string;
  docLabel: string;
  /** Selector opcional que se dibuja arriba de la tabla. Lo usa el módulo
   *  unificado "Nómina y Proveedores" para cambiar de directorio. */
  pestanas?: React.ReactNode;
}) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [estadoGuardado, setEstadoGuardado] = useState<'idle' | 'guardando' | 'ok'>('idle');

  async function cargar() {
    setCargando(true);
    const { data, error } = await sb.from(tabla).select('id,nombre,documento,cuenta,banco').order('nombre');
    if (error) console.error(`[${tabla}] cargar:`, error.message);
    setFilas((data as Fila[]) ?? []);
    setCargando(false);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [tabla]);

  async function agregar() {
    setGuardando(true);
    const { data, error } = await sb.from(tabla)
      .insert({ nombre: '', documento: '', cuenta: '', banco: '' })
      .select('id,nombre,documento,cuenta,banco').single();
    setGuardando(false);
    if (error) { console.error(`[${tabla}] agregar:`, error.message); return; }
    if (data) setFilas(prev => [data as Fila, ...prev]);
  }

  function editarLocal(id: string, campo: keyof Fila, val: string) {
    setFilas(prev => prev.map(f => (f.id === id ? { ...f, [campo]: val } : f)));
  }

  async function guardarCampo(id: string, campo: keyof Fila, val: string) {
    const { error } = await sb.from(tabla).update({ [campo]: val }).eq('id', id);
    if (error) console.error(`[${tabla}] guardar ${campo}:`, error.message);
  }

  async function guardarTodo() {
    setEstadoGuardado('guardando');
    const payload = filas.map(f => ({
      id: f.id, nombre: f.nombre, documento: f.documento, cuenta: f.cuenta, banco: f.banco,
    }));
    const { error } = await sb.from(tabla).upsert(payload);
    if (error) { console.error(`[${tabla}] guardarTodo:`, error.message); setEstadoGuardado('idle'); return; }
    setEstadoGuardado('ok');
    setTimeout(() => setEstadoGuardado('idle'), 2200);
  }

  async function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre || 'este registro'}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await sb.from(tabla).delete().eq('id', id);
    if (error) { console.error(`[${tabla}] eliminar:`, error.message); return; }
    setFilas(prev => prev.filter(f => f.id !== id));
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(f => `${f.nombre} ${f.documento} ${f.cuenta} ${f.banco}`.toLowerCase().includes(q));
  }, [filas, busqueda]);

  const th: React.CSSProperties = { background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '8px 10px', fontSize: 11, fontWeight: 900, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', position: 'sticky', top: 0, zIndex: 2 };
  const tdIn: React.CSSProperties = { width: '100%', background: 'transparent', outline: 'none', fontSize: 13, color: '#111827', padding: '2px 4px', border: '1px solid transparent', borderRadius: 6 };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-white/80 hover:text-white text-sm font-bold flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div>
            <h1 className="text-white font-black text-lg leading-none">{titulo}</h1>
            <p className="text-white/60 text-[11px] mt-0.5">{subtitulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/80 text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full">
            {filas.length} registro{filas.length === 1 ? '' : 's'}
          </span>
          <button onClick={guardarTodo} disabled={estadoGuardado === 'guardando'}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm shadow transition ${
              estadoGuardado === 'ok' ? 'bg-emerald-400 text-[#052a10]' : 'bg-white text-[#064e1e] hover:bg-gray-100'
            } disabled:opacity-70`}>
            💾 {estadoGuardado === 'guardando' ? 'Guardando…' : estadoGuardado === 'ok' ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {pestanas}
        {/* Barra: buscar + agregar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              placeholder={`Buscar por nombre, ${docLabel.toLowerCase()}, cuenta o banco…`}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]"
            />
          </div>
          <button onClick={agregar} disabled={guardando}
            className="flex items-center gap-2 bg-[#16a34a] text-white font-black px-5 py-2.5 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
            <Plus className="w-4 h-4" /> {guardando ? 'Agregando…' : 'Agregar'}
          </button>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: '72vh' }}>
            <table className="w-full border-collapse" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: '34%' }}>Nombre</th>
                  <th style={{ ...th, width: '20%' }}>{docLabel}</th>
                  <th style={{ ...th, width: '22%' }}>Cuenta</th>
                  <th style={{ ...th, width: '18%' }}>Banco</th>
                  <th style={{ ...th, width: '6%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400 font-semibold">Cargando…</td></tr>
                ) : visibles.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400 font-semibold">
                    {busqueda ? 'Ningún registro coincide con la búsqueda.' : 'Aún no hay registros. Usa “Agregar”.'}
                  </td></tr>
                ) : visibles.map((f, i) => (
                  <tr key={f.id} style={{ background: i % 2 ? '#f8fafc' : '#fff', borderTop: '1px solid #eef2f7' }}>
                    <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                      <input value={f.nombre} placeholder="Nombre completo"
                        onChange={e => editarLocal(f.id, 'nombre', e.target.value.toUpperCase())}
                        onBlur={e => guardarCampo(f.id, 'nombre', e.target.value.toUpperCase())}
                        style={{ ...tdIn, fontWeight: 700 }} />
                    </td>
                    <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                      <input value={f.documento} placeholder={docLabel} inputMode="numeric"
                        onChange={e => editarLocal(f.id, 'documento', e.target.value)}
                        onBlur={e => guardarCampo(f.id, 'documento', e.target.value)}
                        style={tdIn} />
                    </td>
                    <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                      <input value={f.cuenta} placeholder="N° de cuenta o Titular Nequi"
                        onChange={e => editarLocal(f.id, 'cuenta', e.target.value)}
                        onBlur={e => guardarCampo(f.id, 'cuenta', e.target.value)}
                        style={tdIn} />
                    </td>
                    <td style={{ padding: '4px 8px', borderRight: '1px solid #f1f5f9' }}>
                      <input value={f.banco} placeholder="Banco / Nequi"
                        onChange={e => editarLocal(f.id, 'banco', e.target.value)}
                        onBlur={e => guardarCampo(f.id, 'banco', e.target.value)}
                        style={tdIn} />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button onClick={() => eliminar(f.id, f.nombre)} title="Eliminar"
                        className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 mt-3">
          💡 Los cambios se guardan solos al salir de cada casilla. La cuenta y el banco sirven para relacionar los pagos del libro dinámico.
        </p>
      </main>
    </div>
  );
}
