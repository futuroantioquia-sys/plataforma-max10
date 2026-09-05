'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Calculator, Save, Search, Download, Database, CheckCircle, AlertCircle, X, BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { getDeportistas, publicarPagosEstado, getPagadosKeys } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import {
  normNombre, soloDigitos, normCuenta, clasificarConcepto, mesDesdeFecha, hashMov, clavePagador,
  getMapeoIndex, guardarMapeo, guardarMovimientos, getMovimientos, ultimoSaldo,
  hashesExistentes, contarMapeo, sembrarDiccionario, contarMovimientos, importarHistorico,
  getConceptos, guardarConcepto, borrarConcepto, actualizarMovimiento, asignarCodigoBulk,
  getMapeoRows, borrarMapeo, getMesesPorCodigo, borrarMovimiento, CONCEPTOS_SIN_DETALLE, conceptoRenombrado,
  getInstitucionales,
  getTerceros,
  type MapeoIdx, type MovCont, type Concepto, type Tercero,
} from '@/lib/contabilidad';

// La cuenta "ST 823" queda SIEMPRE de última (se completa manualmente por ahora,
// mientras se sube su extracto). El resto conserva su orden.
const BANCOS = ['Bancolombia 613', 'Bancolombia 908', 'Bancolombia 382', 'Bancolombia 069', 'ST 823'];

// Regla: los movimientos con concepto INSTITUCIONAL se consideran SIEMPRE confirmados
// (chulo VERDE) y NO cuentan como pendientes/por orientar. Estos no suben a ningún
// estado de cuenta (no están ligados a un deportista).
const esInstitucional = (m: any) => String(m?.concepto ?? '').trim().toUpperCase().includes('INSTITUCIONAL');

// INTERESES del banco, en cualquiera de los dos sentidos: los que el banco ABONA
// (INTERESES A FAVOR) y los que COBRA (INTERESES FINANCIEROS). También los
// rendimientos. NO son el pago de ningún deportista: nunca llevan código ni mes,
// no se pintan de ningún color y no cuentan como pendientes ni como "por
// orientar". La celda del mes queda VACÍA, sin letrero.
//
// 25/08/2026 — se cambió "INTERESES" por "INTERES": el banco escribe
// "AJUSTE INTERES AHORROS CR" en singular, y esas filas se estaban quedando
// por fuera y saliendo marcadas como SIN CÓDIGO.
const esIngresoFinanciero = (m: any) => {
  const c = String(m?.concepto ?? '').trim().toUpperCase();
  if (c === 'INGRESO FINANCIERO' || c === 'INTERESES A FAVOR' || c === 'INTERESES FINANCIEROS') return true;
  return /INTERES|RENDIMIENT/i.test(String(m?.descripcion ?? ''));
};

// Movimientos que NO van a ningún estado de cuenta: los institucionales y los
// intereses del banco. Se tratan igual en el semáforo, el chulo y los conteos.
const esNoAplica = (m: any) => esInstitucional(m) || esIngresoFinanciero(m);

// ── Directorio de TERCEROS de respaldo (documento → nombre y tipo) ──
// La lista de verdad vive en el módulo "Nómina y Proveedores" (tablas `nomina`
// y `proveedores` de Supabase). Esta copia queda SOLO como respaldo, para que
// el Libro siga reconociendo a la gente si la base no responde. Lo que usted
// cambie en esa pantalla manda sobre lo que diga aquí.
const EMPLEADOS_NOMINA: Record<string, { nombre: string; tipo: string }> = {
  '1063278765': { nombre: 'JAIRO LUIS TOVIOS OVIEDO',        tipo: 'ADMINISTRATIVO' },
  '32183658':   { nombre: 'DIANA FERNANDA CASTRO ESTRADA',   tipo: 'ADMINISTRATIVO' },
  '811036997':  { nombre: 'SOL MARINA VILLALBA BARRIOS',     tipo: 'ADMINISTRATIVO' },
  '1214734807': { nombre: 'ALEJANDRO CASTRO ESTRADA',        tipo: 'PROFESOR' },
  '1152192324': { nombre: 'OSCAR FREDY MEJIA FLOREZ',        tipo: 'PROFESOR' },
  '1017258984': { nombre: 'CRISTIAN CAMILO RAMIREZ AGUDELO', tipo: 'PROFESOR' },
  '1000415036': { nombre: 'SAMUEL COLORADO SERNA',           tipo: 'PROFESOR' },
  '1000084856': { nombre: 'ALEXANDER TABARES GUTIERREZ',     tipo: 'PROFESOR' },
  '1128389946': { nombre: 'ANDRES FELIPE CHALARCA ROJAS',    tipo: 'PROFESOR' },
  '1036639022': { nombre: 'JULIAN RIOS HERRERA',             tipo: 'PROFESOR' },
  '1003404311': { nombre: 'JESUS DAVID CASTILLO GONZALEZ',   tipo: 'PROFESOR' },
  '1013458275': { nombre: 'MARTIN MORA CARDENAS',            tipo: 'PROFESOR' },
  '1017192180': { nombre: 'MARLON CASTAÑO RIOS',             tipo: 'PROFESOR' },
  '1020464354': { nombre: 'FREDY ALEXANDER RAMIREZ RIVAS',   tipo: 'PROFESOR' },
  '1003050289': { nombre: 'JHON FREDY DORIA CORONADO',       tipo: 'PROFESOR' },
  '1034776238': { nombre: 'JUAN MANUEL MUÑOZ HERNANDEZ',     tipo: 'PROFESOR' },
  '1033180115': { nombre: 'FELIPE ALVAREZ ALVAREZ',          tipo: 'PROFESOR' },
  '1002066215': { nombre: 'JAVIER DUVAN RIOS OSPINA',        tipo: 'PROFESOR' },
  '1127792656': { nombre: 'MIGUEL ANGEL BUILES GIRALDO',     tipo: 'PROFESOR' },
  '1005372826': { nombre: 'NICOLAS BARRIOS SAAVEDRA',        tipo: 'PROFESOR' },
  '1000870631': { nombre: 'KAREN LIZETH BERRIO TORO',        tipo: 'PROFESOR' },
  // 25/08/2026: la cedula quedo en 1193081467 (la de la tabla `profes`).
  // Antes estaba 1193081477, que difiere en un digito y era la equivocada.
  '1193081467': { nombre: 'MARIA CAMILA QUINTERO LOPEZ',     tipo: 'PROFESOR' },
  '1036864427': { nombre: 'JUAN ANDRES JIMENEZ',             tipo: 'PROFESOR' },
  '1000203538': { nombre: 'SEBASTIÁN GUZMAN MUÑOZ',          tipo: 'PROFESOR' },
  // PROVISIONAL (25/08/2026): de EDGAR solo se tiene la cedula de la tabla
  // `profes`. Falta el nombre completo; cuando la direccion lo confirme, se
  // reemplaza 'EDGAR' por el nombre y apellidos que van en la nomina.
  '98539787':   { nombre: 'EDGAR',                           tipo: 'PROFESOR' },
};

/* ── CONCEPTO SEGÚN EL TIPO DE TERCERO ────────────────────────────────────
   Cuando el banco dice a quién le pagó, el concepto sale del tipo que esa
   persona tenga en el módulo "Nómina y Proveedores". Reglas de la dirección
   (25/08/2026). Si todavía no tiene tipo, se deja en NOMINA, que es lo más
   conservador: se ve raro en pantalla y alguien lo corrige. */
const CONCEPTO_POR_TIPO: Record<string, string> = {
  // Se escribe IGUAL que en lib/contabilidad.ts (singular y sin tilde). Antes
  // aquí decía "SERVICIOS POR FORMACIÓN" y allá "SERVICIO POR FORMACION": eran
  // dos conceptos distintos para la misma cosa y los informes salían partidos.
  PROFESOR:       'SERVICIO POR FORMACION',
  ADMINISTRATIVO: 'NOMINA',
  PROVEEDOR:      'PROVEEDOR',
};

/* REGLA DE LA DIRECCIÓN (25/08/2026, tarde):
   TODO pago a alguien que esté en el listado de NÓMINA se clasifica como
   SERVICIO POR FORMACION. Solo lleva NOMINA quien esté marcado expresamente
   como ADMINISTRATIVO.

   Antes, si a la persona no se le había puesto el tipo —o si la columna `tipo`
   todavía no existía en la base—, caía en 'NOMINA' y tocaba corregir a mano
   fila por fila. Ese era justo el reclamo. */
const conceptoDeTipo = (tipo: any, origen?: any) => {
  const t = String(tipo ?? '').trim().toUpperCase();
  if (CONCEPTO_POR_TIPO[t]) return CONCEPTO_POR_TIPO[t];
  // Sin tipo: manda la lista de donde salió.
  return String(origen ?? '').trim().toLowerCase() === 'proveedores'
    ? 'PROVEEDOR'
    : 'SERVICIO POR FORMACION';
};

/* ── RECONOCER AL TERCERO POR LA DESCRIPCIÓN DEL BANCO ────────────────────
   El banco escribe "PAGO A NOMIN fredy alexander r", "PAGO A PROVE sol marina
   vill", "TRANSF A Diana Fernan" — el nombre siempre RECORTADO. La idea
   (dirección, 25/08/2026) es que esto funcione con TODOS los profes y no con
   una lista escrita a mano, así que:

     1. Se le quita a la descripción el "PAGO A NOMIN / PAGO A PROVE / TRANSF
        A / PAGO A ..." de adelante, y queda el pedazo de nombre.
     2. Ese pedazo se compara contra el directorio de Nómina y Proveedores:
        vale si el nombre del tercero EMPIEZA por ese pedazo.
     3. Si el pedazo le sirve a DOS personas distintas, NO se asigna nada.
        Antes de arriesgarse a mandarle la plata a la ficha equivocada, la
        fila se deja sin código para que alguien la mire.

   Exige al menos 8 letras y dos palabras, para no cruzar por un "JUAN" suelto. */
const PREFIJOS_BANCO = /^(pago|transf\w*|abono|pse|traslado)\s*(de|a|al|para)?\s*(nomin\w*|prove\w*|tercero\w*)?\s*/;
const LARGO_MIN_NOMBRE = 8;

function trozoDeNombre(desc: any): string {
  let d = sinTildes(String(desc ?? '')).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  d = d.replace(PREFIJOS_BANCO, '').trim();
  return d;
}

type TerceroLibro = { documento: string; nombre: string; tipo: string; origen?: string };

/** Busca en el directorio a quién le corresponde esta descripción.
 *  Devuelve null si no hay nadie o si hay más de uno posible (ambiguo). */
function terceroPorDescripcion(desc: any, directorio: TerceroLibro[]): TerceroLibro | null {
  const trozo = trozoDeNombre(desc);
  if (trozo.length < LARGO_MIN_NOMBRE || trozo.split(' ').length < 2) return null;
  const candidatos = directorio.filter(t => {
    const n = sinTildes(t.nombre).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return false;
    return n.startsWith(trozo) || trozo.startsWith(n);
  });
  // Ambiguo (dos personas que empiezan igual) ⇒ mejor no asignar nada.
  const unicos = new Set(candidatos.map(c => c.documento));
  return unicos.size === 1 ? candidatos[0] : null;
}

// Columnas del Libro (para anchos ajustables por el usuario). El orden DEBE
// coincidir con el orden en que se pintan las celdas en el cuerpo de la tabla.
const COLS_LIBRO: { key: string; label: string; def: number }[] = [
  { key: 'num',        label: 'N°',          def: 74 },
  { key: 'cuenta',     label: 'CUENTA',      def: 62 },
  { key: 'fecha',      label: 'FECHA',       def: 102 },
  { key: 'desc',       label: 'DESCRIPCIÓN', def: 354 },
  { key: 'debito',     label: 'DÉBITO',      def: 86 },
  { key: 'credito',    label: 'CRÉDITO',     def: 90 },
  { key: 'saldo',      label: 'SALDO',       def: 100 },
  { key: 'concepto',   label: 'CONCEPTO',    def: 252 },
  { key: 'codigo',     label: 'CÓDIGO',      def: 88 },
  { key: 'deportista', label: 'DEPORTISTA',  def: 252 },
  { key: 'detalle',    label: 'DETALLE',     def: 212 },
  /* CONFIRMAR Y EDITAR, SEPARADAS Y AL FINAL (dirección, 01/09/2026).
     Antes era UNA sola columna sin título al principio del cuadro: para
     confirmar un pago tocaba leerlo hasta el final —concepto, código,
     deportista, detalle— y devolverse hasta el principio a darle al chulo.
     Ahora van al final, cada una con su nombre, y de primera la que más se
     usa: se confirma justo donde uno termina de mirar. */
  { key: 'confirmar',  label: 'CONFIRMAR',   def: 80 },
  { key: 'editar',     label: 'EDITAR',      def: 62 },
  /* ── LA COLUMNA "BORRAR" ─────────────────────────────────────────────────
     Historia corta: se puso el 02/09/2026, la dirección la mandó quitar el
     mismo día, y el 03/09/2026 la volvió a pedir («urgente colócame otra vez
     en libro dinámico eliminar por cada fila al menos»).

     Vuelve SOLO la papelera de a un renglón. Lo que NO vuelve es el cuadrito
     para señalar muchas y botarlas de una: eso fue lo que la dirección llamó
     «no recomendable», y con razón — un clic mal dado se llevaba veinte
     movimientos.

     Con sus tres seguros, los mismos de ELIMINAR FILAS de arriba:
       1. Pregunta mostrando la fila entera: N°, fecha, banco, valor y
          descripción, para saber qué se está botando.
       2. Avisa en mayúsculas si esa fila YA está confirmada en un estado de
          cuenta —borrarla del libro no le quita el pago al deportista—.
       3. Guarda una copia en la papelera del navegador (200 últimas). */
  { key: 'borrar',     label: 'BORRAR',      def: 62 },
  /* SEÑALAR VARIAS (dirección, 03/09/2026 — «casillas para chulear poder
     eliminar varios»). Va de última, al lado de la papelera: para que quede
     lejos de las casillas que se tocan todos los días (concepto, código,
     deportista, detalle) y no se marque sin querer al ir escribiendo. */
  { key: 'sel',        label: '✓',           def: 44 },
];

// Caché en memoria del libro: al volver del estado de cuenta NO se recarga de la nube
// (se reutiliza al instante). Se refresca al guardar cambios o subir un extracto.
let libroCache: { key: string; data: MovCont[] } | null = null;
// Ciclo de pagos de la plataforma (mismo orden que el estado de cuenta): FEB→DIC 2026
const MESES_CICLO = ['FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026', 'MAYO 2026', 'JUNIO 2026', 'JULIO 2026', 'AGOSTO 2026', 'SEPTIEMBRE 2026', 'OCTUBRE 2026', 'NOVIEMBRE 2026', 'DICIEMBRE 2026'];
// Opciones para el desplegable de la columna DETALLE (meses + inscripción, etc.)
const MESES_DET = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
/** Lo fijo de la lista: matrícula, inscripción y los doce meses del año. */
const DETALLE_BASE: string[] = (() => {
  const arr = ['INSCRIPCIÓN', 'MATRÍCULA'];
  for (const y of [2026]) for (const m of MESES_DET) arr.push(`${m} ${y}`);
  return arr;
})();

const DETALLE_OPCIONES: string[] = [...DETALLE_BASE, 'OTRO'];

/* ── ¿ESTO ES UN MES, UNA MATRÍCULA O UNA INSCRIPCIÓN? ─────────────────────
   (dirección, 04/09/2026 — «si está en institucional solo puede haber
    productos, no meses ni matrículas»)

   No basta con comparar contra la lista fija: en el libro hay escrito
   "MATRÍCULA 2026", "matricula 2025", "AGOSTO 2026"… con año, sin año, con
   tilde y sin tilde. Esta función reconoce todas esas formas, para que un mes
   no se cuele nunca en la lista de productos institucionales. */
const esDetalleDeMes = (t: any): boolean => {
  const x = String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  if (!x) return false;
  if (/^(MATRICULA|INSCRIPCION|OTRO)\b/.test(x)) return true;
  return MESES_DET.some(m => {
    const mm = m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return x === mm || x.startsWith(mm + ' ');
  });
};

/* ── LO INSTITUCIONAL ENTRA SOLO EN LA LISTA ──────────────────────────────
   (dirección, 02/09/2026 — «una vez los cree, que en la columna concepto
    aparezca INSTITUCIONAL y en el detalle pueda seleccionarlos, ubícalos
    después de diciembre»)

   La camiseta, la sudadera, la maleta —todo lo que se crea en PRODUCTOS como
   INSTITUCIONAL— aparece aquí solo, sin tocar el código. Van DESPUÉS DE
   DICIEMBRE y antes de OTRO, que es donde la dirección los quiere: primero lo
   de todos los meses, y al final lo que se vende de vez en cuando.

   El nombre del concepto se escribe SIN TILDE porque así está en la tabla de
   cuentas —INSTITUCIONAL—, y tiene que coincidir para que el desplegable de
   CONCEPTO lo reconozca. */
const CONCEPTO_INSTITUCIONAL = 'INSTITUCIONAL';

/** Compara dos nombres sin importar tildes, espacios de más ni mayúsculas. */
const mismoTexto = (a: any, b: any) =>
  String(a ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
  === String(b ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/* ── GASTOS DE REPRESENTACIÓN ─────────────────────────────────────────────
   Regla de la dirección (25/08/2026): en estas filas el DETALLE no es el mes
   —no se le está pagando la mensualidad a nadie—, sino EN QUÉ SE GASTÓ.
   Por eso, cuando el CONCEPTO de la fila dice GASTOS DE REPRESENTACIÓN, la
   casilla DETALLE cambia de lista y ofrece únicamente estas nueve opciones. */
const GASTOS_REPR_DETALLE = [
  'SALUD', 'ESTUDIO', 'VIVIENDA', 'SERVICIOS', 'ROPA',
  'ALIMENTACIÓN', 'REUNIÓN DE TRABAJO', 'ESTÉTICA', 'VIAJES',
];
/** ¿El concepto de esta fila es GASTOS DE REPRESENTACIÓN?
 *  Compara sin tildes y sin importar mayúsculas, para que dé igual cómo se haya
 *  escrito (REPRESENTACION / REPRESENTACIÓN, GASTO / GASTOS).
 *  Usa `sinTildes`, que está definido más abajo: no hay problema porque esta
 *  función solo se llama al dibujar la pantalla, nunca al cargar el archivo. */
const esGastoRepresentacion = (c: any) => /gastos?\s+de\s+representacion/.test(sinTildes(String(c ?? '')));

/* ── APORTE FORMACIÓN → SOLO LOS DOCE MESES ───────────────────────────────
   Regla de la dirección (05/09/2026): «si en concepto aparece APORTE
   FORMACIÓN, en el listado desplegable solo aparecen meses de enero a
   diciembre».

   El aporte de formación ES la mensualidad. Ahí no cabe la matrícula, ni la
   inscripción, ni una camiseta: solo el mes que se está pagando. Se compara
   sin tildes y sin importar mayúsculas, para que dé igual cómo esté escrito
   (APORTE FORMACION, APORTE DE FORMACIÓN, APORTE A LA FORMACION…). */
const MESES_DEL_ANIO: string[] = MESES_DET.map(m => `${m} 2026`);
const esAporteFormacion = (c: any) => /\bAPORTE\b.*\bFORMACION\b/.test(sinTildes(String(c ?? '')));

/* ── INSCRIPCIÓN → SOLO MATRÍCULA 2026 ────────────────────────────────────
   Regla de la dirección (05/09/2026): «si en el concepto aparece INSCRIPCIÓN,
   en detalle solo MATRÍCULA 2026». Es un pago que se hace una sola vez al
   entrar, así que la lista tiene una sola opción y no hay dónde equivocarse. */
const MATRICULA_UNICA: string[] = ['MATRÍCULA 2026'];
const esInscripcion = (c: any) => /^INSCRIPCION\b/.test(sinTildes(String(c ?? '')).trim());
/** Lista que le toca a la casilla DETALLE según el concepto de la fila.
 *
 *  ── LA LISTA SE ACUERDA DE LO QUE YA ESTÁ EN EL LIBRO ────────────────────
 *  (dirección, 04/09/2026 — «que quede un listado de desplegables con lo que
 *   estaba por memoria en el libro que subimos, más los nuevos que
 *   agreguemos»)
 *
 *  Antes la lista solo traía lo fijo —matrícula, inscripción y los meses— más
 *  lo que estuviera creado en el módulo de Productos. Pero en el libro que se
 *  subió ya venían escritas cosas como UNIFORME U26, CAMISETA PAPÁS 2026,
 *  PRESENTACION 2026 o BANDA 2026, puestas a mano una por una. Esas no
 *  aparecían en el desplegable, así que la contadora tenía que volver a
 *  escribirlas letra por letra cada vez, y bastaba una tilde de más para que
 *  quedaran dos versiones del mismo producto.
 *
 *  Ahora la lista se arma con tres cosas, en este orden:
 *    1. Lo fijo:      matrícula, inscripción y los meses del año.
 *    2. LA MEMORIA:   todo detalle que ya se haya usado en el libro.
 *    3. Lo nuevo:     los productos creados en el módulo Productos.
 *  Y al final, OTRO. Sin repetidos: si algo está en la memoria y también en
 *  el módulo, sale una sola vez. */
/* ── LA CASILLA SE ABRE VACÍA, PARA VER TODA LA LISTA ──────────────────────
   (dirección, 04/09/2026 — «si hay un mes ya colocado o producto, uno mira el
    listado desplegable y solo muestra el detalle en el que está. No señor: que
    pueda verlos todos, y que al cambiarlo obvio se deba aceptar el cambio»)

   El porqué: una casilla de escribir con listica (datalist) le muestra al
   navegador SOLO las opciones que empiezan por lo que ya está escrito. Si la
   fila decía "AGOSTO 2026", el desplegable mostraba "AGOSTO 2026" y nada más.
   Parecía una lista de una sola opción, y no lo era.

   La solución: al entrar a la casilla se vacía —ahí el navegador muestra la
   lista completa— y se guarda aparte lo que decía. Al salir:
     · si no se escogió nada, vuelve a quedar como estaba;
     · si se escogió algo distinto Y la casilla ya tenía valor, se PREGUNTA
       antes de cambiarlo. Llenar una vacía no pregunta: sería estorbar.  */
const alEntrarCasilla = (e: React.FocusEvent<HTMLInputElement>) => {
  const el = e.currentTarget;
  el.dataset.previo = el.value;
  el.value = '';
};
/** Devuelve el valor que hay que guardar, o null si no hay que tocar nada. */
const alSalirCasilla = (
  e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>,
  comoSeLlama: string,
): string | null => {
  const el = e.currentTarget as HTMLInputElement;
  const previo = el.dataset.previo ?? '';
  const ahora  = el.value.trim();
  if (!ahora) return null;                       // no escogió: queda como estaba
  if (ahora === previo.trim()) return null;      // escogió lo mismo
  if (previo.trim() && !window.confirm(
    `Cambiar ${comoSeLlama}:\n\n"${previo.trim()}"  →  "${ahora}"\n\n¿Está seguro?`
  )) { el.value = previo; return null; }
  return ahora;
};

const opcionesDetalle = (
  concepto: any,
  institucional: string[] = [],
  memoria: string[] = [],
  memoriaInst: string[] = [],
) => {
  if (esGastoRepresentacion(concepto)) return GASTOS_REPR_DETALLE;
  if (esAporteFormacion(concepto))     return MESES_DEL_ANIO;   // solo meses
  if (esInscripcion(concepto))         return MATRICULA_UNICA;  // solo matrícula

  /* ── SI EL CONCEPTO DICE INSTITUCIONAL, SOLO SALEN PRODUCTOS ─────────────
     (dirección, 04/09/2026 — «si en concepto dice institucional, en el
      desplegable de detalle y en el cuadro de editar solo aparecen los
      productos que por memoria ya eran institucional»)

     Tiene toda la lógica: en una fila institucional el DETALLE no es un mes ni
     la matrícula — es QUÉ SE VENDIÓ. Ofrecerle ahí los doce meses del año era
     invitar al error: bastaba un clic de más para dejar una camiseta anotada
     como "AGOSTO 2026", y esa fila después no cuadra con nada.

     Entonces, igual que ya pasaba con GASTOS DE REPRESENTACIÓN, la lista
     cambia entera: quedan únicamente los productos —los que la memoria del
     libro ya vio marcados como institucionales, más los creados en el módulo
     Productos Institucional— y OTRO al final, por si aparece algo nuevo. */
  const base = mismoTexto(concepto, CONCEPTO_INSTITUCIONAL)
    ? [...memoriaInst, ...institucional, 'OTRO']
    : [...DETALLE_BASE, ...memoria, ...institucional, 'OTRO'];

  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of base) {
    const limpio = String(t ?? '').trim();
    if (!limpio) continue;
    const llave = limpio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    out.push(limpio);
  }
  return out;
};

/* ── LAS LISTAS CERRADAS: CUÁLES SON Y CÓMO SE LLAMAN ─────────────────────
   Hay conceptos en los que el DETALLE NO se escribe a mano: se escoge de una
   lista y punto. Sugerir no basta —una casilla de escribir siempre deja
   teclear cualquier cosa—, así que en estos casos la casilla se vuelve un
   desplegable cerrado.

   Hoy son cuatro (todas reglas de la dirección):
     · GASTOS DE REPRESENTACIÓN → en qué se gastó   (25/08/2026)
     · INSTITUCIONAL            → qué producto      (04/09/2026)
     · APORTE FORMACIÓN         → de qué mes        (05/09/2026)
     · INSCRIPCIÓN              → MATRÍCULA 2026    (05/09/2026)

   Mañana, para agregar una regla nueva, basta con añadir una línea aquí: la
   pantalla se acomoda sola, tanto en el libro como en la ventana de editar. */
const listaCerradaDetalle = (
  concepto: any,
  institucional: string[] = [],
  memoria: string[] = [],
  memoriaInst: string[] = [],
): { titulo: string; opciones: string[] } | null => {
  if (esGastoRepresentacion(concepto))
    return { titulo: '— ¿en qué se gastó? —', opciones: GASTOS_REPR_DETALLE };
  if (esAporteFormacion(concepto))
    return { titulo: '— ¿de qué mes? —', opciones: MESES_DEL_ANIO };
  if (esInscripcion(concepto))
    return { titulo: '— ¿qué se pagó? —', opciones: MATRICULA_UNICA };
  if (mismoTexto(concepto, CONCEPTO_INSTITUCIONAL))
    return { titulo: '— ¿qué producto? —',
             opciones: opcionesDetalle(CONCEPTO_INSTITUCIONAL, institucional, memoria, memoriaInst) };
  return null;
};

/* ── PAGOS A TERCEROS (NÓMINA Y PROVEEDORES) ──────────────────────────────
   Regla de la dirección (25/08/2026): al escribir la CÉDULA o el NIT de un
   tercero en la columna CÓDIGO del Libro, la fila queda de una vez con el
   NOMBRE COMPLETO y con este concepto. En DETALLE solo se ofrecen los MESES
   del año, porque a estas personas se les paga mensual — no llevan matrícula
   ni inscripción. El directorio sale del módulo "Nómina y Proveedores". */
const MESES_NOMINA: string[] = MESES_DET.map(m => `${m} 2026`);

/** Corre una fecha aaaa-mm-dd un día para atrás (-1) o para adelante (+1).
 *  Se usa al buscar un soporte por fecha: el banco a veces registra el pago
 *  al día siguiente de que el papá manda la foto. — 05/09/2026 */
const correrDia = (aaaammdd: string, pasos: number): string => {
  const t = String(aaaammdd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const [a, m, d] = t.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  f.setDate(f.getDate() + pasos);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
};

function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel'));
    document.head.appendChild(s);
  });
}
function fechaISO(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}
function numVal(v: any): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function pick(obj: any, ...cands: string[]): any {
  const keys = Object.keys(obj);
  for (const c of cands) { const k = keys.find(k => normNombre(k) === normNombre(c)); if (k) return obj[k]; }
  for (const c of cands) { const k = keys.find(k => normNombre(k).includes(normNombre(c))); if (k) return obj[k]; }
  return '';
}
/* ── SEMÁFORO DE PAGOS ────────────────────────────────────────
   Compara lo que entró en el extracto contra lo que el deportista
   DEBÍA pagar y le pone color a cada fila:
     VERDE    valor exacto (mensualidad o mensualidad menos 10%)
     AMARILLO el mes falta o está repetido
     ROJO     el valor no cuadra (abonó de menos o pagó de más)
     MORADO   el diccionario no reconoce la cuenta (sin código)
   NADA se publica solo: el semáforo únicamente pinta y cuenta.
   ──────────────────────────────────────────────────────────── */
