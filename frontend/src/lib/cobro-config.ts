/* ═══════════════════════════════════════════════════════════════════════════
   BOTONES DE COBRO — lo que el administrador edita en /botones-cobro
   ---------------------------------------------------------------------------
   Aquí vive TODO lo que se puede cambiar sin tocar código: el texto del botón,
   su color y el mensaje que se le manda al acudiente por WhatsApp.

   Se guarda en la tabla `config_cobro` de Supabase (una sola fila, id
   'botones'), así que lo que se edite en un computador lo ve toda la
   plataforma, no solo el que lo escribió.

   Si la tabla todavía no existe, o si internet falla, la plataforma sigue
   funcionando con los textos de fábrica que están más abajo. Nunca se queda
   sin mensaje.
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

export type Boton = {
  etiqueta: string;   // lo que dice el botón
  color: string;      // color del botón
  mensaje: string;    // el texto que se manda por WhatsApp
};

export type CobroConfig = {
  /** Debe UN solo mes y es el mes en curso. Recordatorio amable. */
  uno: Boton;
  /** Debe dos o más meses, o un mes viejo. Cobro en firme. */
  atrasado: Boton;
  /** Cuenta a la que consigna la mayoría. */
  cuentaFuturo: Cuenta;
  /** Cuenta de los seis proyectos de MAX 10 (Selección y Desarrollo SUB 13, 14 y 15). */
  cuentaMax10: Cuenta;
};

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
  { clave: '{CUENTA}',       que: 'La cuenta que le toca, en renglones',ejemplo: 'Ahorros Bancolombia\n10182764613\nFuturo Antioquia\nNit 811036997' },
  { clave: '{CUENTA_CORTA}', que: 'La misma cuenta, en un solo renglón',ejemplo: 'Ahorros Bancolombia 10182764613 Futuro Antioquia Nit 811036997' },
  { clave: '{APP}',          que: 'La dirección de la plataforma',      ejemplo: 'https://plataforma-max10.vercel.app' },
];

/* ── COLORES SUGERIDOS ─────────────────────────────────────────────────── */
export const COLORES_BOTON: { nombre: string; valor: string }[] = [
  { nombre: 'Rojo (se debe)',     valor: '#C0504D' },
  { nombre: 'Ámbar (aviso)',      valor: '#E0A33A' },
  { nombre: 'Verde institucional', valor: '#00B050' },
  { nombre: 'Azul',               valor: '#4E8FD6' },
  { nombre: 'Gris apagado',       valor: '#5A6478' },
];

/* ── TEXTOS DE FÁBRICA ──────────────────────────────────────────────────
   Son los que están funcionando hoy. Quedan aquí como punto de partida:
   el administrador los cambia desde la pantalla y estos ya no se usan. */
export const CONFIG_DEFAULT: CobroConfig = {
  uno: {
    etiqueta: 'COBRAR UNO',
    color: '#C0504D',
    mensaje:
      'Un saludo especial.\n\n' +
      'Valoramos muchísimo su cumplimiento en los pagos.\n\n' +
      'Solo tiene pendiente este mes y la idea es que no se les junte con el próximo.\n\n' +
      'Adjuntamos Estado de Cuenta Plataforma MAX 10.\n\n' +
      'Si tiene alguna razón, duda, reclamo o comentario, le agradecemos hacerlo a la mayor brevedad. ' +
      'Lo importante es dar claridad.\n\n' +
      'El Deportista {NOMBRE} tiene pendiente el pago de {MES} por {VALOR_MES}\n\n' +
      '{CUENTA_CORTA}\n\n' +
      'Gracias por su compromiso.',
  },
  atrasado: {
    etiqueta: 'COBRAR AHORA',
    color: '#C0504D',
    mensaje:
      'Un saludo especial.\n\n' +
      'Adjuntamos Estado de Cuenta Plataforma MAX 10, del deportista {NOMBRE}.\n\n' +
      'Si tiene alguna razón, duda, reclamo o comentario, le agradecemos hacerlo a la mayor brevedad. ' +
      'Lo importante es dar claridad.\n\n' +
      'El Deportista {NOMBRE} tiene pendiente los pagos de {MESES}. ' +
      '{VALOR_MES} x {CUANTOS}. Total: {TOTAL}{MATRICULA}.\n\n' +
      '{CUENTA}\n\n' +
      'Ingrese a nuestra APP {APP} y suba los soportes correspondientes.\n\n' +
      'Contamos con su compromiso.',
  },
  cuentaFuturo: {
    banco:   'Ahorros Bancolombia',
    numero:  '10182764613',
    titular: 'Futuro Antioquia',
    nit:     'Nit 811036997',
  },
  cuentaMax10: {
    banco:   'Ahorros Bancolombia',
    numero:  '36000004823',
    titular: 'MAX 10 SPORT',
    nit:     '',
  },
};

/* ── QUÉ PROYECTOS CONSIGNAN A MAX 10 ───────────────────────────────────
   Los SEIS proyectos de MAX 10: SUB 13, 14 y 15, tanto de SELECCIÓN como de
   DESARROLLO. Todos los demás consignan a Futuro Antioquia.
   Es la MISMA regla que ya usa el Estado de Cuenta cuando el padre oprime
   PAGAR AHORA, para que las dos pantallas nunca digan cosas distintas. */
const sinAcento = (s: any) => String(s ?? '').toUpperCase().trim()
  .replace(/[ÁÀÂÃÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
  .replace(/[ÓÒÔÕÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N');

export function pagaAMax10(programa: any, proyecto: any): boolean {
  const prog = sinAcento(programa);
  const proy = sinAcento(proyecto);
  const esSelDesarr = /SELECC|DESARROLLO/.test(prog);
  const esSub131415 = /SUB[\s\-]*(13|14|15)/.test(proy);
  if (esSelDesarr && esSub131415) return true;
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

/** Mezcla lo guardado encima de lo de fábrica, para que nunca falte un campo. */
function completar(guardado: any): CobroConfig {
  const d = CONFIG_DEFAULT;
  const g = (guardado && typeof guardado === 'object') ? guardado : {};
  return {
    uno:          { ...d.uno,          ...(g.uno          ?? {}) },
    atrasado:     { ...d.atrasado,     ...(g.atrasado     ?? {}) },
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
  let out = String(plantilla ?? '');
  for (const [k, v] of Object.entries(mapa)) out = out.split(k).join(v);
  return out;
}
