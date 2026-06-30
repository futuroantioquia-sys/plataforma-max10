'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deportista } from '@/lib/deportistas';
import { DEPORTISTAS_KEY } from '@/lib/deportistas';
import { getFoto, saveFoto, savePagosDeportista, getPagos } from '@/lib/db';

const FOTOS_KEY    = 'futuro_fotos_deportistas';
const PAGOS_KEY    = 'futuro_pagos_estado';

const DETALLE_ROWS = [
  'MATRÍCULA',
  'FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];

/* Asegura que un valor numérico tenga signo $ */
function ensurePeso(v: string | undefined): string {
  if (!v) return '';
  const s = String(v).trim();
  if (s.startsWith('$')) return s;
  const n = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (isNaN(n) || n < 100) return s;
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
}

/* Mapa detalle → clave en Vista Contable */
const VC_KEYS: Record<string, string> = {
  'MATRÍCULA':  'matricula',
  'FEBRERO':    'feb',  'MARZO':      'mar',  'ABRIL':    'abr',
  'MAYO':       'may',  'JUNIO':      'jun',  'JULIO':    'jul',
  'AGOSTO':     'ago',  'SEPTIEMBRE': 'sep',  'OCTUBRE':  'oct',
  'NOVIEMBRE':  'nov',  'DICIEMBRE':  'dic',
};

type PagoRow = {
  detalle: string;
  vCargado: string;
  estado: 'PAGÓ' | 'PEND' | 'PROX';
  destino: string;
  fecha: string;
  vPagado: string;
};

/* Mes numérico por nombre de fila (MATRÍCULA = 0 = siempre activo) */
const MES_NUM: Record<string, number> = {
  'MATRÍCULA': 0,
  'FEBRERO':2,'MARZO':3,'ABRIL':4,'MAYO':5,'JUNIO':6,
  'JULIO':7,'AGOSTO':8,'SEPTIEMBRE':9,'OCTUBRE':10,'NOVIEMBRE':11,'DICIEMBRE':12,
};

function esFuturo(detalle: string): boolean {
  const idx = MES_NUM[detalle];
  if (idx === undefined || idx === 0) return false;
  return idx > new Date().getMonth() + 1; // getMonth() es 0-based
}

type AllPagos = Record<string, PagoRow[]>;

function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}

