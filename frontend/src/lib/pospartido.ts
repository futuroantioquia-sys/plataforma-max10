// ─────────────────────────────────────────────────────────────────────────────
//  pospartido.ts  ·  Guardar y recuperar las planillas de los partidos.
//
//  POR QUÉ EXISTE (dirección, 26/08/2026): el formador llena esto en la cancha,
//  con el partido andando. Si le toca pausar —se le acaba el tiempo, se cambia
//  de pantalla, se le apaga el teléfono— el avance NO se puede perder.
//
//  Por eso se guarda en DOS lados:
//
//    1. EN EL APARATO, solo. Cada cambio queda anotado en el mismo teléfono o
//       computador, sin internet de por medio. Es la red de seguridad: aunque
//       la cancha no tenga señal, lo escrito sigue ahí al volver a entrar.
//
//    2. EN LA BASE, al oprimir GUARDAR. Ahí queda para todo el mundo: se puede
//       seguir desde otro aparato y administración lo ve.
//
//  Manda lo que esté en la base cuando es más nuevo que lo del aparato; si no
//  hay nada en la base, se recupera el borrador local.
//
//  ── CAMBIO IMPORTANTE (dirección, 27/08/2026) ───────────────────────────────
//  Antes cada TORNEO tenía UNA sola planilla: al jugar la segunda fecha, la
//  primera se pisaba y se perdía. Eso estaba mal: un torneo son muchos partidos.
//
//  Ahora cada planilla se identifica por DOS cosas: el número del torneo Y la
//  # FECHA. Así el mismo torneo guarda la fecha 1, la fecha 2, la fecha 3… y
//  todas quedan archivadas. Ese archivo es el BANCO POSPARTIDO, y cada partido
//  se nombra como lo pidió la dirección:
//
//        LIGA DESARROLLO SUB 8  FECHA 1
//        └── nombre del torneo ─┘ └ fecha ┘
//
//  Para que la base acepte dos planillas del mismo torneo hay que correr una
//  sola vez  PASO-BANCO-POSPARTIDO.bat.
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

export const TABLA_POSPARTIDO = 'pospartido_planillas';

/** Una planilla guardada. `filas` va tal cual como se ve en pantalla. */
export type PlanillaGuardada = {
  torneo_num: string;
  jornada: string;          // la # FECHA: "1A", "2A"… Junto al torneo, la identifica
  fecha: string;
  llegar: string;
  rival: string;
  goles_nos: string;
  goles_ellos: string;
  autogoles: string;        // autogoles del rival, que suman a nuestro marcador
  filas: any[];
  /* ¿ESTÁ CERRADO O VA A MEDIAS? (dirección, 27/08/2026)
     false = GUARDAR AVANCE. El formador va llenando y puede seguir después.
     true  = GUARDAR DEFINITIVO. El partido quedó cerrado y revisado.
     De aquí sale el módulo de seguimiento: permite ver de un vistazo cuáles
     pospartidos están cerrados de verdad y cuáles siguen a medias. */
  definitivo: boolean;
  actualizada_en: string;   // fecha ISO
};

/** Un renglón del BANCO: lo justo para listarlo, SIN las filas (que pesan). */
export type FichaBanco = {
  torneo_num: string;
  jornada: string;
  fecha: string;
  rival: string;
  goles_nos: string;
  goles_ellos: string;
  definitivo: boolean;      // cerrado (true) o a medias (false)
  actualizada_en: string;
};

const FALTA_TABLA =
  'A la tabla del pospartido le falta algo. Corre ARREGLAR-LA-BASE.bat.';

/* ── Cómo se lee y se escribe la # FECHA ──────────────────────────────────── */

