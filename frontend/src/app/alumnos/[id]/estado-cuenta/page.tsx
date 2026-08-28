'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import LoadingBall from '@/components/LoadingBall';
import { cn, abrirSoporte, esPdfDato } from '@/lib/utils';
import { getDeportistas } from '@/lib/db';
import { partirNombre } from '@/lib/nombres';
import type { Deportista } from '@/lib/db';
import { getFoto, saveFoto, savePagosDeportista, getPagosPorCodigos, saveSoportePago, eliminarSoportePorNombre, updateColumnasDeportista, enviarMensaje } from '@/lib/db';
import { useAuthStore } from '@/store/auth.store';
import { rolManejaFinanzas } from '@/lib/permisos';

const FOTOS_KEY    = 'futuro_fotos_deportistas';
const PAGOS_KEY    = 'futuro_pagos_estado';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

interface OtroPago { id: string; producto_id: string | null; descripcion: string; tipo: string; valor: number; fecha: string | null; estado: 'PAGÓ' | 'PEND';
  /* Lo que de verdad entró. Puede ser distinto del valor cargado (un abono).
     Si la base todavía no tiene esta casilla, se guarda sin ella y se avisa;
     entonces el pagado se muestra igual al cargado. — 27/08/2026 */
  valor_pagado?: number | null;
  /* Cómo pagó: transferencia, efectivo… Misma historia que la de arriba. */
  medio_pago?: string | null;
}
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
  estado: 'PAGÓ' | 'PEND' | 'PROX' | 'ELIM' | 'NOPAGA';
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

/** La fecha de hoy como la guarda la base: AAAA-MM-DD. */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "$ 253.500" → 253500. Lo que se escriba con puntos, comas o el signo entra
 *  igual; lo que no sea número se descarta. */
