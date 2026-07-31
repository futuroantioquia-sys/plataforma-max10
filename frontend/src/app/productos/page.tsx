'use client';

import { useEffect, useRef, useState } from 'react';
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

  // Carga masiva
  const xlsxRef                           = useRef<HTMLInputElement>(null);
  const [showMasiva, setShowMasiva]       = useState(false);
  const [masivaProd, setMasivaProd]       = useState('');
  const [masivaFilas, setMasivaFilas]     = useState<{ codigo: string; nombre: string; ok: boolean; msg: string }[]>([]);
  const [masivaCargando, setMasivaCargando] = useState(false);
  const [masivaSubiendo, setMasivaSubiendo] = useState(false);
  const [masivaResumen, setMasivaResumen] = useState('');

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

  // ── Carga masiva: leer Excel ───────────────────────────────────────────────
  async function leerExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (xlsxRef.current) xlsxRef.current.value = '';
    setMasivaFilas([]); setMasivaResumen('');

    // Cargar SheetJS desde CDN
    if (!(window as any).XLSX) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => res(); s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const XLSX = (window as any).XLSX;
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

    // Determinar columnas (buscar encabezado CODIGO / NOMBRE)
    // Acepta: fila 1 = encabezados, o sin encabezado (col A = codigo, col B = nombre)
    let startRow = 0;
    let colCod   = 0;
    let colNom   = 1;
    const header = rows[0]?.map((c: any) => String(c).toUpperCase().trim()) ?? [];
    const idxCod = header.findIndex(h => h.includes('COD') || h.includes('ID'));
    const idxNom = header.findIndex(h => h.includes('NOM') || h.includes('ATLETA') || h.includes('DEPORT'));
    if (idxCod >= 0) { startRow = 1; colCod = idxCod; }
    if (idxNom >= 0) { colNom = idxNom; }

    const filas = rows.slice(startRow)
      .filter(r => r[colCod] !== undefined && r[colCod] !== '')
      .map(r => ({
        codigo: String(r[colCod]).trim(),
        nombre: r[colNom] ? String(r[colNom]).trim() : '',
        ok: true,
        msg: '',
      }));

    setMasivaFilas(filas);
  }

  // ── Carga masiva: subir a Supabase ────────────────────────────────────────
  async function subirMasiva() {
    const prod = productos.find(p => p.id === masivaProd);
    if (!prod || masivaFilas.length === 0) return;

    setMasivaSubiendo(true); setMasivaResumen('');
    try {
      // 1. Traer todos los deportistas para resolver código → id
      const resD = await fetch(
        `${SUPABASE_URL}/rest/v1/deportistas?select=id,codigo,nombre&order=nombre.asc`,
        { headers: HEADERS }
      );
      const deportistas: { id: string; codigo: string; nombre: string }[] =
        await resD.json();

      // Mapa código → deportista
      const porCodigo = new Map(deportistas.map(d => [String(d.codigo).trim(), d]));

      let ok = 0; let err = 0;
      const filasActualizadas = [...masivaFilas];

      for (let i = 0; i < filasActualizadas.length; i++) {
        const fila = filasActualizadas[i];
        const dep  = porCodigo.get(fila.codigo);

        if (!dep) {
          filasActualizadas[i] = { ...fila, ok: false, msg: 'Código no encontrado' };
          err++;
          continue;
        }

        const body = {
          deportista_id: dep.id,
          producto_id:   prod.id,
          descripcion:   prod.descripcion,
          tipo:          prod.tipo,
          valor:         prod.valor,
          estado:        'PEND',
        };
        const r = await fetch(`${SUPABASE_URL}/rest/v1/otros_pagos`, {
          method: 'POST', headers: HEADERS, body: JSON.stringify(body),
        });

        if (r.ok || r.status === 201) {
          filasActualizadas[i] = { ...fila, ok: true, msg: dep.nombre || '✓' };
          ok++;
        } else {
          const txt = await r.text();
          filasActualizadas[i] = { ...fila, ok: false, msg: `Error ${r.status}` };
          err++;
        }
      }

      setMasivaFilas(filasActualizadas);
      setMasivaResumen(`✅ ${ok} cargados · ❌ ${err} errores`);
    } catch (e: any) {
      setMasivaResumen('Error: ' + e.message);
    } finally {
      setMasivaSubiendo(false);
    }
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

        {/* Botón Carga Masiva */}
        <button
          onClick={() => { setShowMasiva(true); setMasivaProd(''); setMasivaFilas([]); setMasivaResumen(''); }}
          className="w-full py-3.5 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
          style={{ background: 'linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%)' }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          CARGA MASIVA DESDE EXCEL
        </button>

      </div>

      {/* ── Modal Carga Masiva ────────────────────────────────────────────── */}
      {showMasiva && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}>

            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-black text-gray-800 text-base">Carga Masiva</h3>
                <p className="text-xs text-gray-400 mt-0.5">Asigna un producto a varios deportistas desde Excel</p>
              </div>
              <button onClick={() => setShowMasiva(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500 font-black text-lg leading-none">
                ×
              </button>
            </div>

            {/* Body modal */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">

              {/* 1. Seleccionar producto */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5">
                  1. Seleccionar Producto
                </label>
                <select
                  value={masivaProd}
                  onChange={e => setMasivaProd(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                  <option value="">-- Elige un producto --</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.tipo === 'torneo' ? 'Torneo' : 'Implemento'}] {p.descripcion} — {formatPeso(p.valor)}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Subir Excel */}
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5">
                  2. Cargar Excel de Deportistas
                </label>
                <p className="text-[11px] text-gray-400 mb-2">
                  El archivo debe tener una columna <strong>CODIGO</strong> con los códigos de los deportistas.
                  Opcionalmente columna <strong>NOMBRE</strong>. La fila 1 puede ser encabezado o datos directo.
                </p>
                <label className={cn(
                  'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-5 cursor-pointer transition',
                  masivaProd ? 'border-purple-300 hover:border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50 opacity-50 pointer-events-none'
                )}>
                  <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                  </svg>
                  <span className="text-sm font-black text-purple-600">Seleccionar archivo .xlsx / .xls</span>
                  <input
                    ref={xlsxRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={!masivaProd}
                    onChange={leerExcel}
                  />
                </label>
              </div>

              {/* 3. Preview */}
              {masivaFilas.length > 0 && (
                <div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                    3. Vista Previa — {masivaFilas.length} filas
                  </p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-3 bg-gray-100 px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-wide">
                      <span>Código</span>
                      <span>Nombre Excel</span>
                      <span>Estado</span>
                    </div>
                    <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                      {masivaFilas.map((f, i) => (
                        <div key={i} className="grid grid-cols-3 px-3 py-1.5 text-xs">
                          <span className="font-mono font-bold text-gray-700">{f.codigo}</span>
                          <span className="text-gray-500 truncate">{f.nombre || '—'}</span>
                          <span className={cn('font-bold text-[11px]', f.msg
                            ? (f.ok ? 'text-green-600' : 'text-red-500')
                            : 'text-gray-400')}>
                            {f.msg || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen */}
              {masivaResumen && (
                <p className="text-sm font-black text-center py-2 rounded-xl bg-gray-50 text-gray-700">
                  {masivaResumen}
                </p>
              )}
            </div>

            {/* Footer modal */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={() => setShowMasiva(false)}
                className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-black text-sm hover:bg-gray-50 transition">
                Cerrar
              </button>
              <button
                onClick={subirMasiva}
                disabled={!masivaProd || masivaFilas.length === 0 || masivaSubiendo}
                className="flex-1 py-3 rounded-xl font-black text-sm text-white transition active:scale-95 disabled:opacity-40"
                style={{ background: '#7c3aed' }}>
                {masivaSubiendo
                  ? `Cargando ${masivaFilas.length}...`
                  : `CARGAR ${masivaFilas.length > 0 ? masivaFilas.length + ' DEPORTISTAS' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
