// ─────────────────────────────────────────────────────────────────────────────
//  retiro.ts  ·  SOLICITUD DE RETIRO — la parte compartida.
//
//  Aquí vive TODO lo que necesitan los dos módulos nuevos:
//    · /retiro     → lo usa el CALIDOSO (padre) para pedir el retiro.
//    · /retirados  → lo usa ADMINISTRACIÓN para estudiar y resolver.
//
//  REGLA DE ORO (dirección, 26/08/2026): TOTAL AFILIADOS es la fuente de los
//  datos. Por eso aquí NO se guarda una copia del programa, el proyecto ni la
//  cuota: se leen de la ficha del deportista. En la solicitud solo se deja una
//  FOTO del momento (para saber de dónde salió), nunca el dato que manda.
//
//  Cómo funciona el flujo, en palabras:
//    1. El padre entra con código y documento (ya existía) y oprime
//       SOLICITUD DE RETIRO.
//    2. Escribe el motivo y acepta.
//    3. El deportista NO queda retirado. Queda en estado "SOLICITA RETIRO":
//       el caso ENTRA EN ESTUDIO hasta coordinar los pagos pendientes.
//    4. Si no debe nada, ve el botón de PAZ Y SALVO.
//    5. Administración, en Total Retirados, aprueba (→ RETIRADO) o devuelve
//       al deportista a la actividad normal.
// ─────────────────────────────────────────────────────────────────────────────
import type { Deportista, FilaPago } from './db';

/* ── Conexión ────────────────────────────────────────────────────────────── */
const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

export const TABLA = 'solicitudes_retiro';

/* ── El WhatsApp de la línea de pagos ────────────────────────────────────── */
export const WA_PAGOS       = '573045401497';
export const WA_PAGOS_BONITO = '304 540 14 97';

/* ── La línea de atención ────────────────────────────────────────────────
   Es la que se le deja al que YA se retiró y recibió su Paz y Salvo: desde
   ese momento no puede volver a entrar a la plataforma, así que este número
   es su único camino. Hoy es el mismo de la institución; si la dirección
   abre una línea aparte, se cambia AQUÍ y en ningún otro lado. */
export const TEL_ATENCION = '304 540 14 97';

/** Abre WhatsApp con el mensaje ya escrito. */
export function linkWhatsAppPagos(codigo: string, nombre: string): string {
  const texto =
    `Hola, soy acudiente de ${nombre} (código ${codigo}). ` +
    `Radiqué la SOLICITUD DE RETIRO en la plataforma y necesito coordinar el ` +
    `estado de pagos para poder continuar con el trámite.`;
  return `https://wa.me/${WA_PAGOS}?text=${encodeURIComponent(texto)}`;
}

/* ── Los tres estados del deportista que nos importan ────────────────────── */
export const EST_SOLICITA = 'SOLICITA RETIRO';
export const EST_RETIRADO = 'RETIRADO';

/** ¿El deportista PIDIÓ el retiro y el caso está en estudio?
 *  OJO: se revisa ANTES que "retirado", porque el texto contiene la palabra. */
export function pidioRetiro(estado: any): boolean {
  return /solicit/i.test(String(estado ?? ''));
}

/** ¿El deportista YA está retirado de verdad?
 *  Se excluye "SOLICITA RETIRO": pedirlo no es estarlo. */
export function yaRetirado(estado: any): boolean {
  const v = String(estado ?? '');
  return /retir/i.test(v) && !pidioRetiro(v);
}

