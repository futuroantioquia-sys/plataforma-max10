// ─────────────────────────────────────────────────────────────────────────────
//  torneos.ts  ·  EL CUADRO DE TORNEOS Y COMPETENCIAS
//
//  Este cuadro es INDEPENDIENTE de las fichas de Total Afiliados. No sale de
//  ninguna columna del Excel de afiliaciones: es la relación que lleva la
//  dirección de los equipos que la academia inscribe en cada torneo.
//
//  Cada renglón es un EQUIPO INSCRITO:
//      # TOR · TORNEO · PROGRAMA · CATEGORÍA · NOMBRE · FORMADOR · VALOR
//
//  Se puede escribir encima de cualquier casilla, agregar torneos nuevos,
//  duplicar un renglón (que es lo más común: el mismo torneo cambiando la
//  categoría) y borrar los que ya no van.
//
//  Vive en la tabla public.torneos_cuadro de Supabase. Si la tabla todavía no
//  existe, la pantalla lo dice con todas las letras y manda a correr
//  PASO-CREAR-TABLA-TORNEOS.bat.
// ─────────────────────────────────────────────────────────────────────────────

/* ── Conexión (la misma de todo el proyecto) ─────────────────────────────── */
const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

export const TABLA_TORNEOS = 'torneos_cuadro';

/* ── Un renglón del cuadro ───────────────────────────────────────────────── */
export type FilaTorneo = {
  id: string;
  orden: number;       // manda el orden en pantalla; el # TOR se cuenta solo
  torneo: string;
  programa: string;
  categoria: string;
  nombre: string;
  formador: string;
  valor: number;       // lo que cuesta ese torneo, en pesos
};

export const FILA_VACIA: Omit<FilaTorneo, 'id' | 'orden'> = {
  torneo: '', programa: '', categoria: '', nombre: '', formador: '', valor: 0,
};

