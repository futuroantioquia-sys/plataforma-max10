// ─────────────────────────────────────────────────────────────────────────────
//  programacion.ts  ·  PROGRAMACIÓN DE COMPETENCIA
//
//  QUÉ ES (dirección, 28/08/2026): el cuadro donde la dirección deja escrito
//  QUÉ SE JUEGA, CUÁNDO y DÓNDE. Un renglón por partido: el torneo, la fecha,
//  el día, la hora, el rival, el escenario, el D.T y el A.T.
//
//  PARA QUÉ SIRVE: de aquí salen los POSPARTIDOS. Antes el formador abría la
//  planilla en blanco y escribía a mano el día, la hora, el rival y el
//  escenario. Ahora la programación la hace la dirección y, con un botón, la
//  planilla queda CREADA con el encabezado lleno y aparece en el Banco Post
//  Partido de ese torneo —o sea, en el banco del profe que lo tiene a cargo—.
//  El formador solo entra a calificar a los deportistas.
//
//  Se guarda en la tabla  programacion_competencia. Si todavía no existe, se
//  corre una sola vez  PASO-PROGRAMACION.bat.
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

export const TABLA_PROGRAMACION = 'programacion_competencia';

/** Un partido programado. */
export type FilaProgramacion = {
  id: string;
  torneo_num: string;
  jornada: string;        // la # FECHA: "1A", "2A"…
  fecha: string;          // AAAA-MM-DD, el día del juego
  hora: string;           // la hora de llegada, como en el pospartido: "2:00 PM"
  rival: string;
  escenario: string;
  dt: string;
  at: string;
  /** MARCA DE "YA SE MANDÓ". Se llena cuando la planilla del pospartido ya
   *  quedó creada, y por eso en el cuadro se ve el chulo verde.
   *  El nombre de la casilla quedó de cuando esto iba a los microciclos; se
   *  dejó igual para no tener que volver a tocar la base. — 29/08/2026 */
  microciclo_id: string;
  actualizada_en: string;
};

export const PROGRAMACION_VACIA: Omit<FilaProgramacion, 'id'> = {
  torneo_num: '', jornada: '', fecha: '', hora: '', rival: '',
  escenario: '', dt: '', at: '', microciclo_id: '', actualizada_en: '',
};

export const FALTA_TABLA_PROG =
  'Todavía no existe el cuadro de la programación en la base. ' +
  'Corre una sola vez PASO-PROGRAMACION.bat y vuelve a entrar.';

function aFila(r: any): FilaProgramacion {
  return {
    id:             String(r?.id ?? ''),
    torneo_num:     String(r?.torneo_num ?? ''),
    jornada:        String(r?.jornada ?? ''),
    fecha:          String(r?.fecha ?? ''),
    hora:           String(r?.hora ?? ''),
    rival:          String(r?.rival ?? ''),
    escenario:      String(r?.escenario ?? ''),
    dt:             String(r?.dt ?? ''),
    at:             String(r?.at ?? ''),
    microciclo_id:  String(r?.microciclo_id ?? ''),
    actualizada_en: String(r?.actualizada_en ?? ''),
  };
}

/** Todo lo programado, del partido más próximo al más lejano.
 *  Devuelve `undefined` cuando la tabla todavía no existe, que es distinto a
 *  que no haya nada programado. */
export async function getProgramacion(): Promise<FilaProgramacion[] | undefined> {
  try {
    /* SE TRAE DE A PEDAZOS. REGLA DE LA CASA (dirección, 29/08/2026):
       la base NUNCA entrega todo de un solo viaje —corta en las primeras
       mil filas—, y aquí siempre son miles. Todo lo que se lea de la base se
       pide de a pedazos hasta que diga que ya no hay más. No volver a asumir
       que con una sola petición llega todo. */
    const todas: any[] = [];
    const PASO = 1000;
    let desde = 0;
    for (let vuelta = 0; vuelta < 80; vuelta++) {
      const res = await fetch(
        `${SB_URL}/rest/v1/${TABLA_PROGRAMACION}?select=*&order=fecha.asc,hora.asc`,
        {
          headers: { ...HDR, Range: `${desde}-${desde + PASO - 1}`, 'Range-Unit': 'items' },
          cache: 'no-store',
        },
      );
      if (res.status === 404) return undefined;
      if (!res.ok && res.status !== 206) {
        const txt = await res.text().catch(() => '');
        if (/does not exist|schema cache/i.test(txt)) return undefined;
        return desde > 0 ? todas.map(aFila) : [];
      }
      const filas = await res.json();
      const lote = Array.isArray(filas) ? filas : [];
      todas.push(...lote);
      if (lote.length === 0) break;
      desde += lote.length;
    }
    return todas.map(aFila);
  } catch {
    return [];    // sin internet: la pantalla avisa y no borra nada
  }
}

/** Crea un renglón vacío y devuelve el que quedó guardado (con su id). */
export async function agregarPartido(
  datos: Partial<FilaProgramacion> = {},
): Promise<FilaProgramacion | null> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${TABLA_PROGRAMACION}`, {
      method: 'POST',
      headers: { ...HDR, Prefer: 'return=representation' },
      body: JSON.stringify([{
        ...PROGRAMACION_VACIA,
        ...datos,
        actualizada_en: new Date().toISOString(),
      }]),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(/does not exist|schema cache/i.test(txt) ? FALTA_TABLA_PROG : txt.slice(0, 200));
    }
    const creado = await res.json();
    const fila = Array.isArray(creado) ? creado[0] : creado;
    return fila ? aFila(fila) : null;
  } catch (e: any) {
    throw new Error(e?.message || 'No se pudo agregar el renglón.');
  }
}

/** Cambia una o varias casillas de un renglón. */
export async function guardarPartido(
  id: string,
  cambios: Partial<FilaProgramacion>,
): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLA_PROGRAMACION}?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify({ ...cambios, actualizada_en: new Date().toISOString() }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Borra un renglón de la programación. */
export async function borrarPartido(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLA_PROGRAMACION}?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: HDR },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** "2026-08-31" → "LUN 31 AGO". Igual que en el pospartido. */
export function diaBonito(fecha: string): string {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  const dias  = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
}

/** Deja la hora lista para leerla: "2:00 PM".
 *
 *  OJO (29/08/2026): desde que la hora se escoge con el mismo reloj del
 *  pospartido, ya viene escrita como "2:00 PM" —con su AM o PM—. Antes se
 *  guardaba en 24 horas ("14:00") y aquí se traducía; si llega así todavía,
 *  de un guardado viejo, se sigue traduciendo igual. */
export function horaBonita(hora: string): string {
  const t = String(hora ?? '').trim().toUpperCase();
  if (!t) return '';
  /* Ya trae AM o PM: se devuelve parejito. */
  const conAmPm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (conAmPm) return `${Number(conAmPm[1])}:${conAmPm[2]} ${conAmPm[3]}`;
  /* Viene en 24 horas, de antes. */
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  let h = Number(m[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}