/* ── Leer una columna de la ficha por su nombre aproximado ───────────────── */
export function colDe(dep: Deportista | null | undefined, rx: RegExp): string {
  if (!dep) return '';
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(k => rx.test(k.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}

export const RX_CODIGO   = /^c[oó]d/i;
export const RX_ESTADO   = /^estado$/i;
export const RX_PROGRAMA = /^program|^categ/i;
export const RX_PROYECTO = /^proy/i;
export const RX_SEDE     = /^sede/i;
export const RX_FECHAAF  = /fecha.*afil|afil.*fecha/i;

/* ═══════════════════════════════════════════════════════════════════════════
   ESTADO DE PAGO — ¿está a paz y salvo o debe algo?

   Es EXACTAMENTE la misma cuenta que muestra el Estado de Cuenta del
   deportista, para que las dos pantallas nunca se contradigan:
     · Un BECADO (código B…, pero no MB…) no paga nada → siempre a paz y salvo.
     · Los meses ANTERIORES a la afiliación no se cobran (solo si se afilió
       en 2026; si viene de 2025 o antes, se cuentan todos).
     · Un mes ELIM (eliminado por administración) no cuenta.
     · Cuenta como deuda lo que quede en PEND.
   ═══════════════════════════════════════════════════════════════════════════ */

const MESES_ORDEN = [
  'MATRÍCULA', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/** Número de mes de una fila del estado de cuenta. MATRÍCULA = 0 (siempre cuenta). */
function mesDeFila(detalle: string): number {
  const d = String(detalle ?? '').toUpperCase();
  if (d.includes('MATR')) return 0;
  for (let i = 1; i < MESES_ORDEN.length; i++) {
    if (d.includes(MESES_ORDEN[i])) return i;
  }
  return -1;   // no es un mes reconocible → no se cuenta
}

/** Código tal cual está escrito en la ficha. */
export function codigoRaw(dep: Deportista | null | undefined): string {
  return colDe(dep, RX_CODIGO);
}

/* ── DOCUMENTO DE IDENTIDAD del deportista ────────────────────────────────
   Es el mismo dato con el que el padre entra a la plataforma, así que se
   busca igual que en el ingreso de calidosos: se descarta "TIPO DE
   DOCUMENTO" (que dice RC/TI/CC, no el número) y todo lo del ACUDIENTE, que
   es el documento de otra persona. — 26/08/2026 */
const RX_DOC = /num.*doc|^doc|doc|c[eé]dul|c\.c|identif|nit|no.*doc|cc\b/i;

export function documentoDe(dep: Deportista | null | undefined): string {
  const cols = dep?._columnas ?? {};
  const k = Object.keys(cols).find(k => {
    const kn = k.trim();
    if (/tipo/i.test(kn) || /acud/i.test(kn)) return false;
    return RX_DOC.test(kn) && String(cols[k] ?? '').trim() !== '';
  });
  return k ? String(cols[k] ?? '').trim() : '';
}

/** 1.028.456 — se le ponen los puntos solo si son puros números. */
export function documentoBonito(v: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const soloDigitos = s.replace(/[.\s-]/g, '');
  if (/^\d{6,}$/.test(soloDigitos)) {
    return Number(soloDigitos).toLocaleString('es-CO').replace(/,/g, '.');
  }
  return s;
}

/** BECADO: el código empieza por "B" y un número, pero NO por "MB". No paga. */
export function esBecado(cod: string): boolean {
  const c = String(cod ?? '').trim();
  return /^b\s*\d/i.test(c) && !/^mb/i.test(c);
}

/** Fecha en DD/MM/AAAA venga como venga (serial de Excel, ISO o ya formateada). */
export function fechaBonita(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

/** Desde qué mes se le cobra. Si se afilió en 2026, desde ese mes; si viene
 *  de 2025 o antes, desde el primero. Igual que el Estado de Cuenta. */
export function mesDesdeQueSeCobra(dep: Deportista | null | undefined): number {
  const f = fechaBonita(colDe(dep, RX_FECHAAF));
  const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 1;
  const mes  = parseInt(m[1], 10);
  const anio = parseInt(m[2], 10);
  if (anio < 2026) return 1;
  return mes;
}

export type EstadoDePago = {
  becado:        boolean;
  pendientes:    number;    // cuántos meses debe
  valor:         number;    // cuánto suma lo que debe, en pesos
  meses:         string[];  // los nombres de los meses que debe
  alDia:         boolean;   // true = no debe nada → puede sacar paz y salvo
  sinInformacion:boolean;   // no se pudo leer el estado de cuenta
};

/* ── Las 12 filas del estado de cuenta, igual que en la pantalla del padre ── */
const FILAS_ANIO = [
  'MATRÍCULA 2026',
  'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026', 'MAYO 2026', 'JUNIO 2026',
  'JULIO 2026', 'AGOSTO 2026', 'SEPTIEMBRE 2026', 'OCTUBRE 2026',
  'NOVIEMBRE 2026', 'DICIEMBRE 2026',
];

/* Nombres viejos (sin el año) → nombres nuevos. */
const MIGRAR: Record<string, string> = {
  'MATRÍCULA': 'MATRÍCULA 2026',
  'FEBRERO': 'FEBRERO 2026', 'MARZO': 'MARZO 2026', 'ABRIL': 'ABRIL 2026',
  'MAYO': 'MAYO 2026', 'JUNIO': 'JUNIO 2026', 'JULIO': 'JULIO 2026',
  'AGOSTO': 'AGOSTO 2026', 'SEPTIEMBRE': 'SEPTIEMBRE 2026',
  'OCTUBRE': 'OCTUBRE 2026', 'NOVIEMBRE': 'NOVIEMBRE 2026', 'DICIEMBRE': 'DICIEMBRE 2026',
};

/** Un mes que todavía no llega no se debe: está PRÓXIMO, no pendiente. */
function esFuturo(detalle: string): boolean {
  const m = mesDeFila(detalle);
  if (m <= 0) return false;
  return m > new Date().getMonth() + 1;
}

/** TODOS los códigos numéricos con que puede estar guardado este deportista.
 *  El Libro Contable guarda bajo el código ("8095"); las ediciones a mano, bajo
 *  el id interno. Hay que mirar en los dos lados o se cuenta mal. */
export function todosLosCodigos(dep: Deportista): string[] {
  const cols = dep._columnas ?? {};
  const out: string[] = [];
  const visto = new Set<string>();

  const add = (digitos: string, esColumnaCodigo = false) => {
    if (!digitos) return;
    const n = parseInt(digitos, 10);
    if (isNaN(n)) return;
    // Un 2026 suelto en otra columna es un AÑO, no un código.
    if (!esColumnaCodigo && n >= 2000 && n <= 2099 && digitos.length === 4) return;
    const k = String(n);
    if (!visto.has(k)) { visto.add(k); out.push(k); }
    if (digitos !== k && !visto.has(digitos)) { visto.add(digitos); out.push(digitos); }
  };

  const sinTilde = (s: string) =>
    String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  const kCod = Object.keys(cols).find(k => /^COD/.test(sinTilde(k)));
  if (kCod) {
    const d = String(cols[kCod] ?? '').replace(/\D/g, '');
    if (d.length >= 4 && d.length <= 5) add(d, true);
  }
  for (const [k, v] of Object.entries(cols)) {
    if (k === kCod) continue;
    const d = String(v ?? '').replace(/\D/g, '');
    if (d.length >= 4 && d.length <= 5) add(d, false);
  }
  return out;
}

/** La cuenta completa: ¿debe algo este deportista?
 *
 *  Es la MISMA construcción del Estado de Cuenta, paso por paso:
 *    1. Se juntan las filas guardadas bajo el código (import del Libro) con las
 *       guardadas bajo el id interno (ediciones a mano); un PAGÓ real nunca lo
 *       pisa una fila pendiente vieja.
 *    2. Se arman SIEMPRE las 12 filas del año. Un mes sin dato NO es un mes
 *       pagado: es PENDIENTE (o PRÓXIMO si todavía no llega).
 *    3. Se descartan los meses anteriores a la afiliación.
 *  Sin el paso 2 un deportista sin filas cargadas saldría "a paz y salvo",
 *  que es justo el error que no podemos cometer al firmar un paz y salvo.
 */
export function estadoDePago(
  dep: Deportista | null | undefined,
  todos: Record<string, FilaPago[]> | undefined | null,
): EstadoDePago {
  const vacio = { becado: false, pendientes: 0, valor: 0, meses: [] as string[] };

  if (!dep) return { ...vacio, alDia: false, sinInformacion: true };

  if (esBecado(codigoRaw(dep))) {
    return { becado: true, pendientes: 0, valor: 0, meses: [], alDia: true, sinInformacion: false };
  }
  if (!todos) return { ...vacio, alDia: false, sinInformacion: true };

  /* ── 1. Juntar lo del código con lo del id interno ── */
  const mapa = new Map<string, FilaPago>();
  const norm = (f: FilaPago): FilaPago => ({ ...f, detalle: MIGRAR[f.detalle] ?? f.detalle });

  for (const cod of todosLosCodigos(dep)) {
    for (const f of (todos[cod] ?? [])) { const r = norm(f); mapa.set(r.detalle, r); }
  }
  for (const f of (todos[dep.id] ?? [])) {
    const r = norm(f);
    const antes = mapa.get(r.detalle);
    // Un PAGÓ real solo se revierte a propósito (destino REVERT).
    if (antes && antes.estado === 'PAGÓ' && r.estado !== 'PAGÓ' && r.destino !== 'REVERT') continue;
    mapa.set(r.detalle, r);
  }

  /* ── 2. Las 12 filas, siempre ── */
  const desde = mesDesdeQueSeCobra(dep);
  const debe: FilaPago[] = [];

  for (const detalle of FILAS_ANIO) {
    const m = mesDeFila(detalle);
    if (m > 0 && m < desde) continue;          // antes de afiliarse: no se cobra
    const fila = mapa.get(detalle);

    if (!fila) {
      // Sin dato: pendiente, salvo que el mes todavía no haya llegado.
      if (!esFuturo(detalle)) debe.push({ detalle, estado: 'PEND', vPagado: '', vCargado: '', destino: '', fecha: '' });
      continue;
    }
    const est = String(fila.estado ?? '').toUpperCase();
    if (est === 'ELIM' || est === 'NOPAGA') continue;   // administración lo quitó
    if (est === 'PEND' && !esFuturo(detalle)) debe.push(fila);
  }

  const valor = debe.reduce((s, f) => {
    const n = parseInt(String(f.vCargado ?? '').replace(/\D/g, ''), 10);
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  return {
    becado: false,
    pendientes: debe.length,
    valor,
    meses: debe.map(f => String(f.detalle ?? '')),
    alDia: debe.length === 0,
    sinInformacion: false,
  };
}

/** $138.000 */
export function enPesos(n: number): string {
  if (!n) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
}

/* ═══════════════════════════════════════════════════════════════════════════
   LA TABLA DE SOLICITUDES
   ═══════════════════════════════════════════════════════════════════════════ */

export type EstadoSolicitud = 'EN ESTUDIO' | 'APROBADA' | 'DEVUELTA';

/* ── CLASIFICACIÓN DEL MOTIVO (dirección, 26/08/2026) ─────────────────────
   El padre escribe el motivo con sus palabras. Administración, al resolver,
   lo mete en una de estas casillas. Sirve para que después se pueda contar:
   "¿de qué se nos está yendo la gente?" — cosa que con texto libre no se
   puede sacar. */
export const MOTIVOS_RETIRO = [
  'DESMOTIVACIÓN',
  'HORARIOS',
  'FAMILIAR',
  'SALUD',
  'CAMBIO RESIDENCIA',
  'DESCONTENTO DEL PADRE',
  'OTRO',
] as const;

export type MotivoTipo = typeof MOTIVOS_RETIRO[number];

export type Solicitud = {
  id:             string;
  deportista_id:  string;
  codigo:         string;
  nombre:         string;
  programa:       string;
  proyecto:       string;
  sede:           string;
  motivo:         string;   // lo que escribió el padre, con sus palabras
  motivo_tipo?:   string | null;   // la casilla que le puso administración
  estado:         EstadoSolicitud;
  meses_pendientes: number;
  valor_pendiente:  number;
  creada_en:      string;
  resuelta_en:    string | null;
  resuelta_por:   string | null;
  nota_admin:     string | null;
  /* PAZ Y SALVO — el padre NO lo puede bajar hasta que administración lo
     autorice aquí. Estar al día no basta: la firma es de la representante
     legal, y esa decisión es de la casa. — 26/08/2026 */
  paz_salvo?:     boolean | null;
  paz_salvo_en?:  string | null;
  paz_salvo_por?: string | null;
};

function nuevoId(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  } catch { /* sigue abajo */ }
  return 'sr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Radica la solicitud. Si algo falla, LANZA el error — nunca se queda callado
 *  diciendo que todo salió bien (ese fue el problema de los informes). */
export async function crearSolicitud(datos: {
  deportistaId: string;
  codigo: string;
  nombre: string;
  programa: string;
  proyecto: string;
  sede: string;
  motivo: string;
  pago: EstadoDePago;
}): Promise<Solicitud> {
  const fila = {
    id:               nuevoId(),
    deportista_id:    datos.deportistaId,
    codigo:           datos.codigo,
    nombre:           datos.nombre,
    programa:         datos.programa,
    proyecto:         datos.proyecto,
    sede:             datos.sede,
    motivo:           datos.motivo.trim(),
    estado:           'EN ESTUDIO' as EstadoSolicitud,
    meses_pendientes: datos.pago.pendientes,
    valor_pendiente:  datos.pago.valor,
    creada_en:        new Date().toISOString(),
    resuelta_en:      null,
    resuelta_por:     null,
    nota_admin:       null,
  };

  const res = await fetch(`${SB_URL}/rest/v1/${TABLA}`, {
    method: 'POST',
    headers: { ...HDR, Prefer: 'return=representation' },
    body: JSON.stringify(fila),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      txt.includes('does not exist') || res.status === 404
        ? 'Todavía no existe la tabla de solicitudes de retiro. Corre PASO-CREAR-TABLA-RETIROS.bat.'
        : `No se pudo radicar la solicitud (${res.status}). ${txt.slice(0, 160)}`,
    );
  }
  return fila as Solicitud;
}

/** Todas las solicitudes, la más nueva primero. */
export async function getSolicitudes(): Promise<Solicitud[]> {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLA}?select=*&order=creada_en.desc&limit=2000`,
    { headers: HDR, cache: 'no-store' },
  );
  if (!res.ok) {
    if (res.status === 404) return [];   // la tabla aún no existe → lista vacía
    throw new Error(`No se pudo leer las solicitudes de retiro (${res.status}).`);
  }
  const filas = await res.json();
  return Array.isArray(filas) ? filas : [];
}

/** La ÚLTIMA solicitud de un deportista, esté como esté.
 *
 *  ERROR CORREGIDO (26/08/2026): antes esto solo traía las que estaban
 *  EN ESTUDIO. Resultado: apenas administración APROBABA el retiro, el padre
 *  volvía a entrar y le salía otra vez el formulario en blanco, como si nunca
 *  hubiera pedido nada — y su Paz y Salvo, aunque estuviera autorizado, no
 *  aparecía por ningún lado. La pantalla necesita ver la solicitud completa,
 *  no solo las abiertas, para poder decirle en qué va su trámite. */
export async function getUltimaSolicitud(deportistaId: string): Promise<Solicitud | null> {
  if (!deportistaId) return null;
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLA}?select=*&deportista_id=eq.${encodeURIComponent(deportistaId)}` +
    `&order=creada_en.desc&limit=1`,
    { headers: HDR, cache: 'no-store' },
  );
  if (!res.ok) return null;
  const filas = await res.json();
  return Array.isArray(filas) && filas.length ? filas[0] : null;
}

/** La solicitud EN ESTUDIO, si tiene una abierta. (Se conserva por si algo
 *  más la necesita; la pantalla del padre usa getUltimaSolicitud.) */
export async function getSolicitudAbierta(deportistaId: string): Promise<Solicitud | null> {
  const u = await getUltimaSolicitud(deportistaId);
  return u && u.estado === 'EN ESTUDIO' ? u : null;
}

/** Administración AUTORIZA (o quita) el Paz y Salvo de esta solicitud.
 *  Mientras no esté autorizado, el padre ve el botón apagado y un aviso de que
 *  está en revisión. */
export async function autorizarPazYSalvo(
  id: string,
  autorizado: boolean,
  quien: string,
): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: HDR,
    body: JSON.stringify({
      paz_salvo:     autorizado,
      paz_salvo_en:  autorizado ? new Date().toISOString() : null,
      paz_salvo_por: autorizado ? (quien || 'administración') : null,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      /paz_salvo/.test(txt)
        ? 'A la tabla le faltan las columnas del Paz y Salvo. Corre otra vez PASO-CREAR-TABLA-RETIROS.bat.'
        : `No se pudo guardar la autorización (${res.status}). ${txt.slice(0, 160)}`,
    );
  }
}

/** Cuántas solicitudes hay SIN RESOLVER, para el número rojo del tablero.
 *
 *  OJO — se cuentan las FILAS de la tabla, no los deportistas marcados
 *  "SOLICITA RETIRO" en su ficha (26/08/2026). Ese fue el error del primer
 *  contador: al eliminar o resolver una solicitud, la marca de la ficha se
 *  quedaba vieja y el número seguía prendido sin haber nada que atender.
 *  Aquí, apenas se resuelve o se borra, el número baja solo.
 *
 *  No se traen las filas: se le pide a la base únicamente el TOTAL
 *  (Range 0-0 + count=exact), así el tablero no se pone lento.
 *  Si algo falla devuelve 0 — mejor sin número que con uno inventado. */
export async function contarSolicitudesEnEstudio(): Promise<number> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLA}?select=id&estado=eq.EN%20ESTUDIO`,
      { headers: { ...HDR, Prefer: 'count=exact', Range: '0-0' }, cache: 'no-store' },
    );
    if (!res.ok) return 0;
    const rango = res.headers.get('content-range') || '';   // ej. "0-0/3"
    const n = Number(rango.split('/')[1]);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** ¿A este deportista ya se le entregó el Paz y Salvo?
 *
 *  Lo usa el INGRESO: al que ya se retiró y recibió su constancia no se le
 *  deja volver a entrar a la plataforma; se le da la línea de atención.
 *
 *  Si la consulta falla por lo que sea (la tabla todavía no existe, se cayó
 *  la red), devuelve FALSE a propósito: es preferible dejar entrar a una
 *  familia de más que dejar por fuera a todas por un tropiezo de la base. */
export async function tienePazYSalvo(deportistaId: string): Promise<boolean> {
  if (!deportistaId) return false;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLA}?select=id&deportista_id=eq.${encodeURIComponent(deportistaId)}` +
      `&paz_salvo=is.true&limit=1`,
      { headers: HDR, cache: 'no-store' },
    );
    if (!res.ok) return false;
    const filas = await res.json();
    return Array.isArray(filas) && filas.length > 0;
  } catch {
    return false;
  }
}

