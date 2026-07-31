'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const SUPABASE_URL     = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

const HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

interface Producto {
  id:          string;
  tipo:        'torneo' | 'implemento';
  descripcion: string;
  valor:       number;
  activo:      boolean;
  created_at:  string;
}

const TIPO_LABEL: Record<string, string> = {
  torneo:     'Torneo',
  implemento: 'Implemento',
};

const TIPO_COLOR: Record<string, string> = {
  torneo:     'bg-blue-100 text-blue-800',
  implemento: 'bg-purple-100 text-purple-800',
};

function formatPeso(v: number) {
  return '$' + v.toLocaleString('es-CO');
}

export default function ProductosPage() {
  const router   = useRouter();
  const usuario  = useAuthStore(s => s.usuario);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState('');
  const [exito, setExito]         = useState('');

  // Formulario
  const [tipo, setTipo]         = useState<'torneo' | 'implemento'>('torneo');
  const [desc, setDesc]         = useState('');
  const [valor, setValor]       = useState('');
  const [editId, setEditId]     = useState<string | null>(null);

  const esAdmin = usuario?.rol === 'administracion' || usuario?.rol === 'contable';

  useEffect(() => {
    if (usuario && !esAdmin) router.replace('/dashboard');
  }, [usuario, esAdmin, router]);

  useEffect(() => { cargarProductos(); }, []);

  async function cargarProductos() {
    setCargando(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/productos?activo=eq.true&order=created_at.desc`,
        { headers: HEADERS }
      );
      const data = await res.json();
      setProductos(Array.isArray(data) ? data : []);
    } catch { setError('Error cargando productos'); }
    finally { setCargando(false); }
  }

  function limpiarForm() {
    setTipo('torneo'); setDesc(''); setValor(''); setEditId(null);
  }

  async function guardar() {
    if (!desc.trim()) { setError('Escribe una descripción'); return; }
    const num = parseFloat(valor.replace(/[^0-9.]/g, ''));
    if (isNaN(num) || num <= 0) { setError('Ingresa un valor válido'); return; }

    setGuardando(true); setError(''); setExito('');
    try {
      const body = { tipo, descripcion: desc.trim(), valor: num };
      if (editId) {
        await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${editId}`, {
          method: 'PATCH', headers: HEADERS, body: JSON.stringify(body),
        });
        setExito('Producto actualizado');
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/productos`, {
          method: 'POST', headers: HEADERS, body: JSON.stringify(body),
        });
        setExito('Producto creado');
      }
      limpiarForm();
      await cargarProductos();
    } catch { setError('Error al guardar'); }
    finally { setGuardando(false); }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Desactivar este producto?')) return;
    await fetch(`${SUPABASE_URL}/rest/v1/productos?id=eq.${id}`, {
      method: 'PATCH', headers: HEADERS, body: JSON.stringify({ activo: false }),
    });
    await cargarProductos();
  }

  function editar(p: Producto) {
    setEditId(p.id);
    setTipo(p.tipo);
    setDesc(p.descripcion);
    setValor(String(p.valor));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 text-white px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg,#14532d 0%,#166534 100%)' }}>
        <button onClick={() => router.back()}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 className="font-black text-base tracking-wide">PRODUCTOS</h1>
          <p className="text-white/70 text-[11px]">Catálogo de torneos e implementos</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Formulario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100"
            style={{ background: '#f8fafc' }}>
            <h2 className="font-black text-sm text-gray-700 uppercase tracking-wide">
              {editId ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
            </h2>
          </div>
          <div className="p-5 space-y-4">

            {/* Tipo */}
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                Tipo de Producto
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['torneo', 'implemento'] as const).map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    className={cn(
                      'py-3 rounded-xl font-black text-sm transition border-2',
                      tipo === t
                        ? t === 'torneo'
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    )}>
                    {t === 'torneo' ? '🏆 Torneo' : '👟 Implemento'}
                  </button>
                ))}
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                Descripción
              </label>
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Ej: Copa Ciudad 2026, Medias de fútbol..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition"
              />
            </div>

            {/* Valor */}
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                Valor (COP)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                <input
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="0"
                  type="number"
                  min={0}
                  className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm font-semibold text-gray-800 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition"
                />
              </div>
            </div>

            {/* Mensajes */}
            {error && <p className="text-red-600 text-xs font-bold bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {exito && <p className="text-green-700 text-xs font-bold bg-green-50 rounded-lg px-3 py-2">✅ {exito}</p>}

            {/* Botones */}
            <div className="flex gap-2 pt-1">
              {editId && (
                <button onClick={limpiarForm}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-black text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
              )}
              <button onClick={guardar} disabled={guardando}
                className="flex-1 py-3 rounded-xl font-black text-sm text-white transition active:scale-95"
                style={{ background: guardando ? '#9ca3af' : '#16a34a' }}>
                {guardando ? 'Guardando...' : editId ? 'ACTUALIZAR' : 'GUARDAR PRODUCTO'}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de productos */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between"
            style={{ background: '#f8fafc' }}>
            <h2 className="font-black text-sm text-gray-700 uppercase tracking-wide">
              Productos Registrados
            </h2>
            <span className="bg-gray-200 text-gray-600 text-xs font-black px-2 py-1 rounded-full">
              {productos.length}
            </span>
          </div>

          {cargando ? (
            <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
          ) : productos.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No hay productos registrados aún
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {productos.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">{p.descripcion}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full', TIPO_COLOR[p.tipo])}>
                        {TIPO_LABEL[p.tipo]}
                      </span>
                      <span className="text-xs font-black text-[#16a34a]">{formatPeso(p.valor)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => editar(p)}
                      className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition text-blue-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button onClick={() => eliminar(p.id)}
                      className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition text-red-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
