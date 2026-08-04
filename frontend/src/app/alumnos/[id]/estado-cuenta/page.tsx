'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import LoadingBall from '@/components/LoadingBall';
import { cn } from '@/lib/utils';
import { getDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { getFoto, saveFoto, savePagosDeportista, getPagosPorCodigos, saveSoportePago, eliminarSoportePorNombre } from '@/lib/db';
import { useAuthStore } from '@/store/auth.store';

const FOTOS_KEY    = 'futuro_fotos_deportistas';
const PAGOS_KEY    = 'futuro_pagos_estado';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

interface OtroPago { id: string; producto_id: string | null; descripcion: string; tipo: string; valor: number; fecha: string | null; estado: 'PAGÓ' | 'PEND'; }
interface Producto  { id: string; tipo: string; descripcion: string; valor: number; }

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
  estado: 'PAGÓ' | 'PEND' | 'PROX' | 'ELIM';
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
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k));
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
 *  Nota: valores de la columna CÓDIGO nunca se filtran como "año" — un código
 *  como "2018" es un ID válido aunque parezca un año. */
function todosLosCodigos(dep: Deportista): string[] {
  const cols = dep._columnas ?? {};
  const result: string[] = [];
  const seen  = new Set<string>();

  const add = (digits: string, esCodColumna = false) => {
    if (!digits) return;
    const n = parseInt(digits, 10);
    if (isNaN(n)) return;
    // Excluir años SOLO en columnas que NO son la columna CÓDIGO explícita
    if (!esCodColumna && n >= 2000 && n <= 2099 && digits.length === 4) return;
    const key = String(n);
    if (!seen.has(key)) { seen.add(key); result.push(key); }
    // Agregar también con ceros originales por si el import guardó con ellos
    if (digits !== key && !seen.has(digits)) { seen.add(digits); result.push(digits); }
  };

  // 1. Prioridad: columna cuyo nombre empiece con "cod" — NUNCA filtrar como año
  const kCod = Object.keys(cols).find(k => /^cod/i.test(sinTildesEC(k)));
  if (kCod) {
    const digits = String(cols[kCod] ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) add(digits, true); // true = es columna CÓDIGO
  }

  // 2. Cualquier otra columna con valor de 4-5 dígitos (sí filtra años)
  for (const [k, v] of Object.entries(cols)) {
    if (k === kCod) continue; // ya procesada arriba
    const digits = String(v ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) add(digits, false);
  }

  return result;
}

/** Obtiene el código principal (primer resultado normalizado) */
function getCodigoDeportista(dep: Deportista): string {
  return todosLosCodigos(dep)[0] ?? '';
}

/** Código completo incluyendo prefijo B/MB */
function getCodigoRaw(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const kCod = Object.keys(cols).find(k => /^cod/i.test(sinTildesEC(k)));
  return kCod ? String(cols[kCod] ?? '').trim() : '';
}

/** Deportista BECADO: código empieza con "B" pero NO con "MB" → no paga nada */
function esBecado(codRaw: string): boolean {
  return /^b\d/i.test(codRaw.trim()) && !/^mb/i.test(codRaw.trim());
}

