'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, FileSpreadsheet, Play, CheckCircle, AlertTriangle, XCircle, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPORTISTAS_KEY } from '@/lib/deportistas';
import type { Deportista } from '@/lib/deportistas';
import { saveAllPagos } from '@/lib/db';

// ── Constantes ────────────────────────────────────────────────
const PAGOS_KEY         = 'futuro_pagos_estado';
const BANCOS_KEY = 'futuro_bancos_historico';

const DETALLE_VALIDOS = [
  'MATRÍCULA','MATRICULA',
  'FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];

// Quita tildes y normaliza para comparar
const norm = (s: string) =>
  String(s ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

// Detectores de columna por regex (sin tildes, sin importar espacios)
const COL_RX: Record<string, RegExp> = {
  codigo:      /^cod/i,
  detalle:     /^detalle$/i,
  debito:      /valor\s*pagado|^d[eé]?b[ií]?t/i,   // "VALOR PAGADO" o "DEBITO/DÉBITO"
  vCargado:    /v\.?\s*carg|cargado/i,
  fecha:       /^fecha/i,
  destino:     /^destino/i,
  descripcion: /^descrip/i,
  cuenta:      /^cuenta/i,
  saldo:       /^saldo/i,
  deportista:  /^deportista/i,
};
const IGNORAR_RX = /no\s*aplica/i;

// Encuentra la clave real en un objeto para un patrón
function findKey(obj: Record<string, string>, rx: RegExp): string | undefined {
  return Object.keys(obj).find(k => !IGNORAR_RX.test(k) && rx.test(norm(k)));
}
function getVal(obj: Record<string, string>, rx: RegExp): string {
  const k = findKey(obj, rx);
  return k ? (obj[k] ?? '').trim() : '';
}

// ── Tipos ─────────────────────────────────────────────────────
export type BancoLinea = {
  destino:     string;
  fecha:       string;
  descripcion: string;
  debito:      number;
  vCargado:    number;
  saldo:       string;
  cuenta:      string;
  codigo:      string;
  deportista:  string;
  detalle:     string;
  estado:      'PAGÓ' | 'ERROR';
  mensaje:     string;
  depId:       string;
};

export type BancoLote = {
  id:             string;
  fechaSubida:    string;
  totalRegistros: number;
  lineas:         BancoLinea[];
};

// ── Helpers ───────────────────────────────────────────────────
function loadXLSX(): Promise<any> {
  return new Promise((res, rej) => {
    const w = window as any;
    if (w.XLSX) { res(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = () => res(w.XLSX); s.onerror = rej;
    document.head.appendChild(s);
  });
}

function parseNum(s: string | number): number {
  if (s === '' || s === null || s === undefined) return 0;
  const str = String(s).replace(/\s/g, '');
  // Colombiano 1.234.567,89
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str))
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  // Normal con coma decimal
  const clean = str.replace(/[^0-9.,\-]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

function formatPeso(n: number): string {
  if (!n) return '';
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
}

function normDetalle(d: string): string {
  const u = d.trim().toUpperCase();
  if (u === 'MATRICULA' || u === 'MATRÍCULA') return 'MATRÍCULA';
  return u;
}

// ── Lectura robusta de Excel ─────────────────────────────────
// Lee TODAS las filas celda por celda — nunca se detiene por vacíos
async function leerTodasLasFilas(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await loadXLSX();
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: 'array', raw: false, cellDates: false });

  const allRows: Record<string, string>[] = [];
  let globalHeaders: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;

    const range = XLSX.utils.decode_range(ws['!ref']);
    const nCols = range.e.c - range.s.c + 1;
    const nRows = range.e.r - range.s.r + 1;

    // Leer todas las celdas en una matriz
    const matrix: string[][] = [];
    for (let r = 0; r < nRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < nCols; c++) {
        const addr = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
        const cell = ws[addr];
        row.push(cell ? String(cell.v ?? '').trim() : '');
      }
      matrix.push(row);
    }

    // Encontrar la fila de encabezados (primera fila con al menos 3 celdas con texto)
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(matrix.length, 15); r++) {
      const filled = matrix[r].filter(c => c !== '').length;
      if (filled >= 3) { headerRowIdx = r; break; }
    }
    if (headerRowIdx === -1) continue;

    const headers = matrix[headerRowIdx].map(h => h.trim());
    if (!globalHeaders.length) globalHeaders = headers;

    // Convertir filas de datos a objetos
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      // Saltar filas con menos de 2 celdas con contenido
      if (row.filter(c => c !== '').length < 2) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { if (h) obj[h] = row[i] ?? ''; });
      allRows.push(obj);
    }
  }

  return { headers: globalHeaders, rows: allRows };
}