/** Administración clasifica el motivo en una de las casillas de MOTIVOS_RETIRO.
 *  Se guarda apenas se escoge, sin tener que oprimir nada más. */
export async function clasificarMotivo(id: string, tipo: string): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: HDR,
    body: JSON.stringify({ motivo_tipo: tipo || null }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      /motivo_tipo/.test(txt)
        ? 'La clasificación NO se guardó: a la tabla todavía le falta esa casilla. ' +
          'Corre PASO-CREAR-TABLA-RETIROS.bat y acuérdate de oprimir CTRL+ENTER en la ' +
          'pantalla de Chrome; deben salir cuatro filas que digan LISTO. Después vuelve aquí y oprime F5.'
        : `No se pudo guardar la clasificación (${res.status}). ${txt.slice(0, 160)}`,
    );
  }
}

/** Borra una solicitud. Se usa para quitar las pruebas o una radicada por error.
 *  NO toca el estado del deportista: eso se arregla en Total Afiliados. */
export async function eliminarSolicitud(id: string): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: HDR,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`No se pudo eliminar la solicitud (${res.status}). ${txt.slice(0, 160)}`);
  }
}

/** Administración resuelve: APROBADA (se retira) o DEVUELTA (sigue activo). */
export async function resolverSolicitud(
  id: string,
  estado: 'APROBADA' | 'DEVUELTA',
  quien: string,
  nota?: string,
): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: HDR,
    body: JSON.stringify({
      estado,
      resuelta_en:  new Date().toISOString(),
      resuelta_por: quien || 'administración',
      nota_admin:   nota ?? null,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`No se pudo guardar la decisión (${res.status}). ${txt.slice(0, 160)}`);
  }
}