/** Deportista MEDIA BECA: código empieza con "MB" → paga la mitad, funciona normal */
function esMediaBeca(codRaw: string): boolean {
  return /^mb/i.test(codRaw.trim());
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

function EstadoCuentaInner() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const puedeEditar = searchParams.get('edit') === '1';
  const esReadonly  = searchParams.get('readonly') === '1';
  const { usuario } = useAuthStore();
  const esProfesor   = usuario?.rol === 'profesor';
  const esDeportista = usuario?.rol === 'deportista' || usuario?.rol === 'padre';

  const [dep,      setDep]     = useState<Deportista | null>(null);
  const [foto,     setFoto]    = useState<string | null>(null);
  const [pagos,    setPagos]   = useState<PagoRow[]>([]);
  const [editIdx,       setEditIdx]       = useState<number | null>(null);
  const [editForm,      setEditForm]      = useState<Partial<PagoRow>>({});
  const [elimConfirm,   setElimConfirm]   = useState<number | null>(null);
  const [anio,     setAnio]    = useState(new Date().getFullYear());
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoModalIdx,  setPagoModalIdx]  = useState<number | null>(null);
  const fotoInputRef    = useRef<HTMLInputElement>(null);
  const soporteInputRef = useRef<HTMLInputElement>(null);
  const [soportes,    setSoportes]    = useState<{ name: string; data: string; date: string }[]>([]);
  const [verSoportes, setVerSoportes] = useState(false);
  const [pendingFiles,     setPendingFiles]     = useState<{ name: string; data: string; date: string }[]>([]);
  const [nombreSoporte,    setNombreSoporte]    = useState('');
  const [showNombreModal,  setShowNombreModal]  = useState(false);
  const [mesesSelSoporte,  setMesesSelSoporte]  = useState<string[]>([]);
  const [toastSoporte,     setToastSoporte]     = useState(false);

  // ── OTROS PAGOS ────────────────────────────────────────────────
  const xlsxInputRef            = useRef<HTMLInputElement>(null);
  const [otrosPagos,    setOtrosPagos]    = useState<OtroPago[]>([]);
  const [productosLst,  setProductosLst]  = useState<Producto[]>([]);
  const [showAddOtro,   setShowAddOtro]   = useState(false);
  const [selProdId,     setSelProdId]     = useState('');
  const [guardandoOtro, setGuardandoOtro] = useState(false);
  const esAdmin = usuario?.rol === 'administracion' || usuario?.rol === 'contable';

  useEffect(() => {
    if (!id) return;
    fetch(`${SB_URL}/rest/v1/otros_pagos?deportista_id=eq.${id}&order=created_at.asc`, { headers: SB_HDR })
      .then(r => r.json()).then(d => setOtrosPagos(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${SB_URL}/rest/v1/productos?activo=eq.true&order=tipo.asc,descripcion.asc`, { headers: SB_HDR })
      .then(r => r.json()).then(d => setProductosLst(Array.isArray(d) ? d : [])).catch(() => {});
  }, [id]);

  async function agregarOtroPago() {
    const prod = productosLst.find(p => p.id === selProdId);
    if (!prod) return;
    setGuardandoOtro(true);
    try {
      const body = { deportista_id: id, producto_id: prod.id, descripcion: prod.descripcion, tipo: prod.tipo, valor: prod.valor, estado: 'PEND' };
      const res = await fetch(`${SB_URL}/rest/v1/otros_pagos`, { method: 'POST', headers: SB_HDR, body: JSON.stringify(body) });
      const data = await res.json();
      const nuevo = Array.isArray(data) ? data[0] : null;
      if (nuevo) setOtrosPagos(prev => [...prev, nuevo]);
      setShowAddOtro(false); setSelProdId('');
    } finally { setGuardandoOtro(false); }
  }

  async function toggleEstadoOtro(op: OtroPago) {
    const nuevo = op.estado === 'PAGÓ' ? 'PEND' : 'PAGÓ';
    await fetch(`${SB_URL}/rest/v1/otros_pagos?id=eq.${op.id}`, { method: 'PATCH', headers: SB_HDR, body: JSON.stringify({ estado: nuevo }) });
    setOtrosPagos(prev => prev.map(p => p.id === op.id ? { ...p, estado: nuevo } : p));
  }

  async function eliminarOtroPago(op: OtroPago) {
    if (!confirm(`¿Eliminar "${op.descripcion}"?`)) return;
    await fetch(`${SB_URL}/rest/v1/otros_pagos?id=eq.${op.id}`, { method: 'DELETE', headers: SB_HDR });
    setOtrosPagos(prev => prev.filter(p => p.id !== op.id));
  }

  async function importarXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (xlsxInputRef.current) xlsxInputRef.current.value = '';
    // Cargar SheetJS desde CDN (no requiere instalación local)
    if (!(window as any).XLSX) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const XLSX = (window as any).XLSX;
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf);
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    const body = rows.slice(1).filter(r => r[0]).map(r => ({
      deportista_id: id,
      producto_id: null,
      descripcion: String(r[0] ?? '').trim(),
      tipo: String(r[1] ?? 'implemento').toLowerCase().includes('torneo') ? 'torneo' : 'implemento',
      valor: parseFloat(String(r[2] ?? '0').replace(/[^0-9.]/g, '')) || 0,
      fecha: r[3] ? String(r[3]).trim() : null,
      estado: 'PEND',
    })).filter(b => b.descripcion && b.valor > 0);
    if (!body.length) { alert('No se encontraron filas válidas (columnas: Descripción, Tipo, Valor, Fecha)'); return; }
    const res = await fetch(`${SB_URL}/rest/v1/otros_pagos`, { method: 'POST', headers: SB_HDR, body: JSON.stringify(body) });
    const nuevos = await res.json();
    if (Array.isArray(nuevos)) setOtrosPagos(prev => [...prev, ...nuevos]);
  }

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

  /* ─── Cargar soportes de pago desde localStorage ─── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`futuro_soportes_${id}`);
      if (raw) setSoportes(JSON.parse(raw));
    } catch {}
  }, [id]);

  function subirSoporte(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (soporteInputRef.current) soporteInputRef.current.value = '';
    Promise.all(
      files.map(file => new Promise<{ name: string; data: string; date: string }>(resolve => {
        const reader = new FileReader();
        reader.onload = ev => resolve({
          name: file.name.replace(/\.[^.]+$/, ''), // sin extensión — editable en modal
          data: ev.target?.result as string,
          date: new Date().toLocaleDateString('es-CO'),
        });
        reader.readAsDataURL(file);
      }))
    ).then(leidos => {
      setPendingFiles(leidos);
      setNombreSoporte(leidos[0]?.name ?? '');
      setMesesSelSoporte([]);
      setShowNombreModal(true);
    });
  }

  function confirmarNombreSoporte() {
    const base = nombreSoporte.trim() || pendingFiles[0]?.name || 'soporte';
    const nuevos = pendingFiles.map((f, i) => ({
      ...f,
      name: pendingFiles.length > 1 ? `${base} (${i + 1})` : base,
      meses: mesesSelSoporte,
    }));
    setSoportes(prev => {
      const updated = [...prev, ...nuevos];
      try { localStorage.setItem(`futuro_soportes_${id}`, JSON.stringify(updated)); } catch {}
      return updated;
    });
    // Guardar también en Supabase para que el admin pueda ver los soportes pendientes
    nuevos.forEach(s => saveSoportePago(id as string, s).catch(() => {}));
    setPendingFiles([]);
    setNombreSoporte('');
    setMesesSelSoporte([]);
    setShowNombreModal(false);
    setToastSoporte(true);
    setTimeout(() => setToastSoporte(false), 5000);
  }

  function eliminarSoporte(idx: number) {
    const nombre = soportes[idx]?.name;
    if (nombre && id) eliminarSoportePorNombre(id as string, nombre);
    setSoportes(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      try { localStorage.setItem(`futuro_soportes_${id}`, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  /* ─── Cargar deportista y pagos guardados ─── */
  useEffect(() => {
    // 1. Primero cargamos el deportista y la foto
    Promise.all([getDeportistas(), getFoto(id)]).then(([lista, foto]) => {
      const found = lista.find(d => d.id === id);
      if (found) setDep(found);
      if (foto) setFoto(foto);

      /* ── Buscar pagos por dep.id Y por código(s) de 4-5 dígitos ──────────
         El Libro Contable guarda bajo el código numérico (ej: "8095").
         Las ediciones manuales se guardan bajo dep.id (ej: "dep-xxx-42").
         getPagosPorCodigos() filtra en Supabase → escala sin importar el total. */
      const codigosDep = found ? todosLosCodigos(found) : [];
      const todosIds   = [...new Set([id, ...codigosDep])]; // dep.id + códigos numéricos

      // 2. Luego cargamos SOLO los pagos de este deportista
      getPagosPorCodigos(todosIds).then(allPagos => {
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
      }).catch(console.error);  // cierra getPagosPorCodigos.then()
    }).catch(console.error);    // cierra Promise.all.then()
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

  /* ─── Buscar índice real en pagos[] a partir del índice de vista ─── */
  function realIdxDe(viewIdx: number): number {
    const detalle = pagosVista[viewIdx]?.detalle;
    if (!detalle) return -1;
    return pagos.findIndex(r => r.detalle === detalle);
  }

  /* ─── Toggle estado ─── */
  function toggleEstado(viewIdx: number) {
    const row     = pagosVista[viewIdx];
    const realIdx = realIdxDe(viewIdx);
    if (!row || realIdx === -1) return;
    if (row.estado === 'PAGÓ') {
      /* Pide confirmación antes de revertir */
      setConfirmRevert(viewIdx);
    } else {
      setEditIdx(viewIdx);
      setEditForm({ vCargado: row.vCargado, destino: row.destino, fecha: '', vPagado: row.vCargado });
    }
  }

  function ejecutarRevert() {
    if (confirmRevert === null) return;
    const realIdx = realIdxDe(confirmRevert);
    if (realIdx !== -1) {
      const updated = pagos.map((r, i) =>
        i === realIdx ? { ...r, estado: 'PEND' as const, destino: '', fecha: '', vPagado: '' } : r
      );
      savePagos(updated);
    }
    setConfirmRevert(null);
  }

  function confirmarPago() {
    if (editIdx === null) return;
    const realIdx = realIdxDe(editIdx);
    if (realIdx === -1) return;
    const updated = pagos.map((r, i) => i === realIdx ? {
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

  /** Elimina un mes del cobro (desde el modal de PEND) */
  function eliminarMes(viewIdx: number) {
    const realIdx = realIdxDe(viewIdx);
    if (realIdx === -1) return;
    const updated = pagos.map((r, i) => i === realIdx
      ? { ...r, estado: 'ELIM' as const, vPagado: '', destino: '', fecha: '' }
      : r
    );
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
  const codRaw    = getCodigoRaw(dep);
  const becado    = esBecado(codRaw);
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

  /* ─── Mes de afiliación (para ocultar meses anteriores solo si se afilió en 2026) ───
     Si la afiliación es de 2025 o antes → mostrar todos los meses (mesAfilNum = 1).
     Si la afiliación es de 2026         → mostrar solo desde ese mes en adelante.  */
  const mesAfilNum = (() => {
    if (!fechaAfil) return 1;
    const f = formatFecha(fechaAfil);
    const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
    if (!m) return 1;
    const mes      = parseInt(m[1], 10);
    const anioAfil = parseInt(m[2], 10);
    if (anioAfil < 2026) return 1; // matriculado en 2025 o antes → todos los meses
    return mes;
  })();

  /* ─── Filas según año seleccionado ─── */
  const anioActual = new Date().getFullYear();
  const pagosVista: PagoRow[] = (anio > anioActual
    ? pagos.map(r => ({ ...r, estado: 'PROX' as const, vPagado: '', destino: '', fecha: '' }))
    : anio < anioActual
    ? pagos.map(r => ({ ...r, estado: r.estado === 'PROX' ? 'PEND' as const : r.estado }))
    : pagos
  ).filter(r => {
    if (r.estado === 'ELIM') return false;           // mes eliminado → oculto
    const rowNum = MES_NUM[r.detalle];
    if (rowNum === undefined || rowNum === 0) return true; // MATRÍCULA siempre
    return rowNum >= mesAfilNum;
  });

  /* ─── Totales ─── */
  // Si es BECADO: todos los meses cuentan como pagados, sin pendientes
  const pagados    = becado ? pagosVista.length : pagosVista.filter(p => p.estado === 'PAGÓ').length;
  const pendientes = becado ? 0 : pagosVista.filter(p => p.estado === 'PEND').length;
  const proximos   = becado ? 0 : pagosVista.filter(p => p.estado === 'PROX').length;
  const cargados   = pagados + pendientes + proximos;
  const totalPagado = becado ? 0 : pagosVista.reduce((s, p) => {
    const n = parseInt((p.vPagado || '0').replace(/\D/g, ''));
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  const totalPendiente = becado ? 0 : pagosVista.reduce((s, p) => {
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
        <div className="flex flex-col items-end flex-shrink-0">
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/60 text-[8px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 py-4 space-y-4">

        {/* ── TARJETA HERO ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#0a2e12] via-[#052a10] to-black p-4 shadow-xl">
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={subirFoto}/>

          {/* Fila superior: foto 3×4 + info + código */}
          <div className="flex items-stretch gap-3">

            {/* Foto 3×4 */}
            <button onClick={() => fotoInputRef.current?.click()}
              className="relative flex-shrink-0 group">
              <div className="w-[72px] h-[96px] rounded-xl overflow-hidden bg-[#0d3d1a] border border-white/20 flex flex-col items-center justify-center">
                {foto
                  ? <img src={foto} alt="" className="w-full h-full object-cover object-top"/>
                  : <>
                      <span className="text-white font-black text-3xl select-none">{initials}</span>
                      <Camera className="w-4 h-4 text-white/40 mt-1"/>
                    </>
                }
                <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white"/>
                </div>
              </div>
            </button>

            {/* Nombre + filas de datos */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <h1 className="text-white font-black text-base leading-tight uppercase tracking-wide">
                {nombre}
              </h1>

              {/* Filas de datos */}
              <div className="space-y-[5px]">
                {[
                  { label: 'PROGRAMA',    val: catVal },
                  { label: 'PROYECTO',    val: proyecto },
                  { label: 'FECHA AFIL.', val: fechaAfil ? formatFecha(fechaAfil) : '' },
                  { label: 'MENSUALIDAD', val: tarifa },
                ].filter(r => r.val).map(({ label, val }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="bg-[#16a34a] text-white text-[10px] font-black px-2 py-[3px] rounded-md w-[80px] text-center flex-shrink-0 tracking-wide">
                      {label}
                    </span>
                    <span className="text-white text-[11px] font-semibold truncate">
                      {String(val).toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* CÓDIGO + botones 2×2 debajo */}
            {codVal && (
              <div className="flex-shrink-0 flex flex-col items-center gap-1.5 self-start">
                <p className="text-white/60 text-[9px] font-black tracking-widest uppercase">CÓDIGO</p>
                <div className="bg-[#16a34a] text-white font-black text-lg px-3 py-2 rounded-xl min-w-[60px] text-center shadow-md leading-none">
                  {codVal}
                </div>
                {/* Botones nav: siempre 4 secciones accesibles */}
                <div className="grid grid-cols-2 gap-1 w-full">
                  {(esDeportista
                    ? [
                        { label: 'PAGOS',  href: null,                               active: true  },
                        { label: 'ASIST.', href: `/alumnos/${id}/asistencia`,        active: false },
                        { label: 'MENS.',  href: '/mensajes',                         active: false },
                      ]
                    : [
                        { label: 'PAGOS',  href: null,                               active: true  },
                        { label: 'ASIST.', href: `/alumnos/${id}/asistencia`,        active: false },
                        { label: 'INF.',   href: codVal ? `/evaluaciones?cod=${encodeURIComponent(codVal)}` : '/evaluaciones', active: false },
                        { label: 'MENS.',  href: '/mensajes',                        active: false },
                      ]
                  ).map(({ label, href, active }) => (
                    <button key={label}
                      onClick={() => href && router.push(href)}
                      className={cn(
                        'transition rounded-lg py-1.5 px-1 text-[9px] font-black tracking-wide text-center w-full',
                        active
                          ? 'bg-[#16a34a] text-white'
                          : 'bg-white/15 hover:bg-white/25 border border-white/20 text-white'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── RESUMEN KPI ── */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-gray-100 border border-gray-300 rounded-xl p-2 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">{cargados}</span>
            </div>
            <p className="text-gray-600 font-black text-[9px] leading-tight text-center">Cargados</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-2 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">{pagados}</span>
            </div>
            <p className="text-green-700 font-black text-[9px] leading-tight text-center">Pagados</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-2 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">{pendientes}</span>
            </div>
            <p className="text-red-700 font-black text-[9px] leading-tight text-center">Pendientes</p>
            {totalPendiente > 0 && <p className="text-red-500 text-[8px] font-bold text-center">${totalPendiente.toLocaleString('es-CO').replace(/,/g,'.')}</p>}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">{proximos}</span>
            </div>
            <p className="text-blue-700 font-black text-[9px] leading-tight text-center">Próximos</p>
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
        <div className="rounded-2xl shadow-md border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto w-full -webkit-overflow-scrolling-touch">
          <table className="border-collapse" style={{ width: '100%', minWidth: 300 }}>
            <thead>
              <tr>
                {[
                  { label: 'FECHA',     pct: '20%' },
                  { label: 'V. PAGADO', pct: '22%' },
                  { label: 'DETALLE',   pct: '32%' },
                  { label: 'ESTADO',    pct: '26%' },
                ].map(({ label, pct }) => (
                  <th key={label} style={{ background: '#111827', color: 'white', border: BW, padding: '9px 5px', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', width: pct }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagosVista.map((row, idx) => {
                const isPaid       = becado || row.estado === 'PAGÓ';
                const isProx       = !becado && row.estado === 'PROX';
                // hasSoporte: true si hay algún soporte que cubra este mes (PEND o PROX)
                // El padre puede pagar un mes próximo por adelantado — soporte tiene prioridad sobre PROX
                const hasSoporte   = !isPaid && soportes.some(s =>
                  !s.meses || s.meses.length === 0 || s.meses.includes(row.detalle)
                );
                const rowBg        = (isProx && (!hasSoporte || esProfesor || esReadonly)) ? '#f9fafb' : ROW;
                const detBg        = becado ? '#374151' : isPaid ? '#374151'
                  : (esProfesor || esReadonly)
                    ? (isProx ? '#9ca3af' : '#dc2626')
                    : hasSoporte ? '#d97706' : isProx ? '#9ca3af' : '#dc2626';
                return (
                  <tr key={idx} style={{ opacity: isProx ? 0.6 : 1 }}>

                    {/* FECHA */}
                    <td style={{ background: rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      {puedeEditar ? (
                        <input
                          value={formatFecha(row.fecha)}
                          onChange={e => { const u = pagos.map((r,i) => i===idx ? {...r, fecha: e.target.value} : r); savePagos(u); }}
                          className="w-full text-center font-semibold text-[9px] text-[#111827] bg-transparent focus:outline-none focus:bg-white focus:rounded px-1 py-1"
                          placeholder="DD/MM/AAAA"
                        />
                      ) : (
                        <span className="text-[9px] font-semibold text-[#111827]">{formatFecha(row.fecha) || '—'}</span>
                      )}
                    </td>

                    {/* V. PAGADO — gris claro, número con $ y puntos */}
                    <td style={{ background: '#e5e7eb', border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      {puedeEditar ? (
                        <input
                          value={ensurePeso(row.vPagado)}
                          readOnly={!isPaid}
                          onChange={e => { if (!isPaid) return; const u = pagos.map((r,i) => i===idx ? {...r, vPagado: e.target.value} : r); savePagos(u); }}
                          className={cn('w-full text-center font-bold text-[9px] bg-transparent focus:outline-none px-1 py-1',
                            isPaid ? 'text-[#374151]' : 'text-[#9ca3af] cursor-default')}
                          placeholder="—"
                        />
                      ) : (
                        <span className={cn('text-[9px] font-bold', isPaid ? 'text-[#374151]' : 'text-[#9ca3af]')}>
                          {ensurePeso(row.vPagado) || '—'}
                        </span>
                      )}
                    </td>

                    {/* DETALLE — gris oscuro en vez de verde cuando pagó */}
                    <td style={{ background: detBg, color: 'white', border: BW, padding: '8px 10px', textAlign: 'center', fontWeight: 900, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {row.detalle}
                    </td>

                    {/* ESTADO PAGO */}
                    <td style={{ background: rowBg, border: BW, padding: '6px 4px', textAlign: 'center' }}>
                      {becado
                        ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center text-white"
                            style={{ background: '#16a34a' }}>BECADO</span>
                        : puedeEditar
                          ? <button onClick={() => toggleEstado(idx)}
                              className={cn('px-3 py-1 rounded font-black text-white text-[11px] transition w-full',
                                isPaid ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600')}>
                                {isPaid ? 'PAGÓ' : 'PEND'}
                            </button>
                          : isPaid
                              ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center text-white cursor-default bg-green-500">
                                  PAGÓ
                                </span>
                              : (esProfesor || esReadonly)
                                ? isProx
                                  ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                                      style={{ background:'#e5e7eb', color:'#9ca3af' }}>PRÓX</span>
                                  : <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                                      style={{ background:'#fee2e2', color:'#dc2626' }}>PEND</span>
                                : hasSoporte
                                  ? <span className="px-1 py-[5px] rounded-lg font-black text-[9px] w-full block text-center leading-tight whitespace-nowrap"
                                      style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}>
                                      ⏳ POR CONFIRMAR
                                    </span>
                                  : isProx
                                    ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                                        style={{ background:'#e5e7eb', color:'#9ca3af' }}>PRÓX</span>
                                    : <button
                                        onClick={() => { setShowPagoModal(true); setPagoModalIdx(idx); }}
                                        className="px-1 py-2 rounded-lg font-black text-[11px] w-full block text-center text-white shadow-sm active:scale-95 transition-transform animate-pulse whitespace-nowrap"
                                        style={{ background: '#dc2626' }}>
                                        💳 PAGAR
                                      </button>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
          </div>
        </div>

        {/* ── NOTA ── */}
        {puedeEditar
          ? <p className="text-center text-[11px] text-gray-400 pb-4">
              Toca <strong>PEND</strong> para registrar pago · Toca <strong>PAGÓ</strong> para revertir
            </p>
          : soportes.length > 0
            ? <p className="text-center text-[11px] text-amber-600 font-semibold pb-2">
                ⏳ Soporte(s) subidos · En revisión por el área contable
              </p>
            : <p className="text-center text-[11px] text-amber-500 font-semibold pb-2">
                Solo lectura · Edición disponible desde Control de Pagos
              </p>
        }
        {esDeportista && !esReadonly && <p className="text-center text-[11px] text-gray-400 pb-4">
          ¿Tienes dudas? Comunícate con la línea de pagos{' '}
          <a href="https://wa.me/573045401497" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-black text-[#16a34a] underline underline-offset-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3 flex-shrink-0" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.824L.057 23.5a.5.5 0 0 0 .609.61l5.79-1.477A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.371l-.361-.214-3.733.952.984-3.617-.235-.374A9.859 9.859 0 0 1 2.1 12C2.1 6.525 6.525 2.1 12 2.1S21.9 6.525 21.9 12 17.475 21.9 12 21.9z"/></svg>
            304 540 1497
          </a>
        </p>}

        {/* ── OTROS PAGOS (admin y profe ven; admin edita) ── */}
        {!esDeportista && (
          <div className="mb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1">
                <span>📦</span> Otros Pagos
              </h3>
              {esAdmin && (
                <div className="flex gap-2">
                  <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importarXlsx}/>
                  <button onClick={() => xlsxInputRef.current?.click()}
                    className="text-[10px] font-black px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition">
                    📥 Excel
                  </button>
                  <button onClick={() => setShowAddOtro(true)}
                    className="text-[10px] font-black px-2 py-1 rounded-lg text-white transition"
                    style={{ background: '#16a34a' }}>
                    + Agregar
                  </button>
                </div>
              )}
            </div>

            {/* Tabla — mismo layout que mensualidades */}
            {otrosPagos.length === 0 ? (
              <p className="text-center text-[11px] text-gray-400 py-3 border border-dashed border-gray-200 rounded-xl">
                Sin otros pagos registrados
              </p>
            ) : (
              <div className="rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto w-full">
                <table className="border-collapse" style={{ width: '100%', minWidth: 280 }}>
                  <thead>
                    <tr>
                      {[
                        { label: 'FECHA',     pct: '20%' },
                        { label: 'V. PAGADO', pct: '22%' },
                        { label: 'DETALLE',   pct: esAdmin ? '34%' : '32%' },
                        { label: 'ESTADO',    pct: esAdmin ? '18%' : '26%' },
                      ].map(({ label, pct }) => (
                        <th key={label} style={{ background: '#111827', color: 'white', border: BW, padding: '9px 5px', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', width: pct }}>
                          {label}
                        </th>
                      ))}
                      {esAdmin && <th style={{ background: '#111827', border: BW, padding: '9px 4px', width: '6%' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {otrosPagos.map(op => {
                      const isPaidO  = op.estado === 'PAGÓ';
                      const detBgO   = isPaidO ? '#374151' : '#dc2626';
                      const rowBgO   = ROW;
                      return (
                        <tr key={op.id}>
                          {/* FECHA */}
                          <td style={{ background: rowBgO, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            <span className="text-[9px] font-semibold text-[#111827]">{op.fecha || 'DD/MM/AAAA'}</span>
                          </td>
                          {/* V. PAGADO */}
                          <td style={{ background: '#e5e7eb', border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            <span className={cn('text-[9px] font-bold', isPaidO ? 'text-[#374151]' : 'text-[#9ca3af]')}>
                              {isPaidO ? `$${Number(op.valor).toLocaleString('es-CO')}` : '—'}
                            </span>
                          </td>
                          {/* DETALLE — descripcion + tipo */}
                          <td style={{ background: detBgO, color: 'white', border: BW, padding: '6px 8px', textAlign: 'center', fontWeight: 900, fontSize: 10 }}>
                            <span className="block leading-tight">{op.descripcion}</span>
                            <span className={cn('text-[8px] font-black px-1.5 py-0.5 rounded-full mt-0.5 inline-block',
                              op.tipo === 'torneo' ? 'bg-blue-200 text-blue-900' : 'bg-purple-200 text-purple-900')}>
                              {op.tipo === 'torneo' ? 'Torneo' : 'Implemento'} · ${Number(op.valor).toLocaleString('es-CO')}
                            </span>
                          </td>
                          {/* ESTADO */}
                          <td style={{ background: rowBgO, border: BW, padding: '6px 4px', textAlign: 'center' }}>
                            {esAdmin
                              ? <button onClick={() => toggleEstadoOtro(op)}
                                  className={cn('px-2 py-1 rounded font-black text-[10px] text-white transition w-full',
                                    isPaidO ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600')}>
                                  {op.estado}
                                </button>
                              : <span className={cn('px-2 py-1 rounded font-black text-[10px] text-white block text-center',
                                  isPaidO ? 'bg-green-500' : 'bg-red-400')}>
                                  {op.estado}
                                </span>
                            }
                          </td>
                          {esAdmin && (
                            <td style={{ background: rowBgO, border: BW, padding: '4px' }}>
                              <button onClick={() => eliminarOtroPago(op)}
                                className="w-6 h-6 rounded bg-red-50 hover:bg-red-100 flex items-center justify-center transition text-red-400 text-xs mx-auto">✕</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Modal agregar */}
            {showAddOtro && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
                  <h3 className="font-black text-gray-800">Agregar Otro Pago</h3>
                  <div>
                    <label className="text-xs font-black text-gray-500 uppercase tracking-wide block mb-1">Producto</label>
                    <select value={selProdId} onChange={e => setSelProdId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-green-500">
                      <option value="">— Selecciona un producto —</option>
                      {productosLst.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.tipo === 'torneo' ? '🏆' : '👟'} {p.descripcion} — ${Number(p.valor).toLocaleString('es-CO')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowAddOtro(false); setSelProdId(''); }}
                      className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-black text-sm hover:bg-gray-50">Cancelar</button>
                    <button onClick={agregarOtroPago} disabled={!selProdId || guardandoOtro}
                      className="flex-1 py-3 rounded-xl font-black text-sm text-white transition"
                      style={{ background: selProdId && !guardandoOtro ? '#16a34a' : '#9ca3af' }}>
                      {guardandoOtro ? 'Guardando...' : 'AGREGAR'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SUBIR / VER SOPORTES (solo calidoso) ── */}
        {esDeportista && !esReadonly && (
          <div className="flex gap-3 pb-4">
            <input
              ref={soporteInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={subirSoporte}
            />
            <button
              onClick={() => soporteInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm text-white transition active:scale-95"
              style={{ background: '#16a34a' }}>
              📎 Subir soporte
            </button>
            <button
              onClick={() => setVerSoportes(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm text-white transition active:scale-95"
              style={{ background: '#1e3a8a' }}>
              🖼️ Ver soportes{soportes.length > 0 ? ` (${soportes.length})` : ''}
            </button>
          </div>
        )}

      </main>

      {/* ── MODAL CONFIRMAR REVERT ── */}
      {confirmRevert !== null && (() => {
        const row = pagosVista[confirmRevert];
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-red-600 text-xl font-black">!</span>
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-base leading-tight">¿Revertir este pago?</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{row?.detalle}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-2">Esta acción eliminará la información registrada:</p>
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-5 text-xs text-gray-700 space-y-1">
                {row?.vPagado && <p><span className="font-bold">Valor:</span> {row.vPagado}</p>}
                {row?.destino && <p><span className="font-bold">Destino:</span> {row.destino}</p>}
                {row?.fecha   && <p><span className="font-bold">Fecha:</span>  {row.fecha}</p>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmRevert(null)}
                  className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button
                  onClick={ejecutarRevert}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 text-sm font-black transition">
                  Sí, revertir
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL PAGAR (vista calidoso) ── */}
      {showPagoModal && (() => {
        const filaModal = pagoModalIdx !== null ? pagosVista[pagoModalIdx] : null;
        // Quita tildes para comparación robusta
        const sinAcento = (s: string) => s.toUpperCase().trim()
          .replace(/[ÁÀÂÃÄ]/g,'A').replace(/[ÉÈÊË]/g,'E').replace(/[ÍÌÎÏ]/g,'I')
          .replace(/[ÓÒÔÕÖ]/g,'O').replace(/[ÚÙÛÜ]/g,'U').replace(/Ñ/g,'N');
        // Los datos reales: PROGRAMA="Selección" y PROY="SUB 15B" (por separado)
        const progNorm = sinAcento(catVal ?? '');   // columna PROGRAMA
        const proyNorm = sinAcento(proyecto ?? ''); // columna PROY
        const esSelDesarr = /SELECC|DESARROLLO/.test(progNorm);
        const esSub131415 = /SUB[\s\-]*(13|14|15)/.test(proyNorm);
        // También soporta nombres completos como "SELECCIÓN SUB 15" en un solo campo
        const nombreCompleto = progNorm + ' ' + proyNorm;
        const PROYECTOS_MAX10 = ['DESARROLLO SUB 15','DESARROLLO SUB 14','DESARROLLO SUB 13','SELECCION SUB 15','SELECCION SUB 14','SELECCION SUB 13'];
        const esMax10 = (esSelDesarr && esSub131415) || PROYECTOS_MAX10.some(p => nombreCompleto.includes(p));
        const cuentaNum   = esMax10 ? '36000004823' : '10182764613';
        const cuentaTitul = esMax10 ? 'MAX 10 SPORT'  : 'FUTURO ANTIOQUIA';
        const cuentaNit   = esMax10 ? null             : '811036997';
        return (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
             onClick={() => { setShowPagoModal(false); setPagoModalIdx(null); }}>
          <div className="relative rounded-3xl overflow-hidden w-full max-w-xs shadow-2xl"
               style={{ background: '#1a2d40' }}
               onClick={e => e.stopPropagation()}>

            {/* Cerrar */}
            <button onClick={() => { setShowPagoModal(false); setPagoModalIdx(null); }}
                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition z-10">
              ✕
            </button>

            <div className="px-6 pt-7 pb-6 flex flex-col items-center gap-4">

              {/* Escudo FA */}
              <img src="/ESCUDO%20F.A%202020.png" alt="Futuro Antioquia" className="w-[90px] h-auto drop-shadow-lg"/>

              {/* Mes y monto */}
              {filaModal && (
                <div className="w-full rounded-xl py-2.5 px-4 text-center" style={{ background: '#0f3460' }}>
                  <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Pago correspondiente a</p>
                  <p className="text-white font-black text-[15px] mt-0.5">{filaModal.detalle}</p>
                  {filaModal.vCargado && (
                    <p className="text-green-400 font-black text-[18px] mt-0.5">{filaModal.vCargado}</p>
                  )}
                </div>
              )}

              {/* Título */}
              <h2 className="text-white font-black text-[17px] tracking-[0.15em] text-center">REALIZA TU PAGO</h2>

              {/* Datos bancarios */}
              <div className="w-full space-y-2.5">
                {([
                  { label: 'BANCO',   val: 'BANCOLOMBIA' },
                  { label: 'TIPO',    val: 'CUENTA DE AHORROS' },
                  { label: 'NÚMERO',  val: cuentaNum, copy: true },
                  { label: 'TITULAR', val: cuentaTitul },
                  ...(cuentaNit ? [{ label: 'NIT', val: cuentaNit }] : []),
                ] as Array<{ label: string; val: string; copy?: boolean }>).map(({ label, val, copy }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-white text-[10px] font-black px-2.5 py-[5px] rounded-lg text-center flex-shrink-0 tracking-wide"
                          style={{ background: '#22c55e', minWidth: 68 }}>
                      {label}
                    </span>
                    <span className="text-white font-semibold text-[13px] tracking-wide flex-1">{val}</span>
                    {copy && (
                      <button
                        onClick={() => { try { navigator.clipboard.writeText(cuentaNum); } catch {} }}
                        className="flex items-center gap-1 text-white/70 hover:text-white transition flex-shrink-0"
                        title="Copiar número">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        <span className="text-[11px] underline">Copia la cuenta</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Banner azul */}
              <div className="w-full rounded-xl py-2.5 px-4 text-center"
                   style={{ background: '#2563eb' }}>
                <p className="text-white font-black text-[10px] tracking-wider uppercase leading-snug">
                  Recuerda guardar soporte y subir tu pago
                </p>
              </div>

              {/* PSE próximamente */}
              <div className="flex items-center gap-3 mt-1">
                <span className="text-white/80 italic text-[15px] tracking-wide">Próximamente</span>
                {/* PSE logo inline */}
                <div className="w-12 h-12 rounded-full flex flex-col items-center justify-center flex-shrink-0"
                     style={{ background: 'linear-gradient(145deg,#1a56db,#2563eb)' }}>
                  <span style={{ color:'#7dd3fc', fontSize:'7px', fontWeight:700, lineHeight:1.1, letterSpacing:'0.08em' }}>ach</span>
                  <span style={{ color:'white', fontSize:'14px', fontStyle:'italic', fontWeight:900, lineHeight:1 }}>pse</span>
                </div>
              </div>

              {/* MaxIO logo */}
              <img src="/MAX%2010.png" alt="Max 10 Sport" className="h-9 w-auto opacity-90 mt-1"/>

            </div>
          </div>
        </div>
        );
      })()}

      {/* ── MODAL VER SOPORTES ── */}
      {verSoportes && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
             onClick={() => setVerSoportes(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-[#111827] text-base">Soportes de pago</h3>
              <button onClick={() => setVerSoportes(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm transition">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {soportes.length === 0 ? (
                <p className="text-center text-gray-400 text-sm font-semibold py-8">
                  No hay soportes subidos aún
                </p>
              ) : (
                soportes.map((s, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                    {s.data.startsWith('data:image') ? (
                      <img src={s.data} alt={s.name} className="w-full object-contain max-h-48"/>
                    ) : (
                      <div className="bg-gray-50 p-4 text-center">
                        <p className="text-2xl mb-1">📄</p>
                        <p className="text-sm font-semibold text-gray-600 truncate">{s.name}</p>
                      </div>
                    )}
                    <div className="px-3 pt-2 pb-1 bg-gray-50">
                      <p className="text-[10px] font-black text-gray-700 truncate">{s.name}</p>
                      {s.meses && s.meses.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.meses.map(m => (
                            <span key={m} className="text-[9px] font-black px-2 py-0.5 rounded-full"
                              style={{ background: '#d1fae5', color: '#065f46' }}>
                              {m.replace(' 2026','').replace(' 2027','')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 font-semibold">{s.date}</p>
                      <button
                        onClick={() => eliminarSoporte(i)}
                        className="text-red-400 hover:text-red-600 text-[10px] font-bold transition">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR PAGO ── */}
      {editIdx !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden"/>
            <h3 className="font-black text-[#111827] text-base mb-1">Registrar Pago</h3>
            <p className="text-gray-400 text-xs mb-5 font-semibold">{pagosVista[editIdx]?.detalle} — {anio}</p>

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

            {/* Eliminar mes — opción discreta al fondo del modal */}
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <button
                onClick={() => editIdx !== null && eliminarMes(editIdx)}
                className="text-red-400 hover:text-red-600 text-xs font-bold transition underline underline-offset-2">
                No cobrar este mes (eliminar del estado de cuenta)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST SOPORTE GUARDADO ── */}
      {toastSoporte && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#16a34a] text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-fade-in-up"
          style={{ animation: 'fadeInUp 0.3s ease' }}>
          <span className="text-xl">✅</span>
          <div>
            <p className="font-black text-sm leading-tight">¡Soporte enviado!</p>
            <p className="text-white/80 text-xs">Tu comprobante fue guardado correctamente</p>
          </div>
        </div>
      )}

      {/* ── MODAL SOPORTE: selección de mes(es) + nombre ── */}
      {showNombreModal && (() => {
        const mesesDisp = pagosVista.filter(r => r.estado === 'PEND' || r.estado === 'PROX');
        const toggleMes = (det: string) =>
          setMesesSelSoporte(prev =>
            prev.includes(det) ? prev.filter(m => m !== det) : [...prev, det]
          );

        // Validación de orden: si hay un mes PEND anterior al más temprano seleccionado,
        // no se puede guardar y se muestra el primer mes que debería pagarse
        const mesesPend = mesesDisp.filter(r => r.estado === 'PEND');
        const numsSel   = mesesSelSoporte.map(det => MES_NUM[det] ?? 999);
        const minSel    = numsSel.length ? Math.min(...numsSel) : 999;
        const mesConflicto = mesesSelSoporte.length === 0 ? null : mesesPend
          .filter(r => !mesesSelSoporte.includes(r.detalle) && (MES_NUM[r.detalle] ?? 999) < minSel)
          .sort((a, b) => (MES_NUM[a.detalle] ?? 999) - (MES_NUM[b.detalle] ?? 999))[0] ?? null;

        const puedeGuardar = mesesSelSoporte.length > 0 && !mesConflicto;

        return (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4 pb-6"
            onClick={() => { setPendingFiles([]); setMesesSelSoporte([]); setShowNombreModal(false); }}>
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Encabezado */}
              <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                <h3 className="font-black text-gray-900 text-base leading-tight">📎 Soporte de pago</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pendingFiles.length > 1 ? `${pendingFiles.length} archivos` : pendingFiles[0]?.name}
                </p>
              </div>

              <div className="px-5 pt-4 pb-5 space-y-4">

                {/* Selección de mes(es) */}
                {mesesDisp.length > 0 && (
                  <div>
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">
                      ¿Qué mes(es) estás pagando?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {mesesDisp.map(r => {
                        const sel = mesesSelSoporte.includes(r.detalle);
                        // Resaltar en rojo el mes en conflicto (el que debería haberse pagado antes)
                        const esConflicto = mesConflicto?.detalle === r.detalle;
                        return (
                          <button
                            key={r.detalle}
                            onClick={() => toggleMes(r.detalle)}
                            className="px-3 py-1.5 rounded-xl font-black text-[11px] transition border-2 active:scale-95"
                            style={
                              esConflicto
                                ? { background: '#fef2f2', color: '#991b1b', borderColor: '#ef4444' }
                                : sel
                                  ? { background: '#16a34a', color: 'white', borderColor: '#16a34a' }
                                  : { background: '#f1f5f9', color: '#374151', borderColor: '#d1d5db' }
                            }>
                            {r.detalle.replace(' 2026','').replace(' 2027','')}
                            {r.estado === 'PROX' && !esConflicto && <span className="ml-1 opacity-60">(Próx.)</span>}
                            {esConflicto && <span className="ml-1">⚠️</span>}
                            {sel && !esConflicto && <span className="ml-1">✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Aviso de conflicto */}
                    {mesConflicto && (
                      <div className="mt-3 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 flex items-start gap-2">
                        <span className="text-red-500 text-lg leading-none mt-0.5">⛔</span>
                        <div>
                          <p className="text-red-700 font-black text-[11px] leading-snug">
                            Primero debes pagar <span className="underline underline-offset-2">
                              {mesConflicto.detalle.replace(' 2026','').replace(' 2027,','')}
                            </span>
                          </p>
                          <p className="text-red-500 text-[10px] mt-0.5">
                            No puedes seleccionar meses posteriores mientras haya meses anteriores pendientes. ¿Tienes dudas? Comunícate con la línea de pagos{' '}
                            <a href="https://wa.me/573045401497" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-black underline underline-offset-2">
                              <svg viewBox="0 0 24 24" className="w-3 h-3 flex-shrink-0" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.824L.057 23.5a.5.5 0 0 0 .609.61l5.79-1.477A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.371l-.361-.214-3.733.952.984-3.617-.235-.374A9.859 9.859 0 0 1 2.1 12C2.1 6.525 6.525 2.1 12 2.1S21.9 6.525 21.9 12 17.475 21.9 12 21.9z"/></svg>
                              304 540 1497
                            </a>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Aviso selección vacía */}
                    {mesesSelSoporte.length === 0 && !mesConflicto && (
                      <p className="text-[10px] text-amber-500 font-semibold mt-2">
                        Selecciona al menos un mes para continuar
                      </p>
                    )}
                  </div>
                )}

                {/* Nombre del soporte */}
                <div>
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">
                    Nombre del soporte
                  </p>
                  <input
                    type="text"
                    value={nombreSoporte}
                    onChange={e => setNombreSoporte(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && puedeGuardar) confirmarNombreSoporte();
                      if (e.key === 'Escape') { setPendingFiles([]); setMesesSelSoporte([]); setShowNombreModal(false); }
                    }}
                    placeholder="Ej: Pago julio 2026"
                    className="w-full border-2 border-green-300 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:border-green-600"
                  />
                </div>

                {/* Botones */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => { setPendingFiles([]); setMesesSelSoporte([]); setShowNombreModal(false); }}
                    className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-600 bg-gray-100 active:scale-95 transition">
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarNombreSoporte}
                    disabled={!puedeGuardar}
                    className="flex-1 py-3 rounded-xl font-black text-sm text-white active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: '#16a34a' }}>
                    ✅ Guardar
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function EstadoCuentaPage() {
  return (
    <Suspense>
      <EstadoCuentaInner />
    </Suspense>
  );
}
