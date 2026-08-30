'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  PROGRAMACIÓN DE COMPETENCIA
//
//  QUÉ ES (dirección, 28/08/2026): aquí la DIRECCIÓN deja escrito qué se
//  juega, cuándo y dónde. Un renglón por partido:
//
//     TORNEO # · el nombre sale solo · # FECHA · DÍA DE JUEGO · HORA ·
//     RIVAL · ESCENARIO · D.T · A.T
//
//  PARA QUÉ SIRVE: de aquí salen los POSPARTIDOS. Antes el formador abría el
//  pospartido en blanco y escribía a mano la fecha, la hora, el rival y el
//  escenario —cada uno a su manera, y a veces sin ponerlos—. Ahora la
//  programación la hace la dirección y, con el botón AGREGAR A POST PARTIDO,
//  la planilla de ese partido queda CREADA y con el encabezado lleno: día,
//  hora de llegada, rival, escenario, D.T y A.T. El formador solo entra a
//  calificar a los deportistas.
//
//  NO PISA LO YA ESCRITO: si esa planilla ya existe y tiene deportistas
//  calificados, solo se le actualiza el encabezado; las notas no se tocan.
//
//  ── CÓMO ESTÁ ARMADO EL CUADRO (dirección, 29/08/2026) ──────────────────────
//  Los datos van DENTRO de un recuadro y los dos botones —AGREGAR A MICROCICLO
//  y la papelera— van POR FUERA, a la derecha, en el mismo renglón. Así, cuando
//  se le agregue un cuadro o una imagen debajo de la programación, los botones
//  no quedan encerrados con los datos.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertTriangle, Loader2, Plus, Trash2, CalendarDays, Check, X, GripVertical, ChevronDown,
  Image as IconoImagen, Download,
} from 'lucide-react';

import { getCuadro, limpiar, type FilaTorneo } from '@/lib/torneos';
import { esSuperAdmin, esAccesoTotal, esDeportivo } from '@/lib/permisos';
import {
  getProgramacion, agregarPartido, guardarPartido, borrarPartido,
  diaBonito, horaBonita, FALTA_TABLA_PROG,
  type FilaProgramacion,
} from '@/lib/programacion';
import { getDeportistas } from '@/lib/db';
import { getPlanilla, guardarPlanilla, etiquetaFecha } from '@/lib/pospartido';
import type { Deportista } from '@/lib/db';

/* ── Colores oficiales ───────────────────────────────────────────────────── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';

/* Las # FECHA, igual que en el pospartido. */
const NUM_FECHAS: string[] = Array.from({ length: 30 }, (_, i) => `${i + 1}A`);

/* El ancho de cada columna. El mismo reparto lo usan los títulos y todos los
   renglones, así el cuadro queda cuadrado por más renglones que se agreguen. */
/* La columna del TORNEO va ANCHA a propósito (dirección, 29/08/2026): ahí
   caben nombres como "VALORES LAF FORMACIÓN SELECCIÓN SUB 10 WONDER" y hay que
   poder leerlos completos, no cortados con puntos. */
/* SIN LA COLUMNA "DÍA DE JUEGO" (dirección, 29/08/2026): el cuadro es de UN
   SOLO DÍA y el día va arriba, en el título. Al pospartido el día sigue
   llegando igual —se guarda en el renglón—, solo que aquí no se muestra. */
/* ESCENARIO MÁS ANCHO, D.T Y A.T MÁS ANGOSTAS (dirección, 29/08/2026): en
   D.T y A.T va un solo apellido, mientras que en ESCENARIO va el nombre de la
   cancha completo y se estaba cortando.
   El orden es: TORNEO # · # FECHA · TORNEO · HORA · ESCENARIO · RIVAL · D.T · A.T
   (la # FECHA se pasó junto al número del torneo — dirección, 29/08/2026) */
/* MEDIDA DE HOJA CARTA (dirección, 29/08/2026): el cuadro se apretó para que
   quepa parejo en una hoja y en la imagen que se comparte. ESCENARIO se bajó
   —era la más ancha—, y las demás se recortaron un poquito cada una.
   El orden es: TORNEO # · # FECHA · TORNEO · HORA · ESCENARIO · RIVAL · D.T · A.T
   (la # FECHA se pasó junto al número del torneo — dirección, 29/08/2026) */
const COLUMNAS = '56px 66px minmax(210px,1.3fr) 168px minmax(150px,1fr) minmax(140px,1fr) 104px 104px';
const ANCHO_MINIMO = 1070;

/* ── LA MEMORIA DE RIVALES Y ESCENARIOS ─────────────────────────────────────
   Los nombres de los equipos y de las canchas se repiten todo el año. En vez
   de escribirlos completos cada vez, quedan anotados en este computador y
   salen en una listica debajo de la casilla apenas se escriben las primeras
   letras. Se puede escribir cualquier cosa nueva: la listica solo ayuda, no
   obliga. — dirección, 29/08/2026 */
const LLAVE_RIVALES    = 'programacion-rivales';
const LLAVE_ESCENARIOS = 'programacion-escenarios';

function leerMemoria(llave: string): string[] {
  try {
    const crudo = localStorage.getItem(llave);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.map((x: any) => String(x ?? '')).filter(Boolean) : [];
  } catch { return []; }
}

function recordar(llave: string, valor: string) {
  const v = String(valor ?? '').trim().toUpperCase();
  if (v.length < 3) return;                 // media palabra todavía no es un nombre
  try {
    const lista = leerMemoria(llave);
    if (lista.includes(v)) return;
    localStorage.setItem(llave, JSON.stringify([...lista, v].slice(-400)));
  } catch { /* sin espacio: no pasa nada */ }
}

/* ── EL COLOR DE CADA PROGRAMA ──────────────────────────────────────────────
   La comunidad reconoce el programa por el color de la imagen (dirección,
   29/08/2026):

       DESARROLLO   dorado        SELECCIÓN   naranja
       PROGRESIÓN   verde         FORMACIÓN   azul

   Se pintan de ese color: la palabra del programa, las cuatro casillas de
   arriba —LLEGAR · DÍA · ESCENARIO · RIVAL—, la hora, el día y el rival.
   Cuando no se está filtrando un solo programa, se usa el verde de siempre. */
type ColorPrograma = { caja: string; letra: string };

const COLOR_VERDE: ColorPrograma = { caja: '#00B050', letra: '#5BE39B' };

const COLORES_PROGRAMA: { clave: string; color: ColorPrograma }[] = [
  { clave: 'DESARROLLO', color: { caja: '#C8912F', letra: '#F0C463' } },   // dorado
  { clave: 'SELECCION',  color: { caja: '#E06A22', letra: '#FFA469' } },   // naranja
  { clave: 'PROGRESION', color: { caja: '#00B050', letra: '#5BE39B' } },   // verde
  { clave: 'FORMACION',  color: { caja: '#2F6FD0', letra: '#7FB2F5' } },   // azul
];

/** El color que le toca a la imagen según el programa que se esté filtrando.
 *  Si se filtran varios programas —o ninguno—, se queda el verde. */
function colorDelPrograma(programas: string[]): ColorPrograma {
  if (programas.length !== 1) return COLOR_VERDE;
  const n = String(programas[0] ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return COLORES_PROGRAMA.find(c => n.includes(c.clave))?.color ?? COLOR_VERDE;
}

/** El título de los días: un día solo, o un rango.
 *  "SÁBADO 29 DE AGOSTO DE 2026"  ·  "DEL SÁBADO 29 AL LUNES 31 DE AGOSTO DE 2026"
 *  — dirección, 29/08/2026 */
function tituloDias(desde: string, hasta: string, dias?: string[]): string {
  if (!desde) return 'TODOS LOS DÍAS';
  if (!hasta || hasta <= desde) return diaLargo(desde);

  /* CORTO Y BONITO (dirección, 29/08/2026): "SAB 29 / DOM 30". El "DEL … AL
     …" quedaba tan largo que se cortaba en la imagen. Se nombran solo los
     días que SÍ tienen partido; si son más de cuatro, ahí sí se dice del uno
     al otro. */
  const lista = [...new Set((dias ?? []).filter(Boolean))].sort();
  if (lista.length >= 2 && lista.length <= 4) {
    const mesDe = (f: string) => f.slice(0, 7);
    const mismoMes = lista.every(f => mesDe(f) === mesDe(lista[0]));
    return lista
      .map(f => {
        const b = diaBonito(f);                       // "SAB 29 AGO"
        return mismoMes ? b.split(' ').slice(0, 2).join(' ') : b;
      })
      .join(' / ') + (mismoMes ? ` ${diaBonito(lista[0]).split(' ')[2] ?? ''}` : '');
  }

  const largo1 = diaLargo(desde), largo2 = diaLargo(hasta);
  if (!largo1 || !largo2) return diaLargo(desde) || '';
  /* Si los dos son del mismo año, el año se dice una sola vez, al final. */
  const anio1 = largo1.slice(largo1.lastIndexOf(' ') + 1);
  const anio2 = largo2.slice(largo2.lastIndexOf(' ') + 1);
  const sinAnio = (t: string) => t.replace(/ DE \d{4}$/, '');
  return anio1 === anio2
    ? `DEL ${sinAnio(largo1)} AL ${largo2}`
    : `DEL ${largo1} AL ${largo2}`;
}

/** El día de hoy, escrito como lo guarda la base: 2026-08-29. */
function hoyISO(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** "2026-08-29" → "SÁBADO 29 DE AGOSTO DE 2026". Para el título del cuadro y
 *  para la imagen que se comparte. — dirección, 29/08/2026 */
function diaLargo(fecha: string): string {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
                 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  return `${dias[d.getDay()]} ${d.getDate()} DE ${meses[d.getMonth()]} DE ${d.getFullYear()}`;
}

/* ── Lectura de la ficha del deportista (igual que en pospartido) ─────────── */
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k.trim()));
  return k ? String(dep._columnas[k] ?? '') : '';
}
const RX_COMPETENCIAS = [
  /^compite$|torneo.?1|^c\s*1$/i,
  /torneo.?2|^c\s*2$/i,
  /torneo.?3|^c\s*3$/i,
  /torneo.?4|^c\s*4$/i,
];
const CLAVES_VIRTUALES = ['__TORNEO1__', '__TORNEO2__', '__TORNEO3__', '__TORNEO4__'];

