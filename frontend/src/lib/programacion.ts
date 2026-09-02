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
  /** LA HORA EN QUE ARRANCA EL PARTIDO (dirección, 02/09/2026).
   *  Va de la mano con la de llegada: se citan 45 minutos antes. Poniendo una,
   *  la otra se llena sola. Se guardan las dos porque a veces la citación se
   *  corre —una final, un escenario lejos— y hay que poder decirlo.
   *  De esta hora, y no de la de llegada, sale el aviso rojo cuando un mismo
   *  D.T o A.T tiene dos partidos a menos de dos horas. */
  hora_partido: string;
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
  torneo_num: '', jornada: '', fecha: '', hora: '', hora_partido: '', rival: '',
  escenario: '', dt: '', at: '', microciclo_id: '', actualizada_en: '',
};

/* ── MIENTRAS LA CASILLA NO EXISTA EN LA BASE ──────────────────────────────
   `hora_partido` es nueva (02/09/2026) y la base solo la tiene después de
   correr PASO-HORA-PARTIDO.bat. Si todavía no está, PostgREST responde con un
   error que dice que la columna no existe y RECHAZA TODO EL GUARDADO — se
   perdería también el rival, el escenario, lo que fuera.

   Para que eso no pase, cuando la base la rechaza se vuelve a intentar sin
   ella. La pantalla sigue funcionando igual; lo único que no queda guardado es
   la hora de partido, que de todos modos se deduce sumándole 45 minutos a la
   de llegada. */
const RX_SIN_COLUMNA = /hora_partido|column .* does not exist|schema cache/i;

function sinHoraPartido<T extends Record<string, any>>(o: T): Omit<T, 'hora_partido'> {
  const { hora_partido: _fuera, ...resto } = o;
  return resto;
}

export const FALTA_TABLA_PROG =
  'Todavía no existe el cuadro de la programación en la base. ' +
  'Corre una sola vez PASO-PROGRAMACION.bat y vuelve a entrar.';

/** La hora en minutos desde la medianoche. -1 si no se entiende. */
export function minutosDeHora(hora: string): number {
  const t = String(hora ?? '').trim().toUpperCase();
  let m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'PM') h += 12;
    return h * 60 + Number(m[2]);
  }
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return -1;
}

/** Los minutos, de vuelta a "2:00 PM". */
export function horaDeMinutos(min: number): string {
  if (!Number.isFinite(min)) return '';
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, '0');
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${mm} ${ampm}`;
}

/** "1:00 PM" + 45 → "1:45 PM". Devuelve '' si la hora no se entiende. */
export function masMinutos(hora: string, minutos: number): string {
  const m = minutosDeHora(hora);
  return m < 0 ? '' : horaDeMinutos(m + minutos);
}

/** Los 45 minutos que la academia cita antes del partido. — 02/09/2026 */
export const MINUTOS_ANTES = 45;

function aFila(r: any): FilaProgramacion {
  return {
    id:             String(r?.id ?? ''),
    torneo_num:     String(r?.torneo_num ?? ''),
    jornada:        String(r?.jornada ?? ''),
    fecha:          String(r?.fecha ?? ''),
    hora:           String(r?.hora ?? ''),
    /* Si la casilla todavía no existe en la base, se deduce: 45 minutos
       después de la citación. — 02/09/2026 */
    hora_partido:   String(r?.hora_partido ?? '') || masMinutos(String(r?.hora ?? ''), 45),
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
    const cuerpo = {
      ...PROGRAMACION_VACIA,
      ...datos,
      actualizada_en: new Date().toISOString(),
    };
    const mandar = (o: Record<string, any>) => fetch(`${SB_URL}/rest/v1/${TABLA_PROGRAMACION}`, {
      method: 'POST',
      headers: { ...HDR, Prefer: 'return=representation' },
      body: JSON.stringify([o]),
    });

    let res = await mandar(cuerpo);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      /* ¿Es solo que falta la casilla nueva? Se reintenta sin ella. */
      if (/hora_partido/i.test(txt)) res = await mandar(sinHoraPartido(cuerpo));
      if (!res.ok) {
        throw new Error(/does not exist|schema cache/i.test(txt) ? FALTA_TABLA_PROG : txt.slice(0, 200));
      }
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
    const cuerpo = { ...cambios, actualizada_en: new Date().toISOString() };
    const mandar = (o: Record<string, any>) => fetch(
      `${SB_URL}/rest/v1/${TABLA_PROGRAMACION}?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify(o),
      },
    );

    let res = await mandar(cuerpo);
    if (!res.ok && 'hora_partido' in cuerpo) {
      const txt = await res.text().catch(() => '');
      /* La casilla nueva todavía no está en la base: se guarda lo demás. */
      if (RX_SIN_COLUMNA.test(txt)) res = await mandar(sinHoraPartido(cuerpo));
    }
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

/* ══ LA CANCHA DE SIEMPRE DE CADA TORNEO ═════════════════════════════════
   (dirección, 02/09/2026 — «hay canchas que en los torneos siempre se juega
    en una misma»)

   La primera vez que se le escribe una cancha a un torneo, la plataforma
   pregunta —UNA SOLA VEZ— si esa es la cancha de siempre. Si se dice que sí,
   de ahí en adelante, al escribir el número de ese torneo, la cancha sale
   puesta. Se puede borrar y escribir otra cuando toque jugar por fuera: lo
   guardado es un punto de partida, no una obligación.

   DÓNDE SE GUARDA. En la tabla `config_cobro`, que ya existe y es un cajón de
   configuraciones (id + data en JSON). Así lo ve TODA la plataforma —Diana,
   la dirección, cualquier computador— y no hay que tocar la base para nada.

   `noPreguntar` guarda los torneos donde ya se dijo que NO: no se vuelve a
   preguntar nunca más por ese torneo. */
const ID_CANCHAS = 'canchas_torneo';

export type CanchasTorneo = {
  /** número del torneo → la cancha de siempre */
  fija: Record<string, string>;
  /** torneos donde ya se contestó que no, para no volver a preguntar */
  noPreguntar: string[];
};

export const CANCHAS_VACIAS: CanchasTorneo = { fija: {}, noPreguntar: [] };

export async function getCanchasTorneo(): Promise<CanchasTorneo> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/config_cobro?id=eq.${ID_CANCHAS}&select=data`,
      { headers: HDR, cache: 'no-store' },
    );
    if (!res.ok) return { ...CANCHAS_VACIAS };
    const d = await res.json();
    const data = Array.isArray(d) ? d[0]?.data : null;
    return {
      fija: (data && typeof data.fija === 'object') ? data.fija : {},
      noPreguntar: Array.isArray(data?.noPreguntar) ? data.noPreguntar.map(String) : [],
    };
  } catch {
    return { ...CANCHAS_VACIAS };
  }
}

export async function saveCanchasTorneo(v: CanchasTorneo): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/config_cobro`, {
      method: 'POST',
      headers: { ...HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: ID_CANCHAS, data: v, updated_at: new Date().toISOString() }),
    });
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
