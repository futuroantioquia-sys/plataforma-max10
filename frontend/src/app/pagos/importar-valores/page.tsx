'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, CheckCircle,
  RefreshCw, Trash2, BookOpen, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeportistas, getPagos, saveAllPagos } from '@/lib/db';
import type { Deportista } from '@/lib/db';

declare global { interface Window { XLSX: any } }

/* Meses válidos en DETALLE del Libro Contable */
const MESES_VALIDOS = [
  'MATRÍCULA 2026','MATRICULA 2026',
  'ENERO 2026','FEBRERO 2026','MARZO 2026','ABRIL 2026','MAYO 2026','JUNIO 2026',
  'JULIO 2026','AGOSTO 2026','SEPTIEMBRE 2026','OCTUBRE 2026',
  'NOVIEMBRE 2026','DICIEMBRE 2026',
];

type PagoRow = {
  detalle:  string;
  vCargado: string;
  estado:   'PAGÓ' | 'PEND' | 'PROX';
  destino:  string;
  fecha:    string;
  vPagado:  string;
};
type AllPagos = Record<string, PagoRow[]>;

type ResumenFila = { codigo: string; nombre: string; meses: string[]; total: number };

type ResultRow = {
  codigo:  string;
  nombre:  string;
  detalle: string;
  estado:  'ok' | 'no_encontrado' | 'mes_invalido';
};

type Diagnostico = {
  hoja:       string;
  filaEnc:    number;
  colNombres: string[];
  iCod: number; iDep: number; iDet: number; iDes: number; iVPag: number;
  muestraCodigos:   string[];
  muestraDetalle:   string[];
  primerasFilas:    string[][];
  totalFilas:       number;
  filasConMes:      string[][];   /* filas del archivo que SÍ tienen mes válido */
  muestraDeportistasSistema: { id: string; nombre: string; codClave: string; todasCols: string }[];
};

/** Elimina tildes/acentos y convierte a mayúsculas para comparación segura
 *  Ej: "CÓDIGO" → "CODIGO",  "Ó" → "O" */
function sinTildes(s: string): string {
  // NFD descompone las letras con tilde en letra base + combining char
  // charCodeAt filtra los combining chars (U+0300 a U+036F) sin regex Unicode
  return String(s ?? '').normalize('NFD').split('').filter(
    c => c.charCodeAt(0) < 0x0300 || c.charCodeAt(0) > 0x036f
  ).join('').toUpperCase();
}

function codigoDe(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  // Buscar key que empiece con "cod" (con o sin tilde, any case)
  const k = Object.keys(cols).find(k =>
    /^c[oó]d/i.test(k) || /^cod/i.test(sinTildes(k))
  );
  return k ? cols[k] : '';
}

/** Busca deportista por código de 4-5 dígitos en _columnas.
 *  Usa parseInt para que "08095" == "8095" (ceros iniciales no importan). */
function buscarPorCodigo(deps: Deportista[], codNum: string): Deportista | undefined {
  if (!codNum) return undefined;
  const numInt = parseInt(codNum.replace(/\D/g, ''), 10);
  if (isNaN(numInt)) return undefined;

  // Búsqueda 1 (estricta): solo en columna llamada "cod*"
  const estricto = deps.find(d => {
    const k = Object.keys(d._columnas ?? {}).find(k =>
      /^c[oó]d/i.test(k) || /^cod/i.test(sinTildes(k))
    );
    if (!k) return false;
    const digits = String(d._columnas[k] ?? '').replace(/\D/g, '');
    return parseInt(digits, 10) === numInt;
  });
  if (estricto) return estricto;

  // Búsqueda 2 (amplia): cualquier columna con valor numérico igual
  return deps.find(d =>
    Object.values(d._columnas ?? {}).some(v => {
      const digits = String(v ?? '').replace(/\D/g, '');
      if (digits.length < 4 || digits.length > 5) return false;
      return parseInt(digits, 10) === numInt;
    })
  );
}

