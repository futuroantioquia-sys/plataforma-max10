'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Upload, CheckCircle, AlertCircle,
  FileSpreadsheet, Users, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deportista } from '@/lib/deportistas';
import { DEPORTISTAS_KEY, VC_KEY } from '@/lib/deportistas';

const PAGOS_KEY = 'futuro_pagos_estado';

/* ── Columnas de valores en el Excel ── */
const MESES_COLS = [
  'MATRÍCULA',
  'FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];

/* Mapa para sincronizar Vista Contable → Estado de Cuenta individual */
const SYNC_MAP: { detalle: string; key: string }[] = [
  { detalle: 'MATRÍCULA',    key: 'matricula' },
  { detalle: 'FEBRERO',      key: 'feb'       },
  { detalle: 'MARZO',        key: 'mar'       },
  { detalle: 'ABRIL',        key: 'abr'       },
  { detalle: 'MAYO',         key: 'may'       },
  { detalle: 'JUNIO',        key: 'jun'       },
  { detalle: 'JULIO',        key: 'jul'       },
  { detalle: 'AGOSTO',       key: 'ago'       },
  { detalle: 'SEPTIEMBRE',   key: 'sep'       },
  { detalle: 'OCTUBRE',      key: 'oct'       },
  { detalle: 'NOVIEMBRE',    key: 'nov'       },
  { detalle: 'DICIEMBRE',    key: 'dic'       },
];

/* ── Obtener columna del deportista ── */
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas).find(k => /^c[oó]d/i.test(k));
  return k ? dep._columnas[k] : '';
}

/* ── Tipos ── */
type PagoRow = {
  detalle: string;
  vCargado: string;
  estado: 'PAGÓ' | 'PEND';
  destino: string;
  fecha: string;
  vPagado: string;
};
type AllPagos = Record<string, PagoRow[]>;

type ResultadoImport = {
  codigo: string;
  nombre: string;
  actualizados: number;
  estado: 'ok' | 'no_encontrado';
};

/* ── Declarar XLSX global ── */
declare global { interface Window { XLSX: any } }

