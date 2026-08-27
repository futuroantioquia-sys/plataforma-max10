'use client';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  /postpartido  ·  CREAR POS PARTIDO — la planilla del partido.
//
//  Cómo se usa (dirección, 26/08/2026):
//    1. Se escribe el NÚMERO DE TORNEO (el # TOR del cuadro de Torneos y
//       Competencias). Al instante aparece el torneo en un solo renglón:
//       "LIGA DESARROLLO SUB 8 REGOL".
//    2. Se llena la jornada, la fecha, la hora de llegada y el rival.
//    3. Queda armada la planilla. Por ahora arranca en 20 renglones; más
//       adelante saldrán tantos como deportistas tenga asignados ese torneo
//       (pueden ser 15, 16 u 8).
//
//  LOS DEPORTISTAS SALEN SOLOS (26/08/2026): al escribir el número, se buscan
//  en TOTAL AFILIADOS los que tengan ese torneo puesto en C1, C2, C3 o C4, y la
//  planilla se arma con ellos — ni un renglón de más ni uno de menos. Si todavía
//  nadie tiene ese torneo asignado, quedan los 20 renglones en blanco y la
//  pantalla lo avisa.
//
//  27/08/2026 — Ya guarda, y guarda MUCHOS partidos del mismo torneo. Cada
//  planilla se identifica por el torneo Y la # FECHA, y todas quedan archivadas
//  abajo, en el BANCO POSPARTIDO. Cada partido se nombra como lo pidió la
//  dirección:   FECHA 1  LIGA DESARROLLO SUB 8
//
//  26/08/2026 — La dirección mandó empezar de cero en este módulo: el
//  formulario viejo de "Registrar postpartido" (fecha / proyecto / rival /
//  observaciones / convocados por código) se retiró por completo. Esta
//  planilla lo reemplaza.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertTriangle, Loader2, ChevronDown, FileDown, Save, Check, Trash2,
  Archive, RefreshCw,
} from 'lucide-react';
import { getCuadro, limpiar, type FilaTorneo } from '@/lib/torneos';
import { esSuperAdmin, esAccesoTotal } from '@/lib/permisos';
import { descargarPlanillaPDF } from '@/lib/planilla-pdf';
import {
  getPlanilla, guardarPlanilla, guardarBorradorLocal, leerBorradorLocal,
  borrarBorradorLocal, borrarPlanilla, cuandoBonito,
  getBanco, etiquetaFecha, numeroDeFecha,
  type PlanillaGuardada, type FichaBanco,
} from '@/lib/pospartido';
import { getDeportistas } from '@/lib/db';
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
const MORADO = '#8B72D9';   // el que fue convocado pero no jugó
const BLANCO = '1px solid #ffffff';

/* Las posiciones, escritas igual que en la ficha del deportista. Un jugador
   puede tener hasta TRES. — dirección, 26/08/2026 */
const POSICIONES = [
  'PORTERO', 'CENTRAL', 'LATERAL',
  'INTERIOR', 'EXTREMO', 'CREATIVO', 'DELANTERO',
];
const MAX_POS = 3;

/* ── LAS COLUMNAS DE LA PLANILLA ─────────────────────────────────────────────
   Cada una tiene su clave, su título y su ancho. El ORDEN se puede cambiar
   arrastrando el título, y queda guardado en el computador de quien lo mueve.
   Cuando la dirección defina el orden bueno, se deja aquí como el de siempre. */
type ClaveCol =
  | 'num' | 'deportista' | 'convocado' | 'actua' | 'posicion'
  | 'minutos' | 'faltas' | 'amarillas' | 'rojas'
  | 'asistencias' | 'goles' | 'ataja' | 'calificacion';

/* Los anchos crecieron junto con el encabezado (dirección, 26/08/2026): con
   la letra grande, "CONVOCADO" y "POSICIÓN" ya no caben en columnas angostas. */
const COLUMNAS: Record<ClaveCol, { h: string; w: number; fondo?: string; ayuda?: string }> = {
  num:          { h: '#',          w: 42 },
  deportista:   { h: 'DEPORTISTA', w: 255 },
  convocado:    { h: 'CONVOCADO',  w: 128 },
  actua:        { h: 'ACTÚA',      w: 100 },
  posicion:     { h: 'POSICIÓN',   w: 175 },
  minutos:      { h: 'MIN',        w: 70 },
  faltas:       { h: 'FAL',        w: 66 },
  amarillas:    { h: 'AMA',        w: 62, fondo: AMBAR },
  rojas:        { h: 'ROJ',        w: 58, fondo: ROJO },
  asistencias:  { h: 'ASI',        w: 66 },
  goles:        { h: 'GOL',        w: 66 },
  ataja:        { h: 'ATA',        w: 66, ayuda: 'ATAJADAS del arquero (solo el portero)' },
  calificacion: { h: 'CAL',        w: 66, fondo: VERDE },
};

const ORDEN_DEFECTO: ClaveCol[] = [
  'num', 'deportista', 'convocado', 'actua', 'posicion',
  'minutos', 'faltas', 'amarillas', 'rojas',
  'asistencias', 'goles', 'ataja', 'calificacion',
];

const LLAVE_ORDEN  = 'pospartido-orden-columnas';
const LLAVE_ANCHOS = 'pospartido-anchos-columnas';

/* Hasta dónde se puede encoger o estirar una columna arrastrando su borde. */
const ANCHO_MIN = 34;
const ANCHO_MAX = 520;

type Anchos = Partial<Record<ClaveCol, number>>;

function guardarAnchos(anchos: Anchos | null) {
  try {
    if (anchos && Object.keys(anchos).length) localStorage.setItem(LLAVE_ANCHOS, JSON.stringify(anchos));
    else localStorage.removeItem(LLAVE_ANCHOS);
  } catch { /* sin memoria del navegador: se sigue igual */ }
}

function leerAnchos(): Anchos {
  try {
    const txt = localStorage.getItem(LLAVE_ANCHOS);
    if (!txt) return {};
    const g = JSON.parse(txt);
    if (!g || typeof g !== 'object') return {};
    const limpio: Anchos = {};
    Object.entries(g).forEach(([k, v]) => {
      const n = Number(v);
      if (k in COLUMNAS && Number.isFinite(n) && n >= ANCHO_MIN && n <= ANCHO_MAX) {
        limpio[k as ClaveCol] = Math.round(n);
      }
    });
    return limpio;
  } catch {
    return {};
  }
}

/** Guarda (o borra) el orden en este computador. Si el navegador no deja
 *  guardar, no pasa nada: simplemente vuelve al orden de siempre. */
function guardarOrden(orden: ClaveCol[] | null) {
  try {
    if (orden) localStorage.setItem(LLAVE_ORDEN, JSON.stringify(orden));
    else localStorage.removeItem(LLAVE_ORDEN);
  } catch { /* sin memoria del navegador: se sigue igual */ }
}

/** Lee el orden guardado y lo sanea: si en el camino se agregó o se quitó una
 *  columna, se acomoda sola sin dejar el cuadro cojo. */
function leerOrden(): ClaveCol[] {
  try {
    const txt = localStorage.getItem(LLAVE_ORDEN);
    if (!txt) return [...ORDEN_DEFECTO];
    const guardado = JSON.parse(txt);
    if (!Array.isArray(guardado)) return [...ORDEN_DEFECTO];
    const limpias = guardado.filter((c: any): c is ClaveCol => c in COLUMNAS);
    const faltantes = ORDEN_DEFECTO.filter(c => !limpias.includes(c));
    const completo = [...limpias, ...faltantes];
    return completo.length === ORDEN_DEFECTO.length ? completo : [...ORDEN_DEFECTO];
  } catch {
    return [...ORDEN_DEFECTO];
  }
}

type FilaPlanilla = {
  id: string;
  posicion: string;
  deportista: string;
  convocado: '' | 'Convocado' | 'No convocado';
  titular: '' | 'Titular' | 'Suplente' | 'No jugó';
  minutos: string;
  faltas: string;
  amarillas: string;
  rojas: string;
  asistencias: string;
  goles: string;
  ataja: string;      // ATA — atajadas del portero
  calificacion: string;
};

/** Parte un nombre en DOS renglones parejos, como "FUTURO / ANTIOQUIA".
 *  Si es una sola palabra, se queda en un solo renglón. */
function enDosLineas(texto: string): string[] {
  const pal = limpiar(texto).toUpperCase().split(' ').filter(Boolean);
  if (pal.length <= 1) return pal;
  // Se corta por la mitad contando letras, para que los dos renglones pesen igual.
  const total = pal.join(' ').length;
  let acum = 0, corte = 1;
  for (let i = 0; i < pal.length - 1; i++) {
    acum += pal[i].length + 1;
    corte = i + 1;
    if (acum >= total / 2) break;
  }
  return [pal.slice(0, corte).join(' '), pal.slice(corte).join(' ')];
}

/* ── Lectura de la ficha del deportista ─────────────────────────────────── */
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k.trim()));
  return k ? String(dep._columnas[k] ?? '') : '';
}

/** Las cuatro casillas de competencia de la ficha (C1..C4). */
const RX_COMPETENCIAS = [
  /^compite$|torneo.?1|^c\s*1$/i,
  /torneo.?2|^c\s*2$/i,
  /torneo.?3|^c\s*3$/i,
  /torneo.?4|^c\s*4$/i,
];
const CLAVES_VIRTUALES = ['__TORNEO1__', '__TORNEO2__', '__TORNEO3__', '__TORNEO4__'];