function soloNumero(v: string): number {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
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
  const [malDescModal,  setMalDescModal]  = useState<number | null>(null); // modal mal descuento (validar/revertir)
  /* Cuánto hay que acercar la foto. Lo decide la propia foto al cargarse
     (ver el onLoad de la imagen). 1 = no se toca. */
  const [fotoZoom, setFotoZoom] = useState(1);
  const [editMens,      setEditMens]      = useState(false);   // editando la mensualidad del encabezado
  const [mensInput,     setMensInput]     = useState('');
  const [guardandoMens, setGuardandoMens] = useState(false);
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

  // ── Mensajes del calidoso: Área de Pagos / Formador / Director ──
  type CanalMsg = { titulo: string; para: 'institucion' | 'profesor'; prefijo: string; color: string };
  const [msgDestino,     setMsgDestino]     = useState<CanalMsg | null>(null);
  const [pagosMsgTexto,  setPagosMsgTexto]  = useState('');
  const [pagosMsgWa,     setPagosMsgWa]     = useState('');
  const [enviandoPagos,  setEnviandoPagos]  = useState(false);
  const [pagosMsgOk,     setPagosMsgOk]     = useState(false);

  // ── OTROS PAGOS ────────────────────────────────────────────────
  const xlsxInputRef            = useRef<HTMLInputElement>(null);
  const [otrosPagos,    setOtrosPagos]    = useState<OtroPago[]>([]);
  /* Los TORNEOS se muestran en su propia tabla, debajo de las mensualidades.
     El resto de cobros —uniformes, salidas— se queda en OTROS PAGOS. Se
     reparten aquí para que ningún renglón salga en las dos. — 27/08/2026 */
  const esCobroDeTorneo = (op: OtroPago) => /torneo/i.test(String(op.tipo ?? ''));
  const torneosCargados = useMemo(() => otrosPagos.filter(esCobroDeTorneo), [otrosPagos]);

  /* ── REGISTRAR EL PAGO DE UN TORNEO, A MANO ──────────────────────────────
     El mismo cuadro de Registrar Pago de las mensualidades, pedido por la
     dirección el 27/08/2026: valor cargado, cómo pagó, cuándo y cuánto.
     Mientras no exista el cobro en línea, así se registra. */
  const [torneoEnPago, setTorneoEnPago] = useState<OtroPago | null>(null);
  const [formTorneo, setFormTorneo] = useState<{ vCargado: string; medio: string; fecha: string; vPagado: string }>(
    { vCargado: '', medio: '', fecha: '', vPagado: '' },
  );
  const [guardandoTorneo, setGuardandoTorneo] = useState(false);
  /* Aviso amarillo cuando a la base le faltó alguna casilla: el pago SÍ quedó,
     pero ese dato suelto no se pudo guardar. */
  const [avisoTorneo, setAvisoTorneo] = useState('');

  function abrirPagoTorneo(op: OtroPago) {
    setTorneoEnPago(op);
    setFormTorneo({
      vCargado: op.valor > 0 ? String(op.valor) : '',
      medio:    String(op.medio_pago ?? ''),
      fecha:    hoyISO(),
      vPagado:  op.valor > 0 ? String(op.valor) : '',
    });
  }

  async function confirmarPagoTorneo() {
    const op = torneoEnPago;
    if (!op) return;
    setGuardandoTorneo(true);
    setAvisoTorneo('');
    try {
      const cambios: Record<string, any> = {
        estado:       'PAGÓ',
        valor:        soloNumero(formTorneo.vCargado),
        fecha:        formTorneo.fecha || hoyISO(),
        valor_pagado: soloNumero(formTorneo.vPagado),
        medio_pago:   formTorneo.medio.trim() || null,
      };
      const sacadas = await parchearOtroPago(op.id, cambios);
      /* Lo que la base no aceptó no se pinta en pantalla, para que lo que se ve
         sea de verdad lo que quedó guardado. */
      const aplicado: Record<string, any> = { ...cambios };
      sacadas.forEach(c => { delete aplicado[c]; });
      setOtrosPagos(prev => prev.map(p => p.id === op.id ? { ...p, ...aplicado } : p));
      if (sacadas.length) {
        setAvisoTorneo(
          `El pago quedó registrado, pero la base todavía no tiene ` +
          `${sacadas.length === 1 ? 'la casilla' : 'las casillas'} "${sacadas.join('", "')}". ` +
          'Se arregla corriendo ARREGLAR-LA-BASE.bat una sola vez.',
        );
      }
      setTorneoEnPago(null);
    } catch (e: any) {
      setAvisoTorneo(e?.message ?? 'No se pudo registrar el pago.');
    } finally {
      setGuardandoTorneo(false);
    }
  }
  const otrosNoTorneo   = useMemo(() => otrosPagos.filter(op => !esCobroDeTorneo(op)), [otrosPagos]);
  const [productosLst,  setProductosLst]  = useState<Producto[]>([]);
  const [showAddOtro,   setShowAddOtro]   = useState(false);
  const [selProdId,     setSelProdId]     = useState('');
  const [guardandoOtro, setGuardandoOtro] = useState(false);
  /* Antes decía `'administracion' || 'contable'`. 'contable' no existe —el rol
     de Diana es 'contabilidad'— y faltaba 'total'. Por eso solo ADMON veía el
     botón de eliminar de "Otros pagos". — 26/08/2026 */
  const esAdmin = rolManejaFinanzas(usuario?.rol);

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
    /* Al registrar el pago queda la FECHA del día, como en mensualidades; al
       revertirlo se borra, para que no quede una fecha de un pago que ya no
       existe. — dirección, 27/08/2026 */
    const fecha = nuevo === 'PAGÓ' ? new Date().toISOString().slice(0, 10) : null;
    await fetch(`${SB_URL}/rest/v1/otros_pagos?id=eq.${op.id}`, { method: 'PATCH', headers: SB_HDR, body: JSON.stringify({ estado: nuevo, fecha }) });
    setOtrosPagos(prev => prev.map(p => p.id === op.id ? { ...p, estado: nuevo, fecha } : p));
  }

  /* ── GUARDAR SIN QUE UNA CASILLA QUE FALTE TUMBE TODO ─────────────────────
     Igual que en el pospartido: si la tabla no tiene alguna de las casillas
     nuevas, Supabase no guarda NADA y contesta PGRST204 diciendo cuál es. En
     vez de perder el pago, se saca esa casilla y se vuelve a mandar.
     `estado` y `valor` no se sacan nunca: sin ellos el pago no significa nada.
     Devuelve las casillas que quedaron por fuera. — 27/08/2026 */
  async function parchearOtroPago(idPago: string, cambios: Record<string, any>): Promise<string[]> {
    const cuerpo: Record<string, any> = { ...cambios };
    const NO_SE_SACAN = new Set(['estado', 'valor']);
    const sacadas: string[] = [];
    for (let intento = 0; intento < 4; intento++) {
      const res = await fetch(`${SB_URL}/rest/v1/otros_pagos?id=eq.${idPago}`,
        { method: 'PATCH', headers: SB_HDR, body: JSON.stringify(cuerpo) });
      if (res.ok) return sacadas;
      const txt = await res.text().catch(() => '');
      const m = txt.match(/Could not find the '([^']+)' column/i);
      const falta = m ? m[1] : null;
      if (falta && falta in cuerpo && !NO_SE_SACAN.has(falta)) {
        delete cuerpo[falta];
        sacadas.push(falta);
        continue;
      }
      throw new Error(`No se pudo guardar (${res.status}). ${txt.slice(0, 140)}`);
    }
    throw new Error('No se pudo guardar después de varios intentos.');
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

        /* Override: ediciones manuales bajo dep.id.
           PERO un PAGÓ real (publicado desde el libro bajo el código) NO puede ser pisado
           por una fila vieja PENDIENTE/PRÓX guardada bajo el id interno. Así, si el pago ya
           se subió, siempre se ve pagado (arregla "no sube el pago al estado"). */
        for (const r of ((allPagos as AllPagos)[id] ?? [])) {
          const prev = mergeMap.get(r.detalle);
          // Un reverso INTENCIONAL (destino 'REVERT') sí puede volver a pendiente un PAGÓ;
          // una fila pendiente vieja/en blanco (destino vacío) NO pisa un PAGÓ real.
          if (prev && prev.estado === 'PAGÓ' && r.estado !== 'PAGÓ' && r.destino !== 'REVERT') continue;
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

      /* Solo actualizar filas donde vCargado esté vacío.
         Los meses en NO PAGA quedan SIN cifra cargada (no se rellenan). */
      setPagos(prev => prev.map(row => (
        row.estado === 'NOPAGA' ? row : {
          ...row,
          vCargado: row.vCargado || ensurePeso(vcRow[VC_KEYS[row.detalle]]) || '',
        }
      )));
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

  /* ─── Autorizar un mal descuento: queda PAGÓ (verde), validado (no vuelve a pendiente) ─── */
  function autorizarDescuento(viewIdx: number) {
    const realIdx = realIdxDe(viewIdx);
    if (realIdx === -1) return;
    const updated = pagos.map((r, i) => i === realIdx ? { ...r, vCargado: 'AUTORIZADO' } : r);
    savePagos(updated);
    setMalDescModal(null);
  }

  function ejecutarRevert() {
    if (confirmRevert === null) return;
    const realIdx = realIdxDe(confirmRevert);
    if (realIdx !== -1) {
      const updated = pagos.map((r, i) =>
        i === realIdx ? { ...r, estado: 'PEND' as const, destino: 'REVERT', fecha: '', vPagado: '' } : r
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

  /** No cobrar un mes: NO se elimina — queda en el estado de cuenta, en su orden
   *  consecutivo, marcado en verde como "NO PAGA". */
  function eliminarMes(viewIdx: number) {
    const realIdx = realIdxDe(viewIdx);
    if (realIdx === -1) return;
    const updated = pagos.map((r, i) => i === realIdx
      ? { ...r, estado: 'NOPAGA' as const, vCargado: '', vPagado: '', destino: '', fecha: '' }
      : r
    );
    savePagos(updated);
    setEditIdx(null);
    setEditForm({});
  }

  /** Revertir "NO PAGA" → vuelve a PEND (se vuelve a cobrar). */
  function revertirNoPaga(viewIdx: number) {
    const realIdx = realIdxDe(viewIdx);
    if (realIdx === -1) return;
    const updated = pagos.map((r, i) => i === realIdx
      ? { ...r, estado: 'PEND' as const, vPagado: '', destino: '', fecha: '' }
      : r
    );
    savePagos(updated);
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

  /* ─── Canales de comunicación del calidoso ─── */
  const CANALES_MSG: (CanalMsg & { emoji: string; desc: string; boton: string })[] = [
    /* LOS TRES VAN DEL MISMO COLOR (dirección, 27/08/2026): son un grupo —
       "escríbele a alguien"— y antes cada uno llevaba un color distinto
       (morado, verde azulado, azul) que no era de la paleta y no significaba
       nada. Van en el gris más claro; lo que los distingue es el dibujito y
       el texto, que es lo que la persona de verdad lee. */
    { titulo: 'Área de Pagos', boton: 'Escríbele al Área de Pagos',    para: 'institucion', prefijo: 'ACLARACIÓN PAGOS',   color: '#4A5568', emoji: '💬',   desc: 'Duda, solicitud o reclamo sobre pagos.' },
    { titulo: 'Formador',      boton: 'Escríbele al Formador de tu hijo', para: 'profesor', prefijo: 'MENSAJE AL FORMADOR', color: '#4A5568', emoji: '👨‍🏫', desc: 'Escríbele al entrenador del deportista.' },
    { titulo: 'Director',      boton: 'Escríbele al Director',         para: 'institucion', prefijo: 'MENSAJE AL DIRECTOR', color: '#4A5568', emoji: '🎓',   desc: 'Comunícate con la dirección.' },
  ];

  /* ─── Enviar mensaje al canal elegido (queda en la plataforma) ─── */
  async function enviarMensajePagos() {
    const destino = msgDestino;
    const texto = pagosMsgTexto.trim();
    if (!destino) return;
    if (!texto) { alert('Escribe tu mensaje antes de enviar.'); return; }
    setEnviandoPagos(true);
    const wa = pagosMsgWa.trim();
    const textoFull = `${destino.prefijo}\n\n${texto}${wa ? `\n\nWhatsApp de contacto: ${wa}` : ''}`;
    try {
      // Guarda en el historial de la ficha + "mensajes por leer"
      await enviarMensaje({
        deportistaId: String(id ?? ''),
        codigo: codVal,
        nombre,
        texto: textoFull,
        de: 'calidoso',
        para: destino.para,
        proyecto,
      });
      setPagosMsgOk(true);
      setPagosMsgTexto('');
      setPagosMsgWa('');
      setTimeout(() => { setMsgDestino(null); setPagosMsgOk(false); }, 2200);
    } catch {
      alert('No se pudo enviar el mensaje. Intenta de nuevo.');
    }
    setEnviandoPagos(false);
  }

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
  // Si hay una cuota MANUAL guardada (acuerdo con la familia) manda sobre la tabla.
  const cuotaManual = getCol(dep, /^cuota_?manual$/i);
  const tarifa = (cuotaManual && /\d/.test(cuotaManual)) ? ensurePeso(cuotaManual) : calcTarifa(catVal, sedeVal);

  /* ─── Guardar la mensualidad editada a mano (aplica en toda la plataforma) ─── */
  async function confirmarMensualidad() {
    if (!dep) return;
    const limpio = String(mensInput).replace(/[^0-9]/g, '');
    if (!limpio) { setEditMens(false); return; }
    setGuardandoMens(true);
    const nuevas = { ...dep._columnas, 'CUOTA_MANUAL': limpio };
    const ok = await updateColumnasDeportista(dep.id, nuevas);
    setGuardandoMens(false);
    if (ok) { setDep({ ...dep, _columnas: nuevas }); setEditMens(false); }
    else window.alert('No se pudo guardar la mensualidad. Intenta de nuevo.');
  }

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

  /* ─── PRONTO PAGO: ¿el descuento fue mal tomado? → naranja "PAGÓ CON MAL DESCUENTO" ───
     Verde (ok) si: pagó completo o más; o pagó el 90% (pronto pago) HASTA EL 5 del mes y
     estando AL DÍA (sin meses anteriores en mora). Naranja si tomó descuento pero pagó
     del 6 en adelante, o debe un mes anterior, o pagó menos del 90%. */
  const tarifaNum = Number(String(tarifa).replace(/[^0-9]/g, '')) || 0;
  const montoNum  = (v: string) => Number(String(v ?? '').replace(/[^0-9]/g, '')) || 0;
  const fechaPagoDate = (v: string): Date | null => {
    const f = formatFecha(v);
    const m = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
  };
  function esMalDescuento(row: PagoRow): boolean {
    if (row.estado !== 'PAGÓ') return false;
    const mesNum = MES_NUM[row.detalle];
    if (mesNum === undefined || mesNum === 0) return false;   // no aplica a matrícula
    if (row.vCargado === 'AUTORIZADO') return false;          // el admin lo autorizó como bueno
    // GRANDFATHER: el naranja SOLO aplica a pagos NUEVOS (del 5-ago-2026 en adelante).
    // Lo que ya estaba en verde PAGÓ (histórico, antes de esa fecha) NUNCA se marca naranja.
    const fp = fechaPagoDate(row.fecha);
    if (!fp || fp < new Date(2026, 7, 5)) return false;
    const C = tarifaNum, P = montoNum(row.vPagado);
    if (!C || !P) return false;
    if (P >= C) return false;                                 // pagó completo o de más → ok
    if (P < Math.round(C * 0.9)) return true;                 // menos que el 90% → mal
    // tomó el 10%: válido solo si pagó HASTA EL 5 del mes y está AL DÍA
    const hastaEl5 = !!fp && fp <= new Date(2026, mesNum - 1, 5, 23, 59, 59);
    const enMora = pagos.some(r => {
      const m = MES_NUM[r.detalle];
      return m !== undefined && m > 0 && m < mesNum && m >= mesAfilNum && r.estado === 'PEND';
    });
    return !(hastaEl5 && !enMora);
  }

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
  /* `cargados` y `totalPendiente` ya no se pintan —las cuatro casillas de
     arriba se quitaron el 27/08/2026— pero se dejan calculados: son la cuenta
     buena de esta pantalla y sirven el día que se vuelvan a necesitar. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cargados   = pagados + pendientes + proximos;
  const totalPagado = becado ? 0 : pagosVista.reduce((s, p) => {
    const n = parseInt((p.vPagado || '0').replace(/\D/g, ''));
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const totalPendiente = becado ? 0 : pagosVista.reduce((s, p) => {
    if (p.estado !== 'PEND') return s;
    const n = parseInt((p.vCargado || '0').replace(/\D/g, ''));
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  const G    = '#00B050';  // verde institucional de la plataforma
  const GRAY = '#4b5563';  // gris   — encabezados datos + totales
  const ROW  = '#3C4759';
  const CAMPO= '#2B3547';  // gris hondo: columna DETALLE y casillas de valores
  const BW   = '1px solid white';

  return (
    <div className="min-h-screen bg-[#333F50] cuenta-oscura">

      {/* ── LA LETRA DE LOS CAMPOS EN EL FONDO OSCURO ────────────────────────
          Los cuadros de escribir y los desplegables traen letra negra de
          fábrica. Sobre el gris oscuro eso no se lee. Aquí se les pone la
          letra blanca de una vez, en toda la pantalla, sin tener que ir campo
          por campo. Las opciones del desplegable, cuando el navegador las
          abre, sí van con letra oscura sobre blanco: esa lista la pinta el
          sistema, no la página. — dirección, 27/08/2026 */}
      <style>{`
        .cuenta-oscura input,
        .cuenta-oscura select,
        .cuenta-oscura textarea { color: #ffffff; }
        .cuenta-oscura input::placeholder,
        .cuenta-oscura textarea::placeholder { color: rgba(255,255,255,.35); }
        .cuenta-oscura option { color: #111827; background: #ffffff; }
        .cuenta-oscura input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(1.6);
        }
      `}</style>

      {/* ── HEADER ────────────────────────────────────────────────────────────
          EL MISMO DE CONTROL DE ASISTENCIA, exacto (dirección, 27/08/2026):
          la franja que va del gris del lienzo al verde, sin el fondo de
          balones que tenía antes. Así toda la plataforma abre igual y el
          usuario no siente que cambió de programa al pasar de un módulo a
          otro. Si algún día se cambia el encabezado de Asistencia, este hay
          que cambiarlo igual. */}
      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        {/* LA FLECHA DEVUELVE A DONDE ESTABA (dirección, 27/08/2026).
            Fallaba cuando el estado de cuenta se abre en una PESTAÑA NUEVA
            —como lo hace el nombre del deportista en el pospartido y en la
            asistencia—: esa pestaña nace sin historial, así que "atrás" no
            tenía a dónde volver y caía en la ficha.
            Ahora la pantalla que abre puede decir a dónde regresar, con
            ?volver=..., y eso manda sobre todo lo demás. */}
        <button
          onClick={() => {
            if (searchParams.get('from') === 'contabilidad') { router.push('/contabilidad'); return; }
            const volver = searchParams.get('volver');
            if (volver) { router.push(volver); return; }
            if (typeof window !== 'undefined' && window.history.length > 1) { router.back(); return; }
            router.push(`/alumnos/${id}`);
          }}
          className="text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Estado de Cuenta</h1>
          <p className="text-white/60 text-xs truncate">Control de pagos individual</p>
        </div>
        {searchParams.get('from') === 'contabilidad' && (
          <button onClick={() => router.push('/contabilidad')}
            className="flex items-center gap-1.5 text-xs font-black text-white bg-white/20 hover:bg-white/35 border border-white/30 px-3 py-1.5 rounded-xl transition flex-shrink-0">
            <ArrowLeft className="w-4 h-4" /> Libro contable
          </button>
        )}
        <div className="flex flex-col items-end flex-shrink-0">
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/60 text-[8px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 py-4 space-y-4">

        {/* ── TARJETA HERO ── */}
        <div className="rounded-2xl bg-[#3C4759] border border-[#4A5568] p-4 shadow-xl">
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={subirFoto}/>

          {/* Fila superior: foto + datos + código.
              EN CELULAR se parte en dos renglones (dirección, 27/08/2026):
              arriba la foto con los datos al lado, y abajo el código con sus
              botones a lo ancho. Antes las tres columnas se repartían 390
              píxeles y el nombre del deportista quedaba en una tira de 90:
              ilegible justo en el aparato donde más se usa. */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3">

            {/* Foto + datos: van juntos siempre, en celular y en computador */}
            <div className="flex items-stretch gap-3 flex-1 min-w-0">

            {/* ── LA FOTO: SIEMPRE CABEZA Y ESCUDOS ────────────────────────
                Orden de la dirección (27/08/2026): "que esto NUNCA suceda, que
                siempre se vea cabeza y escudos".

                El intento anterior acercaba la imagen un número fijo (1,8) y
                por eso fallaba: ese acercamiento sirve para una foto de lejos y
                le come la cara a una foto de cerca. No hay un número que sirva
                para las dos, porque cada foto está tomada a una distancia.

                La regla nueva NO acerca nada. El recuadro tiene una forma fija
                de 4 de ancho por 5 de alto, y la foto se ajusta para llenarlo
                anclada ARRIBA. Con eso el recorte se corrige solo:

                  · Foto de lejos (más alargada): sobra mucho por abajo y se
                    corta el patrocinador y el pasto.
                  · Foto de cerca (más cuadrada): casi no sobra nada y se ve
                    completa.

                En los dos casos el borde de arriba no se mueve, así que la
                cabeza NUNCA se corta. Probado con una foto de cerca y una de
                cuerpo entero: en las dos se ven cabeza y escudos.

                El 8% baja el encuadre un pelo para no dejar aire muerto encima
                de la cabeza. Es el único número que habría que mover. */}
            <button onClick={() => fotoInputRef.current?.click()}
              className="relative flex-shrink-0 group">
              <div className="w-[112px] h-[140px] sm:w-[144px] sm:h-[180px] rounded-xl overflow-hidden bg-[#2B3547] border border-[#4A5568] flex flex-col items-center justify-center">
                {foto
                  ? <img src={foto} alt=""
                      onLoad={e => {
                        /* AQUI SE MIDE LA FOTO DE VERDAD (dirección, 27/08/2026).
                           El problema que se veía: si la foto original es
                           APAISADA (más ancha que alta), el recuadro la muestra
                           completa de arriba a abajo —cielo, niño chiquito y
                           pasto— y mover el recorte vertical no hace NADA,
                           porque no sobra nada por arriba ni por abajo: sobra
                           por los LADOS. Por eso los dos intentos anteriores
                           fallaron; el número no era el problema.

                           Entonces, ya con la foto cargada, se mira su forma y
                           SOLO a las apaisadas se les acerca lo justo para que
                           llenen por ancho: ahí sí sobra por arriba y por abajo
                           y el recorte vuelve a servir. A las verticales no se
                           les toca nada. */
                        const im = e.currentTarget;
                        const forma = im.naturalWidth / Math.max(1, im.naturalHeight);
                        const cajaForma = 4 / 5;
                        setFotoZoom(forma > cajaForma
                          ? Math.min(2, Math.max(1, (forma / cajaForma) * 0.75))
                          : 1);
                      }}
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition: '50% 22%',
                        transform: fotoZoom > 1 ? `scale(${fotoZoom})` : undefined,
                        transformOrigin: '50% 22%',
                      }} />
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
              {/* EL NOMBRE VIVE EN UNA FRANJA DE ALTO FIJO (dirección,
                  27/08/2026). Tiene que medir lo mismo que la franja del CÓDIGO
                  de la derecha; si no, las dos listas de abajo arrancarían a
                  distinta altura y los renglones no se alinearían con los
                  botones. Se le pone tope de dos renglones para que un nombre
                  muy largo no le rompa la cuenta a toda la tarjeta. */}
              <div className="min-h-[54px] sm:h-[54px] flex flex-col justify-center">
                {/* NOMBRES ARRIBA, APELLIDOS ABAJO (dirección, 27/08/2026).
                    Los nombres en el tamaño de siempre; los apellidos debajo,
                    más pequeños y sin negrilla. La partición la hace
                    `partirNombre`, con la costumbre colombiana: los dos
                    últimos son los apellidos. Si algún nombre no se puede
                    partir, sale completo arriba y abajo no sale nada — nunca
                    se esconde parte del nombre. */}
                <h1 className="text-white font-black text-base leading-tight uppercase tracking-wide truncate">
                  {partirNombre(nombre).nombres || nombre}
                </h1>
                {partirNombre(nombre).apellidos && (
                  <p className="text-white/75 text-[12.5px] font-normal leading-tight uppercase tracking-wide truncate">
                    {partirNombre(nombre).apellidos}
                  </p>
                )}
              </div>

              {/* ── LOS CUATRO RENGLONES, EMPAREJADOS CON LOS CUATRO BOTONES ──
                  Orden de la dirección: PROGRAMA a la altura de PAGOS, y los
                  cuatro de la izquierda alineados con los cuatro de la derecha.

                  Cómo se logra: las dos listas arrancan a la misma altura
                  (la franja de 54 de arriba, igual en los dos lados), miden lo
                  mismo (`flex-1` hasta abajo), llevan la misma separación
                  (gap-1.5) y CADA renglón lleva `flex-1`. Al repartirse en
                  partes iguales, el renglón 1 de la izquierda ocupa exactamente
                  la misma banda que el botón 1 de la derecha, y así los cuatro.
                  No hay ni un número puesto a ojo: si mañana cambia el alto de
                  la foto, los dos lados se reacomodan juntos. */}
              <div className="flex-1 flex flex-col gap-1.5 pb-0.5">
                {[
                  { label: 'PROGRAMA',    val: catVal },
                  { label: 'PROYECTO',    val: proyecto },
                  { label: 'FECHA AFIL.', val: fechaAfil ? formatFecha(fechaAfil) : '' },
                ].filter(r => r.val).map(({ label, val }) => (
                  <div key={label} className="flex-1 flex items-center gap-2">
                    <span className="bg-[#00B050] text-white text-[10px] font-black px-2 py-[3px] rounded-md w-[94px] text-center flex-shrink-0 tracking-wide">
                      {label}
                    </span>
                    <span className="text-white text-[11px] font-semibold truncate">
                      {String(val).toUpperCase()}
                    </span>
                  </div>
                ))}

                {/* MENSUALIDAD — editable a mano (acuerdo con la familia). Aplica a toda la plataforma. */}
                <div className="flex-1 flex items-center gap-2">
                  <span className="bg-[#00B050] text-white text-[10px] font-black px-2 py-[3px] rounded-md w-[94px] text-center flex-shrink-0 tracking-wide">
                    MENSUALIDAD
                  </span>
                  {editMens && puedeEditar ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={mensInput}
                        onChange={e => setMensInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmarMensualidad(); if (e.key === 'Escape') setEditMens(false); }}
                        autoFocus
                        placeholder="138000"
                        className="w-[90px] text-[11px] font-bold text-white bg-[#2B3547] border border-[#4A5568] rounded px-2 py-[3px] focus:outline-none"
                      />
                      <button onClick={confirmarMensualidad} disabled={guardandoMens}
                        className="bg-[#00B050] text-white text-[10px] font-black px-2 py-[3px] rounded hover:opacity-85 transition disabled:opacity-60">
                        {guardandoMens ? '…' : 'Confirmar'}
                      </button>
                      <button onClick={() => setEditMens(false)} className="text-white/70 hover:text-white text-[12px] px-1">✕</button>
                    </div>
                  ) : (
                    <span className="text-white text-[11px] font-semibold flex items-center gap-2">
                      {String(tarifa).toUpperCase()}
                      {cuotaManual && /\d/.test(cuotaManual) && <span className="text-[8px] text-amber-300 font-bold">(ajustada)</span>}
                      {puedeEditar && (
                        <button onClick={() => { setMensInput(String(cuotaManual || '').replace(/[^0-9]/g, '') || String(calcTarifa(catVal, sedeVal)).replace(/[^0-9]/g, '')); setEditMens(true); }}
                          className="text-white/60 hover:text-white underline text-[9px] font-bold">editar</button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* CÓDIGO arriba y los BOTONES abajo del todo (dirección, 27/08/2026).
                Antes iban apelotonados arriba, en dos columnas, con las
                palabras cortadas —ASIST., INF., MENS.— y un vacío debajo.

                Ahora van UNO DEBAJO DE OTRO y REPARTIDOS: cada botón lleva
                `flex-1`, así que los cuatro se dividen en partes iguales todo
                el alto que queda bajo el código, sin huecos ni apretujones. Al
                ir en una sola columna caben los nombres completos, que era lo
                que pedía la dirección: ASISTENCIA, VALORACIONES, MENSAJES.
                — dirección, 27/08/2026 */}
            </div>{/* fin de foto + datos */}

            {codVal && (
              /* EN CELULAR este bloque es un renglón horizontal debajo de la
                 foto: el código a la izquierda y los botones ocupando el resto
                 del ancho. En computador vuelve a ser la columna de siempre. */
              <div className="flex-shrink-0 w-full sm:w-[136px] flex flex-row sm:flex-col items-center gap-3 sm:gap-1.5 self-stretch">
                {/* LA FRANJA DEL CÓDIGO mide lo mismo que la del nombre, al
                    otro lado (54). De ahí para abajo las dos listas arrancan
                    parejas y los botones quedan a la altura de los renglones.
                    En celular no hace falta: ahí este bloque va acostado. */}
                <div className="flex flex-col items-center justify-center gap-1 shrink-0 sm:h-[54px] sm:w-full">
                  <p className="text-white/60 text-[9px] font-black tracking-widest uppercase leading-none">CÓDIGO</p>
                  <div className="bg-[#00B050] text-white font-black text-lg px-3 py-1.5 rounded-xl min-w-[60px] text-center shadow-md leading-none">
                    {codVal}
                  </div>
                </div>
                {/* Botones nav: siempre las secciones accesibles, con su
                    nombre completo y repartidos en el alto que queda. */}
                <div className="grid grid-cols-2 sm:flex sm:flex-col gap-1.5 w-full flex-1 sm:pb-0.5">
                  {(esDeportista
                    ? [
                        { label: 'PAGOS',      href: null,                               active: true,  accion: '' },
                        { label: 'ASISTENCIA', href: `/alumnos/${id}/asistencia`,        active: false, accion: '' },
                        { label: 'MENSAJES',   href: null,                               active: false, accion: 'msg' },
                      ]
                    : [
                        { label: 'PAGOS',        href: null,                               active: true,  accion: '' },
                        { label: 'ASISTENCIA',   href: `/alumnos/${id}/asistencia`,        active: false, accion: '' },
                        { label: 'VALORACIONES', href: codVal ? `/evaluaciones?cod=${encodeURIComponent(codVal)}` : '/evaluaciones', active: false, accion: '' },
                        { label: 'MENSAJES',     href: '/mensajes',                        active: false, accion: '' },
                      ]
                  ).map(({ label, href, active, accion }) => (
                    <button key={label}
                      onClick={() => {
                        if (accion === 'msg') { document.getElementById('canales-msg')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
                        if (href) router.push(href);
                      }}
                      className={cn(
                        'transition rounded-lg px-2 text-[9.5px] font-black tracking-wide text-center w-full',
                        'flex-1 min-h-[26px] flex items-center justify-center',
                        active
                          ? 'bg-[#00B050] text-white'
                          : 'bg-[#2B3547] hover:bg-[#4A5568] border border-[#4A5568] text-white'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Las cuatro casillas de arriba —Cargados · Pagados · Pendientes ·
            Próximos— se quitaron el 27/08/2026 por orden de la dirección: el
            cuadro de abajo ya lo dice todo, mes por mes, y repetirlo arriba
            solo alejaba la tabla de la vista. Si algún día se quieren de
            vuelta, las cuentas siguen calculadas más arriba (`cargados`,
            `pagados`, `pendientes`, `proximos`, `totalPendiente`). */}

        {/* ── SELECTOR AÑO ── */}
        <div className="flex items-center justify-between">
          <h3 className="text-white font-black text-base tracking-wide">
            ESTADO DE CUENTA DEL DEPORTISTA
          </h3>
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="border border-[rgba(0,176,80,.45)] rounded-xl px-3 py-1.5 text-sm font-black text-white focus:outline-none focus:ring-2 focus:ring-green-400 bg-[#3C4759]">
            {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* ── TABLA ── */}
        <div className="rounded-2xl shadow-md border border-[#4A5568] overflow-hidden">
          <div className="overflow-x-auto w-full -webkit-overflow-scrolling-touch">
          <table className="border-collapse" style={{ width: '100%', minWidth: 300 }}>
            <thead>
              <tr>
                {[
                  { label: 'FECHA',      pct: '15%' },
                  { label: 'V. CARGADO', pct: '20%' },
                  { label: 'V. PAGADO',  pct: '20%' },
                  { label: 'DETALLE',    pct: '27%' },
                  { label: 'ESTADO',     pct: '18%' },
                ].map(({ label, pct }) => (
                  <th key={label} style={{ background: '#00B050', color: 'white', border: BW, padding: '9px 5px', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', width: pct }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagosVista.map((row, idx) => {
                const esNoPaga     = row.estado === 'NOPAGA';   // mes exonerado: no se cobra, verde "NO PAGA"
                const isPaid       = becado || row.estado === 'PAGÓ';
                const isPaidReal   = row.estado === 'PAGÓ';   // pago REAL (ignora el becado), para edición del admin
                const malDesc      = !becado && isPaid && esMalDescuento(row);  // pagó con mal descuento
                const debeDesc     = malDesc ? Math.max(0, tarifaNum - montoNum(row.vPagado)) : 0; // diferencia que debe
                const isProx       = !becado && row.estado === 'PROX';
                // hasSoporte: true si hay algún soporte que cubra este mes (PEND o PROX)
                // El padre puede pagar un mes próximo por adelantado — soporte tiene prioridad sobre PROX
                const hasSoporte   = !isPaid && soportes.some(s =>
                  !s.meses || s.meses.length === 0 || s.meses.includes(row.detalle)
                );
                const rowBg        = (isProx && (!hasSoporte || esProfesor || esReadonly)) ? '#333F50' : ROW;
                /* EL COLOR DE LA COLUMNA DETALLE.
                   La direccion la quiso en gris oscuro (27/08/2026): antes el
                   mes pagado iba en un gris claro (#4A5568) y el proximo en uno
                   mas claro todavia (#7C879A), y los dos se veian mas claros que
                   la propia fila. Ahora los dos van en el gris hondo de la
                   plataforma. Que un mes sea PROXIMO se sigue notando: toda esa
                   fila va con opacidad 0,6 y su casilla de estado dice PROX.
                   El ROJO del mes debido y el AMBAR del que esta por confirmar
                   NO se tocan: ahi el color si esta diciendo algo. */
                const detBg        = becado ? CAMPO : (isPaid || esNoPaga) ? CAMPO
                  : (esProfesor || esReadonly)
                    ? (isProx ? CAMPO : '#dc2626')
                    : hasSoporte ? '#d97706' : isProx ? CAMPO : '#dc2626';
                return (
                  <tr key={idx} style={{ opacity: isProx ? 0.6 : 1 }}>

                    {/* FECHA */}
                    <td style={{ background: rowBg, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      {puedeEditar ? (
                        <input
                          value={formatFecha(row.fecha)}
                          onChange={e => { const u = pagos.map((r,i) => i===idx ? {...r, fecha: e.target.value} : r); savePagos(u); }}
                          className="w-full text-center font-semibold text-[9px] text-white bg-transparent focus:outline-none focus:bg-[#3C4759] focus:rounded px-1 py-1"
                          placeholder="DD/MM/AAAA"
                        />
                      ) : (
                        <span className="text-[9px] font-semibold text-white">{formatFecha(row.fecha) || '—'}</span>
                      )}
                    </td>

                    {/* V. CARGADO — valor de la cuota del mes (matrícula = lo que pagó exacto) */}
                    <td style={{ background: '#2B3547', border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      <span className="text-[9px] font-bold text-white">
                        {(() => {
                          // MATRÍCULA: el valor exacto que pagó. Mensualidades: SIEMPRE la cuota
                          // del programa (tarifa). (El ajuste manual con Confirmar llega después.)
                          if (esNoPaga) return '—';   // mes exonerado: sin valor cargado
                          const esMatricula = /MATR[IÍ]CUL/i.test(row.detalle);
                          if (esMatricula) return ensurePeso(row.vPagado) || '—';
                          return tarifa || '—';
                        })()}
                      </span>
                    </td>

                    {/* V. PAGADO — gris claro, número con $ y puntos */}
                    <td style={{ background: '#2B3547', border: BW, padding: '4px 6px', textAlign: 'center' }}>
                      {puedeEditar ? (
                        <input
                          value={ensurePeso(row.vPagado)}
                          readOnly={!isPaid}
                          onChange={e => { if (!isPaid) return; const u = pagos.map((r,i) => i===idx ? {...r, vPagado: e.target.value} : r); savePagos(u); }}
                          className={cn('w-full text-center font-bold text-[9px] bg-transparent focus:outline-none px-1 py-1',
                            isPaid ? 'text-white' : 'text-white/40 cursor-default')}
                          placeholder="—"
                        />
                      ) : (
                        <span className={cn('text-[9px] font-bold', isPaid ? 'text-white' : 'text-white/40')}>
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
                      {esNoPaga
                        ? (puedeEditar
                            ? <button onClick={() => revertirNoPaga(idx)}
                                title="NO PAGA OK — clic para volver a cobrar este mes (PEND)"
                                className="rounded font-black text-white transition w-full bg-green-600 hover:bg-green-700 px-2 py-1 text-[11px]">
                                NO PAGA OK
                              </button>
                            : <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center text-white"
                                style={{ background: '#00B050' }}>NO PAGA OK</span>)
                        : becado
                        ? (puedeEditar
                            // El admin SÍ puede editar un becado y registrarle un pago si es necesario
                            ? <button onClick={() => toggleEstado(idx)}
                                title="Becado — clic para registrar o editar un pago si fuera necesario"
                                className="rounded font-black text-white transition w-full bg-green-600 hover:bg-green-700 px-2 py-1 text-[11px]">
                                {isPaidReal ? 'PAGÓ' : 'BECADO'}
                              </button>
                            // Calidosos / profesor / lectura: BECADO fijo
                            : <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center text-white"
                                style={{ background: '#00B050' }}>BECADO</span>)
                        : puedeEditar
                          ? <button onClick={() => (isPaid && malDesc ? setMalDescModal(idx) : toggleEstado(idx))}
                              title={isPaid && malDesc ? 'Clic para validar el descuento o revertir el pago' : undefined}
                              className={cn('rounded font-black text-white transition w-full',
                                !isPaid ? 'bg-red-500 hover:bg-red-600 px-3 py-1 text-[11px]'
                                : malDesc ? 'bg-orange-500 hover:bg-orange-600 px-1 py-[3px] text-[8px] leading-tight'
                                : 'bg-green-500 hover:bg-green-600 px-3 py-1 text-[11px]')}>
                                {!isPaid ? 'PEND'
                                  : malDesc ? <>PAGÓ CON MAL DESCUENTO<br/>DEBE: {ensurePeso(String(debeDesc))}</>
                                  : 'PAGÓ'}
                            </button>
                          : isPaid
                              ? <span className={cn('rounded font-black w-full block text-center text-white cursor-default',
                                  malDesc ? 'bg-orange-500 px-1 py-[3px] text-[8px] leading-tight' : 'bg-green-500 px-2 py-1 text-[11px]')}>
                                  {malDesc ? <>PAGÓ CON MAL DESCUENTO<br/>DEBE: {ensurePeso(String(debeDesc))}</> : 'PAGÓ'}
                                </span>
                              : (esProfesor || esReadonly)
                                ? isProx
                                  ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                                      style={{ background:'#2B3547', color:'#9AA5B5' }}>PRÓX</span>
                                  : <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                                      style={{ background:'rgba(192,80,77,.18)', color:'#F08A87' }}>PEND</span>
                                : hasSoporte
                                  ? <span className="px-1 py-[5px] rounded-lg font-black text-[9px] w-full block text-center leading-tight whitespace-nowrap"
                                      style={{ background: 'rgba(224,163,58,.16)', color: '#E0A33A', border: '1px solid rgba(224,163,58,.65)' }}>
                                      ⏳ POR CONFIRMAR
                                    </span>
                                  : isProx
                                    ? <span className="px-2 py-1 rounded font-black text-[11px] w-full block text-center"
                                        style={{ background:'#2B3547', color:'#9AA5B5' }}>PRÓX</span>
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
          ? <p className="text-center text-[11px] text-white/40 pb-4">
              Toca <strong>PEND</strong> para registrar pago · Toca <strong>PAGÓ</strong> para revertir
            </p>
          : soportes.length > 0
            ? <p className="text-center text-[11px] text-[#E0A33A] font-semibold pb-2">
                ⏳ Soporte(s) subidos · En revisión por el área contable
              </p>
            : <p className="text-center text-[11px] text-[#E0A33A] font-semibold pb-2">
                Solo lectura · Edición disponible desde Control de Pagos
              </p>
        }


        {/* ══════════════════════════════════════════════════════════════════
            TORNEOS  —  debajo de las mensualidades (dirección, 27/08/2026)

            Cada torneo que se le carga a un deportista aparece aquí con lo que
            vale, lo que ha pagado y su estado. El valor cargado sale del cuadro
            de Torneos y Competencias; no se escribe a mano.

            Se separó de OTROS PAGOS a propósito: un torneo no es lo mismo que
            un uniforme o una salida. La dirección los cobra y los persigue
            aparte, y mezclarlos obligaba a leer el tipo de cada renglón para
            saber de qué se trataba.

            EL PAGO SE MARCA A MANO, IGUAL QUE EN MENSUALIDADES (dirección,
            27/08/2026): administración ve el botón rojo PENDIENTE y, al
            oprimirlo, el torneo queda en PAGÓ. Oprimiéndolo otra vez se
            revierte. NO hay botón de "pagar ahora": el cobro en línea de
            torneos no existe todavía, y un botón que ofrezca pagar y no
            cobre confunde a quien lo ve.
            ══════════════════════════════════════════════════════════════════ */}
        {torneosCargados.length > 0 && (
          <div className="mb-4">
            <h3 className="font-black text-sm text-white uppercase tracking-wide flex items-center gap-1 mb-2">
              <span>🏆</span> Torneos
            </h3>
            {avisoTorneo && (
              <p className="text-[11px] font-semibold mb-2 rounded-lg px-3 py-2"
                style={{ color: '#fff', background: 'rgba(224,163,58,.16)', border: '1px solid #E0A33A' }}>
                {avisoTorneo}
              </p>
            )}
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#4A5568' }}>
              <div className="overflow-x-auto w-full">
                <table className="border-collapse" style={{ width: '100%', minWidth: 320 }}>
                  <thead>
                    <tr>
                      {/* EL MISMO ORDEN DE MENSUALIDADES (dirección, 27/08/2026):
                          FECHA · V. CARGADO · V. PAGADO · TORNEO · ESTADO.
                          Las dos tablas quedan una debajo de la otra, así que
                          leerlas con las columnas cambiadas de puesto obligaba
                          a devolverse cada vez. Donde mensualidades dice
                          DETALLE, aquí dice TORNEO: es lo mismo, el nombre de
                          lo que se está cobrando. */}
                      {[
                        { t: 'FECHA',       w: '15%' },
                        { t: 'V. CARGADO',  w: '20%' },
                        { t: 'V. PAGADO',   w: '20%' },
                        { t: 'TORNEO',      w: '27%' },
                        { t: 'ESTADO',      w: '18%' },
                      ].map(({ t, w }) => (
                        <th key={t} style={{
                          background: G, color: 'white', border: BW, padding: '9px 5px',
                          textAlign: 'center', fontSize: 10, fontWeight: 900,
                          letterSpacing: '0.04em', width: w,
                        }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {torneosCargados.map(op => {
                      const pagado = op.estado === 'PAGÓ';
                      /* NO PAGA = está exonerado de ESTE torneo. Se marca desde
                         la matriz del pospartido. No es deuda ni es pago: es un
                         torneo que a este deportista no se le cobra.
                         — dirección, 27/08/2026 */
                      const noPaga = String(op.estado ?? '').toUpperCase().replace(/\s+/g, '') === 'NOPAGA';
                      return (
                        <tr key={op.id}>
                          {/* FECHA — la del día en que se registró el pago */}
                          <td style={{ background: ROW, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            <span className={cn('text-[9px] font-semibold', pagado ? 'text-white' : 'text-white/40')}>
                              {pagado ? (formatFecha(op.fecha ?? '') || '—') : noPaga ? '—' : 'DD/MM/AAAA'}
                            </span>
                          </td>
                          {/* V. CARGADO — lo que vale el torneo en el cuadro */}
                          <td style={{ background: CAMPO, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            {/* El valor SÍ se muestra aunque esté exonerado
                                (dirección, 27/08/2026): así se sabe de cuánto
                                lo eximieron. Va apagado para que no se confunda
                                con una deuda. */}
                            <span className={cn('text-[9px] font-bold', noPaga ? 'text-white/45' : 'text-white')}>
                              {op.valor > 0 ? ensurePeso(String(op.valor)) : '—'}
                            </span>
                          </td>
                          {/* V. PAGADO — lo que de verdad entró. Si la base no
                              tiene esa casilla, se muestra el valor cargado. */}
                          <td style={{ background: CAMPO, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            <span className={cn('text-[9px] font-bold', pagado ? 'text-white' : 'text-white/40')}>
                              {pagado
                                ? ensurePeso(String(op.valor_pagado ?? op.valor))
                                : '—'}
                            </span>
                          </td>
                          {/* TORNEO — el nombre va SIEMPRE en gris oscuro
                              (dirección, 27/08/2026). Lo había puesto en rojo
                              cuando estaba pendiente, copiando la columna
                              DETALLE de mensualidades, y quedaba gritando: en
                              esta tabla el rojo es del BOTÓN de estado, que es
                              el que hay que mirar y oprimir. */}
                          <td style={{ background: CAMPO, color: '#fff', border: BW,
                                       padding: '8px 10px', textAlign: 'center',
                                       fontWeight: 900, fontSize: 11 }}>
                            {op.descripcion}
                          </td>
                          <td style={{ background: ROW, border: BW, padding: '6px 4px', textAlign: 'center' }}>
                            {noPaga ? (
                              /* Exonerado: no se cobra y no se toca desde aquí.
                                 Se cambia en la matriz del pospartido. */
                              <span className="px-2 py-1 rounded font-black text-[10.5px] w-full block text-center text-white"
                                title="Este deportista está exonerado de este torneo"
                                style={{ background: '#7C879A' }}>
                                NO PAGA
                              </span>
                            ) : puedeEditar ? (
                              <button
                                onClick={() => pagado ? toggleEstadoOtro(op) : abrirPagoTorneo(op)}
                                title={pagado
                                  ? 'Clic para revertir: vuelve a quedar pendiente'
                                  : 'Clic para registrar a mano el pago de este torneo'}
                                className={cn('rounded font-black text-white transition w-full px-2 py-1 text-[10.5px]',
                                  pagado ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600')}>
                                {pagado ? 'PAGÓ' : 'PENDIENTE'}
                              </button>
                            ) : (
                              <span className="px-2 py-1 rounded font-black text-[10.5px] w-full block text-center text-white"
                                style={{ background: pagado ? '#00B050' : '#C0504D' }}>
                                {pagado ? 'PAGÓ' : 'PENDIENTE'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── OTROS PAGOS (admin y profe ven; admin edita) ── */}
        {!esDeportista && (
          <div className="mb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-sm text-white uppercase tracking-wide flex items-center gap-1">
                <span>📦</span> Otros Pagos
              </h3>
              {esAdmin && (
                <div className="flex gap-2">
                  <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importarXlsx}/>
                  <button onClick={() => xlsxInputRef.current?.click()}
                    className="text-[10px] font-black px-2 py-1 rounded-lg border border-[#4A5568] text-white/70 hover:bg-[#333F50] transition">
                    📥 Excel
                  </button>
                  <button onClick={() => setShowAddOtro(true)}
                    className="text-[10px] font-black px-2 py-1 rounded-lg text-white transition"
                    style={{ background: '#00B050' }}>
                    + Agregar
                  </button>
                </div>
              )}
            </div>

            {/* Tabla — mismo layout que mensualidades */}
            {otrosNoTorneo.length === 0 ? (
              <p className="text-center text-[11px] text-white/40 py-3 border border-dashed border-[#4A5568] rounded-xl">
                Sin otros pagos registrados
              </p>
            ) : (
              <div className="rounded-2xl shadow-md border border-[#4A5568] overflow-hidden">
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
                        <th key={label} style={{ background: '#00B050', color: 'white', border: BW, padding: '9px 5px', textAlign: 'center', fontSize: 10, fontWeight: 900, letterSpacing: '0.04em', width: pct }}>
                          {label}
                        </th>
                      ))}
                      {esAdmin && <th style={{ background: '#00B050', border: BW, padding: '9px 4px', width: '6%' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {otrosNoTorneo.map(op => {
                      const isPaidO  = op.estado === 'PAGÓ';
                      const detBgO   = isPaidO ? CAMPO : '#dc2626';
                      const rowBgO   = ROW;
                      return (
                        <tr key={op.id}>
                          {/* FECHA */}
                          <td style={{ background: rowBgO, border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            <span className="text-[9px] font-semibold text-white">{op.fecha || 'DD/MM/AAAA'}</span>
                          </td>
                          {/* V. PAGADO */}
                          <td style={{ background: '#2B3547', border: BW, padding: '4px 6px', textAlign: 'center' }}>
                            <span className={cn('text-[9px] font-bold', isPaidO ? 'text-white' : 'text-white/40')}>
                              {isPaidO ? `$${Number(op.valor).toLocaleString('es-CO')}` : '—'}
                            </span>
                          </td>
                          {/* DETALLE — descripcion + tipo */}
                          <td style={{ background: detBgO, color: 'white', border: BW, padding: '6px 8px', textAlign: 'center', fontWeight: 900, fontSize: 10 }}>
                            <span className="block leading-tight">{op.descripcion}</span>
                            <span className={cn('text-[8px] font-black px-1.5 py-0.5 rounded-full mt-0.5 inline-block',
                              op.tipo === 'torneo' ? 'bg-blue-200 text-[#8FBEF0]' : 'bg-[rgba(139,114,217,.25)] text-[#C3B4F0]')}>
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
                                className="w-6 h-6 rounded bg-[rgba(192,80,77,.14)] hover:bg-[rgba(192,80,77,.20)] flex items-center justify-center transition text-red-400 text-xs mx-auto">✕</button>
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
                <div className="bg-[#3C4759] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
                  <h3 className="font-black text-white">Agregar Otro Pago</h3>
                  <div>
                    <label className="text-xs font-black text-white/70 uppercase tracking-wide block mb-1">Producto</label>
                    <select value={selProdId} onChange={e => setSelProdId(e.target.value)}
                      className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-green-500">
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
                      className="flex-1 py-3 rounded-xl border-2 border-[#4A5568] text-white/70 font-black text-sm hover:bg-[#333F50]">Cancelar</button>
                    <button onClick={agregarOtroPago} disabled={!selProdId || guardandoOtro}
                      className="flex-1 py-3 rounded-xl font-black text-sm text-white transition"
                      style={{ background: selProdId && !guardandoOtro ? '#00B050' : '#7C879A' }}>
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
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm text-white transition active:scale-95"
              style={{ background: '#00B050' }}>
              📎 Subir soporte
            </button>
            <button
              onClick={() => setVerSoportes(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm text-white transition active:scale-95 border"
              style={{ background: '#2B3547', borderColor: '#4A5568' }}>
              🖼️ Ver soportes{soportes.length > 0 ? ` (${soportes.length})` : ''}
            </button>
          </div>
        )}

        {/* ── COMUNICACIÓN (solo calidoso): Área de Pagos / Formador / Director ── */}
        {esDeportista && !esReadonly && (
          <div id="canales-msg" className="pb-6" style={{ scrollMarginTop: 80 }}>
            <p className="text-[11px] font-black text-white/70 uppercase tracking-widest mb-2 px-1">
              ¿Tienes una duda, solicitud o reclamo? Deja tu mensaje:
            </p>
            <div className="flex flex-col gap-2">
              {CANALES_MSG.map(c => (
                <button key={c.titulo}
                  onClick={() => { setMsgDestino(c); setPagosMsgOk(false); setPagosMsgTexto(''); setPagosMsgWa(''); }}
                  className="w-full text-left flex items-center gap-3 py-3 px-4 rounded-xl font-bold text-sm text-white transition active:scale-95 border border-[#5A6478]"
                  style={{ background: c.color }}>
                  <span className="text-lg leading-none">{c.emoji}</span>
                  <span className="flex-1">
                    <span className="font-black">{c.boton}</span>
                    <span className="block text-[11px] font-medium text-white/80">{c.desc}</span>
                  </span>
                  <span className="text-white/70">›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── FACTURACIÓN: cuadro aparte, al final (solo calidoso) ── */}
        {esDeportista && !esReadonly && (
          <div className="pb-8">
            <div className="rounded-2xl border-2 border-dashed border-[rgba(0,176,80,.5)] bg-[rgba(0,176,80,.10)] p-4 text-center">
              <p className="text-[13px] font-black text-[#5BE39B] mb-3">De requerir Factura, solicítala ahora</p>
              <button type="button" onClick={() => router.push(`/alumnos/${id}/factura`)}
                className="w-full rounded-xl py-3 text-sm font-black text-white transition active:scale-95 flex items-center justify-center gap-2"
                style={{ background: '#00B050' }}>
                🧾 Solicitar factura
              </button>
            </div>
          </div>
        )}

        {/* ── MODAL: dejar mensaje al canal elegido ── */}
        {msgDestino && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => !enviandoPagos && setMsgDestino(null)}>
            <div className="bg-[#3C4759] rounded-2xl w-full max-w-md p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              {pagosMsgOk ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="font-black text-white text-lg">¡Mensaje enviado!</p>
                  <p className="text-white/70 text-sm mt-1">Revisaremos tu mensaje y te contactaremos.</p>
                </div>
              ) : (
                <>
                  <p className="font-black text-white text-base mb-1">Mensaje a {msgDestino.titulo}</p>
                  <p className="text-white/70 text-xs mb-4">Escribe tu duda, solicitud o reclamo. Quedará registrado en la plataforma.</p>
                  <label className="block text-[11px] font-bold text-white/70 uppercase tracking-wide mb-1">Tu mensaje</label>
                  <textarea value={pagosMsgTexto} onChange={e => setPagosMsgTexto(e.target.value)} rows={4}
                    placeholder="Escribe aquí tu mensaje..."
                    className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 resize-none mb-3"
                    style={{ ['--tw-ring-color' as any]: msgDestino.color }} />
                  <label className="block text-[11px] font-bold text-white/70 uppercase tracking-wide mb-1">WhatsApp de contacto</label>
                  <input value={pagosMsgWa} onChange={e => setPagosMsgWa(e.target.value)} inputMode="tel"
                    placeholder="Ej: 3001234567"
                    className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 mb-4"
                    style={{ ['--tw-ring-color' as any]: msgDestino.color }} />
                  <div className="flex gap-3">
                    <button onClick={() => setMsgDestino(null)} disabled={enviandoPagos}
                      className="flex-1 border border-[#4A5568] rounded-xl py-3 text-sm font-bold text-white/70 hover:bg-[#333F50] transition">Cancelar</button>
                    <button onClick={enviarMensajePagos} disabled={enviandoPagos || !pagosMsgTexto.trim()}
                      className="flex-1 rounded-xl py-3 text-sm font-black text-white transition"
                      style={{ background: enviandoPagos || !pagosMsgTexto.trim() ? '#7C879A' : msgDestino.color }}>
                      {enviandoPagos ? 'Enviando...' : 'Enviar mensaje'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ── MODAL CONFIRMAR REVERT ── */}
      {confirmRevert !== null && (() => {
        const row = pagosVista[confirmRevert];
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-[#3C4759] rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[rgba(192,80,77,.20)] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[#F08A87] text-xl font-black">!</span>
                </div>
                <div>
                  <h3 className="font-black text-white text-base leading-tight">¿Revertir este pago?</h3>
                  <p className="text-xs text-white/70 mt-0.5">{row?.detalle}</p>
                </div>
              </div>
              <p className="text-sm text-white/70 mb-2">Esta acción eliminará la información registrada:</p>
              <div className="bg-[rgba(192,80,77,.14)] border border-[rgba(192,80,77,.45)] rounded-xl p-3 mb-5 text-xs text-white space-y-1">
                {row?.vPagado && <p><span className="font-bold">Valor:</span> {row.vPagado}</p>}
                {row?.destino && <p><span className="font-bold">Destino:</span> {row.destino}</p>}
                {row?.fecha   && <p><span className="font-bold">Fecha:</span>  {row.fecha}</p>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmRevert(null)}
                  className="flex-1 border border-[#4A5568] rounded-xl py-3 text-sm font-bold text-white/70 hover:bg-[#333F50] transition">
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

      {/* ── MODAL MAL DESCUENTO: validar (queda PAGÓ verde) o revertir el pago ── */}
      {malDescModal !== null && (() => {
        const row = pagosVista[malDescModal];
        const debe = Math.max(0, tarifaNum - montoNum(row?.vPagado || ''));
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-[#3C4759] rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[rgba(224,163,58,.20)] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[#E0A33A] text-xl font-black">!</span>
                </div>
                <div>
                  <h3 className="font-black text-white text-base leading-tight">Pagó con mal descuento</h3>
                  <p className="text-xs text-white/70 mt-0.5">{row?.detalle}</p>
                </div>
              </div>
              <div className="bg-[rgba(224,163,58,.14)] border border-[rgba(224,163,58,.45)] rounded-xl p-3 mb-5 text-xs text-white space-y-1">
                {row?.vPagado && <p><span className="font-bold">Pagó:</span> {ensurePeso(row.vPagado)}</p>}
                <p><span className="font-bold">Debe:</span> {ensurePeso(String(debe))}</p>
                {row?.fecha && <p><span className="font-bold">Fecha:</span> {row.fecha}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => autorizarDescuento(malDescModal)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-black transition">
                  ✓ Validar el mal descuento (queda PAGÓ verde)
                </button>
                <button
                  onClick={() => { const i = malDescModal; setMalDescModal(null); setConfirmRevert(i); }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 text-sm font-black transition">
                  ↩ Revertir el pago (hubo un error)
                </button>
                <button
                  onClick={() => setMalDescModal(null)}
                  className="w-full border border-[#4A5568] rounded-xl py-2.5 text-sm font-bold text-white/70 hover:bg-[#333F50] transition">
                  Cancelar
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
          <div className="bg-[#3C4759] rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#4A5568]">
              <h3 className="font-black text-white text-base">Soportes de pago</h3>
              <button onClick={() => setVerSoportes(false)}
                className="w-7 h-7 rounded-full bg-[#2B3547] hover:bg-[#2B3547] flex items-center justify-center font-bold text-white/70 text-sm transition">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {soportes.length === 0 ? (
                <p className="text-center text-white/40 text-sm font-semibold py-8">
                  No hay soportes subidos aún
                </p>
              ) : (
                soportes.map((s, i) => (
                  <div key={i} className="rounded-xl border border-[#4A5568] overflow-hidden">
                    {s.data.startsWith('data:image') ? (
                      <img src={s.data} alt={s.name} className="w-full object-contain max-h-48"/>
                    ) : (
                      /* PDF: el navegador NO deja abrir un enlace "data:", por eso antes
                         no pasaba nada al tocarlo. Se abre como archivo temporal. */
                      <button type="button"
                        onClick={() => abrirSoporte(s.data, s.name)}
                        className="w-full bg-[#333F50] p-4 text-center hover:bg-[#2B3547] transition cursor-pointer">
                        <p className="text-2xl mb-1">📄</p>
                        <p className="text-sm font-semibold text-white/70 truncate">{s.name}</p>
                        <p className="text-[11px] font-black text-[#8FBEF0] mt-1">
                          {esPdfDato(s.data) ? 'Toca para abrir el PDF ↗' : 'Toca para abrir el archivo ↗'}
                        </p>
                      </button>
                    )}
                    <div className="px-3 pt-2 pb-1 bg-[#333F50]">
                      <p className="text-[10px] font-black text-white truncate">{s.name}</p>
                      {s.meses && s.meses.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.meses.map(m => (
                            <span key={m} className="text-[9px] font-black px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(0,176,80,.16)', color: '#065f46' }}>
                              {m.replace(' 2026','').replace(' 2027','')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 bg-[#333F50] border-t border-[#4A5568]">
                      <p className="text-[10px] text-white/40 font-semibold">{s.date}</p>
                      <button
                        onClick={() => eliminarSoporte(i)}
                        className="text-red-400 hover:text-[#F08A87] text-[10px] font-bold transition">
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
          <div className="bg-[#3C4759] rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-10 h-1 bg-[#2B3547] rounded-full mx-auto mb-5 sm:hidden"/>
            <h3 className="font-black text-white text-base mb-1">Registrar Pago</h3>
            <p className="text-white/40 text-xs mb-5 font-semibold">{pagosVista[editIdx]?.detalle} — {anio}</p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Valor Cargado</label>
                <input
                  value={editForm.vCargado || ''}
                  onChange={e => setEditForm(f => ({ ...f, vCargado: e.target.value }))}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                  placeholder="$138.000"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Descripción</label>
                <input
                  value={editForm.destino || ''}
                  onChange={e => setEditForm(f => ({ ...f, destino: e.target.value }))}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                  placeholder="Ej: Transferencia, efectivo..."
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Fecha de Pago</label>
                <input
                  type="date"
                  onChange={e => {
                    const d = e.target.value;
                    if (d) {
                      const [y, m, day] = d.split('-');
                      setEditForm(f => ({ ...f, fecha: `${day}/${m}/${y.slice(2)}` }));
                    }
                  }}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                />
                {editForm.fecha && (
                  <p className="text-[11px] text-[#5BE39B] font-bold mt-1">→ {editForm.fecha}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Valor Pagado</label>
                <input
                  value={editForm.vPagado || ''}
                  onChange={e => setEditForm(f => ({ ...f, vPagado: e.target.value }))}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                  placeholder="$138.000"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setEditIdx(null); setEditForm({}); }}
                className="flex-1 border border-[#4A5568] rounded-xl py-3 text-sm font-bold text-white/70 hover:bg-[#333F50] transition">
                Cancelar
              </button>
              <button
                onClick={confirmarPago}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-black transition">
                ✓ Confirmar
              </button>
            </div>

            {/* Eliminar mes — opción discreta al fondo del modal */}
            <div className="mt-4 pt-4 border-t border-[#4A5568] text-center">
              <button
                onClick={() => editIdx !== null && eliminarMes(editIdx)}
                className="text-red-400 hover:text-[#F08A87] text-xs font-bold transition underline underline-offset-2">
                No cobrar este mes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR PAGO DE UN TORNEO ───────────────────────────────
          El mismo cuadro de las mensualidades, para los torneos (dirección,
          27/08/2026). Mientras no exista el cobro en línea, el pago del torneo
          se registra aquí a mano: cuánto se cargó, cómo pagó, cuándo y cuánto
          entró de verdad. */}
      {torneoEnPago && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#3C4759] rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-10 h-1 bg-[#2B3547] rounded-full mx-auto mb-5 sm:hidden"/>
            <h3 className="font-black text-white text-base mb-1">Registrar Pago</h3>
            <p className="text-white/40 text-xs mb-5 font-semibold">{torneoEnPago.descripcion}</p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Valor Cargado</label>
                <input
                  value={formTorneo.vCargado}
                  inputMode="numeric"
                  onChange={e => setFormTorneo(f => ({ ...f, vCargado: e.target.value }))}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                  placeholder="$ 253.500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Descripción</label>
                <input
                  value={formTorneo.medio}
                  onChange={e => setFormTorneo(f => ({ ...f, medio: e.target.value }))}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                  placeholder="Ej: Transferencia, efectivo..."
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Fecha de Pago</label>
                <input
                  type="date"
                  value={formTorneo.fecha}
                  onChange={e => setFormTorneo(f => ({ ...f, fecha: e.target.value }))}
                  style={{ colorScheme: 'dark' }}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                />
                {formTorneo.fecha && (
                  <p className="text-[11px] text-[#5BE39B] font-bold mt-1">→ {formatFecha(formTorneo.fecha)}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Valor Pagado</label>
                <input
                  value={formTorneo.vPagado}
                  inputMode="numeric"
                  onChange={e => setFormTorneo(f => ({ ...f, vPagado: e.target.value }))}
                  className="w-full border border-[#4A5568] rounded-xl px-3 py-2.5 text-sm font-bold mt-1 focus:outline-none focus:ring-2 focus:ring-green-400 text-white"
                  placeholder="$ 253.500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setTorneoEnPago(null)}
                className="flex-1 border border-[#4A5568] rounded-xl py-3 text-sm font-bold text-white/70 hover:bg-[#333F50] transition">
                Cancelar
              </button>
              <button
                onClick={confirmarPagoTorneo}
                disabled={guardandoTorneo}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl py-3 text-sm font-black transition">
                {guardandoTorneo ? '…' : '✓ Confirmar'}
              </button>
            </div>

            {/* Quitarle el torneo — la opción discreta del fondo, como el
                "No cobrar este mes" de las mensualidades. */}
            <div className="mt-4 pt-4 border-t border-[#4A5568] text-center">
              <button
                onClick={async () => { const op = torneoEnPago; setTorneoEnPago(null); if (op) await eliminarOtroPago(op); }}
                className="text-red-400 hover:text-[#F08A87] text-xs font-bold transition underline underline-offset-2">
                No cobrarle este torneo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST SOPORTE GUARDADO ── */}
      {toastSoporte && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#00B050] text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-fade-in-up"
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
              className="bg-[#3C4759] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Encabezado */}
              <div className="px-5 pt-5 pb-3 border-b border-[#4A5568]">
                <h3 className="font-black text-white text-base leading-tight">📎 Soporte de pago</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  {pendingFiles.length > 1 ? `${pendingFiles.length} archivos` : pendingFiles[0]?.name}
                </p>
              </div>

              <div className="px-5 pt-4 pb-5 space-y-4">

                {/* Selección de mes(es) */}
                {mesesDisp.length > 0 && (
                  <div>
                    <p className="text-[11px] font-black text-white/70 uppercase tracking-widest mb-2">
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
                                ? { background: 'rgba(192,80,77,.14)', color: '#991b1b', borderColor: '#ef4444' }
                                : sel
                                  ? { background: '#00B050', color: 'white', borderColor: '#00B050' }
                                  : { background: '#3C4759', color: '#4A5568', borderColor: '#d1d5db' }
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
                      <div className="mt-3 rounded-xl border-2 border-red-400 bg-[rgba(192,80,77,.14)] px-4 py-3 flex items-start gap-2">
                        <span className="text-[#F08A87] text-lg leading-none mt-0.5">⛔</span>
                        <div>
                          <p className="text-[#F08A87] font-black text-[11px] leading-snug">
                            Primero debes pagar <span className="underline underline-offset-2">
                              {mesConflicto.detalle.replace(' 2026','').replace(' 2027,','')}
                            </span>
                          </p>
                          <p className="text-[#F08A87] text-[10px] mt-0.5">
                            No puedes seleccionar meses posteriores mientras haya meses anteriores pendientes. Si tienes dudas, deja tu mensaje al Área de Pagos más abajo.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Aviso selección vacía */}
                    {mesesSelSoporte.length === 0 && !mesConflicto && (
                      <p className="text-[10px] text-[#E0A33A] font-semibold mt-2">
                        Selecciona al menos un mes para continuar
                      </p>
                    )}
                  </div>
                )}

                {/* Nombre del soporte */}
                <div>
                  <p className="text-[11px] font-black text-white/70 uppercase tracking-widest mb-2">
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
                    className="w-full border-2 border-[rgba(0,176,80,.45)] rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-green-600"
                  />
                </div>

                {/* Botones */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => { setPendingFiles([]); setMesesSelSoporte([]); setShowNombreModal(false); }}
                    className="flex-1 py-3 rounded-xl font-bold text-sm text-white/70 bg-[#2B3547] active:scale-95 transition">
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarNombreSoporte}
                    disabled={!puedeGuardar}
                    className="flex-1 py-3 rounded-xl font-black text-sm text-white active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: '#00B050' }}>
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