// ── Componente ────────────────────────────────────────────────
export default function SubirBancosPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fase,       setFase]      = useState<'upload' | 'preview' | 'resultados' | 'aplicado'>('upload');
  const [rawFilas,   setRawFilas]  = useState<Record<string, string>[]>([]);
  const [colsDetect, setColsDetect]= useState<Record<string, string>>({});  // campo → nombre real columna
  const [lineas,     setLineas]    = useState<BancoLinea[]>([]);
  const [cargando,   setCargando]  = useState(false);
  const [error,      setError]     = useState('');
  const [arrastrar,  setArrastrar] = useState(false);
  const [registrosAplicados, setRegistrosAplicados] = useState<{depId: string; detalle: string}[]>([]);

  // ── Leer archivo ─────────────────────────────────────────
  async function leerArchivo(file: File) {
    setCargando(true); setError('');
    try {
      const { headers, rows } = await leerTodasLasFilas(file);
      if (!rows.length) { setError('No se encontraron datos en el archivo.'); return; }

      // Detectar qué columna real corresponde a cada campo
      const detected: Record<string, string> = {};
      if (rows.length > 0) {
        const sample = rows[0];
        for (const [campo, rx] of Object.entries(COL_RX)) {
          const k = findKey(sample, rx);
          if (k) detected[campo] = k;
        }
      }
      setColsDetect(detected);
      setRawFilas(rows);
      setFase('preview');
    } catch (e: any) {
      setError('Error al leer el archivo: ' + e.message);
    } finally {
      setCargando(false);
    }
  }

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) leerArchivo(f);
    e.target.value = '';
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setArrastrar(false);
    const f = e.dataTransfer.files[0]; if (f) leerArchivo(f);
  }, []);

  // ── Procesar ─────────────────────────────────────────────
  function procesar() {
    const deportistas: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
    const allPagos: Record<string, any[]> = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');

    // Mapa código → deportista
    const mapCod = new Map<string, Deportista>();
    deportistas.forEach(d => {
      const k = Object.keys(d._columnas).find(k => /^c[oó]d/i.test(k.trim()));
      const cod = norm(k ? d._columnas[k] : '');
      if (cod) mapCod.set(cod, d);
    });

    // Agrupar por (código + detalle) sumando débito
    type Acum = { debito: number; vCargado: number; fecha: string; destino: string; descripcion: string; saldo: string; cuenta: string; deportista: string; count: number };
    const grupos = new Map<string, Acum>();

    rawFilas.forEach(fila => {
      const codigo    = norm(getVal(fila, COL_RX.codigo));
      const detalleRaw= getVal(fila, COL_RX.detalle);
      const detalle   = normDetalle(detalleRaw);
      const debitoStr = getVal(fila, COL_RX.debito);
      const vcStr     = getVal(fila, COL_RX.vCargado);
      const debito    = parseNum(debitoStr);

      // Saltar si no tiene código o detalle válido
      if (!codigo || !detalle) return;
      // Saltar si el detalle no es un concepto conocido
      if (!DETALLE_VALIDOS.some(v => norm(v) === norm(detalle))) return;
      // Saltar si no hay débito o es negativo
      if (debito <= 0) return;

      const key = `${codigo}||${detalle}`;
      const prev = grupos.get(key);
      if (prev) {
        prev.debito += debito;
        prev.count++;
      } else {
        grupos.set(key, {
          debito,
          vCargado:    parseNum(vcStr),
          fecha:       getVal(fila, COL_RX.fecha),
          destino:     getVal(fila, COL_RX.destino),
          descripcion: getVal(fila, COL_RX.descripcion),
          saldo:       getVal(fila, COL_RX.saldo),
          cuenta:      getVal(fila, COL_RX.cuenta),
          deportista:  getVal(fila, COL_RX.deportista),
          count:       1,
        });
      }
    });

    const resultado: BancoLinea[] = [];

    grupos.forEach((acum, key) => {
      const [codigoNorm, detalle] = key.split('||');
      const dep = mapCod.get(codigoNorm);
      // Código real (con mayúsculas originales)
      const codigoDisplay = getVal(
        rawFilas.find(f => norm(getVal(f, COL_RX.codigo)) === codigoNorm) ?? {},
        COL_RX.codigo
      ).toUpperCase() || codigoNorm.toUpperCase();

      if (!dep) {
        resultado.push({ destino: acum.destino, fecha: acum.fecha, descripcion: acum.descripcion, debito: acum.debito, vCargado: acum.vCargado, saldo: acum.saldo, cuenta: acum.cuenta, codigo: codigoDisplay, deportista: acum.deportista, detalle, estado: 'ERROR', mensaje: `Código "${codigoDisplay}" no encontrado en el sistema.`, depId: '' });
        return;
      }

      // Valor cargado: del banco, o del estado de cuenta
      let vCarg = acum.vCargado;
      if (!vCarg) {
        const filasDep = allPagos[dep.id] ?? [];
        const fc = filasDep.find((r: any) => r.detalle === detalle);
        vCarg = fc ? parseNum(fc.vCargado) : 0;
      }

      const ratio  = vCarg > 0 ? acum.debito / vCarg : -1;
      let estado: BancoLinea['estado'];
      let mensaje:  string;
      const pagosLabel = acum.count > 1 ? `${acum.count} pagos sumados = ` : '';

      // Cualquier pago registrado → PAGÓ
      estado  = 'PAGÓ';
      mensaje = `${pagosLabel}${formatPeso(acum.debito)} ✓`;

      resultado.push({ destino: acum.destino, fecha: acum.fecha, descripcion: acum.descripcion, debito: acum.debito, vCargado: vCarg, saldo: acum.saldo, cuenta: acum.cuenta, codigo: codigoDisplay, deportista: dep._nombre, detalle, estado, mensaje, depId: dep.id });
    });

    const ord: Record<string, number> = { ERROR: 0, VERIFICAR: 1, 'PAGÓ CON 10%': 2, 'PAGÓ': 3 };
    resultado.sort((a, b) => (ord[a.estado] ?? 5) - (ord[b.estado] ?? 5));
    setLineas(resultado);
    setFase('resultados');
  }

  // ── Aplicar ───────────────────────────────────────────────
  function aplicar() {
    const allPagos: Record<string, any[]> = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');
    const aplicados: {depId: string; detalle: string}[] = [];
    const MESES_BASE = ['MATRÍCULA','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

    lineas.forEach(ln => {
      if (!ln.depId || ln.estado === 'ERROR') return;
      let fd = allPagos[ln.depId] ?? [];
      if (!fd.length) {
        fd = MESES_BASE.map(det => ({ detalle: det, vCargado: '', estado: 'PEND', destino: '', fecha: '', vPagado: '' }));
      }
      const idx = fd.findIndex((r: any) => r.detalle === ln.detalle);
      if (idx === -1) return;
      fd[idx] = {
        ...fd[idx],
        estado:   ln.estado === 'PAGÓ CON 10%' ? 'PAGÓ CON 10%' : 'PAGÓ',
        vPagado:  formatPeso(ln.debito),
        vCargado: fd[idx].vCargado || (ln.vCargado ? formatPeso(ln.vCargado) : ''),
        destino:  ln.destino  || fd[idx].destino,
        fecha:    ln.fecha    || fd[idx].fecha,
      };
      allPagos[ln.depId] = fd;
      aplicados.push({ depId: ln.depId, detalle: ln.detalle });
    });

    localStorage.setItem(PAGOS_KEY, JSON.stringify(allPagos));
    saveAllPagos(allPagos).catch(console.error); // sync Supabase en background

    const lote: BancoLote = { id: `lote-${Date.now()}`, fechaSubida: new Date().toISOString(), totalRegistros: lineas.length, lineas };
    const hist: BancoLote[] = JSON.parse(localStorage.getItem(BANCOS_KEY) ?? '[]');
    hist.unshift(lote);
    localStorage.setItem(BANCOS_KEY, JSON.stringify(hist));

    setRegistrosAplicados(aplicados);
    setFase('aplicado');
  }

  // ── Revertir ──────────────────────────────────────────────
  function revertir() {
    if (!confirm('¿Eliminar todos los cambios aplicados?')) return;
    const allPagos: Record<string, any[]> = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');
    registrosAplicados.forEach(({ depId, detalle }) => {
      const fd = allPagos[depId]; if (!fd) return;
      const idx = fd.findIndex((r: any) => r.detalle === detalle); if (idx === -1) return;
      fd[idx] = { ...fd[idx], estado: 'PEND', vPagado: '', fecha: '' };
    });
    localStorage.setItem(PAGOS_KEY, JSON.stringify(allPagos));
    saveAllPagos(allPagos).catch(console.error); // sync revert en Supabase
    const hist: BancoLote[] = JSON.parse(localStorage.getItem(BANCOS_KEY) ?? '[]');
    hist.shift();
    localStorage.setItem(BANCOS_KEY, JSON.stringify(hist));
    setRegistrosAplicados([]);
    setFase('upload'); setRawFilas([]); setLineas([]);
  }

  const cntOk  = lineas.filter(l => l.estado === 'PAGÓ').length;
  const cntErr = lineas.filter(l => l.estado === 'ERROR').length;

  const G   = '#16a34a';
  const ROW = '#f1f5f9';
  const BW  = '1px solid white';
  const bdg = (e: BancoLinea['estado']) =>
    e === 'PAGÓ' ? { bg:'#dcfce7', txt:'#166534', lbl:'PAGÓ' } :
                   { bg:'#fee2e2', txt:'#991b1b', lbl:'ERROR' };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow">
        <button onClick={() => router.push('/dashboard')} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition"><ArrowLeft className="w-4 h-4"/></button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><Upload className="w-4 h-4 text-white"/></div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base">Subir Bancos</h1>
          <p className="text-white/60 text-[11px]">Cargar extracto · actualizar estado de cuenta</p>
        </div>
        <div className="text-right leading-tight hidden sm:block">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── UPLOAD ── */}
        {fase === 'upload' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <div className="text-center mb-6">
              <FileSpreadsheet className="w-12 h-12 text-[#16a34a] mx-auto mb-3"/>
              <h2 className="text-lg font-black text-[#111827]">Cargar extracto bancario</h2>
              <p className="text-sm text-gray-500 mt-1">Detecta automáticamente las columnas, incluyendo tildes y espacios</p>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setArrastrar(true); }}
              onDragLeave={() => setArrastrar(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={cn('border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition',
                arrastrar ? 'border-[#16a34a] bg-green-50' : 'border-gray-200 hover:border-[#16a34a] hover:bg-green-50/30')}>
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
              <p className="font-semibold text-gray-500 text-lg">Arrastra aquí o haz clic</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx · .xls — sin límite de filas</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile}/>
            {cargando && (
              <div className="mt-5 flex flex-col items-center gap-2 text-[#16a34a]">
                <Loader2 className="w-8 h-8 animate-spin"/>
                <p className="text-sm font-semibold">Leyendo todas las filas del archivo...</p>
                <p className="text-xs text-gray-400">Archivos grandes pueden tardar unos segundos</p>
              </div>
            )}
            {error && <p className="mt-4 text-sm text-red-600 text-center font-semibold bg-red-50 rounded-xl p-3">{error}</p>}
          </div>
        )}

        {/* ── PREVIEW ── */}
        {fase === 'preview' && (
          <div className="space-y-4">
            {/* Columnas detectadas */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-black text-[#111827]">Archivo listo</h2>
                  <p className="text-xs text-gray-500">
                    <span className="font-black text-[#16a34a] text-sm">{rawFilas.length.toLocaleString('es-CO')} filas</span>
                    {' '}leídas correctamente
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-[#16a34a]"/>
              </div>

              {/* Columnas detectadas */}
              <p className="text-[11px] font-black text-[#4b5563] uppercase tracking-wider mb-2">Columnas detectadas</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries({
                  'CÓDIGO':        colsDetect.codigo,
                  'DETALLE':       colsDetect.detalle,
                  'VALOR PAGADO':  colsDetect.debito,
                  'FECHA':         colsDetect.fecha,
                  'DESTINO':       colsDetect.destino,
                  'DEPORTISTA':    colsDetect.deportista,
                  // opcionales — aparecen en gris si no están
                  'V. CARGADO':    colsDetect.vCargado,
                  'DESCRIPCIÓN':   colsDetect.descripcion,
                  'CUENTA':        colsDetect.cuenta,
                }).map(([campo, real]) => (
                  <div key={campo} className={cn('rounded-lg px-3 py-2 text-[10px]', real ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200')}>
                    <p className="font-black" style={{ color: real ? '#16a34a' : '#dc2626' }}>{campo}</p>
                    <p className="text-gray-500 truncate">{real ?? '⚠ No detectada'}</p>
                  </div>
                ))}
              </div>

              {/* Advertencia si faltan columnas críticas */}
              {(!colsDetect.codigo || !colsDetect.detalle || !colsDetect.debito) && (
                <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 font-semibold">
                  ⚠ Faltan columnas obligatorias: {[!colsDetect.codigo && 'CÓDIGO', !colsDetect.detalle && 'DETALLE', !colsDetect.debito && 'VALOR PAGADO'].filter(Boolean).join(', ')}. Verifica los encabezados del archivo.
                </div>
              )}
            </div>

            {/* Vista previa de datos */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <p className="px-5 py-3 font-black text-[#111827] text-sm border-b border-gray-100">Primeras 5 filas</p>
              <div className="overflow-auto" style={{ maxHeight: 220 }}>
                <table className="w-full text-xs border-collapse" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      {Object.keys(rawFilas[0] ?? {}).filter(k => !/no\s*aplica/i.test(k)).map(c => (
                        <th key={c} style={{ background: G, color: 'white', padding: '6px 10px', textAlign: 'left', fontWeight: 900, borderRight: BW, whiteSpace: 'nowrap', fontSize: 10 }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawFilas.slice(0, 5).map((f, i) => (
                      <tr key={i} style={{ background: ROW }}>
                        {Object.entries(f).filter(([k]) => !/no\s*aplica/i.test(k)).map(([k, v]) => (
                          <td key={k} style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#111827', whiteSpace: 'nowrap' }}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setFase('upload'); setRawFilas([]); }} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#4b5563] hover:bg-gray-50 transition">Volver</button>
              <button onClick={procesar} disabled={!colsDetect.codigo || !colsDetect.detalle || !colsDetect.debito}
                className="flex-1 flex items-center justify-center gap-2 bg-[#16a34a] hover:bg-[#064e1e] text-white rounded-xl py-2.5 text-sm font-black transition disabled:opacity-50 disabled:cursor-not-allowed">
                <Play className="w-4 h-4"/> Procesar {rawFilas.length.toLocaleString('es-CO')} filas
              </button>
            </div>
          </div>
        )}

        {/* ── RESULTADOS ── */}
        {fase === 'resultados' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { cnt: cntOk,  icon: <CheckCircle className="w-5 h-5 text-[#16a34a]"/>, txt: '#16a34a', lbl: 'PAGADOS' },
                { cnt: cntErr, icon: <XCircle className="w-5 h-5 text-red-500"/>,        txt: '#991b1b', lbl: 'CÓDIGO NO ENCONTRADO' },
              ].map(r => (
                <div key={r.lbl} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                  <div className="flex justify-center mb-1">{r.icon}</div>
                  <p className="text-2xl font-black" style={{ color: r.txt }}>{r.cnt}</p>
                  <p className="text-[10px] font-bold text-gray-500">{r.lbl}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="font-black text-[#111827] text-sm">Resultado del procesamiento</p>
                <p className="text-xs text-gray-400">{lineas.length} grupos · {rawFilas.length.toLocaleString('es-CO')} filas originales</p>
              </div>
              <div className="overflow-auto" style={{ maxHeight: '50vh' }}>
                <table className="w-full text-xs border-collapse" style={{ minWidth: 700 }}>
                  <thead className="sticky top-0">
                    <tr>
                      {['ESTADO','DESTINO','FECHA','VALOR PAGADO','V. CARGADO','CÓDIGO','DEPORTISTA','DETALLE','NOTA'].map(h => (
                        <th key={h} style={{ background: G, color: 'white', padding: '7px 10px', textAlign: ['VALOR PAGADO','V. CARGADO'].includes(h) ? 'right' : 'left', fontWeight: 900, borderRight: BW, whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((ln, i) => {
                      const b = bdg(ln.estado);
                      return (
                        <tr key={i} style={{ background: ROW }}>
                          <td style={{ padding: '5px 8px', borderRight: BW, borderBottom: BW }}>
                            <span style={{ background: b.bg, color: b.txt, padding: '2px 7px', borderRadius: 6, fontWeight: 900, fontSize: 10, whiteSpace: 'nowrap' }}>{b.lbl}</span>
                          </td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#111827', whiteSpace: 'nowrap' }}>{ln.destino||'—'}</td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#4b5563', whiteSpace: 'nowrap' }}>{ln.fecha||'—'}</td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, textAlign: 'right', fontWeight: 900, color: '#111827', whiteSpace: 'nowrap' }}>{formatPeso(ln.debito)}</td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, textAlign: 'right', color: '#4b5563', whiteSpace: 'nowrap' }}>{ln.vCargado ? formatPeso(ln.vCargado) : '—'}</td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, fontWeight: 900, color: G, whiteSpace: 'nowrap' }}>{ln.codigo}</td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{ln.deportista}</td>
                          <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#111827', whiteSpace: 'nowrap' }}>{ln.detalle}</td>
                          <td style={{ padding: '5px 10px', borderBottom: BW, color: '#4b5563', fontSize: 10 }}>{ln.mensaje}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setFase('preview')} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#4b5563] hover:bg-gray-50 transition">Volver</button>
              <button onClick={() => { setFase('upload'); setRawFilas([]); setLineas([]); }} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#4b5563] hover:bg-gray-50 transition">Nuevo archivo</button>
              {cntOk > 0 && (
                <button onClick={aplicar} className="flex-1 flex items-center justify-center gap-2 bg-[#16a34a] hover:bg-[#064e1e] text-white rounded-xl py-2.5 text-sm font-black transition">
                  <CheckCircle className="w-4 h-4"/> Aplicar {cntOk} pagos a estados de cuenta
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── APLICADO ── */}
        {fase === 'aplicado' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <CheckCircle className="w-16 h-16 text-[#16a34a] mx-auto mb-4"/>
            <h2 className="text-xl font-black text-[#111827] mb-2">¡Cambios aplicados!</h2>
            <p className="text-sm text-gray-500">{cntOk} pagados · {cntD10} con 10% · {cntVer} por verificar</p>
            {cntErr > 0 && <p className="text-sm text-orange-500 font-semibold mt-1">{cntErr} errores no aplicados.</p>}

            <div className="mt-5 bg-red-50 border border-red-200 rounded-xl p-4 max-w-sm mx-auto text-left">
              <p className="font-black text-red-700 mb-1 flex items-center gap-2 text-sm"><Trash2 className="w-4 h-4"/> ¿Era un archivo de prueba?</p>
              <p className="text-red-600 text-xs mb-3">Elimina todos los cambios y deja los estados como estaban.</p>
              <button onClick={revertir} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-black transition">
                <Trash2 className="w-4 h-4"/> Eliminar cambios ({registrosAplicados.length} registros)
              </button>
            </div>

            <div className="flex gap-3 justify-center mt-5">
              <button onClick={() => { setFase('upload'); setRawFilas([]); setLineas([]); setRegistrosAplicados([]); }} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#4b5563] hover:bg-gray-50 transition">Subir otro archivo</button>
              <button onClick={() => router.push('/consolidado-bancos')} className="px-5 py-2.5 bg-[#16a34a] hover:bg-[#064e1e] text-white rounded-xl text-sm font-black transition">Ver Consolidado Bancos</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