/* Normaliza texto de celda: quita espacios extra, convierte a mayúsculas */
function limpiar(v: any): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export default function LibroContablePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [deportistas,     setDeportistas]    = useState<Deportista[]>([]);
  const [xlsxReady,       setXlsxReady]      = useState(false);
  const [importando,      setImportando]      = useState(false);
  const [resultados,      setResultados]      = useState<ResultRow[] | null>(null);
  const [diagnostico,     setDiagnostico]     = useState<Diagnostico | null>(null);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando,      setEliminando]      = useState(false);
  const [eliminadoOk,     setEliminadoOk]    = useState(false);

  /* ─── Resumen de pagos guardados ─── */
  const [resumen,     setResumen]     = useState<ResumenFila[] | null>(null);
  const [cargandoRes, setCargandoRes] = useState(false);
  const [filtroRes,   setFiltroRes]   = useState('');

  async function cargarResumen() {
    setCargandoRes(true);
    try {
      /* Leer DIRECTAMENTE de la clave dedicada del Libro Contable
         (evita mezclar con datos de Supabase y superar cuota de localStorage) */
      let allPagos: AllPagos = {};
      try {
        const raw = localStorage.getItem('futuro_libro_pagos');
        allPagos = raw ? JSON.parse(raw) : {};
      } catch {}

      /* Fallback: si la clave dedicada está vacía, buscar en getPagos() */
      if (!Object.keys(allPagos).length) {
        const full = (await getPagos()) as AllPagos;
        for (const [k, v] of Object.entries(full)) {
          if (/^\d{1,5}$/.test(k)) allPagos[k] = v;
        }
      }

      const map = new Map<string, ResumenFila>();

      for (const [clave, filas] of Object.entries(allPagos)) {
        /* Solo claves numéricas (Libro Contable) */
        if (!/^\d{1,5}$/.test(clave)) continue;
        const pagosDep = filas.filter(f => f.estado === 'PAGÓ');
        if (!pagosDep.length) continue;

        const codNorm = String(parseInt(clave, 10));
        if (map.has(codNorm)) {
          const prev = map.get(codNorm)!;
          for (const f of pagosDep) {
            if (!prev.meses.includes(f.detalle)) prev.meses.push(f.detalle);
            prev.total++;
          }
        } else {
          /* Intentar encontrar nombre del deportista */
          const numInt = parseInt(codNorm, 10);
          const dep = deportistas.find(d =>
            Object.values(d._columnas ?? {}).some(v => {
              const digits = String(v ?? '').replace(/\D/g, '');
              return digits && parseInt(digits, 10) === numInt;
            })
          );
          map.set(codNorm, {
            codigo: codNorm,
            nombre: dep?._nombre || '—',
            meses:  pagosDep.map(f => f.detalle),
            total:  pagosDep.length,
          });
        }
      }

      const lista = Array.from(map.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
      setResumen(lista);
    } finally {
      setCargandoRes(false);
    }
  }

  useEffect(() => {
    getDeportistas().then(lista => { if (lista.length) setDeportistas(lista); });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.XLSX) { setXlsxReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.async = true;
    script.onload = () => setXlsxReady(true);
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  /* ─────────────────────────────────────────────
     SUBIR LIBRO CONTABLE
  ──────────────────────────────────────────────*/
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !xlsxReady) return;
    setImportando(true);
    setResultados(null);
    setDiagnostico(null);
    setEliminadoOk(false);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = window.XLSX;
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });

        /* 1. Buscar hoja CONTABILIDAD (o la primera si no existe) */
        const sheetName: string =
          wb.SheetNames.find((n: string) => /contabilidad/i.test(n.trim())) ??
          wb.SheetNames[0];

        const ws   = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) {
          alert('La hoja "' + sheetName + '" está vacía o sin datos.');
          setImportando(false);
          return;
        }

        /* 2. Encontrar fila de encabezados — escanea hasta fila 25 */
        const contieneClave = (row: any[]) =>
          row.some(c => /detalle|c.digo|fecha|descripci|v.*pag/i.test(limpiar(c)));

        let hRow = -1;
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
          if (contieneClave(rows[i])) { hRow = i; break; }
        }

        if (hRow < 0) {
          const muestra = rows.slice(0, 5)
            .map((r, i) => 'F' + (i + 1) + ': ' + r.slice(0, 8).map(limpiar).filter(Boolean).join(' | '))
            .join('\n');
          alert('No se encontraron encabezados en la hoja "' + sheetName + '".\n\nPrimeras filas:\n' + muestra);
          setImportando(false);
          return;
        }

        const headers = rows[hRow].map(limpiar);
        const find = (rx: RegExp) => {
          const rxI = new RegExp(rx.source, rx.flags.includes('i') ? rx.flags : rx.flags + 'i');
          return headers.findIndex(h => rxI.test(h));
        };

        /* 3. Detectar columnas por nombre con fallback por posición fija */
        const iCodN = find(/cod|c.d/i);
        const iCod  = iCodN >= 0 ? iCodN : 8;    /* col I = índice 8  */
        const iDep  = find(/deportista|alumno|nombre/i);
        const iFec  = find(/fecha/i);
        const iDes  = find(/descripci/i);
        const iDetN = find(/detalle/i);
        const iDet  = iDetN >= 0 ? iDetN : 10;   /* col K = índice 10 */
        const iVPag = find(/v.*pag|valor.*pag/i);

        /* ── CRÍTICO: Forward-fill de la columna DETALLE ──────────────
           SheetJS lee celdas FUSIONADAS como vacías (solo la celda superior
           tiene valor). Si "MARZO 2026" cubre 30 filas fusionadas, solo la
           primera tendrá ese valor y las demás aparecerán como ''.
           Esta propagación llena las celdas vacías con el último valor visto. */
        let ultimoDetalle = '';
        for (let ri = hRow + 1; ri < rows.length; ri++) {
          const val = String(rows[ri][iDet] ?? '').trim();
          if (val) {
            ultimoDetalle = val;
          } else if (ultimoDetalle) {
            rows[ri][iDet] = ultimoDetalle;
          }
        }

        /* 4. Guardar diagnóstico visible */
        const muestraCods: string[] = [];
        const muestraDets: string[] = [];
        const primerasFilas: string[][] = [];
        let filasSinData = 0;
        for (let ri = hRow + 1; ri < rows.length; ri++) {
          const rowArr = rows[ri] as any[];
          if (!rowArr.some(v => v !== '' && v !== null && v !== undefined)) { filasSinData++; continue; }
          const c = String(rowArr[iCod] ?? '').trim();
          const d = String(rowArr[iDet] ?? '').trim() || String(rowArr[iDes] ?? '').trim();
          if (c && !muestraCods.includes(c) && muestraCods.length < 5) muestraCods.push(c);
          if (d && !muestraDets.includes(d) && muestraDets.length < 5) muestraDets.push(d);
          if (primerasFilas.length < 20) {
            primerasFilas.push(rowArr.map(v => String(v ?? '').trim()));
          }
          if (primerasFilas.length >= 20 && muestraCods.length >= 5 && muestraDets.length >= 5) break;
        }

        /* ── Buscar en TODO el archivo filas que SÍ tienen mes válido ──
           Escanea hasta encontrar 5 filas donde col K tiene "MARZO 2026" etc.
           Esto revela si existen y qué tienen en CÓDIGO y DEPORTISTA. */
        const filasConMes: string[][] = [];
        for (let ri = hRow + 1; ri < rows.length && filasConMes.length < 5; ri++) {
          const r = rows[ri] as any[];
          const codDigits = String(r[iCod] ?? '').replace(/\D/g, '');
          /* Solo filas con código de deportista (4 o 5 dígitos) */
          if (codDigits.length < 4 || codDigits.length > 5) continue;
          const detVal = limpiar(String(r[iDet] ?? ''));
          if (MESES_VALIDOS.some(m => detVal.includes(m) || detVal === m)) {
            filasConMes.push(r.map((v: any) => String(v ?? '').trim()));
          }
        }
        console.log('[LibroContable] Filas con mes válido:', filasConMes.length,
          filasConMes.map(r => `COD=${r[iCod]} DEP=${r[iDep]} DET=${r[iDet]} VPAG=${r[iVPag]}`));

        /* Muestra de los primeros 5 deportistas del sistema */
        const muestraDeportistasSistema = deportistas.slice(0, 5).map(d => ({
          id:       d.id,
          nombre:   d._nombre,
          codClave: codigoDe(d),
          todasCols: Object.entries(d._columnas ?? {}).slice(0, 4)
            .map(([k, v]) => `${k}=${v}`).join(' | '),
        }));

        setDiagnostico({
          hoja: sheetName,
          filaEnc: hRow + 1,
          colNombres: headers,
          iCod, iDep, iDet, iDes, iVPag,
          muestraCodigos: muestraCods,
          muestraDetalle: muestraDets,
          primerasFilas,
          totalFilas: rows.length - hRow - 1 - filasSinData,
          filasConMes,
          muestraDeportistasSistema,
        });
        console.log('[LibroContable] Hoja:', sheetName, '| Fila encabezado:', hRow + 1);
        console.log('[LibroContable] Columnas:', headers.filter(h => h).join(' | '));
        console.log('[LibroContable] Índices → COD:', iCod, 'DEP:', iDep, 'FEC:', iFec, 'DES:', iDes, 'DET:', iDet, 'VPAG:', iVPag);
        console.log('[LibroContable] Primeras 5 filas tras forward-fill:');
        for (let ri = hRow + 1; ri < Math.min(hRow + 6, rows.length); ri++) {
          const r = rows[ri];
          console.log(`  F${ri+1}: COD=${r[iCod]} | DEP=${r[iDep]} | DET=${r[iDet]} | VPAG=${r[iVPag]}`);
        }
        console.log('[LibroContable] Deportistas sistema (primeros 5):',
          deportistas.slice(0, 5).map(d => `${d._nombre} | cod=${codigoDe(d)}`));

        /* 5. Procesar filas */
        const allPagos: AllPagos = (await getPagos()) as AllPagos;
        const res: ResultRow[]   = [];

        const ABREV: Record<string, string> = {
          'ENE':'ENERO','FEB':'FEBRERO','MAR':'MARZO','ABR':'ABRIL','MAY':'MAYO',
          'JUN':'JUNIO','JUL':'JULIO','AGO':'AGOSTO','SEP':'SEPTIEMBRE',
          'SEPT':'SEPTIEMBRE','OCT':'OCTUBRE','NOV':'NOVIEMBRE','DIC':'DICIEMBRE',
          'ENERO':'ENERO','FEBRERO':'FEBRERO','MARZO':'MARZO','ABRIL':'ABRIL','MAYO':'MAYO',
          'JUNIO':'JUNIO','JULIO':'JULIO','AGOSTO':'AGOSTO','SEPTIEMBRE':'SEPTIEMBRE',
          'OCTUBRE':'OCTUBRE','NOVIEMBRE':'NOVIEMBRE','DICIEMBRE':'DICIEMBRE',
          'MATRICULA':'MATRÍCULA','MATR':'MATRÍCULA',
        };

        function normDetalle(raw: string): string {
          const up = limpiar(raw);
          if (MESES_VALIDOS.includes(up)) return up;
          const parcial = MESES_VALIDOS.find(m => up.includes(m));
          if (parcial) return parcial;
          const partes  = up.replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
          const mesAbr  = partes.find(p => ABREV[p]);
          const anioStr = partes.find(p => /^20\d{2}$/.test(p)) ?? '2026';
          if (mesAbr) {
            const canon = ABREV[mesAbr] + ' ' + anioStr;
            if (MESES_VALIDOS.includes(canon)) return canon;
          }
          return up;
        }

        for (const row of rows.slice(hRow + 1)) {
          if (!row.some((c: any) => c !== '' && c !== null && c !== undefined)) continue;

          const g      = (i: number) => i >= 0 ? String(row[i] ?? '').trim() : '';
          const codRaw = g(iCod);
          const codNum = codRaw.replace(/\D/g, '');  /* solo dígitos */

          /* ── FILTRO PRINCIPAL: solo filas con código de 4 o 5 dígitos ──
             Los códigos de deportistas son de 4 o 5 dígitos.
             Cuentas bancarias (11 dígitos), nombres, referencias → ignorar. */
          if (codNum.length < 4 || codNum.length > 5) continue;

          const depNom   = g(iDep);
          const fecha    = g(iFec);
          const desc     = g(iDes);
          const detBruto = g(iDet) || g(iDes);   /* col K; si vacío → col D */
          const detalle  = normDetalle(detBruto);
          const vPagado  = g(iVPag);

          /* Solo meses válidos Feb–Dic */
          if (!MESES_VALIDOS.includes(detalle)) {
            /* Limitar mes_invalido para no inundar con transacciones bancarias:
               solo mostrar si col J (DEPORTISTA) tiene nombre */
            if (depNom) res.push({ codigo: codNum, nombre: depNom, detalle: g(iDet) || detalle, estado: 'mes_invalido' });
            continue;
          }

          /* ── GUARDAR BAJO EL CÓDIGO (siempre) Y BAJO dep.id (si se halla) ──
             Guardar bajo el código numérico es el path principal.
             Estado de Cuenta buscará por ambas claves.             */
          function upsertFila(clave: string) {
            const arr: PagoRow[] = allPagos[clave] ?? [];
            const i2 = arr.findIndex(r => r.detalle === detalle);
            if (i2 >= 0) {
              arr[i2] = { ...arr[i2], estado: 'PAGÓ' as const, fecha, destino: desc, vPagado };
            } else {
              arr.push({ detalle, vCargado: '', estado: 'PAGÓ', fecha, destino: desc, vPagado });
            }
            allPagos[clave] = arr;
          }

          // 1. Guardar bajo código numérico (siempre, normalizado sin ceros iniciales)
          const codNorm = String(parseInt(codNum, 10));  // "08095" → "8095"
          upsertFila(codNorm);
          if (codNorm !== codNum) upsertFila(codNum);   // también bajo original por si acaso

          // 2. Intentar también guardar bajo dep.id
          const dep = buscarPorCodigo(deportistas, codNum)
            ?? (depNom ? (() => {
                const n = (s: string) => sinTildes(s).trim().replace(/\s+/g, ' ');
                return deportistas.find(d => n(d._nombre) === n(depNom))
                    ?? deportistas.find(d => n(d._nombre).includes(n(depNom)) || n(depNom).includes(n(d._nombre)));
              })() : undefined);
          if (dep) upsertFila(dep.id);

          res.push({ codigo: codNum, nombre: dep?._nombre || depNom || codNum, detalle, estado: 'ok' });
        }

        await saveAllPagos(allPagos);
        setResultados(res);
        setResumen(null); // limpiar resumen anterior para que se recargue
      } catch (err) {
        console.error(err);
        alert('Error al procesar el archivo. Verifica el formato.');
      } finally {
        setImportando(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ─────────────────────────────────────────────
     ELIMINAR PAGOS IMPORTADOS
  ──────────────────────────────────────────────*/
  async function handleEliminar() {
    setEliminando(true);
    try {
      const allPagos: AllPagos = (await getPagos()) as AllPagos;
      for (const depId of Object.keys(allPagos)) {
        allPagos[depId] = allPagos[depId].map(row => ({
          ...row,
          estado:  row.estado === 'PAGÓ' ? ('PEND' as const) : row.estado,
          fecha:   '',
          destino: '',
          vPagado: '',
        }));
      }
      await saveAllPagos(allPagos);
      setResultados(null);
      setConfirmEliminar(false);
      setEliminadoOk(true);
    } catch (err) {
      console.error(err);
      alert('Error al eliminar los datos.');
    } finally {
      setEliminando(false);
    }
  }

  const okCount      = resultados?.filter(r => r.estado === 'ok').length            ?? 0;
  const noEncontrado = resultados?.filter(r => r.estado === 'no_encontrado').length  ?? 0;
  const mesInvalido  = resultados?.filter(r => r.estado === 'mes_invalido').length   ?? 0;

  const BW = '1px solid white';
  const G  = '#16a34a';

  return (
    <div className="min-h-screen bg-[#f0f4ff]">

      {/* HEADER */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-lc" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-lc)"/>
          </svg>
        </div>
        <button onClick={() => window.history.length > 1 ? router.back() : router.push('/dashboard')} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Subir Libro Contable</h1>
          <p className="text-white/60 text-xs">Hoja: CONTABILIDAD · Feb–Dic 2026</p>
        </div>
        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* KPI */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-black text-[#1e3a8a] text-xl">{deportistas.length}</p>
            <p className="text-gray-400 text-xs font-semibold">Deportistas en sistema</p>
          </div>
          {!xlsxReady && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando motor…
            </div>
          )}
        </div>

        {/* INFO COLUMNAS */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="font-black text-[#1e3a8a] text-sm">Columnas que se leen del Libro Contable</p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {['CÓDIGO','DEPORTISTA','FECHA','DESCRIPCIÓN','DETALLE','V. PAGADO'].map(c => (
              <span key={c} className="bg-white border border-blue-200 text-[#1e3a8a] text-xs font-black px-3 py-1 rounded-lg">
                {c}
              </span>
            ))}
          </div>
          <p className="text-blue-700 text-[11px] font-semibold pt-1">
            Hoja requerida: <strong>CONTABILIDAD</strong> · DETALLE contiene el mes: <em>FEBRERO 2026, MARZO 2026 … DICIEMBRE 2026</em>
          </p>
        </div>

        {/* ZONA DE CARGA */}
        <label
          htmlFor="libro-input"
          className={cn(
            'block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
            xlsxReady && !importando
              ? 'border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400'
              : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          )}
        >
          {importando ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-green-500 animate-spin" />
              <p className="font-black text-green-700">Procesando archivo…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center">
                <Upload className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="font-black text-[#1e3a8a] text-sm">
                  {xlsxReady ? 'Seleccionar Libro Contable (.xlsx)' : 'Cargando motor Excel…'}
                </p>
                <p className="text-gray-400 text-xs mt-1">Arrastra o haz clic para seleccionar</p>
              </div>
            </div>
          )}
        </label>
        <input
          id="libro-input"
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={!xlsxReady || importando}
          onChange={handleFile}
        />

        {/* DIAGNÓSTICO COLUMNAS */}
        {diagnostico && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs space-y-1.5 text-gray-800">
            <p className="font-black text-amber-700 text-sm mb-2">🔍 Diagnóstico del archivo</p>
            <p><strong>Hoja:</strong> {diagnostico.hoja} &nbsp;|&nbsp; <strong>Fila encabezados:</strong> {diagnostico.filaEnc}</p>
            <p><strong>CÓDIGO (col {diagnostico.iCod}):</strong> <span className="text-blue-700 font-bold">&ldquo;{diagnostico.colNombres[diagnostico.iCod] || '—'}&rdquo;</span></p>
            <p><strong>DEPORTISTA (col {diagnostico.iDep >= 0 ? diagnostico.iDep : '?'}):</strong> <span className="text-blue-700 font-bold">{diagnostico.iDep >= 0 ? `"${diagnostico.colNombres[diagnostico.iDep] || '—'}"` : '⚠ NO ENCONTRADO'}</span></p>
            <p><strong>DETALLE (col {diagnostico.iDet}):</strong> <span className="text-blue-700 font-bold">&ldquo;{diagnostico.colNombres[diagnostico.iDet] || '—'}&rdquo;</span></p>
            <p><strong>DESCRIPCIÓN (col {diagnostico.iDes >= 0 ? diagnostico.iDes : '?'}):</strong> <span className="text-blue-700 font-bold">{diagnostico.iDes >= 0 ? `"${diagnostico.colNombres[diagnostico.iDes] || '—'}"` : '⚠ NO ENCONTRADO'}</span></p>
            <p><strong>V. PAGADO:</strong> <span className="text-blue-700 font-bold">{diagnostico.iVPag >= 0 ? `col ${diagnostico.iVPag} → "${diagnostico.colNombres[diagnostico.iVPag] || '—'}"` : '⚠ NO ENCONTRADO'}</span></p>
            <p className="pt-1"><strong>Todos los encabezados:</strong></p>
            <p className="bg-white rounded p-2 font-mono text-[10px] break-all">{diagnostico.colNombres.filter(h => h).join(' | ')}</p>
            <p className="pt-1"><strong>Primeros códigos (col {diagnostico.iCod}):</strong> <span className={diagnostico.muestraCodigos.length ? 'text-green-700 font-bold' : 'text-red-500 font-bold'}>{diagnostico.muestraCodigos.length ? diagnostico.muestraCodigos.join(' / ') : '⚠ NINGUNO EN PRIMERAS 30 FILAS'}</span></p>
            <p><strong>Primeros DETALLE/DESC (mes):</strong> <span className={diagnostico.muestraDetalle.length ? 'text-green-700 font-bold' : 'text-red-500 font-bold'}>{diagnostico.muestraDetalle.length ? diagnostico.muestraDetalle.join(' / ') : '⚠ NINGUNO EN PRIMERAS 30 FILAS'}</span></p>
            <p className="pt-1 text-amber-700"><strong>Total filas de datos en el archivo:</strong> {diagnostico.totalFilas}</p>

            {diagnostico.primerasFilas.length > 0 && (
              <div className="pt-2">
                <p className="font-black text-gray-700 mb-1">📋 Primeras {diagnostico.primerasFilas.length} filas de datos:</p>
                <div className="overflow-x-auto max-h-48 overflow-y-auto rounded border border-amber-200">
                  <table className="text-[9px] font-mono border-collapse" style={{minWidth: '800px'}}>
                    <thead>
                      <tr className="bg-amber-200 sticky top-0">
                        <th className="px-1 py-0.5 border border-amber-300 text-left">#</th>
                        {diagnostico.colNombres.map((h, ci) => (
                          <th key={ci} className={`px-1 py-0.5 border border-amber-300 text-left whitespace-nowrap ${ci === diagnostico.iCod ? 'bg-blue-200' : ci === diagnostico.iDet ? 'bg-green-200' : ci === diagnostico.iDes ? 'bg-yellow-200' : ci === diagnostico.iDep ? 'bg-purple-200' : ''}`}>
                            {ci}:{h || '—'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostico.primerasFilas.map((fila, fi) => (
                        <tr key={fi} className={fi % 2 === 0 ? 'bg-white' : 'bg-amber-50'}>
                          <td className="px-1 py-0.5 border border-amber-100 text-gray-400">{diagnostico.filaEnc + fi + 1}</td>
                          {fila.map((v, ci) => (
                            <td key={ci} className={`px-1 py-0.5 border border-amber-100 max-w-[100px] truncate ${ci === diagnostico.iCod ? 'bg-blue-50 text-blue-800 font-bold' : ci === diagnostico.iDet ? 'bg-green-50 text-green-800 font-bold' : ci === diagnostico.iDes ? 'bg-yellow-50 text-yellow-800' : ci === diagnostico.iDep ? 'bg-purple-50 text-purple-800' : 'text-gray-700'}`} title={v}>
                              {v || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9px] text-gray-500 mt-1">Azul=CÓDIGO · Verde=DETALLE · Amarillo=DESCRIPCIÓN · Morado=DEPORTISTA</p>
              </div>
            )}

            {/* ── FILAS CON MES VÁLIDO (escaneo completo del archivo) ── */}
            <div className="pt-2 border-t border-amber-200 mt-2">
              <p className="font-black text-gray-700 mb-1">
                🗓 Filas del archivo con mes válido (MARZO 2026 etc.):
                <span className={`ml-2 font-bold ${diagnostico.filasConMes.length > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {diagnostico.filasConMes.length > 0 ? `${diagnostico.filasConMes.length} encontradas` : '⚠ NINGUNA ENCONTRADA EN TODO EL ARCHIVO'}
                </span>
              </p>
              {diagnostico.filasConMes.length > 0 ? (
                <div className="overflow-x-auto rounded border border-green-200">
                  <table className="text-[9px] font-mono border-collapse w-full">
                    <thead>
                      <tr className="bg-green-200">
                        {['CÓDIGO (col I)','DEPORTISTA (col J)','DETALLE (col K)','V.PAGADO (col F)','DESCRIPCIÓN (col D)'].map(h => (
                          <th key={h} className="px-2 py-1 border border-green-300 text-left whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostico.filasConMes.map((fila, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                          <td className="px-2 py-1 border border-green-100 font-bold text-blue-700">{fila[diagnostico.iCod] || '—'}</td>
                          <td className="px-2 py-1 border border-green-100 text-purple-700">{fila[diagnostico.iDep >= 0 ? diagnostico.iDep : 9] || '—'}</td>
                          <td className="px-2 py-1 border border-green-100 font-bold text-green-700">{fila[diagnostico.iDet] || '—'}</td>
                          <td className="px-2 py-1 border border-green-100 text-gray-700">{fila[diagnostico.iVPag >= 0 ? diagnostico.iVPag : 5] || '—'}</td>
                          <td className="px-2 py-1 border border-green-100 text-yellow-700">{fila[diagnostico.iDes >= 0 ? diagnostico.iDes : 3] || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[10px] text-red-700 font-bold bg-red-50 rounded p-2">
                  El archivo NO tiene ninguna fila con &quot;FEBRERO 2026&quot;, &quot;MARZO 2026&quot; etc. en la columna DETALLE (col K).
                  Verifica que la columna K del Excel realmente tenga esos valores.
                </p>
              )}
            </div>

            {/* Muestra de deportistas del sistema para verificar matching */}
            {diagnostico.muestraDeportistasSistema.length > 0 && (
              <div className="pt-2 border-t border-amber-200 mt-2">
                <p className="font-black text-gray-700 mb-1">🏃 Deportistas en el sistema (primeros 5 — verifica que tengan código):</p>
                <div className="overflow-x-auto rounded border border-amber-200">
                  <table className="text-[9px] font-mono border-collapse w-full">
                    <thead>
                      <tr className="bg-amber-200">
                        {['NOMBRE','CÓDIGO detectado','COLUMNAS (muestra)'].map(h => (
                          <th key={h} className="px-2 py-1 border border-amber-300 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostico.muestraDeportistasSistema.map((d, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50'}>
                          <td className="px-2 py-1 border border-amber-100 font-bold text-gray-800 whitespace-nowrap">{d.nombre}</td>
                          <td className={`px-2 py-1 border border-amber-100 font-bold whitespace-nowrap ${d.codClave ? 'text-blue-700' : 'text-red-500'}`}>{d.codClave || '⚠ VACÍO'}</td>
                          <td className="px-2 py-1 border border-amber-100 text-gray-600 max-w-[200px] truncate">{d.todasCols}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {diagnostico.muestraDeportistasSistema.every(d => !d.codClave) && (
                  <p className="text-[10px] text-red-600 font-bold mt-1">⚠ TODOS LOS CÓDIGOS ESTÁN VACÍOS — el matching falla. Verifica que la Vista General tenga columna &quot;CÓDIGO&quot;.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* RESULTADO */}
        {resultados && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-black text-[#1e3a8a] text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Resultado de la importación
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-green-700 font-black text-2xl">{okCount}</p>
                <p className="text-green-600 text-[10px] font-semibold uppercase tracking-wide">Pagos cargados</p>
              </div>
              <div className={cn('border rounded-xl p-3 text-center', noEncontrado > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100')}>
                <p className={cn('font-black text-2xl', noEncontrado > 0 ? 'text-red-600' : 'text-gray-400')}>{noEncontrado}</p>
                <p className={cn('text-[10px] font-semibold uppercase tracking-wide', noEncontrado > 0 ? 'text-red-500' : 'text-gray-400')}>Código no encontrado</p>
              </div>
              <div className={cn('border rounded-xl p-3 text-center', mesInvalido > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100')}>
                <p className={cn('font-black text-2xl', mesInvalido > 0 ? 'text-orange-600' : 'text-gray-400')}>{mesInvalido}</p>
                <p className={cn('text-[10px] font-semibold uppercase tracking-wide', mesInvalido > 0 ? 'text-orange-500' : 'text-gray-400')}>Mes ignorado</p>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-100 max-h-72 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {['CÓDIGO','DEPORTISTA','DETALLE','ESTADO'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-black text-white text-[10px] uppercase"
                        style={{ background: G }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => (
                    <tr key={i}
                      style={{ background: i % 2 === 0 ? '#f0f7ff' : '#e8f5ff', borderBottom: BW }}>
                      <td className="px-3 py-2 font-mono text-[10px]"
                        style={{ color: '#1d4ed8', fontWeight: 700, borderRight: BW }}>{r.codigo}</td>
                      <td className="px-3 py-2" style={{ borderRight: BW }}>{r.nombre}</td>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ borderRight: BW }}>{r.detalle}</td>
                      <td className="px-3 py-2">
                        {r.estado === 'ok'
                          ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold text-[9px]">✓ CARGADO</span>
                          : r.estado === 'no_encontrado'
                          ? <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold text-[9px]">NO HALLADO</span>
                          : <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold text-[9px]">MES IGNORADO</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── VER RESUMEN DE PAGOS GUARDADOS ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => { if (!resumen) { cargarResumen(); } else { setResumen(null); } }}
            disabled={cargandoRes}
            className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-black text-[#1e3a8a] text-sm">Ver pagos guardados en el sistema</p>
                <p className="text-gray-400 text-xs">Todos los pagos del Libro Contable sin ir a cada deportista</p>
              </div>
            </div>
            <div className="flex-shrink-0">
              {cargandoRes
                ? <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
                : <span className="text-gray-400 text-sm">{resumen ? '▲' : '▼'}</span>
              }
            </div>
          </button>

          {resumen && (
            <div className="border-t border-gray-100 p-4 space-y-3">

              {/* Buscador */}
              <div className="flex gap-2 items-center">
                <input
                  value={filtroRes}
                  onChange={e => setFiltroRes(e.target.value)}
                  placeholder="Buscar por código o nombre…"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-[#111827]"
                />
                <div className="text-right text-xs font-black text-gray-400 whitespace-nowrap">
                  {resumen.length} deportistas · {resumen.reduce((s, r) => s + r.total, 0)} pagos
                </div>
              </div>

              {/* Tabla */}
              <div className="rounded-xl overflow-hidden border border-gray-100 max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0">
                    <tr>
                      {['CÓDIGO','DEPORTISTA','MESES PAGADOS','# PAGOS'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-black text-white text-[10px] uppercase"
                          style={{ background: G }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen
                      .filter(r => !filtroRes || r.codigo.includes(filtroRes) || sinTildes(r.nombre).includes(sinTildes(filtroRes)))
                      .map((r, i) => (
                        <tr key={r.codigo} style={{ background: i % 2 === 0 ? '#f0f7ff' : '#e8f5ff', borderBottom: BW }}>
                          <td className="px-3 py-2 font-mono font-bold text-blue-700 text-[11px]" style={{ borderRight: BW }}>{r.codigo}</td>
                          <td className="px-3 py-2 font-semibold text-[11px]" style={{ borderRight: BW }}>
                            {r.nombre === '—'
                              ? <span className="text-gray-400 italic text-[10px]">Sin nombre (solo código)</span>
                              : r.nombre}
                          </td>
                          <td className="px-3 py-2 text-[10px]" style={{ borderRight: BW }}>
                            <div className="flex flex-wrap gap-1">
                              {r.meses.sort().map(m => (
                                <span key={m} className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold text-[9px] whitespace-nowrap">
                                  {m.replace(' 2026', '')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center font-black text-green-700">{r.total}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {resumen.filter(r => r.nombre === '—').length > 0 && (
                <p className="text-[10px] text-amber-600 font-semibold">
                  ⚠ {resumen.filter(r => r.nombre === '—').length} código(s) sin nombre: el pago está guardado pero no se vinculó a un deportista del sistema. El Estado de Cuenta los mostrará si el deportista tiene ese código en su columna CÓDIGO.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ELIMINAR PAGOS */}
        {!confirmEliminar && !eliminadoOk && (
          <button
            onClick={() => setConfirmEliminar(true)}
            className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-2xl py-3 text-sm font-bold hover:bg-red-100 transition"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar todos los pagos importados
          </button>
        )}

        {confirmEliminar && (
          <div className="bg-red-50 border border-red-300 rounded-2xl p-4 space-y-3">
            <p className="text-red-700 font-black text-sm">¿Seguro que deseas eliminar todos los pagos?</p>
            <p className="text-red-600 text-xs">Esta acción marcará todos los meses como PENDIENTE y borrará fechas y valores pagados.</p>
            <div className="flex gap-2">
              <button
                onClick={handleEliminar}
                disabled={eliminando}
                className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-black hover:bg-red-700 transition disabled:opacity-50"
              >
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                onClick={() => setConfirmEliminar(false)}
                className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-xl py-2 text-sm font-bold hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {eliminadoOk && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-green-700 font-bold text-sm">Pagos eliminados correctamente. Todos los meses vuelven a PENDIENTE.</p>
          </div>
        )}

      </main>
    </div>
  );
}