export default function ImportarValoresPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const fileRefVC = useRef<HTMLInputElement>(null);

  const [deportistas,   setDeportistas]   = useState<Deportista[]>([]);
  const [xlsxReady,     setXlsxReady]     = useState(false);
  const [descargando,   setDescargando]   = useState(false);
  const [importando,    setImportando]    = useState(false);
  const [resultados,    setResultados]    = useState<ResultadoImport[] | null>(null);
  const [anio,          setAnio]          = useState(new Date().getFullYear());
  const [importandoVC,  setImportandoVC]  = useState(false);
  const [vcOk,          setVcOk]          = useState(false);
  const [vcCount,       setVcCount]       = useState(0);

  /* ── Cargar deportistas ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEPORTISTAS_KEY);
      if (raw) setDeportistas(JSON.parse(raw));
    } catch {}
  }, []);

  /* ── Cargar SheetJS desde CDN ── */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.XLSX) { setXlsxReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    script.onload = () => setXlsxReady(true);
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  /* ──────────────────────────────────────────
     DESCARGAR PLANTILLA
  ─────────────────────────────────────────── */
  function descargarPlantilla() {
    if (!xlsxReady) return;
    setDescargando(true);
    try {
      const XLSX = window.XLSX;

      /* Encabezados — CÓDIGO, NOMBRE, info, luego valores */
      const INFO_COLS = ['TIPO MATRÍCULA', 'SEDE', 'PROYECTO'];
      const headers = ['CÓDIGO', 'NOMBRE DEL DEPORTISTA', ...INFO_COLS, ...MESES_COLS];

      /* Función helper para buscar columna del deportista */
      const getC = (dep: Deportista, rx: RegExp) => {
        const k = Object.keys(dep._columnas).find(k => rx.test(k));
        return k ? dep._columnas[k] : '';
      };

      /* Filas de deportistas (ordenados por código) */
      const filas = deportistas
        .map(dep => {
          const cod      = codigoDe(dep);
          const tipoMat  = getC(dep, /tipo.*afil|tipo.*mat|mat.*tipo/i);
          const sede     = getC(dep, /^sede/i);
          const proyecto = getC(dep, /^proy/i);
          return [cod, dep._nombre, tipoMat, sede, proyecto, ...MESES_COLS.map(() => '')];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', { numeric: true }));

      const data = [headers, ...filas];

      /* Crear workbook */
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);

      /* Anchos de columna */
      ws['!cols'] = [
        { wch: 10 },  // CÓDIGO
        { wch: 35 },  // NOMBRE
        { wch: 16 },  // TIPO MATRÍCULA
        { wch: 14 },  // SEDE
        { wch: 16 },  // PROYECTO
        ...MESES_COLS.map(() => ({ wch: 14 })),
      ];

      XLSX.utils.book_append_sheet(wb, ws, `Valores ${anio}`);

      XLSX.writeFile(wb, `SUBIR_VALORES_CARGADOS_${anio}.xlsx`);
    } catch (e) {
      console.error(e);
    } finally {
      setDescargando(false);
    }
  }

  /* ──────────────────────────────────────────
     IMPORTAR EXCEL
  ─────────────────────────────────────────── */
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !xlsxReady) return;
    setImportando(true);
    setResultados(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const XLSX = window.XLSX;
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) { setImportando(false); return; }

        /* Mapear encabezados */
        const headers: string[] = rows[0].map(h => String(h).trim().toUpperCase());
        const idxCodigo = headers.findIndex(h => /^c[oó]d/i.test(h));
        const idxNombre = headers.findIndex(h => /^nombre/i.test(h));
        const idxMeses  = MESES_COLS.map(m =>
          headers.findIndex(h => h === m || h.includes(m.substring(0, 4).toUpperCase()))
        );

        /* Cargar pagos actuales */
        const allPagos: AllPagos = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');

        const res: ResultadoImport[] = [];

        rows.slice(1).forEach(row => {
          if (!row.some(c => c !== '')) return; // fila vacía

          const codigoExcel = String(row[idxCodigo] ?? '').trim();
          const nombreExcel = String(row[idxNombre] ?? '').trim();

          /* Buscar deportista por código o nombre */
          const dep = deportistas.find(d => {
            const cod = codigoDe(d);
            return (
              (codigoExcel && cod.toLowerCase() === codigoExcel.toLowerCase()) ||
              (!codigoExcel && d._nombre.toLowerCase() === nombreExcel.toLowerCase())
            );
          });

          if (!dep) {
            res.push({ codigo: codigoExcel, nombre: nombreExcel, actualizados: 0, estado: 'no_encontrado' });
            return;
          }

          /* Obtener o crear filas de pagos del deportista */
          let filasPago: PagoRow[] = allPagos[dep.id] ?? MESES_COLS.map(detalle => ({
            detalle, vCargado: '', estado: 'PEND', destino: '', fecha: '', vPagado: '',
          }));

          /* Actualizar solo V. CARGADO de cada mes */
          let actualizados = 0;
          MESES_COLS.forEach((mes, mi) => {
            const colIdx = idxMeses[mi];
            if (colIdx < 0) return;
            const val = String(row[colIdx] ?? '').trim();
            if (!val) return;
            // Formatear como $XXX.XXX
            const num = parseFloat(val.replace(/[^0-9.,]/g, '').replace(',', '.'));
            const formatted = isNaN(num) ? val : `$${Math.round(num).toLocaleString('es-CO').replace(/,/g, '.')}`;
            if (mi < filasPago.length) {
              filasPago[mi] = { ...filasPago[mi], vCargado: formatted };
              actualizados++;
            }
          });

          allPagos[dep.id] = filasPago;
          res.push({ codigo: codigoDe(dep), nombre: dep._nombre, actualizados, estado: 'ok' });
        });

        /* Guardar en localStorage */
        localStorage.setItem(PAGOS_KEY, JSON.stringify(allPagos));
        setResultados(res);
      } catch (err) {
        console.error(err);
      } finally {
        setImportando(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const okCount  = resultados?.filter(r => r.estado === 'ok').length ?? 0;
  const errCount = resultados?.filter(r => r.estado === 'no_encontrado').length ?? 0;

  /* ──────────────────────────────────────────
     IMPORTAR VISTA CONTABLE
  ─────────────────────────────────────────── */
  function handleFileVC(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !xlsxReady) return;
    setImportandoVC(true);
    setVcOk(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const XLSX = window.XLSX;
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        /* cellDates:true → SheetJS parsea fechas como objetos Date */
        const wb   = XLSX.read(data, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) { setImportandoVC(false); return; }

        const headers = rows[0].map((h: any) => String(h).trim());

        /* Convertir fecha a DD/MM/AAAA — maneja Date, serial Excel, ISO y texto */
        const fmtFecha = (v: any): string => {
          if (!v && v !== 0) return '';
          // JS Date (cellDates:true)
          if (v instanceof Date) {
            const d = v.getDate().toString().padStart(2,'0');
            const m = (v.getMonth()+1).toString().padStart(2,'0');
            return `${d}/${m}/${v.getFullYear()}`;
          }
          const s = String(v).trim();
          // Serial numérico de Excel (ej: 46059)
          const num = Number(s);
          if (!isNaN(num) && num > 40000 && num < 60000) {
            const ms   = Math.round((num - 25569) * 86400 * 1000);
            const date = new Date(ms);
            const d = date.getUTCDate().toString().padStart(2,'0');
            const m = (date.getUTCMonth()+1).toString().padStart(2,'0');
            return `${d}/${m}/${date.getUTCFullYear()}`;
          }
          // ISO YYYY-MM-DD o YYYY/MM/DD
          const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
          if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
          // Formato D/M/AAAA o DD/MM/AAAA → lo dejamos
          return s;
        };

        /* Formatear valor monetario — solo si parece un monto (>= 100) */
        const fmtPeso = (v: any): string => {
          if (v === '' || v === null || v === undefined) return '';
          if (typeof v === 'boolean') return v ? 'SI' : 'NO';
          const s = String(v).trim();
          if (!s) return '';
          if (s.startsWith('$')) return s;
          const n = typeof v === 'number' ? v : parseFloat(s.replace(/[^0-9.,]/g,'').replace(',','.'));
          // Solo formatear si es un monto real (>= 100)
          if (isNaN(n) || n < 100) return s;
          return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g,'.');
        };

        /* PAZ Y SALVO: guardar texto exacto, sin conversión $ */
        const fmtTexto = (v: any): string => {
          if (v === null || v === undefined || v === '') return '';
          if (typeof v === 'boolean') return v ? 'SI' : 'NO';
          return String(v).trim();
        };

        /* Mapear columnas por nombre */
        const find = (rx: RegExp) => headers.findIndex((h: string) => rx.test(h));
        const iNom    = find(/^nombre/i);
        const iCod    = find(/^c[oó]d/i);
        const iFech   = find(/fecha.*afil|afil.*fecha/i);
        const iTipo   = find(/tipo.*afil|afil.*tipo|tipo.*mat|mat.*tipo/i);
        const iProg   = find(/^program/i);
        const iEstado = find(/^estado/i);
        const iAno    = find(/^a[ñn]o/i);
        const iSede   = find(/^sede/i);
        const iProy   = find(/^proy/i);
        const iMat    = find(/^matr[ií]c/i);
        const iMeses  = [/^feb/i,/^mar/i,/^abr/i,/^may/i,/^jun/i,/^jul/i,/^ago/i,/^sep/i,/^oct/i,/^nov/i,/^dic/i,/paz.*salvo|salvo.*paz/i].map(rx => find(rx));
        const mesKeys = ['feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic','pazSalvo'];

        const filas = rows.slice(1)
          .filter((r: any[]) => r.some(c => c !== '' && c !== null && c !== undefined))
          .map((r: any[]) => {
            const obj: Record<string, string> = {};
            const g    = (i: number) => i >= 0 ? String(r[i] ?? '').trim() : '';
            obj.nombre    = g(iNom);
            obj.codigo    = g(iCod);
            obj.fechaAfil = iFech >= 0 ? fmtFecha(r[iFech]) : '';
            obj.tipoAfil  = g(iTipo);
            obj.programa  = g(iProg);
            obj.estado    = g(iEstado);
            obj.anoNac    = g(iAno);
            obj.sede      = g(iSede);
            obj.proyecto  = g(iProy);
            obj.matricula = iMat >= 0 ? fmtPeso(r[iMat]) : '';
            mesKeys.forEach((k, mi) => {
              const raw = iMeses[mi] >= 0 ? r[iMeses[mi]] : '';
              // PAZ Y SALVO: texto puro (SI / NO / AL DÍA / etc.)
              obj[k] = k === 'pazSalvo' ? fmtTexto(raw) : fmtPeso(raw);
            });
            return obj;
          });

        localStorage.setItem(VC_KEY, JSON.stringify(filas));

        /* ── Sincronizar valores al Estado de Cuenta individual ── */
        try {
          const depList: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
          const allPagos: AllPagos = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');

          filas.forEach((fila: Record<string, string>) => {
            const dep = depList.find(d => {
              const cod = codigoDe(d);
              return (
                (fila.codigo && cod.toLowerCase() === fila.codigo.toLowerCase()) ||
                (!fila.codigo && fila.nombre && d._nombre.toLowerCase() === fila.nombre.toLowerCase())
              );
            });
            if (!dep) return;

            const prev: PagoRow[] = allPagos[dep.id] ?? [];
            allPagos[dep.id] = SYNC_MAP.map(({ detalle, key }) => {
              const old = prev.find(r => r.detalle === detalle);
              return {
                detalle,
                vCargado: (fila as Record<string, string>)[key] || old?.vCargado || '',
                estado:   old?.estado   ?? 'PEND',
                destino:  old?.destino  ?? '',
                fecha:    old?.fecha    ?? '',
                vPagado:  old?.vPagado  ?? '',
              };
            });
          });

          localStorage.setItem(PAGOS_KEY, JSON.stringify(allPagos));
        } catch (syncErr) {
          console.error('Sync EC error:', syncErr);
        }

        setVcCount(filas.length);
        setVcOk(true);
      } catch (err) {
        console.error(err);
      } finally {
        setImportandoVC(false);
        if (fileRefVC.current) fileRefVC.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="min-h-screen bg-[#f0f4ff]">

      {/* ── HEADER ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-iv" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-iv)"/>
          </svg>
        </div>
        <button onClick={() => router.back()} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Subir Valores Cargados</h1>
          <p className="text-white/60 text-xs">Carga masiva de tarifas por deportista</p>
        </div>
        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* ── KPI ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-black text-[#1e3a8a] text-xl">{deportistas.length}</p>
            <p className="text-gray-400 text-xs font-semibold">Deportistas en sistema</p>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Año</label>
            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-black text-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* ── PASO 1: DESCARGAR PLANTILLA ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-[#16a34a] rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-sm">1</div>
            <div>
              <h2 className="font-black text-[#1e3a8a] text-sm">Descargar Plantilla</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                El archivo se genera con todos los deportistas actuales (CÓDIGO + NOMBRE). Completa los valores en Excel y guarda.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-700 font-semibold">
            <strong className="text-[#1e3a8a]">Columnas del archivo:</strong>{' '}
            CÓDIGO · NOMBRE · TIPO MATRÍCULA · SEDE · PROYECTO · MATRÍCULA · FEBRERO · MARZO · ABRIL · MAYO · JUNIO · JULIO · AGOSTO · SEPTIEMBRE · OCTUBRE · NOVIEMBRE · DICIEMBRE
          </div>

          <button
            onClick={descargarPlantilla}
            disabled={!xlsxReady || deportistas.length === 0 || descargando}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 rounded-xl py-3 font-black text-sm transition',
              xlsxReady && deportistas.length > 0
                ? 'bg-[#16a34a] hover:bg-[#064e1e] text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}>
            {descargando
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generando...</>
              : <><Download className="w-4 h-4" /> Descargar Plantilla Excel ({anio})</>
            }
          </button>

          {!xlsxReady && (
            <p className="text-center text-[11px] text-gray-400 mt-2 flex items-center justify-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Cargando motor Excel...
            </p>
          )}
          {deportistas.length === 0 && (
            <p className="text-center text-[11px] text-orange-500 mt-2 font-semibold">
              ⚠ Primero importa los deportistas en Vista General
            </p>
          )}
        </div>

        {/* ── PASO 2: SUBIR VALORES ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-[#16a34a] rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-sm">2</div>
            <div>
              <h2 className="font-black text-[#16a34a] text-sm">Importar Valores</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                Sube el archivo Excel con los valores diligenciados. Los montos quedan cargados automáticamente en el Estado de Cuenta de cada deportista.
              </p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFile}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={!xlsxReady || importando}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 rounded-xl py-3 font-black text-sm transition border-2 border-dashed',
              xlsxReady && !importando
                ? 'border-[#16a34a] text-[#16a34a] hover:bg-green-50'
                : 'border-gray-200 text-gray-400 cursor-not-allowed'
            )}>
            {importando
              ? <><RefreshCw className="w-4 h-4 animate-spin text-green-600" /> Procesando...</>
              : <><Upload className="w-4 h-4" /> Seleccionar archivo Excel</>
            }
          </button>

          <p className="text-center text-[11px] text-gray-400 mt-2">
            Compatible con el formato de la plantilla descargada · .xlsx / .xls
          </p>
        </div>

        {/* ── RESULTADOS ── */}
        {resultados && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-black text-[#1e3a8a] text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Resultado de la importación
            </h3>

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-green-700 font-black text-xl">{okCount}</p>
                <p className="text-green-600 text-[11px] font-semibold">Actualizados</p>
              </div>
              <div className={cn('border rounded-xl p-3 text-center', errCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100')}>
                <p className={cn('font-black text-xl', errCount > 0 ? 'text-red-600' : 'text-gray-400')}>{errCount}</p>
                <p className={cn('text-[11px] font-semibold', errCount > 0 ? 'text-red-500' : 'text-gray-400')}>No encontrados</p>
              </div>
            </div>

            {/* Lista */}
            <div className="rounded-xl overflow-hidden border border-gray-100 max-h-72 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {['CÓDIGO','NOMBRE','MESES','ESTADO'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-black text-white text-[10px] uppercase"
                        style={{ background: '#16a34a' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => {
                    const bg = i % 2 === 0 ? '#dbeafe' : '#eff6ff';
                    const ok = r.estado === 'ok';
                    return (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-black text-white text-[11px]"
                          style={{ background: '#16a34a', border: '1px solid white' }}>
                          {r.codigo || '—'}
                        </td>
                        <td className="px-3 py-1.5 font-semibold text-[#1e3a8a] whitespace-nowrap"
                          style={{ background: bg, border: '1px solid #bfdbfe' }}>
                          {r.nombre}
                        </td>
                        <td className="px-3 py-1.5 text-center font-bold"
                          style={{ background: bg, border: '1px solid #bfdbfe', color: '#374151' }}>
                          {ok ? r.actualizados : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center"
                          style={{ background: bg, border: '1px solid #bfdbfe' }}>
                          {ok
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-500 inline" />
                            : <AlertCircle className="w-3.5 h-3.5 text-red-400 inline" />
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {errCount > 0 && (
              <p className="text-xs text-orange-600 font-semibold bg-orange-50 rounded-lg px-3 py-2">
                ⚠ {errCount} fila(s) no encontradas. Verifica que el CÓDIGO en el Excel coincida con el código del deportista en la plataforma.
              </p>
            )}

            <button
              onClick={() => { setResultados(null); }}
              className="w-full border border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-50 transition">
              Nueva importación
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════
             SECCIÓN VISTA CONTABLE
        ══════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border-2 border-[#16a34a]/30 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-[#16a34a] rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-sm">3</div>
            <div>
              <h2 className="font-black text-[#16a34a] text-sm">Cargar archivo VISTA CONTABLE</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                Sube el Excel <strong className="text-[#1e3a8a]">VISTA CONTABLE</strong> con MATRÍCULA y mensualidades.
                Los valores se cargan automáticamente en <strong className="text-[#16a34a]">Vista Contable</strong>{' '}
                <strong className="text-[#1e3a8a]">y en el Estado de Cuenta individual de cada deportista</strong>.
              </p>
            </div>
          </div>

          {/* Columnas esperadas */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex flex-wrap gap-1.5">
            {['CÓDIGO','NOMBRE','FECHA AFIL.','TIPO MAT.','PROGRAMA','SEDE','PROYECTO','MATRÍCULA','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC','PAZ Y SALVO 1ER SEM'].map(c => (
              <span key={c} className="bg-white border border-green-200 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded">{c}</span>
            ))}
          </div>

          <input ref={fileRefVC} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileVC} />

          <button
            onClick={() => fileRefVC.current?.click()}
            disabled={!xlsxReady || importandoVC}
            className={cn(
              'w-full flex items-center justify-center gap-2.5 rounded-xl py-3 font-black text-sm transition border-2',
              xlsxReady && !importandoVC
                ? 'border-[#16a34a] bg-[#16a34a] text-white hover:bg-[#15803d]'
                : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
            )}>
            {importandoVC
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Procesando Vista Contable...</>
              : <><Upload className="w-4 h-4" /> Subir archivo VISTA CONTABLE</>
            }
          </button>

          {/* Resultado */}
          {vcOk && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-black text-green-700 text-sm">¡Vista Contable cargada!</p>
                  <p className="text-green-600 text-xs">{vcCount} deportistas · Valores transferidos al Estado de Cuenta individual.</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => router.push('/vista-contable')}
                  className="flex-1 bg-[#16a34a] text-white rounded-xl px-3 py-2 text-xs font-black hover:bg-[#064e1e] transition">
                  Ver Vista Contable →
                </button>
                <button
                  onClick={() => router.push('/pagos')}
                  className="flex-1 bg-[#16a34a] text-white rounded-xl px-3 py-2 text-xs font-black hover:bg-[#15803d] transition">
                  Ver Estado de Cuenta →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── INSTRUCCIONES ── */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-2">
          <h4 className="font-black text-[#064e1e] text-xs uppercase tracking-wider">¿Cómo usar?</h4>
          <ol className="space-y-1.5 text-xs text-gray-600 font-semibold list-none">
            {[
              'Descarga la plantilla — ya tiene el CÓDIGO y NOMBRE de cada deportista.',
              'Llena los valores en Excel: MATRÍCULA y cuota de cada mes.',
              'Guarda el archivo y súbelo con el botón "Importar".',
              'Los valores quedan cargados en el Estado de Cuenta de cada deportista.',
              'Más adelante podrás subir los PAGOS EFECTUADOS de la misma forma.',
            ].map((txt, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#16a34a] font-black flex-shrink-0">{i + 1}.</span>
                <span>{txt}</span>
              </li>
            ))}
          </ol>
        </div>

      </main>
    </div>
  );
}
