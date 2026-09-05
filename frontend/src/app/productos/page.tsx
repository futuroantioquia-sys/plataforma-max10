'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { rolManejaFinanzas } from '@/lib/permisos';
import { cn } from '@/lib/utils';

const SUPABASE_URL     = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';

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

/* ── SE LLAMA INSTITUCIONAL, NO IMPLEMENTO (dirección, 02/09/2026) ─────────
   En la casa se le dice INSTITUCIONAL a la camiseta, la sudadera, la maleta:
   todo lo que lleva el escudo. "Implemento" era una palabra de la plataforma,
   no de la academia.

   POR DENTRO LA BASE SIGUE DICIENDO `implemento`. Cambiarle el nombre a la
   columna obligaría a tocar todos los cobros ya guardados en `otros_pagos`, y
   por una palabra no vale la pena arriesgar la plata que ya está registrada.
   Lo que cambia es lo que se LEE. */
const TIPO_LABEL: Record<string, string> = {
  torneo:     'Torneo',
  implemento: 'Institucional',
};

const TIPO_COLOR: Record<string, string> = {
  torneo:     'bg-blue-100 text-blue-800',
  implemento: 'bg-purple-100 text-purple-800',
};

function formatPeso(v: number) {
  return '$' + v.toLocaleString('es-CO');
}

/* ── LOS PESOS SE ESCRIBEN COMO EN COLOMBIA ───────────────────────────────
   (dirección, 02/09/2026 — «en implementos le trabajó mal el tema de nombre
    y valor»)

   LA FALLA. La casilla del valor era `type="number"` y se leía con
   `parseFloat`. Escribiendo 45.000 —como se escribe aquí— el punto se tomaba
   como coma decimal: el producto quedaba guardado en CUARENTA Y CINCO PESOS.
   Sin aviso, sin error: simplemente quedaba mal.

   AHORA. Se toman solo los dígitos, se botan puntos, comas y el signo $. Y
   mientras se escribe, la casilla va mostrando 45.000 con sus puntos, para
   que se vea lo que va quedando. Los pesos aquí no llevan centavos. */
function pesosDeTexto(t: any): number {
  const solo = String(t ?? '').replace(/\D/g, '');
  if (!solo) return 0;
  const n = parseInt(solo, 10);
  return Number.isFinite(n) ? n : 0;
}