/** Deja solo los números de lo que se escriba: "$ 250.000" → 250000 */
export function soloPlata(v: any): number {
  const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 250000 → "$ 250.000". El cero se muestra vacío, para no ensuciar el cuadro. */
export function enPesos(n: number): string {
  if (!n) return '';
  return `$ ${Math.round(n).toLocaleString('es-CO')}`;
}

/** Un identificador nuevo. `randomUUID` no está en navegadores viejos. */
export function nuevoId(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* sigue al plan B */ }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ── Listas para los desplegables ────────────────────────────────────────── */
/* PRE-PROGRESIÓN SE QUITÓ (dirección, 02/09/2026). No es un programa de la
   academia: quedó de una etapa anterior y solo servía para escoger mal. Al
   revisar antes de quitarlo: NINGÚN torneo la tenía puesta, y del lado de las
   fichas quedaba una sola deportista —Karen Pérez, código 23541— que además
   está RETIRADA. Así que no se le quita el programa a nadie que esté
   entrenando.
   Si alguna ficha vieja todavía la trae escrita, se sigue viendo: las listas
   de Total Afiliados también se arman con lo que digan las fichas. */
export const PROGRAMAS = [
  'ESTIMULACIÓN', 'FORMACIÓN', 'PROGRESIÓN', 'SELECCIÓN', 'DESARROLLO',
];

export const CATEGORIAS = Array.from({ length: 15 }, (_, i) => `SUB ${i + 4}`); // SUB 4 … SUB 18

/** Orden oficial de los programas (para ordenar el cuadro cuando se pida). */
export function rankPrograma(p: string): number {
  const k = sinTildes(p).toUpperCase();
  const i = PROGRAMAS.findIndex(o => sinTildes(o).toUpperCase() === k);
  return i >= 0 ? i : PROGRAMAS.length;
}

/** SUB 6 va antes que SUB 15: se ordena por el número, no por la letra. */
export function rankCategoria(c: string): number {
  const m = String(c ?? '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

export const sinTildes = (v: any) =>
  String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const limpiar = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();

/* ── Lectura ─────────────────────────────────────────────────────────────── */

/** Todo el cuadro, en el orden que quedó guardado.
 *  Si la tabla todavía no existe devuelve `null` (que NO es lo mismo que un
 *  cuadro vacío: uno manda a crear la tabla y el otro a cargar los datos). */
export async function getCuadro(): Promise<FilaTorneo[] | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLA_TORNEOS}?select=*&order=orden.asc&limit=3000`,
    { headers: HDR, cache: 'no-store' },
  );
  if (res.status === 404) return null;         // falta la tabla
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (/does not exist/i.test(txt)) return null;
    throw new Error(`No se pudo leer el cuadro de torneos (${res.status}).`);
  }
  const filas = await res.json();
  if (!Array.isArray(filas)) return [];
  return filas.map((f: any, i: number): FilaTorneo => ({
    id:        String(f?.id ?? nuevoId()),
    orden:     Number.isFinite(Number(f?.orden)) ? Number(f.orden) : i + 1,
    torneo:    String(f?.torneo ?? ''),
    programa:  String(f?.programa ?? ''),
    categoria: String(f?.categoria ?? ''),
    nombre:    String(f?.nombre ?? ''),
    formador:  String(f?.formador ?? ''),
    valor:     Number.isFinite(Number(f?.valor)) ? Number(f.valor) : 0,
  }));
}

/* ── Escritura ───────────────────────────────────────────────────────────── */

const FALTA_TABLA =
  'Todavía no existe la tabla del cuadro de torneos. Corre ARREGLAR-LA-BASE.bat.';

/* ── LA RED DE SEGURIDAD DEL CUADRO ─────────────────────────────────────────
   POR QUÉ EXISTE (27/08/2026): a la base le faltaba la casilla `valor`, y por
   eso NO se podía guardar NADA del cuadro — ni un torneo nuevo, ni un cambio
   de formador. Una casilla que faltaba bloqueaba el módulo entero, y el
   trabajo hecho en pantalla se quedaba sin ningún respaldo: al recargar, se
   perdía.

   Ahora, pase lo que pase, lo escrito queda guardado en este computador antes
   de intentar mandarlo a la base. Si la base rechaza, se puede reintentar sin
   haber perdido nada. */
const LLAVE_LOCAL = 'torneos-cuadro-respaldo';

export function guardarRespaldoLocal(filas: FilaTorneo[]): void {
  try { localStorage.setItem(LLAVE_LOCAL, JSON.stringify(filas)); } catch { /* nada */ }
}

export function leerRespaldoLocal(): FilaTorneo[] | null {
  try {
    const t = localStorage.getItem(LLAVE_LOCAL);
    const v = t ? JSON.parse(t) : null;
    return Array.isArray(v) && v.length ? v as FilaTorneo[] : null;
  } catch { return null; }
}

/** ¿De qué casilla se está quejando la base? "…the 'valor' column…" → valor */
function casillaQueFalta(txt: string): string | null {
  const m = txt.match(/Could not find the '([^']+)' column/i);
  return m ? m[1] : null;
}

/** Guarda (crea o actualiza) uno o varios renglones de una sola vez. */
export async function guardarFilas(filas: FilaTorneo[]): Promise<void> {
  if (!filas.length) return;

  // 1. Primero el respaldo local. Aunque la base falle, el trabajo no se pierde.
  guardarRespaldoLocal(filas);

  const armar = (sinCasilla?: string) => filas.map(f => {
    const fila: Record<string, any> = {
      id:        f.id,
      orden:     f.orden,
      torneo:    limpiar(f.torneo),
      programa:  limpiar(f.programa),
      categoria: limpiar(f.categoria),
      nombre:    limpiar(f.nombre),
      formador:  limpiar(f.formador),
      valor:     Math.max(0, Math.round(Number(f.valor) || 0)),
    };
    if (sinCasilla) delete fila[sinCasilla];
    return fila;
  });

  const mandar = (cuerpo: any[]) => fetch(`${SB_URL}/rest/v1/${TABLA_TORNEOS}`, {
    method: 'POST',
    headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(cuerpo),
  });

  let res = await mandar(armar());
  if (res.ok) return;

  let txt = await res.text().catch(() => '');

  /* 2. SI A LA BASE LE FALTA UNA CASILLA, SE GUARDA SIN ELLA.
        Que falte el precio no puede impedir guardar el torneo: es mejor
        perder un dato que perder el trabajo entero. Se avisa cuál se quedó
        por fuera para que se pueda arreglar la base y volver a ponerlo. */
  const falta = casillaQueFalta(txt);
  if (falta) {
    const res2 = await mandar(armar(falta));
    if (res2.ok) {
      throw new Error(
        `Se guardaron los torneos, PERO sin la casilla "${falta}": la base todavía no la tiene. ` +
        'Corre ARREGLAR-LA-BASE.bat y vuelve a guardar para que quede también ese dato.',
      );
    }
    txt = await res2.text().catch(() => txt);
    res = res2;
  }

  throw new Error(
    res.status === 404 || /does not exist/i.test(txt)
      ? FALTA_TABLA
      : `No se pudo guardar (${res.status}). ${txt.slice(0, 160)} ` +
        'Tranquilo: lo escrito quedó guardado en este computador y se puede reintentar.',
  );
}

/** Borra un renglón. */
export async function borrarFila(id: string): Promise<void> {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLA_TORNEOS}?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: HDR },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      res.status === 404 || /does not exist/i.test(txt)
        ? FALTA_TABLA
        : `No se pudo borrar (${res.status}). ${txt.slice(0, 160)}`,
    );
  }
}

/* ── EL CUADRO QUE ENTREGÓ LA DIRECCIÓN (26/08/2026) ─────────────────────────
   Se usa UNA sola vez, con el botón "Cargar el cuadro inicial", cuando la
   tabla está en blanco. De ahí en adelante manda lo que esté guardado. */
export const SEMILLA: Array<Omit<FilaTorneo, 'id' | 'orden'>> = [
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 8',  nombre: 'REGOL',  formador: 'CASTRO', valor: 0 },
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 9',  nombre: 'REGOL',  formador: 'TABARES', valor: 0 },
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 10', nombre: 'REGOL',  formador: 'JESUS', valor: 0 },
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 12', nombre: 'REGOL',  formador: 'SAMUEL', valor: 0 },
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 13', nombre: 'REGOL',  formador: 'OSCAR', valor: 0 },
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 14', nombre: 'REGOL',  formador: 'RIOS', valor: 0 },
  { torneo: 'LIGA',             programa: 'DESARROLLO',  categoria: 'SUB 15', nombre: 'REGOL',  formador: 'CHALARCA', valor: 0 },
  { torneo: 'LIGA',             programa: 'SELECCIÓN',   categoria: 'SUB 14', nombre: 'WONDER', formador: 'RIOS', valor: 0 },
  { torneo: 'LIGA',             programa: 'SELECCIÓN',   categoria: 'SUB 15', nombre: 'WONDER', formador: 'ALVAREZ', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'DESARROLLO',  categoria: 'SUB 7',  nombre: 'REGOL',  formador: 'MARTIN', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 8',  nombre: 'REGOL',  formador: 'CASTRO', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 9',  nombre: 'REGOL',  formador: 'TABARES', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 10', nombre: 'REGOL',  formador: 'JESUS', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'DESARROLLO',  categoria: 'SUB 11', nombre: 'REGOL',  formador: 'MARTIN', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 12', nombre: 'REGOL',  formador: 'SAMUEL', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 13', nombre: 'REGOL',  formador: 'OSCAR', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 7',  nombre: 'WONDER', formador: 'NICOLAS', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'PROGRESIÓN',  categoria: 'SUB 8',  nombre: 'WONDER', formador: 'DORIA', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'PROGRESIÓN',  categoria: 'SUB 9',  nombre: 'WONDER', formador: 'DUVAN', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'PROGRESIÓN',  categoria: 'SUB 10', nombre: 'WONDER', formador: 'JUAN MANUEL', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'SELECCIÓN',   categoria: 'SUB 11', nombre: 'WONDER', formador: 'CHALARCA', valor: 0 },
  { torneo: 'ASOBDIM',          programa: 'PROGRESIÓN',  categoria: 'SUB 12', nombre: 'WONDER', formador: 'MARLON', valor: 0 },
  { torneo: 'FESTIVAL DE LIGA', programa: 'PROGRESIÓN',  categoria: 'SUB 11', nombre: 'REGOL',  formador: 'EDGAR', valor: 0 },
  { torneo: 'FESTIVAL DE LIGA', programa: 'PROGRESIÓN',  categoria: 'SUB 13', nombre: 'REGOL',  formador: 'EDGAR', valor: 0 },
  { torneo: 'VALORES LAF',      programa: 'FORMACIÓN',   categoria: 'SUB 7',  nombre: 'REGOL',  formador: 'MARTIN', valor: 0 },
  { torneo: 'VALORES LAF',      programa: 'FORMACIÓN',   categoria: 'SUB 10', nombre: 'REGOL',  formador: 'MARLON', valor: 0 },
  { torneo: 'VALORES LAF',      programa: 'FORMACIÓN',   categoria: 'SUB 12', nombre: 'REGOL',  formador: 'RIOS', valor: 0 },
  { torneo: 'VALORES LAF',      programa: 'FORMACIÓN',   categoria: 'SUB 15', nombre: 'REGOL',  formador: 'MUÑOZ', valor: 0 },
  { torneo: 'RAVE SOCCER',      programa: 'FORMACIÓN',   categoria: 'SUB 9',  nombre: 'REGOL',  formador: 'DORIA', valor: 0 },
  { torneo: 'RAVE SOCCER',      programa: 'FORMACIÓN',   categoria: 'SUB 10', nombre: 'REGOL',  formador: 'MARLON', valor: 0 },
  { torneo: 'RAVE SOCCER',      programa: 'FORMACIÓN',   categoria: 'SUB 11', nombre: 'REGOL',  formador: 'MARTIN', valor: 0 },
  { torneo: 'RAVE SOCCER',      programa: 'FORMACIÓN',   categoria: 'SUB 12', nombre: 'REGOL',  formador: 'RIOS', valor: 0 },
  { torneo: 'RAVE SOCCER',      programa: 'FORMACIÓN',   categoria: 'SUB 13', nombre: 'REGOL',  formador: 'RIOS', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 7',  nombre: 'REGOL',  formador: 'DUVAN', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 8',  nombre: 'REGOL',  formador: 'DORIA', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 9',  nombre: 'REGOL',  formador: 'DUVAN', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 10', nombre: 'REGOL',  formador: 'JIMENEZ', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 11', nombre: 'REGOL',  formador: 'JIMENEZ', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 7',  nombre: 'WONDER', formador: 'MUÑOZ', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 8',  nombre: 'WONDER', formador: 'EDGAR', valor: 0 },
  { torneo: 'COPA ABC',         programa: 'FORMACIÓN',   categoria: 'SUB 9',  nombre: 'WONDER', formador: 'DORIA', valor: 0 },
  { torneo: 'CONCEJO',          programa: 'DESARROLLO',  categoria: 'SUB 6',  nombre: 'REGOL',  formador: 'MARLON', valor: 0 },
  { torneo: 'CONCEJO',          programa: 'SELECCIÓN',   categoria: 'SUB 7',  nombre: 'REGOL',  formador: 'NICOLAS', valor: 0 },
  { torneo: 'CONCEJO',          programa: 'SELECCIÓN',   categoria: 'SUB 8',  nombre: 'REGOL',  formador: 'CASTRO', valor: 0 },
  { torneo: 'CONCEJO',          programa: 'SELECCIÓN',   categoria: 'SUB 9',  nombre: 'REGOL',  formador: 'TABARES', valor: 0 },
  { torneo: 'CONCEJO',          programa: 'SELECCIÓN',   categoria: 'SUB 10', nombre: 'REGOL',  formador: 'JESUS', valor: 0 },
  { torneo: 'CONCEJO',          programa: 'PROGRESIÓN',  categoria: 'SUB 11', nombre: 'REGOL',  formador: 'EDGAR', valor: 0 },
  { torneo: 'COPA AMISTAD',     programa: 'SELECCIÓN',   categoria: 'SUB 6',  nombre: 'REGOL',  formador: 'MARLON', valor: 0 },
  { torneo: 'COPA AMISTAD',     programa: 'PROGRESIÓN',  categoria: 'SUB 8',  nombre: 'REGOL',  formador: 'DORIA', valor: 0 },
  { torneo: 'COPA AMISTAD',     programa: 'PROGRESIÓN',  categoria: 'SUB 9',  nombre: 'REGOL',  formador: 'DUVAN', valor: 0 },
  { torneo: 'COPA AMISTAD',     programa: 'FORMACIÓN',   categoria: 'SUB 10', nombre: 'REGOL',  formador: 'DORIA', valor: 0 },
];
