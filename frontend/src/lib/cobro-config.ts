/* ═══════════════════════════════════════════════════════════════════════════
   BOTONES DE COBRO — lo que el administrador edita en /botones-cobro
   ---------------------------------------------------------------------------
   Aquí vive TODO lo que se puede cambiar sin tocar código: cuántos botones de
   cobro hay, qué dice cada uno, de qué color es, cuándo aparece y qué mensaje
   le manda al acudiente por WhatsApp.

   Se guarda en la tabla `config_cobro` de Supabase (una sola fila, id
   'botones'), así que lo que se edite en un computador lo ve toda la
   plataforma, no solo el que lo escribió.

   Si la tabla todavía no existe, o si internet falla, la plataforma sigue
   funcionando con los botones de fábrica que están más abajo. Nunca se queda
   sin mensaje.

   OJO — LA CUENTA NO LA DECIDE EL BOTÓN.
   A qué cuenta consigna cada familia lo decide EL PROYECTO, y solo el proyecto:
   los seis proyectos de SUB 13, 14 y 15 (Selección y Desarrollo) consignan a
   MAX 10; todos los demás, a Futuro Antioquia. Eso vale para cualquier botón
   que se cree aquí. Ver `pagaAMax10()` más abajo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/client';

const SB_HDR = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export type Cuenta = {
  banco: string;
  numero: string;
  titular: string;
  nit: string;
};

/** Cuándo aparece un botón: según CUÁNTOS MESES deba el deportista. */
export type Cuando = 'uno' | 'dos' | 'tres' | 'cuatro' | 'matricula' | 'atrasado' | 'siempre';

export const CUANDO_OPCIONES: { valor: Cuando; titulo: string; pie: string }[] = [
  { valor: 'uno',      titulo: 'Cuando debe 1 mes',
    pie: 'Solo el mes en curso. Va corriendo, no está atrasado.' },
  { valor: 'dos',      titulo: 'Cuando debe 2 meses',
    pie: 'El mes en curso y el anterior.' },
  { valor: 'tres',     titulo: 'Cuando debe 3 meses',
    pie: 'Los tres últimos meses.' },
  { valor: 'cuatro',   titulo: 'Cuando debe 4 meses o más',
    pie: 'Atraso grande. Aquí el cobro va en serio.' },
  { valor: 'matricula', titulo: 'Cuando debe la MATRÍCULA',
    pie: 'Manda sobre todos los demás: si debe matrícula, sale este.' },
  { valor: 'atrasado', titulo: 'Cuando debe 2 meses o más',
    pie: 'Cualquier atraso, sin importar cuántos meses sean.' },
  { valor: 'siempre',  titulo: 'Siempre que deba algo',
    pie: 'Aparece deba un mes o deba diez.' },
];

export type Boton = {
  id: string;
  etiqueta: string;   // lo que dice el botón
  color: string;      // color del botón
  cuando: Cuando;     // en qué filas aparece
  mensaje: string;    // el texto que se manda por WhatsApp
};

export type CobroConfig = {
  /** Los botones de cobro, en el orden en que salen en la tabla. */
  botones: Boton[];
  /** Cuenta a la que consigna la mayoría. */
  cuentaFuturo: Cuenta;
  /** Cuenta de los seis proyectos de MAX 10 (Selección y Desarrollo SUB 13, 14 y 15). */
  cuentaMax10: Cuenta;
};

/** ¿Este botón aplica a esta fila? `meses` es CUÁNTOS MESES debe el deportista
 *  (sin contar la matrícula, que se menciona aparte en el mensaje). */
export function aplicaBoton(b: Boton, meses: number): boolean {
  const n = Number(meses) || 0;
  switch (b.cuando) {
    case 'uno':      return n === 1;
    case 'dos':      return n === 2;
    case 'tres':     return n === 3;
    case 'cuatro':   return n >= 4;
    case 'atrasado': return n >= 2;
    case 'siempre':  return n >= 1;
    default:         return n >= 1;
  }
}