/** El número de torneo que tiene puesto en cada casilla. "3 · LIGA…" → 3 */
function torneosDelDeportista(dep: Deportista): number[] {
  const vals: string[] = [];
  RX_COMPETENCIAS.forEach((rx, i) => {
    vals.push(getCol(dep, rx) || String(dep._columnas?.[CLAVES_VIRTUALES[i]] ?? ''));
  });
  return vals
    .map(v => parseInt(String(v).trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

/** La posición del deportista, tal como está en su ficha. */
function posicionDe(dep: Deportista): string {
  const v = String(dep._columnas?.['__POSICION__'] ?? '') || getCol(dep, /^posici/i);
  // La ficha puede traer más de tres; en la planilla mandan las tres primeras.
  return limpiar(v).toUpperCase()
    .split(',').map(p => p.trim()).filter(Boolean).slice(0, 3).join(', ');
}

/** El código, para ordenar la lista igual que en Total Afiliados. */
function codigoDe(dep: Deportista): string {
  return limpiar(getCol(dep, /^c[oó]d/i));
}

function filaNueva(i: number): FilaPlanilla {
  return {
    id: `p-${i}-${Math.random().toString(36).slice(2, 8)}`,
    posicion: '', deportista: '',
    convocado: '', titular: '',
    minutos: '', faltas: '', amarillas: '', rojas: '',
    asistencias: '', goles: '', ataja: '', calificacion: '',
  };
}

/* ── Casilla de texto ────────────────────────────────────────────────────── */
function Celda({ valor, onChange, lista, centro, numero, placeholder, grande }: {
  valor: string;
  onChange: (v: string) => void;
  lista?: string;
  centro?: boolean;
  numero?: boolean;
  placeholder?: string;
  grande?: boolean;        // el nombre del deportista va más grande que el resto
}) {
  const [foco, setFoco] = useState(false);
  return (
    <input
      value={valor}
      list={lista}
      placeholder={placeholder}
      inputMode={numero ? 'numeric' : undefined}
      onChange={e => onChange(numero ? e.target.value.replace(/[^\d]/g, '') : e.target.value)}
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
      style={{
        width: '100%', height: grande ? 30 : 26,
        background: foco ? CAMPO : 'transparent',
        border: `1px solid ${foco ? VERDE : 'transparent'}`,
      }}
      className={`rounded px-1 text-white text-[11.5px] font-bold outline-none
        placeholder:text-white/20 ${centro ? 'text-center' : ''}`}
    />
  );
}

/* ── Una casilla que se escoge de una lista de números ────────────────────
   MIN · FAL · ASI · GOL · ATA. Todas en el MISMO gris oscuro del cuadro
   (dirección, 26/08/2026): con cada columna de un color distinto, la planilla
   parecía un arcoíris y ya no se distinguía lo importante. Los únicos colores
   que quedan son los que significan algo: las tarjetas AMA y ROJ, el
   CONVOCADO, el ACTÚA y la CAL.
   Lo que cambia al llenarse es el número, que pasa de apagado a blanco. */
function ListaNumeros({ valor, opciones, titulo, onChange }: {
  valor: string; opciones: string[]; titulo: string;
  onChange: (v: string) => void;
}) {
  const puesto = String(valor ?? '').trim() !== '';
  return (
    <select
      value={valor}
      onChange={e => onChange(e.target.value)}
      title={titulo}
      style={{
        /* Sin relleno: ni verde, ni azul, ni el gris más oscuro. La casilla es
           el mismo fondo del cuadro y lo único que cambia al llenarse es que el
           número se pone blanco. — dirección, 26/08/2026 */
        height: 26, width: '100%',
        background: 'transparent',
        border: `1px solid ${BORDE}`,
        color: puesto ? '#ffffff' : 'rgba(255,255,255,.35)',
      }}
      className="rounded text-center text-[13px] font-black outline-none cursor-pointer">
      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
      {/* Si venía un número que no está en la lista, no se pierde. */}
      {puesto && !opciones.includes(valor) && (
        <option value={valor} style={{ color: '#111827', backgroundColor: 'white' }}>{valor}</option>
      )}
      {opciones.map(o => (
        <option key={o} value={o} style={{ color: '#111827', backgroundColor: 'white' }}>{o}</option>
      ))}
    </select>
  );
}

/* ── La casilla que no aplica ────────────────────────────────────────────── */
function NoAplica() {
  return (
    <span className="block text-center text-[11px] font-black"
      style={{ color: 'rgba(255,255,255,.35)', lineHeight: '26px' }}>
      N/A
    </span>
  );
}

/** ¿Este deportista juega de portero? Se mira lo que diga su casilla de
 *  posición, escrita a mano o marcada de la lista. */
function esPortero(posicion: string): boolean {
  return /porter|arquer|golero/i.test(String(posicion ?? ''));
}

/* ── POSICIÓN · se escribe libre, o se marca de la lista ──────────────────
   La lista es una AYUDA, no una talanquera: el formador puede escribir
   directamente en la casilla la posición que quiera, aunque no esté en la
   lista (dirección, 26/08/2026). El desplegable está para el caso común —
   marcar de a clic— y la sugerencia de tres es eso, una sugerencia: si el
   formador escribe cuatro a mano, se las respeta. */
function CeldaPosiciones({ valor, onChange }: {
  valor: string; onChange: (v: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [foco, setFoco] = useState(false);
  const [encimaRaton, setEncimaRaton] = useState(false);
  const [donde, setDonde] = useState({ top: 0, left: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const puestas = String(valor ?? '')
    .split(',').map(p => p.trim().toUpperCase()).filter(Boolean);

  /* Lo que el formador haya escrito a mano se suma a la lista, para que pueda
     desmarcarlo con un clic igual que las demás. */
  const lista = [...POSICIONES, ...puestas.filter(p => !POSICIONES.includes(p))];

  function abrir() {
    if (!abierta && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDonde({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
    }
    setAbierta(a => !a);
  }

  function marcar(pos: string) {
    const esta = puestas.includes(pos);
    // Marcando de la lista se sugieren tres; escribiendo a mano no hay tope.
    const next = esta
      ? puestas.filter(p => p !== pos)
      : puestas.length >= MAX_POS ? puestas : [...puestas, pos];
    onChange(next.join(', '));
  }

  useEffect(() => {
    if (!abierta) return;
    function fuera(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierta(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierta]);

  const menu = abierta && typeof document !== 'undefined'
    ? createPortal(
        <div ref={menuRef}
          style={{
            position: 'fixed', top: donde.top, left: donde.left, zIndex: 99999,
            minWidth: 200, background: PANEL, border: `1px solid ${BORDE}`,
            boxShadow: '0 18px 40px rgba(0,0,0,.45)',
          }}
          className="rounded-xl py-1.5">
          <p className="text-[9.5px] font-black text-white/45 uppercase tracking-widest px-3 pb-1"
            style={{ borderBottom: `1px solid ${BORDE}` }}>
            Marca hasta {MAX_POS} · o escríbela en la casilla
          </p>
          {lista.map(pos => {
            const marcada = puestas.includes(pos);
            const llena = !marcada && puestas.length >= MAX_POS;
            return (
              <button key={pos} type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => marcar(pos)}
                title={llena ? 'Ya hay tres marcadas. Quita una, o escríbela a mano en la casilla.' : ''}
                style={{ background: marcada ? 'rgba(0,176,80,.18)' : 'transparent' }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white text-left
                  ${marcada ? 'font-black' : 'font-semibold'}
                  ${llena ? 'opacity-40' : 'hover:bg-white/5'}`}>
                <span className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                  style={{
                    background: marcada ? VERDE : 'transparent',
                    border: `1px solid ${marcada ? VERDE : BORDE}`,
                  }}>
                  {marcada && (
                    <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {pos}
              </button>
            );
          })}
          {puestas.length > 0 && (
            <button type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { onChange(''); setAbierta(false); }}
              style={{ borderTop: `1px solid ${BORDE}` }}
              className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-white/50 hover:text-white mt-1">
              Quitar todas
            </button>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* Se ve que es una casilla de escribir: al pasar el mouse se le marca
          el borde. Antes parecía un texto fijo y nadie se atrevía a tocarla. */}
      <div className="flex items-center gap-1 rounded px-0.5"
        onMouseEnter={() => setEncimaRaton(true)}
        onMouseLeave={() => setEncimaRaton(false)}
        style={{
          height: 26,
          background: (foco || abierta) ? CAMPO : encimaRaton ? 'rgba(0,0,0,.18)' : 'transparent',
          border: `1px solid ${(foco || abierta) ? VERDE : encimaRaton ? BORDE : 'transparent'}`,
        }}>
        {/* Escribir directo: manda lo que el formador teclee. */}
        <input
          value={valor}
          onChange={e => onChange(e.target.value.toUpperCase())}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          placeholder="—"
          title="Escribe la posición que quieras, o déjala en blanco. La flechita abre la lista, pero no es obligatoria."
          className="flex-1 min-w-0 bg-transparent outline-none text-[11px] font-bold text-white placeholder:text-white/25 cursor-text"
        />
        <button ref={btnRef} type="button" onClick={abrir}
          title="Ver la lista de posiciones"
          className="shrink-0 flex items-center justify-center"
          style={{ width: 16, height: 22 }}>
          <ChevronDown className="w-3 h-3" style={{ color: abierta ? VERDE : GRIS }} />
        </button>
      </div>
      {menu}
    </>
  );
}

/* ── Las dos casillas que se llenan de un clic ─────────────────────────────
   Mientras no se ha escogido nada quedan en el MISMO gris oscuro de las demás
   casillas: así se ve de un vistazo lo que falta por marcar. Apenas se escoge,
   la casilla PRENDE con su color:
       CONVOCADO →  Convocado verde · No convocado rojo
       ACTÚA  →  Titular verde · Suplente amarillo · No jugó morado
       AMA  →  1 amarilla · 2 amarillas (las dos en ámbar)
       ROJ  →  1 roja (en rojo)
   Cada clic pasa a la siguiente opción y vuelve a empezar. */
function Escoger<T extends string>({ valor, opciones, colores, titulo, grande, onChange }: {
  valor: T | '';
  opciones: readonly T[];
  colores: Record<string, string>;
  titulo: string;
  grande?: boolean;          // letra del tamaño del título (CONVOCADO)
  onChange: (v: T | '') => void;
}) {
  const i = valor === '' ? -1 : opciones.indexOf(valor as T);
  const siguiente = (i + 1 >= opciones.length ? '' : opciones[i + 1]) as T | '';
  const prendida = valor !== '';
  return (
    <button onClick={() => onChange(siguiente)}
      title={titulo}
      className={`w-full rounded font-black leading-none ${grande ? 'text-[13.5px]' : 'text-[10.5px]'}`}
      style={{
        height: grande ? 30 : 26,
        background: prendida ? colores[valor] : 'transparent',
        border: prendida ? 'none' : `1px solid ${BORDE}`,
        color: prendida ? '#ffffff' : 'rgba(255,255,255,.28)',
      }}>
      {valor || '—'}
    </button>
  );
}

/* En la casilla se lee la palabra completa: "Convocado" o "No convocado".
   Antes decía SI/NO y tocaba acordarse de a qué contestaba. — 26/08/2026 */
const OPC_CON = ['Convocado', 'No convocado'] as const;
/* ACTÚA: las tres formas en que un convocado termina el partido. En minúscula
   —Titular, Suplente, No jugó— para que quepan en una columna delgada. */
const OPC_TIT = ['Titular', 'Suplente', 'No jugó'] as const;
/* Las tarjetas también se marcan a punta de clic: una amarilla, dos amarillas,
   o la roja. Nadie tiene que escribir un número. */
/* La CALIFICACIÓN va de 1 a 5, de media en media: 1 · 1,5 · 2 · 2,5 … 5.
   Se escoge de la lista, no se escribe: así nadie pone un 7 ni un 0,5 por
   error, y desde el celular son nueve opciones y ya. — dirección, 26/08/2026 */
const NOTAS: string[] = Array.from({ length: 9 }, (_, i) =>
  (1 + i * 0.5).toFixed(1).replace('.', ','));   // 1,0 · 1,5 · 2,0 … 5,0

/* El "# FECHA" es el número de jornada del torneo: 1A, 2A, 3A… hasta 30A.
   Se escoge de la lista para que todos la escriban igual. — 26/08/2026 */
const NUM_FECHAS: string[] = Array.from({ length: 30 }, (_, i) => `${i + 1}A`);

/* Todo lo que se cuenta se escoge de una lista, no se escribe: desde el
   celular es un toque, sin teclado y sin acertarle a una casilla diminuta.
   — dirección, 26/08/2026 */
const GOLES_POSIBLES: string[] = Array.from({ length: 20 }, (_, i) => String(i + 1));   // 1 a 20
const MINUTOS_POSIBLES: string[] = Array.from({ length: 18 }, (_, i) => String((i + 1) * 5)); // 5,10…90

/* ── La HORA DE LLEGADA ──────────────────────────────────────────────────────
   Tres piezas, como un reloj de verdad: la hora se escoge de una lista (1 a
   12), los minutos se escriben (así se puede poner 10:05, 10:20, lo que sea)
   y AM/PM se cambia con un clic. Se guarda como texto "10:05 AM", que es lo
   que después sale en el renglón y en el PDF. — dirección, 26/08/2026 */
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
        style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38, width: 62 }}
        className="rounded-lg px-1.5 text-white text-[12.5px] font-bold outline-none cursor-pointer text-center">
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
          style={{ background: CAMPO, border: `1px solid ${listaMin ? VERDE : BORDE}`, height: 38 }}>
          <input value={p.m} inputMode="numeric" placeholder="00"
            title="Minutos: escríbelos, o ábrelos con la flechita"
            onChange={e => {
              const mm = e.target.value.replace(/\D/g, '').slice(0, 2);
              cambiar(p.h || '', mm, p.ampm);
            }}
            onFocus={() => setListaMin(true)}
            style={{ width: 38, background: 'transparent' }}
            className="px-1 text-white text-[12.5px] font-bold outline-none text-center placeholder:text-white/20" />
          <button type="button" onClick={() => setListaMin(v => !v)}
            title="00 · 15 · 30 · 45"
            className="flex items-center justify-center" style={{ width: 18, height: 36 }}>
            <ChevronDown className="w-3 h-3" style={{ color: listaMin ? VERDE : GRIS }} />
          </button>
        </div>

        {listaMin && (
          <div className="absolute left-0 rounded-lg overflow-hidden"
            style={{
              top: 41, zIndex: 60, minWidth: 62,
              background: PANEL, border: `1px solid ${BORDE}`,
              boxShadow: '0 16px 34px rgba(0,0,0,.45)',
            }}>
            {MINUTOS_TIPICOS.map(m => (
              <button key={m} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { cambiar(p.h || '', m, p.ampm); setListaMin(false); }}
                style={{ background: p.m === m ? 'rgba(0,176,80,.20)' : 'transparent' }}
                className="w-full px-3 py-1.5 text-[12.5px] font-bold text-white text-center hover:bg-white/10">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button"
        onClick={() => cambiar(p.h || '', p.m, p.ampm === 'AM' ? 'PM' : 'AM')}
        title="Clic para cambiar entre AM y PM"
        style={{ background: p.h ? VERDE : CAMPO, border: `1px solid ${p.h ? VERDE : BORDE}`, height: 38, width: 52 }}
        className="rounded-lg text-white text-[12.5px] font-black">
        {p.ampm}
      </button>
    </div>
  );
}

const OPC_AMA = ['1', '2'] as const;
const OPC_ROJ = ['1'] as const;
const COLOR_CON = { Convocado: VERDE, 'No convocado': ROJO };
const COLOR_TIT = { Titular: VERDE, Suplente: AMBAR, 'No jugó': MORADO };
const COLOR_AMA = { '1': AMBAR, '2': AMBAR };
const COLOR_ROJ = { '1': ROJO };

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CrearPospartidoPage() {
  const router = useRouter();

  const [cuadro, setCuadro] = useState<FilaTorneo[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [numTorneo, setNumTorneo] = useState('');
  const [jornada, setJornada]     = useState('');
  const [fecha, setFecha]         = useState('');
  const [llegar, setLlegar]       = useState('');
  const [rival, setRival]         = useState('');
  const [golesNos, setGolesNos]   = useState('');   // ya no se escribe: se calcula
  const [golesEllos, setGolesEllos] = useState('');
  /* AUTOGOLES DEL RIVAL: goles que suman a nuestro marcador pero que no los
     hizo ningún deportista nuestro. Van aparte para que la cuenta cuadre sin
     que el formador tenga que sumarlos a mano. — dirección, 26/08/2026 */
  const [autogoles, setAutogoles] = useState(0);

  /* Arranca vacía: los renglones salen de los deportistas asignados al torneo. */
  const [filas, setFilas] = useState<FilaPlanilla[]>([]);

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const ultimoArmado = useRef<string>('');   // torneo+fecha con los que ya se armó
  const ultimoTorneo = useRef<string>('');   // para saber si cambió el TORNEO o solo la fecha

  /* El orden de las columnas, tal como lo dejó quien usa esta pantalla. */
  const [orden, setOrden] = useState<ClaveCol[]>(ORDEN_DEFECTO);
  const arrastrando = useRef<number | null>(null);
  const [encima, setEncima] = useState<number | null>(null);
  const [anchos, setAnchos] = useState<Anchos>({});
  const estirando = useRef<{ clave: ClaveCol; x0: number; w0: number } | null>(null);
  const [estirandoCual, setEstirandoCual] = useState<ClaveCol | null>(null);
  useEffect(() => { setOrden(leerOrden()); setAnchos(leerAnchos()); }, []);

  /* ── Estirar una columna arrastrando su borde derecho ────────────────────
     Se toma el borde del título y se corre. Al soltar queda guardado en este
     computador, junto con el orden. — 26/08/2026 */
  useEffect(() => {
    if (!estirandoCual) return;
    function moviendo(e: MouseEvent) {
      const est = estirando.current;
      if (!est) return;
      const ancho = Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, est.w0 + (e.clientX - est.x0)));
      setAnchos(prev => ({ ...prev, [est.clave]: Math.round(ancho) }));
    }
    function soltando() {
      estirando.current = null;
      setEstirandoCual(null);
      setAnchos(prev => { guardarAnchos(prev); return prev; });
    }
    document.addEventListener('mousemove', moviendo);
    document.addEventListener('mouseup', soltando);
    return () => {
      document.removeEventListener('mousemove', moviendo);
      document.removeEventListener('mouseup', soltando);
    };
  }, [estirandoCual]);

  useEffect(() => {
    getCuadro()
      .then(c => setCuadro(c))
      .catch(e => setError(e?.message ?? 'No se pudo leer el cuadro de torneos.'))
      .finally(() => setCargando(false));
    // Las fichas de Total Afiliados: de ahí salen los deportistas del torneo.
    getDeportistas().then(setDeportistas).catch(() => {});
  }, []);

  /* ── Los deportistas que tienen ESTE torneo asignado ─────────────────────
     Se buscan en las cuatro casillas de competencia (C1..C4) de cada ficha.
     Van en el mismo orden de Total Afiliados: por código. */
  const convocables = useMemo(() => {
    const n = parseInt(numTorneo, 10);
    if (!Number.isFinite(n) || n < 1) return [];
    return deportistas
      .filter(d => torneosDelDeportista(d).includes(n))
      .sort((a, b) => {
        const ca = parseInt(codigoDe(a).replace(/\D/g, ''), 10);
        const cb = parseInt(codigoDe(b).replace(/\D/g, ''), 10);
        if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
        return (a._nombre || '').localeCompare(b._nombre || '', 'es');
      });
  }, [numTorneo, deportistas]);

  /* ── La planilla se arma sola con esos deportistas ───────────────────────
     Ni un renglón de más ni uno de menos.

     QUÉ CAMBIÓ (dirección, 27/08/2026): ahora un torneo tiene MUCHOS partidos,
     uno por # FECHA. Entonces esto mira las dos cosas: el torneo y la fecha.

       · Si cambia el TORNEO  → se arma la lista de deportistas de cero.
       · Si cambia solo la FECHA → se busca si ese partido ya está archivado.
         Si está, se abre. Si NO está, la pantalla se queda como está: el
         formador apenas le está poniendo nombre al partido que va llenando, y
         sería una crueldad borrarle lo escrito por escoger la fecha tarde. */
  useEffect(() => {
    const clave = `${numTorneo}|${jornada}|${convocables.length}`;
    if (ultimoArmado.current === clave) return;
    const cambioElTorneo = ultimoTorneo.current !== numTorneo;
    ultimoArmado.current = clave;
    ultimoTorneo.current = numTorneo;

    if (!numTorneo) {
      setFilas([]);
      return;
    }

    /* PRIMERO se mira si ese partido ya tiene una planilla empezada: la de la
       base, y si no hay señal, la que quedó guardada en este aparato. Solo si
       no hay nada se arma de cero con los deportistas asignados. Así el
       formador que pausó retoma donde iba. — 26/08/2026 */
    let cancelado = false;
    (async () => {
      const enBase = jornada ? await getPlanilla(numTorneo, jornada) : null;
      if (cancelado) return;
      const local = leerBorradorLocal(numTorneo, jornada);
      /* Manda la más nueva de las dos. */
      const guardada = (enBase && local)
        ? ((enBase.actualizada_en || '') >= (local.actualizada_en || '') ? enBase : local)
        : (enBase || local);

      if (guardada && Array.isArray(guardada.filas) && guardada.filas.length) {
        primeraCarga.current = true;      // volcarla no cuenta como cambio
        ponerPlanilla(guardada);
        setGuardadoEn(enBase?.actualizada_en ?? '');
        setSinGuardar(!enBase || (local ? (local.actualizada_en > (enBase.actualizada_en || '')) : false));
        return;
      }

      /* No hay nada archivado de esta fecha. Si lo único que cambió fue la
         fecha, NO se toca lo que está en pantalla. */
      if (!cambioElTorneo) return;

      primeraCarga.current = true;
      setSinGuardar(false);
      setGuardadoEn('');
      if (convocables.length === 0) {
        setFilas([]);
      } else {
        setFilas(convocables.map((d, i) => ({
          ...filaNueva(i),
          posicion: posicionDe(d),
          deportista: limpiar(d._nombre).toUpperCase(),
        })));
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numTorneo, jornada, convocables]);

  /* ── El torneo que corresponde al número escrito ───────────────────────── */
  const torneo = useMemo(() => {
    const n = parseInt(numTorneo, 10);
    if (!cuadro || !Number.isFinite(n) || n < 1 || n > cuadro.length) return null;
    return cuadro[n - 1];
  }, [numTorneo, cuadro]);

  /** "LIGA DESARROLLO SUB 8 REGOL" — todo en un solo renglón. */
  const nombreTorneo = useMemo(() => {
    if (!torneo) return '';
    return [torneo.torneo, torneo.programa, torneo.categoria, torneo.nombre]
      .map(limpiar).filter(Boolean).join(' ');
  }, [torneo]);

  /** "FECHA 1 LIGA DESARROLLO SUB 8" — el nombre del partido en el BANCO.
   *  Con este mismo nombre se baja el PDF, para que al buscarlo en el
   *  computador se reconozca sin abrirlo. — dirección, 27/08/2026 */
  const nombreEnElBanco = useMemo(() => {
    const equipo = torneo
      ? [torneo.torneo, torneo.programa, torneo.categoria].map(limpiar).filter(Boolean).join(' ')
      : (numTorneo ? `TORNEO ${numTorneo}` : '');
    const f = jornada ? etiquetaFecha(jornada) : '';
    return [f, equipo].filter(Boolean).join(' ');
  }, [torneo, numTorneo, jornada]);

  /** "SAB 4 AGO 2026" a partir del día escogido en el calendario. */
  const fechaBonita = useMemo(() => {
    const t = limpiar(fecha);
    if (!t) return '';
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return t.toUpperCase();          // por si quedó algo escrito a mano
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return t.toUpperCase();
    const dias  = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }, [fecha]);

  /** "FECHA 1A SAB 4 AGO 2026 / LLEGAR 10:00AM / RIVAL ATLETICO NACIONAL" */
  const renglonJornada = useMemo(() => {
    const partes: string[] = [];
    const j = [limpiar(jornada), fechaBonita].filter(Boolean).join(' ');
    if (j) partes.push(`FECHA ${j.toUpperCase()}`);
    if (limpiar(llegar)) partes.push(`LLEGAR ${limpiar(llegar).toUpperCase()}`);
    if (limpiar(rival)) partes.push(`RIVAL ${limpiar(rival).toUpperCase()}`);
    return partes.join(' / ');
  }, [jornada, fechaBonita, llegar, rival]);

  /* ── Marcador ──────────────────────────────────────────────────────────────
     NUESTROS GOLES NO SE ESCRIBEN: se suman solos. Son los goles que anotó
     cada deportista en la columna GOL, más los autogoles del rival. Así el
     formador no se equivoca ni tiene que hacer la cuenta.
     Los del rival sí se escriben, que esos no están en la planilla. */
  const golesDeLosNinos = useMemo(
    () => filas.reduce((s, f) => s + (parseInt(f.goles, 10) || 0), 0),
    [filas],
  );
  const gn = golesDeLosNinos + autogoles;
  const ge = parseInt(golesEllos, 10);
  /* EL CERO SE VE, PERO APAGADO (dirección, 26/08/2026). Las casillas del
     marcador muestran un 0 casi transparente mientras nadie haya anotado: así
     el formador entiende de una que ahí se escribe, y al mismo tiempo no se
     confunde creyendo que el partido ya quedó 0 a 0. Apenas se escribe el
     marcador del rival —así sea un 0 de verdad— los números se prenden y sale
     el resultado. */
  const marcadorActivo = String(golesEllos).trim() !== '';
  const hayMarcador = marcadorActivo && Number.isFinite(ge);
  const resultado = !hayMarcador ? '' : gn > ge ? 'VICTORIA' : gn < ge ? 'DERROTA' : 'EMPATE';
  const colorResultado = resultado === 'VICTORIA' ? VERDE : resultado === 'DERROTA' ? ROJO : AMBAR;

  /* ── Bajar la planilla en PDF ───────────────────────────────────────────
     Sale en hoja horizontal, con las columnas en el mismo orden y con los
     mismos anchos que se ven en pantalla. — 26/08/2026 */
  /* EL PDF ES SOLO DE ADMINISTRACIÓN (dirección, 26/08/2026). El formador
     llena la planilla, pero el documento que sale de aquí —el que se imprime
     o se manda— lo baja ADMON. Se comprueba con la cookie de sesión, que la
     firma el servidor: no basta con tocar el navegador para desbloquearlo.
     Se resuelve en el cliente para no desacomodar la primera pintada. */
  const [esAdmon, setEsAdmon] = useState(false);
  useEffect(() => { setEsAdmon(esSuperAdmin() || esAccesoTotal()); }, []);

  /* ── GUARDAR EL AVANCE ───────────────────────────────────────────────────
     El formador llena esto en la cancha. Si le toca parar, lo escrito NO se
     puede perder: cada cambio queda anotado en el propio aparato, y el botón
     GUARDAR lo manda a la base para poder seguirlo desde otro lado.
     — dirección, 26/08/2026 */
  const [sinGuardar, setSinGuardar] = useState(false);
  const [guardandoPlanilla, setGuardandoPlanilla] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState('');     // cuándo quedó en la base
  const [avisoGuardado, setAvisoGuardado] = useState('');
  const primeraCarga = useRef(true);

  const [bajandoPdf, setBajandoPdf] = useState(false);
  async function bajarPDF() {
    if (!esAdmon) {
      setError('El PDF de la planilla lo baja únicamente administración.');
      return;
    }
    setBajandoPdf(true);
    setError('');
    try {
      await descargarPlanillaPDF({
        numeroTorneo: numTorneo,
        torneo: nombreTorneo,
        formador: torneo?.formador ?? '',
        jornada: renglonJornada,
        columnas: orden.map(c => ({
          clave: c,
          titulo: COLUMNAS[c].h,
          ancho: anchoDe(c),
        })),
        filas: filas.map((f, i) => ({
          num: String(i + 1),
          deportista: f.deportista,
          convocado: f.convocado,
          actua: f.titular,
          posicion: f.posicion,
          minutos: f.minutos,
          faltas: f.faltas,
          amarillas: f.amarillas,
          rojas: f.rojas,
          asistencias: f.asistencias,
          goles: f.goles,
          ataja: f.ataja,
          calificacion: f.calificacion,
        })),
        resultado,
        golesNos: String(gn),
        golesEllos,
        rival,
        promedio: promedioEquipo,
        /* El archivo se llama IGUAL que el partido en el banco, para que al
           buscarlo en el computador se reconozca de una:
              FECHA 1 LIGA DESARROLLO SUB 8.pdf
           — dirección, 27/08/2026 */
        nombreArchivo: nombreEnElBanco,
      });
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo armar el PDF.');
    } finally {
      setBajandoPdf(false);
    }
  }

  /** Todo lo que hay en pantalla, listo para guardar. */
  function planillaDeAhora(): PlanillaGuardada {
    return {
      torneo_num: numTorneo,
      jornada, fecha, llegar, rival,
      goles_nos: String(gn),
      goles_ellos: golesEllos,
      autogoles: String(autogoles),
      filas,
      actualizada_en: new Date().toISOString(),
    };
  }

  /** Vuelca en pantalla una planilla guardada. */
  function ponerPlanilla(p: PlanillaGuardada) {
    setJornada(p.jornada ?? '');
    setFecha(p.fecha ?? '');
    setLlegar(p.llegar ?? '');
    setRival(p.rival ?? '');
    setGolesNos(p.goles_nos ?? '');
    setGolesEllos(p.goles_ellos ?? '');
    setAutogoles(parseInt(String((p as any).autogoles ?? '0'), 10) || 0);
    if (Array.isArray(p.filas) && p.filas.length) setFilas(p.filas as FilaPlanilla[]);
  }

  /* Cada cambio queda anotado en el aparato, sin internet de por medio.
     Es la red de seguridad: si se cierra la pantalla sin guardar, al volver
     a poner el número del torneo aparece todo como estaba. */
  useEffect(() => {
    if (!numTorneo) return;
    if (primeraCarga.current) { primeraCarga.current = false; return; }
    const t = setTimeout(() => {
      guardarBorradorLocal(planillaDeAhora());
      setSinGuardar(true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, jornada, fecha, llegar, rival, golesNos, golesEllos, autogoles, numTorneo]);

  async function guardarAvance() {
    if (!numTorneo) {
      setError('Primero escribe el número del torneo.');
      return;
    }
    /* La # FECHA es la que le pone nombre al partido en el BANCO. Sin ella no
       se sabría si esto es la fecha 1 o la 5, y el archivo quedaría revuelto.
       Lo escrito NO se pierde: ya está guardado en este aparato. — 27/08/2026 */
    if (!jornada) {
      setError('Falta escoger la # FECHA. Es la que le pone nombre al partido en el banco (FECHA 1, FECHA 2…). Lo que ya escribiste está a salvo en este aparato.');
      return;
    }
    const p = planillaDeAhora();
    guardarBorradorLocal(p);             // primero lo seguro, sin internet
    setGuardandoPlanilla(true);
    setError('');
    try {
      await guardarPlanilla(p);
      setSinGuardar(false);
      setGuardadoEn(p.actualizada_en);
      setAvisoGuardado('Guardado');
      setTimeout(() => setAvisoGuardado(''), 2200);
      refrescarBanco();                  // que aparezca de una en el archivo
    } catch (e: any) {
      /* Si la base no responde (sin señal en la cancha, o falta la tabla), el
         avance NO se perdió: quedó en el aparato. Se dice tal cual. */
      setError(
        (e?.message ?? 'No se pudo guardar en la base.') +
        ' Tranquilo: el avance quedó guardado en este aparato y se puede volver a intentar.',
      );
    } finally {
      setGuardandoPlanilla(false);
    }
  }

  /* ── Borrar lo de ESTE juego ─────────────────────────────────────────────
     Deja la planilla como recién abierta: vuelve a salir la lista de los
     deportistas asignados al torneo, en blanco. No toca a los deportistas ni
     al cuadro de torneos: solo lo que se escribió de este partido.
     — dirección, 26/08/2026 */
  const [borrando, setBorrando] = useState(false);
  async function borrarEsteJuego() {
    if (!numTorneo) return;
    /* Se borra SOLO este partido — este torneo en esta fecha. Los otros
       partidos del mismo torneo que estén en el banco no se tocan. */
    const comoSeLlama = jornada
      ? `${etiquetaFecha(jornada)} ${nombreTorneo}`
      : `el torneo ${numTorneo} (todavía sin fecha)`;
    const ok = confirm(
      `¿Borrar todo lo que se escribió de ${comoSeLlama}?\n\n` +
      'Se van los minutos, tarjetas, goles, calificaciones y el marcador.\n' +
      'Los deportistas asignados vuelven a salir en blanco.\n\n' +
      'Los demás partidos de este torneo que estén en el banco NO se tocan.\n\n' +
      'Esto no se puede deshacer.',
    );
    if (!ok) return;

    setBorrando(true);
    setError('');
    try {
      borrarBorradorLocal(numTorneo, jornada);
      if (jornada) await borrarPlanilla(numTorneo, jornada);   // sin tabla o sin señal, no estorba
    } catch { /* lo del aparato ya quedó borrado, que es lo que se ve */ }

    /* Se fuerza el rearmado: si no, la pantalla creería que ya está armada. */
    ultimoArmado.current = '';
    primeraCarga.current = true;
    setJornada(''); setFecha(''); setLlegar(''); setRival('');
    setGolesNos(''); setGolesEllos(''); setAutogoles(0);
    setGuardadoEn('');
    setSinGuardar(false);
    setFilas(convocables.map((d, i) => ({
      ...filaNueva(i),
      posicion: posicionDe(d),
      deportista: limpiar(d._nombre).toUpperCase(),
    })));
    setBorrando(false);
    refrescarBanco();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     EL BANCO POSPARTIDO — el archivo de todos los partidos elaborados.

     La dirección lo pidió así (27/08/2026): cada partido guardado se nombra
     con la fecha primero y el torneo después —

           FECHA 1  LIGA DESARROLLO SUB 8

     — y quedan agrupados por torneo, para que de un vistazo se vea cuántas
     fechas lleva jugadas cada equipo. Al oprimir una, se abre en la planilla
     de arriba tal como quedó guardada.
     ═══════════════════════════════════════════════════════════════════════════ */
  const [banco, setBanco] = useState<FichaBanco[] | null>(null);
  const [bancoFalta, setBancoFalta] = useState(false);   // la tabla no existe todavía
  const [cargandoBanco, setCargandoBanco] = useState(true);

  const refrescarBanco = useCallback(() => {
    setCargandoBanco(true);
    getBanco()
      .then(b => {
        if (b === undefined) { setBancoFalta(true); setBanco([]); }
        else { setBancoFalta(false); setBanco(b); }
      })
      .catch(() => setBanco([]))
      .finally(() => setCargandoBanco(false));
  }, []);

  useEffect(() => { refrescarBanco(); }, [refrescarBanco]);

  /** El nombre del torneo número N, tal como se escribe en el banco. */
  const nombreDeTorneoNum = useCallback((num: string): string => {
    const n = parseInt(num, 10);
    if (!cuadro || !Number.isFinite(n) || n < 1 || n > cuadro.length) return `TORNEO ${num}`;
    const t = cuadro[n - 1];
    /* Sin el NOMBRE (REGOL, WONDER…): la dirección lo escribe así —
       "LIGA DESARROLLO SUB 8". — 27/08/2026 */
    return [t.torneo, t.programa, t.categoria].map(limpiar).filter(Boolean).join(' ')
        || `TORNEO ${num}`;
  }, [cuadro]);

  /** Los partidos del banco, agrupados por torneo y ordenados por fecha. */
  const bancoPorTorneo = useMemo(() => {
    const grupos = new Map<string, FichaBanco[]>();
    for (const f of banco ?? []) {
      if (!grupos.has(f.torneo_num)) grupos.set(f.torneo_num, []);
      grupos.get(f.torneo_num)!.push(f);
    }
    return [...grupos.entries()]
      .map(([num, partidos]) => ({
        num,
        titulo: nombreDeTorneoNum(num),
        partidos: partidos.sort((a, b) => numeroDeFecha(a.jornada) - numeroDeFecha(b.jornada)),
      }))
      .sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
  }, [banco, nombreDeTorneoNum]);

  /** Abre en la planilla de arriba un partido del banco. */
  function abrirDelBanco(f: FichaBanco) {
    setError('');
    ultimoArmado.current = '';        // que el armado vuelva a correr
    setNumTorneo(f.torneo_num);
    setJornada(f.jornada);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* nada */ }
  }

  /** VICTORIA / EMPATE / DERROTA de un partido del banco. */
  function comoQuedo(f: FichaBanco): { texto: string; color: string } | null {
    const nos = parseInt(f.goles_nos, 10);
    const ellos = parseInt(f.goles_ellos, 10);
    if (!Number.isFinite(nos) || !Number.isFinite(ellos)) return null;
    if (nos > ellos)  return { texto: 'GANAMOS', color: VERDE };
    if (nos < ellos)  return { texto: 'PERDIMOS', color: ROJO };
    return { texto: 'EMPATE', color: AMBAR };
  }

  /* ── Editar ────────────────────────────────────────────────────────────── */
  function editar(id: string, campo: keyof FilaPlanilla, valor: string | boolean) {
    setFilas(prev => prev.map(f => (f.id === id ? { ...f, [campo]: valor } as FilaPlanilla : f)));
  }

  /* ── Encabezados de la planilla ──────────────────────────────────────────
     El orden lo manda la dirección: se agarra un título y se arrastra al lado
     que quiera. Queda guardado en este computador, así que al volver a entrar
     el cuadro está como lo dejó. — 26/08/2026 */
  const anchoDe = (c: ClaveCol) => anchos[c] ?? COLUMNAS[c].w;

  /* ── EL PROMEDIO DEL EQUIPO ──────────────────────────────────────────────
     El promedio de las calificaciones que ya estén puestas. No cuenta a los
     que no tienen nota, ni a los que no fueron convocados: si contaran como
     cero, un equipo con media planilla sin calificar saldría por el piso.
     — dirección, 26/08/2026 */
  const promedioEquipo = useMemo(() => {
    const notas = filas
      .map(f => parseFloat(String(f.calificacion ?? '').replace(',', '.')))
      .filter(n => Number.isFinite(n) && n > 0);
    if (!notas.length) return '';
    const prom = notas.reduce((a, b) => a + b, 0) / notas.length;
    return prom.toFixed(1).replace('.', ',');
  }, [filas]);


  function empezarEstirada(clave: ClaveCol, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    estirando.current = { clave, x0: e.clientX, w0: anchoDe(clave) };
    setEstirandoCual(clave);
  }

  function empezarArrastre(i: number) { arrastrando.current = i; }
  function soltarEn(destino: number) {
    const desde = arrastrando.current;
    arrastrando.current = null;
    if (desde === null || desde === destino) return;
    const next = [...orden];
    const [movida] = next.splice(desde, 1);
    next.splice(destino, 0, movida);
    setOrden(next);
    guardarOrden(next);
  }

  /** El contenido de una casilla, según la columna que le toque. */
  function contenidoCelda(clave: ClaveCol, f: FilaPlanilla, i: number) {
    /* Si no fue convocado, no hay nada que anotarle: sus casillas dicen N/A y
       no se dejan escribir. El número, el nombre, la posición y la propia
       casilla de CONVOCADO sí se siguen viendo. — 26/08/2026 */
    const noVino = f.convocado === 'No convocado';
    const SE_APAGAN: ClaveCol[] = [
      'actua', 'minutos', 'faltas', 'amarillas', 'rojas',
      'asistencias', 'goles', 'ataja', 'calificacion',
    ];
    if (noVino && SE_APAGAN.includes(clave)) return <NoAplica />;

    /* ATA son las ATAJADAS DEL ARQUERO. Solo la llena el que juega de portero;
       a los demás no les aplica y la casilla queda cerrada, para que nadie le
       anote atajadas a un delantero. — dirección, 26/08/2026 */
    if (clave === 'ataja' && !esPortero(f.posicion)) return <NoAplica />;

    switch (clave) {
      case 'num':
        return <span className="block text-center font-black text-white text-[14px]">{i + 1}</span>;
      case 'deportista':
        return (
          <Celda valor={f.deportista} placeholder="Nombre del deportista" grande
            onChange={v => editar(f.id, 'deportista', v.toUpperCase())} />
        );
      case 'convocado':
        return (
          <Escoger valor={f.convocado} opciones={OPC_CON} colores={COLOR_CON} grande
            titulo="Clic para cambiar: Convocado o No convocado"
            onChange={v => editar(f.id, 'convocado', v)} />
        );
      case 'actua':
        return (
          <Escoger valor={f.titular} opciones={OPC_TIT} colores={COLOR_TIT}
            titulo="Clic para cambiar: Titular · Suplente · No jugó"
            onChange={v => editar(f.id, 'titular', v)} />
        );
      case 'posicion':
        return <CeldaPosiciones valor={f.posicion} onChange={v => editar(f.id, 'posicion', v)} />;
      case 'amarillas':
        return (
          <Escoger valor={f.amarillas as '' | '1' | '2'} opciones={OPC_AMA} colores={COLOR_AMA}
            titulo="Clic para marcar amarilla (1 o 2)"
            onChange={v => editar(f.id, 'amarillas', v)} />
        );
      case 'rojas':
        return (
          <Escoger valor={f.rojas as '' | '1'} opciones={OPC_ROJ} colores={COLOR_ROJ}
            titulo="Clic para marcar la roja"
            onChange={v => editar(f.id, 'rojas', v)} />
        );
      case 'calificacion':
        return (
          <select
            value={f.calificacion}
            onChange={e => editar(f.id, 'calificacion', e.target.value)}
            title="Calificación del partido, de 1,0 a 5,0"
            style={{ height: 26, background: 'transparent', border: 'none' }}
            className="w-full text-center text-[12px] font-black text-white outline-none cursor-pointer">
            <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
            {NOTAS.map(n => (
              <option key={n} value={n} style={{ color: '#111827', backgroundColor: 'white' }}>{n}</option>
            ))}
          </select>
        );
      /* GOL · ASI · FAL · MIN — se escogen de una lista, no se escriben. */
      case 'goles':
        return <ListaNumeros valor={f.goles} opciones={GOLES_POSIBLES}
          titulo="Goles del deportista" onChange={v => editar(f.id, 'goles', v)} />;
      case 'asistencias':
        return <ListaNumeros valor={f.asistencias} opciones={GOLES_POSIBLES}
          titulo="Asistencias del deportista" onChange={v => editar(f.id, 'asistencias', v)} />;
      case 'faltas':
        return <ListaNumeros valor={f.faltas} opciones={GOLES_POSIBLES}
          titulo="Faltas cometidas" onChange={v => editar(f.id, 'faltas', v)} />;
      case 'minutos':
        return <ListaNumeros valor={f.minutos} opciones={MINUTOS_POSIBLES}
          titulo="Minutos jugados, de 5 en 5" onChange={v => editar(f.id, 'minutos', v)} />;
      case 'ataja':
        return <ListaNumeros valor={f.ataja} opciones={GOLES_POSIBLES}
          titulo="Atajadas del arquero" onChange={v => editar(f.id, 'ataja', v)} />;
      default:
        return (
          <Celda valor={f[clave]} numero centro placeholder="0"
            onChange={v => editar(f.id, clave, v)} />
        );
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen pb-16" style={{ background: LIENZO }}>

      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>
        <button onClick={() => router.push('/dashboard')} aria-label="Volver"
          className="rounded-xl flex items-center justify-center shrink-0"
          style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-black text-base leading-tight">Crear Pos Partido</h1>
          <p className="text-white/55 text-[11px] leading-tight truncate">
            {nombreTorneo || 'Escribe el número del torneo para armar la planilla'}
          </p>
        </div>
        {!!numTorneo && (
          <button onClick={guardarAvance} disabled={guardandoPlanilla}
            title="Guardar el avance de esta planilla"
            className="rounded-lg flex items-center gap-1.5 px-2.5 shrink-0 text-white font-black text-[11px] disabled:opacity-60"
            style={{ height: 32, background: sinGuardar ? AMBAR : VERDE }}>
            {guardandoPlanilla
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : avisoGuardado ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {avisoGuardado || 'GUARDAR'}
          </button>
        )}

        {esAdmon && (
        <button onClick={bajarPDF} disabled={bajandoPdf}
          title="Bajar esta planilla en PDF (solo administración)"
          className="rounded-lg flex items-center gap-1.5 px-2.5 shrink-0 text-white font-black text-[11px] disabled:opacity-60"
          style={{ height: 32, background: CAMPO, border: `1px solid ${BORDE}` }}>
          {bajandoPdf
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileDown className="w-3.5 h-3.5" />}
          PDF
        </button>
        )}

        <div className="text-right leading-tight hidden sm:block">
          <p className="text-white font-black text-[13px] tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/45 text-[10px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1350 }}>

        {error && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
            style={{ background: 'rgba(192,80,77,.18)', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
            <p className="text-white text-[12px] font-semibold">{error}</p>
          </div>
        )}

        {/* ── TORNEO # ── */}
        <div className="rounded-2xl p-4 mb-3" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-white font-black text-[15px]">TORNEO #</span>
            <input
              value={numTorneo}
              inputMode="numeric"
              onChange={e => setNumTorneo(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="1"
              style={{ width: 96, height: 44, background: VERDE, border: 'none' }}
              className="rounded-xl text-center text-white font-black text-[20px] outline-none placeholder:text-white/40"
            />

            {/* El torneo, en el mismo renglón del número: así no se pierde
                un espacio de pantalla en una caja aparte. — 26/08/2026 */}
            {nombreTorneo ? (
              <div className="min-w-0">
                <p className="text-white font-black text-[19px] leading-tight truncate">
                  {nombreTorneo}
                </p>
                {torneo?.formador && (
                  <p className="text-white/55 text-[12px] font-semibold leading-tight">
                    Formador: <span className="text-white font-black">{torneo.formador}</span>
                  </p>
                )}
              </div>
            ) : (
              !cargando && cuadro !== null && numTorneo === '' && (
                <span className="text-white/25 font-black text-[19px]">
                  Escribe el número del torneo…
                </span>
              )
            )}
            {cargando && (
              <span className="flex items-center gap-2 text-white/50 text-[12px] font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Leyendo el cuadro de torneos…
              </span>
            )}
            {!cargando && cuadro === null && (
              <span className="text-[12px] font-bold" style={{ color: AMBAR }}>
                Todavía no existe el cuadro de torneos. Corre PASO-CREAR-TABLA-TORNEOS.bat.
              </span>
            )}
            {!cargando && cuadro !== null && numTorneo !== '' && !torneo && (
              <span className="text-[12px] font-bold" style={{ color: AMBAR }}>
                No hay un torneo con el número {numTorneo}. El cuadro tiene {cuadro.length}.
              </span>
            )}
          </div>

          {/* # FECHA · DÍA DEL JUEGO · HORA LLEGADA · RIVAL.
              El DÍA DEL JUEGO se señala en un calendario: no hay que escribir
              nada ni acordarse del formato. Por dentro se guarda como
              AAAA-MM-DD y en pantalla se muestra "SAB 4 AGO 2026".
              El # FECHA sale de una lista (1A a 30A) para que todo el mundo la
              escriba igual. — dirección, 26/08/2026 */}
          {/* Los anchos NO son iguales a propósito (dirección, 26/08/2026):
              el reloj ocupa lo justo y RIVAL se lleva el espacio grande, que es
              donde va un nombre largo. */}
          <div className="grid grid-cols-2 gap-2 mt-3
            sm:grid-cols-[0.8fr_1fr_212px_2fr]">
            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                # FECHA
              </label>
              <select value={jornada} onChange={e => setJornada(e.target.value)}
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}
                className="w-full rounded-lg px-2 text-white text-[12.5px] font-bold outline-none cursor-pointer">
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
                {/* Si venía algo escrito de antes que no está en la lista, no se pierde. */}
                {jornada && !NUM_FECHAS.includes(jornada) && (
                  <option value={jornada} style={{ color: '#111827', backgroundColor: 'white' }}>{jornada}</option>
                )}
                {NUM_FECHAS.map(f => (
                  <option key={f} value={f} style={{ color: '#111827', backgroundColor: 'white' }}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                DÍA DEL JUEGO
              </label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38, colorScheme: 'dark' }}
                className="w-full rounded-lg px-2.5 text-white text-[12.5px] font-bold outline-none cursor-pointer" />
            </div>

            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                HORA LLEGADA
              </label>
              <RelojLlegada valor={llegar} onChange={setLlegar} />
            </div>

            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                RIVAL
              </label>
              <input value={rival} onChange={e => setRival(e.target.value)}
                placeholder="ATLETICO NACIONAL"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}
                className="w-full rounded-lg px-2.5 text-white text-[12.5px] font-bold outline-none placeholder:text-white/20" />
            </div>

          </div>

          {renglonJornada && (
            <p className="text-white font-black text-[13.5px] mt-3">{renglonJornada}</p>
          )}
        </div>

        {/* ── LA PLANILLA ── */}
        {/* ── EN EL CELULAR EL NOMBRE NO SE VA ─────────────────────────────
            El formador llena esta planilla desde el teléfono, corriendo el
            cuadro hacia el lado columna por columna. Si el nombre se corre con
            todo lo demás, uno termina poniéndole el gol al que no era. Por eso
            el N° y el DEPORTISTA quedan CLAVADOS a la izquierda: el resto de
            columnas pasa por debajo de ellos. En el celular el nombre se
            angosta para que quede pantalla para lo demás. — 26/08/2026 */}
        <style>{`
          /* En el celular el nombre se angosta, para que quede pantalla
             para las columnas que vienen detrás. */
          @media (max-width: 700px) {
            .plan-fija-dep { width: 132px !important; max-width: 132px; }
            .plan-fija-dep input { font-size: 10.5px; }
          }
        `}</style>

        <p className="text-white/35 text-[11px] mb-1.5 px-1">
          Arrastra el <span className="text-white/60 font-bold">título verde</span> para mover una
          columna de lugar, o su <span className="text-white/60 font-bold">borde derecho</span> para
          hacerla más ancha o más angosta. Queda guardado solo en este computador: al volver a
          entrar, el cuadro está como lo dejaste.
        </p>

        <div className="rounded-xl overflow-auto"
          style={{ border: `1px solid ${BORDE}`, maxHeight: 'calc(100vh - 330px)' }}>
          <table className="text-[11.5px]"
            style={{
              borderCollapse: 'separate', borderSpacing: 0,
              width: '100%', minWidth: 1120,
              /* Fijo: cada columna respeta el ancho que le pusimos arriba. Sin
                 esto, un nombre largo estira la columna y en el celular la
                 columna congelada se come media pantalla. */
              tableLayout: 'fixed',
            }}>
            <thead>
              <tr>
                {orden.map((clave, i) => {
                  const c = COLUMNAS[clave];
                  /* Las dos primeras columnas, sean las que sean, quedan
                     clavadas a la izquierda: es lo que permite llenar la
                     planilla desde el celular sin perder de vista el nombre. */
                  const fija = i <= 1;
                  const izq  = i === 0 ? 0 : anchoDe(orden[0]);
                  return (
                    <th key={clave}
                      draggable
                      onDragStart={() => empezarArrastre(i)}
                      onDragOver={e => { e.preventDefault(); setEncima(i); }}
                      onDragLeave={() => setEncima(v => (v === i ? null : v))}
                      onDrop={e => { e.preventDefault(); setEncima(null); soltarEn(i); }}
                      onDragEnd={() => setEncima(null)}
                      title={COLUMNAS[clave].ayuda
                        ? `${COLUMNAS[clave].ayuda} · arrastra el título para mover la columna`
                        : 'Arrastra el título para mover la columna de lugar'}
                      className={`relative sticky top-0 px-2 py-3 text-center font-black text-[14px] tracking-wide whitespace-nowrap text-white cursor-grab select-none
                        ${clave === 'deportista' ? 'plan-fija-dep' : ''}`}
                      style={{
                        background: c.fondo ?? VERDE,
                        borderRight: BLANCO, borderBottom: BLANCO, borderTop: BLANCO,
                        width: anchoDe(clave),
                        position: 'sticky',
                        top: 0,
                        left: fija ? izq : undefined,
                        zIndex: fija ? 16 : 10,
                        outline: encima === i ? `2px dashed #ffffff` : undefined,
                        outlineOffset: -2,
                      }}>
                      <span className="pointer-events-none">{c.h}</span>
                      {/* La manija para estirar: se agarra el borde y se corre. */}
                      <span
                        onMouseDown={e => empezarEstirada(clave, e)}
                        onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                        title="Arrastra este borde para hacer la columna más ancha o más angosta"
                        style={{
                          position: 'absolute', right: 0, top: 0, height: '100%', width: 10,
                          cursor: 'col-resize',
                          background: estirandoCual === clave ? 'rgba(255,255,255,.55)' : 'transparent',
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                  /* El renglón del que NO fue convocado ya no se apaga: antes
                     el gris se comía la fuerza del rojo. Lo que cambia es que
                     sus casillas de datos dicen N/A. — 26/08/2026 */
                  <tr key={f.id} style={{ background: PANEL }}>
                    {orden.map((clave, k) => {
                      const fija = k <= 1;
                      const izq  = k === 0 ? 0 : anchoDe(orden[0]);
                      /* TODAS las casillas llevan el mismo gris oscuro: antes
                         las dos primeras iban en un gris más oscuro y, al mover
                         las columnas de lugar, quedaba una franja distinta en
                         la mitad del cuadro (dirección, 26/08/2026).
                         Solo el N° y la CALIFICACIÓN van en verde.
                         El fondo tiene que ser sólido —no transparente— porque
                         las columnas clavadas dejan pasar el resto por debajo
                         cuando se corre el cuadro hacia el lado. */
                      const fondo = clave === 'num' || clave === 'calificacion'
                                  ? VERDE
                                  : PANEL;
                      return (
                        <td key={clave}
                          className={`px-1 py-[4px] ${clave === 'deportista' ? 'plan-fija-dep' : ''}`}
                          style={{
                            borderRight: BLANCO, borderBottom: BLANCO,
                            background: fondo,
                            position: fija ? 'sticky' : undefined,
                            left: fija ? izq : undefined,
                            zIndex: fija ? 5 : undefined,
                          }}>
                          {contenidoCelda(clave, f, i)}
                        </td>
                      );
                    })}
                  </tr>
              ))}

              {/* NO HAY BOTÓN PARA AGREGAR RENGLONES (dirección, 26/08/2026).
                  La lista sale ÚNICAMENTE de Total Afiliados: si falta un
                  jugador, es porque allá no se le ha puesto ese torneo en C1,
                  C2, C3 o C4. Poder agregar un renglón a mano invitaba a meter
                  en la planilla a alguien que no está inscrito, y ahí se
                  desconectaba todo lo demás. */}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={orden.length} className="py-8 text-center"
                    style={{ background: PANEL, borderRight: BLANCO, borderBottom: BLANCO }}>
                    <p className="text-white/70 text-[13px] font-black">
                      Este torneo todavía no tiene deportistas asignados.
                    </p>
                    <p className="text-white/45 text-[12px] mt-1">
                      Ponle el número del torneo en C1, C2, C3 o C4 de cada ficha,
                      en Total Afiliados, y aquí aparecen solos.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── MARCADOR ── */}
        <div className="rounded-2xl p-4 mt-2 flex flex-wrap items-center justify-center gap-4"
          style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

          <div className="rounded-xl px-6 py-3 text-center"
            style={{ background: resultado ? colorResultado : CAMPO, minWidth: 190,
                     border: resultado ? 'none' : `1px solid ${BORDE}` }}>
            <p className="text-white font-black text-[19px] tracking-wide">
              {resultado || 'SIN MARCADOR'}
            </p>
          </div>

          <div className="text-center px-2" style={{ minWidth: 170 }}>
            <p className="text-white font-black text-[19px] leading-tight">FUTURO</p>
            <p className="text-white font-black text-[19px] leading-tight">ANTIOQUIA</p>
          </div>

          {/* Nuestro marcador se suma solo: goles de los deportistas + autogoles. */}
          <div className="rounded-xl flex flex-col items-center justify-center"
            style={{ width: 68, height: 68, background: VERDE }}
            title={`${golesDeLosNinos} de los deportistas${autogoles ? ` + ${autogoles} autogol${autogoles > 1 ? 'es' : ''} del rival` : ''}`}>
            <span className="font-black text-[30px] leading-none"
              style={{ color: marcadorActivo || gn > 0 ? '#ffffff' : 'rgba(255,255,255,.22)' }}>
              {gn}
            </span>
          </div>

          <span className="text-white font-black text-[22px]">VS</span>

          <input value={golesEllos} inputMode="numeric"
            onChange={e => setGolesEllos(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
            title="Los goles del rival. Escríbelos aquí, aunque sean 0."
            style={{ width: 68, height: 68, background: ROJO, border: 'none' }}
            className="rounded-xl text-center text-white font-black text-[30px] outline-none
              placeholder:text-white/[.22]" />

          <div className="text-center px-2" style={{ minWidth: 170 }}>
            {limpiar(rival)
              ? enDosLineas(rival).map((r, i) => (
                  <p key={i} className="text-white font-black text-[19px] leading-tight">{r}</p>
                ))
              : <p className="text-white/25 font-black text-[19px] leading-tight">RIVAL</p>}
          </div>

        </div>

        {/* LOS BOTONES VAN DEBAJO DEL MARCADOR (dirección, 26/08/2026): el
            cuadro y su marcador quedan pegados, como se lee un partido, y lo
            demás va después, ya aparte.
            GUARDAR quedó SOLO arriba, en el encabezado: tenerlo dos veces
            confundía sobre si eran dos guardadas distintas. */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* AUTOGOL RIVAL — goles que el rival se metió en su propia puerta.
              Suman a nuestro marcador, pero no son de ningún deportista
              nuestro, así que no van en la columna GOL. Se escoge de una lista
              de 1 a 5, igual que todo lo demás. — dirección, 26/08/2026 */}
          <div className="flex items-center gap-2 rounded-lg px-2.5"
            style={{ height: 34, background: CAMPO, border: `1px solid ${autogoles > 0 ? VERDE : BORDE}` }}>
            <span className="text-white/60 text-[10.5px] font-black tracking-wide">AUTOGOL RIVAL</span>
            <select
              value={autogoles ? String(autogoles) : ''}
              onChange={e => setAutogoles(parseInt(e.target.value, 10) || 0)}
              title="Autogoles del rival. Suman a nuestro marcador."
              style={{
                height: 26, width: 54,
                background: autogoles > 0 ? VERDE : 'transparent',
                border: `1px solid ${autogoles > 0 ? VERDE : BORDE}`,
                color: autogoles > 0 ? '#ffffff' : 'rgba(255,255,255,.35)',
              }}
              className="rounded text-center text-[13px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>—</option>
              {['1', '2', '3', '4', '5'].map(n => (
                <option key={n} value={n} style={{ color: '#111827', backgroundColor: 'white' }}>{n}</option>
              ))}
            </select>
          </div>

          <button onClick={borrarEsteJuego} disabled={borrando || !numTorneo}
            title="Borrar la información de este juego: deja la planilla en blanco"
            className="rounded-lg px-2.5 font-black text-[10.5px] flex items-center gap-1 disabled:opacity-40"
            style={{ height: 30, background: 'transparent', border: `1px solid ${ROJO}`, color: ROJO }}>
            {borrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            INFO
          </button>

          {/* PROMEDIO DEL EQUIPO — contra la esquina derecha. El letrero va por
              FUERA del cuadro verde: adentro solo la nota, que es lo que se
              mira. No se oprime, es el resumen de las calificaciones.
              — dirección, 26/08/2026 */}
          <div className="ml-auto flex items-center gap-2.5 select-none"
            title="Promedio de las calificaciones puestas en la columna CAL">
            <span className="text-white/50 font-black text-[10.5px] tracking-wide leading-tight text-right">
              PROMEDIO<br />EQUIPO
            </span>
            <div className="rounded-xl flex items-center justify-center"
              style={{
                height: 44, minWidth: 72,
                background: promedioEquipo ? VERDE : CAMPO,
                border: `1px solid ${promedioEquipo ? VERDE : BORDE}`,
              }}>
              <span className="text-white font-black text-[22px] leading-none">
                {promedioEquipo || <span className="text-white/30 text-[15px]">—</span>}
              </span>
            </div>
          </div>
          {sinGuardar ? (
            <p className="text-[11.5px] font-bold" style={{ color: AMBAR }}>
              Tienes cambios sin guardar.
            </p>
          ) : guardadoEn ? (
            <p className="text-white/45 text-[11.5px] font-semibold">
              Guardado {cuandoBonito(guardadoEn)}.
            </p>
          ) : null}

          {numTorneo && convocables.length > 0 ? (
            <p className="text-white/45 text-[11px]">
              <span className="text-white font-black">{convocables.length} deportistas</span> tienen
              el torneo {numTorneo} asignado en Total Afiliados. Si falta alguno, hay que
              ponerle ese torneo en su ficha: aquí no se agregan a mano.
            </p>
          ) : numTorneo && torneo ? (
            <p className="text-[11px] font-semibold" style={{ color: AMBAR }}>
              Todavía ningún deportista tiene el torneo {numTorneo} puesto en C1, C2, C3 o C4.
              Asígnalos en Total Afiliados y la planilla se arma sola.
            </p>
          ) : (
            <p className="text-white/40 text-[11px]">
              Escribe el número del torneo y salen solos los deportistas asignados.
            </p>
          )}
        </div>

        {/* El desglose se ve SIEMPRE que haya torneo, aunque vaya en cero: así
            se comprueba de un vistazo que la suma está corriendo. */}
        {!!numTorneo && (
          <p className="text-white/45 text-[11.5px] text-center mt-2">
            Nuestro marcador se suma solo:
            {' '}<span className="text-white font-black">{golesDeLosNinos}</span> de los deportistas
            {autogoles > 0 && (
              <> {' + '}<span className="text-white font-black">{autogoles}</span> autogol{autogoles > 1 ? 'es' : ''} del rival</>
            )}
            {' = '}<span className="text-white font-black">{gn}</span>.
          </p>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            BANCO POSPARTIDO — el archivo de todos los partidos elaborados.
            Agrupados por torneo; cada partido se nombra FECHA 1, FECHA 2…
            Al oprimir uno, se abre arriba tal como quedó guardado.
            — dirección, 27/08/2026
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl mt-6 overflow-hidden"
             style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

          {/* Título */}
          <div className="flex items-center gap-3 px-4 py-3"
               style={{ background: VERDE }}>
            <Archive className="w-5 h-5 text-white shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-black text-[15px] tracking-wide">BANCO POSPARTIDO</h2>
              <p className="text-white/75 text-[11px] font-semibold">
                Todos los partidos ya elaborados. Oprime uno para abrirlo.
              </p>
            </div>
            <button
              onClick={refrescarBanco}
              disabled={cargandoBanco}
              title="Volver a leer el archivo"
              className="shrink-0 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 transition hover:opacity-80 disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,.18)' }}>
              <RefreshCw className={`w-3.5 h-3.5 text-white ${cargandoBanco ? 'animate-spin' : ''}`} />
              <span className="text-white text-[11px] font-black">Actualizar</span>
            </button>
          </div>

          <div className="p-4">
            {/* Falta la tabla en la base */}
            {bancoFalta ? (
              <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                   style={{ background: 'rgba(224,163,58,.14)', border: `1px solid ${AMBAR}` }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBAR }} />
                <p className="text-white text-[12px] font-semibold leading-relaxed">
                  El banco todavía no está preparado en la base.
                  Corre una sola vez <span className="font-black">PASO-BANCO-POSPARTIDO.bat</span> y
                  vuelve a entrar. Mientras tanto lo que escribas queda guardado en este aparato.
                </p>
              </div>

            ) : cargandoBanco && banco === null ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: GRIS }} />
                <span className="text-white/50 text-[12px] font-semibold">Abriendo el archivo…</span>
              </div>

            ) : bancoPorTorneo.length === 0 ? (
              <p className="text-white/40 text-[12px] font-semibold text-center py-4">
                Todavía no hay ningún partido archivado. El primero que guardes aparece aquí.
              </p>

            ) : (
              <div className="flex flex-col gap-3">
                {bancoPorTorneo.map(g => (
                  <div key={g.num} className="rounded-xl overflow-hidden"
                       style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>

                    {/* Nombre del torneo + cuántas fechas lleva */}
                    <div className="flex items-center gap-2 px-3 py-2"
                         style={{ borderBottom: `1px solid ${BORDE}` }}>
                      <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black text-white"
                            style={{ background: BORDE }}>#{g.num}</span>
                      <span className="text-white font-black text-[13px] truncate">{g.titulo}</span>
                      <span className="ml-auto shrink-0 text-white/45 text-[11px] font-bold">
                        {g.partidos.length} {g.partidos.length === 1 ? 'partido' : 'partidos'}
                      </span>
                    </div>

                    {/* Las fechas */}
                    <div className="flex flex-wrap gap-2 p-3">
                      {g.partidos.map(f => {
                        const res = comoQuedo(f);
                        const abierto = numTorneo === f.torneo_num && jornada === f.jornada;
                        return (
                          <button
                            key={`${f.torneo_num}|${f.jornada}`}
                            onClick={() => abrirDelBanco(f)}
                            title={`Abrir ${etiquetaFecha(f.jornada)} ${g.titulo}`}
                            className="text-left rounded-lg px-3 py-2 transition hover:brightness-125"
                            style={{
                              background: PANEL,
                              border: `1px solid ${abierto ? VERDE : BORDE}`,
                              boxShadow: res ? `inset 4px 0 0 0 ${res.color}` : undefined,
                              minWidth: 150,
                            }}>
                            <div className="text-white font-black text-[12.5px]">
                              {etiquetaFecha(f.jornada)}
                            </div>
                            <div className="text-white/55 text-[10.5px] font-semibold truncate"
                                 style={{ maxWidth: 190 }}>
                              {f.rival ? `vs ${f.rival.toUpperCase()}` : 'sin rival'}
                            </div>
                            {res && (
                              <div className="text-[10.5px] font-black mt-0.5" style={{ color: res.color }}>
                                {f.goles_nos || '0'} — {f.goles_ellos || '0'}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