const sinTildes = (t: string) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Mensualidad segun programa y sede — misma tabla del estado de cuenta. */
function calcTarifaNum(programa: string, sede: string): number {
  const p = sinTildes(programa), s = sinTildes(sede);
  if (s.includes('niqu')) {
    if (p.includes('estimul')) return 70000;
    if (p.includes('formac'))  return 115000;
    return 138000;
  }
  if (p.includes('estimul')) return 80000;
  return 138000;
}

function colDeportista(d: Deportista, rx: RegExp): string {
  const cols = (d as any)._columnas ?? {};
  const k = Object.keys(cols).find(c => rx.test(c.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}

/** Codigos que empiezan por B (y no MB) son BECADOS: no pagan mensualidad. */
function esBecado(cod: string): boolean {
  const c = String(cod ?? '').trim();
  return /^b/i.test(c) && !/^mb/i.test(c);
}

const pesosCO = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

/** "AGOSTO 2026" → 8 · "MATRÍCULA 2026" → 0 · desconocido → -1 */
function mesNumDeDetalle(det: string): number {
  const t = sinTildes(det);
  if (/matricul|inscrip/.test(t)) return 0;
  const nombres = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  for (let i = 0; i < 12; i++) if (t.includes(nombres[i])) return i + 1;
  return -1;
}

/** Mes (1-12) en que se afilió el deportista. 0 si no se puede saber. */
function mesDeAfiliacion(valor: string): number {
  const s = String(valor ?? '').trim();
  if (!s) return 0;
  // dd/mm/aaaa
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return Number(m[2]) || 0;
  // aaaa-mm-dd
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return Number(m[2]) || 0;
  // número de serie de Excel
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.getUTCMonth() + 1;
  }
  return 0;
}

type ColorSem = 'verde' | 'amarillo' | 'rojo' | 'morado' | 'na';

/** Colores PASTEL para sombrear la celda del mes (DETALLE), con letra negra. */
const PASTEL_SEM: Record<string, { bg: string; borde: string }> = {
  verde:    { bg: '#bbf7d0', borde: '#16a34a' },   // verde pastel
  amarillo: { bg: '#fef08a', borde: '#eab308' },   // amarillo pastel
  rojo:     { bg: '#fecaca', borde: '#ef4444' },   // rojo pastel
  morado:   { bg: '#e9d5ff', borde: '#9333ea' },   // morado pastel
};

const COLOR_SEM: Record<string, { et: string; cls: string; act: string }> = {
  verde:    { et: 'Verde',    cls: 'text-[#5BE39B] bg-[rgba(0,176,80,.14)] border-[rgba(0,176,80,.45)] hover:bg-green-100',       act: 'bg-green-600 text-white border-green-600' },
  amarillo: { et: 'Amarillo', cls: 'text-[#E0A33A] bg-[rgba(224,163,58,.14)] border-amber-200 hover:bg-amber-100',       act: 'bg-amber-500 text-white border-amber-500' },
  rojo:     { et: 'Rojo',     cls: 'text-[#F08A87] bg-[rgba(192,80,77,.14)] border-[rgba(192,80,77,.45)] hover:bg-[rgba(192,80,77,.20)]',               act: 'bg-red-600 text-white border-red-600' },
  morado:   { et: 'Morado',   cls: 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100',   act: 'bg-purple-600 text-white border-purple-600' },
};

function getCod(d: Deportista): string {
  const cols = (d as any)._columnas ?? {};
  const k = Object.keys(cols).find(c => /^c[oó]d/i.test(c.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}
const fmt = (n: number) => (n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Agarrador visible para redimensionar una columna (arrastrar / doble clic = restablecer)
function ColResizer({ onDown, onReset }: { onDown: (e: React.MouseEvent) => void; onReset: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <span
      onMouseDown={onDown}
      onDoubleClick={onReset}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Arrastra para ajustar el ancho · doble clic para restablecer"
      style={{
        position: 'absolute', top: 0, right: -6, height: '100%', width: 14, zIndex: 6,
        cursor: 'col-resize', display: 'flex', justifyContent: 'center', alignItems: 'stretch',
        background: hov ? 'rgba(255,255,255,0.15)' : 'transparent', touchAction: 'none',
      }}
    >
      <span style={{ width: hov ? 3 : 2, background: hov ? '#ffffff' : 'rgba(255,255,255,0.45)' }} />
    </span>
  );
}

export default function ContabilidadPage() {
  const router = useRouter();
  // Para volver exactamente aquí con "Atrás": refs de control del scroll y del estado
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRestaurado = useRef(false);
  const primerResetLimite = useRef(true);
  const saltarReset = useRef(false);

  const [banco, setBanco] = useState(BANCOS[0]);
  const [vista, setVista] = useState<'subir' | 'libro' | 'cuentas' | 'desconocidas' | 'diccionario'>('subir');
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  /* Lo INSTITUCIONAL creado en la pantalla de Productos: camiseta, sudadera,
     maleta… Entra solo en la lista de DETALLE, después de diciembre.
     — dirección, 02/09/2026 */
  const [institucionales, setInstitucionales] = useState<string[]>([]);
  // Directorio de NÓMINA Y PROVEEDORES (documento → nombre y tipo)
  const [terceros, setTerceros] = useState<Tercero[]>([]);

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const codMap = useMemo(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const c = getCod(d); if (c) m[c] = d._nombre; });
    return m;
  }, [deportistas]);
  /* NOMBRE DEL DEPORTISTA DE UNA FILA — 25/08/2026
     Hasta hoy la pantalla mostraba únicamente el nombre GUARDADO en la fila, que
     se escribe una sola vez (al subir el extracto o al escribir el código a mano)
     y después se queda congelado. Si en ese momento el código todavía no existía
     —porque el deportista se creó o se le cambió el código después— la fila
     quedaba con código pero SIN nombre, para siempre.
     Ahora, si la fila no trae nombre guardado, se saca del código en el momento
     de mostrarlo. Así basta con que el código sea correcto. */
  const nombreDeFila = (m: any): string =>
    String(m?.deportista ?? '').trim() || codMap[String(m?.codigo ?? '').trim()] || '';

  // código → id del deportista (para abrir su estado de cuenta desde el libro)
  const codToId = useMemo(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const c = getCod(d); if (c) m[c] = d.id; });
    return m;
  }, [deportistas]);
  // nombre → id del deportista (respaldo del link cuando el código no está en la ficha)
  const nombreToId = useMemo(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const n = normNombre(d._nombre); if (n) m[n] = d.id; });
    return m;
  }, [deportistas]);

  /* Directorio de TERCEROS: documento (cédula o NIT) → nombre y tipo.
     Manda lo que esté en el módulo "Nómina y Proveedores"; la lista de
     EMPLEADOS_NOMINA del código queda solo como respaldo, para que el Libro
     siga reconociendo a la gente aunque la base no responda. */
  const tercerosIdx = useMemo(() => {
    // `origen` dice de qué lista salió (nomina o proveedores). Se guarda porque
    // la regla del concepto depende de eso: todo el que esté en NÓMINA es
    // SERVICIO POR FORMACION salvo que se marque ADMINISTRATIVO. — 25/08/2026
    const m: Record<string, { nombre: string; tipo: string; origen: string }> = {};
    for (const doc of Object.keys(EMPLEADOS_NOMINA)) m[doc] = { ...EMPLEADOS_NOMINA[doc], origen: 'nomina' };
    for (const t of terceros) m[t.documento] = { nombre: t.nombre, tipo: t.tipo || '', origen: t.origen || 'nomina' };
    return m;
  }, [terceros]);
  /** El mismo directorio, en lista, para buscar por el nombre de la descripción. */
  const tercerosLista = useMemo<TerceroLibro[]>(
    () => Object.keys(tercerosIdx).map(doc => ({ documento: doc, nombre: tercerosIdx[doc].nombre, tipo: tercerosIdx[doc].tipo, origen: tercerosIdx[doc].origen })),
    [tercerosIdx],
  );
  /** A quién le corresponde esta descripción del banco (o null si no se sabe). */
  const terceroDeDesc = (desc: any) => terceroPorDescripcion(desc, tercerosLista);
  /** Gente de NÓMINA (profesores y administrativos): se les paga MENSUAL, así
   *  que su DETALLE solo ofrece los meses del año. A un PROVEEDOR no: su
   *  detalle sigue siendo texto libre, porque una factura no es mensual. */
  const esNominaMensual = (cod: any) => {
    const t = tercerosIdx[String(cod ?? '').trim()];
    return !!t && String(t.tipo ?? '').trim().toUpperCase() !== 'PROVEEDOR';
  };

  const [mapeoCount, setMapeoCount] = useState(0);
  const [idx, setIdx] = useState<MapeoIdx>({ cuenta: {}, nombre: {}, pagador: {} });
  const [revision, setRevision] = useState<MovCont[]>([]);
  const mapeoQueue = useRef<Record<string, { tipo: string; clave: string; codigo: string }>>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sembrando, setSembrando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [movCount, setMovCount] = useState(-1);
  const [importando, setImportando] = useState(false);

  const [libro, setLibro] = useState<MovCont[]>([]);

  /* LA MEMORIA DEL LIBRO: los DETALLE que ya se han usado alguna vez, sacados
     de los movimientos que están cargados en pantalla. Se quitan los meses,
     la matrícula y los gastos de representación, que ya van por su lado.
     — dirección, 04/09/2026 */
  const memoriaDetalle = useMemo(() => {
    const fijos = new Set(
      [...DETALLE_BASE, ...GASTOS_REPR_DETALLE, 'OTRO'].map(t =>
        t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()),
    );
    const cuenta = new Map<string, number>();
    for (const m of libro) {
      const t = String(m.detalle ?? '').trim();
      if (!t) continue;
      const llave = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      if (fijos.has(llave)) continue;
      if (esDetalleDeMes(t)) continue;          // "MATRÍCULA 2026" y demás
      /* Los gastos de representación viejos venían con "G.R " adelante. */
      if (llave.startsWith('G.R ')) continue;
      cuenta.set(t.toUpperCase(), (cuenta.get(t.toUpperCase()) ?? 0) + 1);
    }
    /* De más usado a menos: lo que más se repite es lo que más se va a
       volver a necesitar, y así queda de primero en la listica. */
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [libro]);

  /* LA MEMORIA, PERO SOLO DE LO INSTITUCIONAL (dirección, 04/09/2026).
     Aquí no vale cualquier detalle que se haya usado alguna vez: valen los que
     estaban en una fila cuyo CONCEPTO decía INSTITUCIONAL. Es lo que de verdad
     se ha vendido. Hoy son doce: presentación, camiseta de papás, uniformes,
     banda, medias, sombrilla… todos escritos a mano en su momento. */
  const memoriaInstitucional = useMemo(() => {
    const fijos = new Set(
      [...DETALLE_BASE, 'OTRO'].map(t =>
        t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()),
    );
    const cuenta = new Map<string, number>();
    for (const m of libro) {
      if (!mismoTexto(m.concepto, CONCEPTO_INSTITUCIONAL)) continue;
      const t = String(m.detalle ?? '').trim();
      if (!t) continue;
      const llave = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      if (fijos.has(llave)) continue;
      if (esDetalleDeMes(t)) continue;     // un mes ahí fue un clic mal dado
      cuenta.set(t.toUpperCase(), (cuenta.get(t.toUpperCase()) ?? 0) + 1);
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [libro]);
  const [cargandoLibro, setCargandoLibro] = useState(false);
  // Vista Libro: cuenta a mostrar ('TODAS' = las tres pegadas) y filtros por columna
  const [libroBanco, setLibroBanco] = useState<string>('TODAS');
  const [fil, setFil] = useState({ banco: '', fecha: '', desc: '', debito: '', credito: '', saldo: '', concepto: '', codigo: '', deportista: '', detalle: '' });
  // Cuántas filas se dibujan a la vez (los últimos N movimientos; "Mostrar más" trae más atrás)
  const [limite, setLimite] = useState(100);
  // Filtro con retraso: no recalcular en cada tecla (se aplica al dejar de escribir)
  const [filDebounced, setFilDebounced] = useState({ banco: '', fecha: '', desc: '', debito: '', credito: '', saldo: '', concepto: '', codigo: '', deportista: '', detalle: '' });
  // Filtros de trabajo pendiente del LIBRO (barra del encabezado).
  // 25/08/2026 · dirección: se quitaron los botones "Por confirmar / orientar"
  // (naranja) y "Sin concepto" (azul). En su lugar quedan dos, que separan lo que
  // falta clasificar por el lado del que sale y el lado del que entra:
  //   🔴 Egresos sin concepto  = filas con DÉBITO  y la casilla CONCEPTO vacía
  //   🟢 Ingresos sin concepto = filas con CRÉDITO y la casilla CONCEPTO vacía
  // Se pueden prender los dos a la vez: ahí se ven todas las filas sin concepto.
  const [soloEgresoSinConc,  setSoloEgresoSinConc]  = useState(false);
  const [soloIngresoSinConc, setSoloIngresoSinConc] = useState(false);
  const [soloSinDetalle,  setSoloSinDetalle]  = useState(false);
  const [soloSospechosas, setSoloSospechosas] = useState(false);
  /* MAL ORIENTADAS — la primera "ley" del libro. — 04/09/2026 */
  const [soloMalOrientadas, setSoloMalOrientadas] = useState(false);
  // Filtro por el chulo (estado de confirmación): 'todos' | 'verde' (confirmado) | 'rojo' (pendiente)
  const [filChulo, setFilChulo] = useState<'todos' | 'verde' | 'rojo'>('todos');
  const [filSem, setFilSem] = useState<'todos' | 'verde' | 'amarillo' | 'rojo' | 'morado'>('todos');
  const [publicandoVerdes, setPublicandoVerdes] = useState(false);
  // Modo de búsqueda en la columna CÓDIGO:
  //   'exacto'   → para códigos de deportista (evita cruces con cifras que contienen esos dígitos)
  //   'contiene' → para números de cuenta de proveedores/empleados (busca por parte del número)
  const [filCodModo, setFilCodModo] = useState<'exacto' | 'contiene'>('exacto');
  // Editor por movimiento (para editar y dividir una cifra en varias filas)
  const [editRow, setEditRow] = useState<{ orig: MovCont; filas: MovCont[] } | null>(null);
  const [guardandoEd, setGuardandoEd] = useState(false);
  // Alta MANUAL de una fila nueva en el libro (movimiento que no vino del Excel del banco)
  type FilaManual = { banco: string; fecha: string; descripcion: string; debito: string; credito: string; concepto: string; codigo: string; deportista: string; detalle: string };
  const [nuevaFila, setNuevaFila] = useState<FilaManual | null>(null);
  const [guardandoManual, setGuardandoManual] = useState(false);
  // Celda del libro que se está editando (para no dibujar 300 desplegables a la vez)
  const [editCell, setEditCell] = useState<{ id: string; campo: 'concepto' | 'detalle' | 'codigo' | 'deportista' } | null>(null);
  // Cambios pendientes del libro (NO se guardan hasta pulsar "Guardar ahora")
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [guardandoCambios, setGuardandoCambios] = useState(false);
  // Publicación MANUAL de pagos del libro → estado de cuenta (solo al autorizar)
  const [publicando, setPublicando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [reclasificando, setReclasificando] = useState(false);
  const [aplicandoNomina, setAplicandoNomina] = useState(false);
  // Fila a resaltar al volver del estado de cuenta (la que clicaste)
  const [resaltarId, setResaltarId] = useState<string | null>(null);
  // Fila bajo el mouse (sombreado estilo Excel para saber en qué fila se está trabajando)
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Pagos ya publicados en esta sesión (clave código|mes) → el chulito se pone verde
  const [publicadas, setPublicadas] = useState<Set<string>>(new Set());
  // Borrado de filas basura del libro (por N° de fila)
  const [borrandoFilas, setBorrandoFilas] = useState(false);
  // Publicación de MATRÍCULAS al estado de cuenta
  const [publicandoMatr, setPublicandoMatr] = useState(false);
  // Estado de cuenta abierto EN VENTANA sobre el libro (el libro no se mueve)
  const [estadoCuentaUrl, setEstadoCuentaUrl] = useState<string | null>(null);
  /* ── ¿EN QUÉ FILA IBA? ────────────────────────────────────────────────────
     Regla de la dirección (05/09/2026): «igual que en soportes, pero en el
     libro contable, y no franja roja —que esa ya está— sino una franja GRIS
     CLARA que no existe».

     Cuando se abre el estado de cuenta desde una fila del libro, se guarda esa
     fila. Al cerrar la ventana, la fila queda pintada de gris claro y la
     pantalla se desplaza hasta ella, para no perder el punto entre miles de
     movimientos. La franja se borra sola al primer clic en cualquier lado. */
  const [filaDondeIba, setFilaDondeIba] = useState<string | null>(null);
  // Anchos ajustables de las columnas del Libro (se guardan en el navegador)
  /* ── LAS FILAS SEÑALADAS PARA BORRAR ────────────────────────────────────
     (dirección, 03/09/2026). Se guardan por ID, no por número de renglón: si
     se cambia el filtro o el orden, lo señalado sigue siendo lo mismo. */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  function alternarMarca(id: string) {
    setMarcadas(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const [colW, setColW] = useState<Record<string, number>>(() => Object.fromEntries(COLS_LIBRO.map(c => [c.key, c.def])));
  useEffect(() => {
    try {
      const s = localStorage.getItem('cont_colW_libro_v3');
      const saved = s ? JSON.parse(s) : {};
      // Migración única: el ancho por defecto de la columna N° pasó a 70. Quitamos el valor
      // viejo guardado una sola vez, sin tocar los anchos que ya ajustaste en otras columnas.
      if (!localStorage.getItem('cont_colW_num70')) {
        delete saved.num;
        localStorage.setItem('cont_colW_num70', '1');
      }
      setColW(w => ({ ...w, ...saved }));
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('cont_colW_libro_v3', JSON.stringify(colW)); } catch { /* noop */ }
  }, [colW]);
  function iniciarResize(key: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = colW[key] ?? 80;
    const onMove = (ev: MouseEvent) => setColW(prev => ({ ...prev, [key]: Math.max(28, startW + (ev.clientX - startX)) }));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function resetCol(key: string) { setColW(prev => ({ ...prev, [key]: COLS_LIBRO.find(c => c.key === key)?.def ?? 80 })); }
  function pasoCol(key: string, delta: number) { setColW(prev => ({ ...prev, [key]: Math.max(28, (prev[key] ?? 80) + delta) })); }
  function resetTodasCols() { setColW(Object.fromEntries(COLS_LIBRO.map(c => [c.key, c.def]))); }
  const [panelCols, setPanelCols] = useState(false);
  // Cambiar concepto/detalle/código en una celda del libro. NO guarda: queda PENDIENTE
  // hasta pulsar "Guardar ahora". Al cambiar el código, se actualiza el deportista
  // (y si se deja vacío, se "des-orienta" el pago: código y deportista quedan en blanco).
  function cambiarCampoLibro(m: MovCont, campo: 'concepto' | 'detalle' | 'codigo' | 'deportista', val: string) {
    setLibro(prev => prev.map(x => {
      if (x.id !== m.id) return x;
      const next: MovCont = { ...x, [campo]: val };

      /* ── AL ESCOGER ALGO INSTITUCIONAL, EL CONCEPTO SE PONE SOLO ──────────
         (dirección, 02/09/2026)

         Si en DETALLE se escoge la camiseta, la sudadera o cualquier cosa del
         catálogo institucional, el CONCEPTO queda en INSTITUCIONAL sin que
         haya que ir a buscarlo en la otra casilla. Es el único caso en que un
         detalle manda sobre el concepto, y es el que la dirección pidió.

         Solo se pone si la casilla del concepto está EN BLANCO o si ya decía
         INSTITUCIONAL: si alguien le puso otro concepto a propósito, no se le
         pisa. */
      if (campo === 'detalle' && institucionales.some(p => mismoTexto(p, val))) {
        const actual = String(next.concepto ?? '').trim();
        if (!actual || mismoTexto(actual, CONCEPTO_INSTITUCIONAL)) {
          next.concepto = CONCEPTO_INSTITUCIONAL;
        }
      }

      if (campo === 'codigo') {
        // Si el código es de un deportista, autollenar su nombre.
        // Si es la cédula de un empleado de nómina, autollenar su nombre (y concepto NÓMINA).
        // Si se deja vacío, limpiar el nombre.
        // Si es un código/cédula que NO conocemos (proveedor en un egreso), se CONSERVA
        // el nombre que ya tenga (para poder escribirlo a mano).
        const clave = val.trim();
        if (!clave) next.deportista = '';
        else if (codMap[clave]) next.deportista = codMap[clave];
        else if (tercerosIdx[clave]) {
          /* TERCERO de nómina o proveedores (regla de la dirección, 25/08/2026):
             al escribir la cédula/NIT sale el NOMBRE COMPLETO y el concepto
             SERVICIOS POR FORMACIÓN. El mes se escoge aparte, en DETALLE.
             Si el mes que traía no es de la lista mensual, se borra: a estas
             personas no se les cobra matrícula ni inscripción. */
          next.deportista = tercerosIdx[clave].nombre;
          next.concepto = conceptoDeTipo(tercerosIdx[clave].tipo, tercerosIdx[clave].origen);
          const detActual = String(next.detalle ?? '').trim().toUpperCase();
          const esMensual = String(tercerosIdx[clave].tipo ?? '').trim().toUpperCase() !== 'PROVEEDOR';
          if (esMensual && detActual && !MESES_NOMINA.includes(detActual)) next.detalle = '';
        }
      }
      return next;
    }));
    setDirtyIds(prev => { const n = new Set(prev); if (m.id) n.add(m.id); return n; });
  }
  async function guardarCambiosLibro() {
    if (!dirtyIds.size) return;
    setGuardandoCambios(true);
    const ids = Array.from(dirtyIds);
    let ok = true;
    const aprender: { tipo: string; clave: string; codigo: string }[] = [];
    for (const id of ids) {
      const m = libro.find(x => x.id === id);
      if (!m) continue;
      const r = await actualizarMovimiento(id, { concepto: m.concepto, detalle: m.detalle, codigo: m.codigo, deportista: m.deportista });
      if (!r) ok = false;
      // Aprender el cruce en el DICCIONARIO: si la fila quedó con código y trae referencia
      // confiable (no PAGO QR ni "null"), se guarda para que el próximo extracto la cruce solo.
      const cod = String(m.codigo ?? '').trim();
      const ref = String(m.referencia ?? '');
      const refConfiable = !/PAGO\s*QR/i.test(m.descripcion || '') && !/null/i.test(ref);
      if (cod && ref && refConfiable) {
        const refDig = soloDigitos(ref);
        if (refDig.length >= 5) aprender.push({ tipo: 'cuenta', clave: refDig, codigo: cod });
        else { const kn = normNombre(ref); if (kn) aprender.push({ tipo: 'nombre', clave: kn, codigo: cod }); }
      }
      /* ── Y AQUÍ SE APRENDE EL PAGADOR DEL QR (dirección, 01/09/2026) ───────
         En un PAGO QR la referencia no sirve —es la cuenta del recaudo—, así
         que se guarda a qué código corresponde el NOMBRE que el banco escribió
         en la descripción. La próxima vez que llegue un pago de ese mismo
         pagador, el código viene propuesto (en amarillo) y usted confirma. */
      if (cod && /PAGO\s*QR/i.test(m.descripcion || '')) {
        const kp = clavePagador(m.descripcion);
        if (kp) aprender.push({ tipo: 'pagador', clave: kp, codigo: cod });
      }
    }
    if (aprender.length) { try { await guardarMapeo(aprender); } catch { /* noop */ } }
    setGuardandoCambios(false);
    if (ok) {
      setDirtyIds(new Set());
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: libro }; // refresca caché
      flash(`✓ ${ids.length} cambio(s) guardado(s)${aprender.length ? ' · ' + aprender.length + ' al diccionario' : ''}`);
    } else flash('⚠ Algunos cambios no se pudieron guardar');
  }
  function descartarCambiosLibro() {
    if (!window.confirm('¿Descartar los cambios sin guardar y volver a como estaba?')) return;
    setDirtyIds(new Set());
    cargarLibro();
  }
  // Publicar MANUALMENTE los pagos verificados del libro al estado de cuenta de los deportistas
  /** Publica al estado de cuenta UNICAMENTE las filas verdes del semaforo.
   *  Verde = el valor coincide exacto con la mensualidad o con la mensualidad
   *  menos el 10%. No toca amarillos, rojos ni morados. */
  async function confirmarVerdes() {
    const filas = verdesPendientes;
    if (!filas.length) { flash('No hay pagos verdes pendientes por confirmar.'); return; }

    const total = filas.reduce((a, m) => a + (Number(m.credito) || 0), 0);
    const muestra = filas.slice(0, 8)
      .map(m => `  · ${m.codigo}  ${m.detalle}  ${pesosCO(Number(m.credito) || 0)}  ${String(m.deportista || '').slice(0, 22)}`)
      .join('\n');

    const aviso =
      'CONFIRMAR PAGOS VERDES\n\n' +
      `Se van a publicar ${filas.length} pagos por ${pesosCO(total)}.\n\n` +
      'Todos tienen el valor EXACTO de la mensualidad (o la mensualidad menos el 10%).\n' +
      'NO se tocan los amarillos, ni los rojos, ni los morados.\n\n' +
      muestra + (filas.length > 8 ? `\n  … y ${filas.length - 8} mas` : '') +
      '\n\n¿Confirmar?';
    if (!window.confirm(aviso)) return;

    setPublicandoVerdes(true);
    flash(`Publicando ${filas.length} pagos verdes…`);
    try {
      // Se agrupa por deportista + mes, igual que lo hace el boton general.
      const acc: Record<string, { sum: number; banco: string; fecha: string; cod: string; det: string }> = {};
      for (const m of filas) {
        const cod = String(m.codigo ?? '').trim(), det = String(m.detalle ?? '').trim();
        const k = cod + '|' + det;
        const cur = acc[k] || { sum: 0, banco: '', fecha: '', cod, det };
        cur.sum += Number(m.credito) || 0;
        if ((m.fecha ?? '') >= cur.fecha) { cur.fecha = m.fecha ?? ''; cur.banco = m.banco ?? cur.banco; }
        acc[k] = cur;
      }
      const rows = Object.values(acc).map(v => ({
        deportista_id: v.cod,
        detalle: v.det,
        vPagado: '$ ' + Math.round(v.sum).toLocaleString('es-CO'),
        destino: v.banco,
        fecha: v.fecha,
      }));
      const r = await publicarPagosEstado(rows);
      if (r.ok) {
        setPublicadas(prev => { const n = new Set(prev); for (const x of rows) n.add(x.deportista_id + '|' + x.detalle); return n; });
        flash(`✓ ${r.n.toLocaleString('es-CO')} pagos verdes publicados al estado de cuenta`);
      } else flash('⚠ Error al publicar: ' + (r.msg || ''));
    } catch (e: any) {
      flash('⚠ Error al publicar: ' + (e?.message || e));
    }
    setPublicandoVerdes(false);
  }

  /** Publica al estado de cuenta las MATRÍCULAS pendientes (una por deportista y
   *  concepto). Igual que los verdes: muestra qué se va a publicar y solo actúa
   *  cuando una persona confirma. No toca mensualidades. */
  async function confirmarMatriculas() {
    const filas = matriculasPendientes;
    if (!filas.length) { flash('No hay matrículas pendientes por confirmar.'); return; }

    const total = filas.reduce((a, m) => a + (Number(m.credito) || 0), 0);
    const muestra = filas.slice(0, 8)
      .map(m => `  · ${m.codigo}  ${m.detalle}  ${pesosCO(Number(m.credito) || 0)}  ${String(m.deportista || '').slice(0, 22)}`)
      .join('\n');

    const aviso =
      'CONFIRMAR MATRÍCULAS\n\n' +
      `Se van a publicar ${filas.length} matrícula(s) por ${pesosCO(total)}.\n\n` +
      'La matrícula no se compara contra la mensualidad: se publica el valor tal\n' +
      'como entró al banco. Revisa la lista antes de aceptar.\n\n' +
      muestra + (filas.length > 8 ? `\n  … y ${filas.length - 8} mas` : '') +
      '\n\n¿Confirmar?';
    if (!window.confirm(aviso)) return;

    setPublicandoMatr(true);
    flash(`Publicando ${filas.length} matrícula(s)…`);
    try {
      const acc: Record<string, { sum: number; banco: string; fecha: string; cod: string; det: string }> = {};
      for (const m of filas) {
        const cod = String(m.codigo ?? '').trim(), det = String(m.detalle ?? '').trim();
        const k = cod + '|' + det;
        const cur = acc[k] || { sum: 0, banco: '', fecha: '', cod, det };
        cur.sum += Number(m.credito) || 0;
        if ((m.fecha ?? '') >= cur.fecha) { cur.fecha = m.fecha ?? ''; cur.banco = m.banco ?? cur.banco; }
        acc[k] = cur;
      }
      const rows = Object.values(acc).map(v => ({
        deportista_id: v.cod,
        detalle: v.det,
        vPagado: '$ ' + Math.round(v.sum).toLocaleString('es-CO'),
        destino: v.banco,
        fecha: v.fecha,
      }));
      const r = await publicarPagosEstado(rows);
      if (r.ok) {
        setPublicadas(prev => { const n = new Set(prev); for (const x of rows) n.add(x.deportista_id + '|' + x.detalle); return n; });
        flash(`✓ ${r.n.toLocaleString('es-CO')} matrícula(s) publicadas al estado de cuenta`);
      } else flash('⚠ Error al publicar: ' + (r.msg || ''));
    } catch (e: any) {
      flash('⚠ Error al publicar: ' + (e?.message || e));
    }
    setPublicandoMatr(false);
  }

  async function actualizarEstadosCuenta() {
    // Si hay cambios en amarillo sin guardar, los guardamos automáticamente antes de
    // publicar (así no te bloquea y lo que se publica es lo último que editaste).
    if (dirtyIds.size > 0) {
      const idsPend = Array.from(dirtyIds);
      let okg = true;
      for (const id of idsPend) {
        const mm = libro.find(x => x.id === id);
        if (!mm) continue;
        const rr = await actualizarMovimiento(id, { concepto: mm.concepto, detalle: mm.detalle, codigo: mm.codigo, deportista: mm.deportista });
        if (!rr) okg = false;
      }
      if (!okg) { flash('⚠ Algunos cambios no se pudieron guardar; revísalos antes de publicar.'); return; }
      setDirtyIds(new Set());
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: libro };
    }
    if (!window.confirm(
      'AUTORIZAR ACTUALIZACIÓN DE ESTADOS DE CUENTA\n\n' +
      'Se publicarán al estado de cuenta de cada deportista TODOS los pagos del libro que tengan CÓDIGO y MES (Detalle) asignados.\n' +
      '• Solo actualiza lo PAGADO (no toca lo que deben / lo cargado).\n' +
      '• Puedes repetirlo cuando quieras; vuelve a dejarlo al día.\n\n' +
      '¿Continuar?'
    )) return;
    setPublicando(true);
    flash('Publicando pagos al estado de cuenta…');
    try {
      const movs = await getMovimientos(); // todos los movimientos, de todas las cuentas
      const acc: Record<string, Record<string, { sum: number; banco: string; fecha: string }>> = {};
      for (const m of movs) {
        const cod = String(m.codigo ?? '').trim();
        const det = String(m.detalle ?? '').trim();
        if (!cod || !det || !(Number(m.credito) > 0)) continue;
        acc[cod] = acc[cod] || {};
        const cur = acc[cod][det] || { sum: 0, banco: '', fecha: '' };
        cur.sum += Number(m.credito) || 0;
        if ((m.fecha ?? '') >= cur.fecha) { cur.fecha = m.fecha ?? ''; cur.banco = m.banco ?? cur.banco; }
        acc[cod][det] = cur;
      }
      const rows: { deportista_id: string; detalle: string; vPagado: string; destino: string; fecha: string }[] = [];
      for (const cod of Object.keys(acc)) {
        for (const det of Object.keys(acc[cod])) {
          const v = acc[cod][det];
          rows.push({ deportista_id: cod, detalle: det, vPagado: '$ ' + Math.round(v.sum).toLocaleString('es-CO'), destino: v.banco, fecha: v.fecha });
        }
      }
      const r = await publicarPagosEstado(rows);
      if (r.ok) {
        setPublicadas(prev => { const n = new Set(prev); for (const x of rows) n.add(x.deportista_id + '|' + x.detalle); return n; });
        flash(`✓ Estados de cuenta actualizados · ${r.n.toLocaleString('es-CO')} pagos publicados`);
      } else flash('⚠ Error al publicar: ' + (r.msg || ''));
    } catch (e: any) { flash('⚠ Error al publicar: ' + (e?.message || e)); }
    setPublicando(false);
  }
  const colsVis = COLS_LIBRO.filter(c => c.key !== 'cuenta' || libroBanco === 'TODAS');

  useEffect(() => {
    getDeportistas().then(setDeportistas).catch(() => {});
    getMapeoIndex().then(setIdx).catch(() => {});
    contarMapeo().then(setMapeoCount).catch(() => {});
    contarMovimientos().then(setMovCount).catch(() => {});
    getConceptos().then(setConceptos).catch(() => {});
    getTerceros().then(setTerceros).catch(() => {});
    /* Lo institucional se lee directo del catálogo de Productos. Si la lista
       no llega —sin internet, tabla vacía—, la casilla DETALLE sigue
       funcionando igual con los meses de siempre. — 02/09/2026 */
    getInstitucionales().then(setInstitucionales).catch(() => {});
    // Marcar en verde (permanente) lo que ya está pagado en el estado de cuenta
    getPagadosKeys().then(keys => setPublicadas(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; })).catch(() => {});
  }, []);

  async function importarHist() {
    if (!window.confirm('Importar TODO tu LIBRO CONTABLE histórico (~12.000 movimientos) al libro dinámico. Se hace una sola vez. ¿Continuar?')) return;
    setImportando(true); setProgreso('Descargando histórico…');
    try {
      const res = await fetch('/contabilidad/historico-seed.json');
      const arr = await res.json();
      await importarHistorico(arr, (n, tot) => setProgreso(`Importando ${n.toLocaleString('es-CO')}/${tot.toLocaleString('es-CO')}…`));
      await contarMovimientos().then(setMovCount);
      flash('Histórico importado ✓');
      if (vista === 'libro') cargarLibro();
    } catch (e: any) { flash('Error importando histórico: ' + (e?.message || e)); }
    setImportando(false); setProgreso('');
  }

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(null), 3500); }

  // ── Subir extracto ──
  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setVista('subir');            // el resultado se ve aquí: saltamos a "Movimientos"
    setCargando(true); setRevision([]); mapeoQueue.current = {};
    flash(`Leyendo "${file.name}"…`);
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas: any[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      if (!filas.length) { flash('⚠ El archivo no tiene filas legibles. ¿Es el Excel del banco?'); setCargando(false); return; }

      const idxLocal = idx;
      const yaHash = await hashesExistentes(banco);
      let saldo = await ultimoSaldo(banco);
      // MES PENDIENTE = primer mes del ciclo que el deportista NO tiene cubierto.
      // "Cubierto" = pagado en el ESTADO DE CUENTA (pagos_estado) O ya asignado en el libro.
      const mesesLibro = await getMesesPorCodigo();
      const pagadosKeys = await getPagadosKeys();
      const mesesCubiertos: Record<string, Set<string>> = {};
      for (const cod of Object.keys(mesesLibro)) mesesCubiertos[cod] = new Set(mesesLibro[cod]);
      for (const k of pagadosKeys) { const i = k.indexOf('|'); if (i < 0) continue; const cod = k.slice(0, i); (mesesCubiertos[cod] = mesesCubiertos[cod] || new Set()).add(k.slice(i + 1)); }
      const asignadosBatch: Record<string, Set<string>> = {};

      const out: MovCont[] = [];
      // Cuenta de OCURRENCIAS por huella base: si el extracto trae varios movimientos
      // idénticos el mismo día (misma descripción, referencia y valor — p. ej. 2
      // "CORRESPONSAL" de 138.000), evita que se pierdan por deduplicación.
      const ocurrencias: Record<string, number> = {};
      for (const f of filas) {
        const fecha = fechaISO(pick(f, 'FECHA'));
        const descripcion = String(pick(f, 'DESCRIPCION', 'DESCRIPCIÓN') || '').trim();
        const referencia = String(pick(f, 'REFERENCIA', 'REFERENCI') || '').trim();
        const valor = numVal(pick(f, 'VALOR'));
        if (!fecha && !descripcion && !valor) continue;

        const debito = valor < 0 ? Math.abs(valor) : 0;
        const credito = valor >= 0 ? valor : 0;

        // Cruce: 1) cuenta  2) nombre  3) concepto por descripción
        let codigo = ''; let via = '';
        // NO auto-asignar por referencia cuando el movimiento es un PAGO QR (la referencia
        // es la cuenta del recaudo/QR, COMPARTIDA por muchos pagadores, no la del deportista)
        // ni cuando la referencia viene malformada ("null"). Estos quedan "por asignar" para
        // que se orienten a mano y NUNCA se relacionen mal automáticamente.
        const refConfiable = !/PAGO\s*QR/i.test(descripcion) && !/null/i.test(referencia);
        const refDig = soloDigitos(referencia);
        const refCta = normCuenta(referencia); // sin ceros a la izquierda (para el cruce)
        if (refConfiable && refDig.length >= 5 && idxLocal.cuenta[refCta]) { codigo = idxLocal.cuenta[refCta]; via = 'cuenta'; }
        if (!codigo && refConfiable) {
          const kn = normNombre(referencia);
          if (kn && idxLocal.nombre[kn]) { codigo = idxLocal.nombre[kn]; via = 'nombre'; }
        }
        /* ── 3) EL PAGADOR DEL QR — PROPUESTA, NO SENTENCIA ───────────────────
           (dirección, 01/09/2026)

           A un PAGO QR no se le puede creer la referencia: es la cuenta del
           recaudo, la misma para todos. Pero el banco sí escribe en la
           DESCRIPCIÓN el nombre de quien pagó ("PAGO QR SANTIAGO CAMP"), y eso
           sí es de esa familia.

           Si esa descripción ya se le enseñó a la plataforma, el código llega
           puesto — pero la fila queda PENDIENTE (en amarillo). No entra sola:
           la dirección la confirma. Así, si dos apellidos se parecen o el banco
           cortó el nombre, el error se ve antes de contabilizarlo. */
        if (!codigo) {
          const kp = clavePagador(descripcion);
          if (kp && idxLocal.pagador[kp]) { codigo = idxLocal.pagador[kp]; via = 'pagador'; }
        }
        // Se pasan debito/credito para que las reglas de "solo debito" (tarjeta de
        // credito) no marquen por error un pago que ENTRA.
        const clas = clasificarConcepto(descripcion, { debito, credito });
        let concepto = '';
        let deportista = '';
        let detalle = '';
        /* INTERESES del banco (a favor o financieros): aunque la referencia se
           parezca a una cuenta ya cruzada en el diccionario, NO son de ningún
           deportista. Se les quita el código para que queden sin código y sin mes.

           25/08/2026 — antes esto preguntaba por 'INGRESO FINANCIERO', un nombre
           que la clasificación ya no devuelve: la comprobación nunca se cumplía y
           algún interés podía quedar pegado a un deportista. */
        if (clas.concepto === 'INTERESES A FAVOR' || clas.concepto === 'INTERESES FINANCIEROS') {
          codigo = ''; via = '';
        }
        // TERCERO reconocido por la descripción ("PAGO A NOMIN fredy alexander r",
        // "PAGO A PROVE sol marina vill", "TRANSF A Diana Fernan"…). Manda sobre
        // cualquier otro cruce: queda la cédula en CÓDIGO, el nombre completo, y
        // el concepto que le toque por su tipo. El MES se escoge después a mano.
        const ter = terceroDeDesc(descripcion);
        if (ter) {
          codigo = ter.documento; deportista = ter.nombre;
          concepto = conceptoDeTipo(ter.tipo, ter.origen); detalle = ''; via = 'tercero';
        } else if (codigo) {
          deportista = codMap[codigo] || '';
          const esMatricula = /MATRICUL|INSCRIP/i.test(descripcion);
          concepto = esMatricula ? 'MATRÍCULA' : 'APORTE FORMACIÓN';
          if (esMatricula) {
            detalle = 'MATRÍCULA 2026';
          } else {
            // CONSECUTIVO: el mes que SIGUE al último mes cubierto (NO rellena huecos:
            // si abril quedó excusado/saltado, no se devuelve a abril; sigue hacia adelante).
            const pagados = new Set<string>([...Array.from(mesesCubiertos[codigo] || []), ...Array.from(asignadosBatch[codigo] || [])]);
            let lastIdx = -1;
            for (let i = 0; i < MESES_CICLO.length; i++) if (pagados.has(MESES_CICLO[i])) lastIdx = i;
            const sig = MESES_CICLO[lastIdx + 1];
            detalle = sig || mesDesdeFecha(fecha); // si ya llegó a diciembre, usa el mes del movimiento
            if (sig) { (asignadosBatch[codigo] = asignadosBatch[codigo] || new Set()).add(sig); }
          }
        } else if (clas.concepto) {
          concepto = clas.concepto;
        }
        /* Lo propuesto por el pagador SIEMPRE queda pendiente, aunque ya traiga
           código: esa es toda la gracia de que sea una propuesta. */
        const pendiente = (!codigo && !clas.concepto) || via === 'pagador';

        saldo = saldo + credito - debito;
        // Huella por OCURRENCIA: la 1.ª conserva la huella original (compatibilidad con lo
        // ya guardado y para que re-subir el MISMO extracto no duplique); las repetidas
        // reciben #1, #2, … #199 para que TODAS se suban tal cual el extracto, sin deducir.
        const baseHash = hashMov({ banco, fecha, descripcion, referencia, debito, credito });
        const nOcc = ocurrencias[baseHash] ?? 0;
        ocurrencias[baseHash] = nOcc + 1;
        const hash = nOcc === 0 ? baseHash : `${baseHash}#${nOcc}`;
        out.push({
          banco, fecha, descripcion, referencia, debito, credito, saldo,
          concepto, codigo, deportista, detalle,
          dictado: false, origen: file.name, hash,
          _via: via || (clas.concepto ? 'concepto' : ''), _pendiente: pendiente,
          // marca duplicado reusando id temporal
          id: yaHash.has(hash) ? '__DUP__' : undefined,
        });
      }
      setRevision(out);
      const dup = out.filter(r => r.id === '__DUP__').length;
      flash(`${out.length} movimientos leídos · ${dup} ya existían`);
    } catch (err: any) {
      flash('Error leyendo el Excel: ' + (err?.message || err));
    }
    setCargando(false);
  }

  function asignarDeportista(i: number, cod: string, nombre: string) {
    setRevision(prev => prev.map((r, j) => {
      if (j !== i) return r;
      // recordar el cruce (aprende): por cuenta si la ref es numérica, si no por nombre.
      // Los PAGO QR y referencias "null" NO se aprenden (su cuenta es compartida y ensuciaría
      // el diccionario), pero la asignación manual de esta fila sí se respeta.
      const refDig = soloDigitos(r.referencia);
      const refConfiable = !/PAGO\s*QR/i.test(r.descripcion || '') && !/null/i.test(r.referencia || '');
      if (refConfiable && refDig.length >= 5) mapeoQueue.current['c_' + refDig] = { tipo: 'cuenta', clave: refDig, codigo: cod };
      else if (refConfiable) { const kn = normNombre(r.referencia); if (kn) mapeoQueue.current['n_' + kn] = { tipo: 'nombre', clave: kn, codigo: cod }; }
      return { ...r, codigo: cod, deportista: nombre, concepto: r.concepto || 'APORTE FORMACIÓN', detalle: r.detalle || mesDesdeFecha(r.fecha), _pendiente: false, _via: 'manual' };
    }));
  }
  function editarCampo(i: number, campo: keyof MovCont, val: string) {
    setRevision(prev => prev.map((r, j) => j === i ? { ...r, [campo]: val } : r));
  }

  async function guardarLibro() {
    const nuevos = revision.filter(r => r.id !== '__DUP__');
    if (!nuevos.length) { flash('No hay movimientos nuevos para guardar.'); return; }
    setGuardando(true);
    const r = await guardarMovimientos(nuevos);
    const cola = Object.values(mapeoQueue.current);
    if (cola.length) await guardarMapeo(cola);
    setGuardando(false);
    if (r.ok) {
      flash(`Guardados ${r.insertados} movimientos en el libro.`);
      mapeoQueue.current = {};
      setRevision([]);
      libroCache = null; // hay movimientos nuevos → el libro debe recargarse
      getMapeoIndex().then(setIdx); contarMapeo().then(setMapeoCount); contarMovimientos().then(setMovCount);
    } else {
      flash('Error al guardar: ' + (r.msg || ''));
    }
  }

  async function cargarLibro(forzar = false) {
    const key = libroBanco === 'TODAS' ? '__TODAS__' : libroBanco;
    // Si ya lo tenemos en memoria (misma cuenta), lo mostramos AL INSTANTE sin recargar
    if (!forzar && libroCache && libroCache.key === key && libroCache.data.length) {
      setLibro(libroCache.data);
      setDirtyIds(new Set());
      setCargandoLibro(false);
      return;
    }
    setCargandoLibro(true);
    const m = await getMovimientos(libroBanco === 'TODAS' ? undefined : libroBanco);
    libroCache = { key, data: m };
    setLibro(m);
    setDirtyIds(new Set());
    setCargandoLibro(false);
  }
  useEffect(() => { if (vista === 'libro') cargarLibro(); /* eslint-disable-next-line */ }, [vista, libroBanco]);

  // ── Alta MANUAL de una fila nueva en el libro ──
  /** Interpreta lo que se escribe en el aviso: "11775-11780", "11775 11776",
   *  "11775, 11776" o cualquier mezcla. Devuelve la lista de numeros de fila. */
  function leerNumerosDeFila(texto: string): number[] {
    const out = new Set<number>();
    for (const trozo of String(texto || '').split(/[,;\s]+/)) {
      const t = trozo.trim();
      if (!t) continue;
      const rango = t.match(/^(\d+)\s*[-–a]\s*(\d+)$/i);
      if (rango) {
        let a = parseInt(rango[1]), b = parseInt(rango[2]);
        if (a > b) { const x = a; a = b; b = x; }
        if (b - a > 500) continue;            // rango absurdo: se ignora
        for (let n = a; n <= b; n++) out.add(n);
        continue;
      }
      const n = parseInt(t.replace(/\D/g, ''));
      if (n > 0) out.add(n);
    }
    return Array.from(out).sort((x, y) => x - y);
  }

  /** ELIMINA filas del libro por su N° (la columna gris de la izquierda).
   *  Muestra exactamente lo que se va a borrar antes de tocar nada y guarda una
   *  copia en la "papelera" del navegador por si hubo un error. */
  async function eliminarFilasPorNumero() {
    if (borrandoFilas) return;
    if (!libro.length) { flash('El libro aún no está cargado.'); return; }

    const texto = window.prompt(
      'ELIMINAR FILAS DEL LIBRO\n\n' +
      'Escribe el N° de las filas (la columna gris de la izquierda).\n' +
      'Ejemplos:  11775-11780   ·   11775 11776 11777\n\n' +
      'OJO: el N° corresponde a la cuenta que tienes seleccionada arriba (' +
      (libroBanco === 'TODAS' ? 'TODAS las cuentas' : libroBanco) + ').',
      '',
    );
    if (texto === null) return;
    const nums = leerNumerosDeFila(texto);
    if (!nums.length) { flash('No se entendió ningún número de fila.'); return; }

    // N° → movimiento (numFila ya tiene el mapa al revés)
    const porNum: Record<number, MovCont> = {};
    for (const m of libro) { const n = numFila[m.id || '']; if (n) porNum[n] = m; }

    const filas = nums.map(n => porNum[n]).filter(Boolean) as MovCont[];
    const faltan = nums.filter(n => !porNum[n]);
    if (!filas.length) {
      window.alert('No se encontró ninguna de esas filas en el libro que tienes abierto.\n\n' +
        'Revisa que arriba esté seleccionada la misma cuenta con la que viste los números.');
      return;
    }

    await borrarEstasFilas(filas, faltan);
  }

  /* ── EL BORRADO DE VERDAD, EN UN SOLO SITIO ───────────────────────────────
     (dirección, 02/09/2026)

     Lo usan los dos caminos: el botón de arriba —que pide los N° a mano— y la
     papelera de cada fila. Así los dos muestran EXACTAMENTE el mismo cuadro de
     aceptar, guardan la misma copia en la papelera y refrescan el libro igual.
     Si mañana hay que cambiar el aviso, se cambia una vez. */
  async function borrarEstasFilas(filas: MovCont[], faltan: number[] = []) {
    if (!filas.length) return;

    /* Señalando cincuenta filas, listarlas todas hace un aviso que no cabe en
       la pantalla y no se puede leer. Se muestran las primeras y se dice
       cuántas más van. — dirección, 02/09/2026 */
    const TOPE_LISTA = 25;
    const detalle = filas.slice(0, TOPE_LISTA).map(m => {
      const n = numFila[m.id || ''];
      const val = Number(m.credito) > 0 ? '+' + pesosCO(Number(m.credito)) : '-' + pesosCO(Number(m.debito) || 0);
      const conf = confirmadas.has(String(m.codigo ?? '').trim() + '|' + String(m.detalle ?? '').trim()) ? '  ⚠ YA CONFIRMADO' : '';
      return `  N° ${n}  ${m.fecha || ''}  ${String(m.banco || '').slice(0, 18)}  ${val}  ${String(m.descripcion || '').slice(0, 40)}${conf}`;
    }).join('\n');

    const yaConfirmadas = filas.filter(m =>
      confirmadas.has(String(m.codigo ?? '').trim() + '|' + String(m.detalle ?? '').trim())).length;

    const aviso =
      'SE VAN A ELIMINAR ' + filas.length + ' FILA(S) DEL LIBRO\n' +
      'Esto NO se puede deshacer desde la pantalla.\n\n' +
      detalle + '\n' +
      (filas.length > TOPE_LISTA ? `  … y ${filas.length - TOPE_LISTA} fila(s) más\n` : '') +
      (faltan.length ? `\nNo se encontraron: ${faltan.join(', ')}\n` : '') +
      (yaConfirmadas
        ? `\n⚠ ${yaConfirmadas} de estas filas YA están confirmadas en un estado de cuenta.\n` +
          '   Borrarlas del libro NO les quita el pago al deportista: eso hay que\n' +
          '   corregirlo aparte en su estado de cuenta.\n'
        : '') +
      '\nSe guardará una copia en la papelera del navegador.\n\n¿Eliminar?';
    if (!window.confirm(aviso)) return;

    setBorrandoFilas(true);
    flash(`Eliminando ${filas.length} fila(s)…`);

    // Papelera: copia de seguridad local por si se borró algo por error
    try {
      const previo = JSON.parse(localStorage.getItem('cont_papelera') || '[]');
      const nuevo = [...filas.map(m => ({ ...m, _borrado: new Date().toISOString() })), ...previo].slice(0, 200);
      localStorage.setItem('cont_papelera', JSON.stringify(nuevo));
    } catch { /* si el navegador no deja guardar, se sigue igual */ }

    const borrados: string[] = [];
    const fallaron: number[] = [];
    for (const m of filas) {
      const ok = m.id ? await borrarMovimiento(m.id) : false;
      if (ok) borrados.push(m.id as string); else fallaron.push(numFila[m.id || ''] || 0);
    }

    if (borrados.length) {
      const quedan = libro.filter(m => !borrados.includes(m.id || ''));
      setLibro(quedan);
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: quedan };
      contarMovimientos().then(setMovCount).catch(() => {});
    }
    setBorrandoFilas(false);
    flash(fallaron.length
      ? `✓ ${borrados.length} eliminada(s) · ⚠ no se pudo con: ${fallaron.join(', ')}`
      : `✓ ${borrados.length} fila(s) eliminada(s) del libro`);
  }

  function abrirNuevaFila() {
    const hoy = new Date().toISOString().slice(0, 10);
    const bancoDef = libroBanco === 'TODAS' ? BANCOS[0] : libroBanco;
    setNuevaFila({ banco: bancoDef, fecha: hoy, descripcion: '', debito: '', credito: '', concepto: '', codigo: '', deportista: '', detalle: '' });
  }

  function editarNuevaFila<K extends keyof FilaManual>(campo: K, valor: FilaManual[K]) {
    setNuevaFila(prev => {
      if (!prev) return prev;
      const next = { ...prev, [campo]: valor };
      // Al escribir el código, autocompletar el nombre del deportista si lo conocemos
      if (campo === 'codigo') {
        const nom = codMap[String(valor).trim()];
        if (nom) next.deportista = nom;
      }
      return next;
    });
  }

  async function guardarNuevaFila() {
    if (!nuevaFila) return;
    const deb = numVal(nuevaFila.debito) || 0;
    const cre = numVal(nuevaFila.credito) || 0;
    if (!nuevaFila.fecha) { flash('⚠ Falta la fecha del movimiento'); return; }
    if (!deb && !cre) { flash('⚠ Ingresa un valor en Débito o en Crédito'); return; }
    setGuardandoManual(true);
    try {
      const saldoPrev = await ultimoSaldo(nuevaFila.banco);
      const base = {
        banco: nuevaFila.banco,
        fecha: nuevaFila.fecha,
        descripcion: nuevaFila.descripcion.trim() || 'MOVIMIENTO MANUAL',
        referencia: '',
        debito: deb,
        credito: cre,
      };
      // Hash único (con sufijo aleatorio) para que dos filas manuales idénticas NO se fusionen
      const hash = hashMov(base) + '_m' + Math.random().toString(36).slice(2, 7);
      const fila: MovCont = {
        ...base,
        saldo: saldoPrev + cre - deb,
        concepto: nuevaFila.concepto.trim(),
        codigo: nuevaFila.codigo.trim(),
        deportista: nuevaFila.deportista.trim(),
        detalle: nuevaFila.detalle.trim(),
        origen: 'manual',
        hash,
      };
      const r = await guardarMovimientos([fila]);
      if (r.ok) {
        libroCache = null;
        const bancoNuevo = nuevaFila.banco;
        setNuevaFila(null);
        // Si estabas viendo otra cuenta, cambia a la de la fila para que la veas;
        // el cambio de libroBanco dispara la recarga. Si ya coincide (o es TODAS), recarga aquí.
        if (libroBanco !== 'TODAS' && libroBanco !== bancoNuevo) {
          setLibroBanco(bancoNuevo);
        } else {
          await cargarLibro(true);
        }
        contarMovimientos().then(setMovCount);
        flash('✔ Fila agregada al libro');
      } else {
        flash('Error al agregar la fila: ' + (r.msg || ''));
      }
    } catch (e: any) {
      flash('Error al agregar la fila: ' + (e?.message ?? e));
    } finally {
      setGuardandoManual(false);
    }
  }

  // Libro filtrado por columnas. La "cifra" busca dentro de débito o crédito;
  // el "código" trae todos los movimientos de ese deportista aunque estén en
  // cuentas distintas (porque el libro está pegado con las tres cuentas).
  const esTodas = libroBanco === 'TODAS';
  /* ── Tarifa esperada de cada deportista (codigo → pesos) ── */
  const tarifaPorCod = useMemo(() => {
    const m: Record<string, number> = {};
    deportistas.forEach(d => {
      const c = getCod(d); if (!c) return;
      const manual = colDeportista(d, /^cuota_?manual$/i).replace(/[^0-9]/g, '');
      if (manual && Number(manual) > 0) { m[c] = Number(manual); return; }
      m[c] = calcTarifaNum(colDeportista(d, /^program/i), colDeportista(d, /^sede/i));
    });
    return m;
  }, [deportistas]);

  /* ── CODIGOS REALES: los que de verdad existen en la lista de deportistas ──
     Sirve para detectar basura en la columna CODIGO (por ejemplo, filas donde
     quedo escrito "C MANEJO TARJ DEB 1400 04 26" en vez de un codigo).
     Esas filas son SOSPECHOSAS: pueden estar mandando plata a una ficha que
     no existe. Se pintan de rojo y no se publican hasta que alguien las revise. */
  const codigosReales = useMemo(() => {
    const s = new Set<string>();
    deportistas.forEach(d => { const c = getCod(d); if (c) s.add(c.trim().toUpperCase()); });
    return s;
  }, [deportistas]);

  /** true = la fila tiene codigo, pero ese codigo NO existe como deportista. */
  const codigoFalso = (m: MovCont) => {
    const c = String(m.codigo ?? '').trim();
    // Mientras la lista de deportistas no haya cargado, no se acusa a nadie.
    if (!c || codigosReales.size === 0) return false;
    // Las CEDULAS y NIT del directorio de NOMINA Y PROVEEDORES son codigos
    // legitimos: no son deportistas, pero tampoco son un error. Sin rojo.
    if (tercerosIdx[c]) return false;
    return !codigosReales.has(c.toUpperCase());
  };

  /* ── Mes en que se afilió cada deportista (código → 1..12) ── */
  const mesAfilPorCod = useMemo(() => {
    const m: Record<string, number> = {};
    deportistas.forEach(d => {
      const c = getCod(d); if (!c) return;
      m[c] = mesDeAfiliacion(colDeportista(d, /fecha.*afil|afil.*fecha/i));
    });
    return m;
  }, [deportistas]);

  /* ── Pagos YA CONFIRMADOS en el estado de cuenta (clave codigo|MES) ──
     `publicadas` viene de pagos_estado y puede traer la llave con el UUID del
     deportista (cuando el estado de cuenta se edito a mano) o con su codigo
     (cuando se publico desde el libro) — la DOBLE LLAVE. Aqui se normaliza todo
     a codigo|MES para que el semaforo y el chulo reconozcan ambas por igual. */
  const confirmadas = useMemo(() => {
    const uuid2cod: Record<string, string> = {};
    deportistas.forEach(d => { const c = getCod(d); if (c && (d as any).id) uuid2cod[String((d as any).id)] = c; });
    const out = new Set<string>();
    publicadas.forEach(k => {
      const i = k.indexOf('|'); if (i < 0) return;
      out.add(k);
      const c = uuid2cod[k.slice(0, i)];
      if (c) out.add(c + '|' + k.slice(i + 1));
    });
    return out;
  }, [publicadas, deportistas]);

  /* ── Color de cada fila del libro ── */
  const semaforo = useMemo(() => {
    /* REGLA (direccion, 19/08/2026): varios pagos del MISMO mes NO son un error.
       Un deportista puede pagar 124.200 un dia (con mal descuento) y el resto
       despues, o pagar la matricula en dos contados. El semaforo compara la SUMA
       de todo lo que pago de ese mes contra la mensualidad, NO cada fila suelta.
       "Confirmar verdes" ya agrupa por deportista+mes y suma antes de publicar,
       asi que dos filas del mismo mes NO duplican: escriben un solo valor. */
    const suma: Record<string, number> = {};   // codigo|mes → total pagado
    const veces: Record<string, number> = {};  // codigo|mes → cuantas filas
    for (const m of libro) {
      const cod = String(m.codigo ?? '').trim(), det = String(m.detalle ?? '').trim();
      if (!cod || !det || !(Number(m.credito) > 0)) continue;
      const k = cod + '|' + det;
      suma[k]  = (suma[k]  || 0) + (Number(m.credito) || 0);
      veces[k] = (veces[k] || 0) + 1;
    }

    const out: Record<string, { color: ColorSem; motivo: string; exceso?: boolean }> = {};
    for (const m of libro) {
      const id  = m.id || '';
      const cre = Number(m.credito) || 0;
      const cod = String(m.codigo ?? '').trim();
      const det = String(m.detalle ?? '').trim();

      if (cre <= 0 || esNoAplica(m)) { out[id] = { color: 'na', motivo: '' }; continue; }
      if (!cod) { out[id] = { color: 'morado', motivo: 'Sin codigo: el diccionario no reconoce esta cuenta' }; continue; }

      const esMatr = /MATR[IÍ]CUL|INSCRIP/i.test(det) || /MATR[IÍ]CUL|INSCRIP/i.test(String(m.concepto ?? ''));
      if (esMatr) { out[id] = { color: 'na', motivo: 'Matricula o inscripcion (no aplica mensualidad)' }; continue; }
      if (esBecado(cod)) { out[id] = { color: 'na', motivo: 'Deportista becado' }; continue; }

      if (!det) { out[id] = { color: 'amarillo', motivo: 'Falta asignar el mes' }; continue; }

      // YA CONFIRMADO: el pago ya esta publicado en el estado de cuenta.
      // El color se apaga — el semaforo solo señala lo que falta por revisar.
      // (El chulo verde de la primera columna sigue mostrando que quedo confirmado.)
      if (confirmadas.has(cod + '|' + det)) { out[id] = { color: 'na', motivo: 'Ya confirmado en el estado de cuenta' }; continue; }

      const tarifa = tarifaPorCod[cod];
      if (!tarifa) { out[id] = { color: 'morado', motivo: 'El codigo no corresponde a ningun deportista' }; continue; }

      // AMARILLO: el mes es ANTERIOR a la afiliacion del deportista.
      // Ejemplo: se afilio el 21/03/2026 y le asignaron FEBRERO 2026.
      const mesDet  = mesNumDeDetalle(det);
      const mesAfil = mesAfilPorCod[cod] || 0;
      if (mesDet > 0 && mesAfil > 0 && mesDet < mesAfil) {
        const NOM = ['','ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        out[id] = { color: 'amarillo', motivo: `Ese mes NO le corresponde: el deportista se afilio en ${NOM[mesAfil]} y este pago quedo como ${det}` };
        continue;
      }

      const conDto   = Math.round(tarifa * 0.9);
      const k        = cod + '|' + det;
      const total    = suma[k] ?? cre;     // TODO lo pagado de ese mes, no solo esta fila
      const nPag     = veces[k] ?? 1;
      const enVarios = nPag > 1 ? ` — ${nPag} pagos que suman ${pesosCO(total)}` : '';

      if (total === tarifa) { out[id] = { color: 'verde', motivo: `Mensualidad completa (${pesosCO(tarifa)})${enVarios}` }; continue; }
      if (total === conDto) { out[id] = { color: 'verde', motivo: `Mensualidad con 10% de descuento (${pesosCO(conDto)})${enVarios}` }; continue; }

      const falta = tarifa - total;
      out[id] = falta > 0
        ? { color: 'rojo', motivo: `Lleva ${pesosCO(total)} de ${pesosCO(tarifa)}${enVarios} — faltan ${pesosCO(falta)}` }
        : { color: 'rojo', exceso: true, motivo: `Pago ${pesosCO(total)}${enVarios} y la mensualidad es ${pesosCO(tarifa)} — sobran ${pesosCO(-falta)}` };
    }
    return out;
  }, [libro, tarifaPorCod, mesAfilPorCod, confirmadas]);

  const cuentaSem = useMemo(() => {
    const c: Record<string, number> = { verde: 0, amarillo: 0, rojo: 0, morado: 0 };
    for (const m of libro) {
      const sm = semaforo[m.id || '']; if (!sm || sm.color === 'na') continue;
      c[sm.color] = (c[sm.color] || 0) + 1;
    }
    return c;
  }, [libro, semaforo]);

  /** Verdes que todavia NO se han publicado al estado de cuenta. */
  const verdesPendientes = useMemo(
    () => libro.filter(m => {
      const sm = semaforo[m.id || '']; if (!sm || sm.color !== 'verde') return false;
      const cod = String(m.codigo ?? '').trim(), det = String(m.detalle ?? '').trim();
      return !!cod && !!det && !confirmadas.has(cod + '|' + det);
    }),
    [libro, semaforo, confirmadas],
  );

  /** MATRÍCULAS con código que todavía NO están en el estado de cuenta.
   *  El botón de los verdes NO las toca: la matrícula no se compara contra la
   *  mensualidad, así que el semáforo la deja sin color y se quedaba sin publicar.
   *  Por eso a los recién afiliados les aparecía la matrícula en el libro pero
   *  seguía en PEND en su estado de cuenta. */
  const matriculasPendientes = useMemo(
    () => libro.filter(m => {
      if (!(Number(m.credito) > 0) || esNoAplica(m)) return false;
      const cod = String(m.codigo ?? '').trim();
      const det = String(m.detalle ?? '').trim();
      if (!cod || !det) return false;
      const esMatr = /MATR[IÍ]CUL|INSCRIP/i.test(det) || /MATR[IÍ]CUL|INSCRIP/i.test(String(m.concepto ?? ''));
      if (!esMatr) return false;
      return !confirmadas.has(cod + '|' + det);
    }),
    [libro, confirmadas],
  );

  const libroFiltrado = useMemo(() => {
    const f = filDebounced;
    const inc = (v: any, q: string) => String(v ?? '').toLowerCase().includes(q.trim().toLowerCase());
    const dig = (s: any) => String(s ?? '').replace(/\D/g, '');
    const incDig = (v: any, q: string) => { const d = dig(q); return !d || dig(v).includes(d); };
    return libro.filter(m => {
      if (f.banco && !inc(m.banco, f.banco)) return false;
      if (f.fecha && !inc(m.fecha, f.fecha)) return false;
      if (f.desc && !inc(m.descripcion, f.desc)) return false;
      if (f.debito && !incDig(m.debito, f.debito)) return false;
      if (f.credito && !incDig(m.credito, f.credito)) return false;
      if (f.saldo && !incDig(m.saldo, f.saldo)) return false;
      if (f.concepto && !inc(m.concepto, f.concepto)) return false;
      // CÓDIGO: 'exacto' evita cruces con cifras que contienen esos dígitos (códigos de deportista);
      //         'contiene' permite hallar números de cuenta largos de proveedores/empleados por parte.
      if (f.codigo) {
        const needle = f.codigo.trim();
        const hay    = String(m.codigo ?? '').trim();
        let ok: boolean;
        if (filCodModo === 'contiene') {
          /* ── BUSCAR CUENTAS: SOLO LOS DÍGITOS, Y TAMBIÉN EN LA DESCRIPCIÓN ──
             (dirección, 05/09/2026 — «poder filtrar el número que estoy mirando
              en el soporte y buscarlo a ver si ya está en código o cuenta; hay
              soportes que solo muestran los últimos 4 dígitos»)

             Se comparan únicamente los números: así da igual que la cuenta esté
             escrita 236-000-03104, 236 000 03104 o 23600003104. Y se busca en
             dos partes: en la columna CÓDIGO y dentro del texto del banco, que
             es donde muchas veces queda la cuenta escrita. */
          const d = dig(needle);
          ok = !d || dig(hay).includes(d) || dig(m.descripcion).includes(d);
        } else {
          ok = hay === needle;
        }
        if (!ok) return false;
      }
      // Se busca por el nombre visible: el guardado o, si no hay, el del código.
      if (f.deportista && !inc(nombreDeFila(m), f.deportista)) return false;
      if (f.detalle && !inc(m.detalle, f.detalle)) return false;
      // EGRESOS / INGRESOS SIN CONCEPTO.
      // Egreso = la fila tiene DÉBITO. Ingreso = la fila tiene CRÉDITO.
      // Prendidos los dos a la vez, muestra todas las filas sin concepto.
      // Las filas que usted acaba de editar (cambios sin guardar) se quedan
      // visibles para que no desaparezcan mientras las está llenando.
      if (soloEgresoSinConc || soloIngresoSinConc) {
        const sinConcepto = !String(m.concepto ?? '').trim();
        const ladoPedido =
          (soloEgresoSinConc  && Number(m.debito)  > 0) ||
          (soloIngresoSinConc && Number(m.credito) > 0);
        if (!(sinConcepto && ladoPedido) && !dirtyIds.has(m.id || '')) return false;
      }
      // "Sin detalle": filas a las que todavía les falta ese dato.
      if (soloSinDetalle  && String(m.detalle  ?? '').trim() && !dirtyIds.has(m.id || '')) return false;
      /* MAL ORIENTADAS: institucional con un mes en el detalle. — 04/09/2026 */
      if (soloMalOrientadas
        && !(mismoTexto(m.concepto, CONCEPTO_INSTITUCIONAL) && esDetalleDeMes(m.detalle))
        && !dirtyIds.has(m.id || '')) return false;
      // Filtro de SOSPECHOSAS: filas en rojo (codigo que no existe, o pago de mas)
      if (soloSospechosas) {
        const smS = semaforo[m.id || ''];
        if (!smS?.exceso && !codigoFalso(m)) return false;
      }
      // Filtro por el chulo: verde = ya confirmado en el estado de cuenta;
      // rojo = pago con código y mes pero AÚN sin confirmar (pendiente).
      if (filSem !== 'todos') {
        const sm = semaforo[m.id || ''];
        if (!sm || sm.color !== filSem) return false;
      }
      if (filChulo !== 'todos') {
        const cod = String(m.codigo ?? '').trim();
        const det = String(m.detalle ?? '').trim();
        const verde = esNoAplica(m) || confirmadas.has(cod + '|' + det);
        const esPago = cod && det && Number(m.credito) > 0;
        if (filChulo === 'verde' && !verde) return false;
        if (filChulo === 'rojo' && !(esPago && !verde)) return false;
      }
      return true;
    });
  }, [libro, filDebounced, soloEgresoSinConc, soloIngresoSinConc, soloSinDetalle, soloSospechosas, soloMalOrientadas, codigosReales, dirtyIds, filChulo, confirmadas, filCodModo, filSem, semaforo]);
  /** Pagos del libro que ya quedaron confirmados en el estado de cuenta. */
  const confirmadosCount = useMemo(
    () => libro.filter(m => {
      if (!(Number(m.credito) > 0) || esNoAplica(m)) return false;
      const cod = String(m.codigo ?? '').trim(), det = String(m.detalle ?? '').trim();
      return !!cod && !!det && confirmadas.has(cod + '|' + det);
    }).length,
    [libro, confirmadas],
  );
  /** Filas del libro a las que todavía les falta el CONCEPTO, separadas por lado.
   *  Egreso = tiene DÉBITO (plata que salió). Ingreso = tiene CRÉDITO (plata que entró).
   *  Se cuenta sobre TODO el libro de la cuenta seleccionada, no sobre lo filtrado. */
  const egresoSinConcCount = useMemo(
    () => libro.filter(m => Number(m.debito) > 0 && !String(m.concepto ?? '').trim()).length,
    [libro],
  );
  const ingresoSinConcCount = useMemo(
    () => libro.filter(m => Number(m.credito) > 0 && !String(m.concepto ?? '').trim()).length,
    [libro],
  );
  const sinDetalleCount = useMemo(
    () => libro.filter(m => !String(m.detalle ?? '').trim()).length,
    [libro],
  );

  /* ── FILAS MAL ORIENTADAS ─────────────────────────────────────────────────
     (dirección, 04/09/2026 — «si hay alguno que diciendo institucional en el
      pasado está un mes o matrícula, muéstralo en el encabezado como mal
      orientado; luego te haré varias leyes para que esto funcione cada vez que
      algo se oriente mal»)

     Ésta es la primera ley: una fila cuyo CONCEPTO dice INSTITUCIONAL pero cuyo
     DETALLE es un mes, una matrícula o una inscripción. Es imposible que las
     dos cosas sean ciertas — o se vendió un producto, o se pagó una
     mensualidad—, así que una de las dos está mal escrita.

     No se corrige sola, y con razón: quien sabe qué pasó de verdad ese día es
     la contadora, no el programa. Lo que hace el sistema es LEVANTAR LA MANO y
     dejar las filas a un clic, para que ella decida.

     Las leyes que vengan después se agregan aquí, cada una con su nombre. */
  const malOrientadas = useMemo(
    () => libro.filter(m =>
      mismoTexto(m.concepto, CONCEPTO_INSTITUCIONAL) && esDetalleDeMes(m.detalle)),
    [libro],
  );
  /** Filas cuya DESCRIPCIÓN señala a alguien del directorio de Nómina y
   *  Proveedores, y que todavía NO están completas: les falta el concepto que
   *  les toca por su tipo, la cédula/NIT en CÓDIGO, el nombre completo, o
   *  traen en DETALLE algo que no es un mes. */
  const nominaDescPendientes = useMemo(
    () => libro.filter(m => {
      const r = terceroDeDesc(m.descripcion);
      if (!r) return false;
      const det = String(m.detalle ?? '').trim().toUpperCase();
      return sinTildes(String(m.concepto ?? '')) !== sinTildes(conceptoDeTipo(r.tipo, r.origen))
          || String(m.codigo ?? '').trim() !== r.documento
          || sinTildes(String(m.deportista ?? '')) !== sinTildes(r.nombre)
          || (!!det && !MESES_NOMINA.includes(det));
    }),
    [libro, tercerosLista],
  );
  /* Deteccion de errores por fila (pinta la fila de rojo).
     ANTES: marcaba como error TODO mes repetido. Eso senalaba como duplicados los
     pagos legitimos en dos contados — el que paga 124.200 y despues el resto, o
     la matricula en dos partes.
     AHORA (regla de la direccion, 19/08/2026): solo es error cuando la SUMA de lo
     pagado de ese mes SE PASA de la mensualidad. Ahi si puede haber doble pago. */
  const filasProblema = useMemo(() => {
    const prob: Record<string, string> = {};
    for (const m of libro) {
      const id = m.id || '';
      // a) La suma del mes se pasa de la mensualidad (posible doble pago)
      const sm = semaforo[id];
      if (sm?.exceso) { prob[id] = sm.motivo; continue; }
      // b) CODIGO SOSPECHOSO: no corresponde a ningun deportista.
      //    Queda en rojo hasta que una persona lo confirme o lo corrija.
      if (codigoFalso(m)) {
        prob[id] = `Codigo sospechoso: "${String(m.codigo ?? '').trim()}" no corresponde a ningun deportista. Revisar antes de confirmar.`;
      }
    }
    return prob;
  }, [libro, semaforo, codigosReales]);

  /** Cuantas filas tienen un codigo que no existe. */
  const numCodigoFalso = useMemo(
    () => libro.filter(m => codigoFalso(m)).length,
    [libro, codigosReales],
  );
  const numProblemas = useMemo(() => new Set(Object.keys(filasProblema)).size, [filasProblema]);

  // Recalcular el MES (Detalle) de los pagos del 5 de agosto en adelante, al mes PENDIENTE
  // correcto de cada deportista (baseline = sus meses de antes del 5-ago en el libro).
  /* ── RECLASIFICAR CONCEPTOS EN TODO EL LIBRO ──────────────────────────────
     Reglas dictadas por la administracion contable (19/08/2026). Se aplican a
     los movimientos YA cargados, no solo a los extractos nuevos.

     PROTECCION: nunca toca una fila que tenga codigo de deportista. Los pagos de
     los papas conservan su APORTE FORMACION / MATRICULA. Solo se reclasifican
     los movimientos propios del banco: intereses, tarjeta, 4x1000, cuota de
     manejo, servicio de nomina, traslados, proveedores.

     No publica nada al estado de cuenta. Muestra primero el resumen de lo que va
     a cambiar y pide confirmacion. */
  async function reclasificarConceptos() {
    type Cambio = { id: string; de: string; a: string; limpiarDetalle: boolean; codigoFalso: boolean };
    const cambios: Cambio[] = [];

    for (const m of libro) {
      // Solo se protegen las filas con un codigo REAL de deportista.
      // Las que traen basura en CODIGO se tratan como si no tuvieran, para que
      // tambien se les pueda poner el concepto que les corresponde.
      if (String(m.codigo ?? '').trim() && !codigoFalso(m)) continue;

      const actual = String(m.concepto ?? '').trim();

      /* REGLA (direccion, 24/08/2026):
         - Si la fila NO tiene concepto  → se llena segun la descripcion.
         - Si YA tiene concepto puesto   → NO se toca, salvo los renombres
           autorizados (4X1000, INGRESO FINANCIERO, PAGO TARJETA, NOMINA).
         Asi no se pisa el trabajo de la contabilidad: TRANSPORTE,
         GASTOS DE REPRESENTACION, PROVEEDOR, etc. quedan como estan. */
      const destino = actual
        ? conceptoRenombrado(actual)
        : clasificarConcepto(String(m.descripcion ?? ''), {
            debito: Number(m.debito) || 0,
            credito: Number(m.credito) || 0,
          }).concepto;

      const conceptoFinal  = destino || actual;
      const sinDetalle     = CONCEPTOS_SIN_DETALLE.includes(conceptoFinal);
      const cambiaConcepto = !!destino && destino.toUpperCase() !== actual.toUpperCase();
      const cambiaDetalle  = sinDetalle && !!String(m.detalle ?? '').trim();
      if (!cambiaConcepto && !cambiaDetalle) continue;

      cambios.push({ id: m.id || '', de: actual || '(vacio)', a: conceptoFinal, limpiarDetalle: sinDetalle, codigoFalso: codigoFalso(m) });
    }

    if (!cambios.length) { flash('Todo el libro ya esta clasificado segun las reglas. No hay nada que cambiar.'); return; }

    // Resumen "de → a" para ver el impacto ANTES de tocar nada.
    const resumen: Record<string, number> = {};
    for (const c of cambios) { const kk = `${c.de}  →  ${c.a}`; resumen[kk] = (resumen[kk] || 0) + 1; }
    const lineas = Object.entries(resumen)
      .sort((a, b) => b[1] - a[1])
      .map(([kk, n]) => `  ${String(n).padStart(6)}  ${kk}`)
      .join('\n');

    const conFalso = cambios.filter(c => c.codigoFalso).length;
    const aviso =
      'RECLASIFICAR CONCEPTOS DEL LIBRO\n\n' +
      `Se van a cambiar ${cambios.length.toLocaleString('es-CO')} filas:\n\n` +
      lineas +
      (conFalso ? `\n\n(${conFalso} de esas filas tienen un CODIGO que no corresponde a\n` +
                  'ningun deportista. Se les pone el concepto, pero el codigo\n' +
                  'sospechoso NO se toca: la fila queda en ROJO para que usted\n' +
                  'lo revise.)' : '') +
      '\n\nNO se toca ninguna fila que tenga codigo REAL de deportista.\n' +
      'NO se pisa ningun concepto ya puesto a mano (solo se renombran\n' +
      '4X1000, INGRESO FINANCIERO, PAGO TARJETA y NOMINA).\n' +
      'NO se publica nada al estado de cuenta.\n\n¿Continuar?';
    if (!window.confirm(aviso)) return;

    setReclasificando(true);
    flash(`Reclasificando ${cambios.length} filas…`);
    try {
      // Se agrupa por concepto destino para actualizar en lotes.
      const porConcepto: Record<string, { ids: string[]; limpiar: boolean }> = {};
      for (const c of cambios) {
        const g = porConcepto[c.a] || { ids: [], limpiar: c.limpiarDetalle };
        g.ids.push(c.id); porConcepto[c.a] = g;
      }
      let ok = true, hechas = 0;
      for (const concepto of Object.keys(porConcepto)) {
        const g = porConcepto[concepto];
        const patch: Partial<MovCont> = { concepto };
        if (g.limpiar) patch.detalle = '';            // INTERESES A FAVOR va sin mes
        const r = await asignarCodigoBulk(g.ids, patch);
        if (r) hechas += g.ids.length; else ok = false;
      }
      if (ok) flash(`✓ ${hechas.toLocaleString('es-CO')} filas reclasificadas`);
      else    flash('⚠ Algunas filas no se pudieron actualizar. Revisa la consola del navegador.');
      libroCache = null;
      await cargarLibro();
    } catch (e: any) {
      flash('⚠ Error al reclasificar: ' + (e?.message || e));
    }
    setReclasificando(false);
  }

  /* ── TERCEROS POR DESCRIPCIÓN (arreglar lo ya cargado) ────────────────────
     Recorre el libro, mira a quién señala la descripción del banco y le pone a
     cada fila: el concepto que le toca por su tipo, la cédula/NIT en CÓDIGO y
     el nombre completo. El MES que ya estuviera bien puesto NO se toca; solo se
     borra lo que haya en DETALLE cuando no es un mes del año.
     Muestra primero el resumen y pide confirmación.
     NO publica nada al estado de cuenta. */
  async function aplicarNominaDescripcion() {
    if (!nominaDescPendientes.length) {
      flash('Todo lo que se reconoce por la descripción ya está puesto.');
      return;
    }
    /* Se agrupa por persona, y dentro de cada una se separan las filas a las que
       hay que borrarles el DETALLE de las que ya traen un mes válido. */
    type Grupo = { doc: string; nombre: string; tipo: string; concepto: string; conMes: string[]; sinMes: string[] };
    const porPersona: Record<string, Grupo> = {};
    for (const m of nominaDescPendientes) {
      const r = terceroDeDesc(m.descripcion);
      if (!r || !m.id) continue;
      const g = porPersona[r.documento] = porPersona[r.documento]
        || { doc: r.documento, nombre: r.nombre, tipo: r.tipo, concepto: conceptoDeTipo(r.tipo, r.origen), conMes: [], sinMes: [] };
      const det = String(m.detalle ?? '').trim().toUpperCase();
      if (det && MESES_NOMINA.includes(det)) g.conMes.push(m.id);
      else g.sinMes.push(m.id);
    }
    const grupos = Object.values(porPersona).sort((a, b) => (b.conMes.length + b.sinMes.length) - (a.conMes.length + a.sinMes.length));
    const lineas = grupos
      .map(g => `  ${String(g.conMes.length + g.sinMes.length).padStart(6)}  ${g.nombre}` +
                `\n           ${g.doc}  ·  ${g.tipo || 'SIN TIPO'}  →  ${g.concepto}`)
      .join('\n');
    const aviso =
      'TERCEROS RECONOCIDOS POR LA DESCRIPCIÓN\n\n' +
      `Se van a marcar ${nominaDescPendientes.length.toLocaleString('es-CO')} filas:\n\n` +
      lineas +
      '\n\nEn cada una queda el CÓDIGO, el NOMBRE COMPLETO y el CONCEPTO\n' +
      'que le corresponde según su tipo en Nómina y Proveedores.\n\n' +
      'El MES que ya esté bien puesto NO se toca.\n' +
      'NO se publica nada al estado de cuenta.\n\n¿Continuar?';
    if (!window.confirm(aviso)) return;

    setAplicandoNomina(true);
    flash(`Marcando ${nominaDescPendientes.length} filas…`);
    try {
      let ok = true, hechas = 0;
      for (const g of grupos) {
        const base = { concepto: g.concepto, codigo: g.doc, deportista: g.nombre };
        if (g.sinMes.length) {
          const r = await asignarCodigoBulk(g.sinMes, { ...base, detalle: '' });
          if (r) hechas += g.sinMes.length; else ok = false;
        }
        if (g.conMes.length) {
          const r = await asignarCodigoBulk(g.conMes, base);   // se le respeta el mes
          if (r) hechas += g.conMes.length; else ok = false;
        }
      }
      if (ok) flash(`✓ ${hechas.toLocaleString('es-CO')} filas marcadas`);
      else    flash('⚠ Algunas filas no se pudieron actualizar. Revisa la consola del navegador.');
      libroCache = null;
      await cargarLibro();
    } catch (e: any) {
      flash('⚠ Error al marcar los terceros: ' + (e?.message || e));
    }
    setAplicandoNomina(false);
  }

  async function recalcularMeses() {
    const CUT = '2026-08-05';
    setRecalculando(true);
    flash('Analizando meses pendientes…');
    let updates: { id: string; detalle: string }[] = [];
    try {
      const movs = await getMovimientos();
      // Meses YA confirmados en el ESTADO DE CUENTA (fuente de verdad). Si borraste
      // un mes ahí (p. ej. por incapacidad), deja de contar y el siguiente pago va al
      // mes que sigue.
      const pagadosKeys = await getPagadosKeys(); // ["codigo|MES", ...]
      const cubiertoEstado: Record<string, Set<string>> = {};
      for (const k of pagadosKeys) {
        const i = k.indexOf('|'); if (i < 0) continue;
        const c = k.slice(0, i).trim(); const mes = k.slice(i + 1).trim();
        if (!c || !mes) continue;
        (cubiertoEstado[c] = cubiertoEstado[c] || new Set()).add(mes);
      }
      const porCod: Record<string, MovCont[]> = {};
      for (const m of movs) { const cod = String(m.codigo ?? '').trim(); if (cod) (porCod[cod] = porCod[cod] || []).push(m); }
      for (const cod of Object.keys(porCod)) {
        const list = porCod[cod];
        // Baseline = lo que REALMENTE aparece en el estado de cuenta del deportista.
        // Si aún no tiene estado de cuenta, usamos como respaldo sus créditos
        // históricos del libro (antes del 5-ago).
        const baseline = new Set<string>();
        const desdeEstado = cubiertoEstado[cod];
        if (desdeEstado && desdeEstado.size) {
          for (const mes of desdeEstado) if (MESES_CICLO.includes(mes)) baseline.add(mes);
        } else {
          for (const m of list) {
            if (Number(m.credito) > 0 && String(m.fecha ?? '') < CUT) {
              const det = String(m.detalle ?? '').trim(); if (det) baseline.add(det);
            }
          }
        }
        // Pagos mensuales del 5-ago en adelante (sin matrícula), en orden por fecha
        const nuevos = list.filter(m => Number(m.credito) > 0 && String(m.fecha ?? '') >= CUT && !/MATR[IÍ]CUL|INSCRIP/i.test(String(m.concepto ?? '')));
        nuevos.sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')));
        const asignados = new Set<string>(baseline);
        for (const m of nuevos) {
          // El mes que SIGUE al último cubierto (no rellena huecos saltados/excusados)
          let lastIdx = -1;
          for (let i = 0; i < MESES_CICLO.length; i++) if (asignados.has(MESES_CICLO[i])) lastIdx = i;
          const sig = MESES_CICLO[lastIdx + 1];
          if (!sig) continue;
          asignados.add(sig);
          if (sig !== String(m.detalle ?? '').trim() && m.id) updates.push({ id: m.id, detalle: sig });
        }
      }
    } catch (e: any) { setRecalculando(false); flash('⚠ Error al analizar: ' + (e?.message || e)); return; }
    setRecalculando(false);
    if (!updates.length) { flash('✓ No hay meses por corregir; todo está en su mes pendiente.'); return; }
    if (!window.confirm(
      `Se corregirá el MES (Detalle) de ${updates.length} pago(s) del 5 de agosto en adelante,\n` +
      `poniéndoles el mes PENDIENTE correcto de cada deportista.\n\n` +
      `• El mes que sigue se calcula según el ESTADO DE CUENTA (lo que ya tiene ahí);\n` +
      `  si borraste un mes por incapacidad, no se vuelve a asignar.\n` +
      `• Solo cambia el libro (NO toca el estado de cuenta).\n` +
      `• Los históricos (antes del 5-ago) no se tocan.\n\n¿Continuar?`
    )) return;
    setRecalculando(true);
    const porDetalle: Record<string, string[]> = {};
    for (const u of updates) (porDetalle[u.detalle] = porDetalle[u.detalle] || []).push(u.id);
    let ok = true;
    for (const det of Object.keys(porDetalle)) {
      const r = await asignarCodigoBulk(porDetalle[det], { detalle: det });
      if (!r) ok = false;
    }
    libroCache = null;
    await cargarLibro(true);
    setRecalculando(false);
    flash(ok ? `✓ ${updates.length} pago(s) corregidos a su mes pendiente` : '⚠ Algunos no se pudieron corregir');
  }

  // Publicar el pago de UNA sola fila al estado de cuenta (para ensayar uno por uno)
  async function actualizarPagoFila(m: MovCont) {
    const cod = String(m.codigo ?? '').trim();
    const det = String(m.detalle ?? '').trim();
    if (!cod || !det || !(Number(m.credito) > 0)) { flash('⚠ La fila necesita código, mes (Detalle) y ser un crédito.'); return; }
    // Si la fila está en amarillo (cambio sin guardar), la guardamos automáticamente
    // antes de publicar — así no te bloquea y actualizas tranquilo.
    if (dirtyIds.has(m.id || '')) {
      const rg = await actualizarMovimiento(m.id || '', { concepto: m.concepto, detalle: m.detalle, codigo: m.codigo, deportista: m.deportista });
      if (!rg) { flash('⚠ No se pudo guardar el cambio de la fila. Intenta de nuevo.'); return; }
      setDirtyIds(prev => { const n = new Set(prev); n.delete(m.id || ''); return n; });
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: libro };
    }
    const sum = libro
      .filter(x => String(x.codigo ?? '').trim() === cod && String(x.detalle ?? '').trim() === det && Number(x.credito) > 0)
      .reduce((s, x) => s + (Number(x.credito) || 0), 0);
    if (!window.confirm(`Publicar al estado de cuenta de ${m.deportista || cod}:\n${det} = $${Math.round(sum).toLocaleString('es-CO')}\n\n¿Continuar?`)) return;
    const r = await publicarPagosEstado([{ deportista_id: cod, detalle: det, vPagado: '$ ' + Math.round(sum).toLocaleString('es-CO'), destino: m.banco || '', fecha: m.fecha || '' }]);
    if (r.ok) {
      setPublicadas(prev => { const n = new Set(prev); n.add(cod + '|' + det); return n; });
      flash(`✓ Pago publicado: ${m.deportista || cod} · ${det}`);
    } else flash('⚠ Error: ' + (r.msg || ''));
  }
  // Lista de códigos únicos (ordenados) para el desplegable del filtro de Código
  const codigosUnicos = useMemo(() =>
    Array.from(new Set(libro.map(m => String(m.codigo ?? '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [libro]);
  /* ── CUENTAS POSIBLES: LA AYUDA MIENTRAS SE TECLEA ────────────────────────
     (dirección, 05/09/2026 — «que al escribirlo vaya apareciendo, ejemplo
      310443…, y que aparezcan las cuentas posibles; pero hay soportes que solo
      muestran los últimos 4 dígitos: que al digitarlos aparezcan las cuentas
      con esos dígitos de últimos»)

     Con el soporte en la mano uno tiene un número —a veces la cuenta completa,
     a veces solo los cuatro últimos— y necesita saber si esa cuenta YA existe
     en el libro y de quién es. Desde el segundo dígito, debajo de la casilla
     aparece la lista de cuentas que coinciden, con el nombre y cuántos
     movimientos tiene cada una. Un clic y el libro queda filtrado por esa.

     El orden es el que sirve leyendo un soporte:
       1º las que TERMINAN en lo tecleado  (los últimos 4 dígitos del soporte),
       2º las que EMPIEZAN por lo tecleado (se está escribiendo la cuenta),
       3º las que lo llevan por dentro,
     y dentro de cada grupo, primero la que más movimientos tiene. */
  const cuentasPosibles = useMemo(() => {
    if (filCodModo !== 'contiene') return [];
    const d = String(fil.codigo ?? '').replace(/\D/g, '');
    if (d.length < 2) return [];
    const mapa = new Map<string, { cuenta: string; nombre: string; n: number }>();
    for (const m of libro) {
      const cuenta = String(m.codigo ?? '').trim();
      if (!cuenta) continue;
      const soloNum = cuenta.replace(/\D/g, '');
      if (!soloNum.includes(d)) continue;
      const y = mapa.get(cuenta);
      if (y) { y.n += 1; if (!y.nombre) y.nombre = nombreDeFila(m) || ''; }
      else mapa.set(cuenta, { cuenta, nombre: nombreDeFila(m) || '', n: 1 });
    }
    const rango = (c: string) => {
      const s = c.replace(/\D/g, '');
      if (s.endsWith(d)) return 0;
      if (s.startsWith(d)) return 1;
      return 2;
    };
    return Array.from(mapa.values())
      .sort((a, b) => rango(a.cuenta) - rango(b.cuenta) || b.n - a.n)
      .slice(0, 12);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [libro, fil.codigo, filCodModo]);
  const [verCuentas, setVerCuentas] = useState(true);

  const totDebito = useMemo(() => libroFiltrado.reduce((s, m) => s + (Number(m.debito) || 0), 0), [libroFiltrado]);
  const totCredito = useMemo(() => libroFiltrado.reduce((s, m) => s + (Number(m.credito) || 0), 0), [libroFiltrado]);
  const filVacio = { banco: '', fecha: '', desc: '', debito: '', credito: '', saldo: '', concepto: '', codigo: '', deportista: '', detalle: '' };
  const hayFiltro = Object.values(fil).some(v => v);
  // Al montar, recuperar el estado guardado (pestaña, cuenta, filtros, filas) para volver con "Atrás"
  useEffect(() => {
    let ui: any = null;
    try { const s = sessionStorage.getItem('cont_ui_v1'); ui = s ? JSON.parse(s) : null; } catch { /* noop */ }
    if (ui) {
      saltarReset.current = true; // que el cambio de filtros/cuenta no reinicie el límite recuperado
      if (ui.vista) setVista(ui.vista);
      if (ui.libroBanco) setLibroBanco(ui.libroBanco);
      if (ui.fil) setFil((prev: any) => ({ ...prev, ...ui.fil }));
      if (typeof ui.limite === 'number') setLimite(ui.limite);
    }
    // eslint-disable-next-line
  }, []);

  /* ── ENTRAR DIRECTO AL LIBRO, FILTRADO POR UN DEPORTISTA ─────────────────
     (dirección, 01/09/2026)

     PARA QUÉ: el papá manda la foto del pago a PAGOS PENDIENTES. Antes de
     darle OK hay que comprobar que esa plata SÍ entró al banco, y eso solo se
     ve aquí, en el Libro. Hasta hoy tocaba salirse, entrar a Contabilidad,
     escoger la pestaña Libro, acordarse del código y escribirlo. Ahora el
     botón LIBRO de allá trae para acá con el código puesto en la dirección:
        /contabilidad?codigo=23067
     y esta pantalla se abre sola en el Libro, en TODAS las cuentas —porque el
     pago pudo entrar a cualquiera de las tres—, con ese código en el filtro y
     en modo EXACTO, para que no salgan códigos parecidos.

     VA DESPUÉS de la restauración de arriba, y a propósito: si la dirección
     llega por este enlace, manda el enlace, no lo que quedó guardado de la
     última visita.

     Se lee de window.location y no del useSearchParams de Next, porque ese
     obliga a envolver toda la pantalla en un <Suspense>. */
  const entrePorEnlace = useRef(false);
  /** El deportista que me trajo desde PAGOS PENDIENTES. Mientras tenga valor,
   *  arriba se ve la barra para devolverse a confirmarle el pago. */
  const [vengoDePendientes, setVengoDePendientes] = useState('');
  /** El DÍA en que el papá subió ese soporte. Sirve para el segundo caso:
   *  el pago NO aparece por código, y hay que buscarlo por fecha en el libro
   *  de ese día. — dirección, 05/09/2026 */
  const [diaDelSoporte, setDiaDelSoporte] = useState('');
  useEffect(() => {
    if (entrePorEnlace.current) return;
    let cod = '';
    let dia = '';
    try {
      const q = new URLSearchParams(window.location.search);
      cod = q.get('codigo') ?? '';
      dia = q.get('dia') ?? '';
    } catch { /* nada */ }
    cod = cod.trim();
    setDiaDelSoporte(dia.trim());
    if (!cod) return;
    entrePorEnlace.current = true;
    saltarReset.current = true;          // que no se reinicie el bloque de filas
    setVista('libro');
    setLibroBanco('TODAS');
    setFilCodModo('exacto');
    setFilChulo('todos');                // que no se esconda por el chulo
    setFil(f => ({ ...filVacio, codigo: cod, banco: f.banco }));
    setVengoDePendientes(cod);
    // eslint-disable-next-line
  }, []);
  // Al cambiar de cuenta o de filtro, volvemos a mostrar desde el primer bloque
  // (saltamos el primer montaje y la restauración, para no borrar el estado recuperado)
  useEffect(() => {
    if (primerResetLimite.current) { primerResetLimite.current = false; return; }
    if (saltarReset.current) { saltarReset.current = false; return; }
    setLimite(100);
  }, [fil, libroBanco, soloEgresoSinConc, soloIngresoSinConc, soloSinDetalle]);
  // Aplicar el filtro con un pequeño retraso (evita recalcular/redibujar en cada tecla)
  useEffect(() => { const t = setTimeout(() => setFilDebounced(fil), 250); return () => clearTimeout(t); }, [fil]);

  /* La franja gris se borra sola al primer clic en cualquier parte: ya cumplió
     su oficio, que era decir «aquí ibas». — dirección, 05/09/2026 */
  useEffect(() => {
    if (!filaDondeIba || estadoCuentaUrl) return;
    const quitar = () => setFilaDondeIba(null);
    window.addEventListener('pointerdown', quitar, { once: true });
    return () => window.removeEventListener('pointerdown', quitar);
  }, [filaDondeIba, estadoCuentaUrl]);
  // Guardar el estado de la vista para poder volver exactamente aquí.
  // Saltamos el PRIMER montaje para no sobrescribir con valores por defecto lo ya guardado.
  const primerPersist = useRef(true);
  useEffect(() => {
    if (primerPersist.current) { primerPersist.current = false; return; }
    try { sessionStorage.setItem('cont_ui_v1', JSON.stringify({ vista, libroBanco, fil, limite })); } catch { /* noop */ }
  }, [vista, libroBanco, fil, limite]);
  // visibles = los últimos `limite` movimientos (más recientes). Para MOSTRARLOS en orden
  // normal de libro (antiguo → reciente, lo último abajo) invertimos solo la vista.
  const visibles = useMemo(() => libroFiltrado.slice(0, limite), [libroFiltrado, limite]);
  const visiblesVista = useMemo(() => visibles.slice().reverse(), [visibles]);
  // Número de fila estilo Excel sobre TODO el libro (no cambia al filtrar): la fila 1 es
  // el movimiento más antiguo. Como `libro` viene en orden fecha DESC, el rango cronológico
  // de la fila en la posición k es (total - k). Así, al filtrar un deportista, cada pago
  // muestra en qué fila exacta del libro completo está.
  const numFila = useMemo(() => {
    const map: Record<string, number> = {};
    const n = libro.length;
    libro.forEach((m, k) => { if (m.id) map[m.id] = n - k; });
    return map;
  }, [libro]);
  // Al volver del estado de cuenta: ubicar EXACTAMENTE la fila del deportista que
  // clicaste — carga hasta esa fila si hace falta, se desplaza a ella y la resalta.
  useEffect(() => {
    if (vista !== 'libro' || cargandoLibro || scrollRestaurado.current) return;
    let target: string | null = null;
    try { target = sessionStorage.getItem('cont_last_row'); } catch { /* noop */ }
    if (!target) { scrollRestaurado.current = true; return; }
    const idx = libroFiltrado.findIndex(m => m.id === target);
    if (idx < 0) { scrollRestaurado.current = true; return; }
    if (idx >= limite) { setLimite(idx + 20); return; } // cargar hasta esa fila y reintentar
    scrollRestaurado.current = true;
    setResaltarId(target);
    setTimeout(() => setResaltarId(null), 2800);
    requestAnimationFrame(() => {
      const el = document.getElementById('mov-' + target);
      if (el) el.scrollIntoView({ block: 'center' });
      try { sessionStorage.removeItem('cont_last_row'); } catch { /* noop */ }
    });
  }, [vista, cargandoLibro, libroFiltrado, limite]);

  /* ── RECORDAR EN QUÉ FILA VA ─────────────────────────────────────────────
     ERROR CORREGIDO (26/08/2026): el código de ARRIBA ya sabía devolver la
     pantalla a la fila guardada en 'cont_last_row'… pero NADIE la guardaba.
     Solo se escribía al hacer clic en un deportista para ir a su estado de
     cuenta. Por eso, al editar un movimiento o al entrar a otra sección y
     volver, el libro arrancaba otra vez desde arriba y tocaba bajar a buscar
     dónde iba uno.

     Ahora el libro anota solo la primera fila que se está viendo, cada vez
     que uno se desplaza. Al volver, regresa a esa fila y la resalta un
     momento para que salte a la vista. */
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont || vista !== 'libro') return;
    let temporizador: any;
    const anotarFila = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        const borde = cont.getBoundingClientRect().top;
        const filas = cont.querySelectorAll('tr[id^="mov-"]');
        for (const f of Array.from(filas)) {
          const caja = (f as HTMLElement).getBoundingClientRect();
          // La primera fila que todavía se alcanza a ver bajo el encabezado
          if (caja.bottom > borde + 40) {
            const id = (f as HTMLElement).id.replace('mov-', '');
            if (id) { try { sessionStorage.setItem('cont_last_row', id); } catch { /* noop */ } }
            break;
          }
        }
      }, 250);
    };
    cont.addEventListener('scroll', anotarFila, { passive: true });
    return () => { clearTimeout(temporizador); cont.removeEventListener('scroll', anotarFila); };
  }, [vista]);

  // ── Editor / división de un movimiento ──
  function abrirEditor(m: MovCont) {
    // Se anota la fila ANTES de abrir el editor: si al guardar se recarga el
    // libro, la pantalla vuelve exactamente a este movimiento.
    if (m.id) { try { sessionStorage.setItem('cont_last_row', m.id); } catch { /* noop */ } }
    setEditRow({ orig: m, filas: [{ ...m }] });
  }
  function agregarFila() {
    setEditRow(er => er && ({
      ...er,
      filas: [...er.filas, {
        ...er.orig,
        // El id de la fila dividida DERIVA del id de la original (mismo prefijo). Así, aunque
        // todo el lote comparta 'creado', el orden por id las deja pegadas una debajo de la otra.
        id: er.orig.id ? `${er.orig.id}_d${Math.random().toString(36).slice(2, 6)}` : undefined,
        hash: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        debito: 0, credito: 0, saldo: null,
        // hereda 'creado' de la original (via ...er.orig) para quedar en el mismo grupo
      }],
    }));
  }
  function editarSplit(i: number, campo: keyof MovCont, val: any) {
    setEditRow(er => er && ({ ...er, filas: er.filas.map((r, j) => j === i ? { ...r, [campo]: val } : r) }));
  }
  function quitarSplit(i: number) {
    setEditRow(er => er && ({ ...er, filas: er.filas.filter((_, j) => j !== i) }));
  }
  async function guardarEditor() {
    if (!editRow || !editRow.filas.length) return;
    setGuardandoEd(true);
    try {
      const [orig, ...resto] = editRow.filas;
      if (orig.id) await actualizarMovimiento(orig.id, orig);
      const nuevos = resto.filter(r => (Number(r.debito) || 0) !== 0 || (Number(r.credito) || 0) !== 0 || !!r.concepto || !!r.codigo || !!r.detalle);
      if (nuevos.length) await guardarMovimientos(nuevos as MovCont[]);
      flash('Movimiento actualizado ✓');
      setEditRow(null);
      libroCache = null;              // invalidar caché para que se vean los cambios
      /* Al recargar, el libro se va otra vez para arriba. Se vuelve a habilitar
         la restauración para que regrese a la fila que se acaba de editar
         —abrirEditor la dejó anotada—. — 26/08/2026 */
      scrollRestaurado.current = false;
      await cargarLibro(true);        // FORZAR recarga (no usar la caché vieja)
    } catch (e: any) { flash('Error al guardar: ' + (e?.message || e)); }
    setGuardandoEd(false);
  }

  async function sembrar() {
    if (!window.confirm('Sembrar el diccionario con ~4.600 cruces (una sola vez). ¿Continuar?')) return;
    setSembrando(true); setProgreso('Descargando diccionario…');
    try {
      const res = await fetch('/contabilidad/mapeo-seed.json');
      const arr = await res.json();
      await sembrarDiccionario(arr, (n, tot) => setProgreso(`Sembrando ${n}/${tot}…`));
      await getMapeoIndex().then(setIdx);
      await contarMapeo().then(setMapeoCount);
      flash('Diccionario sembrado ✓');
    } catch (e: any) { flash('Error sembrando: ' + (e?.message || e)); }
    setSembrando(false); setProgreso('');
  }

  async function exportarLibro() {
    const XLSX = await loadXLSX();
    // Exporta lo que se está viendo (cuenta + filtros aplicados), con CÓDIGO antes de DEPORTISTA.
    const rows = libroFiltrado.map(m => ({
      BANCO: m.banco, FECHA: m.fecha, DESCRIPCIÓN: m.descripcion, REFERENCIA: m.referencia,
      DÉBITO: m.debito, CRÉDITO: m.credito, SALDO: m.saldo, CONCEPTO: m.concepto,
      CÓDIGO: m.codigo, DEPORTISTA: nombreDeFila(m), DETALLE: m.detalle,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Libro');
    XLSX.writeFile(wb, `LibroDinamico_${(esTodas ? 'TODAS' : libroBanco).replace(/\s+/g, '')}.xlsx`);
  }

  const totRev = revision.length;
  const autom = revision.filter(r => !r._pendiente && r.id !== '__DUP__').length;
  const pend = revision.filter(r => r._pendiente && r.id !== '__DUP__').length;
  const dup = revision.filter(r => r.id === '__DUP__').length;

  return (
    <div className="min-h-screen bg-[#333F50]">
      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {/* ── LA FLECHA DE ATRÁS SABE DE DÓNDE VINE ──────────────────────
              (dirección, 05/09/2026 — «estoy en soportes, voy al libro, veo
               que el pago sí está, solo me queda confirmar el soporte; pero si
               le doy atrás, se sale: debe ir a soportes y en franja roja el
               mismo código, para confirmar y que desaparezca»)

              Si llegué desde SOPORTES, la flecha devuelve a SOPORTES —al mismo
              renglón, que allá queda con su franja roja—. Si entré por el menú,
              devuelve al tablero como siempre. */}
          <button onClick={() => router.push(vengoDePendientes ? '/pagos-pendientes' : '/dashboard')}
            title={vengoDePendientes ? 'Volver a Soportes, al mismo renglón' : 'Volver al tablero'}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><Calculator className="w-4 h-4 text-white" /></div>
          <div>
            <h1 className="font-black text-white text-base sm:text-lg leading-tight">Contabilidad · Libro Dinámico</h1>
            <p className="text-white/60 text-xs">Sube el extracto del banco y el sistema arma el libro</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVista('diccionario')} title="Diccionario de cuentas y códigos"
            className="flex items-center gap-1.5 text-[11px] sm:text-xs font-black text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition">
            <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">Diccionario de cuentas y códigos</span><span className="sm:hidden">Diccionario</span> ({mapeoCount.toLocaleString('es-CO')})
          </button>
        </div>
      </header>

      {msg && <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg ${msg.startsWith('✓') ? 'bg-[#16a34a]' : msg.startsWith('⚠') ? 'bg-red-600' : 'bg-gray-900'}`}>{msg}</div>}

      {/* Barra de cambios pendientes del libro: nada se graba hasta pulsar "Guardar ahora" */}
      {vista === 'libro' && dirtyIds.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 bg-[#3C4759] border-2 border-[#16a34a] shadow-2xl rounded-full pl-4 pr-2 py-2">
          <span className="text-sm font-black text-white">{dirtyIds.size} cambio(s) sin guardar</span>
          <button onClick={descartarCambiosLibro} disabled={guardandoCambios} className="text-xs font-bold text-white/70 hover:text-white px-2 py-1.5 disabled:opacity-60">Descartar</button>
          <button onClick={guardarCambiosLibro} disabled={guardandoCambios} className="flex items-center gap-1.5 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-full hover:bg-[#064e1e] transition disabled:opacity-60">
            <Save className="w-4 h-4" /> {guardandoCambios ? 'Guardando…' : 'Guardar ahora'}
          </button>
        </div>
      )}

      {/* La foto del soporte, flotando encima del libro. — 05/09/2026 */}
      <SoporteFlotante />

      {/* Estado de cuenta EN VENTANA sobre el libro — al cerrar, sigues en la misma fila */}
      {estadoCuentaUrl && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-1 sm:p-3">
          <div className="bg-[#3C4759] rounded-2xl shadow-2xl w-full h-full max-w-5xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[#064e1e] text-white flex-shrink-0">
              <span className="font-black text-sm">Estado de cuenta del deportista</span>
              <div className="flex items-center gap-2">
                <a href={estadoCuentaUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-white/80 hover:text-white underline">Abrir en pestaña</a>
                <button onClick={() => {
                    setEstadoCuentaUrl(null);
                    /* Al volver: la pantalla se desplaza hasta la fila donde iba,
                       que queda pintada de gris claro. — dirección, 05/09/2026 */
                    if (filaDondeIba) setTimeout(() => {
                      document.getElementById('mov-' + filaDondeIba)
                        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }, 80);
                    getPagadosKeys().then(keys => setPublicadas(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; })).catch(() => {}); }}
                  className="flex items-center gap-1 bg-white/20 hover:bg-white/35 px-3 py-1.5 rounded-lg text-sm font-black transition">
                  <X className="w-4 h-4" /> Volver al libro
                </button>
              </div>
            </div>
            <iframe src={estadoCuentaUrl} className="flex-1 w-full" style={{ border: 0 }} title="Estado de cuenta" />
          </div>
        </div>
      )}

      <main className={`${vista === 'libro' ? 'max-w-none' : 'max-w-6xl'} mx-auto px-3 sm:px-6 py-5 space-y-4`}>

        {/* ── LA VUELTA A PAGOS PENDIENTES ───────────────────────────────
            (dirección, 01/09/2026) Si llegué aquí desde el botón LIBRO de
            Pagos Pendientes, es para comprobar UNA cosa: que la plata del
            papá sí entró. Comprobada, hay que devolverse de una a darle OK y
            quitar ese pendiente. Sin esta barra tocaba adivinar el camino de
            vuelta. La flecha del navegador también sirve; esto es para que se
            vea, y para que se vea de quién se está hablando. */}
        {!!vengoDePendientes && (
          <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3"
            style={{ background: '#3C4759', border: '2px solid #E0A33A' }}>
            <button
              onClick={() => router.push('/pagos-pendientes')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-white font-black text-[12px] transition hover:brightness-110"
              style={{ background: '#00B050' }}>
              <ArrowLeft className="w-4 h-4" /> VOLVER A PAGOS PENDIENTES
            </button>
            <p className="text-white text-[12.5px] font-semibold">
              Estás viendo los movimientos del código{' '}
              <b style={{ color: '#E0A33A' }}>{vengoDePendientes}</b>.
              Si el pago aparece, devuélvete y dale <b style={{ color: '#5BE39B' }}>OK</b>.
            </p>
            {/* ── SEGUNDO CASO: EL PAGO NO APARECE POR CÓDIGO ────────────────
                (dirección, 05/09/2026 — «observo el soporte y voy a libro y no
                 aparece; quito el código manualmente y que vaya a la parte del
                 libro y cuenta donde paga, es decir fila o renglón con la fecha
                 de cuando subió el soporte»)

                Muchos pagos entran al banco SIN el código del deportista: el
                papá pagó desde otra cuenta, o el banco no trajo la referencia.
                Buscar por código no sirve; hay que mirar el día. Este botón
                quita el código y para el libro en el día en que el papá subió
                el soporte, en TODAS las cuentas. Con las flechitas se corre un
                día para atrás o para adelante, porque el banco a veces registra
                al día siguiente. */}
            {!!diaDelSoporte && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setFil(x => ({ ...x, codigo: '', fecha: diaDelSoporte })); setLibroBanco('TODAS'); }}
                  title={`Quitar el código y mirar todo lo que entró el ${diaDelSoporte}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-white font-black text-[12px] transition hover:brightness-110"
                  style={{ background: '#C0504D' }}>
                  NO APARECE · VER EL DÍA {diaDelSoporte}
                </button>
                {fil.fecha && (
                  <>
                    <button onClick={() => setFil(x => ({ ...x, fecha: correrDia(x.fecha || diaDelSoporte, -1) }))}
                      title="Un día antes" className="px-2 py-2 rounded-lg text-white font-black text-[12px]"
                      style={{ background: '#2B3547', border: '1px solid #4A5568' }}>‹</button>
                    <button onClick={() => setFil(x => ({ ...x, fecha: correrDia(x.fecha || diaDelSoporte, 1) }))}
                      title="Un día después" className="px-2 py-2 rounded-lg text-white font-black text-[12px]"
                      style={{ background: '#2B3547', border: '1px solid #4A5568' }}>›</button>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => { setVengoDePendientes(''); setFil(x => ({ ...x, codigo: '' })); }}
              title="Quitar el filtro y quedarme en el libro completo"
              className="ml-auto text-white/55 hover:text-white text-[11.5px] font-bold underline">
              Ver el libro completo
            </button>
          </div>
        )}

        {/* Controles */}
        <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Cuenta bancaria</label>
            <select value={banco} onChange={e => setBanco(e.target.value)} className="border border-[#4A5568] rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-[#3C4759]">
              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-xl cursor-pointer hover:bg-[#064e1e] transition">
            <Upload className="w-4 h-4" /> {cargando ? 'Leyendo…' : 'Subir extracto'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onArchivo} disabled={cargando} />
          </label>
          <div className="ml-auto flex items-center gap-1.5 bg-[#2B3547] rounded-xl p-1">
            {([['subir', 'Movimientos'], ['libro', 'Libro'], ['desconocidas', 'Por asignar'], ['cuentas', 'Cuentas']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVista(v)}
                className={`text-sm font-black px-3 py-1.5 rounded-lg transition ${vista === v ? 'bg-[#16a34a] text-white shadow-sm' : 'text-white/70 hover:bg-[#2B3547]'}`}>{l}</button>
            ))}
          </div>
          {mapeoCount < 100 && (
            <button onClick={sembrar} disabled={sembrando} className="flex items-center gap-1.5 border border-amber-300 text-[#E0A33A] bg-[rgba(224,163,58,.14)] text-xs font-black px-3 py-2 rounded-xl hover:bg-amber-100 transition disabled:opacity-60">
              <Database className="w-4 h-4" /> {sembrando ? progreso || 'Sembrando…' : 'Sembrar diccionario'}
            </button>
          )}
          {movCount === 0 && (
            <button onClick={importarHist} disabled={importando} className="flex items-center gap-1.5 border border-blue-300 text-[#8FBEF0] bg-[rgba(78,143,214,.14)] text-xs font-black px-3 py-2 rounded-xl hover:bg-blue-100 transition disabled:opacity-60">
              <BookOpen className="w-4 h-4" /> {importando ? progreso || 'Importando…' : 'Importar histórico'}
            </button>
          )}
        </div>

        {/* ── Vista SUBIR / revisión ── */}
        {vista === 'subir' && (
          revision.length === 0 ? (
            cargando ? (
              <div className="bg-[#3C4759] rounded-2xl border-2 border-dashed border-[rgba(0,176,80,.45)] p-12 text-center">
                <div className="w-10 h-10 border-4 border-[rgba(0,176,80,.45)] border-t-[#16a34a] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#16a34a] font-black">Leyendo el archivo, un momento…</p>
                <p className="text-white/40 text-sm mt-1">Separando débito/crédito y cruzando cada pago con su deportista.</p>
              </div>
            ) : (
              <div className="bg-[#3C4759] rounded-2xl border-2 border-dashed border-[#4A5568] p-12 text-center">
                <Calculator className="w-12 h-12 text-white/40 mx-auto mb-3" />
                <p className="text-white/70 font-bold">Sube el Excel del banco para empezar</p>
                <p className="text-white/40 text-sm mt-1">El sistema separa débito/crédito, cruza cada pago con el deportista y arma el libro.</p>
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['Movimientos', totRev, '#374151'], ['Automáticos', autom, '#16a34a'], ['Por revisar', pend, '#f97316'], ['Ya existían', dup, '#6b7280']].map(([l, v, c]) => (
                  <div key={l as string} className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-3 text-center">
                    <p className="text-2xl font-black" style={{ color: c as string }}>{v as number}</p>
                    <p className="text-xs text-white/40 font-medium">{l as string}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden">
                <div className="overflow-x-auto" style={{ maxHeight: '62vh' }}>
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 920 }}>
                    <thead>
                      <tr>
                        {['FECHA', 'DESCRIPCIÓN', 'REFERENCIA', 'DÉBITO', 'CRÉDITO', 'CONCEPTO', 'DEPORTISTA / CÓDIGO'].map(h => (
                          <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {revision.map((r, i) => (
                        <FilaRevision key={i} r={r} i={i} deportistas={deportistas} conceptos={conceptos} onAsignar={asignarDeportista} onEditar={editarCampo} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={guardarLibro} disabled={guardando} className="flex items-center gap-2 bg-[#16a34a] text-white font-black px-6 py-3 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
                  <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : `Guardar ${totRev - dup} en el libro`}
                </button>
              </div>
            </>
          )
        )}

        {/* ── Vista LIBRO ── */}
        {vista === 'libro' && (
          <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#4A5568]">
              {/* Selector de cuenta: TODAS pega las tres cuentas */}
              <div className="flex items-center gap-1.5 bg-[#2B3547] rounded-xl p-1">
                {['TODAS', ...BANCOS].map(b => (
                  <button key={b} onClick={() => setLibroBanco(b)}
                    className={`text-xs font-black px-2.5 py-1.5 rounded-lg transition ${libroBanco === b ? 'bg-[#16a34a] text-white shadow-sm' : 'text-white/70 hover:bg-[#2B3547]'}`}>
                    {b === 'TODAS' ? 'Todas las cuentas' : b.replace('Bancolombia ', '')}
                  </button>
                ))}
              </div>
              <p className="font-black text-white text-sm">
                {hayFiltro || soloEgresoSinConc || soloIngresoSinConc || soloSinDetalle || soloSospechosas || soloMalOrientadas
                  ? <>{libroFiltrado.length.toLocaleString('es-CO')} <span className="text-white/40 font-semibold">de {libro.length.toLocaleString('es-CO')}</span></>
                  : <>{libro.length.toLocaleString('es-CO')}</>} movimientos
              </p>
              {/* Trabajo pendiente por clasificar, separado por lado.
                  🔴 EGRESOS  = filas con DÉBITO  y sin concepto (plata que salió)
                  🟢 INGRESOS = filas con CRÉDITO y sin concepto (plata que entró)
                  Se pueden prender los dos a la vez: ahí salen todas las filas sin concepto. */}
              <button onClick={() => setSoloEgresoSinConc(v => !v)}
                title="EGRESOS sin clasificar: filas con DÉBITO (plata que salió) a las que todavía les falta el CONCEPTO"
                className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${soloEgresoSinConc ? 'bg-red-600 text-white border-red-600' : 'text-[#F08A87] bg-[rgba(192,80,77,.14)] border-[rgba(192,80,77,.45)] hover:bg-[rgba(192,80,77,.20)]'}`}>
                {soloEgresoSinConc ? '✓ ' : '↑ '}Egresos sin concepto ({egresoSinConcCount.toLocaleString('es-CO')})
              </button>
              <button onClick={() => setSoloIngresoSinConc(v => !v)}
                title="INGRESOS sin clasificar: filas con CRÉDITO (plata que entró) a las que todavía les falta el CONCEPTO"
                className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${soloIngresoSinConc ? 'bg-emerald-600 text-white border-emerald-600' : 'text-[#5BE39B] bg-emerald-50 border-emerald-200 hover:bg-emerald-100'}`}>
                {soloIngresoSinConc ? '✓ ' : '↓ '}Ingresos sin concepto ({ingresoSinConcCount.toLocaleString('es-CO')})
              </button>
              <button onClick={() => setSoloSinDetalle(v => !v)}
                title="Filas del libro que todavía no tienen DETALLE"
                className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${soloSinDetalle ? 'bg-violet-600 text-white border-violet-600' : 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100'}`}>
                {soloSinDetalle ? '✓ ' : ''}Sin detalle ({sinDetalleCount.toLocaleString('es-CO')})
              </button>
              {/* MAL ORIENTADAS — la primera de las "leyes". Solo sale cuando
                  de verdad hay alguna: un cero no se muestra. — 04/09/2026 */}
              {malOrientadas.length > 0 && (
                <button onClick={() => setSoloMalOrientadas(v => !v)}
                  title="Filas cuyo CONCEPTO dice INSTITUCIONAL pero cuyo DETALLE es un mes, una matrícula o una inscripción. Las dos cosas no pueden ser ciertas: o se vendió un producto, o se pagó una mensualidad. Tóquelas para revisarlas."
                  className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${soloMalOrientadas ? 'bg-[#E0A33A] text-[#2B3547] border-[#E0A33A]' : 'text-[#E0A33A] bg-[rgba(224,163,58,.14)] border-[rgba(224,163,58,.45)] hover:bg-[rgba(224,163,58,.22)]'}`}>
                  {soloMalOrientadas ? '✓ ' : '⚠ '}Mal orientadas ({malOrientadas.length.toLocaleString('es-CO')})
                </button>
              )}
              {numProblemas > 0 && (
                <button onClick={() => setSoloSospechosas(v => !v)}
                  title="Filas en ROJO por revisar: codigo que no corresponde a ningun deportista, o pagos del mismo mes que suman mas que la mensualidad. No se publican hasta que usted las confirme."
                  className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${soloSospechosas ? 'bg-red-600 text-white border-red-600' : 'text-[#F08A87] bg-[rgba(192,80,77,.14)] border-[rgba(192,80,77,.45)] hover:bg-[rgba(192,80,77,.20)]'}`}>
                  {soloSospechosas ? '✓ ' : '⚠ '}Sospechosas ({numProblemas.toLocaleString('es-CO')})
                </button>
              )}
              <button onClick={reclasificarConceptos} disabled={reclasificando}
                title="Aplica las reglas de CONCEPTO (intereses a favor, tarjeta de crédito, 4x1000, cuota de manejo, servicio de nómina) a TODO el libro. Muestra primero cuántas filas cambia y pide confirmación. No toca ninguna fila con código de deportista y no publica nada."
                className="flex items-center gap-1.5 text-sm font-black text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg hover:bg-sky-100 transition disabled:opacity-60">
                🏷 {reclasificando ? 'Reclasificando…' : 'Reclasificar conceptos'}
              </button>
              {/* NÓMINA POR DESCRIPCIÓN: las transferencias que el banco siempre
                  describe igual (p. ej. "TRANSF A Diana Fernan") quedan con
                  concepto NOMINA, la cédula en CÓDIGO y el nombre del empleado. */}
              {nominaDescPendientes.length > 0 && (
                <button onClick={aplicarNominaDescripcion} disabled={aplicandoNomina}
                  title="Reconoce por la descripción del banco (PAGO A NOMIN fredy alexander r, PAGO A PROVE sol marina vill, TRANSF A Diana Fernan…) a quién le corresponde el pago, según el directorio de Nómina y Proveedores. Le pone la cédula, el nombre completo y el concepto de su tipo. Muestra primero cuántas cambia y pide confirmación. No publica nada."
                  className="flex items-center gap-1.5 text-sm font-black text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition disabled:opacity-60">
                  👤 {aplicandoNomina ? 'Marcando…' : `Nómina y proveedores por descripción (${nominaDescPendientes.length.toLocaleString('es-CO')})`}
                </button>
              )}
              {/* ── SEMAFORO ──
                  Los cuatro contadores de color (verde/amarillo/rojo/morado) se
                  quitaron el 20/08/2026 por pedido de la dirección. El color se
                  sigue viendo en la celda del mes de cada fila. */}
              <span className="w-px h-6 bg-[#2B3547] mx-1" />
              {/* Confirmados: ya publicados en el estado de cuenta. Pierden el color
                  del semaforo; aqui se pueden volver a ver cuando se necesiten. */}
              <button onClick={() => setFilChulo(v => (v === 'verde' ? 'todos' : 'verde'))}
                title="Pagos ya confirmados en el estado de cuenta. Se les apaga el color del semaforo."
                className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${filChulo === 'verde' ? 'bg-gray-700 text-white border-gray-700' : 'text-white/70 bg-[#333F50] border-[#4A5568] hover:bg-[#2B3547]'}`}>
                {filChulo === 'verde' ? '✓ ' : ''}Confirmados ({confirmadosCount.toLocaleString('es-CO')})
              </button>
              <button onClick={confirmarVerdes} disabled={publicandoVerdes || !verdesPendientes.length}
                title="Publica al estado de cuenta SOLO los pagos verdes (valor exacto). No toca amarillos, rojos ni morados."
                className="flex items-center gap-1.5 text-sm font-black text-white bg-green-600 border border-green-600 px-3 py-1.5 rounded-lg hover:bg-green-700 transition disabled:opacity-50">
                ✓ {publicandoVerdes ? 'Confirmando…' : `Confirmar los ${verdesPendientes.length.toLocaleString('es-CO')} verdes`}
              </button>
              <button onClick={confirmarMatriculas} disabled={publicandoMatr || !matriculasPendientes.length}
                title="Publica al estado de cuenta las MATRÍCULAS que aún no están. El botón de los verdes no las incluye, porque la matrícula no se compara contra la mensualidad."
                className="flex items-center gap-1.5 text-sm font-black text-white bg-indigo-600 border border-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
                🎓 {publicandoMatr ? 'Confirmando…' : `Confirmar ${matriculasPendientes.length.toLocaleString('es-CO')} matrículas`}
              </button>
              <span className="w-px h-6 bg-[#2B3547] mx-1" />
              {(hayFiltro || soloEgresoSinConc || soloIngresoSinConc || soloSinDetalle || soloSospechosas) && (
                <button onClick={() => { setFil(filVacio); setSoloEgresoSinConc(false); setSoloIngresoSinConc(false); setSoloSinDetalle(false); setSoloSospechosas(false); }}
                  className="flex items-center gap-1 text-xs font-bold text-white/70 hover:text-white border border-[#4A5568] rounded-lg px-2 py-1.5 hover:bg-[#333F50] transition">
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
              {/* "Actualizar estados de cuenta" se retiro el 20/08/2026: publicaba
                  TODOS los movimientos de TODAS las cuentas de un solo golpe, sin
                  respetar el semaforo. Ahora se publica con "Confirmar verdes",
                  "Confirmar matriculas" o el chulo de cada fila. */}
              <button onClick={() => setPanelCols(v => !v)} className={`ml-auto flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${panelCols ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'text-white/70 bg-[#3C4759] border-[#4A5568] hover:bg-[#2B3547]'}`}>
                ⚙ Columnas
              </button>
              <button onClick={exportarLibro} disabled={!libroFiltrado.length} className="flex items-center gap-1.5 text-sm font-black text-[#5BE39B] bg-[rgba(0,176,80,.14)] border border-[rgba(0,176,80,.45)] px-3 py-1.5 rounded-lg hover:bg-green-100 transition disabled:opacity-50">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
              {/* ── ELIMINAR LAS SEÑALADAS ────────────────────────────────
                  (dirección, 03/09/2026 — «casillas para chulear poder
                   eliminar varios»)
                  Solo aparece cuando hay algo señalado, y dice cuántas son.
                  Al oprimirlo sale la misma pregunta de siempre, con la lista
                  entera de lo que se va a botar. */}
              {marcadas.size > 0 && (
                <>
                  <button
                    onClick={async () => {
                      const filas = libro.filter(m => marcadas.has(m.id || ''));
                      await borrarEstasFilas(filas);
                      setMarcadas(new Set());
                    }}
                    disabled={borrandoFilas}
                    title="Eliminar del libro las filas que están señaladas"
                    className="flex items-center gap-1.5 text-sm font-black text-white bg-[#C0504D] border border-[#C0504D] px-3 py-1.5 rounded-lg hover:brightness-110 transition disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                    {borrandoFilas ? 'Eliminando…' : `Eliminar ${marcadas.size} señalada${marcadas.size === 1 ? '' : 's'}`}
                  </button>
                  <button onClick={() => setMarcadas(new Set())}
                    title="Soltar todas las señaladas"
                    className="text-sm font-black text-white/70 bg-[#3C4759] border border-[#4A5568] px-3 py-1.5 rounded-lg hover:bg-[#2B3547] transition">
                    Soltar
                  </button>
                </>
              )}
              <button onClick={eliminarFilasPorNumero} disabled={borrandoFilas}
                title="Eliminar filas basura del libro escribiendo su N° (la columna gris de la izquierda)"
                className="flex items-center gap-1.5 text-sm font-black text-[#F08A87] bg-[rgba(192,80,77,.14)] border border-[rgba(192,80,77,.45)] px-3 py-1.5 rounded-lg hover:bg-[rgba(192,80,77,.20)] transition disabled:opacity-50">
                <Trash2 className="w-4 h-4" /> {borrandoFilas ? 'Eliminando…' : 'Eliminar filas'}
              </button>
              <button onClick={abrirNuevaFila} title="Agregar un movimiento manualmente al libro (no vino del Excel del banco)"
                className="flex items-center gap-1.5 text-sm font-black text-white bg-[#16a34a] border border-[#16a34a] px-3 py-1.5 rounded-lg hover:bg-[#064e1e] transition">
                <Plus className="w-4 h-4" /> Agregar fila
              </button>
            </div>

            {/* Panel para ajustar el ancho de columnas con − / + (sin arrastrar) */}
            {panelCols && (
              <div className="px-4 py-3 border-b border-[#4A5568] bg-[#333F50]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black text-white/70">Ajustar ancho de columnas</p>
                  <button onClick={resetTodasCols} className="text-[11px] font-black text-white/70 bg-[#3C4759] border border-[#4A5568] px-2.5 py-1 rounded-lg hover:bg-[#2B3547] transition">Restablecer todo</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {colsVis.filter(c => c.label).map(c => (
                    <div key={c.key} className="flex items-center gap-1 bg-[#3C4759] border border-[#4A5568] rounded-lg px-2 py-1">
                      <span className="text-[11px] font-bold text-white/70 mr-1">{c.label}</span>
                      <button onClick={() => pasoCol(c.key, -20)} className="w-6 h-6 flex items-center justify-center rounded bg-[#2B3547] hover:bg-[#2B3547] text-white font-black">−</button>
                      <span className="text-[11px] text-white/40 w-8 text-center tabular-nums">{colW[c.key] ?? c.def}</span>
                      <button onClick={() => pasoCol(c.key, 20)} className="w-6 h-6 flex items-center justify-center rounded bg-[#2B3547] hover:bg-[#2B3547] text-white font-black">+</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="px-4 py-1.5 text-[11px] text-white/40 bg-[#333F50] border-b border-[#4A5568]">
              💡 ¿Ajustar columnas? Usa el botón <b>⚙ Columnas</b> (botones − / +, sin arrastrar). También puedes arrastrar la línea blanca del borde del encabezado.
            </p>
            <datalist id="codigos-libro">
              {codigosUnicos.map(c => <option key={c} value={c} />)}
            </datalist>
            <datalist id="detalle-libro">
              {opcionesDetalle('', institucionales, memoriaDetalle, memoriaInstitucional).map(o => <option key={o} value={o} />)}
            </datalist>
            {/* LA SEGUNDA LISTICA: SOLO PRODUCTOS (dirección, 04/09/2026).
                La casilla DETALLE del cuadro se escribe a mano y sugiere de una
                lista. Cuando el renglón ya dice INSTITUCIONAL en el concepto,
                se le cambia la lista por esta: nada de meses ni matrícula,
                únicamente lo que la institución vende. Así el desplegable dice
                lo mismo aquí y en la ventana de editar. */}
            <datalist id="detalle-libro-inst">
              {opcionesDetalle(CONCEPTO_INSTITUCIONAL, institucionales, memoriaDetalle, memoriaInstitucional)
                .map(o => <option key={o} value={o} />)}
            </datalist>
            {/* Lista de conceptos para ESCRIBIR y que filtre mientras se teclea.
                Antes era un <select>: al escribir "INTERES" saltaba a la primera
                opcion que empezara por I (INSCRIPCION) y ahi se quedaba. */}
            <datalist id="conceptos-libro">
              {conceptos.map(c => <option key={c.id} value={c.nombre} />)}
            </datalist>
            <div ref={scrollRef} className="overflow-x-auto" style={{ maxHeight: '72vh' }}>
              <table data-hoja="clara" className="border-collapse text-xs" style={{ tableLayout: 'fixed', width: colsVis.reduce((s, c) => s + (colW[c.key] ?? c.def), 0) }}>
                <colgroup>
                  {colsVis.map(c => <col key={c.key} style={{ width: colW[c.key] ?? c.def }} />)}
                </colgroup>
                <thead>
                  <tr>
                    {colsVis.map(c => (
                      <th key={c.key} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 4px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>
                        {c.label}
                        <ColResizer onDown={e => iniciarResize(c.key, e)} onReset={() => resetCol(c.key)} />
                      </th>
                    ))}
                  </tr>
                  {/* Fila de filtros por columna (una casilla por columna) */}
                  <tr>
                    <th style={thFil}></th>
                    {esTodas && <th style={thFil}><input value={fil.banco} onChange={e => setFil(f => ({ ...f, banco: e.target.value }))} placeholder="613…" style={inpFil} /></th>}
                    <th style={thFil}><input value={fil.fecha} onChange={e => setFil(f => ({ ...f, fecha: e.target.value }))} placeholder="2026-08…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.desc} onChange={e => setFil(f => ({ ...f, desc: e.target.value }))} placeholder="buscar…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.debito} onChange={e => setFil(f => ({ ...f, debito: e.target.value }))} placeholder="débito…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.credito} onChange={e => setFil(f => ({ ...f, credito: e.target.value }))} placeholder="crédito…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.saldo} onChange={e => setFil(f => ({ ...f, saldo: e.target.value }))} placeholder="saldo…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.concepto} onChange={e => setFil(f => ({ ...f, concepto: e.target.value }))} placeholder="concepto…" style={inpFil} /></th>
                    <th style={{ ...thFil, position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <input autoComplete="off" value={fil.codigo}
                          onChange={e => { setFil(f => ({ ...f, codigo: e.target.value })); setVerCuentas(true); }}
                          onFocus={() => setVerCuentas(true)}
                          placeholder={filCodModo === 'contiene' ? 'nº cuenta o últimos 4…' : 'exacto: 25450'}
                          style={{ ...inpFil, fontWeight: 800 }} />
                        {/* ── LAS CUENTAS POSIBLES ────────────────────────────────
                            Aparece sola al teclear en modo Nº cuenta. Un clic deja
                            el libro filtrado por esa cuenta. — dirección, 05/09/2026 */}
                        {verCuentas && cuentasPosibles.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 2, zIndex: 40, minWidth: 250, maxWidth: 340,
                                        background: '#fff', border: '2px solid #16a34a', borderRadius: 8,
                                        boxShadow: '0 10px 24px rgba(0,0,0,.35)', overflow: 'hidden', textAlign: 'left' }}>
                            <div style={{ background: '#064e1e', color: '#fff', fontSize: 9, fontWeight: 900, padding: '3px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>CUENTAS POSIBLES ({cuentasPosibles.length})</span>
                              <button type="button" onClick={() => setVerCuentas(false)}
                                style={{ color: '#fff', fontWeight: 900, cursor: 'pointer', padding: '0 3px' }}>✕</button>
                            </div>
                            {cuentasPosibles.map(c => (
                              <button key={c.cuenta} type="button"
                                onClick={() => { setFil(f => ({ ...f, codigo: c.cuenta })); setVerCuentas(false); }}
                                title={`Filtrar el libro por la cuenta ${c.cuenta}`}
                                style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                                         padding: '3px 7px', borderBottom: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>
                                <span style={{ fontSize: 11, fontWeight: 900, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{c.cuenta}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || '—'}</span>
                                <span style={{ fontSize: 9, fontWeight: 900, color: '#16a34a', whiteSpace: 'nowrap' }}>{c.n} mov.</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button type="button" onClick={() => setFilCodModo('exacto')}
                            title="Buscar el código exacto del deportista"
                            style={{ flex: 1, fontSize: 9, fontWeight: 800, padding: '1px 0', borderRadius: 4, cursor: 'pointer',
                              border: '1px solid ' + (filCodModo === 'exacto' ? '#16a34a' : '#d1d5db'),
                              background: filCodModo === 'exacto' ? '#16a34a' : '#fff',
                              color: filCodModo === 'exacto' ? '#fff' : '#6b7280' }}>
                            Código
                          </button>
                          <button type="button" onClick={() => setFilCodModo('contiene')}
                            title="Buscar por parte del número de cuenta (proveedor / empleado)"
                            style={{ flex: 1, fontSize: 9, fontWeight: 800, padding: '1px 0', borderRadius: 4, cursor: 'pointer',
                              border: '1px solid ' + (filCodModo === 'contiene' ? '#16a34a' : '#d1d5db'),
                              background: filCodModo === 'contiene' ? '#16a34a' : '#fff',
                              color: filCodModo === 'contiene' ? '#fff' : '#6b7280' }}>
                            Nº cuenta
                          </button>
                        </div>
                      </div>
                    </th>
                    <th style={thFil}><input value={fil.deportista} onChange={e => setFil(f => ({ ...f, deportista: e.target.value }))} placeholder="nombre…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.detalle} onChange={e => setFil(f => ({ ...f, detalle: e.target.value }))} placeholder="detalle…" style={inpFil} /></th>
                    <th style={thFil}>
                      <select value={filChulo} onChange={e => setFilChulo(e.target.value as 'todos' | 'verde' | 'rojo')}
                        title="Filtrar por el chulo: todos, solo confirmados (verde) o solo pendientes (rojo)"
                        style={{ ...inpFil, cursor: 'pointer', textAlign: 'center', fontWeight: 800 }}>
                        <option value="todos">Todos</option>
                        <option value="verde">🟢 Confirmados</option>
                        <option value="rojo">🔴 Pendientes</option>
                      </select>
                    </th>
                    <th style={thFil}></th>
                    {/* Señala o suelta TODAS las filas que se están viendo. */}
                    <th style={thFil}>
                      <input type="checkbox"
                        title="Señalar todas las filas que se ven ahora"
                        checked={visibles.length > 0 && visibles.every(v => marcadas.has(v.id || ''))}
                        onChange={e => {
                          const ids = visibles.map(v => v.id || '').filter(Boolean);
                          setMarcadas(prev => {
                            const n = new Set(prev);
                            if (e.target.checked) ids.forEach(i => n.add(i));
                            else ids.forEach(i => n.delete(i));
                            return n;
                          });
                        }}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#C0504D' }} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoLibro ? (
                    <tr><td colSpan={colsVis.length} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>Cargando…</td></tr>
                  ) : libro.length === 0 ? (
                    <tr><td colSpan={colsVis.length} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>Este libro aún no tiene movimientos.</td></tr>
                  ) : libroFiltrado.length === 0 ? (
                    <tr><td colSpan={colsVis.length} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>Ningún movimiento coincide con el filtro.</td></tr>
                  ) : visiblesVista.map((m, i) => (
                    <tr key={m.id || i} id={'mov-' + (m.id || '')}
                      title={semaforo[m.id || '']?.motivo || filasProblema[m.id || ''] || undefined}
                      onMouseEnter={() => setHoverId(m.id || null)}
                      onMouseLeave={() => setHoverId(h => (h === m.id ? null : h))}
                      style={{ background: hoverId === m.id ? '#cfe3ff' : resaltarId === m.id ? '#bbf7d0' : filaDondeIba === m.id ? '#D8DEE7' : filasProblema[m.id || ''] ? '#fee2e2' : dirtyIds.has(m.id || '') ? '#fef9c3' : (i % 2 ? '#f8fafc' : '#fff'), transition: 'background 0.12s', outline: hoverId === m.id ? '2px solid #3b82f6' : resaltarId === m.id ? '2px solid #16a34a' : filaDondeIba === m.id ? '2px solid #94A3B8' : filasProblema[m.id || ''] ? '1px solid #ef4444' : undefined }}>
                      <td style={{ ...tdC, color: '#94a3b8', fontWeight: 700, background: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>{numFila[m.id || ''] ?? ''}</td>
                      {esTodas && <td style={{ ...tdC, fontWeight: 700, color: '#475569' }}>{String(m.banco || '').replace('Bancolombia ', '')}</td>}
                      <td style={tdC}>{m.fecha}</td>
                      <td style={{ ...tdC, textAlign: 'left' }} title={m.descripcion}>{m.descripcion}</td>
                      <td style={{ ...tdC, textAlign: 'right', color: '#dc2626' }}>{m.debito ? fmt(m.debito) : ''}</td>
                      <td style={{ ...tdC, textAlign: 'right', color: '#16a34a' }}>{m.credito ? fmt(m.credito) : ''}</td>
                      <td style={{ ...tdC, textAlign: 'right', fontWeight: 700 }}>{fmt(m.saldo || 0)}</td>
                      <td style={{ ...tdC, padding: '2px 4px', cursor: 'pointer', textAlign: 'left' }} title={m.concepto}
                        onClick={() => setEditCell({ id: m.id || '', campo: 'concepto' })}>
                        {editCell?.id === m.id && editCell.campo === 'concepto' ? (
                          /* Casilla de CONCEPTO: se escribe y la lista se va filtrando
                             por cualquier parte de la palabra (no solo por la primera
                             letra). Escribir "INTERES" ya muestra "INTERESES A FAVOR". */
                          /* Se abre vacía y pregunta antes de cambiar, igual que
                             el DETALLE. — dirección, 04/09/2026 */
                          <input autoFocus list="conceptos-libro" defaultValue={m.concepto || ''}
                            onClick={e => e.stopPropagation()}
                            onFocus={alEntrarCasilla}
                            onBlur={e => {
                              const v = alSalirCasilla(e, 'el CONCEPTO');
                              if (v !== null) cambiarCampoLibro(m, 'concepto', v.toUpperCase());
                              setEditCell(null);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.currentTarget as HTMLInputElement).value = (e.currentTarget as HTMLInputElement).dataset.previo ?? ''; setEditCell(null); } }}
                            placeholder="Escriba y escoja…"
                            style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 4px', fontSize: 11, background: '#fff', color: '#111827' }} />
                        ) : (
                          <span className="block truncate">{m.concepto || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                        )}
                      </td>
                      <td style={{ ...tdC, padding: '2px 3px', cursor: 'pointer', background: m.codigo ? '#16a34a' : undefined, color: m.codigo ? '#fff' : undefined, fontWeight: 900 }}
                        title="Clic para cambiar o borrar el código del deportista"
                        onClick={() => setEditCell({ id: m.id || '', campo: 'codigo' })}>
                        {editCell?.id === m.id && editCell.campo === 'codigo' ? (
                          <input autoFocus list="codigos-libro" defaultValue={m.codigo || ''}
                            onClick={e => e.stopPropagation()}
                            onBlur={e => { cambiarCampoLibro(m, 'codigo', e.target.value.trim()); setEditCell(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditCell(null); }}
                            placeholder="(vacío = quitar)"
                            style={{ width: '100%', border: '1px solid #fff', borderRadius: 4, padding: '1px 3px', fontSize: 11, fontWeight: 800, textAlign: 'center', color: '#111', background: '#fff' }} />
                        ) : (
                          <span>{m.codigo
                            ? m.codigo
                            : (() => {
                                /* ── LA PROPUESTA DEL PAGADOR ─────────────────
                                   Esta fila no tiene código, pero el nombre que
                                   el banco escribió en la descripción ya se le
                                   enseñó a la plataforma. Se muestra el código
                                   en AMARILLO, como propuesta. Un clic en el
                                   chulito lo pone —y queda pendiente de guardar,
                                   igual que cualquier cambio hecho a mano. */
                                const kp = clavePagador(m.descripcion);
                                const propuesto = kp ? idx.pagador[kp] : '';
                                if (propuesto) {
                                  return (
                                    <span onClick={e => { e.stopPropagation(); cambiarCampoLibro(m, 'codigo', propuesto); }}
                                      title={`Propuesta: este pagador ya se cruzó antes con el código ${propuesto} (${codMap[propuesto] || 'sin nombre'}). Clic para ponérselo; queda pendiente hasta que oprima Guardar.`}
                                      style={{ display: 'inline-block', background: '#E0A33A', color: '#111827',
                                               borderRadius: 4, padding: '1px 5px', fontWeight: 900, fontSize: 10.5 }}>
                                      ✓ {propuesto}
                                    </span>
                                  );
                                }
                                /* ── LA CUENTA DEL QR NO ES UN CÓDIGO ─────────
                                   (dirección, 01/09/2026)

                                   En un PAGO QR la referencia es NUESTRA cuenta
                                   de recaudo — la misma para todo el que pague
                                   por ahí. Mostrarla en la columna CÓDIGO daba
                                   a entender que ese pago ya estaba cruzado con
                                   alguien, cuando no lo está con nadie, y
                                   además invitaba a guardarla como si fuera el
                                   código de un deportista. No se muestra: se
                                   dice, con todas las letras, que está sin
                                   asignar. La cuenta sigue estando a la vista
                                   al pasar el mouse. */
                                if (/PAGO\s*QR/i.test(m.descripcion || '')) {
                                  return (
                                    <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: 9.5, fontStyle: 'italic' }}
                                      title={'PAGO QR sin asignar. El número del extracto (' + (m.referencia || '—') +
                                             ') es NUESTRA cuenta de recaudo, no el código de un deportista: la comparten todos los que pagan por QR. ' +
                                             'Clic para escribir el código que corresponde.'}>
                                      QR · SIN ASIGNAR
                                    </span>
                                  );
                                }
                                if (m.referencia) {
                                  return (
                                    <span className="block truncate" style={{ color: '#64748b', fontWeight: 700, fontStyle: 'italic', fontSize: 10 }}
                                      title={'Cuenta del extracto (sin asignar): ' + m.referencia + ' — clic para anexarle el código del deportista'}>
                                      {m.referencia}
                                    </span>
                                  );
                                }
                                return <span style={{ color: '#cbd5e1' }}>—</span>;
                              })()}</span>
                        )}
                      </td>
                      <td style={{ ...tdC, textAlign: 'left', padding: '2px 4px' }} title={m.deportista}>
                        {(() => {
                          // Nombre guardado o, si no hay, el que diga el código.
                          const nombreDep = nombreDeFila(m);
                          // id por código; si el código no está en la ficha, se busca por nombre
                          const depId = codToId[m.codigo] || (nombreDep ? nombreToId[normNombre(nombreDep)] : '');
                          // Deportista real (ingreso) → enlace a su estado de cuenta (como antes)
                          if (nombreDep && depId) {
                            return (
                              <button onClick={() => { setFilaDondeIba(m.id || null); setEstadoCuentaUrl(`/alumnos/${depId}/estado-cuenta?edit=1`); }}
                                className="text-left text-[#5BE39B] hover:text-green-900 hover:underline font-semibold w-full truncate"
                                title={`Ver estado de cuenta de ${nombreDep} (se abre en ventana, sin salir del libro)`}>
                                {nombreDep}
                              </button>
                            );
                          }
                          // Sin deportista (egreso: proveedor / empleado / cliente) → NOMBRE editable a mano
                          return editCell?.id === m.id && editCell.campo === 'deportista' ? (
                            <input autoFocus defaultValue={m.deportista || ''}
                              onClick={e => e.stopPropagation()}
                              onBlur={e => { cambiarCampoLibro(m, 'deportista', e.target.value.trim()); setEditCell(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditCell(null); }}
                              placeholder="Nombre (proveedor / empleado)"
                              style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 4px', fontSize: 11, background: '#fff', color: '#111827' }} />
                          ) : (
                            <span className="block truncate cursor-pointer" title="Clic para escribir el nombre (proveedor / empleado)"
                              onClick={() => setEditCell({ id: m.id || '', campo: 'deportista' })}>
                              {m.deportista || <span style={{ color: '#cbd5e1' }}>—</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ ...tdC, padding: '2px 4px', cursor: 'pointer', textAlign: 'left' }} title={m.detalle}
                        onClick={() => setEditCell({ id: m.id || '', campo: 'detalle' })}>
                        {editCell?.id === m.id && editCell.campo === 'detalle' ? (
                          esNominaMensual(m.codigo) ? (
                            /* NÓMINA / PROVEEDORES: a estas personas se les paga
                               MENSUAL, así que solo se ofrecen los meses del año.
                               Nada de matrícula ni inscripción. */
                            <select autoFocus defaultValue={m.detalle || ''}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { cambiarCampoLibro(m, 'detalle', e.target.value); setEditCell(null); }}
                              onBlur={() => setEditCell(null)}
                              onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); }}
                              style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 3px', fontSize: 11, fontWeight: 700, background: '#fff' }}>
                              <option value="">— ¿de qué mes? —</option>
                              {MESES_NOMINA.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (() => {
                            /* ── LISTAS CERRADAS SEGÚN EL CONCEPTO ────────────────
                               (dirección, 25/08 · 04/09 · 05/09 de 2026)

                               Cuando el concepto de la fila manda —gastos de
                               representación, institucional, aporte formación o
                               inscripción— la casilla deja de ser de escribir y se
                               vuelve un desplegable CERRADO. Así no hay forma de
                               dejar un mes en una camiseta, ni una camiseta en una
                               mensualidad, ni escribiéndolo a mano.

                               Si la fila ya traía otro texto —algo mal orientado de
                               antes— se conserva como última opción marcada
                               «(como estaba — revisar)», para no borrárselo a nadie
                               sin que se vea. */
                            const cerrada = listaCerradaDetalle(m.concepto, institucionales, memoriaDetalle, memoriaInstitucional);
                            if (!cerrada) return null;
                            const yaEsta = String(m.detalle ?? '').trim();
                            const estaEnLista = !!yaEsta && cerrada.opciones.some(o => mismoTexto(o, yaEsta));
                            return (
                              <select autoFocus defaultValue={yaEsta}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { cambiarCampoLibro(m, 'detalle', e.target.value); setEditCell(null); }}
                                onBlur={() => setEditCell(null)}
                                onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); }}
                                style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 3px', fontSize: 11, fontWeight: 700, background: '#fff', color: '#111827' }}>
                                <option value="">{cerrada.titulo}</option>
                                {cerrada.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                                {!!yaEsta && !estaEnLista && (
                                  <option value={yaEsta}>{yaEsta} (como estaba — revisar)</option>
                                )}
                              </select>
                            );
                          })() ?? (

                            <input autoFocus
                              list="detalle-libro"
                              defaultValue={m.detalle || ''}
                              onClick={e => e.stopPropagation()}
                              onFocus={alEntrarCasilla}
                              onBlur={e => {
                                const v = alSalirCasilla(e, 'el DETALLE');
                                if (v !== null) cambiarCampoLibro(m, 'detalle', v);
                                setEditCell(null);
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.currentTarget as HTMLInputElement).value = (e.currentTarget as HTMLInputElement).dataset.previo ?? ''; setEditCell(null); } }}
                              placeholder="Mes o texto libre (lo que se paga)"
                              style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 4px', fontSize: 11, background: '#fff', color: '#111827' }} />
                          )
                        ) : (() => {
                          /* SEMAFORO: el mes se pinta con fondo pastel y letra negra
                             segun si el valor pagado cuadra con la mensualidad. */
                          const sm = semaforo[m.id || ''];
                          const pal = sm && sm.color !== 'na' ? PASTEL_SEM[sm.color] : null;
                          if (!pal) {
                            /* Pago a un tercero al que todavía no se le puso el mes. */
                            if (esNominaMensual(m.codigo) && !String(m.detalle ?? '').trim()) {
                              return (
                                <span className="block truncate" title="Clic para escoger el mes que se le está pagando"
                                  style={{ background: '#e0f2fe', color: '#075985', fontWeight: 800,
                                           border: '1px solid #7dd3fc', borderRadius: 5,
                                           padding: '2px 6px', textAlign: 'center' }}>
                                  ¿DE QUÉ MES?
                                </span>
                              );
                            }
                            /* GASTOS DE REPRESENTACIÓN todavía sin clasificar: se avisa
                               con un letrero, para que se vea el trabajo que falta. */
                            if (esGastoRepresentacion(m.concepto) && !String(m.detalle ?? '').trim()) {
                              return (
                                <span className="block truncate" title="Clic para escoger en qué se gastó (salud, estudio, vivienda…)"
                                  style={{ background: '#fef3c7', color: '#92400e', fontWeight: 800,
                                           border: '1px solid #fcd34d', borderRadius: 5,
                                           padding: '2px 6px', textAlign: 'center' }}>
                                  ¿EN QUÉ SE GASTÓ?
                                </span>
                              );
                            }
                            return <span className="block truncate">{m.detalle || <span style={{ color: '#cbd5e1' }}>—</span>}</span>;
                          }
                          // Sin mes asignado: igual se marca con su color y el aviso
                          const texto = m.detalle || (sm.color === 'morado' ? 'SIN CODIGO' : 'FALTA MES');
                          return (
                            <span className="block truncate" title={sm.motivo}
                              style={{ background: pal.bg, color: '#111827', fontWeight: 800,
                                       border: `1px solid ${pal.borde}`, borderRadius: 5,
                                       padding: '2px 6px', textAlign: 'center' }}>
                              {texto}
                            </span>
                          );
                        })()}
                      </td>
                      {/* ── CONFIRMAR ─────────────────────────────────────
                          El chulo: manda el pago al estado de cuenta del
                          deportista. Verde = ya confirmado · Rojo = pendiente.
                          Es lo que se hace en casi todos los renglones, por eso
                          va de primera. — dirección, 01/09/2026 */}
                      <td style={{ ...tdC, padding: '1px' }}>
                        {(() => {
                          const yaPub = esNoAplica(m) || confirmadas.has(String(m.codigo ?? '').trim() + '|' + String(m.detalle ?? '').trim());
                          return (
                            <button onClick={() => { if (!esNoAplica(m)) actualizarPagoFila(m); }}
                              title={esIngresoFinanciero(m) ? 'Interés / rendimiento del banco — no es de ningún deportista, no va a estado de cuenta' : esInstitucional(m) ? 'Confirmado ✓ — INSTITUCIONAL (no va a estado de cuenta)' : yaPub ? 'Confirmado ✓ — ya está en el estado de cuenta (clic para volver a publicar)' : 'Sin confirmar — clic para actualizar este pago en el estado de cuenta'}
                              className={`mx-auto block p-0.5 rounded transition ${yaPub ? 'text-[#5BE39B] hover:text-[#5BE39B] hover:bg-[rgba(0,176,80,.14)]' : 'text-[#F08A87] hover:text-[#F08A87] hover:bg-[rgba(192,80,77,.14)]'}`}>
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          );
                        })()}
                      </td>
                      {/* ── EDITAR ────────────────────────────────────────
                          El lápiz: abre el movimiento para corregirlo o
                          dividirlo. Es la excepción, no lo de todos los días.
                          VA NEGRO: estaba en blanco al 40% —color heredado de
                          las pantallas oscuras— y este cuadro es BLANCO, así
                          que quedaba casi invisible. — dirección, 01/09/2026 */}
                      <td style={{ ...tdC, padding: '1px' }}>
                        <button onClick={() => abrirEditor(m)} title="Editar / dividir"
                          className="mx-auto block text-[#111827] hover:text-[#16a34a] p-0.5 rounded hover:bg-[rgba(22,163,74,.14)] transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      {/* ── BORRAR ────────────────────────────────────────
                          (dirección, 03/09/2026 — la volvió a pedir)
                          De a UNA fila, con la misma pregunta de ELIMINAR
                          FILAS: dice qué se va, avisa si estaba confirmada y
                          deja copia en la papelera. */}
                      <td style={{ ...tdC, padding: '1px' }}>
                        <button
                          onClick={() => borrarEstasFilas([m])}
                          disabled={borrandoFilas}
                          title={`Eliminar la fila N° ${numFila[m.id || ''] ?? ''} del libro`}
                          className="mx-auto block text-[#B4241F] hover:text-white p-0.5 rounded hover:bg-[#C0504D] transition disabled:opacity-40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      {/* SEÑALAR — para borrar varias de una. — 03/09/2026 */}
                      <td style={{ ...tdC, padding: '1px' }}>
                        <input type="checkbox"
                          checked={marcadas.has(m.id || '')}
                          onChange={() => alternarMarca(m.id || '')}
                          title="Señalar esta fila para eliminarla junto con otras"
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#C0504D' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {libroFiltrado.length > 0 && (
                  <tfoot>
                    <tr>
                      {/* Una casilla menos al principio y una más al final:
                          CONFIRMAR se pasó al final del cuadro. — 01/09/2026 */}
                      <td style={tfootTd}></td>
                      {esTodas && <td style={tfootTd}></td>}
                      <td style={tfootTd} colSpan={2}>TOTALES ({libroFiltrado.length.toLocaleString('es-CO')})</td>
                      <td style={{ ...tfootTd, textAlign: 'right', color: '#dc2626' }}>{fmt(totDebito)}</td>
                      <td style={{ ...tfootTd, textAlign: 'right', color: '#16a34a' }}>{fmt(totCredito)}</td>
                      <td style={tfootTd} colSpan={5}></td>
                      <td style={tfootTd}></td>
                      <td style={tfootTd}></td>
                      {/* Dos casillas más: volvieron BORRAR y la de señalar. — 03/09/2026 */}
                      <td style={tfootTd}></td>
                      <td style={tfootTd}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {!cargandoLibro && libroFiltrado.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 border-t border-[#4A5568] bg-[#333F50]">
                <span className="text-xs font-bold text-white/70">
                  Mostrando {visibles.length.toLocaleString('es-CO')} de {libroFiltrado.length.toLocaleString('es-CO')}
                </span>
                {visibles.length < libroFiltrado.length && (
                  <>
                    <button onClick={() => setLimite(l => l + 100)} className="text-xs font-black text-[#5BE39B] bg-[rgba(0,176,80,.14)] border border-[rgba(0,176,80,.45)] px-3 py-1.5 rounded-lg hover:bg-green-100 transition">
                      Mostrar 100 más (hacia atrás)
                    </button>
                    <button onClick={() => setLimite(libroFiltrado.length)} className="text-xs font-black text-white bg-[#16a34a] border border-[#16a34a] px-3 py-1.5 rounded-lg hover:bg-[#064e1e] transition">
                      Mostrar todos ({libroFiltrado.length.toLocaleString('es-CO')})
                    </button>
                    <span className="text-[11px] text-white/40">— o usa los filtros de arriba para acotar (por código, cifra, nombre…)</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Vista POR ASIGNAR (cuentas desconocidas → diccionario) ── */}
        {vista === 'desconocidas' && (
          <DesconocidasEditor deportistas={deportistas} conceptos={conceptos} flash={flash} />
        )}

        {/* ── Vista DICCIONARIO (cuentas/nombres → código) ── */}
        {vista === 'diccionario' && (
          <DiccionarioEditor codMap={codMap} flash={flash} onCount={setMapeoCount} />
        )}

        {/* ── Vista CUENTAS (catálogo editable) ── */}
        {vista === 'cuentas' && (
          <CuentasEditor conceptos={conceptos} onCambio={setConceptos} flash={flash} />
        )}
      </main>

      {/* ── Editor / división de un movimiento ── */}
      {editRow && (() => {
        const sumDeb = editRow.filas.reduce((s, r) => s + (Number(r.debito) || 0), 0);
        const sumCred = editRow.filas.reduce((s, r) => s + (Number(r.credito) || 0), 0);
        const origDeb = Number(editRow.orig.debito) || 0;
        const origCred = Number(editRow.orig.credito) || 0;
        const okDeb = Math.round(sumDeb) === Math.round(origDeb);
        const okCred = Math.round(sumCred) === Math.round(origCred);
        /* ── LAS CASILLAS DE ESTE CUADRO IBAN EN BLANCO SOBRE BLANCO ────────
           (dirección, 04/09/2026 — «la contadora tiene problemas con eso»)

           Estas casillas no traían color de letra ni fondo. Con el diseño
           viejo eso no importaba: la letra de toda la app era casi negra. Con
           el diseño gris verde la letra pasó a BLANCA, y como el navegador le
           pone fondo blanco a un <input> sin fondo, quedó blanco sobre blanco:
           la contadora escribía el concepto, el nombre o el valor y la casilla
           se veía VACÍA.

           Es la peor forma de fallar en un libro contable — uno cree que no
           guardó, lo vuelve a escribir, y termina con el movimiento repetido.
           Ahora fondo y letra van dichos a la fuerza. */
        const inp: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none', background: '#FFFFFF', color: '#111827' };
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !guardandoEd && setEditRow(null)}>
            <div className="bg-[#3C4759] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#4A5568] sticky top-0 bg-[#3C4759] z-10">
                <h3 className="font-black text-white">Editar / dividir movimiento</h3>
                <button onClick={() => setEditRow(null)} className="text-white/40 hover:text-white p-1"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-5 py-2 text-[12px] text-white/70 bg-[#333F50] border-b border-[#4A5568]">
                <b>{editRow.orig.banco}</b> · {editRow.orig.fecha} · <span className="text-white/70">{editRow.orig.descripcion}</span>
                <br />Valor original: {origDeb ? <span className="text-[#F08A87] font-bold">débito {fmt(origDeb)}</span> : <span className="text-[#5BE39B] font-bold">crédito {fmt(origCred)}</span>}
                <span className="text-white/40"> — La primera fila edita el movimiento original; las que agregues se crean como nuevas.</span>
              </div>
              <div className="p-5 space-y-3">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {['', 'FECHA', 'CONCEPTO', 'CÓDIGO', 'DEPORTISTA', 'DETALLE (mes)', 'DÉBITO', 'CRÉDITO', ''].map((h, hi) => (
                        <th key={h || `e${hi}`} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '5px 6px', fontSize: 10, fontWeight: 900, color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {editRow.filas.map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 800, color: i === 0 ? '#16a34a' : '#64748b', fontSize: 10 }}>{i === 0 ? 'original' : 'nueva'}</td>
                        <td style={{ ...td, padding: 3 }}><input type="date" value={r.fecha || ''} onChange={e => editarSplit(i, 'fecha', e.target.value)} style={{ ...inp, minWidth: 130 }} /></td>
                        <td style={{ ...td, padding: 3 }}>
                          <select value={r.concepto || ''} onChange={e => editarSplit(i, 'concepto', e.target.value)} style={inp}>
                            <option value="">—</option>
                            {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            {r.concepto && !conceptos.some(c => c.nombre === r.concepto) && <option value={r.concepto}>{r.concepto}</option>}
                          </select>
                        </td>
                        <td style={{ ...td, padding: 3 }}><input value={r.codigo || ''} onChange={e => editarSplit(i, 'codigo', e.target.value)} style={{ ...inp, minWidth: 70, fontWeight: 700 }} /></td>
                        <td style={{ ...td, padding: 3 }}><input value={r.deportista || ''} onChange={e => editarSplit(i, 'deportista', e.target.value)} style={{ ...inp, minWidth: 130 }} /></td>
                        <td style={{ ...td, padding: 3 }}>
                          {/* Si el concepto es GASTOS DE REPRESENTACIÓN, la lista cambia
                              de meses a "en qué se gastó" (salud, estudio, vivienda…). */}
                          <select value={r.detalle || ''} onChange={e => editarSplit(i, 'detalle', e.target.value)} style={{ ...inp, minWidth: 120 }}>
                            <option value="">{esGastoRepresentacion(r.concepto) ? '— ¿en qué se gastó? —' : '—'}</option>
                            {opcionesDetalle(r.concepto, institucionales, memoriaDetalle, memoriaInstitucional).map(o => <option key={o} value={o}>{o}</option>)}
                            {r.detalle && !opcionesDetalle(r.concepto, institucionales, memoriaDetalle, memoriaInstitucional).includes(r.detalle) && <option value={r.detalle}>{r.detalle}</option>}
                          </select>
                        </td>
                        <td style={{ ...td, padding: 3 }}><input value={r.debito || ''} onChange={e => editarSplit(i, 'debito', numVal(e.target.value))} style={{ ...inp, textAlign: 'right', color: '#dc2626' }} /></td>
                        <td style={{ ...td, padding: 3 }}><input value={r.credito || ''} onChange={e => editarSplit(i, 'credito', numVal(e.target.value))} style={{ ...inp, textAlign: 'right', color: '#16a34a' }} /></td>
                        <td style={{ ...td, padding: 3 }}>
                          {i > 0 && <button onClick={() => quitarSplit(i)} title="Quitar fila" className="text-white/40 hover:text-[#F08A87] p-1"><Trash2 className="w-4 h-4" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#334155' }}>Suma de las filas:</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: okDeb ? '#16a34a' : '#dc2626' }}>{fmt(sumDeb)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: okCred ? '#16a34a' : '#dc2626' }}>{fmt(sumCred)}</td>
                      <td style={td}></td>
                    </tr>
                  </tfoot>
                </table>

                {(!okDeb || !okCred) && (
                  <p className="text-[12px] font-bold text-[#E0A33A] bg-[rgba(224,163,58,.14)] border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ La suma de las filas no coincide con el valor original. Puedes guardar igual, pero revisa que sea lo que quieres.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button onClick={agregarFila} className="flex items-center gap-1.5 text-sm font-black text-[#5BE39B] bg-[rgba(0,176,80,.14)] border border-[rgba(0,176,80,.45)] px-3 py-2 rounded-xl hover:bg-green-100 transition">
                    <Plus className="w-4 h-4" /> Agregar fila
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setEditRow(null)} disabled={guardandoEd} className="text-sm font-bold text-white/70 px-4 py-2 rounded-xl hover:bg-[#2B3547] transition disabled:opacity-60">Cancelar</button>
                    <button onClick={guardarEditor} disabled={guardandoEd} className="flex items-center gap-2 bg-[#16a34a] text-white font-black px-5 py-2 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
                      <Save className="w-4 h-4" /> {guardandoEd ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal: AGREGAR FILA MANUAL al libro ── */}
      {nuevaFila && (() => {
        /* Fondo y letra dichos a la fuerza, igual que arriba. — 04/09/2026 */
        const inp: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#FFFFFF', color: '#111827' };
        const lbl = 'block text-[11px] font-black text-white/70 uppercase tracking-wide mb-1';
        return (
          <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => !guardandoManual && setNuevaFila(null)}>
            <div className="bg-[#3C4759] rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#4A5568] sticky top-0 bg-[#3C4759] z-10">
                <h3 className="font-black text-white">Agregar fila al libro</h3>
                <button onClick={() => setNuevaFila(null)} className="text-white/40 hover:text-white p-1"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-5 py-2 text-[12px] text-white/70 bg-[#333F50] border-b border-[#4A5568]">
                Movimiento agregado manualmente (no vino del Excel del banco). Ingresa el valor en <b className="text-[#F08A87]">Débito</b> (salida) o en <b className="text-[#5BE39B]">Crédito</b> (entrada).
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Cuenta</label>
                    <select value={nuevaFila.banco} onChange={e => editarNuevaFila('banco', e.target.value)} style={inp}>
                      {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Fecha</label>
                    <input type="date" value={nuevaFila.fecha} onChange={e => editarNuevaFila('fecha', e.target.value)} style={inp} />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Descripción</label>
                  <input value={nuevaFila.descripcion} onChange={e => editarNuevaFila('descripcion', e.target.value)} placeholder="Ej.: Ajuste, consignación en efectivo, corrección…" style={inp} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Débito (salida)</label>
                    <input inputMode="numeric" value={nuevaFila.debito} onChange={e => editarNuevaFila('debito', e.target.value)} placeholder="0" style={{ ...inp, textAlign: 'right', color: '#dc2626', fontWeight: 700 }} />
                  </div>
                  <div>
                    <label className={lbl}>Crédito (entrada)</label>
                    <input inputMode="numeric" value={nuevaFila.credito} onChange={e => editarNuevaFila('credito', e.target.value)} placeholder="0" style={{ ...inp, textAlign: 'right', color: '#16a34a', fontWeight: 700 }} />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Concepto</label>
                  <select value={nuevaFila.concepto} onChange={e => editarNuevaFila('concepto', e.target.value)} style={inp}>
                    <option value="">—</option>
                    {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                    {nuevaFila.concepto && !conceptos.some(c => c.nombre === nuevaFila.concepto) && <option value={nuevaFila.concepto}>{nuevaFila.concepto}</option>}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Código</label>
                    <input value={nuevaFila.codigo} onChange={e => editarNuevaFila('codigo', e.target.value)} placeholder="Opcional" style={{ ...inp, fontWeight: 700 }} />
                  </div>
                  <div>
                    <label className={lbl}>{esGastoRepresentacion(nuevaFila.concepto) ? 'Detalle (¿en qué se gastó?)' : 'Detalle (mes)'}</label>
                    <select value={nuevaFila.detalle} onChange={e => editarNuevaFila('detalle', e.target.value)} style={inp}>
                      <option value="">—</option>
                      {opcionesDetalle(nuevaFila.concepto, institucionales, memoriaDetalle, memoriaInstitucional).map(o => <option key={o} value={o}>{o}</option>)}
                      {nuevaFila.detalle && !opcionesDetalle(nuevaFila.concepto, institucionales, memoriaDetalle, memoriaInstitucional).includes(nuevaFila.detalle) && <option value={nuevaFila.detalle}>{nuevaFila.detalle}</option>}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={lbl}>Deportista</label>
                  <input value={nuevaFila.deportista} onChange={e => editarNuevaFila('deportista', e.target.value)} placeholder="Se autocompleta al escribir el código" style={inp} />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => setNuevaFila(null)} disabled={guardandoManual} className="ml-auto text-sm font-bold text-white/70 px-4 py-2 rounded-xl hover:bg-[#2B3547] transition disabled:opacity-60">Cancelar</button>
                  <button onClick={guardarNuevaFila} disabled={guardandoManual} className="flex items-center gap-2 bg-[#16a34a] text-white font-black px-5 py-2 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
                    <Save className="w-4 h-4" /> {guardandoManual ? 'Guardando…' : 'Agregar al libro'}
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

const td: React.CSSProperties = { border: '1px solid #eef2f7', padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' };
// Celda compacta para el Libro con tableLayout fijo: recorta con "…" y no desborda
const tdC: React.CSSProperties = { border: '1px solid #eef2f7', padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
// Celda y control de la fila de filtros (queda pegada bajo el encabezado)
const thFil: React.CSSProperties = { position: 'sticky', top: 28, zIndex: 2, background: '#ecfdf5', border: '1px solid #fff', padding: '3px 4px' };
/* LA FILA DE FILTROS DEL LIBRO, TAMBIÉN (dirección, 04/09/2026). Es la fila
   donde la contadora escribe para buscar: iba blanco sobre blanco igual que
   las demás casillas, así que tecleaba y no veía lo que estaba buscando. */
const inpFil: React.CSSProperties = { width: '100%', minWidth: 60, border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 6px', fontSize: 11, outline: 'none', background: '#FFFFFF', color: '#111827' };
const tfootTd: React.CSSProperties = { position: 'sticky', bottom: 0, zIndex: 2, background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '7px 8px', fontSize: 11, fontWeight: 900, color: '#334155', textAlign: 'center', whiteSpace: 'nowrap' };

// ── Fila de revisión con buscador de deportista para pendientes ──
function FilaRevision({ r, i, deportistas, conceptos, onAsignar, onEditar }: {
  r: MovCont; i: number; deportistas: Deportista[]; conceptos: Concepto[];
  onAsignar: (i: number, cod: string, nombre: string) => void;
  onEditar: (i: number, campo: keyof MovCont, val: string) => void;
}) {
  const [q, setQ] = useState('');
  const dup = r.id === '__DUP__';
  const sug = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return deportistas.filter(d => {
      const cod = getCod(d);
      return d._nombre.toLowerCase().includes(t) || cod.includes(t);
    }).slice(0, 8);
  }, [q, deportistas]);

  const bg = dup ? '#f3f4f6' : r._pendiente ? '#fff7ed' : '#fff';
  return (
    <tr style={{ background: bg, opacity: dup ? 0.55 : 1 }}>
      <td style={td}>{r.fecha}</td>
      <td style={{ ...td, textAlign: 'left', maxWidth: 220 }} className="truncate" title={r.descripcion}>{r.descripcion}</td>
      <td style={{ ...td, textAlign: 'left', maxWidth: 140 }} className="truncate" title={r.referencia}>{r.referencia}</td>
      <td style={{ ...td, textAlign: 'right', color: '#dc2626' }}>{r.debito ? fmt(r.debito) : ''}</td>
      <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{r.credito ? fmt(r.credito) : ''}</td>
      <td style={{ ...td }}>
        <select value={r.concepto} onChange={e => onEditar(i, 'concepto', e.target.value)}
          className="w-36 border border-[#4A5568] rounded px-1.5 py-1 text-[11px] font-semibold text-white bg-[#3C4759]">
          <option value="">—</option>
          {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          {r.concepto && !conceptos.some(c => c.nombre === r.concepto) && (
            <option value={r.concepto}>{r.concepto}</option>
          )}
        </select>
      </td>
      <td style={{ ...td, textAlign: 'left', minWidth: 200 }}>
        {dup ? <span className="text-[10px] font-bold text-white/40">ya en el libro</span>
          : r.codigo ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] font-black text-[#5BE39B] bg-green-100 px-2 py-0.5 rounded-full">{r.codigo}</span>
              <span className="text-[11px] font-semibold text-white truncate max-w-[150px]">{r.deportista}</span>
            </span>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1 border border-orange-300 rounded px-1.5 py-1 bg-[#3C4759]">
                <Search className="w-3 h-3 text-orange-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar deportista…" className="w-32 text-[11px] focus:outline-none" />
              </div>
              {sug.length > 0 && (
                <div className="absolute z-20 mt-1 w-56 bg-[#3C4759] border border-[#4A5568] rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {sug.map(d => {
                    const cod = getCod(d);
                    return (
                      <button key={d.id} onClick={() => { onAsignar(i, cod, d._nombre); setQ(''); }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-[rgba(0,176,80,.14)] text-[11px] flex items-center gap-2">
                        <span className="font-black text-[#5BE39B]">{cod}</span>
                        <span className="text-white truncate">{d._nombre}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
      </td>
    </tr>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   LA VENTANITA DEL SOPORTE
   (dirección, 05/09/2026 — «cuando le doy al soporte y le digo que vaya al
    libro, ese soporte puede quedar flotando para buscarlo en el libro»)

   Comprobar un pago es comparar dos cosas: la foto que mandó el papá y el
   renglón del banco. Antes estaban en pantallas distintas y tocaba memorizar
   el valor y la fecha. Ahora la foto viaja con uno y queda aquí encima,
   en una ventanita que se arrastra por su barra, se agranda, se achica, se
   esconde y se cierra. Al cerrarla se olvida: no vuelve a salir.

   La foto viene en la memoria de la pestaña (sessionStorage), no de la nube:
   se borra sola al cerrar el navegador y no le aparece a nadie más.
   ══════════════════════════════════════════════════════════════════════════ */
interface SoporteFlotanteDato { id: string; img: string; nombre: string; codigo: string; meses: string; cuando: string }
const LLAVE_FLOTANTE = 'soporte_flotante_v1';

function SoporteFlotante() {
  const [dato, setDato] = useState<SoporteFlotanteDato | null>(null);
  const [pos, setPos]   = useState({ x: 0, y: 0 });
  const [ancho, setAncho] = useState(300);
  const [encogido, setEncogido] = useState(false);
  const arrastre = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(LLAVE_FLOTANTE);
      if (!t) return;
      const d = JSON.parse(t);
      if (d?.img) {
        setDato(d);
        // Arranca abajo a la derecha, donde no tapa el libro.
        setPos({ x: Math.max(12, window.innerWidth - 330), y: Math.max(70, window.innerHeight - 430) });
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      if (!arrastre.current) return;
      setPos({
        x: Math.min(window.innerWidth - 80, Math.max(0, e.clientX - arrastre.current.dx)),
        y: Math.min(window.innerHeight - 40, Math.max(0, e.clientY - arrastre.current.dy)),
      });
    };
    const soltar = () => { arrastre.current = null; };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); };
  }, []);

  if (!dato) return null;
  const esPdf = /^data:application\/pdf/i.test(dato.img);

  const cerrar = () => { try { sessionStorage.removeItem(LLAVE_FLOTANTE); } catch { /* noop */ } setDato(null); };

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, width: encogido ? 210 : ancho, zIndex: 55,
                  background: '#3C4759', border: '2px solid #E0A33A', borderRadius: 14,
                  boxShadow: '0 14px 40px rgba(0,0,0,.55)', overflow: 'hidden' }}>
      {/* Barra para arrastrar */}
      <div onPointerDown={e => { arrastre.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
        style={{ cursor: 'move', background: '#064e1e', color: '#fff', padding: '5px 8px',
                 display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.06em' }}>SOPORTE DEL PAPÁ</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          {!encogido && (
            <>
              <button type="button" title="Más pequeño" onClick={() => setAncho(a => Math.max(200, a - 70))}
                style={{ color: '#fff', fontWeight: 900, fontSize: 13, padding: '0 5px', cursor: 'pointer' }}>−</button>
              <button type="button" title="Más grande" onClick={() => setAncho(a => Math.min(620, a + 70))}
                style={{ color: '#fff', fontWeight: 900, fontSize: 13, padding: '0 5px', cursor: 'pointer' }}>+</button>
            </>
          )}
          <button type="button" title={encogido ? 'Mostrar la foto' : 'Esconder la foto'} onClick={() => setEncogido(v => !v)}
            style={{ color: '#fff', fontWeight: 900, fontSize: 13, padding: '0 5px', cursor: 'pointer' }}>{encogido ? '▣' : '▁'}</button>
          <button type="button" title="Cerrar (no vuelve a salir)" onClick={cerrar}
            style={{ color: '#fff', fontWeight: 900, fontSize: 13, padding: '0 5px', cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Quién es y qué está pagando */}
      <div style={{ padding: '5px 8px', background: '#2B3547', borderBottom: '1px solid #4A5568' }}>
        <p style={{ color: '#5BE39B', fontWeight: 900, fontSize: 11, lineHeight: 1.2 }}>
          {dato.codigo || '—'} · <span style={{ color: '#fff' }}>{dato.nombre || '—'}</span>
        </p>
        {(dato.meses || dato.cuando) && (
          <p style={{ color: '#E0A33A', fontWeight: 700, fontSize: 9.5, marginTop: 2 }}>
            {dato.meses}{dato.meses && dato.cuando ? ' · ' : ''}
            {dato.cuando ? new Date(dato.cuando).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
          </p>
        )}
      </div>

      {!encogido && (
        esPdf ? (
          <div style={{ padding: 10, textAlign: 'center' }}>
            <a href={dato.img} target="_blank" rel="noreferrer"
              style={{ color: '#5BE39B', fontWeight: 900, fontSize: 12, textDecoration: 'underline' }}>
              Abrir el soporte en PDF
            </a>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={dato.img} alt="Soporte del pago"
            style={{ display: 'block', width: '100%', maxHeight: '58vh', objectFit: 'contain', background: '#111827' }} />
        )
      )}
    </div>
  );
}

// ── Vista "Diccionario": administra los cruces cuenta/nombre → código ──
function DiccionarioEditor({ codMap, flash, onCount }: {
  codMap: Record<string, string>;
  flash: (t: string) => void;
  onCount: (n: number) => void;
}) {
  const [rows, setRows] = useState<{ id: string; tipo: string; clave: string; codigo: string; orig?: string }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [q, setQ] = useState('');
  const [limite, setLimite] = useState(300);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  // Agregar un cruce nuevo a mano (cuenta/nombre → código)
  const [nuevaClave, setNuevaClave] = useState('');
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [agregando, setAgregando] = useState(false);

  async function agregarCruce() {
    const claveRaw = nuevaClave.trim();
    const cod = nuevoCodigo.trim();
    if (!claveRaw || !cod) { flash('⚠ Escribe la cuenta o nombre y el código.'); return; }
    // Si es numérico (≥5 dígitos) → cuenta; si no → nombre (normalizado, igual que al importar)
    const dig = soloDigitos(claveRaw);
    const esCuenta = dig.length >= 5 && /^[0-9\s.\-]+$/.test(claveRaw);
    const tipo = esCuenta ? 'cuenta' : 'nombre';
    const clave = esCuenta ? dig : normNombre(claveRaw);
    if (!clave) { flash('⚠ Cuenta o nombre inválido.'); return; }
    setAgregando(true);
    try { await guardarMapeo([{ tipo, clave, codigo: cod }]); } catch { /* noop */ }
    setAgregando(false);
    setNuevaClave(''); setNuevoCodigo('');
    flash(`✓ Cruce agregado: ${clave} → ${cod}`);
    cargar();
  }

  function cargar() {
    setCargando(true);
    getMapeoRows().then(r => { setRows(r.map(x => ({ ...x, orig: x.clave }))); onCount(r.length); }).catch(() => {}).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { setLimite(300); }, [q]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    const tCta = t.replace(/\D/g, '').replace(/^0+/, ''); // cuenta buscada sin ceros a la izquierda
    return rows.filter(r =>
      String(r.clave || '').toLowerCase().includes(t) ||
      (!!tCta && normCuenta(r.clave).includes(tCta)) ||
      String(r.codigo || '').toLowerCase().includes(t) ||
      String(codMap[r.codigo] || '').toLowerCase().includes(t)
    );
  }, [q, rows, codMap]);
  const vis = filtradas.slice(0, limite);

  function editarLocal(id: string, codigo: string) { setRows(prev => prev.map(r => r.id === id ? { ...r, codigo } : r)); }
  function editarLocalClave(id: string, clave: string) { setRows(prev => prev.map(r => r.id === id ? { ...r, clave } : r)); }
  async function guardar(r: { id: string; tipo: string; clave: string; codigo: string; orig?: string }) {
    const cod = String(r.codigo || '').trim();
    // La cuenta/nombre se normaliza igual que al importar (dígitos si es cuenta, texto normalizado si es nombre)
    const claveNorm = r.tipo === 'cuenta' ? soloDigitos(r.clave) : normNombre(r.clave);
    if (!claveNorm || !cod) { flash('⚠ La cuenta/nombre y el código no pueden quedar vacíos.'); return; }
    setGuardandoId(r.id);
    await guardarMapeo([{ tipo: r.tipo, clave: claveNorm, codigo: cod }]);
    // Si se cambió la cuenta/nombre, el cruce viejo queda huérfano → se elimina
    if (r.orig && r.orig !== claveNorm) { try { await borrarMapeo(r.id); } catch { /* noop */ } }
    setGuardandoId(null);
    flash('Cruce actualizado ✓');
    cargar();
  }
  async function eliminar(r: { id: string; clave: string; codigo: string }) {
    if (!window.confirm(`¿Eliminar el cruce "${r.clave}" → ${r.codigo}? Los movimientos ya guardados no cambian.`)) return;
    const ok = await borrarMapeo(r.id);
    if (ok) { setRows(prev => { const n = prev.filter(x => x.id !== r.id); onCount(n.length); return n; }); flash('Cruce eliminado'); }
    else flash('No se pudo eliminar.');
  }

  return (
    <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#4A5568]">
        <p className="font-black text-white text-sm">Diccionario de cuentas y códigos <span className="text-white/40 font-semibold">({rows.length.toLocaleString('es-CO')})</span></p>
        <div className="flex items-center gap-1.5 border border-[#4A5568] rounded-lg px-2 py-1.5 bg-[#3C4759]">
          <Search className="w-3.5 h-3.5 text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cuenta, código o deportista…" className="w-56 text-xs focus:outline-none rounded px-1" style={{ background: '#FFFFFF', color: '#111827' }} />
        </div>
        <button onClick={cargar} disabled={cargando} className="ml-auto text-xs font-black text-white/70 bg-[#3C4759] border border-[#4A5568] px-3 py-1.5 rounded-lg hover:bg-[#2B3547] transition disabled:opacity-60">{cargando ? 'Cargando…' : 'Actualizar'}</button>
      </div>
      {/* Agregar un cruce nuevo a mano */}
      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[#4A5568] bg-[rgba(0,176,80,.14)]/40">
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-white/70 mb-0.5">CUENTA O NOMBRE</label>
          <input value={nuevaClave} onChange={e => setNuevaClave(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') agregarCruce(); }}
            placeholder="Ej: 10202589777  o  MARIA MEZA 4155"
            className="w-64 border border-[#4A5568] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
            style={{ background: '#FFFFFF', color: '#111827' }} />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-white/70 mb-0.5">CÓDIGO</label>
          <input list="codigos-libro" value={nuevoCodigo} onChange={e => setNuevoCodigo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') agregarCruce(); }}
            placeholder="25277"
            className="w-28 border border-[#4A5568] rounded-lg px-2 py-1.5 text-xs font-bold text-center focus:outline-none focus:border-green-500"
            style={{ background: '#FFFFFF', color: '#111827' }} />
        </div>
        <button onClick={agregarCruce} disabled={agregando}
          className="flex items-center gap-1.5 text-xs font-black text-white bg-[#16a34a] border border-[#16a34a] px-3 py-2 rounded-lg hover:bg-[#064e1e] transition disabled:opacity-60">
          <Plus className="w-3.5 h-3.5" /> {agregando ? 'Agregando…' : 'Agregar al diccionario'}
        </button>
        <span className="text-[11px] text-white/40">Si es número = cuenta; si es texto = nombre. Se usará para cruzar el próximo extracto.</span>
      </div>
      <p className="px-4 py-2 text-[11px] text-white/40 bg-[#333F50] border-b border-[#4A5568]">
        Cada fila es un cruce aprendido: cuando en un extracto llega una cuenta o nombre igual, se le pone este código automáticamente. Puedes corregir un código o eliminar un cruce equivocado.
      </p>
      <div className="overflow-x-auto" style={{ maxHeight: '62vh' }}>
        {/* HOJA CLARA: este cuadro es blanco de verdad, así que se marca para
            que la letra vuelva a ser oscura. Sin esto, con el diseño nuevo la
            letra sale blanca sobre blanco y no se ve nada.
            — corregido 05/09/2026 */}
        <table data-hoja="clara" className="w-full border-collapse text-xs" style={{ minWidth: 720 }}>
          <thead><tr>
            {['TIPO', 'CUENTA / NOMBRE', 'CÓDIGO', 'DEPORTISTA', ''].map(h => (
              <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={5} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>Cargando…</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>No hay cruces que coincidan.</td></tr>
            ) : vis.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                <td style={{ ...td, fontSize: 10, color: '#64748b', fontWeight: 700 }}>{r.tipo === 'cuenta' ? 'CUENTA' : r.tipo === 'pagador' ? 'PAGADOR QR' : 'NOMBRE'}</td>
                <td style={{ ...td, textAlign: 'left' }} title={r.clave}>
                  <input value={r.clave} onChange={e => editarLocalClave(r.id, e.target.value)}
                    className="w-full border border-[#4A5568] rounded px-1.5 py-1 text-[11px] font-semibold" />
                </td>
                <td style={{ ...td, width: 110 }}>
                  <input value={r.codigo} onChange={e => editarLocal(r.id, e.target.value)} className="w-24 border border-[#4A5568] rounded px-1.5 py-1 text-[11px] text-center font-bold" />
                </td>
                <td style={{ ...td, textAlign: 'left' }} title={codMap[r.codigo] || ''}>{codMap[r.codigo] || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => guardar(r)} disabled={guardandoId === r.id} className="text-[11px] font-black text-white bg-[#16a34a] px-2.5 py-1 rounded-lg hover:bg-[#064e1e] transition disabled:opacity-60">{guardandoId === r.id ? '…' : 'Guardar'}</button>
                    <button onClick={() => eliminar(r)} title="Eliminar" className="text-white/40 hover:text-[#F08A87] p-1 rounded-lg hover:bg-[rgba(192,80,77,.14)] transition"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!cargando && filtradas.length > vis.length && (
        <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-[#4A5568] bg-[#333F50]">
          <span className="text-xs font-bold text-white/70">Mostrando {vis.length.toLocaleString('es-CO')} de {filtradas.length.toLocaleString('es-CO')}</span>
          <button onClick={() => setLimite(l => l + 500)} className="text-xs font-black text-[#5BE39B] bg-[rgba(0,176,80,.14)] border border-[rgba(0,176,80,.45)] px-3 py-1.5 rounded-lg hover:bg-green-100 transition">Mostrar 500 más</button>
        </div>
      )}
    </div>
  );
}

// ── Vista "Por asignar": agrupa los pagos sin código y permite cruzarlos ──
function DesconocidasEditor({ deportistas, conceptos, flash }: {
  deportistas: Deportista[];
  conceptos: Concepto[];
  flash: (t: string) => void;
}) {
  const [movs, setMovs] = useState<MovCont[]>([]);
  const [cargando, setCargando] = useState(false);
  const [asignando, setAsignando] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    getMovimientos().then(setMovs).catch(() => {}).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); }, []);

  const grupos = useMemo(() => {
    const map: Record<string, { key: string; ref: string; movs: MovCont[]; total: number; ejemplo: string }> = {};
    for (const m of movs) {
      if ((m.codigo || '').trim()) continue;
      if (!(Number(m.credito) > 0)) continue;
      const ref = String(m.referencia || '').trim();
      /* ── LOS PAGO QR SE AGRUPAN POR EL PAGADOR, NO POR LA CUENTA ───────────
         (dirección, 01/09/2026)

         Todos los pagos por QR traen la MISMA referencia: la cuenta del
         recaudo. Agrupados por ahí, los pagos de veinte familias distintas
         caían en un solo montón — y asignarle un código a ese montón se los
         hubiera pegado todos al mismo niño. Se agrupan por la descripción, que
         es donde el banco escribe quién pagó. */
      const esQR = /PAGO\s*QR/i.test(m.descripcion || '');
      const key = esQR ? (String(m.descripcion || '').trim() || '(sin descripción)')
                       : (ref || '(sin referencia)');
      if (!map[key]) map[key] = { key, ref, movs: [], total: 0, ejemplo: m.descripcion || '' };
      map[key].movs.push(m);
      map[key].total += Number(m.credito) || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [movs]);

  const totalMovs = useMemo(() => grupos.reduce((s, g) => s + g.movs.length, 0), [grupos]);

  async function asignar(g: { key: string; ref: string; movs: MovCont[] }, cod: string, nombre: string, concepto: string) {
    setAsignando(g.key);
    // 1) aprender en el diccionario (para que el próximo extracto se cruce solo).
    //    Los PAGO QR y referencias "null" NO se aprenden: su cuenta es del recaudo/QR,
    //    compartida por muchos pagadores, y ensuciaría el diccionario.
    const refDig = soloDigitos(g.ref);
    const refConfiable = !/null/i.test(g.ref || '') && !g.movs.some(m => /PAGO\s*QR/i.test(m.descripcion || ''));
    if (refConfiable && refDig.length >= 5) await guardarMapeo([{ tipo: 'cuenta', clave: refDig, codigo: cod }]);
    else if (refConfiable) { const kn = normNombre(g.ref); if (kn) await guardarMapeo([{ tipo: 'nombre', clave: kn, codigo: cod }]); }
    else {
      /* PAGO QR: no se aprende la cuenta (es la del recaudo, compartida), pero
         sí el NOMBRE DEL PAGADOR que va en la descripción. Aquí el grupo ya es
         de un solo pagador, porque arriba se agrupó por descripción. */
      const desc = g.movs.find(m => /PAGO\s*QR/i.test(m.descripcion || ''))?.descripcion || '';
      const kp = clavePagador(desc);
      if (kp) await guardarMapeo([{ tipo: 'pagador', clave: kp, codigo: cod }]);
    }
    // 2) corregir los movimientos existentes (agrupados por mes para el Detalle)
    const porMes: Record<string, string[]> = {};
    for (const m of g.movs) { const mes = mesDesdeFecha(m.fecha); (porMes[mes] = porMes[mes] || []).push(m.id || ''); }
    let ok = true;
    for (const mes of Object.keys(porMes)) {
      const r = await asignarCodigoBulk(porMes[mes], { codigo: cod, deportista: nombre, concepto: concepto || 'APORTE FORMACIÓN', detalle: mes });
      if (!r) ok = false;
    }
    // 3) quitar del listado local
    const ids = new Set(g.movs.map(m => m.id));
    setMovs(prev => prev.map(m => (ids.has(m.id) ? { ...m, codigo: cod, deportista: nombre } : m)));
    setAsignando(null);
    flash(ok ? `Asignados ${g.movs.length} movimientos a ${nombre} (${cod}) y guardado en el diccionario ✓` : 'Se guardó el diccionario, pero hubo un error actualizando algunos movimientos.');
  }

  return (
    <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#4A5568]">
        <p className="font-black text-white text-sm">
          Cuentas por asignar <span className="text-white/40 font-semibold">({grupos.length} · {totalMovs.toLocaleString('es-CO')} movimientos)</span>
        </p>
        <button onClick={cargar} disabled={cargando} className="ml-auto text-xs font-black text-white/70 bg-[#3C4759] border border-[#4A5568] px-3 py-1.5 rounded-lg hover:bg-[#2B3547] transition disabled:opacity-60">
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      <p className="px-4 py-2 text-[11px] text-white/40 bg-[#333F50] border-b border-[#4A5568]">
        Son pagos recibidos que el sistema no pudo cruzar con un deportista. Asigna cada cuenta: se corrige en el libro y queda guardado en el diccionario para que el próximo extracto se cruce solo.
      </p>
      <div className="overflow-x-auto" style={{ maxHeight: '64vh' }}>
        <table data-hoja="clara" className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              {['REFERENCIA / CUENTA', 'MOV.', 'TOTAL $', 'EJEMPLO DESCRIPCIÓN', 'CONCEPTO', 'ASIGNAR DEPORTISTA'].map(h => (
                <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>Cargando…</td></tr>
            ) : grupos.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-[#5BE39B] font-semibold">🎉 No hay cuentas por asignar. Todos los pagos están cruzados.</td></tr>
            ) : grupos.map(g => (
              <FilaDesconocida key={g.key} g={g} deportistas={deportistas} conceptos={conceptos} onAsignar={asignar} busy={asignando === g.key} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaDesconocida({ g, deportistas, conceptos, onAsignar, busy }: {
  g: { key: string; ref: string; movs: MovCont[]; total: number; ejemplo: string };
  deportistas: Deportista[];
  conceptos: Concepto[];
  onAsignar: (g: any, cod: string, nombre: string, concepto: string) => void;
  busy: boolean;
}) {
  const [q, setQ] = useState('');
  const [concepto, setConcepto] = useState('APORTE FORMACIÓN');
  const sug = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return deportistas.filter(d => { const cod = getCod(d); return d._nombre.toLowerCase().includes(t) || cod.includes(t); }).slice(0, 8);
  }, [q, deportistas]);
  return (
    <tr style={{ background: '#fff' }}>
      {/* En un PAGO QR no se muestra la referencia: es la LLAVE de Futuro
          Antioquia (la cuenta de recaudo), igual para todos los que pagan por
          ahí. Se muestra el pagador, que es lo que distingue a esta familia. */}
      <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
        {/PAGO\s*QR/i.test(g.ejemplo || '')
          ? <span title={'Llave de recaudo de Futuro Antioquia: ' + (g.ref || '—') + ' — la comparten todos los pagos por QR, por eso no identifica a nadie.'}>
              {g.ejemplo || '(sin descripción)'}
            </span>
          : (g.ref || '(sin referencia)')}
      </td>
      <td style={td}>{g.movs.length}</td>
      <td style={{ ...td, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{fmt(g.total)}</td>
      <td style={{ ...td, textAlign: 'left', maxWidth: 240 }} className="truncate" title={g.ejemplo}>{g.ejemplo}</td>
      <td style={{ ...td }}>
        <select value={concepto} onChange={e => setConcepto(e.target.value)}
          className="w-36 border border-[#4A5568] rounded px-1.5 py-1 text-[11px] font-semibold text-white bg-[#3C4759]">
          <option value="APORTE FORMACIÓN">APORTE FORMACIÓN</option>
          {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          {concepto && concepto !== 'APORTE FORMACIÓN' && !conceptos.some(c => c.nombre === concepto) && (
            <option value={concepto}>{concepto}</option>
          )}
        </select>
      </td>
      <td style={{ ...td, textAlign: 'left', minWidth: 220 }}>
        {busy ? <span className="text-[11px] font-bold" style={{ color: '#64748b' }}>Asignando…</span> : (
          <div className="relative">
            <div className="flex items-center gap-1 border border-orange-300 rounded px-1.5 py-1 " style={{ background: '#FFFFFF' }}>
              <Search className="w-3 h-3 text-orange-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar deportista o código…" className="w-44 text-[11px] focus:outline-none" />
            </div>
            {sug.length > 0 && (
              <div className="absolute z-20 mt-1 w-64 bg-[#3C4759] border border-[#4A5568] rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {sug.map(d => {
                  const cod = getCod(d);
                  return (
                    <button key={d.id} onClick={() => { onAsignar(g, cod, d._nombre, concepto); setQ(''); }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-[rgba(0,176,80,.14)] text-[11px] flex items-center gap-2">
                      <span className="font-black text-[#5BE39B]">{cod}</span>
                      <span className="text-white truncate">{d._nombre}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Editor del catálogo de cuentas/conceptos (TRANSPORTE, APORTE FORMACIÓN, GASTOS…) ──
const TIPOS = ['ingreso', 'gasto', 'traslado', 'financiero', 'otro'];

function CuentasEditor({ conceptos, onCambio, flash }: {
  conceptos: Concepto[];
  onCambio: (c: Concepto[]) => void;
  flash: (t: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return conceptos;
    return conceptos.filter(c => c.nombre.toLowerCase().includes(t) || (c.codcuenta || '').includes(t));
  }, [busca, conceptos]);

  function editarLocal(id: string, campo: keyof Concepto, val: string) {
    onCambio(conceptos.map(c => c.id === id ? { ...c, [campo]: campo === 'orden' ? (parseInt(val) || 0) as any : val } : c));
  }

  async function guardar(c: Concepto) {
    if (!c.nombre.trim()) { flash('El nombre no puede estar vacío.'); return; }
    setGuardandoId(c.id);
    const r = await guardarConcepto(c);
    setGuardandoId(null);
    if (r.ok) { flash('Cuenta guardada ✓'); getConceptos().then(onCambio); }
    else flash('Error: ' + (r.msg || ''));
  }

  async function eliminar(c: Concepto) {
    if (!window.confirm(`¿Eliminar la cuenta "${c.nombre}"? Los movimientos que ya la usan no se modifican.`)) return;
    const ok = await borrarConcepto(c.id);
    if (ok) { flash('Cuenta eliminada'); getConceptos().then(onCambio); }
    else flash('No se pudo eliminar.');
  }

  function nueva() {
    const maxOrden = conceptos.reduce((m, c) => Math.max(m, c.orden || 0), 0);
    const nuevo: Concepto = { id: 'con_' + Math.random().toString(36).slice(2, 8), nombre: '', tipo: 'gasto', codcuenta: '', orden: maxOrden + 10 };
    onCambio([...conceptos, nuevo]);
  }

  return (
    <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#4A5568]">
        <p className="font-black text-white text-sm">Cuentas / conceptos <span className="text-white/40 font-semibold">({conceptos.length})</span></p>
        <div className="flex items-center gap-1.5 border border-[#4A5568] rounded-lg px-2 py-1.5 bg-[#3C4759]">
          <Search className="w-3.5 h-3.5 text-white/40" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cuenta…" className="w-40 text-xs focus:outline-none" />
        </div>
        <button onClick={nueva} className="ml-auto flex items-center gap-1.5 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-xl hover:bg-[#064e1e] transition">
          + Nueva cuenta
        </button>
      </div>
      <p className="px-4 py-2 text-[11px] text-white/40 bg-[#333F50] border-b border-[#4A5568]">
        Estas son las opciones que aparecen en la lista desplegable de <b>CONCEPTO</b> al revisar los movimientos. Edita el nombre, el tipo o el código y pulsa Guardar.
      </p>
      <div className="overflow-x-auto" style={{ maxHeight: '62vh' }}>
        <table data-hoja="clara" className="w-full border-collapse text-xs" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              {['ORDEN', 'NOMBRE DE LA CUENTA', 'TIPO', 'CÓD. CUENTA', ''].map(h => (
                <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 font-semibold" style={{ color: '#94a3b8' }}>No hay cuentas. Crea una con “+ Nueva cuenta”.</td></tr>
            ) : lista.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                <td style={{ ...td, width: 70 }}>
                  <input type="number" value={c.orden} onChange={e => editarLocal(c.id, 'orden', e.target.value)}
                    className="w-14 border border-[#4A5568] rounded px-1 py-1 text-[11px] text-center" />
                </td>
                <td style={{ ...td, textAlign: 'left' }}>
                  <input value={c.nombre} onChange={e => editarLocal(c.id, 'nombre', e.target.value)}
                    className="w-full min-w-[200px] border border-[#4A5568] rounded px-2 py-1 text-[11px] font-bold uppercase" placeholder="Nombre de la cuenta" />
                </td>
                <td style={{ ...td }}>
                  <select value={c.tipo} onChange={e => editarLocal(c.id, 'tipo', e.target.value)}
                    className="border border-[#4A5568] rounded px-1.5 py-1 text-[11px] font-semibold">
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    {c.tipo && !TIPOS.includes(c.tipo) && <option value={c.tipo}>{c.tipo}</option>}
                  </select>
                </td>
                <td style={{ ...td }}>
                  <input value={c.codcuenta} onChange={e => editarLocal(c.id, 'codcuenta', e.target.value)}
                    className="w-24 border border-[#4A5568] rounded px-1.5 py-1 text-[11px] text-center" placeholder="—" />
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => guardar(c)} disabled={guardandoId === c.id}
                      className="text-[11px] font-black text-white bg-[#16a34a] px-2.5 py-1 rounded-lg hover:bg-[#064e1e] transition disabled:opacity-60">
                      {guardandoId === c.id ? '…' : 'Guardar'}
                    </button>
                    <button onClick={() => eliminar(c)} title="Eliminar"
                      className="text-white/40 hover:text-[#F08A87] p-1 rounded-lg hover:bg-[rgba(192,80,77,.14)] transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