/* ── UN SOLO BOTÓN POR DEPORTISTA, ESCOGIDO POR EL ORDEN ────────────────────
   REGLA (dirección, 25/08/2026): en la fila de cada deportista sale UN ÚNICO
   botón, y cuál sale lo decide CUÁNTOS MESES debe:

       el 1º de la lista  →  al que debe 1 mes
       el 2º              →  al que debe 2 meses
       el 3º              →  al que debe 3 meses
       el ÚLTIMO          →  a ese número de meses Y A TODOS LOS QUE DEBAN MÁS

   Es el ORDEN el que manda, no un campo que haya que configurar. Antes había un
   desplegable de "¿cuándo aparece?" y se dañó dos veces: quedaban varios botones
   con la misma condición y a todo el mundo le salía el mismo. Se quitó a
   propósito. Para cambiar qué cubre un botón, se sube o se baja en la lista. */

/* EL 5º BOTÓN ES EL DE LA MATRÍCULA (dirección, 25/08/2026).
   Todo deportista que tenga la MATRÍCULA pendiente sale con ese botón, sin
   importar cuántos meses deba. Manda sobre la regla de los meses.
   Los cuatro primeros siguen repartidos por cantidad de meses. */
export const POS_MATRICULA = 4;   // el quinto de la lista (se cuenta desde 0)

/** El ÚNICO botón que le corresponde a este deportista.
 *  `meses` es cuántos meses debe; `debeMatricula`, si además debe la matrícula.
 *  Devuelve null si no debe nada o si no hay botones armados. */
export function escogerBoton(
  botones: Boton[],
  meses: number,
  debeMatricula = false,
): Boton | null {
  const lista = botones ?? [];
  if (!lista.length) return null;

  // 1º) La MATRÍCULA manda: si la debe y existe el 5º botón, ese es.
  if (debeMatricula && lista[POS_MATRICULA]) return lista[POS_MATRICULA];

  // 2º) Si no, por cantidad de meses, entre los CUATRO PRIMEROS.
  const porMes = lista.slice(0, POS_MATRICULA);
  const base = porMes.length ? porMes : lista;
  const n = Number(meses) || 0;
  if (n < 1) return null;
  // El último de esos recoge a todos los que deban esa cantidad o más.
  return base[Math.min(n, base.length) - 1] ?? null;
}

/** Lo que cubre el botón de la posición `i`, escrito para mostrárselo al
 *  administrador en su tarjeta. */
export function queCubre(i: number, total: number): string {
  if (i === POS_MATRICULA) return 'Le sale a quien deba la MATRÍCULA (manda sobre los demás)';
  if (i > POS_MATRICULA)   return 'De momento no se usa — el 5º es el de la matrícula';
  const n = i + 1;
  const mes = n === 1 ? 'mes' : 'meses';
  const ultimoDeMeses = Math.min(total, POS_MATRICULA) - 1;
  return i >= ultimoDeMeses
    ? `Le sale a quien debe ${n} ${mes} o más`
    : `Le sale a quien debe ${n} ${mes}`;
}

/** Cuántos meses de ejemplo usar para mostrarle al administrador cómo queda
 *  el mensaje de un botón, según la condición que le puso. */
export function mesesDeEjemplo(c: Cuando): number {
  switch (c) {
    case 'uno':    return 1;
    case 'dos':    return 2;
    case 'tres':   return 3;
    case 'cuatro': return 4;
    default:       return 2;
  }
}

