'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import LoadingBall from '@/components/LoadingBall';
import { cn } from '@/lib/utils';
import { getDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { getFoto, saveFoto, savePagosDeportista, getPagos } from '@/lib/db';

const FOTOS_KEY    = 'futuro_fotos_deportistas';
const PAGOS_KEY    = 'futuro_pagos_estado';

const DETALLE_ROWS = [
  'MATRÍCULA 2026',
  'FEBRERO 2026','MARZO 2026','ABRIL 2026','MAYO 2026','JUNIO 2026',
  'JULIO 2026','AGOSTO 2026','SEPTIEMBRE 2026','OCTUBRE 2026','NOVIEMBRE 2026','DICIEMBRE 2026',
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
  'MATRÍCULA 2026':   'matricula',
  'FEBRERO 2026':     'feb',  'MARZO 2026':      'mar',  'ABRIL 2026':    'abr',
  'MAYO 2026':        'may',  'JUNIO 2026':      'jun',  'JULIO 2026':    'jul',
  'AGOSTO 2026':      'ago',  'SEPTIEMBRE 2026': 'sep',  'OCTUBRE 2026':  'oct',
  'NOVIEMBRE 2026':   'nov',  'DICIEMBRE 2026':  'dic',
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
  'MATRÍCULA 2026': 0,
  'FEBRERO 2026':2,'MARZO 2026':3,'ABRIL 2026':4,'MAYO 2026':5,'JUNIO 2026':6,
  'JULIO 2026':7,'AGOSTO 2026':8,'SEPTIEMBRE 2026':9,'OCTUBRE 2026':10,'NOVIEMBRE 2026':11,'DICIEMBRE 2026':12,
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

/** Extrae código numérico del deportista eliminando tildes para comparación robusta */
function sinTildesEC(s: string): string {
  return String(s ?? '').normalize('NFD').split('').filter(
    c => c.charCodeAt(0) < 0x0300 || c.charCodeAt(0) > 0x036f
  ).join('').toUpperCase();
}

/** Devuelve TODOS los posibles códigos de 4-5 dígitos del deportista,
 *  normalizados con parseInt (elimina ceros iniciales).
 *  Excluye años (2020-2099) para evitar falsos positivos. */
function todosLosCodigos(dep: Deportista): string[] {
  const cols = dep._columnas ?? {};
  const result: string[] = [];
  const seen  = new Set<string>();

  const add = (digits: string) => {
    if (!digits) return;
    const n = parseInt(digits, 10);
    if (isNaN(n)) return;
    // Excluir años
    if (n >= 2000 && n <= 2099 && digits.length === 4) return;
    const key = String(n);
    if (!seen.has(key)) { seen.add(key); result.push(key); }
    // Agregar también con ceros originales por si el import guardó con ellos
    if (digits !== key && !seen.has(digits)) { seen.add(digits); result.push(digits); }
  };

  // 1. Prioridad: columna cuyo nombre empiece con "cod"
  const kCod = Object.keys(cols).find(k => /^cod/i.test(sinTildesEC(k)));
  if (kCod) {
    const digits = String(cols[kCod] ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) add(digits);
  }

  // 2. Cualquier columna con valor de 4-5 dígitos
  for (const v of Object.values(cols)) {
    const digits = String(v ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) add(digits);
  }

  return result;
}

/** Obtiene el código principal (primer resultado normalizado) */
function getCodigoDeportista(dep: Deportista): string {
  return todosLosCodigos(dep)[0] ?? '';
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

  const [dep,      setDep]     = useState<Deportista | null>(null);
  const [foto,     setFoto]    = useState<string | null>(null);
  const [pagos,    setPagos]   = useState<PagoRow[]>([]);
  const [editIdx,  setEditIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PagoRow>>({});
  const [anio,     setAnio]    = useState(new Date().getFullYear());
  const [debugInfo, setDebugInfo] = useState<{
    codigosDep: string[];
    clavesPagos: string[];
    filasPorCod: { cod: string; cant: number }[];
    filasPorId: number;
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
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
    Promise.all([getDeportistas(), getPagos(), getFoto(id)]).then(([lista, allPagos, foto]) => {
      const found = lista.find(d => d.id === id);
      if (found) setDep(found);
      if (foto) setFoto(foto);

      /* ── Buscar pagos por dep.id Y por código(s) de 4-5 dígitos ──────────
         El Libro Contable guarda bajo el código numérico (ej: "8095").
         Las ediciones manuales se guardan bajo dep.id (ej: "dep-xxx-42").
         Probamos TODOS los posibles códigos del deportista para no perder
         pagos importados aunque haya diferencias de formato (ceros iniciales). */
      const codigosDep = found ? todosLosCodigos(found) : [];

      /* Merge: dep.id gana (manual > import) */
      const mergeMap = new Map<string, PagoRow>();

      /* Base: pagos importados (todos los códigos posibles) */
      for (const cod of codigosDep) {
        for (const r of ((allPagos as AllPagos)[cod] ?? [])) {
          mergeMap.set(r.detalle, r);
        }
      }

      /* Override: ediciones manuales bajo dep.id */
      for (const r of ((allPagos as AllPagos)[id] ?? [])) {
        mergeMap.set(r.detalle, r);
      }

      let filas: PagoRow[] = Array.from(mergeMap.values());

      /* Guardar info de diagnóstico */
      setDebugInfo({
        codigosDep,
        clavesPagos: Object.keys(allPagos as AllPagos),
        filasPorCod: codigosDep.map(cod => ({
          cod,
          cant: ((allPagos as AllPagos)[cod] ?? []).length,
        })),
        filasPorId: ((allPagos as AllPagos)[id] ?? []).length,
      });

      /* Migrar nombres viejos → nombres con 2026 */
      const MIGRAR: Record<string, string> = {
        'MATRÍCULA':'MATRÍCULA 2026',
        'FEBRERO':'FEBRERO 2026','MARZO':'MARZO 2026','ABRIL':'ABRIL 2026',
        'MAYO':'MAYO 2026','JUNIO':'JUNIO 2026','JULIO':'JULIO 2026',
        'AGOSTO':'AGOSTO 2026','SEPTIEMBRE':'SEPTIEMBRE 2026','OCTUBRE':'OCTUBRE 2026',
        'NOVIEMBRE':'NOVIEMBRE 2026','DICIEMBRE':'DICIEMBRE 2026',
      };
      filas = filas.map(row => ({
        ...row,
        detalle: MIGRAR[row.detalle] ?? row.detalle,
      }));

      /* Construir SIEMPRE las 12 filas de DETALLE_ROWS.
         Si existe dato guardado para ese mes → se usa (con su estado PAGÓ / PEND / PROX).
         Si no existe → fila vacía con PEND o PROX según si el mes es futuro.
         Así, aunque el Libro Contable solo haya subido 3 meses pagados,
         se ven los 12 meses correctamente. */
      const filasMap = new Map(filas.map(r => [r.detalle, r]));
      const fullRows: PagoRow[] = DETALLE_ROWS.map(detalle => {
        const saved = filasMap.get(detalle);
        if (saved) {
          return {
            ...saved,
            estado: saved.estado === 'PEND' && esFuturo(detalle) ? 'PROX'
                  : saved.estado === 'PROX' && !esFuturo(detalle) ? 'PEND'
                  : saved.estado,
          };
        }
        return {
          detalle,
          vCargado: '',
          estado: esFuturo(detalle) ? 'PROX' : 'PEND',
          destino: '',
          fecha: '',
          vPagado: '',
        };
      });
      setPagos(fullRows);
    }).catch(console.error);
  }, [id]);

  /* ─── Rellenar vCargado desde Vista Contable (siempre que dep esté listo) ─── */
  useEffect(() => {
    if (!dep) return;

    import('@/lib/db').then(({ getVistaContable }) => getVistaContable()).then(vcData => {
      const cod = getCol(dep, /^c[oó]d/i);
      const vcRow = vcData.find((r: any) =>
        (cod && r.codigo?.toLowerCase() === cod.toLowerCase()) ||
        r.nombre?.toLowerCase() === dep._nombre.toLowerCase()
      ) ?? null;

      if (!vcRow) return;

      /* Solo actualizar filas donde vCargado esté vacío */
      setPagos(prev => prev.map(row => ({
        ...row,
        vCargado: row.vCargado || ensurePeso(vcRow[VC_KEYS[row.detalle]]) || '',
      })));
    }).catch(console.error);
  }, [dep]);

  /* ─── Persistir en Supabase ─── */
  function savePagos(updated: PagoRow[]) {
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
    return <LoadingBall />;
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
    const strip = (v: string) => String(v ?? '').toLowerCase().normalize('NFD').split('').filter(
      c => c.charCodeAt(0) < 0x0300 || c.charCodeAt(0) > 0x036f
    ).join('');
    const p = strip(prog);
    const s = strip(sede);
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
        <button onClick={() => window.history.length > 1 ? router.back() : router.push(`/alumnos/${id}`)} className="relative text-white/70 hover:text-white transition">
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
                  { label: 'FECHA',        w: '16%' },
                  { label: 'DESCRIPCIÓN',  w: '22%' },
                  { label: 'DETALLE',      w: '20%' },
                  { label: 'V. PAGADO',    w: '20%' },
                  { label: 'ESTADO PAGO',  w: '22%' },
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

                    {/* FECHA */}
                    <td style={{ background: rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      <input
                        value={formatFecha(row.fecha)}
                        onChange={e => { const u = pagos.map((r,i) => i===idx ? {...r, fecha: e.target.value} : r); savePagos(u); }}
                        className="w-full text-center font-semibold text-xs text-[#111827] bg-transparent focus:outline-none focus:bg-white focus:rounded px-1 py-1"
                        placeholder="DD/MM/AAAA"
                      />
                    </td>

                    {/* DESCRIPCIÓN (campo destino) */}
                    <td style={{ background: rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      <input
                        value={row.destino}
                        onChange={e => { const u = pagos.map((r,i) => i===idx ? {...r, destino: e.target.value} : r); savePagos(u); }}
                        className="w-full text-center font-semibold text-xs text-[#111827] bg-transparent focus:outline-none focus:bg-white focus:rounded px-1 py-1"
                        placeholder="—"
                      />
                    </td>

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

        {/* ── PANEL DEBUG ── */}
        <div className="border-t border-gray-200 pt-3">
          <button
            onClick={() => setShowDebug(v => !v)}
            className="w-full text-xs text-gray-400 font-semibold py-1.5 hover:text-gray-600 transition"
          >
            {showDebug ? '▲ Ocultar diagnóstico' : '🔍 Ver diagnóstico de pagos'}
          </button>
          {showDebug && debugInfo && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-[10px] font-mono space-y-1.5 text-gray-700">
              <p className="font-black text-gray-800 text-xs">🔍 Diagnóstico Estado de Cuenta</p>
              <p><strong>ID deportista:</strong> {id}</p>
              <p><strong>Códigos detectados en _columnas:</strong>{' '}
                <span className={debugInfo.codigosDep.length ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>
                  {debugInfo.codigosDep.length ? debugInfo.codigosDep.join(', ') : '⚠ NINGUNO'}
                </span>
              </p>
              <p><strong>Filas por código:</strong>{' '}
                {debugInfo.filasPorCod.map(fc => (
                  <span key={fc.cod} className={`mr-2 ${fc.cant > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}`}>
                    {fc.cod}={fc.cant}
                  </span>
                ))}
                {debugInfo.filasPorCod.every(fc => fc.cant === 0) &&
                  <span className="text-red-600 font-bold">⚠ 0 filas encontradas</span>
                }
              </p>
              <p><strong>Filas por dep.id:</strong>{' '}
                <span className={debugInfo.filasPorId > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}>
                  {debugInfo.filasPorId}
                </span>
              </p>
              <p><strong>Claves en allPagos ({debugInfo.clavesPagos.length} total):</strong></p>
              <div className="bg-white rounded p-1.5 max-h-24 overflow-y-auto break-all">
                {debugInfo.clavesPagos.length === 0
                  ? <span className="text-red-600">⚠ allPagos está VACÍO</span>
                  : debugInfo.clavesPagos.map((k, i) => (
                      <span key={i} className={`mr-2 ${/^\d{4,5}$/.test(k) ? 'text-blue-700 font-bold' : 'text-gray-500'}`}>
                        {k}
                      </span>
                    ))
                }
              </div>
              <p className="text-[9px] text-gray-400">Azul = claves numéricas (Libro Contable) · Gris = dep.id</p>
            </div>
          )}
        </div>

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
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descripción</label>
                <input
                  value={editForm.destino || ''}
                  onChange={e => setEditForm(f => ({ ...f, destino: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-[#111827]"
                  placeholder="Ej: Transferencia, efectivo..."
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