/** "1A" → 1 · "FECHA 3" → 3 · "" → 0. Saca el número, venga como venga. */
export function numeroDeFecha(jornada: any): number {
  const m = String(jornada ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** "1A" → "FECHA 1". Así se nombra en toda la plataforma. — dirección 27/08/2026 */
export function etiquetaFecha(jornada: any): string {
  const n = numeroDeFecha(jornada);
  return n > 0 ? `FECHA ${n}` : 'SIN FECHA';
}

/* ── El borrador del aparato ─────────────────────────────────────────────── */
/* La llave lleva torneo Y fecha: si no, la fecha 2 pisaba el borrador de la 1. */
const llaveLocal = (num: string, jornada: string) =>
  `pospartido-borrador-${String(num || '').trim()}-${String(jornada || '').trim()}`;

export function guardarBorradorLocal(p: PlanillaGuardada): void {
  if (!p.torneo_num) return;
  try { localStorage.setItem(llaveLocal(p.torneo_num, p.jornada), JSON.stringify(p)); }
  catch { /* el navegador no deja guardar: se sigue sin red de seguridad */ }
}

export function leerBorradorLocal(num: string, jornada: string): PlanillaGuardada | null {
  try {
    const txt = localStorage.getItem(llaveLocal(num, jornada));
    if (!txt) return null;
    const p = JSON.parse(txt);
    return p && Array.isArray(p.filas) ? p as PlanillaGuardada : null;
  } catch { return null; }
}

export function borrarBorradorLocal(num: string, jornada: string): void {
  try { localStorage.removeItem(llaveLocal(num, jornada)); } catch { /* nada */ }
}

/* ── La base ─────────────────────────────────────────────────────────────── */

const esq = encodeURIComponent;

/** La planilla de ESE torneo en ESA fecha. `null` si no hay nada; `undefined`
 *  si la tabla todavía no existe (que es otra cosa muy distinta). */
export async function getPlanilla(
  num: string,
  jornada: string,
): Promise<PlanillaGuardada | null | undefined> {
  const n = String(num || '').trim();
  const j = String(jornada || '').trim();
  if (!n || !j) return null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLA_POSPARTIDO}?select=*` +
      `&torneo_num=eq.${esq(n)}&jornada=eq.${esq(j)}&limit=1`,
      { headers: HDR, cache: 'no-store' },
    );
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (/does not exist/i.test(txt)) return undefined;
      return null;
    }
    const filas = await res.json();
    if (!Array.isArray(filas) || !filas.length) return null;
    return aPlanilla(filas[0], n, j);
  } catch {
    return null;   // sin internet: la pantalla usará el borrador del aparato
  }
}

function aPlanilla(f: any, n: string, j: string): PlanillaGuardada {
  return {
    torneo_num:    String(f?.torneo_num ?? n),
    jornada:       String(f?.jornada ?? j),
    fecha:         String(f?.fecha ?? ''),
    llegar:        String(f?.llegar ?? ''),
    rival:         String(f?.rival ?? ''),
    goles_nos:     String(f?.goles_nos ?? ''),
    goles_ellos:   String(f?.goles_ellos ?? ''),
    autogoles:     String(f?.autogoles ?? ''),
    filas:         Array.isArray(f?.filas) ? f.filas : [],
    definitivo:    f?.definitivo === true,
    actualizada_en: String(f?.actualizada_en ?? ''),
  };
}

/** Guarda (o actualiza) la planilla de ese torneo EN ESA FECHA. */
export async function guardarPlanilla(p: PlanillaGuardada): Promise<void> {
  if (!String(p.jornada || '').trim()) {
    throw new Error('Falta escoger la # FECHA. Sin fecha no se puede archivar el partido.');
  }
  const cuerpo = { ...p, actualizada_en: new Date().toISOString() };
  const res = await fetch(`${SB_URL}/rest/v1/${TABLA_POSPARTIDO}`, {
    method: 'POST',
    headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([cuerpo]),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    /* Si la base todavía tiene la llave vieja (solo el torneo), guardar la
       fecha 2 choca con la fecha 1. Se dice en cristiano qué hay que correr. */
    if (/no unique|on conflict|constraint/i.test(txt)) {
      throw new Error(
        'La base todavía guarda un solo partido por torneo. ' +
        'Corre PASO-BANCO-POSPARTIDO.bat una vez y vuelve a guardar.',
      );
    }
    throw new Error(
      res.status === 404 || /does not exist/i.test(txt)
        ? FALTA_TABLA
        : `No se pudo guardar en la base (${res.status}). ${txt.slice(0, 140)}`,
    );
  }
}

/** Borra de la base la planilla de ese torneo en esa fecha. Si la tabla no
 *  existe o no hay señal, no pasa nada: lo del aparato ya se borró aparte. */
export async function borrarPlanilla(num: string, jornada: string): Promise<void> {
  const n = String(num || '').trim();
  const j = String(jornada || '').trim();
  if (!n || !j) return;
  try {
    await fetch(
      `${SB_URL}/rest/v1/${TABLA_POSPARTIDO}?torneo_num=eq.${esq(n)}&jornada=eq.${esq(j)}`,
      { method: 'DELETE', headers: HDR },
    );
  } catch { /* sin internet: se borró lo del aparato, que es lo que se ve */ }
}

/* ── EL BANCO POSPARTIDO ─────────────────────────────────────────────────────
   El archivo con TODOS los partidos ya elaborados. No trae las filas —solo el
   encabezado de cada uno— para que la lista abra de una aunque haya cientos.
   — dirección, 27/08/2026 */

/** Todos los partidos archivados, del más nuevo al más viejo.
 *  `undefined` = la tabla todavía no existe. */
export async function getBanco(): Promise<FichaBanco[] | undefined> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLA_POSPARTIDO}` +
      `?select=torneo_num,jornada,fecha,rival,goles_nos,goles_ellos,definitivo,actualizada_en` +
      `&order=actualizada_en.desc&limit=1000`,
      { headers: HDR, cache: 'no-store' },
    );
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return /does not exist/i.test(txt) ? undefined : [];
    }
    const filas = await res.json();
    if (!Array.isArray(filas)) return [];
    return filas.map((f: any) => ({
      torneo_num:     String(f?.torneo_num ?? ''),
      jornada:        String(f?.jornada ?? ''),
      fecha:          String(f?.fecha ?? ''),
      rival:          String(f?.rival ?? ''),
      goles_nos:      String(f?.goles_nos ?? ''),
      goles_ellos:    String(f?.goles_ellos ?? ''),
      definitivo:     f?.definitivo === true,
      actualizada_en: String(f?.actualizada_en ?? ''),
    })).filter(f => f.torneo_num);
  } catch {
    return [];   // sin señal: el banco sale vacío, pero la planilla sigue sirviendo
  }
}

/** "hoy a las 3:42 p. m." — para decirle al formador cuándo quedó guardado. */
export function cuandoBonito(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (mismoDia) return `hoy a las ${hora}`;
  return `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} a las ${hora}`;
}