/** Un id nuevo para un botón recién creado. */
export function nuevoId(): string {
  try {
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return 'b' + Math.random().toString(36).slice(2, 10);
}

/* ── COMODINES ──────────────────────────────────────────────────────────────
   Palabras entre llaves que la plataforma reemplaza por el dato real de cada
   deportista en el momento de armar el mensaje. */
export const COMODINES: { clave: string; que: string; ejemplo: string }[] = [
  { clave: '{NOMBRE}',       que: 'Nombre del deportista',              ejemplo: 'JUAN CAMILO SERNA RAMIREZ' },
  { clave: '{MESES}',        que: 'Los meses que debe',                 ejemplo: 'Julio y Agosto' },
  { clave: '{MES}',          que: 'Los meses que debe, en MAYÚSCULA',   ejemplo: 'JULIO Y AGOSTO' },
  { clave: '{VALOR_MES}',    que: 'Cuánto vale un mes',                 ejemplo: '$138.000' },
  { clave: '{CUANTOS}',      que: 'Cuántos meses debe',                 ejemplo: '2' },
  { clave: '{TOTAL}',        que: 'El total que debe',                  ejemplo: '$276.000' },
  { clave: '{MATRICULA}',    que: 'Sale solo si además debe matrícula', ejemplo: ', más la MATRÍCULA pendiente' },
  { clave: '{LO_QUE_DEBE}',  que: 'Todo lo que debe, bien redactado: los meses, la matrícula, o las dos cosas',
    ejemplo: 'la MATRÍCULA 2026 y los pagos de Julio y Agosto. $138.000 x 2. Total: $276.000' },
  { clave: '{CUENTA}',       que: 'La cuenta que le toca, en renglones',ejemplo: 'Ahorros Bancolombia\n10182764613\nFuturo Antioquia\nNit 811036997' },
  { clave: '{CUENTA_CORTA}', que: 'La misma cuenta, en un solo renglón',ejemplo: 'Ahorros Bancolombia 10182764613 Futuro Antioquia Nit 811036997' },
  { clave: '{APP}',          que: 'La dirección de la plataforma',      ejemplo: 'https://plataforma-max10.vercel.app' },
];

/* ── COLORES SUGERIDOS ─────────────────────────────────────────────────── */
export const COLORES_BOTON: { nombre: string; valor: string }[] = [
  { nombre: 'Gris (1 mes)',        valor: '#5A6478' },
  { nombre: 'Naranja (2 meses)',   valor: '#E07B39' },
  { nombre: 'Rojo (3 meses)',      valor: '#C0504D' },
  { nombre: 'Morado (4 o más)',    valor: '#7C4DA0' },
  { nombre: 'Fucsia (matrícula)',  valor: '#D6409F' },
  { nombre: 'Ámbar (aviso)',       valor: '#E0A33A' },
  { nombre: 'Verde institucional', valor: '#00B050' },
  { nombre: 'Azul',                valor: '#4E8FD6' },
];

const CLARIDAD =
  'Si tiene alguna razón, duda, reclamo o comentario, le agradecemos hacerlo a la mayor brevedad. ' +
  'Lo importante es dar claridad.';

/* ── BOTONES DE FÁBRICA ─────────────────────────────────────────────────
   Como los dictó la dirección el 25/08/2026:

     1 mes en curso  →  GRIS          (va corriendo, no está atrasado)
     2 meses         →  NARANJA
     3 meses         →  ROJO
     4 o más         →  MORADO        (para que nadie quede sin botón)
     MATRÍCULA       →  FUCSIA        (el 5º; manda sobre todos los demás)

   El administrador los cambia, les agrega más o los borra desde la pantalla. */
export const CONFIG_DEFAULT: CobroConfig = {
  botones: [
    {
      id: 'uno',
      etiqueta: 'COBRAR 1',
      color: '#5A6478',   // gris — solo el mes en curso, va corriendo
      cuando: 'uno',
      mensaje:
        'Un saludo especial.\n\n' +
        'Valoramos muchísimo su cumplimiento en los pagos.\n\n' +
        'Solo tiene pendiente este mes y la idea es que no se les junte con el próximo.\n\n' +
        'Adjuntamos Estado de Cuenta Plataforma MAX 10.\n\n' +
        CLARIDAD + '\n\n' +
        'El Deportista {NOMBRE} tiene pendiente el pago de {MES} por {VALOR_MES}\n\n' +
        '{CUENTA_CORTA}\n\n' +
        'Gracias por su compromiso.',
    },
    {
      id: 'dos',
      etiqueta: 'COBRAR 2',
      color: '#E07B39',   // naranja — dos meses
      cuando: 'dos',
      mensaje:
        'Un saludo especial.\n\n' +
        'Adjuntamos Estado de Cuenta Plataforma MAX 10, del deportista {NOMBRE}.\n\n' +
        CLARIDAD + '\n\n' +
        'El Deportista {NOMBRE} tiene pendiente los pagos de {MESES}. ' +
        '{VALOR_MES} x {CUANTOS}. Total: {TOTAL}{MATRICULA}.\n\n' +
        '{CUENTA}\n\n' +
        'Ingrese a nuestra APP {APP} y suba los soportes correspondientes.\n\n' +
        'Contamos con su compromiso.',
    },
    {
      id: 'tres',
      etiqueta: 'COBRAR 3',
      color: '#C0504D',   // rojo — tres meses
      cuando: 'tres',
      mensaje:
        'Un saludo especial.\n\n' +
        'Adjuntamos Estado de Cuenta Plataforma MAX 10, del deportista {NOMBRE}.\n\n' +
        CLARIDAD + '\n\n' +
        'El Deportista {NOMBRE} tiene pendiente los pagos de {MESES}. ' +
        '{VALOR_MES} x {CUANTOS}. Total: {TOTAL}{MATRICULA}.\n\n' +
        'Le agradecemos ponerse al día o acercarse a acordar una forma de pago.\n\n' +
        '{CUENTA}\n\n' +
        'Ingrese a nuestra APP {APP} y suba los soportes correspondientes.\n\n' +
        'Contamos con su compromiso.',
    },
    {
      id: 'cuatro',
      etiqueta: 'COBRAR 4+',
      color: '#7C4DA0',   // morado — cuatro meses o más
      cuando: 'cuatro',
      mensaje:
        'Un saludo especial.\n\n' +
        'Adjuntamos Estado de Cuenta Plataforma MAX 10, del deportista {NOMBRE}.\n\n' +
        CLARIDAD + '\n\n' +
        'El Deportista {NOMBRE} tiene pendiente los pagos de {MESES}, es decir ' +
        '{CUANTOS} meses. {VALOR_MES} x {CUANTOS}. Total: {TOTAL}{MATRICULA}.\n\n' +
        'Necesitamos que se comunique con nosotros a la mayor brevedad para ' +
        'definir cómo se pone al día.\n\n' +
        '{CUENTA}\n\n' +
        'Ingrese a nuestra APP {APP} y suba los soportes correspondientes.\n\n' +
        'Quedamos atentos.',
    },
    {
      id: 'matricula',
      etiqueta: 'COBRAR MATRÍCULA',
      color: '#D6409F',   // fucsia — tiene la matrícula pendiente
      cuando: 'matricula',
      mensaje:
        'Un saludo especial.\n\n' +
        'Adjuntamos Estado de Cuenta Plataforma MAX 10, del deportista {NOMBRE}.\n\n' +
        CLARIDAD + '\n\n' +
        'El Deportista {NOMBRE} tiene pendiente {LO_QUE_DEBE}.\n\n' +
        'Sin la matrícula al día no podemos completar su inscripción ni tramitar ' +
        'su carné y sus torneos.\n\n' +
        '{CUENTA}\n\n' +
        'Ingrese a nuestra APP {APP} y suba los soportes correspondientes.\n\n' +
        'Contamos con su compromiso.',
    },
  ],
  cuentaFuturo: {
    banco:   'Ahorros Bancolombia',
    numero:  '10182764613',
    titular: 'Futuro Antioquia',
    nit:     'Nit 811036997',
  },
  /* Cuenta de MAX 10 cambiada el 01/09/2026 por pedido de la dirección.
     Antes: 36000004823. Esto es solo el valor de fábrica: lo que de verdad
     sale en los mensajes es lo que esté guardado en Botones de Cobro. */
  cuentaMax10: {
    banco:   'Ahorros Bancolombia',
    numero:  '27700006723',
    titular: 'MAX 10 SPORT',
    nit:     '',
  },
};

/** La condición que le toca al botón que está en la posición `i` de la lista:
 *  el 1º cubre 1 mes, el 2º dos meses, el 3º tres, y del 4º en adelante,
 *  "4 meses o más". Es el orden natural: COBRAR 1, COBRAR 2, COBRAR 3, COBRAR 4+ */
export function cuandoPorPosicion(i: number): Cuando {
  return (['uno', 'dos', 'tres', 'cuatro', 'matricula'][i] ?? 'siempre') as Cuando;
}

/** El color que le toca al botón de la posición `i`, como lo dictó la
 *  dirección: 1 mes gris · 2 meses naranja · 3 meses rojo · 4 o más morado. */
export function colorPorPosicion(i: number): string {
  return ['#5A6478', '#E07B39', '#C0504D'][i] ?? '#7C4DA0';
}

/** Reparte CONDICIÓN y COLOR por el ORDEN de la lista. Sirve para arreglar de un
 *  solo golpe unos botones que quedaron descuadrados, sin perder los nombres ni
 *  los mensajes que el administrador ya escribió. */
export function asignarPorOrden(botones: Boton[]): Boton[] {
  return (botones ?? []).map((b, i) => ({
    ...b,
    cuando: cuandoPorPosicion(i),
    color:  colorPorPosicion(i),
  }));
}

/** Un botón nuevo, en blanco, para cuando se oprime AGREGAR BOTÓN.
 *  `cuantosHay` sirve para darle de una la condición que le toca por su puesto,
 *  y no dejarlo en "siempre", que es lo que hacía que a todo el mundo le
 *  salieran todos los botones. */
export function botonEnBlanco(cuantosHay = 0): Boton {
  return {
    id: nuevoId(),
    etiqueta: 'NUEVO COBRO',
    color: '#E0A33A',
    cuando: cuandoPorPosicion(cuantosHay),
    mensaje:
      'Un saludo especial.\n\n' +
      'El Deportista {NOMBRE} tiene pendiente {MESES}, por un total de {TOTAL}.\n\n' +
      CLARIDAD + '\n\n' +
      '{CUENTA}\n\n' +
      'Gracias por su compromiso.',
  };
}

/* ── QUÉ PROYECTOS CONSIGNAN A MAX 10 ───────────────────────────────────
   Los SEIS proyectos de MAX 10: SUB 13, 14 y 15, tanto de SELECCIÓN como de
   DESARROLLO. Todos los demás consignan a Futuro Antioquia.

   Esto NO depende del botón que se oprima: depende únicamente del proyecto en
   que esté el deportista. Es la MISMA regla que usa el Estado de Cuenta cuando
   el padre oprime PAGAR AHORA, para que las dos pantallas nunca se
   contradigan. */
const sinAcento = (s: any) => String(s ?? '').toUpperCase().trim()
  .replace(/[ÁÀÂÃÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
  .replace(/[ÓÒÔÕÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N');

export function pagaAMax10(programa: any, proyecto: any): boolean {
  const prog = sinAcento(programa);
  const proy = sinAcento(proyecto);
  if (/SELECC|DESARROLLO/.test(prog) && /SUB[\s\-]*(13|14|15)/.test(proy)) return true;
  // Por si en alguna ficha vieja quedó todo escrito en un solo campo.
  const junto = prog + ' ' + proy;
  return ['DESARROLLO SUB 15', 'DESARROLLO SUB 14', 'DESARROLLO SUB 13',
          'SELECCION SUB 15', 'SELECCION SUB 14', 'SELECCION SUB 13']
    .some(p => junto.includes(p));
}

/** La cuenta escrita en renglones, como va en el mensaje. */
export function cuentaEnRenglones(c: Cuenta): string {
  return [c.banco, c.numero, c.titular, c.nit].filter(Boolean).join('\n');
}
/** La misma cuenta, todo en un solo renglón. */
export function cuentaEnUnRenglon(c: Cuenta): string {
  return [c.banco, c.numero, c.titular, c.nit].filter(Boolean).join(' ');
}

/* ── LEER Y GUARDAR ─────────────────────────────────────────────────────── */

/** Mezcla lo guardado encima de lo de fábrica, para que nunca falte un campo.
 *  También entiende el formato viejo (`uno` y `atrasado` sueltos, antes de que
 *  se pudieran agregar botones) y lo convierte en la lista nueva. */
function completar(guardado: any): CobroConfig {
  const d = CONFIG_DEFAULT;
  const g = (guardado && typeof guardado === 'object') ? guardado : {};

  let botones: Boton[] = [];
  if (Array.isArray(g.botones) && g.botones.length) {
    botones = g.botones.map((b: any, i: number) => ({
      id:       String(b?.id ?? nuevoId()),
      etiqueta: String(b?.etiqueta ?? `COBRO ${i + 1}`),
      color:    String(b?.color ?? '#C0504D'),
      /* ERROR CORREGIDO EL 25/08/2026 — esta lista se quedó vieja.
         Cuando se agregaron las condiciones 'dos', 'tres' y 'cuatro', aquí
         siguieron aceptándose solo 'uno', 'atrasado' y 'siempre'. Resultado:
         un botón guardado como "debe 2 meses" se volvía "siempre" al leerlo,
         y entonces le aplicaba a TODO el mundo. Por eso al que debía siete
         meses le salía el botón de dos.
         La lista tiene que salir de CUANDO_OPCIONES para que nunca más se
         quede atrás cuando se agregue una condición nueva. */
      cuando:   (CUANDO_OPCIONES.some(c => c.valor === b?.cuando) ? b.cuando : 'siempre') as Cuando,
      mensaje:  String(b?.mensaje ?? ''),
    }));
  } else if (g.uno || g.atrasado) {
    // Formato viejo → lista
    botones = [
      { ...d.botones[0], ...(g.uno      ?? {}), id: 'uno',      cuando: 'uno'      as Cuando },
      { ...d.botones[1], ...(g.atrasado ?? {}), id: 'atrasado', cuando: 'atrasado' as Cuando },
    ];
  } else {
    botones = d.botones.map(b => ({ ...b }));
  }

  return {
    botones,
    cuentaFuturo: { ...d.cuentaFuturo, ...(g.cuentaFuturo ?? {}) },
    cuentaMax10:  { ...d.cuentaMax10,  ...(g.cuentaMax10  ?? {}) },
  };
}

export async function getCobroConfig(): Promise<CobroConfig> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/config_cobro?id=eq.botones&select=data`,
      { headers: SB_HDR, cache: 'no-store' },
    );
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) && d[0]?.data) return completar(d[0].data);
    }
  } catch {}
  return completar(null);   // sin tabla o sin internet: los de fábrica
}

/** Guarda. Crea la fila si no existe (upsert). Devuelve true si quedó. */
export async function saveCobroConfig(cfg: CobroConfig): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/config_cobro`, {
      method: 'POST',
      headers: { ...SB_HDR, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'botones', data: cfg, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}

/* ── ARMAR EL MENSAJE ───────────────────────────────────────────────────── */

export type DatosCobro = {
  nombre: string;
  meses: string;        // "Julio y Agosto"
  valorMes: string;     // "$138.000"
  cuantos: number;
  total: string;        // "$276.000"
  debeMatricula: boolean;
  cuenta: Cuenta;
  app: string;
};

/** Reemplaza los comodines del texto por los datos reales del deportista. */
export function armarMensaje(plantilla: string, d: DatosCobro): string {
  const mapa: Record<string, string> = {
    '{NOMBRE}':       d.nombre,
    '{MESES}':        d.meses,
    '{MES}':          d.meses.toUpperCase(),
    '{VALOR_MES}':    d.valorMes,
    '{CUANTOS}':      String(d.cuantos),
    '{TOTAL}':        d.total,
    '{MATRICULA}':    d.debeMatricula ? ', más la MATRÍCULA pendiente' : '',
    '{CUENTA}':       cuentaEnRenglones(d.cuenta),
    '{CUENTA_CORTA}': cuentaEnUnRenglon(d.cuenta),
    '{APP}':          d.app,
  };
  /* {LO_QUE_DEBE} — arma la frase completa de la deuda, y sirve tanto si debe
     solo meses, como solo la matrícula, como las dos cosas. Se puso para que el
     mensaje del botón de MATRÍCULA también diga qué meses debe. — 25/08/2026 */
  const plata = d.cuantos > 1
    ? `${d.valorMes} x ${d.cuantos}. Total: ${d.total}`
    : d.total;
  const frameses = d.cuantos >= 1
    ? (d.cuantos === 1 ? `el pago de ${d.meses}. ${plata}` : `los pagos de ${d.meses}. ${plata}`)
    : '';
  mapa['{LO_QUE_DEBE}'] =
    d.debeMatricula && frameses ? `la MATRÍCULA 2026 y ${frameses}`
    : d.debeMatricula           ? 'la MATRÍCULA 2026'
    : frameses;

  let out = String(plantilla ?? '');
  for (const [k, v] of Object.entries(mapa)) out = out.split(k).join(v);
  return out;
}