/** 45000 → "45.000" · vacío si es cero, para que la casilla no arranque en 0. */
function conPuntos(t: any): string {
  const n = pesosDeTexto(t);
  return n ? n.toLocaleString('es-CO') : '';
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
  /* Ya no se escoge: en este módulo todo es institucional. — 04/09/2026 */
  const [tipo, setTipo]         = useState<'torneo' | 'implemento'>('implemento');
  const [desc, setDesc]         = useState('');
  const [valor, setValor]       = useState('');
  const [editId, setEditId]     = useState<string | null>(null);

  // Carga masiva
  const xlsxRef                           = useRef<HTMLInputElement>(null);
  const [showMasiva, setShowMasiva]       = useState(false);
  const [masivaProd, setMasivaProd]       = useState('');
  const [masivaMode, setMasivaMode]       = useState<'producto' | 'libre'>('producto'); // libre = 4 cols con torneo+valor propios
  const [masivaFilas, setMasivaFilas]     = useState<{ codigo: string; nombre: string; ok: boolean; msg: string; torneo?: string; valorPropio?: number }[]>([]);
  const [masivaCargando, setMasivaCargando] = useState(false);
  const [masivaSubiendo, setMasivaSubiendo] = useState(false);
  const [masivaResumen, setMasivaResumen] = useState('');

  const esAdmin = rolManejaFinanzas(usuario?.rol);

  /* ── BORRAR TODOS LOS COBROS DE TORNEO (26/08/2026) ──────────────────────
     Pedido de la dirección: dejar en cero los torneos que ya se le cargaron a
     los deportistas —los que salen abajo del Estado de Cuenta, en "Otros
     pagos"— para volver a cargarlos desde el principio.
     Esto NO toca el catálogo de productos de esta pantalla, ni los
     implementos, ni las mensualidades. */
  const [limpiando, setLimpiando] = useState(false);
  const [conteoTor, setConteoTor] = useState<{ n: number; valor: number; deps: number; pagados: number } | null>(null);

  async function contarCobrosTorneo() {
    setError(''); setExito('');
    setLimpiando(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/otros_pagos?select=id,deportista_id,valor,estado,tipo&limit=20000`,
        { headers: HEADERS, cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`La base respondió ${res.status}`);
      const filas: any[] = await res.json();
      const tor = (filas || []).filter(f => String(f.tipo ?? '').toLowerCase().includes('torneo'));
      setConteoTor({
        n:       tor.length,
        valor:   tor.reduce((s, f) => s + (Number(f.valor) || 0), 0),
        deps:    new Set(tor.map(f => f.deportista_id)).size,
        pagados: tor.filter(f => String(f.estado ?? '').toUpperCase().startsWith('PAG')).length,
      });
    } catch (e: any) {
      setError(e?.message || 'No se pudo consultar.');
      setConteoTor(null);
    }
    setLimpiando(false);
  }

  async function borrarCobrosTorneo() {
    if (!conteoTor || conteoTor.n === 0) return;
    if (!window.confirm(
      `¿Borrar los ${conteoTor.n} cobros de torneo de TODOS los deportistas?\n\n` +
      `Suman $${conteoTor.valor.toLocaleString('es-CO')} y afectan a ${conteoTor.deps} deportista(s).\n` +
      (conteoTor.pagados > 0
        ? `OJO: ${conteoTor.pagados} ya figuran PAGADOS y también se borran.\n`
        : '') +
      `\nNo se toca lo institucional ni las mensualidades.\nEsto no se puede deshacer.`
    )) return;

    setLimpiando(true);
    setError(''); setExito('');
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/otros_pagos?select=id,tipo&limit=20000`,
        { headers: HEADERS, cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`La base respondió ${res.status}`);
      const filas: any[] = await res.json();
      const ids = (filas || [])
        .filter(f => String(f.tipo ?? '').toLowerCase().includes('torneo'))
        .map(f => String(f.id));

      // De a 100, para no armar una dirección web kilométrica.
      let hechos = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const lote   = ids.slice(i, i + 100);
        const filtro = lote.map(x => `"${x}"`).join(',');
        const del = await fetch(`${SUPABASE_URL}/rest/v1/otros_pagos?id=in.(${filtro})`, {
          method: 'DELETE',
          headers: { ...HEADERS, Prefer: 'return=minimal' },
        });
        if (!del.ok) throw new Error(`Se detuvo en ${hechos} de ${ids.length} (error ${del.status})`);
        hechos += lote.length;
      }
      setExito(`Listo: se borraron ${hechos} cobros de torneo. Ya puedes cargarlos de nuevo.`);
      setConteoTor({ n: 0, valor: 0, deps: 0, pagados: 0 });
    } catch (e: any) {
      setError(e?.message || 'No se pudo borrar.');
    }
    setLimpiando(false);
  }

  useEffect(() => {
    if (usuario && !esAdmin) router.replace('/dashboard');
  }, [usuario, esAdmin, router]);

  useEffect(() => { cargarProductos(); }, []);

  async function cargarProductos() {
    setCargando(true);
    try {
      const res = await fetch(
        /* SOLO LOS INSTITUCIONALES (04/09/2026): los torneos viejos se
           quedan guardados en la base —no se borra nada— pero ya no se
           muestran aquí, porque este módulo dejó de manejarlos. */
        `${SUPABASE_URL}/rest/v1/productos?activo=eq.true&tipo=eq.implemento&order=created_at.desc`,
        { headers: HEADERS }
      );
      const data = await res.json();
      setProductos(Array.isArray(data) ? data : []);
    } catch { setError('Error cargando productos'); }
    finally { setCargando(false); }
  }

  function limpiarForm() {
    setTipo('implemento'); setDesc(''); setValor(''); setEditId(null);
  }

  async function guardar() {
    if (!desc.trim()) { setError('Escribe una descripción'); return; }
    /* Solo los dígitos: "45.000" son cuarenta y cinco mil pesos. — 02/09/2026 */
    const num = pesosDeTexto(valor);
    if (num <= 0) { setError('Escribe cuánto vale. Ejemplo: 45.000'); return; }

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

    // ── Detectar encabezado y columnas ──────────────────────────────────────
    let startRow = 0;
    const header = rows[0]?.map((c: any) => String(c).toUpperCase().trim()) ?? [];
    const hasHeader = header.some(h =>
      h.includes('COD') || h.includes('NOM') || h.includes('DEPORT') ||
      h.includes('TORNEO') || h.includes('VALOR') || h.includes('ID')
    );
    if (hasHeader) startRow = 1;

    // Detectar columnas por nombre de encabezado, con fallback a posición fija
    let colCod = header.findIndex(h => h.includes('COD') || h.includes('ID'));
    let colNom = header.findIndex(h => h.includes('NOM') || h.includes('DEPORT') || h.includes('ATLETA'));
    let colTor = header.findIndex(h => h.includes('TORNEO') || h.includes('IMPLEMENT') || h.includes('PRODUCT') || h.includes('DETALLE'));
    let colVal = header.findIndex(h => h.includes('VALOR') || h.includes('PRECIO') || h.includes('MONTO'));
    // Fallback a posiciones fijas: A=0, B=1, C=2, D=3
    if (colCod < 0) colCod = 0;
    if (colNom < 0) colNom = 1;
    if (colTor < 0) colTor = 2;
    if (colVal < 0) colVal = 3;

    // ── Detectar formato libre (4 cols: código, deportista, torneo, valor) ──
    const dataRows = rows.slice(startRow).filter(r => r[colCod] !== undefined && r[colCod] !== '');
    const tieneColTorneo = dataRows.some(r => r[colTor] && String(r[colTor]).trim() !== '');
    const tieneColValor  = dataRows.some(r => r[colVal] && !isNaN(Number(String(r[colVal]).replace(/[^0-9.]/g,''))));
    const esFormatoLibre = tieneColTorneo && tieneColValor;

    setMasivaMode(esFormatoLibre ? 'libre' : 'producto');

    const filas = dataRows.map(r => ({
      codigo:     String(r[colCod]).trim(),
      nombre:     r[colNom] ? String(r[colNom]).trim() : '',
      ok:         true,
      msg:        '',
      torneo:     esFormatoLibre && r[colTor] ? String(r[colTor]).trim() : undefined,
      valorPropio: esFormatoLibre && r[colVal]
        ? Number(String(r[colVal]).replace(/[^0-9.]/g, ''))
        : undefined,
    }));

    setMasivaFilas(filas);
  }

  // ── Carga masiva: subir a Supabase ────────────────────────────────────────
  async function subirMasiva() {
    if (masivaFilas.length === 0) return;
    const prod = productos.find(p => p.id === masivaProd);
    if (masivaMode === 'producto' && !prod) return;

    setMasivaSubiendo(true); setMasivaResumen('');
    try {
      // 1. Traer TODOS los deportistas con paginación (Supabase limita a 1000 por página)
      type DepRaw = { id: string; nombre: string; columnas: Record<string, string> | string | null };
      const allRawDeps: DepRaw[] = [];
      let from = 0;
      const PAGE = 1000;
      let fetchError = '';
      while (true) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/deportistas?select=id,nombre,columnas`,
          { headers: { ...HEADERS, 'Range-Unit': 'items', 'Range': `${from}-${from + PAGE - 1}` } }
        );
        const page = await res.json();
        if (!Array.isArray(page)) {
          fetchError = page?.message || page?.hint || JSON.stringify(page);
          break;
        }
        allRawDeps.push(...(page as DepRaw[]));
        if (page.length < PAGE) break;
        from += PAGE;
      }
      if (fetchError) {
        setMasivaResumen('❌ Error cargando deportistas: ' + fetchError);
        return;
      }
      const rawDeps = allRawDeps;
      const deportistas = rawDeps.map(d => {
        let cols: Record<string, string> = {};
        if (d.columnas) {
          cols = typeof d.columnas === 'string' ? JSON.parse(d.columnas) : d.columnas as Record<string, string>;
        }
        const kCod = Object.keys(cols).find(k => /^c[oó]d/i.test(k.trim()));
        const codigo = kCod ? String(cols[kCod] ?? '').replace(/\D/g, '').replace(/^0+/, '') : '';
        return { id: d.id, nombre: d.nombre, codigo };
      });

      // Mapa código (string, sin ceros iniciales) → deportista
      const porCodigo = new Map(deportistas.filter(d => d.codigo).map(d => [d.codigo, d]));

      // ⛔ ANTI-DUPLICADOS: traer las cargas que YA existen en otros_pagos.
      // Nunca se le carga a un deportista un torneo/producto que ya tiene.
      const yaExiste = new Set<string>();
      const claveCarga = (depId: string, descripcion: string, tipoP: string) =>
        `${depId}||${String(descripcion ?? '').trim().toLowerCase()}||${tipoP}`;
      let fromOP = 0;
      while (true) {
        const resOP = await fetch(
          `${SUPABASE_URL}/rest/v1/otros_pagos?select=deportista_id,descripcion,tipo`,
          { headers: { ...HEADERS, 'Range-Unit': 'items', 'Range': `${fromOP}-${fromOP + PAGE - 1}` } }
        );
        const pageOP = await resOP.json();
        if (!Array.isArray(pageOP)) break;
        for (const row of pageOP as any[]) {
          yaExiste.add(claveCarga(row.deportista_id, row.descripcion, row.tipo));
        }
        if (pageOP.length < PAGE) break;
        fromOP += PAGE;
      }

      let ok = 0; let err = 0; let omitidos = 0;
      const filasActualizadas = [...masivaFilas];

      for (let i = 0; i < filasActualizadas.length; i++) {
        const fila = filasActualizadas[i];
        // Normalizar código del Excel igual que el de Supabase (solo dígitos, sin ceros)
        const codNorm = String(fila.codigo ?? '').replace(/\D/g, '').replace(/^0+/, '');
        const dep  = porCodigo.get(codNorm);

        if (!dep) {
          filasActualizadas[i] = { ...fila, ok: false, msg: 'Código no encontrado' };
          err++;
          continue;
        }

        const body = masivaMode === 'libre'
          ? { deportista_id: dep.id, producto_id: null, descripcion: fila.torneo || 'Torneo', tipo: 'torneo', valor: fila.valorPropio ?? 0, estado: 'PEND' }
          : { deportista_id: dep.id, producto_id: prod!.id, descripcion: prod!.descripcion, tipo: prod!.tipo, valor: prod!.valor, estado: 'PEND' };

        // Si el deportista YA tiene este torneo/producto, se omite (jamás se duplica)
        const clave = claveCarga(dep.id, body.descripcion, body.tipo);
        if (yaExiste.has(clave)) {
          filasActualizadas[i] = { ...fila, ok: true, msg: `${dep.nombre || ''} · ya lo tenía` };
          omitidos++;
          continue;
        }

        const r = await fetch(`${SUPABASE_URL}/rest/v1/otros_pagos`, {
          method: 'POST', headers: HEADERS, body: JSON.stringify(body),
        });

        if (r.ok || r.status === 201) {
          yaExiste.add(clave);
          filasActualizadas[i] = { ...fila, ok: true, msg: dep.nombre || '✓' };
          ok++;
        } else if (r.status === 409) {
          // La base de datos bloqueó un duplicado → se cuenta como omitido
          yaExiste.add(clave);
          filasActualizadas[i] = { ...fila, ok: true, msg: `${dep.nombre || ''} · ya lo tenía` };
          omitidos++;
        } else {
          filasActualizadas[i] = { ...fila, ok: false, msg: `Error ${r.status}` };
          err++;
        }
      }

      setMasivaFilas(filasActualizadas);
      setMasivaResumen(`✅ ${ok} cargados · ⏭ ${omitidos} ya existían · ❌ ${err} errores`);
    } catch (e: any) {
      setMasivaResumen('❌ ' + (e.message || 'Error desconocido'));
    } finally {
      setMasivaSubiendo(false);
    }
  }

  // ── Eliminar todas las cargas de un producto (para volver a subir limpio) ──
  async function eliminarCargasProducto() {
    const prod = productos.find(p => p.id === masivaProd);
    if (!prod) return;
    if (!confirm(`¿Eliminar TODAS las cargas de "${prod.descripcion}" de los estados de cuenta de los deportistas?\n\nNO borra el producto del catálogo. Luego podrás volver a subir el Excel.`)) return;
    setMasivaSubiendo(true); setMasivaResumen('');
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/otros_pagos?producto_id=eq.${prod.id}`, {
        method: 'DELETE', headers: HEADERS,
      });
      if (r.ok || r.status === 204 || r.status === 200) {
        setMasivaFilas([]);
        setMasivaResumen(`🗑 Cargas de "${prod.descripcion}" eliminadas. Ya puedes volver a subir el Excel.`);
      } else {
        setMasivaResumen(`❌ No se pudieron eliminar (Error ${r.status}).`);
      }
    } catch (e: any) {
      setMasivaResumen('❌ ' + (e.message || 'Error'));
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
          {/* El módulo se llama por lo que de verdad hace desde hoy: los
              torneos se fueron a Competencias. — dirección, 04/09/2026 */}
          <h1 className="font-black text-base tracking-wide">PRODUCTOS INSTITUCIONAL</h1>
          <p className="text-white/70 text-[11px]">Lo que vende la institución: balones, camisetas, uniformes, informes…</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── LIMPIAR LOS TORNEOS YA CARGADOS ─────────────────────────────
            Borra los cobros de torneo que están en el Estado de Cuenta de los
            deportistas (la sección "Otros pagos"). No toca el catálogo de
            abajo, ni lo institucional, ni las mensualidades. — 26/08/2026 */}
        <div className="bg-[#3C4759] rounded-2xl shadow-sm border border-[#4A5568] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#4A5568]" style={{ background: '#fff7ed' }}>
            <h2 className="font-black text-sm uppercase tracking-wide" style={{ color: '#9a3412' }}>
              🧹 Limpiar los torneos ya cargados
            </h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-[12.5px] text-white/70 leading-relaxed">
              Quita los cobros de torneo que ya se le cargaron a los deportistas —los
              que salen abajo del Estado de Cuenta, en <b>Otros pagos</b>— para volver
              a cargarlos desde cero.
              <br />
              <span className="text-white/70">
                No toca el catálogo de aquí abajo, ni lo institucional, ni las mensualidades.
              </span>
            </p>

            {!conteoTor && (
              <button
                onClick={contarCobrosTorneo}
                disabled={limpiando}
                className="w-full py-3 rounded-xl font-black text-sm text-white transition disabled:opacity-60"
                style={{ background: '#ea580c' }}>
                {limpiando ? 'Consultando…' : '1 · VER CUÁNTOS HAY'}
              </button>
            )}

            {conteoTor && conteoTor.n === 0 && (
              <div className="rounded-xl px-4 py-3 text-center"
                style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p className="font-black text-sm" style={{ color: '#166534' }}>
                  No hay ningún cobro de torneo cargado.
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: '#15803d' }}>
                  Puedes cargarlos cuando quieras.
                </p>
              </div>
            )}

            {conteoTor && conteoTor.n > 0 && (
              <>
                <div className="rounded-xl px-4 py-3 space-y-1"
                  style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                  <p className="font-black text-[15px]" style={{ color: '#9a3412' }}>
                    {conteoTor.n.toLocaleString('es-CO')} cobros de torneo
                  </p>
                  <p className="text-[12.5px]" style={{ color: '#9a3412' }}>
                    ${conteoTor.valor.toLocaleString('es-CO')} · {conteoTor.deps} deportista(s)
                  </p>
                  {conteoTor.pagados > 0 ? (
                    <p className="text-[12px] font-bold pt-1" style={{ color: '#b91c1c' }}>
                      ⚠ {conteoTor.pagados} ya figuran PAGADOS. Al borrarlos, esas familias
                      vuelven a aparecer debiendo lo que ya pagaron.
                    </p>
                  ) : (
                    <p className="text-[12px] font-bold pt-1" style={{ color: '#15803d' }}>
                      Ninguno está pagado: borrarlos no hace perder ningún pago.
                    </p>
                  )}
                </div>
                <button
                  onClick={borrarCobrosTorneo}
                  disabled={limpiando}
                  className="w-full py-3 rounded-xl font-black text-sm text-white transition disabled:opacity-60"
                  style={{ background: '#dc2626' }}>
                  {limpiando ? 'Borrando…' : `2 · BORRAR LOS ${conteoTor.n} COBROS`}
                </button>
                <button
                  onClick={() => setConteoTor(null)}
                  disabled={limpiando}
                  className="w-full py-2 rounded-xl font-bold text-[12.5px] text-white/70 border border-[#4A5568] hover:bg-[#333F50] transition">
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-[#3C4759] rounded-2xl shadow-sm border border-[#4A5568] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#4A5568]"
            style={{ background: '#f8fafc' }}>
            <h2 className="font-black text-sm text-white uppercase tracking-wide">
              {editId ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
            </h2>
          </div>
          <div className="p-5 space-y-4">

            {/* ── AQUÍ YA NO SE ESCOGE TIPO: TODO ES INSTITUCIONAL ───────────
                (dirección, 04/09/2026 — «eliminemos el tema de torneos de ese
                 módulo, ya que lo creamos y funciona por Competencias; dejemos
                 solo institucional»)

                Los torneos se manejan en Torneos y Competencias, que es donde
                de verdad viven: con su cuadro, sus fechas y sus formadores.
                Tenerlos también aquí era una segunda lista que había que
                mantener a mano y que se desactualizaba sola.

                Este módulo queda para UNA sola cosa: lo que la institución
                vende —balones, camisetas, uniformes, informes—. Por eso ya no
                hay que escoger tipo: todo lo que se cree aquí nace
                Institucional y llega solo al DETALLE del Libro. */}
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,176,80,.10)', border: '1px solid rgba(0,176,80,.45)' }}>
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#5BE39B' }}>
                👕 Producto institucional
              </p>
              <p className="text-white/70 text-[11.5px] leading-snug mt-1">
                Lo que se cree aquí aparece solo en la casilla <b className="text-white">DETALLE</b> del
                Libro Contable, y le pone el concepto <b className="text-white">INSTITUCIONAL</b> a la fila.
              </p>
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-xs font-black text-white/70 uppercase tracking-wide mb-2">
                Descripción
              </label>
              {/* LETRA BLANCA SOBRE FONDO BLANCO (dirección, 02/09/2026): la
                  casilla no traía color de fondo, así que se veía blanca y la
                  letra —blanca también— quedaba invisible. Se escribía a
                  ciegas. Se le pone el fondo oscuro del resto de la app. */}
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Ej: Camiseta de presentación, Sudadera, Maleta…"
                className="w-full bg-[#2B3547] border border-[#4A5568] rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder:text-white/35 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition"
              />
            </div>

            {/* Valor */}
            <div>
              <label className="block text-xs font-black text-white/70 uppercase tracking-wide mb-2">
                Valor (COP)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold text-sm">$</span>
                {/* NI `type=number` NI `parseFloat` (dirección, 02/09/2026):
                    con los dos, escribir 45.000 guardaba 45 pesos. Ahora es
                    una casilla de texto que solo admite números y se va
                    puntuando sola: 45.000. */}
                <input
                  value={conPuntos(valor)}
                  onChange={e => setValor(String(pesosDeTexto(e.target.value) || ''))}
                  placeholder="45.000"
                  inputMode="numeric"
                  className="w-full bg-[#2B3547] border border-[#4A5568] rounded-xl pl-8 pr-4 py-3 text-sm font-semibold text-white placeholder:text-white/35 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition"
                />
              </div>
            </div>

            {/* Mensajes */}
            {error && <p className="text-[#F08A87] text-xs font-bold bg-[rgba(192,80,77,.14)] rounded-lg px-3 py-2">{error}</p>}
            {exito && <p className="text-[#5BE39B] text-xs font-bold bg-[rgba(0,176,80,.14)] rounded-lg px-3 py-2">✅ {exito}</p>}

            {/* Botones */}
            <div className="flex gap-2 pt-1">
              {editId && (
                <button onClick={limpiarForm}
                  className="flex-1 py-3 rounded-xl border-2 border-[#4A5568] text-white/70 font-black text-sm hover:bg-[#333F50] transition">
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
        <div className="bg-[#3C4759] rounded-2xl shadow-sm border border-[#4A5568] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#4A5568] flex items-center justify-between"
            style={{ background: '#f8fafc' }}>
            <h2 className="font-black text-sm text-white uppercase tracking-wide">
              Productos institucionales
            </h2>
            <span className="bg-[#2B3547] text-white/70 text-xs font-black px-2 py-1 rounded-full">
              {productos.length}
            </span>
          </div>

          {cargando ? (
            <div className="p-8 text-center text-white/40 text-sm">Cargando...</div>
          ) : productos.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">
              No hay productos registrados aún
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {productos.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#333F50] transition">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white truncate">{p.descripcion}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full', TIPO_COLOR[p.tipo])}>
                        {TIPO_LABEL[p.tipo]}
                      </span>
                      <span className="text-xs font-black text-[#16a34a]">{formatPeso(p.valor)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => editar(p)}
                      className="w-8 h-8 rounded-lg bg-[rgba(78,143,214,.14)] hover:bg-blue-100 flex items-center justify-center transition text-[#8FBEF0]">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button onClick={() => eliminar(p.id)}
                      className="w-8 h-8 rounded-lg bg-[rgba(192,80,77,.14)] hover:bg-[rgba(192,80,77,.20)] flex items-center justify-center transition text-[#F08A87]">
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
          <div className="bg-[#3C4759] rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}>

            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#4A5568] flex-shrink-0">
              <div>
                <h3 className="font-black text-white text-base">Carga Masiva</h3>
                <p className="text-xs text-white/40 mt-0.5">Asigna un producto a varios deportistas desde Excel</p>
              </div>
              <button onClick={() => setShowMasiva(false)}
                className="w-8 h-8 rounded-full bg-[#2B3547] hover:bg-[#2B3547] flex items-center justify-center transition text-white/70 font-black text-lg leading-none">
                ×
              </button>
            </div>

            {/* Body modal */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">

              {/* 1. Cargar Excel — primero */}
              <div>
                <label className="block text-xs font-black text-white/70 uppercase tracking-wide mb-1.5">
                  1. Cargar Excel
                </label>
                <p className="text-[11px] text-white/40 mb-2">
                  Acepta dos formatos:<br/>
                  <strong>· 2 cols:</strong> CÓDIGO, NOMBRE → selecciona el producto abajo.<br/>
                  <strong>· 4 cols:</strong> CÓDIGO, DEPORTISTA, TORNEO, VALOR → se detecta automáticamente.
                </p>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-purple-300 hover:border-purple-400 bg-purple-50 rounded-xl py-5 cursor-pointer transition">
                  <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                  </svg>
                  <span className="text-sm font-black text-purple-600">Seleccionar archivo .xlsx / .xls</span>
                  <input ref={xlsxRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={leerExcel} />
                </label>

                {/* Badge de modo detectado */}
                {masivaFilas.length > 0 && (
                  <div className={cn('mt-2 px-3 py-2 rounded-lg text-[11px] font-black',
                    masivaMode === 'libre'
                      ? 'bg-[rgba(78,143,214,.14)] text-[#8FBEF0] border border-[rgba(78,143,214,.45)]'
                      : 'bg-[#333F50] text-white/70 border border-[#4A5568]')}>
                    {masivaMode === 'libre'
                      ? '🏆 Formato libre detectado — torneo y valor tomados del Excel por fila'
                      : '📦 Formato producto — selecciona el producto a asignar abajo'}
                  </div>
                )}
              </div>

              {/* 2. Seleccionar producto (solo en modo producto) */}
              {masivaMode === 'producto' && (
                <div>
                  <label className="block text-xs font-black text-white/70 uppercase tracking-wide mb-1.5">
                    2. Seleccionar Producto
                  </label>
                  <select
                    value={masivaProd}
                    onChange={e => setMasivaProd(e.target.value)}
                    className="w-full border border-[#4A5568] rounded-xl px-4 py-3 text-sm font-semibold text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-[#3C4759]">
                    <option value="">-- Elige un producto --</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.tipo === 'torneo' ? 'Torneo' : 'Institucional'}] {p.descripcion} — {formatPeso(p.valor)}
                      </option>
                    ))}
                  </select>

                  {/* Eliminar cargas ya asignadas de este producto (para volver a subir limpio) */}
                  {masivaProd && (
                    <button
                      type="button"
                      onClick={eliminarCargasProducto}
                      disabled={masivaSubiendo}
                      className="mt-2 w-full py-2.5 rounded-xl border-2 border-[rgba(192,80,77,.45)] text-[#F08A87] font-black text-[11px] uppercase tracking-wide hover:bg-[rgba(192,80,77,.14)] transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                      🗑 Eliminar cargas de este producto y volver a subir
                    </button>
                  )}
                </div>
              )}

              {/* 3. Preview */}
              {masivaFilas.length > 0 && (
                <div>
                  <p className="text-xs font-black text-white/70 uppercase tracking-wide mb-2">
                    {masivaMode === 'producto' ? '3' : '2'}. Vista Previa — {masivaFilas.length} deportistas
                  </p>
                  <div className="border border-[#4A5568] rounded-xl overflow-hidden">
                    {masivaMode === 'libre' ? (
                      <>
                        <div className="grid grid-cols-4 bg-[#2B3547] px-3 py-1.5 text-[10px] font-black text-white/70 uppercase tracking-wide">
                          <span>Código</span><span>Deportista</span><span>Torneo</span><span>Valor / Estado</span>
                        </div>
                        <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                          {masivaFilas.map((f, i) => (
                            <div key={i} className="grid grid-cols-4 px-3 py-1.5 text-xs">
                              <span className="font-mono font-bold text-white">{f.codigo}</span>
                              <span className="text-white/70 truncate">{f.nombre || '—'}</span>
                              <span className="text-[#8FBEF0] font-bold truncate">{f.torneo || '—'}</span>
                              <span className={cn('font-bold text-[11px]', f.msg
                                ? (f.ok ? 'text-[#5BE39B]' : 'text-[#F08A87]')
                                : 'text-white/70')}>
                                {f.msg ? f.msg : (f.valorPropio ? `$${f.valorPropio.toLocaleString('es-CO')}` : '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 bg-[#2B3547] px-3 py-1.5 text-[10px] font-black text-white/70 uppercase tracking-wide">
                          <span>Código</span><span>Nombre Excel</span><span>Estado</span>
                        </div>
                        <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
                          {masivaFilas.map((f, i) => (
                            <div key={i} className="grid grid-cols-3 px-3 py-1.5 text-xs">
                              <span className="font-mono font-bold text-white">{f.codigo}</span>
                              <span className="text-white/70 truncate">{f.nombre || '—'}</span>
                              <span className={cn('font-bold text-[11px]', f.msg
                                ? (f.ok ? 'text-[#5BE39B]' : 'text-[#F08A87]')
                                : 'text-white/40')}>
                                {f.msg || '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Resumen */}
              {masivaResumen && (
                <p className="text-sm font-black text-center py-2 rounded-xl bg-[#333F50] text-white">
                  {masivaResumen}
                </p>
              )}
            </div>

            {/* Footer modal */}
            <div className="px-5 py-4 border-t border-[#4A5568] flex gap-2 flex-shrink-0">
              <button onClick={() => setShowMasiva(false)}
                className="flex-1 py-3 rounded-xl border-2 border-[#4A5568] text-white/70 font-black text-sm hover:bg-[#333F50] transition">
                Cerrar
              </button>
              <button
                onClick={subirMasiva}
                disabled={masivaFilas.length === 0 || masivaSubiendo || (masivaMode === 'producto' && !masivaProd)}
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
