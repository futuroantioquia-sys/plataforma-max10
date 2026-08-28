'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useSoloLectura } from '@/lib/permisos';
import { ArrowLeft, Search, Users, Save, CheckCircle, Columns3, Upload, X, Trophy, AlertCircle, Trash2 } from 'lucide-react';
import { getDeportistas, saveDeportistas, deleteAllDeportistas, eliminarDeportista, getProfes } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';
import { EST_SOLICITA } from '@/lib/retiro';
import { getCuadro, type FilaTorneo } from '@/lib/torneos';

// ── Regex reutilizable para columna de proyecto ───────────────
const RX_PROY = /proyecto|^proy\b/i;

// ── Orden de programas en la tabla ────────────────────────────
const ORDEN_PROGRAMA = [
  'Estimulación', 'Formación', 'Progresión',
  'Pre-Progresión', 'Selección', 'Desarrollo',
];

// ── Columnas con desplegable (opciones auto-generadas del Excel) ─
const SELECTS_RX: RegExp[] = [
  /tipo.*afil|afil.*tipo/i,
  /^program/i,
  /^estado$/i,
  /^sede/i,          // SEDE DE ENTRENAMIENTO — editable desde la fila (25/08/2026)
];

/* ── SEDES OFICIALES ──────────────────────────────────────────────────────
   En las fichas la misma sede está escrita de varias formas: "la 80" y
   "LA 80", "BELLO NIQUIA" y "Bello Niquía", "Santa Mónica" y "SANTA MÓNICA".
   Por eso el filtro mostraba la misma sede repetida y una sede quedaba
   partida en dos.

   Esta es la lista buena. Todo lo que llegue se compara SIN tildes y SIN
   mayúsculas contra ella, así que lo ya escrito sigue reconociéndose, pero en
   pantalla y al guardar queda siempre la forma oficial. — 25/08/2026 */
/* ORDEN OFICIAL, dictado por la dirección el 25/08/2026. Es el orden en que se
   ven las sedes en el filtro y en el desplegable de cada fila, para TODOS los
   programas. NO es alfabético a propósito: es el orden con el que la academia
   las nombra. */
const SEDES_OFICIALES: string[] = [
  'SANTA MÓNICA',
  'LA 80',
  'CENTRO',
  'BELLO NIQUÍA',
  'SABANETA',
  'RIONEGRO',      // la dirección confirmó que se llama RIONEGRO, no ORIENTE
  'INSTITUCIONAL',
];

/** Igual que arriba pero comparable: sin tildes, en mayúsculas y sin dobles
 *  espacios. "la 80", "LA  80" y "La 80" dan todos "LA 80". */
function llaveSede(s: any): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/* NOMBRES VIEJOS QUE APUNTAN A UNA SEDE OFICIAL.
   La dirección (25/08/2026) pidió que en el desplegable quede SANTA MÓNICA y
   LA 80 como dos sedes, sin la tercera "LA 80 (SANTA MÓNICA)": ese nombre
   compuesto es LA 80, y el paréntesis era solo una aclaración.
   La llave se escribe SIN tildes y en mayúsculas, como la deja llaveSede(). */
const ALIAS_SEDE: Record<string, string> = {
  'LA 80 SANTA MONICA': 'LA 80',
};

/* LO QUE NO ES UNA SEDE.
   En algunas fichas la casilla de sede quedó con "SEL/DES", que es el PROGRAMA
   (Selección/Desarrollo), no un lugar. Se trata como vacío: desaparece del
   desplegable y en la fila queda en "—" para que se le ponga la sede buena.
   El dato viejo no se borra de la base; solo deja de contarse como sede. */
const NO_SON_SEDE = new Set<string>([
  'SEL DES',   // SEL/DES
  'SELDES',
]);

/** Devuelve la forma OFICIAL de una sede.
 *
 *  Si NO la reconoce, no la inventa ni la mete en otra sede: la deja tal cual,
 *  solo en mayúsculas, para que al menos "Rionegro" y "RIONEGRO" no salgan como
 *  dos sedes distintas. Esas quedan al final de la lista, a la vista, para que
 *  la administración decida qué hacer con ellas. */
function sedeCanonica(v: any): string {
  const bruto = String(v ?? '').trim();
  if (!bruto) return '';
  const k = llaveSede(bruto);
  if (NO_SON_SEDE.has(k)) return '';            // SEL/DES y parecidos: no son sede
  if (ALIAS_SEDE[k]) return ALIAS_SEDE[k];
  const oficial = SEDES_OFICIALES.find(o => llaveSede(o) === k);
  return oficial ?? bruto.toUpperCase();
}

// ── PALETA (la misma del consolidado de asistencias) ─────────
const LIENZO     = '#333F50';   // lienzo de la tabla
const PANEL      = '#3C4759';   // fila de datos
const CAMPO      = '#2B3547';   // barras y paneles alrededor
const BORDE      = '#4A5568';
const VERDE      = '#00B050';
const GRIS_VACIO = '#717985';   // retirados / pausados

// Años de nacimiento del filtro: del más nuevo al más viejo.
const ANIOS_NACIMIENTO = Array.from({ length: 2024 - 2011 + 1 }, (_, i) => String(2024 - i));

// ── Opciones estándar para TIPO DE AFILIACIÓN (editable) ─
const OPCIONES_AFIL = [
  'Nuevo', 'Antiguo', 'Reingreso', 'Pasó de Est.', 'B Institucional', 'MB Institucional',
];

// ── Convierte serial de Excel a fecha legible ─────────────────
function serialAFecha(val: string): string {
  const n = Number(String(val).trim());
  if (!val || isNaN(n) || n < 30000 || n > 60000) return val;
  try {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return val; }
}

function esFechaAfil(col: string) { return /fecha.*afil|afil.*fecha|fecha_afil/i.test(col.trim()); }
function esCodigo(col: string)    { return /^c[oó]d/i.test(col.trim()); }

// Normaliza el NOMBRE de una columna para poder emparejar los datos que entraron
// con distinto nombre (Excel vs formulario de la app). Ej:
//   'GÉNERO' y 'GENERO'  → 'GENERO'
//   'DIRECCIÓN' y 'DIRECCION' → 'DIRECCION'
//   'PESO (CM)' y 'PESO' → 'PESO'
//   'PARENTEZCO' y 'PARENTESCO' → 'PARENTESCO'
function normKey(s: string): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')                          // quita "(CM)", "(KG)"…
    .replace(/[^A-Z0-9]/g, '')                          // quita espacios/puntuacion
    .replace(/Z/g, 'S');                                // parentezco = parentesco
}

// Diccionario de equivalencias entre los DOS formatos de captura (Excel vs APP).
// Cada grupo lista los nombres equivalentes; el primero es solo de referencia.
const SINONIMOS = [
  /* CÓDIGO: durante un tiempo el mismo dato se guardó con tres nombres distintos
     ("CÓDIGO", "CODIGO" sin tilde y "CÓDIGO DEL DEPORTISTA"). Ya se unificaron
     todos en la base bajo "CÓDIGO", pero se dejan aquí como equivalentes para que,
     si un Excel vuelve a entrar con otro nombre, la plataforma lo siga tratando
     como la MISMA columna y ningún deportista desaparezca de las búsquedas. */
  ['CÓDIGO', 'CODIGO', 'CÓDIGO DEL DEPORTISTA', 'CODIGO DEL DEPORTISTA', 'COD'],
  ['NOMBRE DEL ACUDIENTE', 'ACUDIENTE'],
  ['ANTECEDENTES MEDICOS', 'ANTECEDENTES_MED'],
  ['NUMERO DE CELULAR', 'CEL_FAMILIAR'],
  ['CELULAR DEL ACUDIENTE', 'TEL_ACUDIENTE'],
  ['INSTITUCION EDUCATIVA', 'COLEGIO'],
  ['ALGUNA CONDICION MENTAL O COMPORTAMENTAL?', 'CONDICION_MENTAL'],
  ['NUMERO DE DOCUMENTO DEL ACUDIENTE', 'DOC_ACUD'],
  ['NUMERO DE DOCUMENTO', 'DOCUMENTO', 'DOCUMENTO_INGRESO'],
  ['EMPRESA DONDE LABORA', 'EMPRESA'],
  ['EPS / ENTIFDAD DE SALUD', 'EPS'],
  ['GRADO EN CURSO', 'GRADO'],
  ['TIENES HERMANOS EN EL CLUB?', 'HERMANOS_CLUB'],
  ['HORARIO DE ESTUDIO', 'HORARIO_ESTUDIO'],
  ['JORNADA DE ESTUDIO', 'JORNADA'],
  ['JORNADA DE ENTRENAMIENTO', 'JORNADA_ENT'],
  ['NOMBRE DEL FAMILIAR', 'NOMBRE_FAMILIAR'],
  ['NOMBRE DE TU HERMANO', 'NOMBRE_HERMANO'],
  ['SI ES NUEVO QUE ESPERA RECIBIR SI ES ANTIGUO EN QUE DEBE MEJORAR', 'OBSERVACIONES'],
  ['PARENTEZCO DEL ACUDIENTE', 'PARENTESCO_ACUD'],
  ['PIE DOMINANTE', 'PIE_HABIL'],
  ['POSICION EN EL CAMPO', 'POSICION'],
  ['SEDE DE ENTRENAMIENTO', 'SEDE'],
  ['TALLA DEL UNIFORME', 'TALLA_UNIFORME'],
  ['TIPO DE COLEGIO', 'TIPO_COL'],
  ['TIPO DE DOCUMENTO', 'TIPO_DOC'],
  ['TIPO DE DOCUMENTO DEL ACUDIENTE', 'TIPO_DOC_ACUD'],
  ['EN CUANTOS TORNEOS LOCALES LE GUSTARIA PARTICIPAR?', 'TORNEOS_LOCALES'],
  ['LE GUSTARIA PARTICIPAR EN TORNEOS NACIONALES?', 'TORNEOS_NAC'],
];
const CANON = (() => {
  const m = {};
  for (const grupo of SINONIMOS) {
    const canonica = normKey(grupo[0]);
    for (const nombre of grupo) m[normKey(nombre)] = canonica;
  }
  return m;
})();
function claveCanonica(s) {
  const n = normKey(s);
  return CANON[n] ?? n;
}
function esTipoAfil(col: string)  { return !esFechaAfil(col) && /tipo.*afil|^afil/i.test(col.trim()); }

/* ── EN QUÉ BLOQUE VA CADA CÓDIGO ─────────────────────────────────────────
   Orden pedido por la dirección el 25/08/2026:

     1. Los de CUATRO dígitos, de menor a mayor   (3456, 4123, …)
     2. Los de CINCO dígitos, de menor a mayor    (21345, 22345, … 26111)
     3. Los que empiezan por B — becados, y MB de media beca
     4. Cualquier otro código raro, de últimas

   Los RETIRADOS y PAUSADOS bajan después de todo esto, sin importar su
   código: de eso se encarga rangoEstado().

   (Antes había una lista fija que ponía los 26xxx de primeras y los 4xxx de
   últimas. Se reemplazó por esta regla, que no hay que tocar cada año.) */
function grupoCodigo(codRaw: string): number {
  const s = String(codRaw ?? '').trim().toUpperCase();
  if (!s) return 9;
  if (/^M?B/.test(s)) return 3;                 // B… y MB… (media beca)
  if (/^\d+$/.test(s)) {
    if (s.length === 4) return 1;
    if (s.length === 5) return 2;
  }
  return 4;
}

/* COLORES DEL CÓDIGO — orden de la dirección (26/08/2026):
   ANTIGUOS verde · NUEVOS naranja · REINGRESOS azul · los B (y MB) en gris. */
const COD_VERDE   = '#16a34a';  // ANTIGUO
const COD_NARANJA = '#f97316';  // NUEVO
/* Las cuatro competencias (C1..C4) van en naranja con letra blanca, para que
   se vean como un bloque aparte dentro del libro. — dirección, 26/08/2026 */
const NARANJA_COMP = '#f97316';
const COD_AZUL    = '#2563eb';  // REINGRESO
const COD_GRIS    = '#6b7280';  // B / MB institucional y todo lo demás

function colorCodigo(afil: string): string {
  const v = afil.toLowerCase();
  if (v.includes('nuevo'))     return COD_NARANJA;
  if (v.includes('antigu'))    return COD_VERDE;
  if (v.includes('reingreso')) return COD_AZUL;
  if (v.includes('instit'))    return COD_GRIS;   // B y MB institucional
  return COD_GRIS;
}

/** Prioridad de orden: Nuevo→Antiguo→Reingreso→MB Inst→B Inst */
function ordenAfil(dep: Deportista): number {
  const v = getColVal(dep, /tipo.*afil|^afil/i).toLowerCase();
  if (v.includes('nuevo'))     return 1;
  if (v.includes('antigu'))    return 2;
  if (v.includes('reingreso')) return 3;
  if (v.includes('mb instit')) return 4;
  if (v.includes('b instit'))  return 5;
  return 6;
}

/** Orden oficial del listado: por código, con la prioridad de siempre.
 *  Recibe cómo leer el código y el nombre, para poder tener en cuenta lo que
 *  todavía está escrito en pantalla y sin guardar (los cambios pendientes). */
function cmpDeportistasCon(
  codigoDe: (d: Deportista) => string,
  nombreDe: (d: Deportista) => string,
) {
  return (a: Deportista, b: Deportista): number => {
    // 1º) Activos arriba; pausados y retirados al final.
    const rA = rangoEstado(a), rB = rangoEstado(b);
    if (rA !== rB) return rA - rB;
    // 2º) Bloque del código: 4 dígitos → 5 dígitos → B → otros.
    const cA = codigoDe(a), cB = codigoDe(b);
    const gA = grupoCodigo(cA), gB = grupoCodigo(cB);
    if (gA !== gB) return gA - gB;
    // 3º) Dentro del bloque, de menor a mayor.
    const nA = Number(String(cA).replace(/\D/g, '')) || 0;
    const nB = Number(String(cB).replace(/\D/g, '')) || 0;
    if (nA !== nB) return nA - nB;
    return nombreDe(a).localeCompare(nombreDe(b), 'es');
  };
}

function getColVal(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k.trim()));
  return k ? (dep._columnas[k] ?? '') : '';
}

function ordenPrograma(prog: string) {
  const i = ORDEN_PROGRAMA.findIndex(p => p.toLowerCase() === prog.trim().toLowerCase());
  return i >= 0 ? i : ORDEN_PROGRAMA.length;
}
/* PEDIR el retiro NO es estar retirado (26/08/2026).
   El estado "SOLICITA RETIRO" significa que el caso ENTRÓ EN ESTUDIO mientras
   se coordinan los pagos pendientes: el deportista sigue activo, sigue en su
   proyecto y se le sigue cobrando hasta que administración resuelva en
   Total Retirados. Por eso se descarta la palabra "solicita" antes de mirar
   si dice "retirado". */
function pidioRetiro(dep: Deportista) { return /solicit/i.test(getColVal(dep, /^estado$/i)); }
function esRetirado(dep: Deportista) {
  const v = getColVal(dep, /^estado$/i);
  return /retir/i.test(v) && !/solicit/i.test(v);
}
function esPausado(dep: Deportista)  { return /pausa/i.test(getColVal(dep, /^estado$/i)); }
/** Los que ya no están entrenando bajan al final de la lista:
 *  0 = activo · 1 = pausado · 2 = retirado.
 *  Dentro de cada bloque NO se altera nada: sigue mandando el orden de códigos
 *  de siempre (nuevos naranja, antiguos verde, reingreso azul). — 22/08/2026 */
function rangoEstado(dep: Deportista): number {
  if (esRetirado(dep)) return 2;
  if (esPausado(dep))  return 1;
  return 0;
}
function grupoDep(dep: Deportista): string {
  if (esRetirado(dep)) return '__RETIRADO__';
  return getColVal(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
}

const COLOR_GRUPO: Record<string, string> = {
  'Estimulación':     'bg-[#4b5563]',
  'Formación':        'bg-[#4b5563]',
  'Progresión':       'bg-[#4b5563]',
  'Pre-Progresión':   'bg-[#4b5563]',
  'Selección':        'bg-[#4b5563]',
  'Desarrollo':       'bg-[#4b5563]',
  '__SIN_PROGRAMA__': 'bg-[#4b5563]',
  '__RETIRADO__':     'bg-[#4b5563]',
};
const LABEL_GRUPO: Record<string, string> = {
  '__SIN_PROGRAMA__': 'SIN PROYECTO',
  '__RETIRADO__':     'RETIRADOS',
};

// Claves virtuales para columnas que no vienen del Excel
const VTC  = '__COMPETENCIA__';
const VT1  = '__TORNEO1__';
const VT2  = '__TORNEO2__';
const VT3  = '__TORNEO3__';
const VT4  = '__TORNEO4__';
const VPOS = '__POSICION__';
/* Dos columnas que NO vienen del Excel: se calculan solas y no se editan.
   Van enseguida de PROGRAMA. — 25/08/2026 */
const VMEN = '__VALOR_MENSUALIDAD__';   // la misma cuota del estado de cuenta
const VCON = '__CONSIGNA_A__';          // a Futuro, a MAX 10, o no paga

/* ── VALOR DE LA MENSUALIDAD ───────────────────────────────────────────────
   Misma tabla que usa el Estado de Cuenta del deportista, para que las dos
   pantallas digan siempre lo mismo. Si el deportista tiene CUOTA_MANUAL
   (acuerdo con la familia), esa manda sobre la tabla. */
const sinTildes = (t: any) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

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
const enPesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

/* VALOR MENSUALIDAD — las cuotas que se usan (dirección, 25/08/2026).
   Normalmente la cuota se deduce del programa y la sede, pero ahora se puede
   escoger a mano de esta lista, o escribir otra cifra para casos especiales. */
const CUOTAS = [138000, 115000, 80000, 70000];
/** Nombre de la casilla donde se guarda la cuota puesta a mano. */
const CUOTA_MANUAL = 'CUOTA_MANUAL';
/** La casilla de cuota manual tal como se llame en esta ficha (o la de por defecto). */
function claveCuotaManual(dep: Deportista): string {
  return Object.keys(dep._columnas ?? {}).find(k => /^cuota_?manual$/i.test(k.trim())) || CUOTA_MANUAL;
}

/** BECADO: el código empieza por B pero NO por MB (esa es media beca y sí paga). */
function esBecadoDep(dep: Deportista): boolean {
  const k = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k.trim()));
  const raw = k ? String(dep._columnas[k] ?? '').trim() : '';
  return /^b\d/i.test(raw) && !/^mb/i.test(raw);
}

