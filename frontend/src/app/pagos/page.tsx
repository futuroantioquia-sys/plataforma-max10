'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DollarSign, Search,
  User, Phone,
} from 'lucide-react';
import {
  getDeportistas, getPagos, updateColumnasDeportista,
  getTelefonosWhatsApp, guardarTelefonoWhatsApp, borrarTelefonoWhatsApp,
} from '@/lib/db';
import type { TelefonoWhatsApp } from '@/lib/db';
import {
  getCobroConfig, armarMensaje, pagaAMax10, escogerBoton, CONFIG_DEFAULT,
  type CobroConfig,
} from '@/lib/cobro-config';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

type PagoRow = {
  detalle: string; vCargado: string; estado: 'PAGÓ' | 'PEND';
  destino: string; fecha: string; vPagado: string;
};
type AllPagos = Record<string, PagoRow[]>;
type DepEstado = 'ACTIVO' | 'PAUSO' | 'RETIRADO';
const DEP_ESTADOS_KEY = 'futuro_dep_estados';

// ── PALETA DE LA PLATAFORMA ──────────────────────────────────────
// La misma de Asistencia y Microciclo: gris azulado oscuro de fondo, tarjetas
// un poco más claras, campos en el gris hondo, verde institucional como único
// color de botón y el rojo SOLO donde hay plata pendiente.
const LIENZO    = '#333F50';   // fondo de la pantalla
const PANEL     = '#3C4759';   // tarjetas y filas de la tabla
const CAMPO     = '#2B3547';   // desplegables, buscador, cuadros de texto
const BORDE     = '#4A5568';
const VERDE     = '#00B050';   // verde institucional
const ROJO      = '#C0504D';   // lo que se debe
const AMBAR     = '#E0A33A';
const GRIS_BECA = '#5A6478';   // becados: gris apagado, sin morado
const GRIS_VACIO= '#7C879A';   // guiones y casillas sin dato

// OBSERVACIÓN: nota libre de cartera (compromisos de pago, acuerdos, razón de la
// mora…). Se guarda dentro de las columnas del deportista, así que la ve todo el
// que entre a la plataforma, no solo el computador donde se escribió.
const COL_OBS = 'OBSERVACIÓN PAGOS';
const esColObs = (k: string) => /^observaci[oó]n\s*pagos$/i.test(k.trim());
function leerObs(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(esColObs);
  return k ? String((cols as any)[k] ?? '') : '';
}

function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  return k ? dep._columnas[k] : '';
}
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
/** Color del código según el tipo de afiliación.
 *  Los BECADOS salieron del morado: van en gris apagado para que la pantalla
 *  no se vea tan colorida. Nuevo / antiguo / reingreso conservan su color
 *  porque el usuario los distingue por ahí. */
function colorCodigo(afil: string): string {
  const v = afil.toLowerCase();
  if (v.includes('nuevo'))     return '#E07B39';    // nuevo
  if (v.includes('antigu'))    return VERDE;        // antiguo
  if (v.includes('reingreso')) return '#4E8FD6';    // reingreso
  if (v.includes('mb instit')) return '#3E4859';    // media beca
  if (v.includes('b instit'))  return GRIS_BECA;    // becado
  return GRIS_BECA;
}

/* ── Filas del año (mismas que estado-cuenta) ── */
const DETALLE_ROWS = [
  'MATRÍCULA 2026',
  'FEBRERO 2026','MARZO 2026','ABRIL 2026','MAYO 2026','JUNIO 2026',
  'JULIO 2026','AGOSTO 2026','SEPTIEMBRE 2026','OCTUBRE 2026','NOVIEMBRE 2026','DICIEMBRE 2026',
];
/* Nombres viejos guardados sin el año → nombre actual. El estado de cuenta ya
   hacía esta traducción y esta pantalla NO, así que una matrícula guardada como
   "MATRÍCULA" (sin 2026) aquí no se encontraba y el deportista salía debiendo. */
const MIGRAR_DET: Record<string, string> = {
  'MATRÍCULA': 'MATRÍCULA 2026', 'MATRICULA': 'MATRÍCULA 2026',
  'FEBRERO': 'FEBRERO 2026', 'MARZO': 'MARZO 2026', 'ABRIL': 'ABRIL 2026',
  'MAYO': 'MAYO 2026', 'JUNIO': 'JUNIO 2026', 'JULIO': 'JULIO 2026',
  'AGOSTO': 'AGOSTO 2026', 'SEPTIEMBRE': 'SEPTIEMBRE 2026', 'OCTUBRE': 'OCTUBRE 2026',
  'NOVIEMBRE': 'NOVIEMBRE 2026', 'DICIEMBRE': 'DICIEMBRE 2026',
};
const normDet = (d: any): string => {
  const t = String(d ?? '').trim();
  return MIGRAR_DET[t.toUpperCase()] ?? t;
};

const MES_NUM: Record<string, number> = {
  'MATRÍCULA 2026':0,
  'FEBRERO 2026':2,'MARZO 2026':3,'ABRIL 2026':4,'MAYO 2026':5,'JUNIO 2026':6,
  'JULIO 2026':7,'AGOSTO 2026':8,'SEPTIEMBRE 2026':9,'OCTUBRE 2026':10,'NOVIEMBRE 2026':11,'DICIEMBRE 2026':12,
};
const MES_ACTUAL = new Date().getMonth() + 1;
function esFuturo(d: string) { const n = MES_NUM[d]; return n !== undefined && n > 0 && n > MES_ACTUAL; }

/* ── POR QUÉ A UNOS SE LES COBRABA HASTA AGOSTO Y A OTROS HASTA SEPTIEMBRE ─
   (dirección, 06/09/2026 — «lo que más raro me parece es que estábamos
    cobrando y a unos se les cobraba hasta agosto y a otros hasta septiembre» ·
    «que a todos por igual se les cobre hasta septiembre»)

   ERA UN ERROR, Y ESTÁ MEDIDO. En la base hay 628 renglones de SEPTIEMBRE:
       413 PAGÓ · 204 PROX · 9 PEND · 2 NOPAGA
   Esos 204 en PROX son el problema. PROX quiere decir «todavía no le toca»,
   y se les puso cuando septiembre aún era futuro. Pero llegó septiembre y
   NADIE los cambió: se quedaron en PROX para siempre.

   Resultado: al que NO tenía renglón de septiembre, la pantalla se lo contaba
   como pendiente (así funciona por defecto); al que sí lo tenía en PROX, no.
   Dos deportistas iguales, cobros distintos. En agosto no pasa: ahí no quedó
   ni un PROX (919 PAGÓ y 81 PEND).

   EL ARREGLO: un PROX de un mes que YA LLEGÓ vale lo mismo que no tener nada
   — es PENDIENTE. No se toca la base: se corrige al leer, y así queda parejo
   para todos, ahora y en octubre, sin que nadie tenga que acordarse.

   (Si algún día se quiere volver a la regla de «el mes en curso no se cobra
   antes del 15», es cambiar MES_ACTUAL por MES_ACTUAL-1 en las dos líneas
   marcadas más abajo. Hoy la dirección lo quiere hasta el mes en curso.) */
/** ¿Este renglón está pendiente de verdad? Un PROX de un mes que ya llegó, sí. */
function estaPendiente(det: string, saved: any): boolean {
  if (!saved) return true;                       // sin renglón = pendiente
  if (saved.estado === 'PEND') return true;
  if (saved.estado === 'PROX') {
    const n = MES_NUM[det];
    return n === 0 || n <= MES_ACTUAL;           // ya llegó su mes → pendiente
  }
  return false;                                   // PAGÓ, NOPAGA, ELIM…
}

/* ── LA MENSUALIDAD DE ESTE DEPORTISTA ────────────────────────────────────
   Se apoya en `tarifaMensual` —la misma tabla del Estado de Cuenta, que ya
   estaba más abajo en este archivo— y le aplica encima el acuerdo con la
   familia si lo hay (CUOTA_MANUAL). Así las dos pantallas nunca discrepan. */
function mensualidadDe(dep: Deportista): number {
  const cols = dep._columnas ?? {};
  const kMan = Object.keys(cols).find(k => /^cuota_?manual$/i.test(String(k).trim()));
  const man = kMan ? String(cols[kMan] ?? '').replace(/\D/g, '') : '';
  if (man) return Number(man);
  return tarifaMensual(getCol(dep, /^program/i), getCol(dep, /^sede/i));
}

/* ═══════════════════════════════════════════════════════════════════════════
   COBRAR POR WHATSAPP

   El texto del botón, su color y el mensaje que se manda YA NO ESTAN AQUI:
   los edita el administrador en  Gestión → Botones de Cobro  (/botones-cobro).
   Esta pantalla solo los lee. Si la configuración no carga, se usan los
   textos de fábrica y el cobro sigue funcionando igual.

   Al oprimir el botón se abre WhatsApp con el mensaje ya escrito. NO envía
   nada solo: el mensaje queda listo y la persona le da enviar. Nadie recibe
   un cobro sin que alguien lo lea antes.
   ═══════════════════════════════════════════════════════════════════════════ */

const URL_APP = 'https://plataforma-max10.vercel.app';