function formatFecha(v: string): string {
  if (!v) return '';
  // Ya tiene formato DD/MM/AAAA
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
  // Serial numérico de Excel (ej: 46059)
  const num = Number(v);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${date.getUTCFullYear()}`;
  }
  // ISO YYYY-MM-DD
  const iso = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return v;
}

function gradientePrograma(val: string) {
  const v = val.toLowerCase();
  if (v.includes('selecc') || v.includes('elite'))         return 'from-emerald-700 to-green-600';
  if (v.includes('formac'))                                 return 'from-blue-700 to-blue-500';
  if (v.includes('estimul') || v.includes('baby'))          return 'from-[#0f1e4a] to-[#1e3a8a]';
  if (v.includes('sub-17') || v.includes('sub 17'))         return 'from-[#0f1e4a] to-[#2563eb]';
  if (v.includes('sub-15') || v.includes('sub 15'))         return 'from-[#0a0c14] to-[#334155]';
  return 'from-[#064e1e] to-[#22c55e]';
}

const MESES: Record<string, string> = {
  '1':'Enero','2':'Febrero','3':'Marzo','4':'Abril','5':'Mayo','6':'Junio',
  '7':'Julio','8':'Agosto','9':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
  'enero':'Enero','febrero':'Febrero','marzo':'Marzo','abril':'Abril','mayo':'Mayo','junio':'Junio',
  'julio':'Julio','agosto':'Agosto','septiembre':'Septiembre','octubre':'Octubre',
  'noviembre':'Noviembre','diciembre':'Diciembre',
};

function construirFechaNac(cols: Record<string, string>): string | null {
  const entries = Object.entries(cols);
  const keyAnio = entries.find(([k]) => /^a[ñn]o$/i.test(k.trim()))?.[0];
  const keyMes  = entries.find(([k]) => /^mes$/i.test(k.trim()))?.[0];
  const keyDia  = entries.find(([k]) => /^d[ií]a$/i.test(k.trim()))?.[0];
  if (!keyAnio && !keyMes && !keyDia) return null;
  const anio   = keyAnio ? cols[keyAnio] : '';
  const mesRaw = keyMes  ? cols[keyMes].trim() : '';
  const dia    = keyDia  ? cols[keyDia]  : '';
  const mes    = MESES[mesRaw] ?? MESES[mesRaw.toLowerCase()] ?? mesRaw;
  const partes = [dia && `${dia}`, mes, anio].filter(Boolean);
  return partes.length ? `📅 ${partes.join(' de ')}` : null;
}

export default function EstadoCuentaPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [dep,     setDep]     = useState<Deportista | null>(null);
  const [foto,    setFoto]    = useState<string | null>(null);
  const [pagos,   setPagos]   = useState<PagoRow[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PagoRow>>({});
  const [anio,    setAnio]    = useState(new Date().getFullYear());
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = ev.target?.result as string;
      setFoto(base64);
      saveFoto(id, base64).catch(console.error); // guarda en Supabase + localStorage
    };
    reader.readAsDataURL(file);
  }

  /* ─── Cargar deportista y pagos guardados ─── */
  useEffect(() => {
    try {
      const lista: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
      const found = lista.find(d => d.id === id);
      if (found) setDep(found);

      // Foto: Supabase primero (async), localStorage como inmediato
      const fotosLocal = JSON.parse(localStorage.getItem(FOTOS_KEY) ?? '{}');
      if (fotosLocal[id]) setFoto(fotosLocal[id]);
      getFoto(id).then(f => { if (f) setFoto(f); }).catch(() => {});

      /* Buscar fila en Vista Contable para enriquecer valores */
      const vcData: Record<string, string>[] = JSON.parse(
        localStorage.getItem('futuro_vista_contable') ?? '[]'
      );
      const cod = found ? (Object.entries(found._columnas).find(([k]) => /^c[oó]d/i.test(k))?.[1] ?? '') : '';
      const vcRow = vcData.find(r =>
        (cod && r.codigo?.toLowerCase() === cod.toLowerCase()) ||
        (found && r.nombre?.toLowerCase() === found._nombre.toLowerCase())
      );

      // Pagos: localStorage inmediato, Supabase actualiza en background
      const allPagos: AllPagos = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');
      let filas: PagoRow[] = allPagos[id] ?? [];
      // Intentar obtener frescos de Supabase
      getPagos().then(sbPagos => {
        const sbFilas = sbPagos[id];
        if (sbFilas && sbFilas.length > 0) setPagos(sbFilas as PagoRow[]);
      }).catch(() => {});

      /* Si hay datos de Vista Contable, rellena vCargado vacíos */
      if (vcRow && filas.length > 0) {
        filas = filas.map(row => ({
          ...row,
          vCargado: row.vCargado || ensurePeso(vcRow[VC_KEYS[row.detalle]]) || '',
        }));
      }

      /* Normalizar meses futuros: PEND → PROX (no deben aparecer como deuda) */
      if (filas.length > 0) {
        filas = filas.map(row => ({
          ...row,
          estado: row.estado === 'PEND'  && esFuturo(row.detalle) ? 'PROX'
                : row.estado === 'PROX' && !esFuturo(row.detalle) ? 'PEND'
                : row.estado,
        }));
        setPagos(filas);
      }
      /* Si no hay filas guardadas, el segundo useEffect las crea desde VC */
      if (!allPagos[id]) (window as any).__vcRow = vcRow ?? null;
    } catch {}
  }, [id]);

  /* ─── Inicializar filas por defecto si no hay datos guardados ─── */
  useEffect(() => {
    if (!dep || pagos.length > 0) return;

    /* Intentar obtener valores desde Vista Contable */
    let vcRow: Record<string, string> | null = (window as any).__vcRow ?? null;
    if (!vcRow) {
      try {
        const vcData: Record<string, string>[] = JSON.parse(
          localStorage.getItem('futuro_vista_contable') ?? '[]'
        );
        const cod = getCol(dep, /^c[oó]d/i);
        vcRow = vcData.find(r =>
          (cod && r.codigo?.toLowerCase() === cod.toLowerCase()) ||
          r.nombre?.toLowerCase() === dep._nombre.toLowerCase()
        ) ?? null;
      } catch {}
    }

    const defaultRows: PagoRow[] = DETALLE_ROWS.map(detalle => ({
      detalle,
      vCargado: vcRow ? ensurePeso(vcRow[VC_KEYS[detalle]]) : '',
      estado: esFuturo(detalle) ? 'PROX' : 'PEND',   // PROX solo meses estrictamente futuros
      destino: '',
      fecha: '',
      vPagado: '',
    }));
    setPagos(defaultRows);
  }, [dep, pagos.length]);

  /* ─── Persistir en localStorage + Supabase ─── */
  function savePagos(updated: PagoRow[]) {
    try {
      const allPagos: AllPagos = JSON.parse(localStorage.getItem(PAGOS_KEY) ?? '{}');
      allPagos[id] = updated;
      localStorage.setItem(PAGOS_KEY, JSON.stringify(allPagos));
    } catch {}
    savePagosDeportista(id, updated as any).catch(console.error);
    setPagos(updated);
  }

  /* ─── Toggle estado ─── */
  function toggleEstado(idx: number) {
    const row = pagos[idx];
    if (row.estado === 'PAGÓ') {
      // Revertir a pendiente
      const updated = pagos.map((r, i) =>
        i === idx ? { ...r, estado: 'PEND' as const, destino: '', fecha: '', vPagado: '' } : r
      );
      savePagos(updated);
    } else {
      // Marcar como pagado
      setEditIdx(idx);
      setEditForm({ vCargado: row.vCargado, destino: row.destino, fecha: '', vPagado: row.vCargado });
    }
  }

  function confirmarPago() {
    if (editIdx === null) return;
    const updated = pagos.map((r, i) => i === editIdx ? {
      ...r,
      estado:   'PAGÓ' as const,
      vCargado: editForm.vCargado || r.vCargado,
      destino:  editForm.destino  || r.destino,
      fecha:    editForm.fecha    || r.fecha,
      vPagado:  editForm.vPagado  || r.vCargado,
    } : r);
    savePagos(updated);
    setEditIdx(null);
    setEditForm({});
  }

  /* ─── Loading ─── */
  if (!dep) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 font-semibold">Cargando...</p>
      </div>
    );
  }

  /* ─── Datos del deportista ─── */
  const nombre    = dep._nombre;
  const initials  = nombre.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const catVal    = getCol(dep, /^program|^categ/i);
  const proyecto  = getCol(dep, /^proy/i);
  const fechaAfil = getCol(dep, /fecha.*afil|afil.*fecha/i);
  const fechaNac  = construirFechaNac(dep._columnas);
  const gradiente = gradientePrograma(catVal);
  const codVal    = getCol(dep, /^c[oó]d/i);
  const sedeVal   = getCol(dep, /^sede/i);

  /* ─── Tarifa mensual según programa y sede ─── */
  function calcTarifa(prog: string, sede: string): string {
    const p = prog.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const s = sede.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const esNiquia = s.includes('niqu');
    if (esNiquia) {
      if (p.includes('estimul')) return '$70.000';
      if (p.includes('formac'))  return '$115.000';
      return '$138.000';
    }
    if (p.includes('estimul')) return '$80.000';
    return '$138.000';
  }
  const tarifa = calcTarifa(catVal, sedeVal);

  /* ─── Filas según año seleccionado ─── */
  const anioActual = new Date().getFullYear();
  const pagosVista: PagoRow[] = anio > anioActual
    ? pagos.map(r => ({ ...r, estado: 'PROX' as const, vPagado: '', destino: '', fecha: '' }))
    : anio < anioActual
    ? pagos.map(r => ({ ...r, estado: r.estado === 'PROX' ? 'PEND' as const : r.estado }))
    : pagos;

  /* ─── Totales ─── */
  const pagados    = pagosVista.filter(p => p.estado === 'PAGÓ').length;
  const pendientes = pagosVista.filter(p => p.estado === 'PEND').length;
  const totalPagado = pagosVista.reduce((s, p) => {
    const n = parseInt((p.vPagado || '0').replace(/\D/g, ''));
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  const totalPendiente = pagosVista.reduce((s, p) => {
    if (p.estado !== 'PEND') return s;
    const n = parseInt((p.vCargado || '0').replace(/\D/g, ''));
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  const G    = '#16a34a';  // verde  — columna DETALLE + V.PAGADO pagado
  const GRAY = '#4b5563';  // gris   — encabezados datos + totales
  const ROW  = '#f1f5f9';  // gris claro — filas
  const BW   = '1px solid white';

  return (
    <div className="min-h-screen bg-[#f1f5f9]">

      {/* ── HEADER ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-ec" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-ec)"/>
          </svg>
        </div>
        <button onClick={() => router.back()} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Estado de Cuenta</h1>
          <p className="text-white/60 text-xs">Control de pagos individual</p>
        </div>
        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 py-4 space-y-4">

        {/* ── TARJETA HERO ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#064e1e] via-[#052a10] to-black shadow-lg overflow-hidden">
          <div className="flex items-stretch">

            {/* FOTO — ocupa toda la altura incluyendo botones */}
            <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={subirFoto}/>
            <button
              onClick={() => fotoInputRef.current?.click()}
              className="w-32 flex-shrink-0 relative group bg-white/10">
              {foto
                ? <img src={foto} alt="" className="w-full h-full object-cover object-top"/>
                : <div className="w-full h-full flex flex-col items-center justify-center gap-2 min-h-[160px]">
                    <span className="text-white font-black text-4xl">{initials}</span>
                    <Camera className="w-5 h-5 text-white/40"/>
                  </div>
              }
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Camera className="w-8 h-8 text-white"/>
              </div>
            </button>

            {/* Columna derecha: info + botones */}
            <div className="flex-1 min-w-0 flex flex-col">

              {/* Info */}
              <div className="flex-1 p-3 space-y-1.5">

                {/* Nombre + código */}
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-white font-black text-base leading-tight uppercase tracking-wide flex-1 min-w-0">
                    {nombre}
                  </h1>
                  {codVal && (
                    <div className="flex-shrink-0 text-center">
                      <p className="text-white/60 text-[8px] font-black tracking-widest uppercase mb-0.5">CÓDIGO</p>
                      <div className="bg-[#16a34a] text-white font-black text-lg px-2.5 py-1 rounded-xl min-w-[48px] text-center shadow-sm">
                        {codVal}
                      </div>
                    </div>
                  )}
                </div>

                {/* PROGRAMA + PROYECTO misma línea */}
                {(catVal || proyecto) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {catVal && (
                      <span className="bg-[#16a34a] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                        {catVal.toUpperCase()}
                      </span>
                    )}
                    {proyecto && (
                      <span className="bg-white/15 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                        PROYECTO {proyecto.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}

                {/* FECHA DE AFILIACIÓN */}
                {fechaAfil && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-white/50 text-[9px] font-black tracking-widest uppercase">FECHA DE AFILIACIÓN</span>
                    <span className="bg-[#16a34a] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                      {formatFecha(fechaAfil)}
                    </span>
                  </div>
                )}

                {/* MENSUALIDAD */}
                <div className="text-center pt-0.5">
                  <p className="text-white/50 text-[9px] font-black tracking-widest uppercase">MENSUALIDAD</p>
                  <p className="text-[#4ade80] font-black text-2xl leading-tight">{tarifa}</p>
                </div>
              </div>

              {/* Botones — pegados al fondo de la columna derecha */}
              <div className="grid grid-cols-4 gap-1 p-2 pt-0">
                {[
                  { label: 'ASIST.',   href: `/alumnos/${id}/asistencia` },
                  { label: 'PAGOS',    href: null },
                  { label: 'INFORMES', href: '/evaluaciones' },
                  { label: 'MENSAJES', href: '/mensajes' },
                ].map(({ label, href }) => (
                  <button key={label}
                    onClick={() => href && router.push(href)}
                    className={cn(
                      'transition rounded-lg py-1 text-[10px] font-black tracking-wide',
                      !href ? 'bg-[#16a34a] text-white' : 'bg-white hover:bg-gray-100 active:bg-gray-200 text-black'
                    )}>
                    {label}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* ── RESUMEN KPI ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-lg">{pagados}</span>
            </div>
            <div>
              <p className="text-green-700 font-black text-sm">Pagos realizados</p>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-lg">{pendientes}</span>
            </div>
            <div>
              <p className="text-red-700 font-black text-sm">Pendientes</p>
              <p className="text-red-600 text-[11px]">${totalPendiente.toLocaleString('es-CO').replace(/,/g,'.')}</p>
            </div>
          </div>
        </div>

        {/* ── SELECTOR AÑO ── */}
        <div className="flex items-center justify-between">
          <h3 className="text-[#111827] font-black text-base tracking-wide">
            ESTADO DE CUENTA DEL DEPORTISTA
          </h3>
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="border border-green-300 rounded-xl px-3 py-1.5 text-sm font-black text-[#111827] focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
            {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* ── TABLA ── */}
        <div className="rounded-2xl overflow-hidden shadow-md border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {[
                  { label: 'DETALLE',    w: '22%' },
                  { label: 'V. PAGADO',  w: '20%' },
                  { label: 'DESTINO',    w: '18%' },
                  { label: 'FECHA',      w: '18%' },
                  { label: 'ESTADO PAGO',w: '22%' },
                ].map(({ label, w }) => (
                  <th key={label} style={{ background: '#111827', color: 'white', border: BW, padding: '10px 8px', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', width: w }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagosVista.map((row, idx) => {
                const isPaid = row.estado === 'PAGÓ';
                const isProx = row.estado === 'PROX';
                const rowBg   = isProx ? '#f9fafb' : ROW;
                const detBg   = isProx ? '#9ca3af' : isPaid ? G : '#dc2626';
                return (
                  <tr key={idx} style={{ opacity: isProx ? 0.6 : 1 }}>
                    {/* DETALLE */}
                    <td style={{ background: detBg, color: 'white', border: BW, padding: '8px 10px', textAlign: 'center', fontWeight: 900, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {row.detalle}
                    </td>

                    {/* V. PAGADO */}
                    <td style={{ background: isPaid ? G : rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      <input
                        value={row.vPagado}
                        readOnly={!isPaid}
                        onChange={e => { if (!isPaid) return; const u = pagos.map((r,i) => i===idx ? {...r, vPagado: e.target.value} : r); savePagos(u); }}
                        className={cn('w-full text-center font-bold text-xs bg-transparent focus:outline-none px-1 py-1',
                          isPaid ? 'text-white' : 'text-gray-400 cursor-default')}
                        placeholder="—"
                      />
                    </td>

                    {/* DESTINO */}
                    <td style={{ background: rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      <input
                        value={row.destino}
                        onChange={e => { const u = pagos.map((r,i) => i===idx ? {...r, destino: e.target.value} : r); savePagos(u); }}
                        className="w-full text-center font-semibold text-xs text-[#111827] bg-transparent focus:outline-none focus:bg-white focus:rounded px-1 py-1"
                        placeholder="—"
                      />
                    </td>

                    {/* FECHA */}
                    <td style={{ background: rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      <input
                        value={formatFecha(row.fecha)}
                        onChange={e => { const u = pagos.map((r,i) => i===idx ? {...r, fecha: e.target.value} : r); savePagos(u); }}
                        className="w-full text-center font-semibold text-xs text-[#111827] bg-transparent focus:outline-none focus:bg-white focus:rounded px-1 py-1"
                        placeholder="DD/MM/AAAA"
                      />
                    </td>

                    {/* ESTADO PAGO */}
                    <td style={{ background: rowBg, border: BW, padding: '6px 4px', textAlign: 'center' }}>
                      {isProx
                        ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                            style={{ background:'#e5e7eb', color:'#9ca3af' }}>PRÓX</span>
                        : <button onClick={() => toggleEstado(idx)}
                            className={cn('px-3 py-1 rounded font-black text-white text-[11px] transition w-full',
                              isPaid ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600')}>
                            {isPaid ? 'PAGÓ' : 'PEND'}
                          </button>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

        {/* ── NOTA ── */}
        <p className="text-center text-[11px] text-gray-400 pb-4">
          Toca <strong>PEND</strong> para registrar un pago · Toca <strong>PAGÓ</strong> para revertir
        </p>

      </main>

      {/* ── MODAL REGISTRAR PAGO ── */}
      {editIdx !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden"/>
            <h3 className="font-black text-[#111827] text-base mb-1">Registrar Pago</h3>
            <p className="text-gray-400 text-xs mb-5 font-semibold">{pagos[editIdx]?.detalle} — {anio}</p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Cargado</label>
                <input
                  value={editForm.vCargado || ''}
                  onChange={e => setEditForm(f => ({ ...f, vCargado: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-[#111827]"
                  placeholder="$138.000"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Destino / Cuenta</label>
                <input
                  value={editForm.destino || ''}
                  onChange={e => setEditForm(f => ({ ...f, destino: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-[#111827]"
                  placeholder="613"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha de Pago</label>
                <input
                  type="date"
                  onChange={e => {
                    const d = e.target.value;
                    if (d) {
                      const [y, m, day] = d.split('-');
                      setEditForm(f => ({ ...f, fecha: `${day}/${m}/${y.slice(2)}` }));
                    }
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-[#111827]"
                />
                {editForm.fecha && (
                  <p className="text-[11px] text-green-600 font-bold mt-1">→ {editForm.fecha}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Pagado</label>
                <input
                  value={editForm.vPagado || ''}
                  onChange={e => setEditForm(f => ({ ...f, vPagado: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-[#111827]"
                  placeholder="$138.000"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setEditIdx(null); setEditForm({}); }}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button
                onClick={confirmarPago}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-black transition">
                ✓ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