/** Cuánto paga al mes este deportista. Vacío si es becado (no paga). */
function valorMensualidad(dep: Deportista): string {
  if (esBecadoDep(dep)) return '';
  const manual = Number(getColVal(dep, /^cuota_?manual$/i).replace(/[^0-9]/g, '')) || 0;
  if (manual > 0) return enPesos(manual);
  return enPesos(tarifaMensual(getColVal(dep, /^program/i), getColVal(dep, /^sede/i)));
}

/* ── A QUÉ CUENTA CONSIGNA ─────────────────────────────────────────────────
   Los SEIS proyectos de MAX 10 — SUB 13, SUB 14 y SUB 15, tanto de SELECCIÓN
   como de DESARROLLO — consignan a MAX 10. Todos los demás, a Futuro
   Antioquia. Misma regla del Estado de Cuenta y de los botones de cobro. */
const sinAcentoMay = (s: any) => String(s ?? '').toUpperCase().trim()
  .replace(/[ÁÀÂÃÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
  .replace(/[ÓÒÔÕÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N');

function consignaAMax10(dep: Deportista): boolean {
  const prog = sinAcentoMay(getColVal(dep, /^program/i));
  const proy = sinAcentoMay(getColVal(dep, /proyecto|^proy\b/i));
  if (/SELECC|DESARROLLO/.test(prog) && /SUB[\s\-]*(13|14|15)/.test(proy)) return true;
  const junto = prog + ' ' + proy;
  return ['DESARROLLO SUB 15', 'DESARROLLO SUB 14', 'DESARROLLO SUB 13',
          'SELECCION SUB 15', 'SELECCION SUB 14', 'SELECCION SUB 13']
    .some(p => junto.includes(p));
}

/* CONSIGNA A — opciones del desplegable (dirección, 25/08/2026).
   Normalmente se deduce del proyecto, pero ahora se puede forzar a mano para
   los casos sueltos que no siguen la regla. */
const CONSIGNA_OPCIONES = ['A MAX 10', 'A FUTURO', 'NO PAGA'];
const COLOR_CONSIGNA: Record<string, string> = {
  'A MAX 10':  '#4E8FD6',
  'A FUTURO':  '#00B050',
  'NO PAGA':   '#5A6478',
};

/** Lo que se escogió A MANO en la columna, si es que se escogió algo. */
function consignaManual(dep: Deportista): string {
  const v = String((dep._columnas ?? {})[VCON] ?? '').trim().toUpperCase();
  return CONSIGNA_OPCIONES.includes(v) ? v : '';
}

/** Qué dice la columna CONSIGNA A, y de qué color va.
 *  Manda lo escogido a mano; si no hay nada escogido, se deduce del proyecto. */
function consignaA(dep: Deportista): { texto: string; color: string; manual: boolean } {
  const manual = consignaManual(dep);
  if (manual) return { texto: manual, color: COLOR_CONSIGNA[manual], manual: true };
  if (esBecadoDep(dep))    return { texto: 'NO PAGA',  color: '#5A6478', manual: false };
  if (consignaAMax10(dep)) return { texto: 'A MAX 10', color: '#4E8FD6', manual: false };
  return { texto: 'A FUTURO', color: '#00B050', manual: false };
}

/* ── LAS CUATRO COMPETENCIAS: C1, C2, C3 y C4 ────────────────────────────────
   Dirección, 26/08/2026. Cada deportista puede estar inscrito hasta en cuatro
   torneos. Antes estas columnas se llamaban TORNEO 1..4 y se escribían a mano,
   que era donde se colaban los errores. Ahora se llaman C1..C4 (competencia
   uno, dos, tres y cuatro) y se escogen de un desplegable que trae SOLO los
   torneos del programa del deportista: si está en DESARROLLO, solo ve los
   torneos de desarrollo.

   Lo que queda guardado es EL NÚMERO DEL TORNEO ("33"), que es el # TOR del
   cuadro de Torneos y Competencias: la llave de todo el proceso. Con él se
   arma el pospartido y se cuadra el valor. En el desplegable sí se ve el
   número con su nombre —"33 · CRISTOREY SUB 11 REGOL"— para no escoger a
   ciegas, y al pasar el mouse por la casilla también aparece completo. */
function numCompetencia(col: string): 0 | 1 | 2 | 3 | 4 {
  const c = String(col ?? '').trim();
  if (col === VT1 || /^compite$/i.test(c) || /torneo.?1/i.test(c) || /^c\s*1$/i.test(c)) return 1;
  if (col === VT2 || /torneo.?2/i.test(c) || /^c\s*2$/i.test(c)) return 2;
  if (col === VT3 || /torneo.?3/i.test(c) || /^c\s*3$/i.test(c)) return 3;
  if (col === VT4 || /torneo.?4/i.test(c) || /^c\s*4$/i.test(c)) return 4;
  return 0;
}

/** El programa, comparable: sin número delante, sin tildes y en mayúsculas.
 *  "6. Desarrollo" y "DESARROLLO" tienen que dar lo mismo. */
function llavePrograma(v: any): string {
  const s = sinTildes(String(v ?? '')).toUpperCase().replace(/^\d+\s*[.\-)]\s*/, '').trim();
  if (/PASO/.test(s)) return 'FORMACION';
  return s;
}

/** "CRISTOREY SUB 11 REGOL" — el torneo en un solo renglón, sin el número. */
function nombreTorneoCorto(f: FilaTorneo): string {
  return [f.torneo, f.categoria, f.nombre]
    .map(x => String(x ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(' ');
}

/** "33 · CRISTOREY SUB 11 REGOL" — como se ve en el desplegable. */
function etiquetaTorneo(f: FilaTorneo, numero: number): string {
  return `${numero} · ${nombreTorneoCorto(f)}`;
}

// Etiquetas de columna — las cuatro competencias se muestran como C1..C4
function labelCol(col: string): string {
  const nc = numCompetencia(col);
  if (nc) return `C${nc}`;
  if (col === VTC)  return 'COMPETENCIA';
  if (col === VPOS) return 'POSICIÓN';
  if (col === VMEN) return 'VALOR MENSUALIDAD';
  if (col === VCON) return 'CONSIGNA A';
  return col.toUpperCase();
}

// ─────────────────────────────────────────────────────────────
export default function GeneralPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [edits,       setEdits]       = useState<Record<string, Record<string, string>>>({});
  // Nombre del deportista en edición (doble clic en Consolidado Afiliados)
  const [editNombreId, setEditNombreId] = useState<string | null>(null);
  const nombreClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buscar,      setBuscar]      = useState('');
  const [buscarCod,   setBuscarCod]   = useState('');
  /* Filas donde el usuario escogió "Otro valor…" en VALOR MENSUALIDAD: esa
     casilla se convierte en un campo para escribir la cifra. — 25/08/2026 */
  const [cuotaOtro,   setCuotaOtro]   = useState<Record<string, boolean>>({});
  const [guardado,    setGuardado]    = useState(false);
  const COL_WIDTHS_KEY   = 'futuro_vg_col_widths';
  const COL_VISIBLE_KEY  = 'futuro_vg_col_visible';
  const COL_ORDEN_KEY    = 'futuro_vg_col_orden';   // el orden en que las dejó cada quien

  const [colWidths,      setColWidths]      = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) ?? '{}'); } catch { return {}; }
  });
  const [colVisible,     setColVisible]     = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_VISIBLE_KEY) ?? '{}') as Record<string, boolean>;
      // Nunca ocultar columnas de nombre/deportista
      const RX_NOMBRE = /deportista|alumno|jugador|atleta|^nombre/i;
      Object.keys(saved).forEach(k => {
        if (RX_NOMBRE.test(k.trim())) delete saved[k];
      });
      return saved;
    } catch { return {}; }
  });
  const [panelColumnas,  setPanelColumnas]  = useState(false);
  const [resizingActive, setResizingActive] = useState<string | null>(null);
  const [programaFiltro, setProgramaFiltro] = useState<string | null>(null);
  const [proyectoFiltro, setProyectoFiltro] = useState<string | null>(null);
  /* ── FILTRAR LOS QUE NO TIENEN PROYECTO (dirección, 27/08/2026) ───────────
     Antes la lista de proyectos solo traía los que existen, así que a los que
     tienen la casilla en blanco no había forma de sacarlos — y son justo los
     que hay que revisar. Ahora la lista trae una opción más, con rayas, que
     los deja solos en pantalla.

     La palabra "__SIN__" es solo el marbete que usa el programa por dentro:
     en pantalla se lee "— Sin proyecto —". Va entre guiones bajos para que
     nunca se confunda con el nombre de un proyecto de verdad. */
  const SIN_PROYECTO = '__SIN__';
  const [sedeFiltro,     setSedeFiltro]     = useState<string | null>(null);   // 25/08/2026
  const [anioFiltro,     setAnioFiltro]     = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Importar Torneos ─────────────────────────────────────────
  type FilaTorneo = { codigo: string; nombre: string; competencia: string; t1: string; t2: string; t3: string; t4: string; depId: string | null; match: 'codigo' | 'nombre' | null };
  const [modalTorneo,   setModalTorneo]   = useState(false);
  const [torneoFilas,   setTorneoFilas]   = useState<FilaTorneo[]>([]);
  const [torneoPaso,    setTorneoPaso]    = useState<'subir' | 'preview' | 'listo'>('subir');
  const [torneoProc,    setTorneoProc]    = useState(false);
  const [torneoArrastr, setTorneoArrastr] = useState(false);
  const [borrando,      setBorrando]      = useState(false);
  const [cargando,      setCargando]      = useState(true);
  const soloLectura = useSoloLectura(); // contabilidad: solo ver

  // ── Subir Nuevos Deportistas ─────────────────────────────────
  type NuevoReg = { _nombre: string; _columnas: Record<string,string>; duplicado: boolean };
  const [modalNuevos,  setModalNuevos]  = useState(false);
  const [nuevosPaso,   setNuevosPaso]   = useState<'subir'|'preview'|'listo'>('subir');
  const [nuevosFilas,  setNuevosFilas]  = useState<NuevoReg[]>([]);
  const [nuevosProc,   setNuevosProc]   = useState(false);
  const [ultimoLote,   setUltimoLote]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('futuro_ultimo_lote') ?? '[]'); } catch { return []; }
  });
  const nuevosInputRef = useRef<HTMLInputElement>(null);

  async function eliminarYReimportar() {
    if (!confirm('¿Eliminar TODOS los deportistas y volver a importar desde Excel?\n\nEsta acción no se puede deshacer.')) return;
    setBorrando(true);
    try {
      await deleteAllDeportistas();
      router.push('/alumnos/importar');
    } catch {
      alert('Error al eliminar. Intenta de nuevo.');
      setBorrando(false);
    }
  }
  const torneoInputRef = useRef<HTMLInputElement>(null);

  // Cerrar panel al hacer clic fuera
  useEffect(() => {
    if (!panelColumnas) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setPanelColumnas(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelColumnas]);

  // Guardar anchos y visibilidad en localStorage
  useEffect(() => {
    try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths)); } catch {}
  }, [colWidths]);
  useEffect(() => {
    try { localStorage.setItem(COL_VISIBLE_KEY, JSON.stringify(colVisible)); } catch {}
  }, [colVisible]);

  function toggleColVisible(col: string) {
    setColVisible(prev => ({ ...prev, [col]: !(prev[col] ?? true) }));
  }
  function mostrarTodas() {
    setColVisible({});
    try { localStorage.removeItem(COL_VISIBLE_KEY); } catch {}
  }

  /* ── MOVER LAS COLUMNAS DE LUGAR ─────────────────────────────────────────
     (dirección, 27/08/2026 — "que se pueda como en pospartido")

     Se agarra el título de la columna y se suelta donde uno quiera. El orden
     queda guardado EN ESTE COMPUTADOR: al volver a entrar, el cuadro está como
     lo dejó cada quien. No se le cambia a nadie más.

     DOS COLUMNAS NO SE MUEVEN: el N° y el CÓDIGO. El código lleva pegado al
     lado el nombre del deportista, y las dos van clavadas a la izquierda para
     no perder de vista de quién es cada renglón cuando el cuadro se corre. Si
     se pudieran mover, esa clavada quedaría apuntando al lugar equivocado y el
     nombre taparía otra columna. */
  const [ordenCols, setOrdenCols] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(COL_ORDEN_KEY);
      if (guardado) {
        const lista = JSON.parse(guardado);
        if (Array.isArray(lista)) setOrdenCols(lista.filter(x => typeof x === 'string'));
      }
    } catch { /* si el navegador no deja guardar, se usa el orden de siempre */ }
  }, []);

  const [colArrastrada, setColArrastrada] = useState<number | null>(null);
  const [colEncima,     setColEncima]     = useState<number | null>(null);

  /* ── FIJAR UNA COLUMNA, PROVISIONALMENTE ─────────────────────────────────
     (dirección, 27/08/2026)

     El cuadro es largo y toca correrlo para el lado. A veces se necesita tener
     una columna a la vista mientras se revisa lo de allá lejos —por ejemplo el
     ESTADO mientras se miran las competencias—. Con el alfiler del título, esa
     columna se viene al frente y se queda quieta; con el mismo alfiler se
     suelta y vuelve a su lugar.

     NO SE GUARDA en el computador, a propósito: es para el rato, no para
     siempre. Al recargar la pantalla queda como estaba.

     UNA A LA VEZ: fijar dos o tres se come la pantalla y ya no queda dónde
     leer. Al fijar otra, la anterior se suelta sola.

     El CÓDIGO no se puede fijar: ya va clavado con el nombre pegado al lado. */
  const [colFijada, setColFijada] = useState<string | null>(null);

  function anchoDeCol(col: string): number {
    return colWidths[col] ?? (esCodigo(col) ? 130 : esFechaAfil(col) ? 100 : esTipoAfil(col) ? 95 : 110);
  }

  function volverAlOrdenDeSiempre() {
    setOrdenCols(null);
    try { localStorage.removeItem(COL_ORDEN_KEY); } catch {}
  }
  // ── Resize de columnas ────────────────────────────────────────
  const resizingCol  = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current  = col;
    resizeStartX.current = e.clientX;
    resizeStartW.current = colWidths[col] ?? 110;
    setResizingActive(col);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const newW = Math.max(40, resizeStartW.current + (ev.clientX - resizeStartX.current));
      setColWidths(prev => ({ ...prev, [resizingCol.current!]: newW }));
    };
    const onUp = () => {
      resizingCol.current = null;
      setResizingActive(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  function resetColWidths() {
    setColWidths({});
    try { localStorage.removeItem(COL_WIDTHS_KEY); } catch {}
  }

  useEffect(() => {
    getDeportistas().then(lista => {
      setCargando(false);
      if (!lista.length) return;
      let cambiado = false;
      const actualizados = lista.map(dep => {
        const keySede     = Object.keys(dep._columnas ?? {}).find(k => /sede/i.test(k.trim()));
        const keyPrograma = Object.keys(dep._columnas ?? {}).find(k => /^program/i.test(k.trim()));
        if (!keySede || !keyPrograma) return dep;
        const prog = (dep._columnas[keyPrograma] ?? '').trim();
        const sede = (dep._columnas[keySede] ?? '').trim();
        if (/^(desarrollo|selecci[oó]n)$|desarrollo.*selecc|selecc.*desarrollo/i.test(prog) && sede !== 'INSTITUCIONAL') {
          cambiado = true;
          return { ...dep, _columnas: { ...dep._columnas, [keySede]: 'INSTITUCIONAL' } };
        }
        return dep;
      });
      if (cambiado) saveDeportistas(actualizados);
      setDeportistas(actualizados);
    });
  }, []);

  // ── Columnas ordenadas: FECHA AFIL → CÓD → resto (DIA → PROYECTO → PROFE) ──
  const columnas = useMemo<string[]>(() => {
    if (!deportistas.length) return [];
    let ref = deportistas[0];
    deportistas.forEach(d => {
      if (Object.keys(d._columnas ?? {}).length > Object.keys(ref._columnas ?? {}).length) ref = d;
    });
    const todas = Object.keys(ref._columnas ?? {});
    const fecha      = todas.filter(c => esFechaAfil(c));
    const tipoAfil   = todas.filter(c => esTipoAfil(c));
    const estado     = todas.filter(c => /^estado$/i.test(c.trim()));  // ESTADO después de TIPO AFIL
    const cod        = todas.filter(c => esCodigo(c));
    const programa   = todas.filter(c => /^program/i.test(c.trim()));
    const proyecto   = todas.filter(c => /proyecto|^proy\b/i.test(c.trim()));
    const profe      = todas.filter(c => /^prof|\bprofe\b/i.test(c.trim()));
    /* SEDE DE ENTRENAMIENTO y JORNADA DE ENTRENAMIENTO van JUSTO DESPUÉS de
       PROFE (dirección, 25/08/2026). Antes quedaban perdidas allá en el montón
       de columnas del formulario de afiliación. Ojo con no confundir JORNADA DE
       ENTRENAMIENTO con JORNADA DE ESTUDIO, que es otra columna. */
    const sedeEnt    = todas.filter(c => /^sede/i.test(c.trim()));
    const jornadaEnt = todas.filter(c => /^jornada\s+de\s+entren/i.test(c.trim()));
    const celAcud    = todas.filter(c => /^celular del acudiente$/i.test(c.trim())); // después de PROFE
    const cal        = todas.filter(c => /^cal$/i.test(c.trim()));      // después de COMPETENCIA
    const com        = todas.filter(c => /^com$/i.test(c.trim()));      // después de COMPETENCIA
    const compite     = todas.filter(c => /^compite$/i.test(c.trim()));
    const competencia = todas.filter(c => /^competencia$/i.test(c.trim()));
    const torneo2     = todas.filter(c => /torneo.?2/i.test(c.trim()));
    const torneo3     = todas.filter(c => /torneo.?3/i.test(c.trim()));
    const torneo4     = todas.filter(c => /torneo.?4/i.test(c.trim()));
    // Estas columnas las ubicamos manualmente, así que las sacamos del bloque "resto"
    const excluidas = new Set([
      ...fecha, ...tipoAfil, ...estado, ...cod, ...programa, ...proyecto, ...profe,
      ...sedeEnt, ...jornadaEnt,
      ...celAcud, ...cal, ...com, ...compite, ...competencia, ...torneo2, ...torneo3, ...torneo4,
      VPOS,
    ]);
    const resto    = todas.filter(c => !excluidas.has(c));

    // Torneos: COMPETENCIA → CAL → COM → T1 → T2 → T3 → T4 → POSICIÓN
    const torneos = [
      ...(competencia.length ? competencia : [VTC]),
      ...cal,
      ...com,
      ...(compite.length ? compite : [VT1]),
      ...(torneo2.length ? torneo2 : [VT2]),
      ...(torneo3.length ? torneo3 : [VT3]),
      ...(torneo4.length ? torneo4 : [VT4]),
      VPOS,
    ];

    /* Después de la columna DÍA:
       PROYECTO → PROFE → SEDE DE ENTRENAMIENTO → JORNADA DE ENTRENAMIENTO
       → CELULAR DEL ACUDIENTE → TORNEOS */
    const trasProfe = [...proyecto, ...profe, ...sedeEnt, ...jornadaEnt, ...celAcud, ...torneos];
    const idxDia = resto.findIndex(c => /^d[ií]a$/i.test(c.trim()));
    if (idxDia >= 0) {
      resto.splice(idxDia + 1, 0, ...trasProfe);
    } else {
      resto.push(...trasProfe);
    }

    // PROGRAMA queda ENSEGUIDA de TIPO DE AFILIACIÓN, y justo después van
    // VALOR MENSUALIDAD y CONSIGNA A, que se calculan solas.
    return [...fecha, ...tipoAfil, ...programa, VMEN, VCON, ...estado, ...cod, ...resto];
  }, [deportistas]);

  // DEPORTISTA/NOMBRE/ALUMNO/JUGADOR/ATLETA nunca se ocultan (columna crítica)
  const RX_NOMBRE_COL = /deportista|alumno|jugador|atleta|^nombre/i;
  /* Las que se ven, EN EL ORDEN EN QUE LAS DEJÓ QUIEN USA LA PANTALLA.
     Si aparece una columna nueva que no estaba en el orden guardado, se pone
     al final: nunca se pierde, y de ahí se mueve a donde toque. */
  const colVisibles = useMemo(() => {
    const base = columnas.filter(c => RX_NOMBRE_COL.test(c.trim()) || colVisible[c] !== false);
    if (!ordenCols?.length) return base;
    const hay = new Set(base);
    const enOrden = ordenCols.filter(c => hay.has(c));
    const nuevas  = base.filter(c => !enOrden.includes(c));
    return [...enOrden, ...nuevas];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnas, colVisible, ordenCols]);

  /* Dónde empieza cada columna clavada a la izquierda. El N° mide 36 y va de
     primero; si hay una columna fijada, entra detrás de él y empuja al CÓDIGO
     y al DEPORTISTA para que nada quede montado encima de nada. */
  const ANCHO_NUM = 36;
  const colCodigo = colVisibles.find(c => esCodigo(c)) ?? '';
  const izqFijada = ANCHO_NUM;
  const izqCodigo = ANCHO_NUM + (colFijada ? anchoDeCol(colFijada) : 0);
  const izqNombre = izqCodigo + (colCodigo ? anchoDeCol(colCodigo) : 130);

  /** El orden final: si hay una fijada, se va de primera. */
  const colOrdenadas = useMemo(
    () => (colFijada && colVisibles.includes(colFijada)
      ? [colFijada, ...colVisibles.filter(c => c !== colFijada)]
      : colVisibles),
    [colVisibles, colFijada],
  );

  /** Suelta la columna que se venía arrastrando en el lugar `destino`. */
  function soltarColumnaEn(destino: number) {
    const origen = colArrastrada;
    setColArrastrada(null);
    setColEncima(null);
    if (origen === null || origen === destino) return;
    const lista = [...colVisibles];
    const [movida] = lista.splice(origen, 1);
    lista.splice(destino, 0, movida);
    setOrdenCols(lista);
    try { localStorage.setItem(COL_ORDEN_KEY, JSON.stringify(lista)); } catch {}
  }
  const ocultasCount = columnas.length - colVisibles.length;

  // ── Proyectos disponibles por programa ───────────────────────
  const proyectosPorPrograma = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, Set<string>> = {};
    deportistas.forEach(dep => {
      const prog = getColVal(dep, /^program/i).trim();
      const proy = getColVal(dep, RX_PROY).trim();
      if (proy) {
        const key = prog || '__SIN_PROGRAMA__';
        if (!map[key]) map[key] = new Set();
        map[key].add(proy);
      }
    });
    const result: Record<string, string[]> = {};
    Object.entries(map).forEach(([k, s]) => { result[k] = Array.from(s).sort(); });
    return result;
  }, [deportistas]);

  /* ── FILTROS EN CASCADA: PROGRAMA → SEDE → PROYECTO ───────────────────────
     La dirección lo pidió en ese orden (25/08/2026): primero se escoge la sede
     y el desplegable de PROYECTO queda mostrando SOLO los proyectos de esa
     sede. Antes salían todos los de la academia y tocaba adivinar cuál era de
     dónde. */
  const sedes = useMemo<string[]>(() => {
    const s = new Set<string>();
    deportistas.forEach(dep => {
      if (programaFiltro !== null && grupoDep(dep) !== programaFiltro) return;
      const v = sedeCanonica(getColVal(dep, /^sede/i));
      if (v) s.add(v);
    });
    // Se ordenan como en la lista oficial; lo que no esté ahí va al final.
    return Array.from(s).sort((a, b) => {
      const ia = SEDES_OFICIALES.indexOf(a), ib = SEDES_OFICIALES.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, 'es');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deportistas, programaFiltro]);

  /** Proyectos que se pueden escoger, según el programa y la sede elegidos. */
  const proyectosVisibles = useMemo<string[]>(() => {
    const s = new Set<string>();
    deportistas.forEach(dep => {
      if (programaFiltro !== null && grupoDep(dep) !== programaFiltro) return;
      if (sedeFiltro && sedeCanonica(getColVal(dep, /^sede/i)) !== sedeFiltro) return;
      const v = getColVal(dep, RX_PROY).trim();
      if (v) s.add(v);
    });
    // Los proyectos son casi todos números (43, 20, 48B…): se ordenan como tales.
    return Array.from(s).sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      return (!isNaN(na) && !isNaN(nb) && na !== nb) ? na - nb : a.localeCompare(b, 'es');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deportistas, programaFiltro, sedeFiltro]);

  /* Si al cambiar de programa la sede elegida ya no existe, se suelta sola.
     Igual el proyecto cuando deja de pertenecer a la sede escogida: así nunca
     queda una combinación imposible que deje la tabla vacía sin explicación. */
  useEffect(() => {
    if (sedeFiltro && !sedes.includes(sedeFiltro)) setSedeFiltro(null);
  }, [sedes, sedeFiltro]);
  useEffect(() => {
    if (proyectoFiltro && proyectoFiltro !== SIN_PROYECTO
        && !proyectosVisibles.includes(proyectoFiltro)) setProyectoFiltro(null);
  }, [proyectosVisibles, proyectoFiltro]);

  // ── Columna PROGRAMA / PROYECTO / PROFE (nombre real en el Excel) ──
  const colPrograma = useMemo(
    () => columnas.find(c => /^program/i.test(c.trim())) ?? '',
    [columnas]
  );
  const colProy = useMemo(
    () => columnas.find(c => RX_PROY.test(c.trim())) ?? '',
    [columnas]
  );
  const colProfe = useMemo(
    () => columnas.find(c => /^prof/i.test(c.trim())) ?? '',
    [columnas]
  );

  /* ── El cuadro de TORNEOS Y COMPETENCIAS ─────────────────────────────────
     De aquí salen las opciones de C1..C4. El # TOR de cada torneo es su
     posición en el cuadro (1, 2, 3…), la misma que se ve allá y la que se
     escribe en el pospartido. */
  const [cuadroTorneos, setCuadroTorneos] = useState<FilaTorneo[]>([]);
  useEffect(() => {
    getCuadro().then(c => setCuadroTorneos(c ?? [])).catch(() => {});
  }, []);

  /** Los torneos que puede escoger este deportista: los de SU programa.
   *  Si su programa no tiene torneos cargados, se muestran todos (para no
   *  dejar la casilla muerta) y así se ve que falta cargarlos. */
  const torneosDePrograma = useCallback((programa: string) => {
    const k = llavePrograma(programa);
    const conNumero = cuadroTorneos.map((f, i) => ({ f, n: i + 1 }));
    /* UN TORNEO PUEDE SER DE VARIOS PROGRAMAS (dirección, 27/08/2026).
       En Torneos y Competencias la casilla PROGRAMA ahora deja marcar más de
       uno, y queda escrito "DESARROLLO, SELECCIÓN". Entonces aquí no se puede
       comparar la casilla completa: se parte por la coma y basta con que UNO
       de ellos sea el del deportista. Sin esto, un torneo de dos programas no
       le aparecería a nadie. */
    const suyos = k
      ? conNumero.filter(({ f }) => String(f.programa ?? '')
          .split(',')
          .map(x => llavePrograma(x))
          .filter(Boolean)
          .includes(k))
      : [];
    const lista = suyos.length ? suyos : conNumero;
    return lista.map(({ f, n }) => ({
      num: String(n),
      etiqueta: etiquetaTorneo(f, n),
      nombre: nombreTorneoCorto(f),
    }));
  }, [cuadroTorneos]);

  /** El nombre del torneo número N, para el globito de ayuda de la casilla. */
  const nombreDelNumero = useCallback((num: string): string => {
    const n = parseInt(String(num ?? '').trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > cuadroTorneos.length) return '';
    return etiquetaTorneo(cuadroTorneos[n - 1], n);
  }, [cuadroTorneos]);

  // ── Mapa proyecto → formador (usuario), desde la tabla de formadores ──
  // El PROFE de un deportista se deriva del proyecto en el que está.
  const [profePorProyecto, setProfePorProyecto] = useState<Record<string, string>>({});
  /* Todos los formadores, para el desplegable de la columna PROFE
     (dirección, 25/08/2026). Antes esa columna era de solo lectura. */
  const [profesTodos, setProfesTodos] = useState<string[]>([]);
  useEffect(() => {
    getProfes().then(lista => {
      const map: Record<string, string> = {};
      lista.forEach(p => (p.proyectos ?? []).forEach(proy => {
        const k = (proy ?? '').trim();
        if (k) map[k.toUpperCase()] = p.usuario;
      }));
      setProfePorProyecto(map);
      setProfesTodos(
        Array.from(new Set(lista.map(p => String(p.usuario ?? '').trim()).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'es')),
      );
    }).catch(() => {});
  }, []);
  const profeDeProyecto = useCallback(
    (proy: string) => profePorProyecto[(proy ?? '').trim().toUpperCase()] ?? '',
    [profePorProyecto]
  );

  // ── Opciones únicas por columna select ───────────────────────
  const opcionesCol = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, Set<string>> = {};
    /* SEDE: la lista NO se saca de las fichas (ahí está escrita de mil formas),
       sino de SEDES_OFICIALES. Así el formulario ofrece siempre las mismas seis
       y se dejan de crear duplicados. — 25/08/2026 */
    const sedeCols: string[] = [];
    columnas.forEach(col => {
      if (/^sede/i.test(col.trim())) { sedeCols.push(col); return; }
      if (SELECTS_RX.some(rx => rx.test(col.trim()))) {
        map[col] = new Set<string>();
        deportistas.forEach(dep => {
          const v = (dep._columnas[col] ?? '').trim();
          if (v) map[col].add(v);
        });
        // Opciones base para PROGRAMA
        if (/^program/i.test(col.trim())) {
          ORDEN_PROGRAMA.forEach(p => map[col].add(p));
        }
        /* ESTADO: "SOLICITA RETIRO" siempre debe estar en la lista, aunque
           todavía no haya nadie en ese estado. Es el que pone el padre desde el
           módulo de Solicitud de Retiro, y administración también lo puede
           poner a mano. — 26/08/2026 */
        if (/^estado$/i.test(col.trim())) {
          map[col].add(EST_SOLICITA);
        }
      }
    });
    const result: Record<string, string[]> = {};
    Object.entries(map).forEach(([k, s]) => { result[k] = Array.from(s).sort(); });
    for (const col of sedeCols) result[col] = [...SEDES_OFICIALES];
    return result;
  }, [columnas, deportistas]);

  /* Un dato recién escrito en la tabla vive en `edits` hasta que se oprime
     ACTUALIZAR. Antes, buscar y ordenar solo miraban lo YA guardado: por eso un
     código apenas digitado (26401) no aparecía al buscarlo y la fila se iba al
     final en vez de quedar junto a los de su serie. Estas dos funciones leen
     primero lo que está en pantalla. */
  const codigoDeDep = useCallback((d: Deportista): string => {
    const e = edits[d.id];
    if (e) {
      const k = Object.keys(e).find(x => /^c[oó]d/i.test(x.trim()));
      if (k && String(e[k] ?? '').trim()) return String(e[k]);
    }
    return getColVal(d, /^c[oó]d/i);
  }, [edits]);

  const nombreDeDep = useCallback((d: Deportista): string => {
    const e = edits[d.id];
    if (e) {
      const k = Object.keys(e).find(x => /^(deportista|nombre)/i.test(x.trim()));
      if (k && String(e[k] ?? '').trim()) return String(e[k]);
    }
    return d._nombre ?? '';
  }, [edits]);

  /* BUSCAR POR TELÉFONO (26/08/2026) — si en la casilla de buscar se escriben
     7 números o más, deja de buscarse por nombre y se busca el TELÉFONO en
     TODAS las casillas de la ficha: celular del acudiente, teléfono, WhatsApp,
     donde sea que esté escrito.
     Se compara solo con los dígitos y por el final, así que da lo mismo que
     esté guardado como "300 307 7133", "3003077133" o "+57 3003077133". */
  const soloDigitos = (v: any) => String(v ?? '').replace(/\D/g, '');

  const tieneTelefono = useCallback((d: Deportista, num: string): boolean => {
    for (const val of Object.values(d._columnas ?? {})) {
      const v = soloDigitos(val);
      if (v.length >= 7 && (v === num || v.endsWith(num) || num.endsWith(v))) return true;
    }
    return false;
  }, []);

  /* ¿Lo que hay escrito en la casilla de buscar es un TELÉFONO?
     Se calcula aparte porque lo necesitan dos cosas: el filtro de abajo y,
     sobre todo, listaPlana — que tiene que saber que hay una búsqueda de
     teléfono en curso para hacerse a un lado con los filtros. */
  const busquedaTelefono = useMemo(() => {
    const dig = soloDigitos(buscar);
    const esTel = dig.length >= 7 && dig.length === buscar.replace(/[\s()+.-]/g, '').length;
    return esTel ? dig : '';
  }, [buscar]);

  // ── Filtro + sort ────────────────────────────────────────────
  const ordenados = useMemo(() => {
    const q    = buscar.trim().toLowerCase();
    const qCod = buscarCod.trim().toLowerCase();
    const qTel = busquedaTelefono;
    const esTel = !!qTel;

    const lista = deportistas.filter(d => {
      if (q) {
        if (esTel) { if (!tieneTelefono(d, qTel)) return false; }
        else if (!nombreDeDep(d).toLowerCase().includes(q)) return false;
      }
      if (qCod) {
        const cod = codigoDeDep(d).toLowerCase();
        if (!cod.includes(qCod)) return false;
      }
      return true;
    });

    return lista.sort(cmpDeportistasCon(codigoDeDep, nombreDeDep));
  }, [deportistas, buscar, buscarCod, codigoDeDep, nombreDeDep, tieneTelefono]);

  /* N° DE FILA FIJO: se calcula sobre el listado COMPLETO, no sobre lo que quedó
     después de buscar o filtrar. Así, al buscar un código, la fila conserva el
     mismo número que tiene en la lista completa y se sabe dónde está parado. */
  const numFilaGlobal = useMemo(() => {
    const m: Record<string, number> = {};
    deportistas.slice().sort(cmpDeportistasCon(codigoDeDep, nombreDeDep))
      .forEach((d, i) => { m[d.id] = i + 1; });
    return m;
  }, [deportistas, codigoDeDep, nombreDeDep]);

  // ── Grupos ───────────────────────────────────────────────────
  const grupos = useMemo(() => {
    const map = new Map<string, Deportista[]>();
    ordenados.forEach(d => {
      const g = grupoDep(d);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(d);
    });
    const claves = [...map.keys()].sort((a, b) => {
      if (a === '__RETIRADO__') return 1;  if (b === '__RETIRADO__') return -1;
      if (a === '__SIN_PROGRAMA__') return 1; if (b === '__SIN_PROGRAMA__') return -1;
      return ordenPrograma(a) - ordenPrograma(b);
    });
    return claves.map(k => ({ key: k, lista: map.get(k)! }));
  }, [ordenados]);

  // ── Edición ──────────────────────────────────────────────────
  const setCelda = useCallback((depId: string, col: string, val: string) => {
    setEdits(prev => ({
      ...prev,
      [depId]: { ...(prev[depId] ?? {}), [col]: val },
    }));
    setGuardado(false);
  }, []);

  // Índice de nombres de columna NORMALIZADOS por deportista → nombre real de la llave.
  // Permite mostrar el dato aunque haya entrado con otro nombre (Excel vs app).
  const idxNorm = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    deportistas.forEach(d => {
      const nk: Record<string, string> = {};
      Object.keys(d._columnas ?? {}).forEach(k => {
        const n = claveCanonica(k);
        if (n && !(n in nk)) nk[n] = k;   // el primero que aparezca gana
      });
      m.set(d.id, nk);
    });
    return m;
  }, [deportistas]);

  function getValCelda(dep: Deportista, col: string): string {
    const e = edits[dep.id]?.[col];
    if (e !== undefined) return e;
    const cols = dep._columnas ?? {};
    const directo = cols[col];
    if (directo !== undefined && String(directo).trim() !== '') return directo;
    // Respaldo: si la casilla exacta está vacía, buscar el mismo dato bajo un
    // nombre equivalente (sin tildes, sin "(CM)", parentezco/parentesco…).
    const realKey = idxNorm.get(dep.id)?.[claveCanonica(col)];
    if (realKey && realKey !== col) {
      const v = cols[realKey];
      if (v !== undefined && String(v).trim() !== '') return v;
    }
    return directo ?? '';
  }

  const pendingCount = useMemo(
    () => Object.values(edits).reduce((s, d) => s + Object.keys(d).length, 0),
    [edits]
  );

  /* ── LA TABLA SE PINTA POR TANDAS ─────────────────────────────────────────
     Antes se dibujaban de un golpe las 1.167 filas, cada una con 17 casillas y
     varias listas desplegables adentro: más de veinte mil elementos en la
     pantalla. Por eso el computador se ponía pesado y el clic tardaba en
     responder, aunque los datos ya hubieran llegado.

     Ahora se dibujan de a 80 y van apareciendo solas al ir bajando. El buscador
     y los filtros siguen mirando la lista COMPLETA, así que buscar un código
     sigue funcionando igual aunque su fila todavía no esté dibujada.
     — 25/08/2026 */
  const TANDA = 80;
  const listaPlana = useMemo(() => ordenados.filter(d => {
    /* Buscando un TELÉFONO se ignoran los filtros de programa, sede, proyecto
       y año (26/08/2026). Un teléfono señala a UNA familia: si además hubiera
       que acertarle al programa y a la sede donde está, la búsqueda no serviría
       de nada — que fue justo lo que pasó la primera vez. */
    if (busquedaTelefono) return true;
    if (programaFiltro !== null && grupoDep(d) !== programaFiltro) return false;
    if (proyectoFiltro) {
      const suyo = getColVal(d, RX_PROY).trim();
      if (proyectoFiltro === SIN_PROYECTO) { if (suyo) return false; }
      else if (suyo !== proyectoFiltro) return false;
    }
    if (sedeFiltro && sedeCanonica(getColVal(d, /^sede/i)) !== sedeFiltro) return false;
    if (anioFiltro && getColVal(d, /^a[ñn]o$/i).trim() !== anioFiltro) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ordenados, programaFiltro, proyectoFiltro, sedeFiltro, anioFiltro, edits, busquedaTelefono]);

  /* ═══════════════════════════════════════════════════════════════════════
     CARGARLE EL TORNEO A TODO EL GRUPO  (dirección, 27/08/2026)

     Estando parado en un grupo —por ejemplo DESARROLLO, proyecto SUB 10A— casi
     siempre el torneo que se le pone a uno se lo juegan TODOS. Ponerlo de a uno
     en 25 fichas era el trabajo más largo y donde más se saltaba gente.

     Ahora, apenas se escoge un torneo en C1..C4, la pantalla pregunta si se le
     carga a todo el grupo que está en pantalla. El grupo es EXACTAMENTE lo que
     dicen los filtros de arriba (programa, sede, proyecto, año): lo que se ve
     es lo que se carga, ni uno más.

     Tres reglas para no dañar nada:
       · Al que YA lo tenga puesto —en la casilla que sea— no se le toca.
       · No se pisa una casilla ocupada: se busca la primera libre (C1, C2,
         C3, C4). Si las cuatro están llenas, ese queda por fuera y se avisa.
       · Al que sea de otro programa (y ese torneo no le corresponda) no se le
         pone. Puede pasar cuando el filtro trae mezclado.

     Nada de esto se manda solo a la base: queda como cambio pendiente y se
     guarda con el botón GUARDAR de siempre, igual que si se hubiera puesto a
     mano. Así se alcanza a revisar antes. */
  const [pedirGrupo, setPedirGrupo] = useState<
    { col: string; num: string; nComp: number; quien: string; quitar?: boolean;
      depId: string; antes: string } | null
  >(null);
  const [resumenGrupo, setResumenGrupo] = useState('');
  /* Lo que tocó la última carga al grupo, para poder DESHACERLA de un botón.
     Guarda el valor que tenía cada casilla antes, no solo cuáles cambió. */
  const [deshacerGrupo, setDeshacerGrupo] = useState<
    { depId: string; col: string; antes: string }[] | null
  >(null);

  function deshacerCargaGrupo() {
    const pasos = deshacerGrupo;
    if (!pasos?.length) return;
    setEdits(prev => {
      const n = { ...prev };
      pasos.forEach(({ depId, col, antes }) => {
        n[depId] = { ...(n[depId] ?? {}), [col]: antes };
      });
      return n;
    });
    setDeshacerGrupo(null);
    setResumenGrupo('Se deshizo la última carga al grupo.');
  }

  /** Cómo se llama el grupo que está en pantalla, para decirlo en el aviso. */
  const nombreDelGrupo = useMemo(() => {
    const partes = [
      programaFiltro ?? '',
      sedeFiltro ?? '',
      proyectoFiltro ?? '',
      anioFiltro ? `año ${anioFiltro}` : '',
    ].map(x => String(x).trim()).filter(Boolean);
    return partes.length ? partes.join(' · ') : 'la lista que está en pantalla';
  }, [programaFiltro, sedeFiltro, proyectoFiltro, anioFiltro]);

  function cargarTorneoAlGrupo(colElegida: string, num: string) {
    /* SE ESCRIBE ÚNICAMENTE EN LA COLUMNA QUE SE ESCOGIÓ (corrección del
       27/08/2026). Antes, si a alguien esa casilla le quedaba ocupada, el
       programa se pasaba a la siguiente libre "para no perder el dato" — y el
       resultado fue que pidiendo C2 se llenó C1. Un ayudante que escribe donde
       no se le dijo hace más daño que uno que avisa: ahora, al que tenga esa
       casilla ocupada se le deja quieto y se dice cuántos fueron. */
    const cComp = numCompetencia(colElegida);
    const colsComp = columnas.filter(c => numCompetencia(c) > 0);

    const pasos: { depId: string; col: string; antes: string }[] = [];
    let puestos = 0, yaLoTenian = 0, ocupada = 0, otroPrograma = 0;

    listaPlana.forEach(d => {
      /* Ya lo tiene puesto en cualquiera de las cuatro: no se repite. */
      if (colsComp.some(c => getValCelda(d, c).trim() === num)) { yaLoTenian++; return; }
      const prog = getValCelda(d, colPrograma).trim();
      if (!torneosDePrograma(prog).some(t => t.num === num)) { otroPrograma++; return; }
      const actual = getValCelda(d, colElegida).trim();
      if (actual) { ocupada++; return; }          // hay otro torneo ahí: no se pisa
      pasos.push({ depId: d.id, col: colElegida, antes: '' });
      puestos++;
    });

    if (puestos > 0) {
      setEdits(prev => {
        const n = { ...prev };
        pasos.forEach(({ depId, col }) => { n[depId] = { ...(n[depId] ?? {}), [col]: num }; });
        return n;
      });
      setGuardado(false);
      setDeshacerGrupo(pasos);
    } else {
      setDeshacerGrupo(null);
    }

    const trozos = [`se le puso a ${puestos} en C${cComp}`];
    if (yaLoTenian)   trozos.push(`${yaLoTenian} ya lo tenían`);
    if (ocupada)      trozos.push(`${ocupada} con C${cComp} ocupada (no se pisó)`);
    if (otroPrograma) trozos.push(`${otroPrograma} de otro programa`);
    setResumenGrupo(
      `${nombreDelNumero(num) || `Torneo ${num}`} · ${trozos.join(' · ')}. ` +
      (puestos > 0 ? 'Falta oprimir GUARDAR.' : 'No hubo nada que cambiar.'),
    );
  }

  /** Quitarle a todo el grupo el torneo que estaba en esa misma casilla.
   *  Solo se borra donde esté EXACTAMENTE ese torneo, en esa misma columna:
   *  así una equivocación se deshace sin tocar lo de nadie más. */
  function quitarTorneoDelGrupo(colElegida: string, num: string) {
    const cComp = numCompetencia(colElegida);
    const pasos: { depId: string; col: string; antes: string }[] = [];
    listaPlana.forEach(d => {
      if (getValCelda(d, colElegida).trim() !== num) return;
      pasos.push({ depId: d.id, col: colElegida, antes: num });
    });
    if (pasos.length) {
      setEdits(prev => {
        const n = { ...prev };
        pasos.forEach(({ depId, col }) => { n[depId] = { ...(n[depId] ?? {}), [col]: '' }; });
        return n;
      });
      setGuardado(false);
      setDeshacerGrupo(pasos);
    } else {
      setDeshacerGrupo(null);
    }
    setResumenGrupo(
      `${nombreDelNumero(num) || `Torneo ${num}`} · se le quitó a ${pasos.length} en C${cComp}. ` +
      (pasos.length ? 'Falta oprimir GUARDAR.' : 'No hubo nada que quitar.'),
    );
  }

  const [visibles, setVisibles] = useState(TANDA);
  const finTablaRef = useRef<HTMLTableRowElement>(null);

  // Al buscar o filtrar se vuelve a empezar por arriba.
  useEffect(() => { setVisibles(TANDA); }, [buscar, buscarCod, programaFiltro, proyectoFiltro, sedeFiltro, anioFiltro]);

  // Cuando la última fila dibujada asoma en pantalla, se dibuja la tanda siguiente.
  useEffect(() => {
    const nodo = finTablaRef.current;
    if (!nodo || visibles >= listaPlana.length) return;
    const obs = new IntersectionObserver(entradas => {
      if (entradas.some(e => e.isIntersecting)) {
        setVisibles(v => Math.min(v + TANDA, listaPlana.length));
      }
    }, { rootMargin: '600px' });
    obs.observe(nodo);
    return () => obs.disconnect();
  }, [visibles, listaPlana.length]);

  // Deportista que se está eliminando (para no repetir el clic)
  const [borrandoDep, setBorrandoDep] = useState<string | null>(null);

  /** Elimina un deportista de la base. Muestra TODO lo que se va a borrar antes
   *  de tocar nada; el borrado no se puede deshacer desde la pantalla. */
  async function eliminarFilaDeportista(dep: Deportista, nFila: number) {
    if (borrandoDep) return;
    const cod    = getColVal(dep, /^c[oó]d/i).trim();
    const prog   = getColVal(dep, /^program/i).trim();
    const fechaA = serialAFecha(getColVal(dep, /fecha.*afil|afil.*fecha/i));
    const aviso =
      'ELIMINAR DEPORTISTA\n\n' +
      `   Fila:      N° ${nFila}\n` +
      `   Nombre:    ${dep._nombre || '— sin nombre —'}\n` +
      `   Código:    ${cod || '— sin código —'}\n` +
      `   Programa:  ${prog || '— sin programa —'}\n` +
      `   Afiliado:  ${fechaA || '— sin fecha —'}\n\n` +
      'Se borra la ficha de la base de datos y NO se puede deshacer desde aquí.\n' +
      'Sus pagos, asistencias y documentos no se borran: quedan sin dueño.\n\n' +
      '¿Eliminar esta ficha?';
    if (!window.confirm(aviso)) return;

    setBorrandoDep(dep.id);
    const ok = await eliminarDeportista(dep.id);
    if (ok) {
      setDeportistas(prev => prev.filter(d => d.id !== dep.id));
      setEdits(prev => { const n = { ...prev }; delete n[dep.id]; return n; });
    } else {
      window.alert('No se pudo eliminar. Revisa la conexión e inténtalo de nuevo.');
    }
    setBorrandoDep(null);
  }

  /* Los cambios escritos en la tabla viven solo en la memoria del navegador hasta
     que se oprime ACTUALIZAR. Si se recarga o se cierra la pestaña ANTES, se
     pierden sin avisar. Este aviso obliga a confirmar la salida. */
  useEffect(() => {
    if (!pendingCount) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendingCount]);

  // ── ACTUALIZAR: guarda TODO ───────────────────────────────────
  function actualizarTodo() {
    const nueva = deportistas.map(d => {
      if (!edits[d.id]) return d;
      // El nombre del deportista se guarda aparte (no es una columna del Excel) y en MAYÚSCULA
      const { __NOMBRE__, ...cols } = edits[d.id];
      const actualizado = { ...d, _columnas: { ...d._columnas, ...cols } };
      if (__NOMBRE__ !== undefined) actualizado._nombre = __NOMBRE__.toUpperCase();
      return actualizado;
    });
    saveDeportistas(nueva);
    setDeportistas(nueva);
    setEdits({});
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  }

  // ── Mostrar valor de celda con conversión de fecha ───────────
  function mostrarValor(col: string, rawVal: string): string {
    if (esFechaAfil(col)) return serialAFecha(rawVal);
    return rawVal || '—';
  }

  // ── Procesar Excel de Nuevos Deportistas ─────────────────────
  async function procesarExcelNuevos(file: File) {
    setNuevosProc(true);
    try {
      const XLSX   = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array' });
      const hoja   = wb.Sheets[wb.SheetNames[0]];
      const filas: Record<string,string>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      if (!filas.length) { alert('El archivo está vacío.'); setNuevosProc(false); return; }

      // ── Normalización: mapea encabezados del Excel a las claves exactas
      //    del consolidado (elimina tildes, mayúsculas, espacios para comparar)
      const sinTildes = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

      // Columnas de referencia (el deportista con más columnas)
      const refDep = deportistas.reduce(
        (best, d) => Object.keys(d._columnas ?? {}).length > Object.keys(best._columnas ?? {}).length ? d : best,
        deportistas[0] ?? { _columnas: {} } as Deportista
      );
      const existingKeys = Object.keys(refDep._columnas ?? {});
      // mapa: clave_normalizada → clave_original del consolidado
      const normMap = new Map<string, string>();
      existingKeys.forEach(k => normMap.set(sinTildes(k), k));

      function mapKey(excelKey: string): string {
        // 1) coincidencia exacta
        if (existingKeys.includes(excelKey)) return excelKey;
        // 2) coincidencia normalizada (sin tildes, sin distinción mayúsc.)
        return normMap.get(sinTildes(excelKey)) ?? excelKey;
      }

      // Clave de nombre real en el consolidado
      // EXCLUYE columnas COD-prefijo (ej: "COD. DEPORTISTA") que contienen el código
      const existingNomKey = existingKeys.find(k => {
        const t = k.trim();
        if (/^c[oó]d/i.test(t)) return false;
        return /deportista|alumno|jugador|atleta|^nombre/i.test(t);
      }) ?? '';

      // Índice de códigos y nombres existentes para detectar duplicados
      const codsExist  = new Set(deportistas.map(d => getColVal(d, /^c[oó]d/i).trim().toLowerCase()).filter(Boolean));
      const nomesExist = new Set(deportistas.map(d => d._nombre.trim().toLowerCase()).filter(Boolean));

      const RX_NOM = /deportista|alumno|jugador|atleta|^nombre/i;
      const RX_COD = /^c[oó]d/i;

      const parsed: NuevoReg[] = filas
        .filter(fila => Object.values(fila).some(v => String(v ?? '').trim()))
        .map(fila => {
          // Reescribir claves del Excel → claves del consolidado
          const cols: Record<string,string> = {};
          Object.entries(fila).forEach(([k, v]) => {
            cols[mapKey(k)] = String(v ?? '').trim();
          });

          // Extraer nombre: buscar la clave de nombre del consolidado, o por regex
          // EXCLUYE columnas COD-prefijo (no deben usarse como nombre)
          const kNom = existingNomKey && cols[existingNomKey] && !/^\d+$/.test(cols[existingNomKey])
            ? existingNomKey
            : (Object.keys(cols).find(k => {
                const t = k.trim();
                if (RX_COD.test(t)) return false;   // excluir COD..., CÓDIGO...
                return RX_NOM.test(t);
              }) ?? '');
          // Evitar que un código numérico puro se convierta en nombre
          const rawNom = kNom ? cols[kNom] : '';
          const nombre = (rawNom && !/^\d+$/.test(rawNom))
            ? rawNom
            : (Object.values(cols).find(v => v && !/^\d{3,6}$/.test(v) && v.length > 3) ?? '');

          // Detectar duplicado por código o nombre
          const kCod = Object.keys(cols).find(k => RX_COD.test(k.trim())) ?? '';
          const cod  = kCod ? cols[kCod].toLowerCase() : '';
          const duplicado = (cod && codsExist.has(cod)) || nomesExist.has(nombre.trim().toLowerCase());

          return { _nombre: nombre.trim(), _columnas: cols, duplicado };
        })
        .filter(r => r._nombre);

      setNuevosFilas(parsed);
      setNuevosPaso('preview');
    } catch(e) {
      alert('Error al leer el archivo: ' + String(e));
    }
    setNuevosProc(false);
  }

  async function confirmarNuevos() {
    const nuevos = nuevosFilas.filter(r => !r.duplicado);
    if (!nuevos.length) { setNuevosPaso('listo'); return; }

    const ahora = Date.now();
    const deportsNuevos = nuevos.map((r, i): Deportista => ({
      id:        `nuevo_${ahora}_${i}`,
      nombre:    r._nombre,
      _nombre:   r._nombre,
      _columnas: r._columnas,
    }));

    const idsLote = deportsNuevos.map(d => d.id);
    const lista = [...deportistas, ...deportsNuevos];
    await saveDeportistas(lista);
    setDeportistas(lista);
    setUltimoLote(idsLote);
    try { localStorage.setItem('futuro_ultimo_lote', JSON.stringify(idsLote)); } catch {}
    setNuevosPaso('listo');
  }

  async function eliminarUltimoLote() {
    if (!ultimoLote.length) return;
    const nombres = deportistas.filter(d => ultimoLote.includes(d.id)).map(d => d._nombre);
    if (!confirm(`¿Eliminar los ${ultimoLote.length} deportistas del último lote subido?\n\n${nombres.slice(0,5).join('\n')}${nombres.length > 5 ? `\n…y ${nombres.length - 5} más` : ''}`)) return;
    const lista = deportistas.filter(d => !ultimoLote.includes(d.id));
    await saveDeportistas(lista);
    setDeportistas(lista);
    setUltimoLote([]);
    try { localStorage.removeItem('futuro_ultimo_lote'); } catch {}
  }

  // ── Importar Excel de Torneos ─────────────────────────────────
  function loadXLSX(): Promise<any> {
    return new Promise((resolve, reject) => {
      const w = window as any;
      if (w.XLSX) { resolve(w.XLSX); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload  = () => resolve(w.XLSX);
      s.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
      document.head.appendChild(s);
    });
  }

  async function procesarExcelTorneo(file: File) {
    setTorneoProc(true);
    try {
      const XLSX   = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array' });
      const hoja   = wb.Sheets[wb.SheetNames[0]];
      const filas: Record<string, string>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      if (!filas.length) { alert('El archivo está vacío.'); return; }

      // Detectar columnas automáticamente
      const keys = Object.keys(filas[0]);
      const kCod    = keys.find(k => /^c[oó]d/i.test(k.trim()))   ?? keys[0] ?? '';
      const kNombre = keys.find(k => /deportista|nombre|alumno|jugador/i.test(k.trim())) ?? keys[1] ?? '';
      const kComp   = keys.find(k => /^competencia$/i.test(k.trim())) ?? '';
      const kT1     = keys.find(k => /torneo.?1|compite/i.test(k.trim())) ?? '';
      const kT2     = keys.find(k => /torneo.?2/i.test(k.trim())) ?? '';
      const kT3     = keys.find(k => /torneo.?3/i.test(k.trim())) ?? '';
      const kT4     = keys.find(k => /torneo.?4/i.test(k.trim())) ?? '';

      // Índice de deportistas por código y por nombre
      const porCod: Record<string, string>    = {};
      const porNombre: Record<string, string> = {};
      deportistas.forEach(d => {
        const cod = getColVal(d, /^c[oó]d/i).trim().toLowerCase();
        const nom = d._nombre.trim().toLowerCase();
        if (cod) porCod[cod] = d.id;
        if (nom) porNombre[nom] = d.id;
      });

      const resultado: FilaTorneo[] = filas.map(fila => {
        const codigo = String(fila[kCod]  ?? '').trim();
        const nombre = String(fila[kNombre] ?? '').trim();
        const competencia = String(fila[kComp] ?? '').trim();
        const t1     = String(fila[kT1] ?? '').trim();
        const t2     = String(fila[kT2] ?? '').trim();
        const t3     = String(fila[kT3] ?? '').trim();
        const t4     = String(fila[kT4] ?? '').trim();

        // Buscar match por código primero, luego por nombre
        let depId: string | null = null;
        let match: FilaTorneo['match'] = null;
        if (codigo && porCod[codigo.toLowerCase()]) {
          depId = porCod[codigo.toLowerCase()]; match = 'codigo';
        } else if (nombre && porNombre[nombre.toLowerCase()]) {
          depId = porNombre[nombre.toLowerCase()]; match = 'nombre';
        }
        return { codigo, nombre, competencia, t1, t2, t3, t4, depId, match };
      });

      setTorneoFilas(resultado);
      setTorneoPaso('preview');
    } catch (e: any) {
      alert('Error al leer el archivo: ' + e.message);
    } finally {
      setTorneoProc(false);
    }
  }

  function aplicarTorneos() {
    const lista = deportistas;
    const updates: Record<string, Record<string, string>> = {};

    torneoFilas.forEach(fila => {
      if (!fila.depId) return;
      const dep = lista.find(d => d.id === fila.depId);
      if (!dep) return;

      // Resolver claves reales o virtuales
      const kC  = Object.keys(dep._columnas ?? {}).find(k => /^competencia$/i.test(k)) || VTC;
      const kT1 = Object.keys(dep._columnas ?? {}).find(k => /^compite$/i.test(k))     || VT1;
      const kT2 = Object.keys(dep._columnas ?? {}).find(k => /torneo.?2/i.test(k))     || VT2;
      const kT3 = Object.keys(dep._columnas ?? {}).find(k => /torneo.?3/i.test(k))     || VT3;
      const kT4 = Object.keys(dep._columnas ?? {}).find(k => /torneo.?4/i.test(k))     || VT4;

      updates[fila.depId] = {};
      if (fila.competencia) updates[fila.depId][kC]  = fila.competencia;
      if (fila.t1)          updates[fila.depId][kT1] = fila.t1;
      if (fila.t2)          updates[fila.depId][kT2] = fila.t2;
      if (fila.t3)          updates[fila.depId][kT3] = fila.t3;
      if (fila.t4)          updates[fila.depId][kT4] = fila.t4;
    });

    const nueva = lista.map(d =>
      updates[d.id] ? { ...d, _columnas: { ...d._columnas, ...updates[d.id] } } : d
    );
    saveDeportistas(nueva);
    setDeportistas(nueva);
    setTorneoPaso('listo');
  }

  // ── Barra de desplazamiento horizontal superior (sincronizada) ──
  const mainRef   = useRef<HTMLElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const [anchoScroll,  setAnchoScroll]  = useState(0);
  const [anchoVisible, setAnchoVisible] = useState(0);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const medir = () => { setAnchoScroll(el.scrollWidth); setAnchoVisible(el.clientWidth); };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, [deportistas, colVisibles, cargando]);

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col" style={{ background: LIENZO }}>

      {/* ── HEADER ── */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-3 flex items-center gap-3 flex-shrink-0 z-30 overflow-hidden">
        {/* Patrón balones */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-vg" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
                <line x1="36" y1="28" x2="36" y2="18" stroke="white" strokeWidth="0.8"/>
                <line x1="43" y1="33" x2="52" y2="30" stroke="white" strokeWidth="0.8"/>
                <line x1="41" y1="42" x2="47" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="31" y1="42" x2="25" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="29" y1="33" x2="20" y2="30" stroke="white" strokeWidth="0.8"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-vg)"/>
          </svg>
        </div>

        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Vista General</h1>
          <p className="text-white/60 text-[11px]">
            {proyectoFiltro
              ? (proyectoFiltro === SIN_PROYECTO ? 'Proyecto: sin asignar' : `Proyecto: ${proyectoFiltro}`)
              : programaFiltro
              ? `${LABEL_GRUPO[programaFiltro] ?? programaFiltro}`
              : `${deportistas.length} deportistas · ${grupos.length} programas`}
          </p>
        </div>

        {/* Buscadores */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
            <input value={buscarCod} onChange={e => setBuscarCod(e.target.value)}
              placeholder="Buscar código…"
              className="w-36 bg-white/15 text-white placeholder-white/50 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:bg-white/25 transition" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Nombre o teléfono…"
              title="Escribe el nombre, o el número de teléfono (7 dígitos o más) para buscar por celular del acudiente."
              className="w-48 bg-white/15 text-white placeholder-white/50 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:bg-white/25 transition" />
          </div>
        </div>

        {/* Restablecer anchos — oculto en móvil */}
        {Object.keys(colWidths).length > 0 && (
          <button onClick={resetColWidths}
            className="relative hidden sm:flex text-white/60 hover:text-white text-[10px] font-semibold flex-shrink-0 px-2 py-1 rounded-lg hover:bg-white/10 transition"
            title="Restablecer anchos de columna">
            ↺ anchos
          </button>
        )}

        {/* 22/08/2026 — se retiraron de esta barra:
              · "Deshacer último": borraba de golpe el lote recién importado.
              · "Subir nuevos": la importación de Excel.
              · "Columnas": el panel para ocultar columnas.
            El código de los tres sigue en el archivo, solo sin botón. */}

        {/* Input oculto para nuevos deportistas */}
        <input ref={nuevosInputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) procesarExcelNuevos(f); e.target.value = ''; }} />

        {/* Botón importar torneos — oculto en móvil */}
        {!soloLectura && (
        <button
          onClick={() => { setModalTorneo(true); setTorneoPaso('subir'); setTorneoFilas([]); }}
          className="relative hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white/15 text-white hover:bg-white/25 transition flex-shrink-0">
          <Trophy className="w-3.5 h-3.5" />
          Torneos
        </button>
        )}

        {/* Botón ACTUALIZAR */}
        {!soloLectura && (
        <button
          onClick={actualizarTodo}
          disabled={pendingCount === 0 && !guardado}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition flex-shrink-0 ${
            guardado
              ? 'bg-[rgba(0,176,80,.20)] text-green-900'
              : pendingCount > 0
              ? 'bg-white text-[#16a34a] hover:bg-green-50 shadow-lg animate-pulse'
              : 'bg-white/20 text-white/50 cursor-default'
          }`}>
          {guardado
            ? <><CheckCircle className="w-4 h-4" /> Guardado</>
            : <><Save className="w-4 h-4" /> GUARDAR
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </>
          }
        </button>
        )}

        <div className="hidden sm:block relative text-right leading-tight ml-2 flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* ── BARRA DE FILTRO PROGRAMA + PROYECTO ── */}
      {deportistas.length > 0 && (
        <div className="flex-shrink-0 border-b shadow-sm px-4 py-3 flex flex-wrap gap-4 items-end" style={{ background: CAMPO, borderColor: BORDE }}>

          {/* Programa */}
          <div className="min-w-[180px]">
            <label className="block text-[11px] font-black text-white/55 uppercase tracking-widest mb-1">Programa</label>
            <select
              value={programaFiltro ?? ''}
              onChange={e => {
                setProgramaFiltro(e.target.value || null);
                setSedeFiltro(null);       // la cascada se reinicia: sede y luego proyecto
                setProyectoFiltro(null);
              }}
              className="w-full rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border" style={{ background: LIENZO, borderColor: BORDE }}>
              <option value="">— Todos —</option>
              {grupos.map(({ key }) => (
                <option key={key} value={key}>{LABEL_GRUPO[key] ?? key}</option>
              ))}
            </select>
          </div>

          {/* SEDE — va ANTES de Proyecto (dirección, 25/08/2026): primero se
              escoge la sede y el desplegable de Proyecto queda mostrando solo
              los proyectos de esa sede. */}
          <div className="min-w-[180px]">
            <label className="block text-[11px] font-black text-white/55 uppercase tracking-widest mb-1">Sede</label>
            <select
              value={sedeFiltro ?? ''}
              onChange={e => { setSedeFiltro(e.target.value || null); setProyectoFiltro(null); }}
              disabled={sedes.length === 0}
              className="w-full rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border disabled:opacity-50"
              style={{ background: LIENZO, borderColor: BORDE }}>
              <option value="">— Todas —</option>
              {sedes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Proyecto — solo los de la sede escogida */}
          <div className="min-w-[180px]">
            <label className="block text-[11px] font-black text-white/55 uppercase tracking-widest mb-1">
              Proyecto
              {sedeFiltro && (
                <span className="normal-case tracking-normal font-bold text-[#00B050]"> · de {sedeFiltro}</span>
              )}
            </label>
            <select
              value={proyectoFiltro ?? ''}
              onChange={e => setProyectoFiltro(e.target.value || null)}
              /* Ya no se apaga aunque no haya proyectos: la opción
                 "Sin proyecto" siempre sirve. */
              className="w-full rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border disabled:opacity-50"
              style={{ background: LIENZO, borderColor: BORDE }}>
              <option value="">— Todos —</option>
              {/* Los que tienen la casilla PROYECTO en blanco. */}
              <option value={SIN_PROYECTO}>— — — Sin proyecto — — —</option>
              {proyectosVisibles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Año de nacimiento — 2024 … 2011 */}
          <div className="min-w-[150px]">
            <label className="block text-[11px] font-black text-white/55 uppercase tracking-widest mb-1">Año de nacimiento</label>
            <select
              value={anioFiltro ?? ''}
              onChange={e => setAnioFiltro(e.target.value || null)}
              className="w-full rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border" style={{ background: LIENZO, borderColor: BORDE }}>
              <option value="">— Todos —</option>
              {ANIOS_NACIMIENTO.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* ── CUÁNTOS QUEDARON ────────────────────────────────────────────
              Al filtrar hay que poder leer de una cuántos deportistas cumplen,
              sin tener que bajar hasta el final de la tabla. Pedido de la
              dirección, 25/08/2026. */}
          {(() => {
            const n     = listaPlana.length;
            const total = deportistas.length;
            const hayFiltro = programaFiltro !== null || !!sedeFiltro || !!proyectoFiltro
                           || !!anioFiltro || !!buscar.trim() || !!buscarCod.trim();
            return (
              <div className="ml-auto self-end flex items-center gap-2 flex-shrink-0">
                {/* Aviso de búsqueda por teléfono: deja claro que está buscando
                    por número y que los demás filtros no cuentan. — 26/08/2026 */}
                {busquedaTelefono && (
                  <div className="rounded-xl px-3 py-1.5 border text-left"
                    style={{ background: LIENZO, borderColor: '#E0A33A' }}>
                    <p className="font-black text-[11px] leading-tight" style={{ color: '#E0A33A' }}>
                      📞 Buscando por teléfono
                    </p>
                    <p className="text-white/55 text-[10px] leading-tight">
                      {n === 0
                        ? 'Ninguna ficha tiene ese número'
                        : 'Se ignoran programa, sede y proyecto'}
                    </p>
                  </div>
                )}
                {hayFiltro && (
                  <button
                    onClick={() => {
                      setProgramaFiltro(null); setSedeFiltro(null); setProyectoFiltro(null);
                      setAnioFiltro(null); setBuscar(''); setBuscarCod('');
                    }}
                    title="Quitar todos los filtros"
                    className="rounded-xl px-3 py-2 text-xs font-black text-white/70 border hover:text-white transition"
                    style={{ background: LIENZO, borderColor: BORDE }}>
                    ✕ Quitar filtros
                  </button>
                )}
                <div className="rounded-xl px-4 py-2 border text-center"
                  style={{ background: hayFiltro ? VERDE : LIENZO, borderColor: hayFiltro ? VERDE : BORDE }}>
                  <p className="text-white font-black text-lg leading-none">
                    {n.toLocaleString('es-CO')}
                  </p>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                    {hayFiltro
                      ? `de ${total.toLocaleString('es-CO')} deportistas`
                      : (n === 1 ? 'deportista' : 'deportistas')}
                  </p>
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {/* ── Barra superior para desplazarse a las columnas de la derecha ── */}
      {!cargando && deportistas.length > 0 && anchoScroll > anchoVisible + 4 && (
        <div
          ref={topBarRef}
          onScroll={e => { if (mainRef.current) mainRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
          className="flex-shrink-0 overflow-x-auto overflow-y-hidden bg-[#2B3547] border-b border-[#4A5568]"
          style={{ height: 16 }}
          title="Desliza para ver más columnas →"
        >
          <div style={{ width: anchoScroll, height: 1 }} />
        </div>
      )}

      <main
        ref={mainRef}
        onScroll={e => { if (topBarRef.current) topBarRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
        className="flex-1 overflow-auto px-2 pb-3">

        {/* Buscadores móvil */}
        <div className="sm:hidden mt-2 mb-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input value={buscarCod} onChange={e => setBuscarCod(e.target.value)}
              placeholder="Código…"
              className="w-full bg-[#3C4759] border border-[#4A5568] rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
          <div className="relative flex-[2]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Deportista…"
              className="w-full bg-[#3C4759] border border-[#4A5568] rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
        </div>

        {cargando ? (
          <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm">
            <BalonCargando />
          </div>
        ) : deportistas.length === 0 ? (
          <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-16 text-center">
            <Users className="w-14 h-14 text-white/40 mx-auto mb-3" />
            <p className="text-white/40 font-semibold text-base">No hay deportistas cargados</p>
            <p className="text-white/40 text-sm mt-1">Importa el archivo Excel desde Programas y Proyectos</p>
            <button onClick={() => router.push('/alumnos/importar')}
              className="mt-5 px-5 py-2.5 text-white rounded-xl text-sm font-bold hover:bg-[#064e1e] transition">
              Ir a importar
            </button>
          </div>
        ) : (

          <div className="rounded-2xl shadow-sm border overflow-hidden" style={{ background: LIENZO, borderColor: BORDE }}>
            {/* Barra de desplazamiento: la tabla es más ancha que la pantalla,
                así que su contenedor debe poder rodar en los dos sentidos.
                La barra se pinta clara para que se vea sobre el fondo oscuro. */}
            <style>{`
              .tabla-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
              .tabla-scroll::-webkit-scrollbar-track { background: #2B3547; }
              .tabla-scroll::-webkit-scrollbar-thumb {
                background: #717985; border-radius: 8px; border: 3px solid #2B3547;
              }
              .tabla-scroll::-webkit-scrollbar-thumb:hover { background: #8D96A3; }
              .tabla-scroll::-webkit-scrollbar-corner { background: #2B3547; }
              .tabla-scroll { scrollbar-color: #717985 #2B3547; scrollbar-width: thin; }

              /* ── LISTAS DESPLEGABLES ──────────────────────────────────────
                 Las casillas de la tabla llevan la letra BLANCA sobre el fondo
                 oscuro, pero la lista que abre el navegador se pinta sobre
                 fondo BLANCO. Resultado: al desplegar ESTADO para retirar a un
                 deportista, las opciones salían blancas sobre blanco y no se
                 veía nada (solo la que estaba resaltada en azul).
                 Aquí se le pone letra oscura a las opciones. Se hace en la
                 lista y no en la casilla para que en la tabla se siga viendo
                 blanca. — 25/08/2026 */
              .tabla-scroll select option,
              .tabla-scroll select optgroup { color: #111827; background-color: #ffffff; }

              /* ── CONTORNO BLANCO EN TODAS LAS CASILLAS ────────────────────
                 El cuadro venía con "border-collapse: collapse". Con ese modo
                 las casillas COMPARTEN la línea, y las columnas congeladas
                 (N°, CÓDIGO, DEPORTISTA) PIERDEN su contorno al desplazar:
                 por eso se veían celdas sin marco blanco, sobre todo a la
                 izquierda y en las últimas filas.
                 Se pasa a "separate" con separación 0: así CADA casilla dibuja
                 su propio marco, sin depender de la vecina.
                 Para que la línea quede DELGADA (dirección, 26/08/2026) cada
                 casilla pinta solo su lado DERECHO y su lado de ABAJO: la línea
                 de la izquierda se la presta la casilla anterior y la de arriba
                 la de la fila anterior. Así nunca se suman dos líneas y toda la
                 rejilla queda pareja en 1px. Los bordes del comienzo (primera
                 columna y primera fila) se agregan aparte, para que el cuadro
                 quede cerrado por los cuatro costados. */
              .tabla-max10 { border-collapse: separate !important; border-spacing: 0 !important; }
              .tabla-max10 th,
              .tabla-max10 td {
                border: 0 !important;
                border-right: 1px solid #ffffff !important;
                border-bottom: 1px solid #ffffff !important;
              }
              /* Cierre del cuadro: raya izquierda de la primera columna
                 y raya de arriba de la fila del encabezado. */
              .tabla-max10 tr > *:first-child { border-left: 1px solid #ffffff !important; }
              .tabla-max10 thead tr:first-child > * { border-top: 1px solid #ffffff !important; }

              /* ── LA COLUMNA FIJADA ────────────────────────────────────────
                 Cuando hay una fijada, se va de PRIMERA entre las columnas de
                 datos, así que en cada renglón es la segunda casilla (la
                 primera es el N°). Se clava a 36 px, que es justo lo que mide
                 el N°, y lleva la raya ámbar que marca dónde termina lo que
                 está quieto. El color de fondo solo entra si la casilla no
                 trae el suyo: las que ya tienen color siguen igual.
                 — dirección, 27/08/2026 */
              .tabla-max10.hay-fija tbody tr > td:nth-child(2) {
                position: sticky !important;
                left: 36px !important;
                z-index: 12 !important;
                background-color: #2B3547;
                box-shadow: 3px 0 0 0 #E0A33A;
              }
              .tabla-max10.hay-fija thead tr > th:nth-child(2) { z-index: 32 !important; }
            `}</style>
            {/* La columna que está fijada, con su botón para soltarla. */}
            {colFijada && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2 w-fit"
                style={{ background: 'rgba(224,163,58,.14)', border: '1px solid #E0A33A' }}>
                <span className="text-[13px] leading-none">📌</span>
                <span className="text-white text-[12px] font-bold">
                  Columna fija: <b>{labelCol(colFijada)}</b>
                </span>
                <button onClick={() => setColFijada(null)}
                  title="Soltarla y devolverla a su lugar"
                  className="rounded-lg px-2.5 py-1 text-[11px] font-black text-white transition hover:opacity-90"
                  style={{ background: '#E0A33A' }}>
                  ✕ SOLTAR
                </button>
              </div>
            )}

            {/* Cómo se acomoda el cuadro. Se dice una sola vez, en chiquito.
                — dirección, 27/08/2026 */}
            <p className="text-white/35 text-[11px] mb-1.5 px-1">
              Arrastra el <span className="text-white/60 font-bold">título</span> de una columna para
              moverla de lugar, o su <span className="text-white/60 font-bold">borde derecho</span> para
              hacerla más ancha, o el <span className="text-white/60 font-bold">alfiler</span> para
              dejarla fija al frente mientras corres el cuadro.
              El orden y el ancho quedan guardados solo en este computador; lo fijado es solo para el rato.
              {ordenCols?.length ? (
                <>
                  {' · '}
                  <button onClick={volverAlOrdenDeSiempre}
                    className="underline underline-offset-2 font-bold hover:text-white transition"
                    style={{ color: '#E0A33A' }}>
                    Volver al orden de siempre
                  </button>
                </>
              ) : null}
            </p>

            <div className="overflow-auto tabla-scroll" style={{ maxHeight: 'calc(100vh - 210px)' }}>
              <table className={`tabla-max10 text-xs ${colFijada ? 'hay-fija' : ''}`}
                style={{ width: 'max-content', tableLayout: 'fixed' }}>

                {/* ── COLGROUP para anchos ── */}
                {/* ── COLGROUP: UNA RAYA POR CADA COLUMNA, SIN SALTARSE NINGUNA ──
                    ESTO ERA UN ERROR (corregido el 27/08/2026) y explica algo que
                    se veía rarísimo: al estirar C2 la que crecía era C1.

                    ¿Por qué? Porque la columna DEPORTISTA se dibuja aparte,
                    pegada después de CÓDIGO, y aquí NO se le estaba dando su
                    propia raya de ancho. El navegador reparte estas rayas de a
                    una por columna, en orden; al faltar una, todas las de
                    después quedaban corridas un puesto: el ancho de C2 se lo
                    llevaba C1, el de C3 se lo llevaba C2, y así.

                    Con la raya de DEPORTISTA en su sitio, cada columna vuelve a
                    recibir el ancho que le toca. */}
                <colgroup>
                  <col style={{ width: 36 }} />
                  {colOrdenadas.map(col => (
                    <Fragment key={col}>
                      <col style={{ width: colWidths[col] ?? (esCodigo(col) ? 130 : esFechaAfil(col) ? 100 : esTipoAfil(col) ? 95 : 110) }} />
                      {esCodigo(col) && <col style={{ width: colWidths['__NOMBRE__'] ?? 180 }} />}
                    </Fragment>
                  ))}
                </colgroup>

                {/* ── CABECERA ── */}
                <thead className="sticky top-0 z-20">
                  <tr className="text-white" style={{ background: VERDE }}>
                    {/* N° fijo */}
                    <th className="px-2 py-2.5 text-center font-black text-[10px] whitespace-nowrap sticky left-0 z-30" style={{ border: '2px solid #ffffff', color: 'white', background: VERDE }}>
                      N°
                    </th>
                    {colOrdenadas.map((col, iCol) => {
                      const esCod = esCodigo(col);
                      /* Las cuatro competencias llevan encabezado naranja. */
                      const fondoTh = numCompetencia(col) ? NARANJA_COMP : '#00B050';
                      /* El CÓDIGO no se mueve: lleva pegado el nombre del
                         deportista y los dos van clavados a la izquierda.
                         — dirección, 27/08/2026 */
                      const seMueve = !esCod;
                      return (
                        <>
                        <th key={col}
                          draggable={seMueve}
                          onDragStart={() => { if (seMueve) setColArrastrada(iCol); }}
                          onDragOver={e => { if (!seMueve || colArrastrada === null) return; e.preventDefault(); setColEncima(iCol); }}
                          onDragLeave={() => setColEncima(v => (v === iCol ? null : v))}
                          onDrop={e => { if (!seMueve) return; e.preventDefault(); soltarColumnaEn(iCol); }}
                          onDragEnd={() => { setColArrastrada(null); setColEncima(null); }}
                          title={seMueve
                            ? 'Arrastra este título para mover la columna de lugar · su borde derecho cambia el ancho'
                            : 'Esta columna no se mueve: lleva pegado el nombre del deportista'}
                          style={{
                            border: '2px solid #ffffff', background: fondoTh, color: 'white',
                            outline: colEncima === iCol ? '2px dashed #ffffff' : undefined,
                            outlineOffset: -3,
                            opacity: colArrastrada === iCol ? 0.5 : 1,
                            /* Clavada a la izquierda: la fijada detrás del N°,
                               y el CÓDIGO detrás de ella. */
                            left: col === colFijada ? izqFijada : esCod ? izqCodigo : undefined,
                            /* La raya ámbar marca dónde termina lo que está
                               quieto: de ahí para allá todo pasa por debajo. */
                            boxShadow: col === colFijada ? `3px 0 0 0 ${'#E0A33A'}` : undefined,
                          }}
                          className={`relative px-2 py-2.5 text-center font-black text-[10px] whitespace-nowrap select-none ${
                            seMueve ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${(esCod || col === colFijada) ? 'sticky z-30' : ''}`}>
                          <span className={`inline-flex items-center gap-1.5 ${resizingActive === col ? 'opacity-60' : ''}`}>
                            <span className="pointer-events-none">{labelCol(col)}</span>
                            {/* EL ALFILER — fija esta columna al frente, o la
                                suelta. No va en el CÓDIGO, que ya está clavado
                                con el nombre pegado. — dirección, 27/08/2026 */}
                            {!esCod && (
                              <button
                                type="button"
                                draggable={false}
                                onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation();
                                  setColFijada(v => (v === col ? null : col));
                                }}
                                title={col === colFijada
                                  ? 'Soltar esta columna'
                                  : 'Fijar esta columna al frente mientras corres el cuadro'}
                                className="leading-none px-0.5 transition"
                                style={{ opacity: col === colFijada ? 1 : 0.55 }}>
                                {col === colFijada ? '📌' : '📍'}
                              </button>
                            )}
                          </span>
                          {/* Handle de resize — no arrastra la columna, solo la
                              estira: por eso corta el arrastre. */}
                          <div
                            draggable={false}
                            onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                            onMouseDown={e => { e.stopPropagation(); onResizeStart(col, e); }}
                            className="absolute right-0 top-0 h-full w-4 cursor-col-resize group/handle z-10 flex items-center justify-end"
                            title="⟺ Arrastrar para ajustar ancho · Doble clic para restablecer">
                            <div className={`w-[3px] rounded-full transition-all duration-150 ${
                              resizingActive === col
                                ? 'bg-white h-full shadow-lg shadow-white/50'
                                : 'bg-white/25 h-1/2 group-hover/handle:bg-white group-hover/handle:h-full'
                            }`} />
                          </div>
                        </th>
                        {/* Columna fija DEPORTISTA justo después de CÓDIGO */}
                        {esCod && (
                          <th key="__nombre_th__"
                            style={{ border: '2px solid #ffffff', background: '#00B050', color: 'white',
                                     minWidth: 180, left: izqNombre }}
                            className="px-3 py-2.5 text-left font-black text-[10px] whitespace-nowrap sticky z-30">
                            DEPORTISTA
                          </th>
                        )}
                        </>
                      );
                    })}
                  </tr>
                </thead>

                {/* ── BODY PLANO — orden global por código ── */}
                <tbody>
                  {(() => {
                    return listaPlana.slice(0, visibles).map((dep, rowIdx) => {
                        const rowNum   = numFilaGlobal[dep.id] ?? (rowIdx + 1);
                        const retirado = esRetirado(dep);
                        const inactivo = retirado || esPausado(dep);
                        /* EN ESTUDIO: el padre pidió el retiro y se están
                           coordinando los pagos. Sigue activo, pero la fila va
                           en ámbar oscuro para que salte a la vista. */
                        const enEstudio = pidioRetiro(dep);
                        const rowBg    = inactivo ? GRIS_VACIO : enEstudio ? '#4E4231' : PANEL;
                        const stickyBg = rowBg;
                        return (
                          <tr key={dep.id}
                            style={{ backgroundColor: rowBg }}
                            className="hover:brightness-95 transition-all">

                            {/* N° */}
                            <td className="px-1 py-0 text-center text-white font-semibold sticky left-0 z-10 text-[10px] w-[36px] group"
                              style={{ backgroundColor: stickyBg, border: '2px solid #ffffff' }}>
                              <span className="group-hover:hidden">{rowNum}</span>
                              {/* Papelera: aparece solo al pasar el mouse sobre el N° */}
                              <button
                                onClick={() => eliminarFilaDeportista(dep, rowNum)}
                                disabled={borrandoDep === dep.id}
                                title={`Eliminar la ficha de ${dep._nombre || 'este deportista'}`}
                                className="hidden group-hover:inline-flex items-center justify-center text-red-500 hover:text-[#F08A87] disabled:opacity-40">
                                {borrandoDep === dep.id
                                  ? <span className="text-[9px] font-black">…</span>
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </td>

                            {/* Columnas dinámicas — en el mismo orden que el
                                encabezado, con la fijada de primera. */}
                            {colOrdenadas.map(col => {
                              const rawVal   = getValCelda(dep, col);
                              const esCod    = esCodigo(col);
                              const esFecha  = esFechaAfil(col);
                              const opciones = opcionesCol[col];
                              const changed  = edits[dep.id]?.[col] !== undefined;

                              /* VALOR MENSUALIDAD — sale del programa y la sede, pero
                                 desde el 25/08/2026 se puede escoger a mano de la
                                 lista (138.000 / 115.000 / 80.000 / 70.000) o
                                 escribir otra cifra. "— Auto —" la vuelve a calcular. */
                              if (col === VMEN) {
                                const becado   = esBecadoDep(dep);
                                const kCuota   = claveCuotaManual(dep);
                                const manualN  = Number(String(getValCelda(dep, kCuota) ?? '').replace(/[^0-9]/g, '')) || 0;
                                const autoTxt  = becado ? '' : enPesos(tarifaMensual(getColVal(dep, /^program/i), getColVal(dep, /^sede/i)));
                                const mostrado = manualN > 0 ? enPesos(manualN) : autoTxt;

                                if (soloLectura || becado) return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }}
                                    className="px-2 py-[7px] text-center whitespace-nowrap"
                                    title={becado ? 'Becado: no paga mensualidad' : undefined}>
                                    <span className="text-[11px] font-bold text-white">
                                      {mostrado || <span style={{ color: '#7C879A' }}>—</span>}
                                    </span>
                                  </td>
                                );

                                // Modo "otra cifra": la casilla se vuelve un campo para escribir.
                                if (cuotaOtro[dep.id]) return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-0 py-0">
                                    <input
                                      autoFocus
                                      inputMode="numeric"
                                      value={manualN > 0 ? String(manualN) : ''}
                                      placeholder="Escribe la cifra"
                                      onChange={e => setCelda(dep.id, kCuota, e.target.value.replace(/[^0-9]/g, ''))}
                                      onBlur={() => setCuotaOtro(p => { const q = { ...p }; delete q[dep.id]; return q; })}
                                      className="w-full text-[11px] font-bold text-white text-center py-[7px] px-1 outline-none bg-transparent"
                                      style={{ borderBottom: '2px solid #E0A33A' }}
                                    />
                                  </td>
                                );

                                return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-0 py-0">
                                    <select
                                      value={manualN > 0 ? String(manualN) : ''}
                                      onChange={e => {
                                        const v = e.target.value;
                                        if (v === '__OTRO__') { setCuotaOtro(p => ({ ...p, [dep.id]: true })); return; }
                                        setCelda(dep.id, kCuota, v);   // '' = volver a Auto
                                      }}
                                      title={manualN > 0
                                        ? 'Cuota puesta a mano. Escoge “— Auto —” para que vuelva a calcularse.'
                                        : 'Sale del programa y la sede. Escoge una cuota para fijarla.'}
                                      className="w-full text-[11px] font-bold text-white text-center py-[7px] px-1 outline-none bg-transparent cursor-pointer"
                                      style={manualN > 0 ? { borderBottom: '2px solid #E0A33A' } : undefined}>
                                      {/* La primera es la automática: se ve tal cual la
                                          cifra que le toca, sin palabras de más. Lo puesto
                                          a mano se distingue por la línea ámbar. */}
                                      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>
                                        {autoTxt || '—'}
                                      </option>
                                      {CUOTAS.filter(n => enPesos(n) !== autoTxt).map(n => (
                                        <option key={n} value={String(n)} style={{ color: '#111827', backgroundColor: 'white' }}>
                                          {enPesos(n)}
                                        </option>
                                      ))}
                                      {/* Una cuota especial que ya estaba puesta y no está en la lista */}
                                      {manualN > 0 && !CUOTAS.includes(manualN) && (
                                        <option value={String(manualN)} style={{ color: '#111827', backgroundColor: 'white' }}>
                                          {enPesos(manualN)}
                                        </option>
                                      )}
                                      <option value="__OTRO__" style={{ color: '#111827', backgroundColor: 'white' }}>
                                        Otro valor…
                                      </option>
                                    </select>
                                  </td>
                                );
                              }

                              /* CONSIGNA A — a qué cuenta le consigna esta familia.
                                 Por defecto se deduce del proyecto, pero desde el
                                 25/08/2026 se puede forzar a mano con el
                                 desplegable, para los casos que no siguen la regla.
                                 Al escoger "— Auto —" vuelve a deducirse solo. */
                              if (col === VCON) {
                                /* Se usa rawVal (que ya mira lo editado sin guardar)
                                   para que el desplegable responda de inmediato. */
                                const elegido = (() => {
                                  const v = String(rawVal ?? '').trim().toUpperCase();
                                  return CONSIGNA_OPCIONES.includes(v) ? v : '';
                                })();
                                const auto = consignaA({ ...dep, _columnas: { ...(dep._columnas ?? {}), [VCON]: '' } } as any);
                                const c = elegido
                                  ? { texto: elegido, color: COLOR_CONSIGNA[elegido], manual: true }
                                  : auto;
                                /* Desde el 26/08/2026 la columna va con el MISMO fondo
                                   gris de las demás: sin pastillas azules ni verdes.
                                   Lo puesto a mano se distingue por la línea ámbar. */
                                if (soloLectura) return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-1 py-[7px] text-center">
                                    <span className="block w-full text-[11px] font-bold text-white truncate">{c.texto || '—'}</span>
                                  </td>
                                );
                                return (
                                  <td key={col}
                                    style={{ background: PANEL, border: '2px solid #ffffff' }}
                                    className="px-0 py-0 text-center">
                                    <select
                                      value={elegido}
                                      onChange={e => setCelda(dep.id, VCON, e.target.value)}
                                      title={c.manual
                                        ? 'Escogido a mano. Escoge el primero de la lista para que vuelva a salir del proyecto.'
                                        : 'Sale del proyecto. Escoge una cuenta para forzarla en este deportista.'}
                                      className="w-full text-[11px] font-bold text-white py-[7px] px-1 outline-none bg-transparent cursor-pointer truncate"
                                      style={{
                                        textAlign: 'center', textAlignLast: 'center',
                                        borderBottom: c.manual ? '2px solid #E0A33A' : undefined,
                                      } as any}>
                                      {/* La primera es la automática: se ve igual que
                                          el valor que le toca, sin palabras de más.
                                          Lo puesto a mano se distingue por el borde ámbar. */}
                                      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>{auto.texto}</option>
                                      {CONSIGNA_OPCIONES.filter(o => o !== auto.texto).map(o => (
                                        <option key={o} value={o} style={{ color: '#111827', backgroundColor: 'white' }}>{o}</option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              }

                              /* C1 · C2 · C3 · C4 — LAS COMPETENCIAS DEL DEPORTISTA
                                 Desplegable con los torneos de SU programa. Al
                                 escoger uno, el deportista queda asignado a ese
                                 torneo y le queda cargado con su número. Un mismo
                                 torneo no se ofrece dos veces en el mismo
                                 deportista. — 26/08/2026 */
                              const nComp = numCompetencia(col);
                              if (nComp) {
                                const progDep = getValCelda(dep, colPrograma).trim();
                                const puesto  = (rawVal && rawVal !== '—') ? rawVal : '';
                                /* Los que ya escogió en las otras casillas, para no
                                   repetir el mismo torneo dos veces. */
                                const yaPuestos = colVisibles
                                  .filter(c => numCompetencia(c) && c !== col)
                                  .map(c => getValCelda(dep, c).trim())
                                  .filter(Boolean);
                                const opsTorneo = torneosDePrograma(progDep)
                                  .filter(t => !yaPuestos.includes(t.num));
                                const ayuda = nombreDelNumero(puesto) ||
                                  (puesto ? puesto : `Escoge la competencia ${nComp} · solo salen los torneos de ${progDep || 'su programa'}`);

                                if (soloLectura) return (
                                  <td key={col} style={{ background: NARANJA_COMP, border: '2px solid #ffffff' }}
                                    className="px-2 py-[7px] text-center" title={ayuda}>
                                    <span className="block w-full text-[13px] font-black text-white">
                                      {puesto || '—'}
                                    </span>
                                  </td>
                                );
                                return (
                                  <td key={col}
                                    style={{ background: NARANJA_COMP, border: '2px solid #ffffff' }}
                                    className="px-0 py-0" title={ayuda}>
                                    <select
                                      value={puesto}
                                      onChange={e => {
                                        const v = e.target.value;
                                        const antes = puesto;
                                        setCelda(dep.id, col, v);
                                        /* Estando parado en un grupo se ofrece
                                           hacerlo con todos (dirección, 27/08/2026):
                                           si escogió un torneo, cargárselo a todos;
                                           si lo dejó en "—", quitárselo a todos.
                                           Con una sola persona no hay qué preguntar. */
                                        if (listaPlana.length > 1) {
                                          if (v) {
                                            setResumenGrupo('');
                                            setPedirGrupo({ col, num: v, nComp, quien: dep._nombre, depId: dep.id, antes });
                                          } else if (antes) {
                                            setResumenGrupo('');
                                            setPedirGrupo({ col, num: antes, nComp, quien: dep._nombre, quitar: true, depId: dep.id, antes });
                                          }
                                        }
                                      }}
                                      className="w-full text-[13px] font-black py-[6px] px-1 outline-none bg-transparent text-white cursor-pointer text-center">
                                      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                                      {/* Lo que ya estaba escrito antes (aunque no salga
                                          en la lista) no se pierde al abrir el desplegable. */}
                                      {puesto && !opsTorneo.some(t => t.num === puesto) && (
                                        <option value={puesto} style={{ color: '#111827', backgroundColor: 'white' }}>{puesto}</option>
                                      )}
                                      {opsTorneo.map(t => (
                                        <option key={t.num} value={t.num} style={{ color: '#111827', backgroundColor: 'white' }}>
                                          {t.etiqueta}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              }

                              // CÓD — color por afiliación + columna DEPORTISTA fija a la derecha
                              if (esCod) {
                                const afilVal   = getColVal(dep, /tipo.*afil|^afil/i);
                                const estadoVal = getColVal(dep, /^estado$/i);
                                // Naranja para TODOS los nuevos activos (por tipo de afiliación o por estado "Nuevo")
                                const esNuevo   = /nuevo/i.test(afilVal) || /nuevo/i.test(estadoVal);
                                // Buscar el código con regex por si está bajo "CODIGO" (sin tilde) u otra variante
                                const rawValCod = rawVal || getColVal(dep, /^c[oó]d/i);
                                /* Color del código (dirección, 26/08/2026):
                                   los que empiezan por B o MB van SIEMPRE en gris,
                                   así el código mande sobre el tipo de afiliación.
                                   Los demás: NUEVO naranja · REINGRESO azul · ANTIGUO verde. */
                                const esCodigoB = /^M?B/i.test(String(rawValCod ?? '').trim());
                                const codColor  = retirado   ? '#9ca3af'
                                                : enEstudio  ? '#E0A33A'   // pidió el retiro: en estudio
                                                : esCodigoB  ? COD_GRIS
                                                : esNuevo    ? COD_NARANJA
                                                : colorCodigo(afilVal);
                                return (
                                  <>
                                  <td key={col}
                                    className="px-0 py-0 text-center sticky z-10"
                                    style={{ backgroundColor: codColor, border: '2px solid #ffffff', left: izqCodigo }}>
                                    <input
                                      value={rawValCod}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      className="w-full text-center outline-none bg-transparent" style={{ fontSize: '16px', fontWeight: '800', color: 'white', letterSpacing: '0.08em', padding: '6px 8px' }}
                                    />
                                  </td>
                                  {/* Columna DEPORTISTA fija — 1 clic: estado de cuenta · doble clic: editar nombre */}
                                  <td key="__nombre_td__"
                                    className="px-3 py-0 sticky z-10 whitespace-nowrap"
                                    style={{ backgroundColor: stickyBg, border: '2px solid #ffffff',
                                             minWidth: 180, left: izqNombre }}>
                                    {editNombreId === dep.id ? (
                                      <input
                                        autoFocus
                                        value={edits[dep.id]?.['__NOMBRE__'] ?? dep._nombre}
                                        onChange={e => setCelda(dep.id, '__NOMBRE__', e.target.value)}
                                        onBlur={e => {
                                          // Si queda vacío, se descarta la edición y vuelve el nombre original
                                          if (!e.target.value.trim()) {
                                            setEdits(prev => {
                                              const row = { ...(prev[dep.id] ?? {}) };
                                              delete row['__NOMBRE__'];
                                              const next = { ...prev };
                                              if (Object.keys(row).length) next[dep.id] = row;
                                              else delete next[dep.id];
                                              return next;
                                            });
                                          }
                                          setEditNombreId(null);
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === 'Escape') {
                                            e.preventDefault();
                                            (e.target as HTMLInputElement).blur();
                                          }
                                        }}
                                        style={{
                                          fontSize: 13, fontWeight: 700, color: '#111827', width: '100%',
                                          outline: 'none', background: 'white', textTransform: 'uppercase',
                                          border: '1px solid #16a34a', borderRadius: 4, padding: '4px 6px',
                                        }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (nombreClickTimer.current) return;
                                          nombreClickTimer.current = setTimeout(() => {
                                            nombreClickTimer.current = null;
                                            router.push(`/alumnos/${dep.id}/estado-cuenta${soloLectura ? '' : '?edit=1'}`);
                                          }, 220);
                                        }}
                                        onDoubleClick={() => {
                                          if (nombreClickTimer.current) {
                                            clearTimeout(nombreClickTimer.current);
                                            nombreClickTimer.current = null;
                                          }
                                          if (!soloLectura) setEditNombreId(dep.id);
                                        }}
                                        title="Un clic: estado de cuenta · Doble clic: editar nombre"
                                        style={{
                                          fontSize: 13, fontWeight: 700,
                                          color: (edits[dep.id]?.['__NOMBRE__'] ?? dep._nombre) ? '#ffffff' : 'rgba(255,255,255,.45)',
                                          background: 'none', border: 'none', padding: 0, margin: 0,
                                          cursor: 'pointer', textAlign: 'left',
                                          display: 'inline-block', minWidth: 120,
                                          textTransform: 'uppercase',
                                          textDecoration: 'none',
                                        }}
                                        className="hover:!text-[#00B050] hover:underline transition-colors">
                                        {(edits[dep.id]?.['__NOMBRE__'] ?? dep._nombre) || '✏️ (doble clic para nombrar)'}
                                      </button>
                                    )}
                                  </td>
                                  </>
                                );
                              }

                              // FECHA AFILIACIÓN
                              if (esFechaAfil(col)) {
                                const display = serialAFecha(rawVal);
                                return (
                                  <td key={col}
                                    style={{ background: PANEL, border: '2px solid #ffffff' }}
                                    className="px-0 py-0 text-center">
                                    <input
                                      value={display}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      className="w-full text-center text-[11px] font-semibold py-[7px] px-2 outline-none bg-transparent text-white truncate"
                                    />
                                  </td>
                                );
                              }

                              // TIPO AFILIACIÓN — badge coloreado, editable (solo lectura para contabilidad)
                              if (esTipoAfil(col)) {
                                const color = colorCodigo(rawVal);
                                if (soloLectura) {
                                  return (
                                    <td key={col}
                                      style={{ border: '2px solid #ffffff', backgroundColor: PANEL }}
                                      className="px-1 py-0 text-center">
                                      <span style={{
                                        display: 'inline-block',
                                        backgroundColor: 'transparent',
                                        color: 'white',
                                        borderRadius: 4,
                                        padding: '2px 6px',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: '0.04em',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {rawVal || '—'}
                                      </span>
                                    </td>
                                  );
                                }
                                // Incluir el valor actual si no está en la lista estándar
                                const opsAfil = (!rawVal || OPCIONES_AFIL.includes(rawVal))
                                  ? OPCIONES_AFIL : [rawVal, ...OPCIONES_AFIL];
                                return (
                                  <td key={col}
                                    style={{ border: '2px solid #ffffff', backgroundColor: PANEL }}
                                    className="px-0 py-0">
                                    <select
                                      value={rawVal}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      title="Tipo de afiliación"
                                      style={{ color: 'white' }}
                                      className="w-full text-[11px] font-bold py-[7px] px-1.5 outline-none bg-transparent cursor-pointer truncate">
                                      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                                      {opsAfil.map(o => (
                                        <option key={o} value={o} style={{ color: '#111827', backgroundColor: 'white' }}>{o}</option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              }

                              // SELECT (Programa / Estado / Sede)
                              if (opciones) {
                                /* En SEDE lo guardado puede venir escrito de
                                   cualquier forma ("la 80"). Se muestra la forma
                                   OFICIAL para que coincida con la lista; al
                                   escoger, se guarda ya normalizado. */
                                const esSede  = /^sede/i.test(col.trim());
                                const valSel  = esSede ? sedeCanonica(rawVal) : rawVal;
                                if (soloLectura) return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-1.5 py-[7px]">
                                    <span className="block w-full text-[11px] font-semibold text-white truncate">{valSel || '—'}</span>
                                  </td>
                                );
                                return (
                                <td key={col}
                                  style={{ background: PANEL, border: '2px solid #ffffff' }}
                                  className="px-0 py-0">
                                  <select
                                    value={valSel}
                                    onChange={e => {
                                      setCelda(dep.id, col, esSede ? sedeCanonica(e.target.value) : e.target.value);
                                      // Al cambiar el PROGRAMA, limpiar PROYECTO y PROFE (se debe reseleccionar)
                                      /* ── AL CAMBIAR DE PROGRAMA YA NO SE BORRA
                                         EL PROYECTO (corregido 27/08/2026) ──
                                         Antes, cambiar el programa vaciaba de
                                         una el PROYECTO y el PROFE, sin avisar
                                         y sin forma de deshacerlo. Le pasó a la
                                         dirección con nueve deportistas que se
                                         movieron de FORMACIÓN a DESARROLLO: se
                                         quedaron sin proyecto y no había cómo
                                         saber cuál tenían.

                                         La idea original era no dejar una
                                         combinación imposible, pero para eso
                                         basta con AVISAR: el proyecto se
                                         conserva y la casilla queda marcada en
                                         ámbar hasta que se acomode. Borrar el
                                         dato del usuario nunca puede ser la
                                         forma de corregirlo. */
                                    }}
                                    className="w-full text-[11px] font-semibold py-[7px] px-1.5 outline-none bg-transparent text-white cursor-pointer truncate">
                                    {/* Letra oscura en las opciones: la lista del
                                        navegador se abre sobre fondo blanco. */}
                                    <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                                    {/* Si lo guardado no está en la lista (alguien lo
                                        escribió a mano), se agrega para no borrarlo
                                        sin querer al abrir el desplegable. */}
                                    {valSel && !opciones.includes(valSel) && (
                                      <option value={valSel} style={{ color: '#111827', backgroundColor: 'white' }}>{valSel}</option>
                                    )}
                                    {opciones.map(o => (
                                      <option key={o} value={o} style={{ color: '#111827', backgroundColor: 'white' }}>{o}</option>
                                    ))}
                                  </select>
                                </td>
                                );
                              }

                              // PROYECTO — select verde filtrado por programa
                              const esProyecto = RX_PROY.test(col.trim());
                              if (esProyecto) {
                                const progActual = getValCelda(dep, colPrograma).trim();
                                const opsProy    = (proyectosPorPrograma[progActual] && proyectosPorPrograma[progActual].length > 0)
                                  ? proyectosPorPrograma[progActual]
                                  : Object.entries(proyectosPorPrograma).filter(([k]) => k !== '__RETIRADO__').flatMap(([,v]) => v).filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>{ const na=parseInt(a,10),nb=parseInt(b,10); return !isNaN(na)&&!isNaN(nb)?na-nb:a.localeCompare(b,'es'); });
                                if (soloLectura) return (
                                  <td key={col} style={{ border: '2px solid #ffffff', backgroundColor: VERDE }} className="px-2 py-[6px]">
                                    <span className="block w-full text-[13px] font-semibold text-white truncate">{rawVal && rawVal !== '—' ? rawVal : '—'}</span>
                                  </td>
                                );
                                /* EL PROYECTO QUE YA TIENE NO SE PIERDE, así no
                                   sea de este programa (corregido 27/08/2026).
                                   Antes no salía en la lista y la casilla se veía
                                   vacía: al tocarla se guardaba en blanco y el
                                   dato se iba sin que nadie se diera cuenta.
                                   Ahora sale igual, y la casilla se pone ÁMBAR
                                   para avisar que ese proyecto no es del
                                   programa que tiene puesto. */
                                const proyActualCel = rawVal === '—' ? '' : rawVal.trim();
                                const proyAjeno = !!proyActualCel && !opsProy.includes(proyActualCel);
                                return (
                                  <td key={col}
                                    style={{ border: '2px solid #ffffff',
                                             backgroundColor: proyAjeno ? '#9a6b1f' : VERDE }}
                                    title={proyAjeno
                                      ? `${proyActualCel} no es un proyecto de ${progActual || 'este programa'}. Se conservó tal cual: escoge el que corresponda cuando quieras.`
                                      : undefined}
                                    className="px-0 py-0">
                                    <select
                                      value={proyActualCel}
                                      onChange={e => {
                                        const nuevaProy = e.target.value;
                                        setCelda(dep.id, col, nuevaProy);
                                        // El PROFE se deriva del proyecto: al cambiar de proyecto, se actualiza solo
                                        if (colProfe) setCelda(dep.id, colProfe, profeDeProyecto(nuevaProy));
                                      }}
                                      className="w-full text-[13px] font-semibold text-white py-[6px] px-2 outline-none bg-transparent cursor-pointer truncate">
                                      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                                      {proyAjeno && (
                                        <option value={proyActualCel} style={{ color: '#111827', backgroundColor: 'white' }}>
                                          {proyActualCel} · de otro programa
                                        </option>
                                      )}
                                      {opsProy.map(o => <option key={o} value={o} style={{ color: '#111827', backgroundColor: 'white' }}>{o}</option>)}
                                    </select>
                                  </td>
                                );
                              }

                              /* PROFE — normalmente sale del formador asignado al
                                 proyecto, pero desde el 25/08/2026 se puede
                                 cambiar a mano con un desplegable que trae a
                                 TODOS los formadores. Sirve para los casos
                                 sueltos que no siguen la asignación del proyecto. */
                              const esProfe = /^prof/i.test(col.trim());
                              if (esProfe) {
                                const proyActual = getValCelda(dep, colProy).trim();
                                const derivado   = profeDeProyecto(proyActual);
                                const puesto     = (rawVal && rawVal !== '—') ? rawVal : '';
                                const mostrar    = puesto || derivado;
                                if (soloLectura || profesTodos.length === 0) return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-2 py-[6px]"
                                    title="Sale del formador asignado al proyecto (se cambia en Usuarios)">
                                    <span className="block w-full text-[13px] font-semibold text-white truncate">{mostrar || '—'}</span>
                                  </td>
                                );
                                return (
                                  <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-0 py-0">
                                    <select
                                      value={mostrar}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      title={derivado
                                        ? `El proyecto ${proyActual || ''} lo tiene asignado a ${derivado}. Puedes cambiarlo aquí.`
                                        : 'Escoge el formador de este deportista.'}
                                      className="w-full text-[13px] font-semibold py-[6px] px-2 outline-none bg-transparent text-white cursor-pointer truncate">
                                      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                                      {/* Si el que está puesto ya no es formador, no se borra sin querer. */}
                                      {mostrar && !profesTodos.includes(mostrar) && (
                                        <option value={mostrar} style={{ color: '#111827', backgroundColor: 'white' }}>{mostrar}</option>
                                      )}
                                      {profesTodos.map(p => (
                                        <option key={p} value={p} style={{ color: '#111827', backgroundColor: 'white' }}>{p}</option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              }

                              // TEXTO genérico
                              if (soloLectura) return (
                                <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-2 py-[7px]">
                                  <span className="block w-full text-[11px] text-white truncate">{rawVal && rawVal !== '—' ? rawVal : '—'}</span>
                                </td>
                              );
                              return (
                                <td key={col} style={{ background: PANEL, border: '2px solid #ffffff' }} className="px-0 py-0">
                                  <input
                                    value={rawVal === '—' ? '' : rawVal}
                                    onChange={e => setCelda(dep.id, col, e.target.value)}
                                    placeholder="—"
                                    className="w-full text-[11px] text-white py-[7px] px-2 outline-none bg-transparent truncate"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                    });
                  })()}

                  {/* Fila centinela: cuando asoma, se dibuja la tanda siguiente. */}
                  <tr ref={finTablaRef}>
                    <td colSpan={colVisibles.length + 2}
                      style={{ background: CAMPO, border: '2px solid #ffffff' }}
                      className="px-3 py-2 text-center text-white text-[11px] font-bold">
                      {visibles < listaPlana.length ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Mostrando {visibles} de {listaPlana.length} · sigue bajando para ver más
                        </span>
                      ) : (
                        <span className="text-white/60">
                          {listaPlana.length} deportista{listaPlana.length !== 1 ? 's' : ''} · fin de la lista
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer con botón ACTUALIZAR */}
            {!soloLectura && pendingCount > 0 && (
              <div className="sticky bottom-0 border-t-2 px-5 py-3 flex items-center justify-between" style={{ background: CAMPO, borderColor: BORDE }}>
                <p className="text-[#111827] font-semibold text-sm">
                  Tienes <strong>{pendingCount}</strong> cambio{pendingCount !== 1 ? 's' : ''} sin guardar.
                </p>
                <button onClick={actualizarTodo}
                  className="flex items-center gap-2 text-white px-5 py-2.5 rounded-xl font-black text-sm hover:brightness-110 transition shadow-md" style={{ background: VERDE }}>
                  <Save className="w-4 h-4" /> ACTUALIZAR TODOS LOS CAMBIOS
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══ ¿SE LO CARGO A TODO EL GRUPO? ════════════════════════
          Sale apenas se escoge un torneo en C1..C4 estando parado en un grupo.
          Lo que se carga es EXACTAMENTE lo que está en pantalla según los
          filtros de arriba. — dirección, 27/08/2026 */}
      {pedirGrupo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#3C4759] rounded-2xl shadow-2xl w-full max-w-md p-6"
            style={{ border: '1px solid #4A5568', position: 'relative' }}>

            {/* LA X — cierra el cuadro Y DEVUELVE LA CASILLA COMO ESTABA.
                La pidió la dirección (27/08/2026) para cuando uno se equivoca de
                torneo: aquí no se escoge entre "a uno o a todos", se cancela y
                ya, sin dejar puesto lo que no era. */}
            <button
              onClick={() => {
                setCelda(pedirGrupo.depId, pedirGrupo.col, pedirGrupo.antes);
                setPedirGrupo(null);
              }}
              title="Cerrar y dejar la casilla como estaba"
              className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center
                text-white/50 hover:text-white transition"
              style={{ background: '#2B3547', border: '1px solid #4A5568' }}>
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-black text-white text-base mb-1 pr-10">
              {pedirGrupo.quitar ? '¿Se lo quito a todo el grupo?' : '¿Se lo cargo a todo el grupo?'}
            </h3>
            <p className="text-white/45 text-xs font-semibold mb-4">
              Acabas de {pedirGrupo.quitar ? 'quitarle' : 'ponerle'}{' '}
              <b className="text-white">{nombreDelNumero(pedirGrupo.num) || `el torneo ${pedirGrupo.num}`}</b>{' '}
              a <b className="text-white">{pedirGrupo.quien}</b> en C{pedirGrupo.nComp}.
            </p>

            <div className="rounded-xl px-3 py-3 mb-4"
              style={{ background: '#2B3547', border: '1px solid #4A5568' }}>
              <p className="text-white text-[12.5px] font-bold">
                Grupo en pantalla: <span style={{ color: '#00B050' }}>{nombreDelGrupo}</span>
              </p>
              <p className="text-white/60 text-[12px] mt-1">
                {listaPlana.length} deportista{listaPlana.length !== 1 ? 's' : ''}
              </p>
              <p className="text-white/40 text-[11px] mt-2 leading-snug">
                {pedirGrupo.quitar
                  ? `Solo se borra donde esté exactamente ese torneo, en C${pedirGrupo.nComp}. Lo de las otras casillas no se toca. Queda como cambio pendiente — se guarda con GUARDAR.`
                  : `Se escribe únicamente en C${pedirGrupo.nComp}. Al que ya lo tenga no se le toca, y al que tenga esa casilla ocupada con otro torneo se le deja quieto y se te avisa. Queda como cambio pendiente — se guarda con GUARDAR.`}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPedirGrupo(null)}
                className="flex-1 border border-[#4A5568] rounded-xl py-3 text-sm font-bold text-white/70 hover:bg-[#333F50] transition">
                Solo a {pedirGrupo.quien.split(' ')[0]}
              </button>
              <button
                onClick={() => {
                  if (pedirGrupo.quitar) quitarTorneoDelGrupo(pedirGrupo.col, pedirGrupo.num);
                  else                   cargarTorneoAlGrupo(pedirGrupo.col, pedirGrupo.num);
                  setPedirGrupo(null);
                }}
                className="flex-1 rounded-xl py-3 text-sm font-black text-white transition hover:opacity-90"
                style={{ background: pedirGrupo.quitar ? '#C0504D' : '#00B050' }}>
                Sí, a todo el grupo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cómo quedó la carga al grupo. Se queda hasta que se cierre, para
          alcanzar a leer a cuántos les entró y a cuántos no. */}
      {resumenGrupo && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 rounded-2xl px-4 py-3 shadow-2xl max-w-[92vw]"
          style={{ background: '#2B3547', border: '1px solid #00B050' }}>
          <span className="text-lg leading-none">🏆</span>
          <p className="text-white text-[12.5px] font-semibold">{resumenGrupo}</p>
          {deshacerGrupo && deshacerGrupo.length > 0 && (
            <button onClick={deshacerCargaGrupo}
              className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-black text-white transition hover:opacity-90"
              style={{ background: '#E0A33A' }}>
              Deshacer
            </button>
          )}
          <button onClick={() => { setResumenGrupo(''); setDeshacerGrupo(null); }}
            className="text-white/50 hover:text-white font-black text-[13px] leading-none pl-1">✕</button>
        </div>
      )}

      {/* ══ MODAL IMPORTAR TORNEOS ══════════════════════════════ */}
      {modalTorneo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#3C4759] rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header modal */}
            <div className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center gap-3 flex-shrink-0">
              <Trophy className="w-5 h-5 text-white" />
              <div className="flex-1">
                <p className="text-white font-black text-base">Importar Torneos</p>
                <p className="text-white/60 text-[11px]">Sube el Excel con los resultados de torneo</p>
              </div>
              <button onClick={() => setModalTorneo(false)}
                className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white hover:bg-white/30 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── PASO 1: Subir ── */}
            {torneoPaso === 'subir' && (
              <div className="p-6 space-y-5 overflow-y-auto">
                {/* Instrucciones */}
                <div className="bg-[rgba(0,176,80,.14)] border border-green-100 rounded-2xl p-4 text-sm text-[#064e1e] space-y-1">
                  <p className="font-black">Formato esperado del Excel:</p>
                  <p>El archivo debe tener estas columnas (en cualquier orden):</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['CÓDIGO', 'DEPORTISTA', 'COMPETENCIA', 'TORNEO 1', 'TORNEO 2', 'TORNEO 3', 'TORNEO 4'].map(c => (
                      <span key={c} className="text-white text-[10px] font-black px-2.5 py-1 rounded-full">{c}</span>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#4b5563] mt-2">
                    Solo necesitas incluir los deportistas que quieres actualizar. La búsqueda se hace primero por <strong>Código</strong> y luego por <strong>Nombre</strong>.
                  </p>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setTorneoArrastr(true); }}
                  onDragLeave={() => setTorneoArrastr(false)}
                  onDrop={e => { e.preventDefault(); setTorneoArrastr(false); const f = e.dataTransfer.files[0]; if (f) procesarExcelTorneo(f); }}
                  onClick={() => torneoInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
                    torneoArrastr ? 'border-[#16a34a] bg-[rgba(0,176,80,.14)]' : 'border-[#4A5568] hover:border-[#22c55e]'
                  }`}>
                  <input ref={torneoInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) procesarExcelTorneo(f); }} />
                  {torneoProc ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
                      <p className="text-white/70 text-sm">Leyendo Excel…</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-white/40 mx-auto mb-3" />
                      <p className="font-bold text-white/70">Arrastra el Excel aquí o haz clic</p>
                      <p className="text-xs text-white/40 mt-1">.xlsx · .xls</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── PASO 2: Preview ── */}
            {torneoPaso === 'preview' && (
              <div className="flex flex-col overflow-hidden flex-1">
                {/* Resumen */}
                {(() => {
                  const encontrados = torneoFilas.filter(f => f.depId).length;
                  const noEncontrados = torneoFilas.filter(f => !f.depId).length;
                  return (
                    <div className="flex-shrink-0 px-6 py-3 border-b border-[#4A5568] flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-[#16a34a] font-bold">
                        <CheckCircle className="w-4 h-4" />{encontrados} encontrados
                      </span>
                      {noEncontrados > 0 && (
                        <span className="flex items-center gap-1.5 text-[#475569] font-bold">
                          <AlertCircle className="w-4 h-4" />{noEncontrados} no encontrados
                        </span>
                      )}
                      <span className="text-white/40 text-xs">{torneoFilas.length} filas en total</span>
                    </div>
                  );
                })()}

                {/* Tabla preview */}
                <div className="overflow-auto flex-1">
                  <table className="text-xs border-collapse w-full">
                    <thead className="sticky top-0 text-white">
                      <tr>
                        <th className="px-3 py-2 text-left font-black">ESTADO</th>
                        <th className="px-3 py-2 text-left font-black">CÓDIGO</th>
                        <th className="px-3 py-2 text-left font-black">DEPORTISTA</th>
                        <th className="px-3 py-2 text-left font-black">COMPETENCIA</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 1</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 2</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 3</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {torneoFilas.map((f, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-[#3C4759]' : 'bg-[#333F50]'}>
                          <td className="px-3 py-1.5 border-b border-[#4A5568]">
                            {f.depId ? (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                f.match === 'codigo' ? 'text-white' : 'bg-[#2B3547] text-[#111827]'
                              }`}>
                                {f.match === 'codigo' ? '✓ Código' : '✓ Nombre'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#2B3547] text-white/70">
                                No encontrado
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] font-bold text-[#111827]">{f.codigo || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] font-semibold text-white">{f.nombre || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] text-white/70">{f.competencia || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] text-white/70">{f.t1 || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] text-white/70">{f.t2 || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] text-white/70">{f.t3 || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-[#4A5568] text-white/70">{f.t4 || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Botones */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-[#4A5568] flex items-center gap-3 justify-end">
                  <button onClick={() => setTorneoPaso('subir')}
                    className="px-4 py-2 rounded-xl border border-[#4A5568] text-sm text-white/70 hover:bg-[#333F50] transition">
                    ← Volver
                  </button>
                  <button
                    onClick={aplicarTorneos}
                    disabled={!torneoFilas.some(f => f.depId)}
                    className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl text-sm font-black hover:bg-[#064e1e] transition disabled:opacity-50">
                    <Trophy className="w-4 h-4" />
                    Aplicar {torneoFilas.filter(f => f.depId).length} deportistas
                  </button>
                </div>
              </div>
            )}

            {/* ── PASO 3: Listo ── */}
            {torneoPaso === 'listo' && (
              <div className="p-10 text-center space-y-4">
                <div className="w-16 h-16 bg-[rgba(0,176,80,.20)] rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-[#16a34a]" />
                </div>
                <h3 className="text-xl font-black text-white">¡Torneos actualizados!</h3>
                <p className="text-white/70 text-sm">
                  Se actualizaron <strong>{torneoFilas.filter(f => f.depId).length}</strong> deportistas con los datos de torneo.
                </p>
                <button onClick={() => setModalTorneo(false)}
                  className="text-white px-8 py-3 rounded-xl font-black hover:bg-[#064e1e] transition">
                  Cerrar
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ══ MODAL SUBIR NUEVOS DEPORTISTAS ═══════════════════════ */}
      {modalNuevos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#3C4759] rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header modal */}
            <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-white font-black text-base">Subir Nuevos Deportistas</p>
                <p className="text-white/60 text-xs mt-0.5">
                  {nuevosPaso === 'subir'   && 'Selecciona el Excel con los nuevos registros'}
                  {nuevosPaso === 'preview' && `${nuevosFilas.length} registros encontrados — confirma antes de agregar`}
                  {nuevosPaso === 'listo'   && '¡Deportistas agregados correctamente!'}
                </p>
              </div>
              <button onClick={() => setModalNuevos(false)}
                className="text-white/70 hover:text-white transition p-1 rounded-lg hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Paso 1: Subir archivo */}
            {nuevosPaso === 'subir' && (
              <div className="flex-1 flex flex-col items-center justify-center p-10 gap-5">
                <div className="w-20 h-20 bg-[rgba(0,176,80,.20)] rounded-3xl flex items-center justify-center">
                  <Upload className="w-9 h-9 text-[#16a34a]" />
                </div>
                <div className="text-center">
                  <p className="font-black text-white text-lg">Sube el Excel de nuevos deportistas</p>
                  <p className="text-white/40 text-sm mt-1">El archivo debe tener encabezados en la primera fila (CÓDIGO, DEPORTISTA, PROGRAMA, PROYECTO…)</p>
                </div>
                <button
                  onClick={() => nuevosInputRef.current?.click()}
                  disabled={nuevosProc}
                  className="text-white font-bold px-8 py-3 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-50 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {nuevosProc ? 'Procesando…' : 'Seleccionar archivo .xlsx'}
                </button>
              </div>
            )}

            {/* Paso 2: Preview */}
            {nuevosPaso === 'preview' && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Resumen */}
                <div className="px-6 py-3 bg-[#333F50] border-b border-[#4A5568] flex gap-4 text-xs font-bold flex-shrink-0">
                  <span className="text-[#5BE39B]">✓ {nuevosFilas.filter(r => !r.duplicado).length} nuevos a agregar</span>
                  {nuevosFilas.some(r => r.duplicado) && (
                    <span className="text-[#E0A33A]">⚠ {nuevosFilas.filter(r => r.duplicado).length} duplicados (se omitirán)</span>
                  )}
                </div>

                {/* Tabla preview */}
                <div className="flex-1 overflow-auto px-4 py-3">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr style={{ background: '#16a34a' }}>
                        <th style={{ border: '2px solid #ffffff', padding: '6px 10px', color: 'white', fontWeight: 900 }}>ESTADO</th>
                        {nuevosFilas[0] && Object.keys(nuevosFilas[0]._columnas ?? {}).slice(0, 7).map(k => (
                          <th key={k} style={{ border: '2px solid #ffffff', padding: '6px 10px', color: 'white', fontWeight: 900, whiteSpace: 'nowrap' }}>
                            {k.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nuevosFilas.map((r, i) => (
                        <tr key={i} style={{ background: r.duplicado ? '#fef3c7' : '#f1f5f9', borderTop: '2px solid #ffffff' }}>
                          <td style={{ border: '2px solid #ffffff', padding: '5px 8px', textAlign: 'center', fontWeight: 900, fontSize: 10 }}>
                            {r.duplicado
                              ? <span style={{ color: '#d97706' }}>DUPLICADO</span>
                              : <span style={{ color: '#16a34a' }}>NUEVO</span>}
                          </td>
                          {Object.keys(nuevosFilas[0]._columnas ?? {}).slice(0, 7).map(k => (
                            <td key={k} style={{ border: '2px solid #ffffff', padding: '5px 8px', whiteSpace: 'nowrap', color: '#111827' }}>
                              {r._columnas[k] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Botones */}
                <div className="flex gap-3 px-6 py-4 border-t border-[#4A5568] flex-shrink-0">
                  <button onClick={() => { setNuevosPaso('subir'); setNuevosFilas([]); }}
                    className="flex-1 border border-[#4A5568] text-white/70 hover:bg-[#333F50] font-bold py-2.5 rounded-xl transition text-sm">
                    ← Volver
                  </button>
                  <button onClick={confirmarNuevos}
                    disabled={nuevosFilas.filter(r => !r.duplicado).length === 0}
                    className="flex-1 text-white font-bold py-2.5 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-40 text-sm flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Agregar {nuevosFilas.filter(r => !r.duplicado).length} deportistas
                  </button>
                </div>
              </div>
            )}

            {/* Paso 3: Listo */}
            {nuevosPaso === 'listo' && (
              <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4 text-center">
                <div className="w-20 h-20 bg-[rgba(0,176,80,.20)] rounded-3xl flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
                <p className="font-black text-white text-lg">¡Listo!</p>
                <p className="text-white/70 text-sm">
                  Se agregaron <strong>{nuevosFilas.filter(r => !r.duplicado).length}</strong> deportistas al consolidado.
                  Ya aparecen en la tabla.
                </p>
                <button onClick={() => setModalNuevos(false)}
                  className="text-white px-8 py-3 rounded-xl font-black hover:bg-[#064e1e] transition">
                  Cerrar
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