const sinTildes = (t: any) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Mensualidad según programa y sede — misma tabla del estado de cuenta. */
function tarifaMensual(programa: string, sede: string): number {
  const p = sinTildes(programa), s = sinTildes(sede);
  if (s.includes('niqu')) {
    if (p.includes('estimul')) return 70000;
    if (p.includes('formac'))  return 115000;
    return 138000;
  }
  if (p.includes('estimul')) return 80000;
  return 138000;
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

/** "JULIO 2026" → "Julio". Para escribirlo bonito en el mensaje. */
const mesBonito = (det: string) => {
  const m = String(det).replace(/\s*\d{4}\s*$/, '').trim().toLowerCase();
  return m.charAt(0).toUpperCase() + m.slice(1);
};
/** ["Junio","Julio","Agosto"] → "Junio, Julio y Agosto" */
const listaBonita = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];

/** Saca el PRIMER celular que aparezca en la casilla. Hace falta porque a
 *  veces vienen dos números en la misma casilla ("300... / 310..."), y si se
 *  quitaran todos los signos de una quedarían pegados en un solo número malo. */
function primerCelular(txt: any): string {
  const tandas = String(txt ?? '').match(/\d[\d\s.\-()]*/g) || [];
  for (const t of tandas) {
    const d = t.replace(/\D/g, '');
    if (d.length === 10) return d;                        // celular colombiano
    if (d.length === 12 && d.startsWith('57')) return d.slice(2);
    if (d.length > 10) return d.slice(0, 10);             // dos números pegados
  }
  return '';
}

/** Celular del acudiente, sacado de la ficha del deportista (TOTAL AFILIADOS).
 *  La columna se llama CELULAR DEL ACUDIENTE; de todos modos se prueban otros
 *  nombres, por si en alguna ficha vieja quedó escrita distinto. */
function telefonoDe(dep: Deportista): string {
  const cols = (dep as any)._columnas ?? {};
  const buscar = (rx: RegExp): string => {
    for (const k of Object.keys(cols)) {
      if (!rx.test(k.trim())) continue;
      const num = primerCelular(cols[k]);
      if (num) return num;
    }
    return '';
  };
  return buscar(/^celular\s*del\s*acudiente$/i)                    // la buena
      || buscar(/celular.*acudiente|acudiente.*celular/i)           // variantes
      || buscar(/whats|celular|m[oó]vil|movil|tel[eé]f|contacto/i); // último recurso
}
/** Deja el número como lo quiere WhatsApp: con indicativo 57 y sin signos. */
function aWhatsApp(tel: string): string {
  const d = String(tel).replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '57' + d;               // celular colombiano
  if (d.length === 12 && d.startsWith('57')) return d;
  return d;                                            // ya viene con indicativo
}

const MES_ABREV: Record<string, string> = {
  'MATRÍCULA 2026':'MAT',
  'FEBRERO 2026':'FEB','MARZO 2026':'MAR','ABRIL 2026':'ABR','MAYO 2026':'MAY','JUNIO 2026':'JUN',
  'JULIO 2026':'JUL','AGOSTO 2026':'AGO','SEPTIEMBRE 2026':'SEP','OCTUBRE 2026':'OCT',
  'NOVIEMBRE 2026':'NOV','DICIEMBRE 2026':'DIC',
};