function torneosDelDeportista(dep: Deportista): number[] {
  const vals: string[] = [];
  RX_COMPETENCIAS.forEach((rx, i) => {
    vals.push(getCol(dep, rx) || String(dep._columnas?.[CLAVES_VIRTUALES[i]] ?? ''));
  });
  return vals
    .map(v => parseInt(String(v).trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

/** El lunes de la semana de esa fecha, en AAAA-MM-DD. */
function lunesDe(fecha: string): string {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  const dow = (d.getDay() + 6) % 7;           // 0 = lunes
  d.setDate(d.getDate() - dow);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Quita tildes y deja en mayúscula, para comparar sin equivocarse. */
const pelar = (t: any) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/** EL PRIMER APELLIDO, que es como se nombran los profes entre ellos.
 *  "ALEJANDRO CASTRO ESTRADA" → "CASTRO"
 *  "JHON FREDY JARAMILLO BOCANEGRA" → "JARAMILLO"
 *  En Colombia los dos últimos pedazos son los apellidos, así que el primer
 *  apellido es el penúltimo. Con dos palabras, el apellido es el segundo.
 *  — dirección, 29/08/2026 */
function primerApellido(nombre: string): string {
  const p = String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '';
  if (p.length === 1) return p[0];
  if (p.length === 2) return p[1];
  return p[p.length - 2];
}

/** La hora, en minutos desde la medianoche, para poder ordenarlas.
 *  Entiende "2:00 PM" y también las viejas de 24 horas ("14:00").
 *  Las que no tienen hora se van de últimas. — dirección, 29/08/2026 */
function minutosDeLaHora(hora: any): number {
  const t = String(hora ?? '').trim().toUpperCase();
  let m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'PM') h += 12;
    return h * 60 + Number(m[2]);
  }
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return 99999;
}

/** EL PROFE DEL TORNEO, buscado en la lista del club.
 *
 *  POR QUÉ HACE FALTA (dirección, 29/08/2026): en el cuadro de Torneos la
 *  casilla FORMADOR suele traer solo el apellido —"CASTRO"—, mientras que la
 *  lista de profes trae el nombre completo —"ALEJANDRO CASTRO ESTRADA"—. Sin
 *  emparejarlos, el mismo señor salía DOS VECES en la lista: una como el del
 *  equipo y otra entre los demás. Aquí se busca a quién corresponde ese
 *  apellido y se devuelve su nombre completo, que es el que se guarda.
 *  Si no aparece en la lista del club, se devuelve tal cual venía. */
function profeDelTorneo(texto: any, todos: string[]): string {
  const t = pelar(texto);
  if (!t) return '';
  const exacto = todos.find(p => pelar(p) === t);
  if (exacto) return exacto;
  const porApellido = todos.find(p => pelar(primerApellido(p)) === t);
  if (porApellido) return porApellido;
  const contenido = todos.find(p => pelar(p).includes(t));
  if (contenido) return contenido;
  return String(texto ?? '').trim();
}

/** UN BALÓN DE FÚTBOL, dibujado aquí mismo para no depender de ninguna
 *  librería de dibujitos: el círculo, el pentágono del centro y las tres
 *  costuras. Se ve bien desde 14 píxeles. — dirección, 29/08/2026 */
function BalonFutbol({ className, color }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none"
      stroke={color ?? 'currentColor'} strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" />
      {/* El pentágono negro del centro */}
      <path d="M12 7.9 L15.9 10.73 L14.41 15.32 L9.59 15.32 L8.1 10.73 Z"
        fill={color ?? 'currentColor'} stroke="none" />
      {/* Las cinco costuras, que salen de las puntas del pentágono */}
      <path d="M12 7.9 V5 M15.9 10.73 L18.66 9.83 M14.41 15.32 L16.12 17.66
               M9.59 15.32 L7.88 17.66 M8.1 10.73 L5.34 9.83" />
    </svg>
  );
}

/* La casilla del DÍA que iba en cada renglón se retiró el 29/08/2026: el
   cuadro es la programación de UN SOLO DÍA y el día va arriba, en el título.
   El día se sigue guardando en cada partido y le llega igual al pospartido. */

/* ── EL RELOJ DE LA HORA DE LLEGADA ────────────────────────────────────────
   EXACTAMENTE COMO EN EL POSPARTIDO (dirección, 29/08/2026): una lista de 1
   a 12, los minutos 00 · 15 · 30 · 45 —que también se pueden escribir— y el
   botón que cambia entre AM y PM. Así la hora se guarda igual en los dos
   lados y al mandarla al pospartido llega tal cual, sin traducciones.
   — copiado del pospartido para que sea la misma cosa. */
const HORAS_12: string[] = Array.from({ length: 12 }, (_, i) => String(i + 1));

/* Los minutos de siempre, a un clic: en punto, y cuarto, y media, menos cuarto.
   Igual se pueden escribir otros (10:05, 10:40…). — dirección, 26/08/2026 */
const MINUTOS_TIPICOS = ['00', '15', '30', '45'];

function partirHora(v: string): { h: string; m: string; ampm: 'AM' | 'PM' } {
  const t = String(v ?? '').trim().toUpperCase();
  const m = t.match(/^(\d{1,2})\s*:?\s*(\d{0,2})\s*(AM|PM)?$/);
  if (!m) return { h: '', m: '', ampm: 'AM' };
  return {
    h: m[1] ?? '',
    m: (m[2] ?? '').padStart(m[2] ? 2 : 0, '0'),
    ampm: (m[3] as 'AM' | 'PM') || 'AM',
  };
}

function juntarHora(h: string, min: string, ampm: 'AM' | 'PM'): string {
  if (!h) return '';
  const mm = String(min ?? '').replace(/\D/g, '').slice(0, 2);
  return `${h}:${(mm || '0').padStart(2, '0')} ${ampm}`;
}

function RelojLlegada({ valor, onChange }: {
  valor: string; onChange: (v: string) => void;
}) {
  const p = partirHora(valor);
  const [listaMin, setListaMin] = useState(false);
  const cajaMin = useRef<HTMLDivElement>(null);
  const cambiar = (h: string, m: string, ampm: 'AM' | 'PM') => onChange(juntarHora(h, m, ampm));

  /* La listica se cierra al tocar por fuera. */
  useEffect(() => {
    if (!listaMin) return;
    function fuera(e: MouseEvent) {
      if (cajaMin.current?.contains(e.target as Node)) return;
      setListaMin(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [listaMin]);

  return (
    <div className="flex items-center gap-1">
      <select value={p.h} onChange={e => cambiar(e.target.value, p.m, p.ampm)}
        title="Hora"
        style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30, width: 56 }}
        className="rounded-lg px-1.5 text-white text-[12px] font-bold outline-none cursor-pointer text-center">
        <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
        {HORAS_12.map(h => (
          <option key={h} value={h} style={{ color: '#111827', backgroundColor: 'white' }}>{h}</option>
        ))}
      </select>

      <span className="text-white font-black">:</span>

      {/* MINUTOS — se escriben, o se escogen de la listica.
          OJO: antes esto era un `datalist` del navegador y NO servía. Como la
          casilla ya traía algo escrito, el navegador filtraba la lista contra
          ese texto y solo mostraba la opción que coincidía: por eso se veía un
          solo "00" y nunca el 15, el 30 ni el 45. Ahora la lista se pinta aquí
          mismo y siempre salen las cuatro. — 26/08/2026 */}
      <div ref={cajaMin} className="relative">
        <div className="flex items-center rounded-lg"
          style={{ background: CAMPO, border: `1px solid ${listaMin ? VERDE : BORDE}`, height: 30 }}>
          <input value={p.m} inputMode="numeric" placeholder="00"
            title="Minutos: escríbelos, o ábrelos con la flechita"
            onChange={e => {
              const mm = e.target.value.replace(/\D/g, '').slice(0, 2);
              cambiar(p.h || '', mm, p.ampm);
            }}
            onFocus={() => setListaMin(true)}
            style={{ width: 34, background: 'transparent' }}
            className="px-1 text-white text-[12px] font-bold outline-none text-center placeholder:text-white/20" />
          <button type="button" onClick={() => setListaMin(v => !v)}
            title="00 · 15 · 30 · 45"
            className="flex items-center justify-center" style={{ width: 16, height: 28 }}>
            <ChevronDown className="w-3 h-3" style={{ color: listaMin ? VERDE : GRIS }} />
          </button>
        </div>

        {listaMin && (
          <div className="absolute left-0 rounded-lg overflow-hidden"
            style={{
              top: 33, zIndex: 60, minWidth: 58,
              background: PANEL, border: `1px solid ${BORDE}`,
              boxShadow: '0 16px 34px rgba(0,0,0,.45)',
            }}>
            {MINUTOS_TIPICOS.map(m => (
              <button key={m} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { cambiar(p.h || '', m, p.ampm); setListaMin(false); }}
                style={{ background: p.m === m ? 'rgba(0,176,80,.20)' : 'transparent' }}
                className="w-full px-3 py-1.5 text-[12px] font-bold text-white text-center hover:bg-white/10">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button"
        onClick={() => cambiar(p.h || '', p.m, p.ampm === 'AM' ? 'PM' : 'AM')}
        title="Clic para cambiar entre AM y PM"
        style={{ background: p.h ? VERDE : CAMPO, border: `1px solid ${p.h ? VERDE : BORDE}`, height: 30, width: 44 }}
        className="rounded-lg text-white text-[12px] font-black">
        {p.ampm}
      </button>
    </div>
  );
}


/* ── La casilla del D.T y del A.T ─────────────────────────────────────────────
   En la lista se lee SOLO EL PRIMER APELLIDO —CASTRO, JARAMILLO—, que es como
   se nombran entre ellos y así cabe sin apretar el cuadro. Lo que se GUARDA
   sigue siendo el nombre completo.
   El formador del equipo va de PRIMERO en la lista, pero sin ningún letrero
   al lado: la dirección lo pidió limpio. — 29/08/2026 */
function CasillaProfe({ valor, onChange, delEquipo, todos }: {
  valor: string;
  onChange: (v: string) => void;
  delEquipo: string;
  todos: string[];
}) {
  const jefe = String(limpiar(delEquipo) ?? '');
  /* Que el del equipo no vuelva a salir entre los demás: se compara por el
     nombre completo Y por el primer apellido. — 29/08/2026 */
  const resto = todos.filter(p =>
    pelar(p) !== pelar(jefe) &&
    !(!!jefe && pelar(primerApellido(p)) === pelar(primerApellido(jefe))));
  const puesto = String(limpiar(valor) ?? '');
  const conocido = [jefe, ...resto].some(p => pelar(p) === pelar(puesto));

  return (
    <select
      value={valor}
      onChange={e => onChange(e.target.value)}
      /* SE ACOMODA SOLA (dirección, 29/08/2026): al hacerle clic, el renglón
         se sube al centro de la pantalla. Antes, en los últimos renglones, la
         listica se abría contra el borde de abajo y tocaba bajar a mano. */
      onFocus={e => {
        try {
          e.currentTarget.closest('div')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch { /* navegador viejo: sigue funcionando igual */ }
      }}
      title="Sale primero el formador del equipo, y debajo todos los del club."
      style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30 }}
      className="w-full rounded-lg px-2 text-white text-[12px] font-bold outline-none cursor-pointer">
      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
      {!!jefe && (
        <option value={jefe} style={{ color: '#111827', backgroundColor: 'white' }}>
          {jefe}
        </option>
      )}
      {!!puesto && !conocido && (
        <option value={valor} style={{ color: '#111827', backgroundColor: 'white' }}>
          {puesto}
        </option>
      )}
      {resto.map(p => (
        <option key={p} value={p} title={p} style={{ color: '#111827', backgroundColor: 'white' }}>
          {p}
        </option>
      ))}
    </select>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ProgramacionCompetenciaPage() {
  const router = useRouter();

  const [puedeEntrar, setPuedeEntrar] = useState<boolean | null>(null);
  useEffect(() => {
    setPuedeEntrar(esSuperAdmin() || esAccesoTotal() || esDeportivo());
  }, []);

  const [filas, setFilas]   = useState<FilaProgramacion[] | null>(null);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [cargando, setCargando]     = useState(true);
  const [error, setError]           = useState('');
  const [aviso, setAviso]           = useState('');
  const [trabajando, setTrabajando] = useState('');   // id del renglón ocupado

  const [cuadro, setCuadro] = useState<FilaTorneo[] | null>(null);
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  /* ── LA LISTA DEL CUERPO TÉCNICO ──────────────────────────────────────────
     Sale del MISMO cuadro de Torneos y Competencias, de la columna FORMADOR:
     esos son los nombres con los que trabaja la academia —CASTRO, TABARES,
     RIOS, CHALARCA…— y no otros. Antes se traía de la tabla de profes, que los
     tiene con nombre completo, y por eso la lista salía distinta y repetida.
     — dirección, 29/08/2026 */
  const profesClub = useMemo(() => {
    const set = new Set<string>();
    for (const t of cuadro ?? []) {
      const n = String(limpiar(t.formador) ?? '').toUpperCase();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [cuadro]);

  /* ── EL ORDEN LO PONE LA MANO (dirección, 29/08/2026) ─────────────────────
     Se agarra el renglón del botón ORDENAR, a la izquierda, y se pone donde
     uno quiera. El orden queda guardado en ESTE computador: es una comodidad
     de quien mira, no un dato de la academia. Los partidos que no se hayan
     movido quedan detrás, por día de juego. */
  const ORDEN_KEY = 'programacion-orden';
  const [ordenMano, setOrdenMano] = useState<string[]>([]);
  const filaArrastrada = useRef<string>('');
  const [filaEncima, setFilaEncima] = useState('');
  const [filaMoviendo, setFilaMoviendo] = useState('');

  useEffect(() => {
    try {
      const g = localStorage.getItem(ORDEN_KEY);
      if (!g) return;
      const p = JSON.parse(g);
      if (Array.isArray(p)) setOrdenMano(p.map(String));
    } catch { /* si está dañado, se sigue con el orden natural */ }
  }, []);

  function guardarOrdenMano(siguiente: string[]) {
    setOrdenMano(siguiente);
    try { localStorage.setItem(ORDEN_KEY, JSON.stringify(siguiente)); } catch { /* nada */ }
  }

  /* La imagen para compartir. */
  const [imagen, setImagen] = useState('');
  const [armandoImg, setArmandoImg] = useState(false);

  /* Los filtros del encabezado verde. */
  /* VARIOS TORNEOS A LA VEZ (dirección, 29/08/2026): se pueden chulear dos,
     tres, cinco… y sacar UNA sola imagen con todos. Lista vacía = todos. */
  const [filtroTorneos, setFiltroTorneos] = useState<string[]>([]);
  const [abriTorneos, setAbriTorneos] = useState(false);
  /* Y lo mismo con el PROGRAMA —la columna PROGRAMA del cuadro de Torneos y
     Competencias—: se pueden marcar varios. — dirección, 29/08/2026 */
  const [filtroProgramas, setFiltroProgramas] = useState<string[]>([]);
  const [abriProgramas, setAbriProgramas] = useState(false);
  /* EL CUADRO ES DE UN SOLO DÍA (dirección, 29/08/2026).
     Arranca en el día de hoy. No es "un filtro más": es de qué día es esta
     programación. Por eso el día se ve arriba, en el título, y la columna de
     DÍA DE JUEGO ya no está en el cuadro. Dejando el día en blanco se ven
     todos, que sirve para no perder de vista un partido sin fecha. */
  const [filtroDia, setFiltroDia]       = useState(() => hoyISO());
  /* HASTA QUÉ DÍA (dirección, 29/08/2026). Vacío = un solo día. Sirve para
     agarrar un fin de semana entero —sábado y domingo— o un puente con el
     lunes festivo, sobre todo para armar UNA sola imagen de todo el puente. */
  const [filtroHasta, setFiltroHasta]   = useState('');
  /* CUERPO TÉCNICO: sale el nombre completo, se muestra el primer apellido, y
     filtra los partidos donde esa persona figura como D.T o como A.T.
     — dirección, 29/08/2026 */
  const [filtroProfe, setFiltroProfe]   = useState('');

  /* LO QUE YA SE HA ESCRITO, para el buscador de RIVAL y de ESCENARIO.
     Junta dos cosas: lo que está escrito en la programación —así se vea otro
     día— y lo que quedó anotado en este computador. — dirección, 29/08/2026 */
  const [memoriaRivales,    setMemoriaRivales]    = useState<string[]>([]);
  const [memoriaEscenarios, setMemoriaEscenarios] = useState<string[]>([]);
  useEffect(() => {
    const juntar = (llave: string, sacar: (f: FilaProgramacion) => string) => {
      const set = new Set<string>(leerMemoria(llave));
      for (const f of filas ?? []) {
        const v = String(sacar(f) ?? '').trim().toUpperCase();
        if (v.length >= 3) set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    };
    setMemoriaRivales(juntar(LLAVE_RIVALES, f => f.rival));
    setMemoriaEscenarios(juntar(LLAVE_ESCENARIOS, f => f.escenario));
  }, [filas]);

  /* ── Traer todo ── */
  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const lista = await getProgramacion();
      if (lista === undefined) { setFaltaTabla(true); setFilas([]); }
      else { setFaltaTabla(false); setFilas(lista); }
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer la programación.');
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try { const c = await getCuadro(); if (vivo) setCuadro(c); } catch { /* nada */ }
      try { const d = await getDeportistas(); if (vivo) setDeportistas(d); } catch { /* nada */ }
    })();
    return () => { vivo = false; };
  }, []);

  /** El torneo número N del cuadro. */
  const torneoDe = useCallback((num: string): FilaTorneo | null => {
    const n = parseInt(String(num ?? ''), 10);
    if (!cuadro || !Number.isFinite(n) || n < 1 || n > cuadro.length) return null;
    return cuadro[n - 1];
  }, [cuadro]);

  /** "LIGA SUB 8 REGOL" — el nombre del torneo, SIN EL PROGRAMA.
   *
   *  El programa (DESARROLLO, FORMACIÓN, SELECCIÓN…) se quitó por orden de la
   *  dirección el 29/08/2026: alargaba mucho el renglón y aquí no hace falta,
   *  porque el torneo ya se reconoce por su nombre y su categoría. En el cuadro
   *  de Torneos y Competencias sigue estando completo. */
  const nombreTorneo = useCallback((num: string): string => {
    const t = torneoDe(num);
    if (!t) return '';
    return [t.torneo, t.categoria, t.nombre].map(limpiar).filter(Boolean).join(' ');
  }, [torneoDe]);

  /** El PROYECTO de un torneo: el que más se repite entre los deportistas que
   *  lo tienen puesto en C1..C4. No se escribe a mano, se deduce. */
  const proyectoDelTorneo = useCallback((num: string): string => {
    const n = parseInt(String(num ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return '';
    const cuenta = new Map<string, number>();
    for (const d of deportistas) {
      if (!torneosDelDeportista(d).includes(n)) continue;
      const p = String(limpiar(getCol(d, /^proyecto$/i)) ?? '');
      if (!p) continue;
      cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    }
    let mejor = '', top = 0;
    cuenta.forEach((v, k) => { if (v > top) { top = v; mejor = k; } });
    return mejor;
  }, [deportistas]);

  /* ── LOS FILTROS ────────────────────────────────────────────────────────────
     Por TORNEO se filtra por la palabra con que arranca el torneo en el cuadro
     —LIGA, ABC, ASOBDIM, LA GRAN MANZANA—, que es como los nombra la
     dirección. La lista de opciones se arma sola con lo que haya programado.
     Por DÍA DE JUEGO se ve un solo día. — dirección, 29/08/2026 */
  const lista = filas ?? [];

  const torneosParaFiltrar = useMemo(() => {
    const set = new Set<string>();
    for (const f of lista) {
      const t = torneoDe(f.torneo_num);
      const nombre = String(limpiar(t?.torneo ?? '') ?? '');
      if (nombre) set.add(nombre.toUpperCase());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [lista, torneoDe]);

  /** LOS PROGRAMAS, tal como están escritos en la columna PROGRAMA del cuadro
   *  de Torneos y Competencias. — dirección, 29/08/2026 */
  const programasParaFiltrar = useMemo(() => {
    const set = new Set<string>();
    for (const t of cuadro ?? []) {
      const n = String(limpiar((t as any).programa ?? '') ?? '').toUpperCase();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [cuadro]);

  /** El cuerpo técnico COMPLETO para el filtro: todos los del cuadro de
   *  Torneos, aunque todavía no tengan ningún partido programado —JIMÉNEZ, por
   *  ejemplo—, más cualquier nombre que ya esté puesto en un renglón y no
   *  aparezca en el cuadro, para no perderlo. — dirección, 29/08/2026 */
  const profesParaFiltrar = useMemo(() => {
    const set = new Set<string>(profesClub);
    for (const f of lista) {
      const a = String(f.dt ?? '').trim().toUpperCase();
      const b = String(f.at ?? '').trim().toUpperCase();
      if (a) set.add(a);
      if (b) set.add(b);
    }
    return [...set].sort((x, y) => x.localeCompare(y, 'es'));
  }, [lista, profesClub]);

  const visibles = useMemo(() => {
    const puesto = new Map<string, number>(ordenMano.map((id, i) => [String(id), i] as [string, number]));
    return lista
      .filter(f => {
        if (filtroDia) {
          const hasta = filtroHasta && filtroHasta >= filtroDia ? filtroHasta : filtroDia;
          if (!f.fecha || f.fecha < filtroDia || f.fecha > hasta) return false;
        }
        if (filtroTorneos.length) {
          const t = torneoDe(f.torneo_num);
          if (!filtroTorneos.some(x => pelar(x) === pelar(t?.torneo))) return false;
        }
        if (filtroProgramas.length) {
          const t: any = torneoDe(f.torneo_num);
          if (!filtroProgramas.some(x => pelar(x) === pelar(t?.programa))) return false;
        }
        /* CUERPO TÉCNICO: vale si figura de D.T o de A.T. */
        if (filtroProfe) {
          const quien = pelar(filtroProfe);
          if (pelar(f.dt) !== quien && pelar(f.at) !== quien) return false;
        }
        return true;
      })
      /* Primero los que se acomodaron a mano, en ese mismo orden; detrás, los
         que no se han tocado, por día de juego. */
      .sort((a, b) => {
        const pa = puesto.get(a.id) ?? 100000;
        const pb = puesto.get(b.id) ?? 100000;
        if (pa !== pb) return pa - pb;
        return (a.fecha || '9999').localeCompare(b.fecha || '9999');
      });
  }, [lista, filtroDia, filtroHasta, filtroTorneos, filtroProgramas, filtroProfe, torneoDe, ordenMano]);

  /** Suelta el renglón que se venía arrastrando encima de otro. */
  function soltarFila(destino: FilaProgramacion) {
    const viene = filaArrastrada.current;
    filaArrastrada.current = '';
    setFilaEncima(''); setFilaMoviendo('');
    if (!viene || viene === destino.id) return;
    const ids = visibles.map(f => f.id);
    const de = ids.indexOf(viene);
    const a  = ids.indexOf(destino.id);
    if (de < 0 || a < 0) return;
    ids.splice(a, 0, ids.splice(de, 1)[0]);
    /* Se guardan TODOS los ids visibles, para que el orden quede completo. */
    guardarOrdenMano(ids);
  }

  /** Acomoda lo que se está viendo del partido MÁS TEMPRANO al más tarde:
   *  primero por día, y dentro del mismo día por la hora de llegada.
   *  — dirección, 29/08/2026 */
  /* EL BOTÓN "ORDENAR POR HORARIO" SE QUITÓ (dirección, 29/08/2026): para la
     imagen manda el orden POR TORNEO, que se ve mucho mejor. La función se
     deja escrita por si algún día se quiere volver a poner el botón. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function ordenarPorHorario() {
    const ids = [...visibles]
      .sort((a, b) => {
        const fa = a.fecha || '9999-99-99';
        const fb = b.fecha || '9999-99-99';
        if (fa !== fb) return fa.localeCompare(fb);
        return minutosDeLaHora(a.hora) - minutosDeLaHora(b.hora);
      })
      .map(f => f.id);
    guardarOrdenMano(ids);
  }

  /* ORDENAR POR TORNEO (dirección, 29/08/2026): agrupa los partidos por
     equipo —todos los de ASOBDIM SUB 8 juntos, después los del SUB 9…— y
     dentro de cada equipo, del más temprano al más tarde. Sirve para armar la
     imagen por equipos en vez de por horario. */
  function ordenarPorTorneo() {
    const ids = [...visibles]
      .sort((a, b) => {
        const na = nombreTorneo(a.torneo_num) || `ZZZ ${a.torneo_num}`;
        const nb = nombreTorneo(b.torneo_num) || `ZZZ ${b.torneo_num}`;
        const cmp = na.localeCompare(nb, 'es');
        if (cmp !== 0) return cmp;
        const fa = a.fecha || '9999-99-99';
        const fb = b.fecha || '9999-99-99';
        if (fa !== fb) return fa.localeCompare(fb);
        return minutosDeLaHora(a.hora) - minutosDeLaHora(b.hora);
      })
      .map(f => f.id);
    guardarOrdenMano(ids);
  }

  const hayOrdenMano = ordenMano.length > 0;

  /** Cómo se pinta un filtro: encendido (blanco) o apagado (transparente). */
  const pintaFiltro = (encendido: boolean) => ({
    /* EN NARANJA (dirección, 29/08/2026): sobre el verde de la barra, el
       naranja canta de lejos y no se confunde con nada más de la pantalla. */
    background: encendido ? AMBAR : 'transparent',
    border: `1px solid ${encendido ? AMBAR : 'rgba(255,255,255,.6)'}`,
    color: '#ffffff',
    height: 32,
  });

  const hayFiltro = !!filtroDia || !!filtroHasta || filtroTorneos.length > 0
    || filtroProgramas.length > 0 || !!filtroProfe;

  /* ── Cambiar una casilla ── */
  function cambiar(id: string, campo: keyof FilaProgramacion, valor: string) {
    setFilas(prev => (prev ?? []).map(f => (f.id === id ? { ...f, [campo]: valor } : f)));
    void guardarPartido(id, { [campo]: valor } as Partial<FilaProgramacion>);
    /* SE VA APRENDIENDO LO QUE SE ESCRIBE (dirección, 29/08/2026): cada rival
       y cada escenario que se escriba queda anotado, y la próxima vez sale
       solo en la listica. Se guarda en este computador. */
    if (campo === 'rival') recordar(LLAVE_RIVALES, valor);
    if (campo === 'escenario') recordar(LLAVE_ESCENARIOS, valor);
  }

  /* ── Agregar un renglón ── */
  async function nuevoRenglon() {
    setError(''); setAviso('');
    try {
      /* NACE CON EL DÍA DEL CUADRO (dirección, 29/08/2026): como la columna
         del día ya no está, si el renglón naciera sin fecha desaparecería de
         una —el cuadro solo muestra los de ese día—. */
      const creada = await agregarPartido({
        ...(filtroDia ? { fecha: filtroDia } : {}),
        /* Y en la FECHA 1A, que después se cambia en la lista. */
        jornada: '1A',
      });
      if (creada) setFilas(prev => [...(prev ?? []), creada]);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo agregar el renglón.');
    }
  }

  /* ── Quitar un renglón ── */
  async function quitarRenglon(f: FilaProgramacion) {
    const quien = [nombreTorneo(f.torneo_num) || `torneo ${f.torneo_num || '—'}`,
                   f.rival ? `vs ${f.rival}` : ''].filter(Boolean).join(' ');
    if (!window.confirm(`¿Quitar de la programación ${quien}?\n\nEsto NO borra el microciclo si ya se creó.`)) return;
    setTrabajando(f.id);
    const ok = await borrarPartido(f.id);
    setTrabajando('');
    if (ok) setFilas(prev => (prev ?? []).filter(x => x.id !== f.id));
    else setError('No se pudo quitar el renglón. Intenta otra vez.');
  }

  /* ── EL BOTÓN: bajar la info al POSPARTIDO ─────────────────────────────────
     La planilla del pospartido se identifica por DOS cosas: el número del
     torneo y la # FECHA. Con eso:

       · Si esa planilla NO existe, se crea con el encabezado lleno y sin
         deportistas: al abrirla, el pospartido arma la lista solo, con los que
         tengan ese torneo asignado en Total Afiliados.
       · Si YA existe, se le actualiza únicamente el encabezado. Lo que el
         formador haya calificado NO se toca.

     — dirección, 29/08/2026 */
  /** MANDA UN PARTIDO. Devuelve si ya tenía deportistas calificados y qué
   *  casillas le faltan a la base. Lo usan el balón de cada renglón y el
   *  botón de MANDAR TODOS. — dirección, 29/08/2026 */
  async function mandarUno(f: FilaProgramacion): Promise<{ teniaFilas: boolean; sacadas: string[] }> {
      /* ¿Ya había algo guardado de ese partido? Se respeta. */
      const antes = await getPlanilla(f.torneo_num, f.jornada);
      const teniaFilas = !!antes && Array.isArray(antes.filas) && antes.filas.length > 0;

      const sacadas = await guardarPlanilla({
        torneo_num:  f.torneo_num,
        jornada:     f.jornada,
        fecha:       f.fecha,
        llegar:      f.hora,
        rival:       f.rival,
        escenario:   f.escenario,
        dt:          f.dt,
        at:          f.at,
        resumen:     antes?.resumen ?? '',
        goles_nos:   antes?.goles_nos ?? '',
        goles_ellos: antes?.goles_ellos ?? '',
        autogoles:   antes?.autogoles ?? '',
        filas:       antes?.filas ?? [],
        definitivo:  antes?.definitivo === true,
        actualizada_en: new Date().toISOString(),
      });

      await guardarPartido(f.id, { microciclo_id: `PP-${f.torneo_num}-${f.jornada}` });
      setFilas(prev => (prev ?? []).map(x => (
        x.id === f.id ? { ...x, microciclo_id: `PP-${f.torneo_num}-${f.jornada}` } : x
      )));

      return { teniaFilas, sacadas };
  }

  async function bajarAPospartido(f: FilaProgramacion) {
    setError(''); setAviso('');
    if (!f.torneo_num) { setError('Primero escribe el número del torneo.'); return; }
    if (!f.jornada) {
      setError('Falta la # FECHA. La planilla del pospartido se guarda por torneo Y fecha: sin ella no se sabe cuál partido es.');
      return;
    }
    setTrabajando(f.id);
    try {
      const { teniaFilas, sacadas } = await mandarUno(f);
      const comoSeLlama = [etiquetaFecha(f.jornada), nombreTorneo(f.torneo_num)]
        .filter(Boolean).join(' ');
      setAviso(
        (teniaFilas
          ? `Ya existía la planilla de ${comoSeLlama}: se le actualizó el encabezado y no se tocó lo calificado.`
          : `Listo: quedó creada la planilla de ${comoSeLlama} en el Banco Post Partido, con día, hora, rival y escenario.`)
        + (sacadas.length
            ? ` (La base todavía no tiene la casilla de ${sacadas.join(', ')}: corre ARREGLAR-LA-BASE.bat.)`
            : ''),
      );
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo crear el pospartido.');
    } finally {
      setTrabajando('');
    }
  }

  /* ── MANDARLOS TODOS DE UNA ────────────────────────────────────────────────
     Lo normal es que un sábado haya veinte partidos y haya que oprimir veinte
     balones. Con este botón se mandan de una sola vez TODOS los que se estén
     viendo —el día, o el puente completo, y con el filtro que esté puesto—.
     Los que ya estaban mandados solo se les refresca el encabezado; lo que el
     formador tenga calificado no se toca. — dirección, 29/08/2026 */
  const [mandandoTodos, setMandandoTodos] = useState(false);
  async function mandarTodos() {
    setError(''); setAviso('');
    const listos = visibles.filter(f => f.torneo_num && f.jornada);
    const incompletos = visibles.length - listos.length;
    if (listos.length === 0) {
      setError('Ninguno de los partidos que se están viendo tiene número de torneo y # FECHA.');
      return;
    }
    if (!window.confirm(
      `Se van a mandar ${listos.length} ${listos.length === 1 ? 'partido' : 'partidos'} al Banco Post Partido.\n\n` +
      'A los que ya estaban mandados solo se les actualiza el encabezado: lo calificado NO se toca.\n\n¿Seguimos?'
    )) return;

    setMandandoTodos(true);
    let hechos = 0, fallaron = 0;
    const faltantes = new Set<string>();
    for (const f of listos) {
      setTrabajando(f.id);
      try {
        const r = await mandarUno(f);
        r.sacadas.forEach(c => faltantes.add(c));
        hechos++;
      } catch { fallaron++; }
    }
    setTrabajando('');
    setMandandoTodos(false);
    setAviso(
      `Listo: ${hechos} ${hechos === 1 ? 'partido quedó' : 'partidos quedaron'} en el Banco Post Partido.`
      + (fallaron ? ` ${fallaron} no se pudieron mandar; intenta otra vez.` : '')
      + (incompletos ? ` (${incompletos} se saltaron porque les falta el torneo o la # FECHA.)` : '')
      + (faltantes.size ? ` (A la base le faltan las casillas de ${[...faltantes].join(', ')}.)` : ''),
    );
  }

  /* ── LA IMAGEN PARA COMPARTIR ──────────────────────────────────────────────
     Una sola imagen con lo que se esté viendo en el cuadro (respeta el filtro
     de torneo y de día). Va con el fondo degradado de NEGRO a VERDE, como la
     tarjeta de cumpleaños, y encima de los datos un encabezado VERDE con la
     letra blanca: HORARIO · FECHA · DÍA DE PARTIDO · RIVAL · ESCENARIO.
     Los partidos van agrupados por torneo, con su nombre arriba.
     — dirección, 29/08/2026 */

  /** Corta un texto que no quepa y le pone puntos suspensivos. */
  function recortar(ctx: CanvasRenderingContext2D, txt: string, ancho: number): string {
    let t = String(txt ?? '');
    if (ctx.measureText(t).width <= ancho) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > ancho) t = t.slice(0, -1);
    return t + '…';
  }

  async function armarImagen() {
    setError(''); setAviso('');
    if (visibles.length === 0) {
      setError('No hay partidos para armar la imagen. Quita el filtro o agrega partidos.');
      return;
    }
    setArmandoImg(true);
    try {
      /* Los partidos, agrupados por torneo y en orden de fecha. */
      const grupos = new Map<string, FilaProgramacion[]>();
      for (const f of visibles) {
        const k = f.torneo_num || '—';
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k)!.push(f);
      }

      /* MEDIDAS PARA QUE QUEPA EN UN CELULAR (dirección, 29/08/2026).
         Antes el encabezado verde —HORARIO · FECHA · RIVAL · ESCENARIO— se
         repetía en cada torneo. Con nueve partidos de nueve torneos distintos
         eso son nueve encabezados, y la imagen salía larguísima: tocaba
         deslizar y deslizar para verla.
         Ahora el encabezado va UNA sola vez, arriba, y cada partido queda en
         un renglón delgado con el nombre de su torneo encima. Entre partido y
         partido va una rayita corta en la mitad, en vez de un hueco grande. */
      const W = 1080, M = 44;
      /* El color de esta imagen, según el programa filtrado. */
      const COLOR = colorDelPrograma(filtroProgramas);
      /* El encabezado crece un renglón cuando hay un torneo filtrado. */
      const nombresTorneos = [...filtroProgramas, ...filtroTorneos].join('  ·  ').toUpperCase();
      const ALTO_TIT = nombresTorneos ? 184 : 142;
      const ALTO_CABEZA = 50;
      const ALTO_PIE = 88;

      /* TODAS LAS IMÁGENES DEL MISMO TAMAÑO (dirección, 29/08/2026).
         Antes la hoja crecía o se encogía según cuántos partidos hubiera: una
         de un solo juego salía chiquita y una de doce salía larguísima, y al
         mandarlas por WhatsApp se veían de tamaños distintos. Ahora la hoja
         SIEMPRE mide lo mismo —1080 × 1350, la proporción de un celular— y
         los partidos se reparten parejo adentro:

           · Si sobra campo, el sobrante se reparte por igual entre los
             torneos, así que quedan equidistantes y sin huecos feos.
           · Si no cabe, todo se achica al tiempo —renglones y letra— hasta
             que quepa, sin que se salga nada. */
      let H = 1350;

      const T_TORNEO = 42;          // alto normal del nombre del torneo
      const T_FILA   = 46;          // alto normal de cada partido
      const T_HUECO  = 22;          // el huequito con la rayita

      const disponible = H - ALTO_TIT - ALTO_CABEZA - ALTO_PIE;
      let natural = 0;
      grupos.forEach(g => { natural += T_TORNEO + g.length * T_FILA + T_HUECO; });

      /* Cuánto hay que achicar para que quepa (1 = no se achica nada). */
      const k = natural > disponible ? Math.max(0.62, disponible / natural) : 1;
      const ALTO_TORNEO = Math.round(T_TORNEO * k);
      const ALTO_FILA   = Math.round(T_FILA   * k);
      const HUECO       = Math.round(T_HUECO  * k);
      /** Para que la letra se achique al mismo paso que los renglones. */
      const L = (tam: number) => Math.round(tam * k);

      /* Lo que sobre se reparte por igual: un pedacito antes de cada torneo y
         otro al final, para que queden equidistantes. */
      let usado = 0;
      grupos.forEach(g => { usado += ALTO_TORNEO + g.length * ALTO_FILA + HUECO; });
      /* Si ni achicando cabe —de unos quince partidos en adelante—, la hoja
         se alarga lo justo. Es preferible una hoja más larga a que se salgan
         los partidos por debajo. */
      if (usado > disponible) H = ALTO_TIT + ALTO_CABEZA + ALTO_PIE + usado;
      const sobra = Math.max(0, (H - ALTO_TIT - ALTO_CABEZA - ALTO_PIE) - usado);
      const AIRE = grupos.size > 0 ? sobra / (grupos.size + 1) : 0;

      const lienzo = document.createElement('canvas');
      lienzo.width = W; lienzo.height = H;
      const ctx = lienzo.getContext('2d')!;

      /* Fondo: negro arriba, verde abajo. */
      /* EL FONDO SE QUEDA OSCURO (dirección, 29/08/2026). Antes el degradado
         terminaba en verde pleno, y cuando había muchos partidos la mitad de
         abajo quedaba toda verde: los encabezados verdes se perdían y no se
         leía nada. Ahora baja de negro a verde MUY oscuro, así que la imagen
         se ve pareja de arriba abajo, como se veía la parte de arriba. */
      const fondo = ctx.createLinearGradient(0, 0, 0, H);
      fondo.addColorStop(0, '#000000');
      fondo.addColorStop(0.55, '#02180F');
      fondo.addColorStop(1, '#063A20');
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, W, H);

      /* Título */
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px Arial, sans-serif';
      /* EL TORNEO NO VA AQUÍ ARRIBA (dirección, 29/08/2026): se probó al lado
         de "PROGRAMACIÓN OFICIAL", pero cuando se filtran dos o tres torneos
         no cabe. Cada torneo ya tiene su propio título abajo, en verde,
         encima de sus partidos: ahí es donde se lee bien. */
      ctx.fillText('PROGRAMACIÓN OFICIAL', M, 50);

      /* EL ENCABEZADO VA EN TRES RENGLONES (dirección, 29/08/2026):
           1) PROGRAMACIÓN OFICIAL — blanco
           2) el torneo, ASOBDIM     — verde
           3) los días, SAB 29 / DOM 30 — blanco  */
      let yLinea = 88;
      if (nombresTorneos) {
        /* DEL MISMO TAMAÑO DE "PROGRAMACIÓN OFICIAL" (dirección, 29/08/2026):
           el programa es el que manda en la imagen, va parejo con el título. */
        ctx.fillStyle = COLOR.letra;
        ctx.font = '900 34px Arial, sans-serif';
        ctx.fillText(recortar(ctx, nombresTorneos, 660), M, yLinea);
        yLinea += 40;
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 25px Arial, sans-serif';
      const diasConPartido = visibles.map(f => f.fecha).filter(Boolean);
      const textoDias = tituloDias(filtroDia, filtroHasta, diasConPartido);
      ctx.fillText(recortar(ctx, textoDias, 620), M, yLinea);
      const xPie = M + Math.min(ctx.measureText(textoDias).width, 620) + 18;

      ctx.font = '700 17px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      const pie = [
        filtroProfe || '',
        `${visibles.length} ${visibles.length === 1 ? 'partido' : 'partidos'}`,
      ].filter(Boolean).join('   ·   ');
      ctx.fillText(pie.toUpperCase(), xPie, yLinea + 2);

      /* El logo, si carga. Si no, no pasa nada. */
      try {
        const logo = await new Promise<HTMLImageElement>((ok, mal) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = () => mal(new Error('sin logo'));
          i.src = '/MAX%2010.png';
        });
        const alto = 50, ancho = (logo.width / logo.height) * alto;
        ctx.drawImage(logo, W - M - ancho, 34, ancho, alto);
        /* EL LEMA DEBAJO DEL LOGO (dirección, 29/08/2026): en la imagen que se
           comparte también va, igual que en la pantalla. */
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.font = '700 13px Arial, sans-serif';
        /* Centrado con el logo, no con el borde de la hoja. */
        ctx.fillText('CONECTA · GESTIONA · GANA', W - M - ancho / 2, 34 + alto + 13);
        ctx.restore();
      } catch { /* sin logo */ }

      /* LAS COLUMNAS, CON EL MISMO DISEÑO DEL CUADRO (dirección, 29/08/2026).
         Cada título va en su propia casilla verde redondeada, con su espacio
         entre una y otra —igual que en la pantalla de Programación—, y el
         partido va en una franja gris redondeada. El orden también es el
         mismo del cuadro: primero el ESCENARIO y después el RIVAL. */
      const ANCHO = W - M * 2;
      const HUECO_COL = 8;

      /* Con un solo día la columna del DÍA sobra —el día ya está arriba, en
         el título—; con un puente sí se necesita. */
      const unSoloDia = !!filtroDia && (!filtroHasta || filtroHasta <= filtroDia);
      /* SIN LA COLUMNA "# FECHA" (dirección, 29/08/2026): mientras todos los
         partidos nazcan en la FECHA 1A, ese dato todavía no es de fiar y
         confunde al que lea la imagen. Adentro de la plataforma sí se sigue
         viendo y sigue viajando al post partido; es solo en la imagen. */
      const COLS = unSoloDia
        ? [
            { t: 'LLEGAR',    w: 160 },
            { t: 'ESCENARIO', w: 380 },
            { t: 'RIVAL',     w: ANCHO - 2 * HUECO_COL - 160 - 380 },
          ]
        : [
            /* El DÍA con espacio de sobra: "SAB 29 AGO" no se puede cortar. */
            { t: 'LLEGAR',    w: 150 },
            { t: 'DÍA',       w: 170 },
            { t: 'ESCENARIO', w: 300 },
            { t: 'RIVAL',     w: ANCHO - 3 * HUECO_COL - 150 - 170 - 300 },
          ];

      /** Dónde arranca cada columna. */
      const equis: number[] = [];
      { let acc = M; for (const c of COLS) { equis.push(acc); acc += c.w + HUECO_COL; } }

      /** Un recuadro con las esquinas redondas. */
      const caja = (x: number, yy: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') (ctx as any).roundRect(x, yy, w, h, r);
        else {
          ctx.moveTo(x + r, yy);
          ctx.arcTo(x + w, yy, x + w, yy + h, r);
          ctx.arcTo(x + w, yy + h, x, yy + h, r);
          ctx.arcTo(x, yy + h, x, yy, r);
          ctx.arcTo(x, yy, x + w, yy, r);
        }
        ctx.closePath();
        ctx.fill();
      };

      /* LOS ESCUDOS DE WONDER Y REGOL (dirección, 29/08/2026): van SOLO en el
         pie de la imagen, al lado del nombre de la academia. Se buscan en la
         carpeta public con estos nombres: /wonder.png y /regol.png. Si alguno
         no está, sencillamente no sale y no se daña nada. */
      const traerLogo = (ruta: string) => new Promise<HTMLImageElement | null>(ok => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => ok(null);
        i.src = ruta;
      });
      /* LA MASCOTA (dirección, 29/08/2026): va en /mascota.png, arriba a la
         derecha del título, con los pies apoyados en la franja verde de los
         títulos. Si el archivo no está, la imagen sale igual, sin ella. */
      const [logoRegol, logoWonder, mascota] = await Promise.all([
        traerLogo('/regol.png'),
        traerLogo('/wonder.png'),
        traerLogo('/mascota.png'),
      ]);

      /** EL GOTERÓN ROJO DE UBICACIÓN, para el escenario. — 29/08/2026 */
      const dibujarPin = (cx: number, cy: number) => {
        const r = 6.2;
        ctx.save();
        ctx.fillStyle = '#E5484D';
        ctx.beginPath();
        ctx.arc(cx, cy - 2.5, r, Math.PI, 0);            // la cabecita redonda
        ctx.lineTo(cx, cy + 9.5);                         // la punta de abajo
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.55)';                // el huequito del centro
        ctx.beginPath();
        ctx.arc(cx, cy - 3, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      /** EL BALÓN, para el rival. */
      const dibujarBalon = (cx: number, cy: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy + 1, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = '#1b2333';
        ctx.beginPath();                                  // el pentágono del centro
        for (let p = 0; p < 5; p++) {
          const a = -Math.PI / 2 + (p * 2 * Math.PI) / 5;
          const px = cx + Math.cos(a) * 3.4;
          const py = cy + 1 + Math.sin(a) * 3.4;
          if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      let y = ALTO_TIT;

      /* LOS TÍTULOS, CADA UNO EN SU CASILLA VERDE, UNA SOLA VEZ ARRIBA.
         La primera dice LLEGAR —no "horario"—: es la hora a la que hay que
         estar en la cancha, no la del pitazo. — dirección, 29/08/2026 */
      ctx.font = '900 22px Arial, sans-serif';
      COLS.forEach((c, k) => {
        ctx.fillStyle = COLOR.caja;
        caja(equis[k], y, c.w, ALTO_CABEZA, 9);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(recortar(ctx, c.t, c.w - 16), equis[k] + c.w / 2, y + ALTO_CABEZA / 2);
        ctx.textAlign = 'left';
      });
      y += ALTO_CABEZA;

      /* LA MASCOTA, encima de la franja verde. Va a la derecha del título y
         no tapa ni el nombre del club, ni el MAX 10, ni ningún dato: queda en
         el espacio vacío que hay entre los dos. */
      if (mascota) {
        /* MÁS GRANDE (dirección, 29/08/2026): los pies le llegan hasta donde
           arranca el primer renglón de partidos. La cabeza queda en el mismo
           sitio de siempre —crece hacia abajo, no hacia arriba—, así que
           sigue sin tapar el título ni el MAX 10. */
        const pies = y + 12 + ALTO_TORNEO;
        const altoMas = 232 + ALTO_TORNEO;
        const ancMas = (mascota.width / mascota.height) * altoMas;
        /* Justo en la juntura entre ESCENARIO y RIVAL, no "más o menos ahí":
           se calcula sola, así queda igual de centrada con cualquier reparto
           de columnas. — dirección, 29/08/2026 */
        const juntura = equis[COLS.length - 1] - HUECO_COL / 2;
        ctx.drawImage(mascota, juntura - ancMas / 2, pies - altoMas, ancMas, altoMas);
      }

      const cuantosGrupos = grupos.size;
      let vaGrupo = 0;

      grupos.forEach((partidos, num) => {
        vaGrupo++;
        y += AIRE;                       // el reparto parejo

        /* NUESTRO EQUIPO EN BLANCO Y EL RIVAL EN VERDE (dirección,
           29/08/2026): así se distingue de una quién es quién. */
        ctx.fillStyle = '#ffffff';
        /* NUESTRO EQUIPO, MÁS GRANDE (dirección, 29/08/2026): es el nombre
           que importa, va encima de sus partidos. */
        ctx.font = `900 ${L(25)}px Arial, sans-serif`;
        const titulo = (nombreTorneo(num) || `TORNEO ${num}`).toUpperCase();
        ctx.fillText(recortar(ctx, titulo, ANCHO - 26), M + 13, y + ALTO_TORNEO / 2 + 2);
        y += ALTO_TORNEO;

        /* Los partidos */
        partidos.forEach((f, i) => {
          /* CADA DATO EN SU PROPIA CASILLA (dirección, 29/08/2026): igual que
             en el cuadro de Programación, el renglón no es un solo bloque
             gris sino una casilla por columna, gris en transparencia y con
             las esquinas redondas, justo debajo de su título verde. */
          COLS.forEach((c, k) => {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(60,71,89,.55)' : 'rgba(60,71,89,.34)';
            caja(equis[k], y, c.w, ALTO_FILA - 4, 9);
          });

          const datos = unSoloDia
            ? [
                horaBonita(f.hora) || '—',
                (f.escenario || '—').toUpperCase(),
                (f.rival || '—').toUpperCase(),
              ]
            : [
                horaBonita(f.hora) || '—',
                diaBonito(f.fecha) || '—',
                (f.escenario || '—').toUpperCase(),
                (f.rival || '—').toUpperCase(),
              ];
          const cualRival = datos.length - 1;
          const cualEscenario = datos.length - 2;
          /* El día va en VERDE, para que salte a la vista de cuál día es cada
             partido cuando la imagen es de un puente. */
          const cualDia = unSoloDia ? -1 : 1;
          datos.forEach((d, k) => {
            const medio = y + (ALTO_FILA - 4) / 2;
            /* EL GOTERÓN ROJO ANTES DEL ESCENARIO Y EL BALÓN ANTES DEL RIVAL
               (dirección, 29/08/2026): se entiende de una qué es cada cosa,
               sin tener que leer el título. */
            let sangria = 11;
            if (k === cualEscenario) { dibujarPin(equis[k] + 17, medio); sangria = 30; }
            if (k === cualRival)     { dibujarBalon(equis[k] + 17, medio); sangria = 30; }

            /* La hora, el día y el rival, del color del programa; el
               escenario en blanco. — dirección, 29/08/2026 */
            ctx.fillStyle = (k === 0 || k === cualDia || k === cualRival)
              ? COLOR.letra : '#ffffff';
            /* La hora, el día y el rival, más grandes: es lo que primero busca
               un papá. */
            ctx.font = (k === 0 || k === cualRival || k === cualDia)
              ? `900 ${L(19)}px Arial, sans-serif`
              : `700 ${L(17)}px Arial, sans-serif`;
            ctx.fillText(recortar(ctx, d, COLS[k].w - sangria - 9), equis[k] + sangria, medio);
          });
          y += ALTO_FILA;
        });

        /* LA RAYITA (dirección, 29/08/2026): un pedacito corto en toda la
           mitad, no una línea de lado a lado. Separa sin hacer ruido. */
        if (vaGrupo < cuantosGrupos) {
          ctx.fillStyle = COLOR.letra + '73';   // el mismo color, apagadito
          ctx.fillRect(W / 2 - 90, y + HUECO / 2 - 1, 180, 2);
        }
        y += HUECO;
      });

      /* Pie */
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      /* EL PIE (dirección, 29/08/2026): el escudo de WONDER a la izquierda,
         el de REGOL a la derecha y, en la mitad, el nombre de la academia en
         letra más pequeña. Si un escudo no está guardado, sencillamente no
         sale y el nombre queda igual de centrado. */
      {
        const medioPie = H - ALTO_PIE / 2 - 4;
        const altoEsc = 44;
        if (logoWonder) {
          const anc = (logoWonder.width / logoWonder.height) * altoEsc;
          ctx.drawImage(logoWonder, M, medioPie - altoEsc / 2, anc, altoEsc);
        }
        if (logoRegol) {
          const anc = (logoRegol.width / logoRegol.height) * altoEsc;
          ctx.drawImage(logoRegol, W - M - anc, medioPie - altoEsc / 2, anc, altoEsc);
        }
        ctx.font = '900 22px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('ACADEMIA DE FÚTBOL FUTURO ANTIOQUIA', W / 2, medioPie);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      setImagen(lienzo.toDataURL('image/png'));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo armar la imagen.');
    } finally {
      setArmandoImg(false);
    }
  }

  function bajarImagen() {
    if (!imagen) return;
    const nombre = [
      'PROGRAMACION OFICIAL',
      tituloDias(filtroDia, filtroHasta, visibles.map(f => f.fecha)),
      [...filtroProgramas, ...filtroTorneos].join(' '),
      filtroProfe || '',
    ].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]/g, ' ').trim();
    const a = document.createElement('a');
    a.href = imagen;
    a.download = `${nombre || 'PROGRAMACION'}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ── Permisos ── */
  if (puedeEntrar === null) {
    return <div className="min-h-screen" style={{ background: LIENZO }} />;
  }
  if (!puedeEntrar) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: LIENZO }}>
        <div className="rounded-2xl p-6 max-w-[440px] text-center"
             style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: AMBAR }} />
          <h1 className="text-white font-black text-[16px] mb-2">SOLO ADMINISTRACIÓN</h1>
          <p className="text-white/60 text-[13px] font-semibold leading-relaxed">
            La programación de competencia la maneja la dirección.
          </p>
          <button onClick={() => router.push('/dashboard')}
            className="mt-4 rounded-xl px-4 py-2.5 text-white font-black text-[12px]"
            style={{ background: VERDE }}>
            VOLVER
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen pb-16" style={{ background: LIENZO }}>

      {/* ── Encabezado ── */}
      <header
        className="px-4 py-3 flex flex-wrap items-center gap-3"
        style={{ background: 'linear-gradient(to right, #333F50, #0EA142)' }}>
        <button onClick={() => router.push('/dashboard')}
          title="Volver"
          className="shrink-0 rounded-lg p-2 transition hover:opacity-80"
          style={{ background: 'rgba(255,255,255,.16)' }}>
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-[15px] sm:text-base leading-tight">
            Programación de Competencia
          </h1>
          <p className="text-white/70 text-[11px] font-semibold leading-tight">
            Qué se juega, cuándo y dónde. De aquí salen los post partidos.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          {/* SE VE POCO Y ES EL LEMA DEL CLUB (dirección, 29/08/2026): iba en
              letra de 8 y casi transparente. Se sube el tamaño y el brillo. */}
          <p className="text-white/80 text-[9.5px] font-semibold tracking-wide mt-0.5 text-right leading-tight">
            CONECTA · GESTIONA · GANA
          </p>
        </div>
      </header>

      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1550 }}>

        {error && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
               style={{ background: 'rgba(192,80,77,.18)', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
            <p className="text-white text-[12.5px] font-semibold leading-relaxed">{error}</p>
          </div>
        )}
        {aviso && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
               style={{ background: 'rgba(0,176,80,.16)', border: `1px solid ${VERDE}` }}>
            <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#5BE39B' }} />
            <p className="text-white text-[12.5px] font-semibold leading-relaxed">{aviso}</p>
          </div>
        )}
        {faltaTabla && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
               style={{ background: 'rgba(224,163,58,.14)', border: `1px solid ${AMBAR}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBAR }} />
            <p className="text-white text-[12.5px] font-semibold leading-relaxed">{FALTA_TABLA_PROG}</p>
          </div>
        )}

        {/* ── EL ENCABEZADO VERDE, CON LOS FILTROS ── */}
        <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3"
             style={{ background: 'linear-gradient(to right, #05502A, #00B050)' }}>
          <CalendarDays className="w-5 h-5 text-white shrink-0" />
          <div className="min-w-0">
            <h2 className="text-white font-black text-[15px] tracking-wide leading-tight">
              PROGRAMACIÓN OFICIAL
            </h2>
            <p className="text-white/75 text-[11px] font-semibold">
              {visibles.length} {visibles.length === 1 ? 'partido' : 'partidos'}
            </p>
          </div>

          {/* Los filtros */}
          {/* SE VE CUÁL FILTRO ESTÁ PUESTO (dirección, 29/08/2026): son varios
              y uno se perdía sin saber por dónde estaba filtrando. El que está
              trabajando se pone BLANCO con la letra verde oscura; el que no,
              queda transparente con el borde blanco, como estaban todos. */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {/* TORNEOS: DE CHULOS (dirección, 29/08/2026). Se pueden marcar
                varios —dos, tres, cinco— y la imagen sale con todos ellos. */}
            <div className="relative">
              <button
                onClick={() => setAbriTorneos(v => !v)}
                title="Marca los torneos que quieres ver. Puedes marcar varios."
                className="rounded-lg px-2.5 flex items-center gap-1.5 text-[11.5px] font-black"
                style={pintaFiltro(filtroTorneos.length > 0)}>
                {filtroTorneos.length === 0
                  ? 'TODOS LOS TORNEOS'
                  : filtroTorneos.length === 1
                    ? filtroTorneos[0]
                    : `${filtroTorneos.length} TORNEOS`}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {abriTorneos && (
                <>
                  {/* Un vidrio invisible: al hacer clic por fuera, se cierra. */}
                  <div className="fixed inset-0 z-40" onClick={() => setAbriTorneos(false)} />
                  <div className="absolute left-0 mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
                       style={{ background: PANEL, border: `1px solid ${BORDE}`, minWidth: 250, maxHeight: 340, overflowY: 'auto' }}>
                    <button
                      onClick={() => { setFiltroTorneos([]); setAbriTorneos(false); }}
                      className="w-full text-left px-3 py-2 text-white text-[11.5px] font-black hover:brightness-125"
                      style={{ background: filtroTorneos.length === 0 ? VERDE : 'transparent' }}>
                      TODOS LOS TORNEOS
                    </button>
                    {torneosParaFiltrar.map(t => {
                      const marcado = filtroTorneos.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setFiltroTorneos(prev =>
                            prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                          className="w-full text-left px-3 py-2 flex items-center gap-2
                            text-white text-[11.5px] font-bold hover:brightness-125"
                          style={{ background: marcado ? 'rgba(0,176,80,.22)' : 'transparent' }}>
                          <span className="shrink-0 rounded flex items-center justify-center"
                                style={{ width: 15, height: 15,
                                         background: marcado ? VERDE : 'transparent',
                                         border: `1px solid ${marcado ? VERDE : BORDE}` }}>
                            {marcado && <Check className="w-3 h-3 text-white" />}
                          </span>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* PROGRAMAS: DE CHULOS TAMBIÉN (dirección, 29/08/2026). Se pueden marcar
                varios. Los programas salen del cuadro de Torneos y Competencias. */}
            <div className="relative">
              <button
                onClick={() => setAbriProgramas(v => !v)}
                title="Marca los programas que quieres ver. Puedes marcar varios."
                className="rounded-lg px-2.5 flex items-center gap-1.5 text-[11.5px] font-black"
                style={pintaFiltro(filtroProgramas.length > 0)}>
                {filtroProgramas.length === 0
                  ? 'TODOS LOS PROGRAMAS'
                  : filtroProgramas.length === 1
                    ? filtroProgramas[0]
                    : `${filtroProgramas.length} PROGRAMAS`}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {abriProgramas && (
                <>
                  {/* Un vidrio invisible: al hacer clic por fuera, se cierra. */}
                  <div className="fixed inset-0 z-40" onClick={() => setAbriProgramas(false)} />
                  <div className="absolute left-0 mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
                       style={{ background: PANEL, border: `1px solid ${BORDE}`, minWidth: 250, maxHeight: 340, overflowY: 'auto' }}>
                    <button
                      onClick={() => { setFiltroProgramas([]); setAbriProgramas(false); }}
                      className="w-full text-left px-3 py-2 text-white text-[11.5px] font-black hover:brightness-125"
                      style={{ background: filtroProgramas.length === 0 ? VERDE : 'transparent' }}>
                      TODOS LOS PROGRAMAS
                    </button>
                    {programasParaFiltrar.map(t => {
                      const marcado = filtroProgramas.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setFiltroProgramas(prev =>
                            prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                          className="w-full text-left px-3 py-2 flex items-center gap-2
                            text-white text-[11.5px] font-bold hover:brightness-125"
                          style={{ background: marcado ? 'rgba(0,176,80,.22)' : 'transparent' }}>
                          <span className="shrink-0 rounded flex items-center justify-center"
                                style={{ width: 15, height: 15,
                                         background: marcado ? VERDE : 'transparent',
                                         border: `1px solid ${marcado ? VERDE : BORDE}` }}>
                            {marcado && <Check className="w-3 h-3 text-white" />}
                          </span>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <select
              value={filtroProfe}
              onChange={e => setFiltroProfe(e.target.value)}
              title="Ver los partidos donde esa persona va de D.T o de A.T"
              style={pintaFiltro(!!filtroProfe)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>CUERPO TÉCNICO</option>
              {profesParaFiltrar.map(p => (
                <option key={p} value={p} title={p} style={{ color: '#111827', backgroundColor: 'white' }}>
                  {p}
                </option>
              ))}
            </select>

            {/* DE QUÉ DÍA ES ESTE CUADRO. Cambiando aquí el día, cambia toda
                la programación que se ve y el título de arriba. */}
            <input
              type="date"
              value={filtroDia}
              onChange={e => setFiltroDia(e.target.value)}
              title="De qué día es esta programación"
              style={{ ...pintaFiltro(!!filtroDia), colorScheme: 'dark' }}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer" />

            {/* HASTA QUÉ DÍA. Se deja vacío para un solo día; se llena para
                agarrar un fin de semana o un puente completo en una sola
                imagen. — dirección, 29/08/2026 */}
            <span className="text-white/70 text-[11px] font-black">HASTA</span>
            <input
              type="date"
              value={filtroHasta}
              min={filtroDia || undefined}
              disabled={!filtroDia}
              onChange={e => setFiltroHasta(e.target.value)}
              title="Hasta qué día. Déjalo vacío si es un solo día."
              style={{ ...pintaFiltro(!!filtroHasta), colorScheme: 'dark' }}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer disabled:opacity-40" />

            <button
              onClick={() => { setFiltroHasta(''); setFiltroDia(filtroDia ? '' : hoyISO()); }}
              title={filtroDia
                ? 'Ver todos los partidos, de todos los días'
                : 'Volver a la programación de hoy'}
              className="rounded-lg px-2.5 h-8 flex items-center text-white text-[11px] font-black"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)' }}>
              {filtroDia ? 'TODOS LOS DÍAS' : 'HOY'}
            </button>

            <button
              onClick={ordenarPorTorneo}
              disabled={visibles.length < 2}
              title="Agrupa los partidos por equipo, y dentro de cada equipo por horario"
              className="rounded-lg px-2.5 flex items-center text-[11px] font-black disabled:opacity-45"
              /* SE QUEDA NARANJA MIENTRAS EL ORDEN ESTÉ PUESTO (dirección,
                 29/08/2026): así se sabe que el cuadro está agrupado por
                 torneo, aunque después se filtre otra cosa. Se apaga con
                 ORDEN NORMAL. */
              style={pintaFiltro(hayOrdenMano)}>
              ORDENAR POR TORNEO
            </button>

            {hayOrdenMano && (
              <button
                onClick={() => guardarOrdenMano([])}
                title="Devolver los renglones a su orden por día de juego"
                className="rounded-lg px-2.5 h-8 flex items-center text-white text-[11px] font-black"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)' }}>
                ORDEN NORMAL
              </button>
            )}

            {hayFiltro && (
              <button
                onClick={() => { setFiltroTorneos([]); setFiltroProgramas([]); setFiltroDia(''); setFiltroHasta(''); setFiltroProfe(''); }}
                title="Quitar los filtros"
                className="rounded-lg px-2.5 h-8 flex items-center gap-1 text-white text-[11px] font-black"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)' }}>
                <X className="w-3.5 h-3.5" /> VER TODOS
              </button>
            )}

            <button
              onClick={armarImagen}
              disabled={cargando || armandoImg || visibles.length === 0}
              title="Armar la imagen para compartir con lo que se está viendo"
              className="rounded-lg px-3 h-8 flex items-center gap-1.5 transition hover:brightness-125 disabled:opacity-50"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)' }}>
              {armandoImg
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                : <IconoImagen className="w-3.5 h-3.5 text-white" />}
              <span className="text-white text-[11px] font-black">
                {armandoImg ? 'ARMANDO…' : 'VER IMAGEN'}
              </span>
            </button>

            <button
              onClick={nuevoRenglon}
              disabled={cargando || faltaTabla}
              title="Agregar un partido a la programación"
              className="rounded-lg px-3 h-8 flex items-center gap-1.5 transition hover:brightness-125 disabled:opacity-50"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)' }}>
              <Plus className="w-3.5 h-3.5 text-white" />
              <span className="text-white text-[11px] font-black">AGREGAR PARTIDO</span>
            </button>
          </div>
        </div>

        {/* ── EL CUADRO ────────────────────────────────────────────────────
            OJO CON EL FONDO (dirección, 29/08/2026): aquí NO va el recuadro
            gris claro. Cada renglón lleva su propia caja gris oscura con los
            datos, y los dos botones quedan por FUERA de esa caja, sobre el
            fondo de la pantalla. Si se le pone un recuadro a todo el bloque,
            los botones vuelven a quedar encerrados. */}
        {/* EL TÍTULO DEL DÍA (dirección, 29/08/2026).
            Va en el fondo oscuro que separa el encabezado verde del cuadro,
            centrado: "PROGRAMACIÓN OFICIAL" en blanco y el día en verde. Es
            el que le dice a cualquiera —y a la imagen que se comparte— de qué
            día es esta programación. */}
        <div className="pt-7 pb-5 text-center">
          <h3 className="font-black tracking-wide leading-tight text-[17px] sm:text-[20px]">
            <span className="text-white">PROGRAMACIÓN OFICIAL</span>
            {(filtroProgramas.length > 0 || filtroTorneos.length > 0) && (
              <span style={{ color: '#5BE39B' }}>
                {' '}{[...filtroProgramas, ...filtroTorneos].join(' · ').toUpperCase()}
              </span>
            )}
            <span className="text-white">
              {' '}{tituloDias(filtroDia, filtroHasta, visibles.map(f => f.fecha))}
            </span>
          </h3>
        </div>

        {/* LAS DOS LISTICAS DEL BUSCADOR. No se ven: son las que el navegador
            abre debajo de la casilla cuando se escribe. */}
        <datalist id="memoria-escenarios">
          {memoriaEscenarios.map(v => <option key={v} value={v} />)}
        </datalist>
        <datalist id="memoria-rivales">
          {memoriaRivales.map(v => <option key={v} value={v} />)}
        </datalist>

        <div className="pt-3">
          {cargando ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white/50" />
              <span className="text-white/50 text-[12px] font-semibold">Abriendo la programación…</span>
            </div>
          ) : lista.length === 0 ? (
            <p className="text-white/40 text-[12px] font-semibold text-center py-6">
              Todavía no hay partidos programados. Oprime AGREGAR PARTIDO.
            </p>
          ) : visibles.length === 0 ? (
            <p className="text-white/40 text-[12px] font-semibold text-center py-6">
              Ningún partido cumple con ese filtro. Oprime VER TODOS.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: ANCHO_MINIMO }}>

                {/* LOS TÍTULOS, EN CASILLAS VERDES (dirección, 29/08/2026).
                    Van del mismo tamaño y en el mismo sitio que las casillas de
                    abajo —el mismo reparto de columnas, el mismo alto, el mismo
                    borde redondo—, pero en verde con la letra blanca. Así cada
                    título queda justo encima de su dato.
                    El borde transparente es para que arranquen en el mismo
                    milímetro que el recuadro de los renglones, que sí lleva
                    borde. */}
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ width: 38 }} className="shrink-0" />
                  <div className="flex-1 grid gap-2 px-3 py-1.5"
                       style={{ gridTemplateColumns: COLUMNAS, border: '1px solid transparent' }}>
                    {['TORNEO #', '# FECHA', 'TORNEO', 'HORA DE LLEGADA', 'ESCENARIO',
                      'RIVAL', 'D.T', 'A.T'].map(t => (
                      <div key={t}
                        title={t}
                        className="rounded-lg px-2 flex items-center justify-center
                          text-white text-[10.5px] font-black uppercase tracking-wide
                          whitespace-nowrap overflow-hidden"
                        style={{ background: VERDE, height: 30 }}>
                        {t}
                      </div>
                    ))}
                  </div>
                  {/* Encima del balón, en letra chiquita, para que se sepa qué
                      hace ese botón sin tener que pararle el mouse encima.
                      — dirección, 29/08/2026 */}
                  {/* MANDARLOS TODOS, PERO CHIQUITO Y EN SU SITIO (dirección,
                      29/08/2026): en la barra verde, grande, era peligroso —se
                      oprimía sin querer—. Aquí queda justo encima de la columna
                      de los balones, que es lo que hace, y pide confirmación. */}
                  <button
                    onClick={mandarTodos}
                    disabled={cargando || mandandoTodos || visibles.length === 0}
                    title="Crear el post partido de TODOS los partidos que se están viendo"
                    style={{ width: 38, background: '#20293a', border: `1px solid ${BORDE}` }}
                    className="shrink-0 rounded-lg py-1 flex flex-col items-center justify-center gap-0.5
                      transition hover:brightness-125 disabled:opacity-45">
                    {mandandoTodos
                      ? <Loader2 className="w-3 h-3 animate-spin text-white" />
                      : <BalonFutbol className="w-3 h-3" color="#ffffff" />}
                    <span className="text-white/60 text-[6.5px] font-black uppercase leading-none tracking-tight">
                      Todos
                    </span>
                  </button>
                  <span style={{ width: 38 }} className="shrink-0" />
                </div>

                {/* Los renglones */}
                <div className="flex flex-col gap-1.5">
                  {visibles.map(f => {
                    const t = torneoDe(f.torneo_num);
                    const yaEsta = !!f.microciclo_id;
                    const ocupado = trabajando === f.id;
                    return (
                      <div key={f.id}
                        className="flex items-center gap-2"
                        onDragOver={e => {
                          if (!filaArrastrada.current) return;
                          e.preventDefault();
                          if (filaEncima !== f.id) setFilaEncima(f.id);
                        }}
                        onDragLeave={() => { if (filaEncima === f.id) setFilaEncima(''); }}
                        onDrop={e => { e.preventDefault(); soltarFila(f); }}
                        onDragEnd={() => { filaArrastrada.current = ''; setFilaEncima(''); setFilaMoviendo(''); }}
                        style={{ opacity: filaMoviendo === f.id ? 0.55 : 1 }}>

                        {/* ORDENAR — la manija. SOLO de aquí se agarra el
                            renglón para acomodarlo. — dirección, 29/08/2026 */}
                        <div
                          draggable
                          onDragStart={e => {
                            filaArrastrada.current = f.id;
                            setFilaMoviendo(f.id);
                            try {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', f.id);
                            } catch { /* nada */ }
                          }}
                          title="Agarra de aquí para acomodar este renglón"
                          className="shrink-0 flex items-center justify-center gap-1 rounded-xl select-none
                            cursor-grab active:cursor-grabbing hover:brightness-125"
                          style={{ width: 38, height: 38, background: '#20293a', border: `1px solid ${BORDE}` }}>
                          <GripVertical className="w-4 h-4 text-white/35" />
                        </div>

                        {/* LOS DATOS, dentro del recuadro */}
                        <div className="flex-1 grid gap-2 items-center rounded-xl px-3 py-1.5"
                             style={{
                               gridTemplateColumns: COLUMNAS, background: CAMPO,
                               border: `1px solid ${filaEncima === f.id ? AMBAR : BORDE}`,
                             }}>

                          <input
                            value={f.torneo_num}
                            inputMode="numeric"
                            onChange={e => cambiar(f.id, 'torneo_num', e.target.value.replace(/[^\d]/g, ''))}
                            /* La letra transparente es solo el gato: la casilla
                               es angosta y el título verde de arriba ya dice
                               TORNEO #. — dirección, 29/08/2026 */
                            placeholder="#"
                            style={{ background: VERDE, border: 'none', height: 30 }}
                            className="w-full rounded-lg text-center text-white font-black text-[15px] outline-none
                              placeholder:text-white/50" />

                          <select
                            value={f.jornada}
                            onChange={e => cambiar(f.id, 'jornada', e.target.value)}
                            /* Igual que en D.T y A.T: el renglón se sube solo. */
                            onFocus={e => {
                              try {
                                e.currentTarget.closest('div')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                              } catch { /* nada */ }
                            }}
                            style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30 }}
                            className="w-full rounded-lg px-1.5 text-white text-[12px] font-bold outline-none cursor-pointer">
                            <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                            {f.jornada && !NUM_FECHAS.includes(f.jornada) && (
                              <option value={f.jornada} style={{ color: '#111827', backgroundColor: 'white' }}>{f.jornada}</option>
                            )}
                            {NUM_FECHAS.map(n => (
                              <option key={n} value={n} style={{ color: '#111827', backgroundColor: 'white' }}>{n}</option>
                            ))}
                          </select>

                          {t ? (
                            /* SIN EL NOMBRE DEL PROFE DEBAJO (dirección,
                               29/08/2026): ocupaba un segundo renglón y engordaba
                               toda la fila. El formador ya se ve en D.T. */
                            <p className="text-white font-black text-[12.5px] leading-tight truncate min-w-0"
                               title={nombreTorneo(f.torneo_num)}>
                              {nombreTorneo(f.torneo_num)}
                            </p>
                          ) : (
                            <span className="text-white/25 font-black text-[12px] truncate">
                              {f.torneo_num ? `No hay torneo ${f.torneo_num}` : 'Escribe el número…'}
                            </span>
                          )}

                          {/* La casilla del DÍA se quitó de aquí: el cuadro es de
                              un solo día. Se cambia de día arriba, en el título. */}
                          <RelojLlegada valor={f.hora} onChange={v => cambiar(f.id, 'hora', v)} />

                          {/* ESCENARIO va ANTES que RIVAL, por orden de la
                              dirección (29/08/2026). */}
                          {/* CON BUSCADOR (dirección, 29/08/2026): al escribir las
                              primeras letras se abre la listica con las canchas
                              y los equipos que ya se han usado. Se puede escoger
                              uno o seguir escribiendo algo nuevo. */}
                          <input
                            value={f.escenario}
                            list="memoria-escenarios"
                            autoComplete="off"
                            onChange={e => cambiar(f.id, 'escenario', e.target.value.toUpperCase())}
                            placeholder="ESCENARIO"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30 }}
                            className="w-full rounded-lg px-2 text-white text-[12px] font-bold outline-none placeholder:text-white/20" />

                          <input
                            value={f.rival}
                            list="memoria-rivales"
                            autoComplete="off"
                            onChange={e => cambiar(f.id, 'rival', e.target.value.toUpperCase())}
                            placeholder="RIVAL"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30 }}
                            className="w-full rounded-lg px-2 text-white text-[12px] font-bold outline-none placeholder:text-white/20" />

                          {/* El de PRIMERO es siempre el profe responsable de ese
                              torneo; debajo, todos los demás del club. La misma
                              lista sirve para D.T y para A.T. — 29/08/2026 */}
                          <CasillaProfe valor={f.dt} onChange={v => cambiar(f.id, 'dt', v)}
                            delEquipo={profeDelTorneo(t?.formador, profesClub)} todos={profesClub} />
                          <CasillaProfe valor={f.at} onChange={v => cambiar(f.id, 'at', v)}
                            delEquipo={profeDelTorneo(t?.formador, profesClub)} todos={profesClub} />
                        </div>

                        {/* LOS BOTONES, POR FUERA DEL RECUADRO Y EN LA MISMA LÍNEA */}
                        {/* AGREGAR A POST PARTIDO — solo el balón, del tamaño
                            de la papelera, para no comerse el ancho del cuadro.
                            Lo que hace se lee al parar el mouse encima.
                            Verde = ya está mandado. — dirección, 29/08/2026 */}
                        <button
                          onClick={() => bajarAPospartido(f)}
                          disabled={ocupado}
                          title={yaEsta
                            ? 'YA ESTÁ EN EL POST PARTIDO. Si cambiaste algo del renglón, oprímelo otra vez y se actualiza.'
                            : 'AGREGAR A POST PARTIDO: crea la planilla con el día, la hora, el rival y el escenario.'}
                          className="shrink-0 rounded-xl flex items-center justify-center transition hover:brightness-125 disabled:opacity-50"
                          style={{
                            width: 38, height: 38,
                            background: yaEsta ? 'rgba(0,176,80,.16)' : '#20293a',
                            border: `1px solid ${yaEsta ? VERDE : BORDE}`,
                          }}>
                          {ocupado
                            ? <Loader2 className="w-4 h-4 animate-spin text-white" />
                            : <BalonFutbol className="w-4 h-4" color={yaEsta ? '#5BE39B' : '#ffffff'} />}
                        </button>

                        <button
                          onClick={() => quitarRenglon(f)}
                          disabled={ocupado}
                          title="Quitar este partido de la programación"
                          className="shrink-0 rounded-xl flex items-center justify-center transition hover:brightness-125 disabled:opacity-40"
                          style={{ width: 38, height: 38, background: 'transparent', border: `1px solid ${ROJO}` }}>
                          <Trash2 className="w-3.5 h-3.5" style={{ color: ROJO }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
          )}
        </div>

        <p className="text-white/40 text-[11.5px] font-semibold mt-3 leading-relaxed">
          Al oprimir <span className="text-white font-black">AGREGAR A POST PARTIDO</span> queda
          creada la planilla de ese partido en el Banco Post Partido, con el día, la hora de
          llegada, el rival, el escenario, el D.T y el A.T ya escritos. Los deportistas los arma
          sola la planilla, con los que tengan ese torneo asignado en Total Afiliados.
          Si esa planilla ya existía, solo se le actualiza el encabezado: lo calificado no se toca.
        </p>

        {/* AIRE AL FINAL (dirección, 29/08/2026): el último renglón quedaba
            pegado al borde de la pantalla y las listicas de D.T y A.T se
            abrían cortadas. Con este espacio en blanco el cuadro se puede
            subir con la rueda del mouse y las listas caben completas. */}
        <div aria-hidden style={{ height: 340 }} />

        {/* ── LA IMAGEN PARA COMPARTIR ── */}
        {!!imagen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
            style={{ background: 'rgba(0,0,0,.75)' }}
            onClick={() => setImagen('')}
          >
            <div
              className="rounded-2xl w-full max-w-[760px] my-4"
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-t-2xl" style={{ background: VERDE }}>
                <IconoImagen className="w-5 h-5 text-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-black text-[14px] uppercase">Imagen para compartir</h3>
                  <p className="text-white/75 text-[11px] font-semibold">
                    Sale con lo que se esté viendo en el cuadro.
                  </p>
                </div>
                <button onClick={bajarImagen}
                  className="shrink-0 rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-white text-[11px] font-black"
                  style={{ background: '#20293a', border: `1px solid ${BORDE}` }}>
                  <Download className="w-3.5 h-3.5" /> BAJAR IMAGEN
                </button>
                <button onClick={() => setImagen('')}
                  title="Cerrar"
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-white text-[11px] font-black"
                  style={{ background: 'rgba(255,255,255,.18)' }}>
                  CERRAR
                </button>
              </div>
              <div className="p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagen} alt="Programación de competencia"
                  className="w-full rounded-xl" style={{ border: `1px solid ${BORDE}` }} />
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
