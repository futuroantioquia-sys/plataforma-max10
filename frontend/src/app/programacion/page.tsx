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
const COLUMNAS = '64px minmax(250px,1.4fr) 74px 118px 186px minmax(150px,1fr) minmax(150px,1fr) 142px 142px';
const ANCHO_MINIMO = 1330;

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

/* ── UNA SOLA LÍNEA: el día y la hora ──────────────────────────────────────
   Escrita la fecha, en el renglón queda solo "SAB 29 AGO" —una línea, sin el
   calendario ni el AAAA-MM-DD debajo—. Al hacerle clic vuelve a salir el
   calendario para corregirla. Lo mismo con la hora. — dirección, 29/08/2026 */
function CasillaDia({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (abierta) ref.current?.focus(); }, [abierta]);

  if (!valor || abierta) {
    return (
      <input
        ref={ref}
        type="date"
        value={valor}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setAbierta(false)}
        style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30, colorScheme: 'dark' }}
        className="w-full rounded-lg px-2 text-white text-[12px] font-bold outline-none cursor-pointer" />
    );
  }
  return (
    <button
      onClick={() => setAbierta(true)}
      title="Clic para cambiar el día"
      style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30 }}
      className="w-full rounded-lg px-2 text-white text-[12px] font-black text-left
        outline-none truncate hover:brightness-125">
      {diaBonito(valor)}
    </button>
  );
}

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
  const [filtroTorneo, setFiltroTorneo] = useState('');   // "LIGA", "ABC", "ASOBDIM"…
  const [filtroDia, setFiltroDia]       = useState('');   // un día exacto
  /* CUERPO TÉCNICO: sale el nombre completo, se muestra el primer apellido, y
     filtra los partidos donde esa persona figura como D.T o como A.T.
     — dirección, 29/08/2026 */
  const [filtroProfe, setFiltroProfe]   = useState('');

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
        if (filtroDia && f.fecha !== filtroDia) return false;
        if (filtroTorneo) {
          const t = torneoDe(f.torneo_num);
          if (pelar(t?.torneo) !== pelar(filtroTorneo)) return false;
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
  }, [lista, filtroDia, filtroTorneo, filtroProfe, torneoDe, ordenMano]);

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

  const hayOrdenMano = ordenMano.length > 0;

  const hayFiltro = !!filtroDia || !!filtroTorneo || !!filtroProfe;

  /* ── Cambiar una casilla ── */
  function cambiar(id: string, campo: keyof FilaProgramacion, valor: string) {
    setFilas(prev => (prev ?? []).map(f => (f.id === id ? { ...f, [campo]: valor } : f)));
    void guardarPartido(id, { [campo]: valor } as Partial<FilaProgramacion>);
  }

  /* ── Agregar un renglón ── */
  async function nuevoRenglon() {
    setError(''); setAviso('');
    try {
      const creada = await agregarPartido();
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
  async function bajarAPospartido(f: FilaProgramacion) {
    setError(''); setAviso('');

    if (!f.torneo_num) { setError('Primero escribe el número del torneo.'); return; }
    if (!f.jornada) {
      setError('Falta la # FECHA. La planilla del pospartido se guarda por torneo Y fecha: sin ella no se sabe cuál partido es.');
      return;
    }

    setTrabajando(f.id);
    try {
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

      /* Medidas */
      const W = 1080, M = 44;
      const ALTO_TIT = 172;
      const ALTO_TORNEO = 58;
      const ALTO_CABEZA = 44;
      const ALTO_FILA = 58;
      const HUECO = 26;
      const ALTO_PIE = 74;

      let H = ALTO_TIT + ALTO_PIE;
      grupos.forEach(g => { H += ALTO_TORNEO + ALTO_CABEZA + g.length * ALTO_FILA + HUECO; });

      const lienzo = document.createElement('canvas');
      lienzo.width = W; lienzo.height = H;
      const ctx = lienzo.getContext('2d')!;

      /* Fondo: negro arriba, verde abajo. */
      const fondo = ctx.createLinearGradient(0, 0, 0, H);
      fondo.addColorStop(0, '#000000');
      fondo.addColorStop(0.45, '#04301c');
      fondo.addColorStop(1, '#00B050');
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, W, H);

      /* Título */
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 44px Arial, sans-serif';
      ctx.fillText('PROGRAMACIÓN DE COMPETENCIA', M, 66);

      ctx.font = '700 22px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      const pie = [
        filtroTorneo ? filtroTorneo : '',
        filtroProfe || '',
        filtroDia ? diaBonito(filtroDia) : '',
        `${visibles.length} ${visibles.length === 1 ? 'partido' : 'partidos'}`,
      ].filter(Boolean).join('   ·   ');
      ctx.fillText(pie.toUpperCase(), M, 108);

      /* El logo, si carga. Si no, no pasa nada. */
      try {
        const logo = await new Promise<HTMLImageElement>((ok, mal) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = () => mal(new Error('sin logo'));
          i.src = '/MAX%2010.png';
        });
        const alto = 58, ancho = (logo.width / logo.height) * alto;
        ctx.drawImage(logo, W - M - ancho, 40, ancho, alto);
      } catch { /* sin logo */ }

      /* Las columnas */
      const ANCHO = W - M * 2;
      const COLS = [
        { t: 'HORARIO',        w: 135 },
        { t: 'FECHA',          w: 135 },
        { t: 'DÍA DE PARTIDO', w: 215 },
        { t: 'RIVAL',          w: 275 },
        { t: 'ESCENARIO',      w: ANCHO - 135 - 135 - 215 - 275 },
      ];

      let y = ALTO_TIT;

      grupos.forEach((partidos, num) => {
        const t = torneoDe(num);

        /* El nombre del torneo */
        ctx.fillStyle = 'rgba(0,0,0,.42)';
        ctx.fillRect(M, y, ANCHO, ALTO_TORNEO);
        ctx.fillStyle = '#5BE39B';
        ctx.font = '900 26px Arial, sans-serif';
        const titulo = nombreTorneo(num) || `TORNEO ${num}`;
        ctx.fillText(recortar(ctx, titulo.toUpperCase(), ANCHO - 40), M + 20, y + ALTO_TORNEO / 2);
        y += ALTO_TORNEO;

        /* El encabezado VERDE con la letra blanca */
        ctx.fillStyle = '#00B050';
        ctx.fillRect(M, y, ANCHO, ALTO_CABEZA);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 19px Arial, sans-serif';
        let x = M;
        COLS.forEach(c => {
          ctx.fillText(recortar(ctx, c.t, c.w - 24), x + 14, y + ALTO_CABEZA / 2);
          x += c.w;
        });
        y += ALTO_CABEZA;

        /* Los partidos */
        partidos.forEach((f, i) => {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.22)';
          ctx.fillRect(M, y, ANCHO, ALTO_FILA);

          const datos = [
            horaBonita(f.hora) || '—',
            f.jornada ? `FECHA ${parseInt(f.jornada, 10) || f.jornada}` : '—',
            diaBonito(f.fecha) || '—',
            (f.rival || '—').toUpperCase(),
            (f.escenario || '—').toUpperCase(),
          ];
          let cx = M;
          datos.forEach((d, k) => {
            ctx.fillStyle = k === 3 ? '#ffffff' : 'rgba(255,255,255,.9)';
            /* La hora y el rival, más grandes: es lo primero que busca un papá. */
            ctx.font = (k === 0 || k === 3)
              ? '900 21px Arial, sans-serif'
              : '700 19px Arial, sans-serif';
            ctx.fillText(recortar(ctx, d, COLS[k].w - 24), cx + 14, y + ALTO_FILA / 2);
            cx += COLS[k].w;
          });
          y += ALTO_FILA;
        });

        y += HUECO;
      });

      /* Pie */
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '900 22px Arial, sans-serif';
      ctx.fillText('MAX 10 SPORT · FUTURO ANTIOQUIA', W / 2, H - 42);
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
      'PROGRAMACION', filtroTorneo,
      filtroProfe || '',
      filtroDia ? diaBonito(filtroDia) : '',
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
            Qué se juega, cuándo y dónde. De aquí salen los microciclos.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/60 text-[8px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
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
             style={{ background: VERDE }}>
          <CalendarDays className="w-5 h-5 text-white shrink-0" />
          <div className="min-w-0">
            <h2 className="text-white font-black text-[15px] tracking-wide">PARTIDOS PROGRAMADOS</h2>
            <p className="text-white/75 text-[11px] font-semibold">
              {hayFiltro
                ? `${visibles.length} de ${lista.length} partidos`
                : `${lista.length} ${lista.length === 1 ? 'partido programado' : 'partidos programados'}`}
            </p>
          </div>

          {/* Los filtros */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <select
              value={filtroTorneo}
              onChange={e => setFiltroTorneo(e.target.value)}
              title="Ver solo un torneo: LIGA, ABC, ASOBDIM, LA GRAN MANZANA…"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)', height: 32 }}
              className="rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS TORNEOS</option>
              {torneosParaFiltrar.map(t => (
                <option key={t} value={t} style={{ color: '#111827', backgroundColor: 'white' }}>{t}</option>
              ))}
            </select>

            <select
              value={filtroProfe}
              onChange={e => setFiltroProfe(e.target.value)}
              title="Ver los partidos donde esa persona va de D.T o de A.T"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)', height: 32 }}
              className="rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>CUERPO TÉCNICO</option>
              {profesParaFiltrar.map(p => (
                <option key={p} value={p} title={p} style={{ color: '#111827', backgroundColor: 'white' }}>
                  {p}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={filtroDia}
              onChange={e => setFiltroDia(e.target.value)}
              title="Ver solo los partidos de ese día"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,.6)',
                height: 32, colorScheme: 'dark',
              }}
              className="rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer" />

            <button
              onClick={ordenarPorHorario}
              disabled={visibles.length < 2}
              title="Acomoda los partidos del más temprano al más tarde"
              className="rounded-lg px-2.5 h-8 flex items-center text-white text-[11px] font-black disabled:opacity-45"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.6)' }}>
              ORDENAR POR HORARIO
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
                onClick={() => { setFiltroTorneo(''); setFiltroDia(''); setFiltroProfe(''); }}
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
                    {['TORNEO #', 'TORNEO', '# FECHA', 'DÍA DE JUEGO', 'HORA DE LLEGADA', 'ESCENARIO',
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
                  <span style={{ width: 38 }}
                    className="shrink-0 text-center text-white/45 text-[7.5px] font-black
                      uppercase leading-[1.15] tracking-tight">
                    Crear<br />Post<br />Partido
                  </span>
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

                          <select
                            value={f.jornada}
                            onChange={e => cambiar(f.id, 'jornada', e.target.value)}
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

                          <CasillaDia valor={f.fecha} onChange={v => cambiar(f.id, 'fecha', v)} />
                          <RelojLlegada valor={f.hora} onChange={v => cambiar(f.id, 'hora', v)} />

                          {/* ESCENARIO va ANTES que RIVAL, por orden de la
                              dirección (29/08/2026). */}
                          <input
                            value={f.escenario}
                            onChange={e => cambiar(f.id, 'escenario', e.target.value)}
                            placeholder="ESCENARIO"
                            style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 30 }}
                            className="w-full rounded-lg px-2 text-white text-[12px] font-bold outline-none placeholder:text-white/20" />

                          <input
                            value={f.rival}
                            onChange={e => cambiar(f.id, 'rival', e.target.value)}
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