/* ── Fecha afiliación → número de mes ── */
function fmtFecha(v: string): string {
  if (!v) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
  const num = Number(v);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  const iso = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : v;
}
/** dd/mm/aaaa (o serie de Excel) → aaaa-mm-dd, que es lo que pide <input type="date">. */
function aISO(v: string): string {
  const m = fmtFecha(String(v ?? '')).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
/** aaaa-mm-dd → dd/mm/aaaa, el formato con el que se guarda en la ficha. */
function deISO(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function getMesAfil(cols: Record<string, string>): number {
  const k = Object.keys(cols).find(k => /fecha.*afil|afil.*fecha/i.test(k));
  if (!k) return 1;
  const f = fmtFecha(String(cols[k] ?? '').trim());
  const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 1;
  return parseInt(m[2], 10) < 2026 ? 1 : parseInt(m[1], 10);
}


/* ═══════════════════════════════════════════════════════════════════════════
   LA CUENTA DE CADA DEPORTISTA — fuera de la pantalla, a propósito.

   POR QUÉ SE SACÓ DE ADENTRO (dirección, 27/08/2026): esta cuenta es lo más
   pesado de Control de Pagos —recorre todas las columnas de la ficha, junta los
   pagos guardados bajo el código y bajo el ID, y arma los doce renglones del
   año—. Estando adentro de la pantalla se volvía a hacer, para los ~600
   deportistas, CADA VEZ que algo se movía: una tecla en el buscador, una
   casilla marcada, el mouse pasando por una fila. Y no una vez: tres, porque
   se llamaba en el filtro, en la cola de cobro y otra vez al pintar cada fila.

   Ahora vive aquí afuera y la pantalla la manda a hacer UNA sola vez por
   deportista, y solo cuando de verdad cambia algo (la lista de deportistas o
   los pagos). El resultado queda guardado en un mapa y todo el mundo lo lee de
   ahí. La cuenta es exactamente la misma de antes; lo único que cambió es
   cuántas veces se hace.
   ═══════════════════════════════════════════════════════════════════════════ */
/* Resumen de pagos por deportista — busca por dep.id Y por todos los códigos numéricos */
function esBecadoDep(dep: Deportista): boolean {
  const kCod = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  const raw  = kCod ? String(dep._columnas[kCod] ?? '').trim() : '';
  return /^b\d/i.test(raw) && !/^mb/i.test(raw);
}

function calcularResumen(dep: Deportista, allPagos: AllPagos) {
  // BECADO: sin pendientes de ningún tipo
  if (esBecadoDep(dep)) {
    return { cargados: 0, pagados: 0, pendientes: 0, proximos: 0, total: 1, mesesPendientes: [], mesesPendFull: [], becado: true };
  }

  // 1. Reunir todos los pagos guardados (dep.id + código numérico)
  const posKeys: string[] = [dep.id];
  const seen = new Set(posKeys);

  // Columna CÓDIGO explícita — nunca excluir como año (ej: código "2018" es válido)
  const kCod = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  if (kCod) {
    const digits = String(dep._columnas[kCod] ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) {
      const key = String(parseInt(digits, 10));
      if (!seen.has(key)) { seen.add(key); posKeys.push(key); }
      if (digits !== key && !seen.has(digits)) { seen.add(digits); posKeys.push(digits); }
    }
  }
  // Otras columnas — sí excluir años (2000-2099)
  for (const [k, v] of Object.entries(dep._columnas ?? {})) {
    if (k === kCod) continue;
    const digits = String(v ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) {
      const n = parseInt(digits, 10);
      if (n >= 2000 && n <= 2099 && digits.length === 4) continue;
      const key = String(n);
      if (!seen.has(key)) { seen.add(key); posKeys.push(key); }
      if (digits !== key && !seen.has(digits)) { seen.add(digits); posKeys.push(digits); }
    }
  }
  /* MISMAS REGLAS QUE EL ESTADO DE CUENTA, para que las dos pantallas digan lo
     mismo del mismo deportista:
       1) Base = lo que el libro publicó bajo el CÓDIGO.
       2) Encima = las ediciones manuales guardadas bajo el ID interno.
       3) Un PAGÓ real NO lo pisa una fila vieja en PEND/PRÓX (salvo un reverso
          intencional, que llega marcado con destino 'REVERT').
     Antes aquí mandaba el código sobre el ID, al revés que en el estado de
     cuenta: por eso una matrícula marcada a mano se veía pagada en la ficha
     del deportista y al mismo tiempo aparecía debiendo en este cuadro. */
  const mergeMap = new Map<string, any>();
  for (const key of posKeys) {
    if (key === dep.id) continue;                       // el ID va después
    for (const r of ((allPagos as any)[key] ?? [])) mergeMap.set(normDet(r.detalle), r);
  }
  for (const r of ((allPagos as any)[dep.id] ?? [])) {
    const det  = normDet(r.detalle);
    const prev = mergeMap.get(det);
    if (prev && prev.estado === 'PAGÓ' && r.estado !== 'PAGÓ' && r.destino !== 'REVERT') continue;
    mergeMap.set(det, r);
  }

  // 2. Generar todas las filas esperadas del año según mes de afiliación
  const mesAfil = getMesAfil(dep._columnas);
  const fullRows = DETALLE_ROWS
    .filter(det => { const n = MES_NUM[det]; return n === 0 || n >= mesAfil; })
    .map(det => {
      const saved = mergeMap.get(det) as any;
      if (saved?.estado === 'ELIM') return null;
      if (saved) return saved;
      return { estado: esFuturo(det) ? 'PROX' : 'PEND' };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const pagados    = fullRows.filter((r: any) => r.estado === 'PAGÓ').length;
  /* Un PROX cuyo mes ya llegó cuenta como PENDIENTE, no como próximo. */
  const pendientes = fullRows.filter((r: any) => r.estado === 'PEND'
    || (r.estado === 'PROX' && (MES_NUM[r.detalle] ?? 99) <= MES_ACTUAL)).length;
  const proximos   = fullRows.filter((r: any) => r.estado === 'PROX'
    && (MES_NUM[r.detalle] ?? 99) > MES_ACTUAL).length;
  const cargados   = pagados + pendientes + proximos;

  /* Meses pendientes solo hasta el mes en curso (no futuros).
     Se guardan con el nombre completo ("JULIO 2026") para poder armar el
     mensaje de cobro, y aparte abreviados para los chips de la tabla. */
  const mesesPendFull: string[] = DETALLE_ROWS
    .filter(det => {
      const n = MES_NUM[det];
      // incluir MATRÍCULA (n=0) y meses hasta el actual
      if (n > MES_ACTUAL) return false;
      /* Se usa el `mesAfil` de arriba. Antes se volvía a buscar la fecha de
         afiliación DENTRO de este recorrido, o sea doce veces por deportista y
         para nada: siempre daba lo mismo. — 27/08/2026 */
      if (n !== 0 && n < mesAfil) return false;
      const saved = mergeMap.get(det) as any;
      if (saved?.estado === 'ELIM') return false;
      /* Aquí estaba el error de los 204 (ver arriba): se pedía estado 'PEND'
         exacto, y un 'PROX' viejo de un mes ya llegado se colaba como si el
         deportista estuviera al día. — 06/09/2026 */
      return estaPendiente(det, saved);
    });
  const mesesPendientes: string[] = mesesPendFull.map(det => MES_ABREV[det] ?? det.slice(0, 3));

  return { cargados, pagados, pendientes, proximos, total: fullRows.length, mesesPendientes, mesesPendFull };
}

function PagosInner() {
  const router      = useRouter();
  const searchParams = useSearchParams();

  // Inicializar filtros desde URL para que router.back() los restaure
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [allPagos,    setAllPagos]    = useState<AllPagos>({});
  const [busqueda,         setBusqueda]         = useState(() => searchParams.get('q')     ?? '');
  const [filtroCodigo,     setFiltroCodigo]     = useState(() => searchParams.get('cod')   ?? '');
  const [filtroPrograma,   setFiltroPrograma]   = useState(() => searchParams.get('prog')  ?? '');
  const [filtroProyecto,   setFiltroProyecto]   = useState(() => searchParams.get('proy')  ?? '');
  // Filtro de CARTERA: mostrar solo quienes deben un mes específico (abreviatura: FEB, MAR…)
  const [filtroMes,        setFiltroMes]        = useState(() => searchParams.get('mes') ?? '');
  /* FILTRO POR BOTÓN DE COBRO: deja ver solo a los que les toca un botón
     determinado (por ejemplo, solo los de COBRAR 4 O MAS). Sirve para marcarlos
     todos de una y cobrarles en tanda. */
  const [filtroBoton,      setFiltroBoton]      = useState('');

  // Sincronizar filtros → URL (replace para no apilar historial)
  // Incluye 'mes' para que al ver una cuenta y volver, se regrese al mismo mes filtrado.
  /* POR QUÉ NO SE USA router.replace (dirección, 27/08/2026): esta pantalla es
     "force-dynamic", así que cada router.replace le pedía a Next.js rearmar la
     ruta ENTERA. Como se llamaba en cada tecla del buscador, escribir un nombre
     de diez letras disparaba diez rearmes seguidos: por eso la letra aparecía
     tarde y el cuadro se sentía trabado.

     history.replaceState escribe la misma dirección en la barra del navegador
     SIN rearmar nada. Los filtros se siguen leyendo igual al entrar y al volver
     de un estado de cuenta —que es para lo único que estaban en la dirección—,
     pero ahora escribir es instantáneo. */
  const syncURL = useCallback((q: string, cod: string, prog: string, proy: string, mes: string) => {
    const p = new URLSearchParams();
    if (q)    p.set('q',    q);
    if (cod)  p.set('cod',  cod);
    if (prog) p.set('prog', prog);
    if (proy) p.set('proy', proy);
    if (mes)  p.set('mes',  mes);
    const qs = p.toString();
    try {
      window.history.replaceState(null, '', qs ? `/pagos?${qs}` : '/pagos');
    } catch {
      router.replace(qs ? `/pagos?${qs}` : '/pagos', { scroll: false });
    }
  }, [router]);
  const [cargando,         setCargando]         = useState(true);
  const [pagosListos,      setPagosListos]      = useState(false);
  const [depEstados,       setDepEstados]       = useState<Record<string, DepEstado>>({});
  const [mostrarRetirados, setMostrarRetirados] = useState(false);
  /* COLA DE COBRO — las casillitas de la izquierda. WhatsApp no deja mandarle
     a varios de un solo golpe (solo tiene un chat abierto a la vez), así que
     lo que se hace es una FILA: usted marca varios y la plataforma lo va
     llevando de uno en uno, abriendo el chat con el mensaje ya escrito. */
  const [sel,         setSel]         = useState<Set<string>>(new Set());
  const [colaOn,      setColaOn]      = useState(false);   // ventana de la cola abierta
  const [colaIdx,     setColaIdx]     = useState(0);       // en cuál va
  const [colaAbierto, setColaAbierto] = useState(false);   // ya se abrió el chat de este
  /* Lo que el administrador dejó escrito en Gestión → Botones de Cobro.
     Arranca con los textos de fábrica para que la pantalla nunca quede muda. */
  const [cfgCobro, setCfgCobro] = useState<CobroConfig>(CONFIG_DEFAULT);
  /* CELULARES CORREGIDOS A MANO — la misma tabla que usa Cumpleaños.
     Cuando la ficha no tiene el celular del acudiente, o lo tiene malo, aquí se
     escribe el bueno y queda guardado para toda la plataforma. */
  const [telAlt,       setTelAlt]       = useState<Record<string, TelefonoWhatsApp>>({});
  const [editandoTel,  setEditandoTel]  = useState<Deportista | null>(null);
  const [borradorTel,  setBorradorTel]  = useState('');
  const [guardandoTel, setGuardandoTel] = useState(false);
  // OBSERVACIÓN por deportista (texto libre editable en la última columna)
  const [obs,          setObs]          = useState<Record<string, string>>({});
  /* Lo que se está escribiendo en OBSERVACIÓN antes de soltar la casilla.
     Se guarda solo al hacer clic afuera: no hay botón de Guardar. */
  const [obsDraft,     setObsDraft]     = useState<Record<string, string>>({});
  const [guardandoObs, setGuardandoObs] = useState<string | null>(null);
  // FECHA DE INGRESO editable (con confirmación antes de guardar)
  const [editFecha,      setEditFecha]      = useState<string | null>(null);
  const [nuevaFecha,     setNuevaFecha]     = useState('');
  const [guardandoFecha, setGuardandoFecha] = useState<string | null>(null);

  // Al cargar (o recargar) los deportistas, refrescamos las observaciones
  useEffect(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const t = leerObs(d); if (t) m[d.id] = t; });
    setObs(m);
  }, [deportistas]);

  /** Guarda un cambio en las columnas del deportista (base + pantalla). */
  async function guardarColumnas(dep: Deportista, cols: Record<string, any>): Promise<boolean> {
    const ok = await updateColumnasDeportista(dep.id, cols);
    if (ok) setDeportistas(prev => prev.map(d => (d.id === dep.id ? { ...d, _columnas: cols as any } : d)));
    return ok;
  }

  /** Cambia la FECHA DE INGRESO (afiliación). Pide confirmación mostrando el
   *  antes y el después, porque de esta fecha depende desde qué mes se cobra. */
  async function guardarFecha(dep: Deportista) {
    const nueva = deISO(nuevaFecha);
    if (!nueva) { window.alert('Escribe una fecha válida.'); return; }
    const antes = fmtFecha(getCol(dep, /fecha.*afil|afil.*fecha/i));
    if (nueva === antes) { setEditFecha(null); return; }

    const cod = codigoDe(dep);
    const aviso =
      'CAMBIAR LA FECHA DE INGRESO\n\n' +
      `${dep._nombre}${cod ? '  (código ' + cod + ')' : ''}\n\n` +
      `   Antes:    ${antes || '— sin fecha —'}\n` +
      `   Después:  ${nueva}\n\n` +
      'De esta fecha depende desde qué mes se le cobra al deportista y el color\n' +
      'que el libro le pone a sus pagos. Los meses ya cargados NO se recalculan solos.\n\n' +
      '¿Aceptar el cambio?';
    if (!window.confirm(aviso)) return;

    setEditFecha(null);
    setGuardandoFecha(dep.id);
    const cols: Record<string, any> = { ...(dep._columnas ?? {}) };
    const k = Object.keys(cols).find(x => /fecha.*afil|afil.*fecha/i.test(x)) || 'FECHA DE AFILIACIÓN';
    cols[k] = nueva;
    const ok = await guardarColumnas(dep, cols);
    if (!ok) window.alert('No se pudo guardar la fecha. Revisa la conexión e inténtalo de nuevo.');
    setGuardandoFecha(null);
  }

  /** Guarda la observación del deportista en su ficha. Si queda vacía, se borra. */
  async function guardarObs(dep: Deportista, textoCrudo: string) {
    const texto = String(textoCrudo ?? '').trim();
    if (texto === (obs[dep.id] ?? '')) return;      // no cambió: no se toca la base
    setGuardandoObs(dep.id);
    const cols: Record<string, any> = { ...(dep._columnas ?? {}) };
    const k = Object.keys(cols).find(esColObs) || COL_OBS;
    if (texto) cols[k] = texto; else delete cols[k];
    const ok = await guardarColumnas(dep, cols);
    if (ok) {
      setObs(prev => { const n = { ...prev }; if (texto) n[dep.id] = texto; else delete n[dep.id]; return n; });
    } else {
      window.alert('No se pudo guardar la observación. Revisa la conexión e inténtalo de nuevo.');
    }
    setGuardandoObs(null);
  }

  useEffect(() => {
    getDeportistas().then(lista => { setCargando(false); if (lista.length) setDeportistas(lista); });
    getCobroConfig().then(setCfgCobro).catch(() => {});
    getTelefonosWhatsApp().then(setTelAlt).catch(() => {});
    getPagos().then(p => { if (Object.keys(p).length) setAllPagos(p as any); setPagosListos(true); }).catch(() => setPagosListos(true));
    try {
      const raw = localStorage.getItem(DEP_ESTADOS_KEY);
      if (raw) setDepEstados(JSON.parse(raw));
    } catch {}
  }, []);

  // Al volver de una cuenta, regresar a la misma posición donde estaba la lista.
  useEffect(() => {
    if (cargando || !pagosListos) return;
    let y = 0;
    try { y = parseInt(sessionStorage.getItem('futuro_pagos_scroll') || '0', 10); } catch {}
    if (!y) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo(0, y);
      try { sessionStorage.removeItem('futuro_pagos_scroll'); } catch {}
    }));
  }, [cargando, pagosListos]);

  // Estado DEP es solo lectura en la tabla principal

  /* ── LA CUENTA, HECHA UNA SOLA VEZ ───────────────────────────────────────
     Se rehace únicamente cuando cambian los deportistas o los pagos. Mientras
     usted escribe en el buscador o marca casillas, esto NO se vuelve a hacer:
     se lee del mapa, que es instantáneo. */
  const resumenes = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of deportistas) m.set(d.id, calcularResumen(d, allPagos as any));
    return m;
  }, [deportistas, allPagos]);

  /** La cuenta de un deportista. Sale del mapa de arriba. */
  function resumenPago(dep: Deportista) {
    return resumenes.get(dep.id) ?? calcularResumen(dep, allPagos as any);
  }

  /* ── EL BOTÓN DE COBRO, TAMBIÉN UNA SOLA VEZ ─────────────────────────────
     Armar el botón es caro: escribe el mensaje completo del deportista y lo
     codifica para el enlace de WhatsApp. Antes eso se hacía ~600 veces por
     cada movimiento de la pantalla. Ahora se hace una vez y se guarda; solo se
     rehace si cambian los pagos, los textos que armó administración o algún
     celular corregido a mano. */
  const cobros = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of deportistas) {
      const r = resumenes.get(d.id) as any;
      m.set(d.id, r ? cobroDe(d, r.mesesPendFull, r.becado) : null);
    }
    return m;
  }, [deportistas, resumenes, cfgCobro, telAlt]);

  /** El botón que le toca a este deportista, o null si no hay nada que cobrar. */
  function cobroDeCache(dep: Deportista) {
    return cobros.has(dep.id) ? cobros.get(dep.id) : null;
  }


  const programas = useMemo(() =>
    [...new Set(deportistas.map(d => getCol(d, /^program/i)).filter(Boolean))].sort(),
    [deportistas]
  );

  const proyectos = useMemo(() => {
    const base = filtroPrograma
      ? deportistas.filter(d => getCol(d, /^program/i) === filtroPrograma)
      : deportistas;
    const sortNum = (a: string, b: string) => { const na = parseInt(a,10), nb = parseInt(b,10); return !isNaN(na)&&!isNaN(nb)?na-nb:a.localeCompare(b,'es'); };
    return [...new Set(base.map(d => getCol(d, /^proy/i)).filter(Boolean))].sort(sortNum);
  }, [deportistas, filtroPrograma]);

  const filtrados = useMemo(() => {
    return deportistas.filter(d => {
      // Retirado si su columna ESTADO dice "Retirado" (base) o si se marcó localmente.
      const retirado = depEstados[d.id] === 'RETIRADO' || /retirad/i.test(getCol(d, /^estado$/i) || '');
      if (!mostrarRetirados && retirado) return false;
      if (mostrarRetirados && !retirado) return false;
      const q    = busqueda.toLowerCase();
      const cod  = codigoDe(d).toLowerCase();
      const prog = getCol(d, /^program/i);
      const proy = getCol(d, /^proy/i);
      if (filtroPrograma && prog !== filtroPrograma) return false;
      if (filtroProyecto && proy !== filtroProyecto) return false;
      if (filtroCodigo && !cod.includes(filtroCodigo.toLowerCase())) return false;
      /* ── DEBE DESDE ─────────────────────────────────────────────────
         (dirección, 06/09/2026 — «cuando voy a mirar quién me debe mayo, me
          aparecen otra vez los de marzo y abril, y me puedo volver a
          equivocar cobrándoles nuevamente»)

         ANTES: «deben el mes de MAYO» mostraba a TODO el que tuviera mayo
         pendiente. Pero el que debe desde marzo también debe mayo — así que
         salía en marzo, en abril y en mayo. Uno cobraba por listas y a la
         misma familia le llegaban tres cobros.

         AHORA: manda el mes MÁS VIEJO que debe. El que arrastra desde marzo
         sale ÚNICAMENTE en «Debe desde MARZO». Cada deportista aparece en una
         sola lista, nunca en dos. Se puede bajar la lista completa mes por mes
         sin repetirle el cobro a nadie.

         Y aparte, «Debe matrícula», que no es un mes y se cobra distinto. */
      if (filtroMes) {
        const pend: string[] = (resumenPago(d) as any).mesesPendFull ?? [];
        if (filtroMes === '__MAT__') {
          if (!pend.some(det => (MES_NUM[det] ?? -1) === 0)) return false;
        } else {
          const meses = pend.filter(det => (MES_NUM[det] ?? 0) > 0);
          if (!meses.length) return false;
          const masViejo = meses.reduce((a2, b2) => (MES_NUM[a2] <= MES_NUM[b2] ? a2 : b2));
          if (masViejo !== filtroMes) return false;
        }
      }
      // Solo los que les toca este botón de cobro
      if (filtroBoton) {
        const c = cobroDeCache(d);
        if (!c || c.botonId !== filtroBoton) return false;
      }
      if (!q) return true;
      return d._nombre.toLowerCase().includes(q) || cod.includes(q);
    }).sort((a, b) => {
      const ca = codigoDe(a), cb = codigoDe(b);
      return ca.localeCompare(cb, 'es', { numeric: true });
    });
    /* Ojo con la lista de abajo: ya NO va `allPagos` ni `cfgCobro` sueltos,
       porque eso entra por `resumenes` y `cobros`, que sí están hechos una sola
       vez. Poner los dos era rehacer el filtro de balde. */
  }, [deportistas, resumenes, cobros, busqueda, filtroCodigo, filtroPrograma, filtroProyecto, filtroMes, filtroBoton, depEstados, mostrarRetirados]);



  const BL = '#FFFFFF';

  /** El celular que se va a usar: el corregido a mano manda sobre el de la ficha. */
  function telDe(dep: Deportista): string {
    return String(telAlt[dep.id]?.telefono ?? '').trim() || telefonoDe(dep);
  }

  function abrirEditorTel(dep: Deportista) {
    setBorradorTel(telDe(dep));
    setEditandoTel(dep);
  }
  async function guardarTel() {
    const dep = editandoTel;
    if (!dep) return;
    const limpio = borradorTel.replace(/\D/g, '');
    if (limpio.length !== 10) {
      window.alert('Ese número no parece un celular.\n\nEscríbalo con los 10 dígitos, por ejemplo: 3001234567');
      return;
    }
    setGuardandoTel(true);
    const ok = await guardarTelefonoWhatsApp(dep.id, limpio, {
      codigo: codigoDe(dep), nombre: dep._nombre, telefonoFicha: telefonoDe(dep),
    });
    setGuardandoTel(false);
    if (!ok) { window.alert('No se pudo guardar el número. Revise el internet e intente otra vez.'); return; }
    setTelAlt(prev => ({
      ...prev,
      [dep.id]: {
        deportistaId: dep.id, telefono: limpio, telefonoFicha: telefonoDe(dep),
        nota: '', actualizadoEn: new Date().toISOString(),
      },
    }));
    setEditandoTel(null);
  }
  async function quitarTel() {
    const dep = editandoTel;
    if (!dep) return;
    if (!window.confirm('¿Volver a usar el celular que está en la ficha del deportista?')) return;
    setGuardandoTel(true);
    await borrarTelefonoWhatsApp(dep.id);
    setGuardandoTel(false);
    setTelAlt(prev => { const n = { ...prev }; delete n[dep.id]; return n; });
    setEditandoTel(null);
  }

  /* ── COBRO POR WHATSAPP ────────────────────────────────────────────────
     Devuelve null cuando NO hay nada que cobrar.

     Los botones los arma el administrador en Gestión → Botones de Cobro. Cada
     uno dice cuándo aparece: solo cuando el deportista va corriendo con el mes
     en curso, solo cuando ya viene atrasado, o siempre. Aquí se calcula en cuál
     de las dos situaciones está y se devuelven TODOS los botones que apliquen,
     ya con su mensaje armado.

     Se abre WhatsApp con el mensaje YA ESCRITO. No se envía nada solo: el envío
     lo hace una persona después de leerlo. */
  function cobroDe(dep: Deportista, mesesPendFull: string[], becado?: boolean) {
    if (becado || !mesesPendFull?.length) return null;

    // La MATRÍCULA no es un mes: se menciona aparte y no multiplica la tarifa.
    const soloMeses = mesesPendFull.filter(d => (MES_NUM[d] ?? 0) > 0);
    const debeMatricula = mesesPendFull.some(d => (MES_NUM[d] ?? 0) === 0);
    /* Si solo debe la MATRÍCULA y ningún mes, TAMBIÉN hay que cobrarle:
       le sale el botón de matrícula. — 25/08/2026 */
    if (!soloMeses.length && !debeMatricula) return null;

    const nombre = dep._nombre || '';
    // La CUOTA MANUAL del deportista, si existe, manda sobre la tabla de tarifas.
    const manual = Number(getCol(dep, /^cuota_?manual$/i).replace(/[^0-9]/g, '')) || 0;
    const tarifa = manual > 0 ? manual : tarifaMensual(getCol(dep, /^program/i), getCol(dep, /^sede/i));
    const n      = soloMeses.length;
    const total  = tarifa * n;
    const meses  = listaBonita(soloMeses.map(mesBonito));

    /* ¿Va el mensaje suave? Solo si debe UN mes, ese mes es el de ahora, y no
       tiene la matrícula pendiente. Si no, el mensaje es el de atrasado. */
    const soloEsteMes = n === 1 && MES_NUM[soloMeses[0]] === MES_ACTUAL && !debeMatricula;

    /* LA CUENTA NO LA DECIDE EL BOTÓN, LA DECIDE EL PROYECTO.
       Los SEIS proyectos de SUB 13, 14 y 15 (Selección y Desarrollo) consignan
       a MAX 10; todos los demás, a Futuro Antioquia. Vale para cualquier botón
       que el administrador arme. Misma regla que el Estado de Cuenta. */
    const esMax10 = pagaAMax10(getCol(dep, /^program/i), getCol(dep, /^proy/i));
    const cuenta = esMax10 ? cfgCobro.cuentaMax10 : cfgCobro.cuentaFuturo;

    const tel = aWhatsApp(telDe(dep));

    /* UN SOLO BOTÓN. Cuál, lo decide cuántos meses debe (n). Si el
       administrador armó varios que le sirven, gana el más preciso.
       El texto lo escribe él; aquí solo se le reemplazan los comodines por los
       datos de este deportista. */
    /* La MATRÍCULA manda: si la debe, sale el 5º botón (el fucsia), deba los
       meses que deba. Si no, se escoge por cantidad de meses. */
    const boton = escogerBoton(cfgCobro.botones ?? [], n, debeMatricula);
    if (!boton) return null;   // ningún botón le aplica: la casilla va vacía

    const texto = armarMensaje(boton.mensaje, {
      nombre,
      meses,
      valorMes: pesos(tarifa),
      cuantos:  n,
      total:    pesos(total),
      debeMatricula,
      cuenta,
      app: URL_APP,
    });

    /* Se va DERECHO a WhatsApp Web (web.whatsapp.com), no por wa.me.
       wa.me es la página intermedia que pregunta "¿abrir en la aplicación o
       en WhatsApp Web?" — ese es el permiso que había que dar cada vez.
       Yendo directo a web.whatsapp.com, si ya tiene WhatsApp Web abierto,
       cae de una en el chat de esa persona con el mensaje ya escrito.
       Con teléfono abre el chat de esa persona; sin teléfono abre WhatsApp
       con el mensaje listo para que usted escoja el contacto a mano. */
    const url = tel
      ? `https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

    return {
      tel, meses, total, tarifa, n, cuenta, texto, url, debeMatricula, esMax10,
      botonId:  boton.id,
      etiqueta: boton.etiqueta,
      color:    boton.color,
      tono: soloEsteMes ? 'aldia' : 'atrasado',
    };
  }

  /* ── LA COLA ────────────────────────────────────────────────────────────
     Los que HOY tienen algo que cobrar, en el mismo orden de la tabla (o sea,
     respetando los filtros que usted tenga puestos). De ahí salen las
     casillitas: solo la tiene el que se le puede cobrar. */
  const cobrables = useMemo(() =>
    filtrados
      .map(dep => {
        const c = cobroDeCache(dep);
        return c ? { dep, cobro: c } : null;
      })
      .filter((x): x is { dep: Deportista; cobro: any } => x !== null),
    [filtrados, cobros],
  );

  const idsCobrables = useMemo(() => cobrables.map(x => x.dep.id), [cobrables]);
  const todosMarcados = idsCobrables.length > 0 && idsCobrables.every(id => sel.has(id));
  const cola = useMemo(() => cobrables.filter(x => sel.has(x.dep.id)), [cobrables, sel]);

  function toggleSel(id: string) {
    setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function marcarTodos() { setSel(todosMarcados ? new Set() : new Set(idsCobrables)); }

  function abrirCola() {
    if (!cola.length) return;
    setColaIdx(0); setColaAbierto(false); setColaOn(true);
  }
  /** Abre (o vuelve a abrir) el chat de esta persona, siempre en la MISMA pestaña. */
  function abrirWhatsApp(url: string) {
    /* SIEMPRE la misma pestaña, con el mismo nombre. Si ya está abierta, solo
       cambia de chat y se pone al frente; no se abre una nueva. */
    const w = window.open(url, 'whatsapp_max10');
    try { w?.focus(); } catch {}
    setColaAbierto(true);
  }
  /** Pasa al siguiente de la fila. Si era el último, cierra y borra las marcas. */
  function siguienteCobro() {
    if (colaIdx + 1 >= cola.length) { setColaOn(false); setSel(new Set()); setColaIdx(0); }
    else { setColaIdx(colaIdx + 1); setColaAbierto(false); }
  }

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* HEADER */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-pag" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-pag)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')} className="relative text-white hover:opacity-80 transition font-bold text-sm">
          ← Volver
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Control de Pagos</h1>
          <p className="text-white text-xs">{deportistas.length} deportistas registrados</p>
        </div>
        <div className="relative text-right leading-tight border-l border-white/30 pl-3">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/75 text-[9px] font-semibold tracking-wide">CONECTA · GESTIONA · GANA</p>
        </div>
      </header>

      {/* ── A TODO EL ANCHO DE LA PANTALLA ──────────────────────────────────
          (dirección, 06/09/2026 — «amplía a pantalla completa para que se lea
           todo y no se corte nada»)

          Estaba topado en 1.400 píxeles. Con las tres columnas nuevas
          —PROGRAMA, MENSUALIDAD y VALOR DEUDA— ya no cabía: la OBSERVACIÓN
          quedaba cortada por la derecha, y esa columna es la que dice por qué
          una familia debe. Ahora el cuadro usa todo el monitor. */}
      <main className="mx-auto px-4 py-5 space-y-4" style={{ maxWidth: '100%' }}>

        {/* TÍTULO SECCIÓN */}
        <div className="flex items-center gap-2 pt-1">
          <DollarSign className="w-5 h-5" style={{ color: VERDE }} />
          <h2 className="font-black text-white text-base">Estado de Cuenta por Deportista</h2>
        </div>

        {/* FILTROS */}
        <div className="rounded-2xl p-4 space-y-3 shadow-sm border"
             style={{ background: PANEL, borderColor: BORDE }}>
          {/* Fila 1: PROGRAMA + PROYECTO */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">Programa</label>
              <select value={filtroPrograma}
                onChange={e => { setFiltroPrograma(e.target.value); setFiltroProyecto(''); syncURL(busqueda, filtroCodigo, e.target.value, '', filtroMes); }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                style={{ background: CAMPO, borderColor: BORDE }}>
                <option value="">Todos los programas</option>
                {programas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">Proyecto</label>
              <select value={filtroProyecto} onChange={e => { setFiltroProyecto(e.target.value); syncURL(busqueda, filtroCodigo, filtroPrograma, e.target.value, filtroMes); }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                style={{ background: CAMPO, borderColor: BORDE }}>
                <option value="">Todos los proyectos</option>
                {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 2: CÓDIGO + NOMBRE */}
          <div className="flex gap-3 flex-wrap">
            <div className="w-[130px]">
              <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">Código</label>
              <input
                value={filtroCodigo}
                onChange={e => { setFiltroCodigo(e.target.value); syncURL(busqueda, e.target.value, filtroPrograma, filtroProyecto, filtroMes); }}
                placeholder="Ej: 2018"
                className="w-full rounded-xl px-3 py-2 text-sm text-white border placeholder:text-[#8C94A0] focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                style={{ background: CAMPO, borderColor: BORDE }}
              />
            </div>
            <div className="w-[160px]">
              <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">Debe desde</label>
              <select value={filtroMes} onChange={e => { setFiltroMes(e.target.value); syncURL(busqueda, filtroCodigo, filtroPrograma, filtroProyecto, e.target.value); }}
                title="El mes MÁS VIEJO que debe. Cada deportista sale en una sola lista, nunca en dos."
                className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                style={{ background: CAMPO, borderColor: BORDE }}>
                <option value="">Todos</option>
                <option value="__MAT__">Debe matrícula</option>
                {/* LOS DOCE MESES, NO SOLO HASTA EL DE HOY (dirección, 06/09/2026:
                    «solo falta el listado desplegable»). Antes la lista se
                    cortaba en el mes en curso y no aparecían octubre, noviembre
                    ni diciembre. Ahora está completa: los meses que todavía no
                    llegan simplemente no traen a nadie, y en octubre la lista ya
                    sirve sin que nadie tenga que tocar nada. */}
                {DETALLE_ROWS.filter(det => (MES_NUM[det] ?? 0) > 0).map(det => (
                  <option key={det} value={det}>Debe desde {det.replace(' 2026', '')}</option>
                ))}
              </select>
            </div>
            {/* FILTRO POR BOTÓN DE COBRO — para trabajar por tandas: escoja
                "COBRAR 4 O MAS" y quedan solo esos, listos para marcarlos todos. */}
            <div className="w-[190px]">
              <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">Tipo de cobro</label>
              <select value={filtroBoton} onChange={e => setFiltroBoton(e.target.value)}
                title="Ver solo los deportistas a los que les toca este botón de cobro"
                className="w-full rounded-xl px-3 py-2 text-sm text-white border focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                style={{ background: CAMPO, borderColor: BORDE }}>
                <option value="">Todos los cobros</option>
                {(cfgCobro.botones ?? []).map(b => (
                  <option key={b.id} value={b.id}>{b.etiqueta}</option>
                ))}
              </select>
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">Nombre</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white" />
                <input
                  value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); syncURL(e.target.value, filtroCodigo, filtroPrograma, filtroProyecto, filtroMes); }}
                  placeholder="Buscar nombre..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-sm text-white border placeholder:text-[#8C94A0] focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                  style={{ background: CAMPO, borderColor: BORDE }}
                />
              </div>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <span className="text-sm font-black" style={{ color: VERDE }}>{filtrados.length} deportistas</span>
              <button
                onClick={() => setMostrarRetirados(v => !v)}
                className="text-[10px] font-black px-2 py-1 rounded-lg border transition text-white"
                style={mostrarRetirados
                  ? { background: ROJO,  borderColor: ROJO }
                  : { background: CAMPO, borderColor: BORDE }}>
                {mostrarRetirados ? '← Activos' : 'RETIRADOS'}
              </button>
            </div>
          </div>
        </div>

        {/* BARRA DE MARCADOS — solo aparece cuando hay alguien marcado */}
        {cola.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap rounded-2xl px-4 py-3 border"
               style={{ background: PANEL, borderColor: VERDE }}>
            <span className="text-white font-black text-sm">
              {cola.length} marcado{cola.length === 1 ? '' : 's'} para cobrar
            </span>
            <button onClick={abrirCola}
              style={{ background: VERDE, minHeight: 44 }}
              className="text-white font-black text-sm px-5 rounded-xl hover:opacity-90 transition">
              COBRAR SELECCIONADOS
            </button>
            <button onClick={() => setSel(new Set())}
              style={{ minHeight: 44 }}
              className="text-white text-xs font-bold px-3 hover:opacity-70 transition">
              Quitar marcas
            </button>
            {cola.length > 30 && (
              <span className="text-[11px] font-bold" style={{ color: AMBAR }}>
                Van {cola.length}. Le sugiero tandas de 20 a 30 y descansar un rato entre una y otra,
                para que WhatsApp no le bloquee el número.
              </span>
            )}
          </div>
        )}

        {/* LISTA DE DEPORTISTAS */}
        {cargando || !pagosListos ? (
          <BalonCargando />
        ) : deportistas.length === 0 ? (
          <div className="rounded-2xl border shadow-sm p-12 text-center"
               style={{ background: PANEL, borderColor: BORDE }}>
            <User className="w-12 h-12 mx-auto mb-3" style={{ color: GRIS_VACIO }} />
            <p className="text-white font-semibold text-sm">
              No hay deportistas cargados.<br/>
              Importa el archivo en <strong>Vista General</strong> primero.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-x-auto shadow-sm border" style={{ borderColor: BORDE }}>
            <table className="w-full border-collapse text-sm" style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  {/* Casilla de arriba: marca (o desmarca) a TODOS los que deben */}
                  <th style={{
                    background: VERDE, border: '1px solid white',
                    padding: '10px 6px', textAlign: 'center', width: 44,
                  }}>
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      disabled={idsCobrables.length === 0}
                      onChange={marcarTodos}
                      title="Marcar todos los que deben"
                      style={{ width: 20, height: 20, accentColor: '#232B39', cursor: 'pointer' }}
                    />
                  </th>
                  {[
                    { h: 'ESTADO DEP',            align: 'center' },
                    { h: 'FECHA AFILIACIÓN',      align: 'center' },
                    { h: 'CÓDIGO',                align: 'center' },
                    { h: 'NOMBRE DEL DEPORTISTA', align: 'left'   },
                    /* Tres columnas nuevas — dirección, 06/09/2026:
                       de qué programa es, cuánto paga al mes, y cuánto suma
                       lo que debe. Sin esto tocaba abrir la ficha de cada uno
                       para saber si un cobro era de 80 mil o de 138 mil. */
                    { h: 'PROGRAMA',              align: 'left'   },
                    { h: 'MENSUALIDAD',           align: 'right'  },
                    { h: 'VALOR DEUDA',           align: 'right'  },
                    { h: 'MESES PENDIENTES',      align: 'left'   },
                    { h: 'COBRAR',                align: 'center' },
                    { h: 'OBSERVACIÓN',           align: 'left'   },
                  ].map(({ h, align }) => (
                    <th key={h} style={{
                      background: VERDE, color: 'white',
                      border: '1px solid white',
                      padding: '10px 8px',
                      textAlign: align as any,
                      fontSize: 10, fontWeight: 900,
                      letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((dep) => {
                  const bg  = PANEL;
                  const cod = codigoDe(dep);
                  const { pendientes, total, mesesPendientes, mesesPendFull, becado } = resumenPago(dep) as any;
                  const cobro = cobroDeCache(dep);
                  const tieneDatos = total > 0;

                  return (
                    <tr key={dep.id}
                      onClick={() => { try { sessionStorage.setItem('futuro_pagos_scroll', String(window.scrollY)); } catch {} router.push(`/alumnos/${dep.id}/estado-cuenta?edit=1`); }}
                      /* Altura fija: todas las filas quedan igual de altas, deba
                         un mes o deba ocho. Los meses ya no se van a un segundo
                         renglón porque la columna es ancha y no deja doblar. */
                      style={{ height: 44 }}
                      className="hover:brightness-125 transition-all cursor-pointer">

                      {/* CASILLA — solo la tiene quien tiene algo que cobrarle.
                          El clic aquí NO abre el estado de cuenta. */}
                      <td onClick={e => e.stopPropagation()}
                        style={{
                          background: bg, border: '1px solid white', padding: '10px 6px', textAlign: 'center',
                          /* Filo rojo al borde izquierdo: marca de un vistazo la fila que debe. */
                          boxShadow: pendientes > 0 ? `inset 5px 0 0 0 ${ROJO}` : undefined,
                        }}>
                        {cobro && (
                          <input
                            type="checkbox"
                            checked={sel.has(dep.id)}
                            onChange={() => toggleSel(dep.id)}
                            title={`Marcar a ${dep._nombre} para cobrarle`}
                            style={{ width: 20, height: 20, accentColor: VERDE, cursor: 'pointer' }}
                          />
                        )}
                      </td>

                      {/* ESTADO DEP — solo lectura */}
                      <td style={{
                        background: bg, border: '1px solid white', padding: '4px 6px', textAlign: 'center',
                      }}>
                        {(() => {
                          const est: DepEstado = /retirad/i.test(getCol(dep, /^estado$/i) || '')
                            ? 'RETIRADO' : (depEstados[dep.id] ?? 'ACTIVO');
                          const colors: Record<DepEstado, string> = {
                            ACTIVO:   VERDE,
                            PAUSO:    AMBAR,
                            RETIRADO: ROJO,
                          };
                          return (
                            <span style={{ color: colors[est], fontWeight: 900, fontSize: 10 }}>{est}</span>
                          );
                        })()}
                      </td>

                      {/* FECHA DE AFILIACIÓN */}
                      <td
                        onClick={e => e.stopPropagation()}
                        style={{
                          background: bg, color: '#FFFFFF', border: '1px solid white',
                          padding: '6px 8px', textAlign: 'center',
                          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
                        }}>
                        {editFecha === dep.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="date" autoFocus
                              value={nuevaFecha}
                              onChange={e => setNuevaFecha(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); guardarFecha(dep); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditFecha(null); }
                              }}
                              style={{ fontSize: 11, fontWeight: 700, border: `1px solid ${VERDE}`, borderRadius: 6, padding: '3px 5px', background: CAMPO, color: '#fff' }}
                            />
                            <button onClick={() => guardarFecha(dep)}
                              style={{ background: VERDE }}
                              className="hover:opacity-85 text-white text-[10px] font-black px-2 py-1 rounded-lg transition">
                              Aceptar
                            </button>
                            <button onClick={() => setEditFecha(null)} title="Cancelar"
                              className="text-white hover:opacity-70 text-[11px] font-black px-1 transition">
                              ✕
                            </button>
                          </div>
                        ) : guardandoFecha === dep.id ? (
                          <span className="text-[10px] font-black text-white">guardando…</span>
                        ) : (
                          <span
                            onClick={() => { setNuevaFecha(aISO(getCol(dep, /fecha.*afil|afil.*fecha/i))); setEditFecha(dep.id); }}
                            title="Clic para corregir la fecha de ingreso"
                            className="inline-block px-1.5 py-0.5 rounded hover:ring-1 hover:ring-[#00B050] transition">
                            {fmtFecha(getCol(dep, /fecha.*afil|afil.*fecha/i)) || '—'}
                          </span>
                        )}
                      </td>

                      {/* CÓDIGO — color por afiliación */}
                      <td style={{
                        background: colorCodigo(getCol(dep, /tipo.*afil|^afil/i)), color: 'white', border: '1px solid white',
                        padding: '8px 10px', textAlign: 'center',
                        fontWeight: 900, fontSize: 13,
                      }}>{cod || '—'}</td>

                      {/* NOMBRE — es la puerta de entrada: al oprimirlo se abre el
                          estado de cuenta del deportista (el clic lo maneja la fila). */}
                      <td style={{
                        background: bg, color: BL, border: '1px solid white',
                        padding: '8px 12px', fontWeight: 700, fontSize: 13,
                        whiteSpace: 'nowrap', cursor: 'pointer',
                      }}>
                        <span className="hover:underline" title="Abrir el estado de cuenta">{dep._nombre}</span>
                      </td>

                      {/* ── PROGRAMA · MENSUALIDAD · VALOR DEUDA ──────────────
                          (dirección, 06/09/2026)

                          La deuda se calcula así: los MESES pendientes por la
                          mensualidad de ese deportista —la de su programa y su
                          sede, o la que se le haya acordado a mano—. La
                          MATRÍCULA no se suma en pesos porque su valor cambia
                          según el programa y el semestre; cuando está
                          pendiente se avisa con «+ MAT» al lado, para que no
                          se olvide. */}
                      {(() => {
                        const prog = getCol(dep, /^program/i) || '—';
                        const mens = becado ? 0 : mensualidadDe(dep);
                        const pend: string[] = (mesesPendFull as string[]) ?? [];
                        const nMeses = pend.filter(det => (MES_NUM[det] ?? 0) > 0).length;
                        const debeMat = pend.some(det => (MES_NUM[det] ?? -1) === 0);
                        const deuda = becado ? 0 : nMeses * mens;
                        const celda = {
                          background: bg, border: '1px solid white',
                          padding: '6px 8px', fontSize: 11, whiteSpace: 'nowrap' as const,
                        };
                        return (
                          <>
                            <td style={{ ...celda, color: '#FFFFFF', fontWeight: 700, textAlign: 'left' as const, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}
                              title={prog}>{prog}</td>
                            <td style={{ ...celda, color: '#FFFFFF', fontWeight: 800, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>
                              {becado ? '—' : pesos(mens)}
                            </td>
                            {/* LA CIFRA DE LA DEUDA: BLANCA Y MÁS GRANDE
                                (dirección, 06/09/2026). Es el número que se
                                mira al cobrar; en rojo pálido y del mismo
                                tamaño que todo lo demás, se perdía. AL DÍA sí
                                se queda verde: no es una cifra, es un estado. */}
                            <td style={{ ...celda, textAlign: 'right' as const, fontWeight: 900,
                                         fontVariantNumeric: 'tabular-nums',
                                         fontSize: deuda > 0 ? 14 : 11,
                                         color: deuda > 0 ? '#FFFFFF' : '#5BE39B' }}>
                              {becado ? '—' : deuda > 0 ? pesos(deuda) : 'AL DÍA'}
                              {debeMat && (
                                <span style={{ display: 'block', fontSize: 8.5, fontWeight: 900, color: '#E0A33A' }}>
                                  + MATRÍCULA
                                </span>
                              )}
                            </td>
                          </>
                        );
                      })()}

                      {/* MESES PENDIENTES — aquí se dice TODO de una vez:
                          los meses que debe, o AL DÍA, o BECADO. */}
                      <td style={{
                        background: bg,
                        border: '1px solid white', padding: '4px 8px',
                        /* Ancha a propósito: caben los meses de todo el año en un
                           solo renglón, sin doblar y sin estirar la fila. */
                        width: 350, minWidth: 350,
                      }}>
                        {mesesPendientes.length > 0 ? (
                          <div className="flex gap-1"
                               style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                            {mesesPendientes.map((m: string) => (
                              <span key={m} style={{
                                background: ROJO, color: 'white',
                                fontSize: 9, fontWeight: 900,
                                padding: '2px 5px', borderRadius: 4,
                                whiteSpace: 'nowrap', flexShrink: 0,
                              }}>{m}</span>
                            ))}
                          </div>
                        ) : becado ? (
                          <span className="text-white text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ background: GRIS_BECA }}>BECADO</span>
                        ) : tieneDatos ? (
                          <span className="text-white text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ background: VERDE }}>AL DÍA</span>
                        ) : (
                          <span className="text-xs font-black" style={{ color: GRIS_VACIO }}>—</span>
                        )}
                      </td>

                      {/* COBRAR — un botón por cada uno de los que el administrador
                          armó en Gestión → Botones de Cobro y que aplique a esta
                          fila. Abren WhatsApp con el texto ya escrito; el envío lo
                          hace una persona. Van en fila, sin doblar, para que todas
                          las filas queden igual de altas. */}
                      <td onClick={e => e.stopPropagation()}
                        style={{ background: bg, border: '1px solid white', padding: '6px 8px', textAlign: 'left' }}>
                        {cobro ? (
                          /* El botón de cobro pegado a la izquierda y el teléfono
                             a la derecha, para que la columna quede pareja. */
                          <div className="flex items-center justify-between gap-2">
                          {/* target con nombre fijo: todos los cobros usan la MISMA
                              pestaña de WhatsApp. Así no se le llena el navegador de
                              pestañas y, si ya la tiene abierta, solo cambia de chat. */}
                          <a href={cobro.url} target="whatsapp_max10"
                            /* El clic se maneja a mano para que TODOS los cobros usen
                               la MISMA pestaña de WhatsApp. Antes iba con
                               rel="noopener", y eso hace que el navegador ignore el
                               nombre de la pestaña y abra una nueva cada vez: se le
                               llenaba el computador de ventanas de WhatsApp. */
                            onClick={e => { e.preventDefault(); window.open(cobro.url, 'whatsapp_max10'); }}
                            title={`Debe ${cobro.n} ${cobro.n === 1 ? 'mes' : 'meses'} — ${cobro.meses} · ${pesos(cobro.total)}. ` +
                              `Consigna a ${cobro.cuenta.titular}. ` +
                              (cobro.tel
                                ? `Abre WhatsApp con ${cobro.tel} y el mensaje listo. Usted revisa y le da enviar.`
                                : `Sin CELULAR DEL ACUDIENTE en la ficha: se abre WhatsApp con el mensaje listo para que escoja el contacto a mano.`)}
                            /* Ancho fijo: todos los botones de la columna quedan
                               del mismo tamaño, diga lo que diga cada uno. */
                            style={{ background: cobro.color, width: 152 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(0.85)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ''; }}
                            className="inline-flex items-center justify-center gap-1.5 text-white text-[10px] font-black px-2 py-1.5 rounded-lg whitespace-nowrap transition shadow-sm">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            {cobro.etiqueta}
                          </a>
                          {/* TELÉFONO AMARILLO — sale SOLO cuando no hay WhatsApp:
                              o no tiene número, o el que tiene no sirve. Al oprimirlo
                              se escribe el correcto, y queda guardado para toda la
                              plataforma (la misma lista que usa Cumpleaños).
                              Si el WhatsApp está bien, no sale ningún teléfono. */}
                          {!cobro.tel && (
                            <button
                              onClick={() => abrirEditorTel(dep)}
                              title="Sin WhatsApp — clic para escribir el número"
                              style={{ background: AMBAR, width: 30, height: 30, flexShrink: 0 }}
                              className="inline-flex items-center justify-center rounded-lg hover:opacity-80 transition">
                              <Phone className="w-3.5 h-3.5" style={{ color: '#232B39' }} />
                            </button>
                          )}
                          </div>
                        ) : (
                          <span className="text-xs font-black" style={{ color: GRIS_VACIO }}>—</span>
                        )}
                      </td>

                      {/* OBSERVACIÓN — texto libre editable (compromisos de pago, acuerdos…).
                          El clic NO abre el estado de cuenta: se queda aquí para escribir. */}
                      <td
                        onClick={e => e.stopPropagation()}
                        style={{ background: bg, border: '1px solid white', padding: '4px 6px', minWidth: 240, cursor: 'text' }}>
                        {/* Se escribe directo, sin botones. Al hacer clic afuera
                            (o al oprimir Tab) queda guardado. Esc devuelve lo que
                            estaba. El cuadro crece solo mientras se escribe. */}
                        <textarea
                          value={obsDraft[dep.id] ?? obs[dep.id] ?? ''}
                          onChange={e => {
                            const t = e.target as HTMLTextAreaElement;
                            setObsDraft(prev => ({ ...prev, [dep.id]: t.value }));
                            t.style.height = 'auto';
                            t.style.height = Math.min(t.scrollHeight, 150) + 'px';
                          }}
                          onBlur={e => {
                            const txt = e.target.value;
                            setObsDraft(prev => { const n = { ...prev }; delete n[dep.id]; return n; });
                            guardarObs(dep, txt);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setObsDraft(prev => { const n = { ...prev }; delete n[dep.id]; return n; });
                              (e.target as HTMLTextAreaElement).blur();
                            }
                          }}
                          rows={1}
                          placeholder="Compromiso de pago, acuerdo, razón de la mora…"
                          style={{
                            width: '100%', fontSize: 11, lineHeight: 1.35, color: '#FFFFFF',
                            border: `1px solid ${guardandoObs === dep.id ? VERDE : BORDE}`,
                            borderRadius: 6, padding: '4px 6px', minHeight: 30, maxHeight: 150,
                            resize: 'none', overflow: 'auto', background: CAMPO, outline: 'none',
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── CUADRO PARA CAMBIAR EL CELULAR DE WHATSAPP ─────────────────────
          Es la misma lista de celulares corregidos que usa Cumpleaños: lo que
          se escriba aquí sirve también allá, y al revés. NO toca la ficha del
          deportista; queda como una corrección aparte. */}
      {editandoTel && (() => {
        const dep = editandoTel;
        const deLaFicha = telefonoDe(dep);
        const corregido = telAlt[dep.id]?.telefono ?? '';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
               style={{ background: 'rgba(0,0,0,0.65)' }}
               onClick={() => !guardandoTel && setEditandoTel(null)}>
            <div className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
                 style={{ background: PANEL, borderColor: BORDE }}
                 onClick={e => e.stopPropagation()}>

              <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#232B39' }}>
                <p className="text-white font-black text-sm tracking-wide">CELULAR DE WHATSAPP</p>
                <button onClick={() => setEditandoTel(null)}
                  className="text-white font-black text-lg px-2 hover:opacity-70 transition">✕</button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="text-white font-black text-base leading-tight">{dep._nombre}</p>
                  <p className="text-white text-xs mt-0.5">Código {codigoDe(dep) || '—'}</p>
                </div>

                <div className="rounded-xl px-3 py-2" style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: GRIS_VACIO }}>
                    En la ficha del deportista
                  </p>
                  <p className="text-white text-sm font-bold">
                    {deLaFicha || <span style={{ color: AMBAR }}>No tiene celular registrado</span>}
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-white uppercase tracking-widest mb-1">
                    Celular al que se le va a escribir
                  </label>
                  <input
                    autoFocus
                    value={borradorTel}
                    onChange={e => setBorradorTel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') guardarTel(); if (e.key === 'Escape') setEditandoTel(null); }}
                    inputMode="numeric"
                    placeholder="3001234567"
                    className="w-full rounded-xl px-3 py-2 text-base text-white border placeholder:text-[#8C94A0] focus:outline-none focus:ring-2 focus:ring-[#00B050]"
                    style={{ background: CAMPO, borderColor: BORDE, minHeight: 48, letterSpacing: '0.05em' }}
                  />
                  <p className="text-[11px] mt-1" style={{ color: GRIS_VACIO }}>
                    Los 10 dígitos, sin indicativo ni espacios.
                  </p>
                </div>

                <button onClick={guardarTel} disabled={guardandoTel}
                  style={{ background: VERDE, minHeight: 48 }}
                  className="w-full text-white font-black text-sm rounded-xl hover:opacity-90 transition disabled:opacity-60">
                  {guardandoTel ? 'GUARDANDO…' : 'GUARDAR ESTE CELULAR'}
                </button>

                {corregido && (
                  <button onClick={quitarTel} disabled={guardandoTel}
                    style={{ minHeight: 40 }}
                    className="w-full text-white text-[11px] font-bold hover:opacity-70 transition">
                    volver a usar el de la ficha
                  </button>
                )}

                <p className="text-[11px] leading-relaxed" style={{ color: GRIS_VACIO }}>
                  Esto no cambia la ficha del deportista: queda como una corrección aparte, y la usan
                  tanto Control de Pagos como Cumpleaños.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── VENTANA DE LA COLA DE COBRO ─────────────────────────────────────
          Va de uno en uno. En cada persona: se abre su chat de WhatsApp con el
          mensaje ya escrito, usted le da ENVIAR allá, vuelve y oprime SIGUIENTE.
          La plataforma NUNCA envía sola: el envío siempre lo hace una persona. */}
      {colaOn && cola[colaIdx] && (() => {
        const { dep, cobro } = cola[colaIdx];
        const esUltimo = colaIdx + 1 >= cola.length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
               style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
                 style={{ background: PANEL, borderColor: BORDE }}>

              <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#232B39' }}>
                <p className="text-white font-black text-sm tracking-wide">
                  COBRO {colaIdx + 1} DE {cola.length}
                </p>
                <button onClick={() => setColaOn(false)}
                  title="Cerrar (las marcas se quedan)"
                  className="text-white font-black text-lg px-2 hover:opacity-70 transition">✕</button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <p className="text-white font-black text-lg leading-tight">{dep._nombre}</p>
                {/* PROYECTO — en ÁMBAR cuando es uno de los seis de MAX 10, para que
                    salte a la vista que ese pago va a la otra cuenta. */}
                <p className="text-sm font-black leading-tight"
                   style={{ color: cobro.esMax10 ? AMBAR : '#FFFFFF' }}>
                  {[getCol(dep, /^program/i), getCol(dep, /^proy/i)].filter(Boolean).join(' · ') || 'Sin proyecto'}
                  {cobro.esMax10 && ' — MAX 10'}
                </p>
                <p className="text-white text-xs">
                  Código {codigoDe(dep) || '—'} · Debe {cobro.n} {cobro.n === 1 ? 'mes' : 'meses'}
                  {cobro.meses ? ` (${cobro.meses})` : ''} · {pesos(cobro.total)}
                  {cobro.debeMatricula && <strong> · más la MATRÍCULA</strong>}
                </p>
                {/* La CUENTA en ÁMBAR cuando es la de MAX 10. */}
                <p className="text-xs" style={{ color: cobro.esMax10 ? AMBAR : '#FFFFFF' }}>
                  Consigna a: <strong>{cobro.cuenta.titular}</strong> · {cobro.cuenta.numero}
                </p>
                {cobro.tel
                  ? <p className="text-white text-xs">Celular del acudiente: {cobro.tel}</p>
                  : <p className="text-xs font-bold" style={{ color: AMBAR }}>
                      ⚠ Esta ficha no tiene CELULAR DEL ACUDIENTE. Se abre WhatsApp con el mensaje
                      listo para que usted escoja el contacto a mano.
                    </p>}

                {/* El botón que le corresponde a esta persona, uno solo,
                    escogido por cuántos meses debe. */}
                {!colaAbierto ? (
                  <div className="space-y-2">
                    <button onClick={() => abrirWhatsApp(cobro.url)}
                      style={{ background: cobro.color, minHeight: 48 }}
                      className="w-full text-white font-black text-sm rounded-xl hover:opacity-90 transition">
                      {cobro.etiqueta}
                    </button>
                    <p className="text-[11px]" style={{ color: GRIS_VACIO }}>
                      Se abre WhatsApp con el mensaje ya escrito.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-white text-xs leading-relaxed">
                      Ya le abrí el chat con el mensaje escrito. Déle <strong>enviar</strong> allá en
                      WhatsApp y vuelva acá.
                    </p>
                    <button onClick={siguienteCobro}
                      style={{ background: VERDE, minHeight: 48 }}
                      className="w-full text-white font-black text-sm rounded-xl hover:opacity-90 transition">
                      {esUltimo ? 'TERMINAR' : 'SIGUIENTE →'}
                    </button>
                    <button onClick={() => setColaAbierto(false)}
                      className="w-full text-white text-[11px] font-bold py-1 hover:opacity-70 transition">
                      volver a abrir el chat
                    </button>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 flex items-center justify-between border-t" style={{ borderColor: BORDE }}>
                <button onClick={siguienteCobro}
                  style={{ minHeight: 44 }}
                  className="text-white text-[11px] font-bold hover:opacity-70 transition">
                  Saltar este
                </button>
                <button onClick={() => setColaOn(false)}
                  style={{ minHeight: 44 }}
                  className="text-white text-[11px] font-black hover:opacity-70 transition">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function PagosPage() {
  return (
    <Suspense>
      <PagosInner />
    </Suspense>
  );
}
