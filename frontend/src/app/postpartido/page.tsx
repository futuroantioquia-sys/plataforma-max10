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
  Archive, RefreshCw, X, Zap,
} from 'lucide-react';
import { getCuadro, limpiar, type FilaTorneo } from '@/lib/torneos';
import { esSuperAdmin, esAccesoTotal, esProfesor } from '@/lib/permisos';
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

/* ── LOS COLORES DEL CÓDIGO ───────────────────────────────────────────────
   Son los MISMOS de Total Afiliados (dirección, 27/08/2026): el código dice de
   un vistazo qué clase de afiliado es cada uno, y esa lectura tiene que ser
   igual en toda la plataforma. Si aquí fueran otros colores, uno terminaría
   aprendiéndose dos idiomas para lo mismo.

       NUEVO      naranja
       ANTIGUO    verde
       REINGRESO  azul
       B / MB     gris   (institucional · becado)
*/
const COD_VERDE   = '#16a34a';   // ANTIGUO
const COD_NARANJA = '#f97316';   // NUEVO
const COD_AZUL    = '#2563eb';   // REINGRESO
const COD_GRIS    = '#6b7280';   // B / MB institucional y todo lo demás

function colorDelCodigo(codigo: string, afiliacion: string, estado: string): string {
  const cod  = String(codigo ?? '').trim().toUpperCase();
  const afil = String(afiliacion ?? '').toLowerCase();
  const est  = String(estado ?? '').toLowerCase();
  /* Los que empiezan por B o MB van SIEMPRE en gris, así el código mande sobre
     el tipo de afiliación (misma regla que en Total Afiliados). */
  if (/^M?B/.test(cod))       return COD_GRIS;
  if (est.includes('retir'))  return '#9ca3af';
  if (afil.includes('nuevo')) return COD_NARANJA;
  if (afil.includes('antigu'))return COD_VERDE;
  if (afil.includes('reingreso')) return COD_AZUL;
  return COD_GRIS;
}

/** 120000 → "$ 120.000". Para el letrero del botón de cobrar el torneo. */
function plata(n: number): string {
  return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

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

/* Para crear los cobros de torneo en `otros_pagos`. Es la misma base de
   siempre; se ponen aquí porque esta pantalla no usaba esa tabla. */
const SB_URL_COBROS = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY_COBROS = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDR_COBROS = {
  apikey: SB_KEY_COBROS,
  Authorization: `Bearer ${SB_KEY_COBROS}`,
  'Content-Type': 'application/json',
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
  /* De quién es esta fila. Se guarda para poder cobrarle el torneo sin tener
     que adivinar por el nombre. Las planillas guardadas antes del 27/08/2026
     no lo traen; para esas se busca por nombre. */
  depId?: string;
  posicion: string;
  deportista: string;
  convocado: '' | 'Convocado' | 'No convocado';
  titular: '' | 'Titular' | 'Suplente' | 'No jugó' | 'No asistió';
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
            Marca hasta {MAX_POS}
          </p>
          {lista.map(pos => {
            const marcada = puestas.includes(pos);
            const llena = !marcada && puestas.length >= MAX_POS;
            return (
              <button key={pos} type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => marcar(pos)}
                title={llena ? 'Ya hay tres marcadas. Quita una para poder marcar otra.' : ''}
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
        {/* LA POSICIÓN YA NO SE ESCRIBE A MANO (dirección, 27/08/2026).
            Se escoge de la lista y punto. Escribiéndola entraban "EXTREMO",
            "extremo", "EXTREM0" y "EXT" como si fueran cuatro posiciones
            distintas, y después ningún conteo cuadraba. Tocando la casilla se
            abre la lista, igual que con la flechita. */}
        <button
          type="button"
          onClick={abrir}
          title="Toca para escoger la posición de la lista"
          className="flex-1 min-w-0 text-left bg-transparent outline-none text-[11px] font-bold
            text-white truncate cursor-pointer">
          {valor || <span className="text-white/25">—</span>}
        </button>
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
       ACTÚA  →  Titular verde · Suplente amarillo · No jugó morado · No asistió rojo
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
/* ACTÚA: las cuatro formas en que termina el partido para un deportista. En
   minúscula —Titular, Suplente, No jugó, No asistió— para que quepan en una
   columna delgada.

   NO ASISTIÓ (rojo) lo pidió la dirección el 27/08/2026 y NO es lo mismo que
   "No jugó": el que NO JUGÓ estuvo en el partido y se quedó en el banco; el
   que NO ASISTIÓ no se presentó. Uno es decisión del formador, el otro es
   falla del deportista — y por eso va en rojo, como el "No convocado". */
const OPC_TIT = ['Titular', 'Suplente', 'No jugó', 'No asistió'] as const;
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
const COLOR_TIT = { Titular: VERDE, Suplente: AMBAR, 'No jugó': MORADO, 'No asistió': ROJO };
const COLOR_AMA = { '1': AMBAR, '2': AMBAR };
const COLOR_ROJ = { '1': ROJO };

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CrearPospartidoPage() {
  const router = useRouter();

  const [cuadro, setCuadro] = useState<FilaTorneo[] | null>(null);

  /* ── CADA FORMADOR, SOLO SUS TORNEOS ─────────────────────────────────────
     (dirección, 27/08/2026 — se probó entrando como CASTRO y se alcanzaba a
     abrir la planilla de un torneo de ALVAREZ)

     El formador entra con su usuario, y ese usuario es el mismo nombre que
     aparece en la casilla FORMADOR del cuadro de Torneos y Competencias. Con
     eso basta: si el torneo que escribió no está a su cargo, no se le arma la
     planilla y se le dice de quién es.

     Administración no se toca: sigue viendo todos, que para eso los reparte. */
  const [esProfe, setEsProfe] = useState(false);
  const [nombreProfe, setNombreProfe] = useState('');
  useEffect(() => {
    setEsProfe(esProfesor());
    try {
      const guardado = localStorage.getItem('futuro-profe-nombre');
      if (guardado) {
        const n = JSON.parse(guardado);
        setNombreProfe(typeof n === 'string' ? n : String(n));
      }
    } catch { /* sin nombre guardado: más abajo se decide qué hacer */ }
  }, []);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  /* Aviso AMARILLO: el partido SÍ quedó guardado, pero a la base le faltaba
     alguna casilla y ese dato suelto no se pudo guardar. — 27/08/2026 */
  const [avisoBase, setAvisoBase] = useState('');

  const [numTorneo, setNumTorneo] = useState('');

  /* ── ¿SOLO LOS ACTIVOS, O TODOS? ─────────────────────────────────────────
     (dirección, 27/08/2026)

     Normalmente se trabaja SOLO CON LOS ACTIVOS: un retirado ni juega ni se le
     cobra. Pero a veces hay que ver a los que ya no están —para revisar un
     torneo viejo, o para entender por qué falta alguien— y para eso está el
     botón. Arranca siempre en ACTIVOS. */
  const [soloActivos, setSoloActivos] = useState(true);
  const [jornada, setJornada]     = useState('');
  const [fecha, setFecha]         = useState('');
  const [llegar, setLlegar]       = useState('');
  const [rival, setRival]         = useState('');
  /* La casilla del marcador del rival: se le hace foco cuando se intenta
     guardar sin haberla llenado. — 27/08/2026 */
  const cajaRival = useRef<HTMLInputElement | null>(null);
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
  const ultimaJornada = useRef<string>('');  // la fecha anterior: distingue matriz→fecha de fecha→fecha

  /* ── SE ACUERDA DE DÓNDE IBA (dirección, 27/08/2026) ──────────────────────
     El torneo y la fecha quedan anotados en este mismo aparato. Al volver a
     entrar —o al regresar del estado de cuenta de un deportista— la pantalla
     abre donde estaba, en vez de en blanco. Solo se guarda en el aparato: no
     se manda a la base ni lo ve nadie más. */
  const LLAVE_ULTIMO = 'pospartido-ultimo-abierto';

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

  /* Al abrir: se recupera dónde iba. Va ANTES de leer el cuadro para que la
     pantalla no alcance a pintarse en blanco. */
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(LLAVE_ULTIMO);
      if (!guardado) return;
      const u = JSON.parse(guardado);
      if (u?.numTorneo) setNumTorneo(String(u.numTorneo));
      if (u?.jornada)   setJornada(String(u.jornada));
    } catch { /* si el navegador no deja guardar, abre en blanco y ya */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Y se va anotando a medida que cambia. */
  useEffect(() => {
    try {
      localStorage.setItem(LLAVE_ULTIMO, JSON.stringify({ numTorneo, jornada }));
    } catch { /* sin espacio o en modo incógnito: no pasa nada */ }
  }, [numTorneo, jornada]);

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
  /* ── El torneo que corresponde al número escrito ───────────────────────── */
  const torneoCrudo = useMemo(() => {
    const n = parseInt(numTorneo, 10);
    if (!cuadro || !Number.isFinite(n) || n < 1 || n > cuadro.length) return null;
    return cuadro[n - 1];
  }, [numTorneo, cuadro]);

  /** ¿Este torneo está a cargo de este formador? Se comparan los nombres sin
   *  tildes y en mayúsculas: "Álvarez" y "ALVAREZ" son el mismo señor. */
  const esMiTorneo = useCallback((f: FilaTorneo | null): boolean => {
    if (!f) return false;
    const pelado = (x: string) => String(x ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toUpperCase();
    const suyo = pelado(f.formador);
    const yo   = pelado(nombreProfe);
    if (!suyo || !yo) return false;
    return suyo === yo || suyo.includes(yo) || yo.includes(suyo);
  }, [nombreProfe]);

  /* El torneo escrito NO es de este formador: no se le arma nada. */
  const torneoAjeno = esProfe && !!torneoCrudo && !esMiTorneo(torneoCrudo);
  const torneo = torneoAjeno ? null : torneoCrudo;

  /** Los torneos que sí son suyos, para poder decírselos. */
  const misTorneos = useMemo(() => {
    if (!esProfe || !cuadro) return [];
    return cuadro
      .map((f, i) => ({ f, num: i + 1 }))
      .filter(({ f }) => esMiTorneo(f))
      .map(({ f, num }) => ({
        num: String(num),
        nombre: [f.torneo, f.programa, f.categoria, f.nombre].map(limpiar).filter(Boolean).join(' '),
      }));
  }, [esProfe, cuadro, esMiTorneo]);

  const convocables = useMemo(() => {
    const n = parseInt(numTorneo, 10);
    if (!Number.isFinite(n) || n < 1) return [];
    /* Si el torneo no es de este formador, ni la lista se arma. */
    if (torneoAjeno) return [];
    return deportistas
      .filter(d => torneosDelDeportista(d).includes(n))
      /* SOLO LOS QUE SIGUEN ACTIVOS (dirección, 27/08/2026).
         Un retirado o un pausado no juega el torneo y no se le cobra, pero
         seguía apareciendo en la planilla porque el número del torneo quedó
         escrito en su ficha. Se le convocaba sin querer y se le cargaba el
         torneo a alguien que ya no está.

         OJO CON UNA COSA: "SOLICITA RETIRO" NO es estar retirado. Ese caso
         está EN ESTUDIO mientras se coordinan los pagos, y mientras tanto el
         deportista sigue entrenando y se le sigue cobrando. Por eso se descarta
         la palabra "solicita" antes de mirar si dice "retirado" — es la misma
         regla que usa Total Afiliados.

         Al que no tenga nada escrito en ESTADO se le deja pasar: falta el dato,
         no es una baja, y esconderlo sería peor. */
      .filter(d => {
        if (!soloActivos) return true;                        // se pidió ver a todos
        const est = getCol(d, /^estado$/i);
        if (!String(est).trim()) return true;                 // sin dato: se deja
        if (/solicit/i.test(est)) return true;                // en estudio: sigue activo
        return !/retir|pausa|inactiv/i.test(est);
      })
      .sort((a, b) => {
        const ca = parseInt(codigoDe(a).replace(/\D/g, ''), 10);
        const cb = parseInt(codigoDe(b).replace(/\D/g, ''), 10);
        if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
        return (a._nombre || '').localeCompare(b._nombre || '', 'es');
      });
  }, [numTorneo, deportistas, torneoAjeno, soloActivos]);

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
    /* ¿De dónde venía? Si venía SIN fecha (de la matriz) y apenas ahora le
       está poniendo una, lo escrito es de ESTE partido y no se toca. Pero si
       venía de la FECHA 1 y se pasó a la FECHA 2, eso ya es otro partido: se
       arranca en blanco. Antes no se distinguían los dos casos y la fecha 2
       nacía con los datos de la fecha 1 encima. — corregido 27/08/2026 */
    const veniaDeMatriz = !ultimaJornada.current;
    ultimoArmado.current = clave;
    ultimoTorneo.current = numTorneo;
    ultimaJornada.current = jornada;

    if (!numTorneo) {
      setFilas([]);
      return;
    }

    /* EN LA MATRIZ LA LISTA SE ARMA SIEMPRE DE CERO (corregido 27/08/2026).
       La matriz no es un partido: es la lista viva del torneo. Antes se le
       aplicaba lo guardado en el aparato, y por eso seguía saliendo gente que
       ya se había retirado —la lista vieja pisaba a la nueva—. Ahora se rearma
       con los deportistas que correspondan en este momento. */
    if (!jornada) {
      primeraCarga.current = true;
      setSinGuardar(false);
      setGuardadoEn('');
      setDefinitivo(false);
      setFilas(convocables.map((d, i) => ({
        ...filaNueva(i),
        depId: d.id,
        posicion: posicionDe(d),
        deportista: limpiar(d._nombre).toUpperCase(),
      })));
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

      /* No hay nada archivado de esta fecha.
         ÚNICO caso en que se conserva lo que está en pantalla: el formador
         venía llenando SIN fecha (en la matriz) y apenas ahora la escogió.
         En todo lo demás —cambió de torneo, o se pasó de una fecha a otra—
         se arranca limpio, porque es otro partido. */
      if (!cambioElTorneo && veniaDeMatriz && jornada) return;

      primeraCarga.current = true;
      setSinGuardar(false);
      setGuardadoEn('');
      setDefinitivo(false);
      /* El encabezado y el marcador también se van: son de aquel partido. */
      setFecha(''); setLlegar(''); setRival('');
      setGolesNos(''); setGolesEllos(''); setAutogoles(0);
      if (convocables.length === 0) {
        setFilas([]);
      } else {
        setFilas(convocables.map((d, i) => ({
          ...filaNueva(i),
          depId: d.id,
          posicion: posicionDe(d),
          deportista: limpiar(d._nombre).toUpperCase(),
        })));
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numTorneo, jornada, convocables]);

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
  /* ADMINISTRACIÓN PRINCIPAL, aparte (dirección, 27/08/2026): la MATRIZ, la
     columna CÓDIGO y el cobro del torneo son SOLO de ella. `esAdmon` sigue
     siendo el permiso de siempre —el que baja el PDF—; este es más estrecho. */
  const [esAdmonPrincipal, setEsAdmonPrincipal] = useState(false);
  useEffect(() => {
    setEsAdmon(esSuperAdmin() || esAccesoTotal());
    setEsAdmonPrincipal(esSuperAdmin());
  }, []);

  /* ── LA MATRIZ ───────────────────────────────────────────────────────────
     Cuando en # FECHA no hay una fecha escogida, la pantalla está en MATRIZ:
     la lista pelada de los deportistas de este torneo, sin partido de por
     medio. Ahí es donde administración carga el torneo, uno por uno.

     Apenas se escoge una fecha —FECHA 1, FECHA 2…— eso ya es un PARTIDO, y
     ahí la columna CARGAR TORNEO desaparece: la planilla del partido queda
     limpia, que es como se ve en la app y como sale en el PDF.
     — dirección, 27/08/2026 */
  const enMatriz  = !String(jornada || '').trim();
  const verCargar = esAdmonPrincipal && enMatriz;

  /* ── LA COLUMNA CÓDIGO ───────────────────────────────────────────────────
     (dirección, 27/08/2026)

     SOLO LA VE ADMINISTRACIÓN. Ni el formador ni el calidoso, y NO SALE EN EL
     PDF. La razón la dio la dirección: por el código se sabe quién es becado,
     y eso no tiene por qué quedar a la vista de los demás.

     Por eso el código NO se guarda dentro de la planilla: se lee de la ficha
     del deportista cada vez que se pinta la pantalla. Así no queda escrito en
     el partido archivado ni puede colarse en un PDF por descuido. */
  const codigoPorId = useMemo(() => {
    const m = new Map<string, string>();
    convocables.forEach(d => {
      const cols = d._columnas ?? {};
      const k = Object.keys(cols).find(k => /^c[oó]d/i.test(k.trim()));
      m.set(d.id, k ? String(cols[k] ?? '').trim().toUpperCase() : '');
    });
    return m;
  }, [convocables]);

  /** El color del código de cada deportista: el mismo de Total Afiliados. */
  const colorCodPorId = useMemo(() => {
    const m = new Map<string, string>();
    convocables.forEach(d => {
      m.set(
        d.id,
        colorDelCodigo(
          codigoPorId.get(d.id) ?? '',
          getCol(d, /tipo.*afil|^afil/i),
          getCol(d, /^estado$/i),
        ),
      );
    });
    return m;
  }, [convocables, codigoPorId]);

  /** Ancho de la columna CÓDIGO. En 0 cuando no se muestra, para que las
   *  columnas clavadas a la izquierda queden en su sitio. */
  const verCodigo = esAdmonPrincipal;
  const ANCHO_COD = verCodigo ? 84 : 0;

  /* ── QUÉ COLUMNAS SE VEN ─────────────────────────────────────────────────
     En la MATRIZ solo van CÓDIGO · N° · DEPORTISTA · CARGAR TORNEO: es una
     lista para cobrar, no una planilla de partido, y todo lo demás —minutos,
     tarjetas, goles— ahí no tiene nada que hacer (dirección, 27/08/2026).
     Al escoger una fecha vuelven todas, en el orden que cada quien dejó. */
  const ordenVisible = useMemo<ClaveCol[]>(
    () => (enMatriz ? (['num', 'deportista'] as ClaveCol[]) : orden),
    [enMatriz, orden],
  );

  /* ── GUARDAR EL AVANCE ───────────────────────────────────────────────────
     El formador llena esto en la cancha. Si le toca parar, lo escrito NO se
     puede perder: cada cambio queda anotado en el propio aparato, y el botón
     GUARDAR lo manda a la base para poder seguirlo desde otro lado.
     — dirección, 26/08/2026 */
  const [sinGuardar, setSinGuardar] = useState(false);
  /* ¿ESTE PARTIDO YA QUEDÓ CERRADO? (dirección, 27/08/2026)
     Mientras es false, el formador va llenando y guarda avances cuantas veces
     quiera. Al oprimir GUARDAR DEFINITIVO pasa a true: el partido queda
     cerrado, la planilla se bloquea y en el banco aparece con su sello verde.
     Para volver a tocarlo hay que oprimir EDITAR, que lo reabre. De aquí sale
     el módulo de seguimiento: qué partidos están cerrados y cuáles a medias. */
  const [definitivo, setDefinitivo] = useState(false);
  const [guardandoPlanilla, setGuardandoPlanilla] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState('');     // cuándo quedó en la base
  const [avisoGuardado, setAvisoGuardado] = useState('');
  const primeraCarga = useRef(true);


  /* ═══════════════════════════════════════════════════════════════════════════
     COBRAR EL TORNEO  —  una columna más, SOLO para administración.

     La pidió la dirección (27/08/2026) aquí y no en otra pantalla, porque esta
     es la lista donde ya están los deportistas de este torneo, con su nombre a
     la vista. Se cobra UNO POR UNO, a propósito: la dirección sabe quién ya le
     pagó el torneo por fuera, y un botón que le cargue a todos le cobraría de
     nuevo a esa gente.

     EL FORMADOR NO LA VE. La columna solo aparece si quien está en pantalla es
     administración; el formador llena su planilla igual que siempre.

     El valor sale del cuadro de Torneos y Competencias. El cobro se crea en
     `otros_pagos` y sale en el Estado de Cuenta del deportista, en la tabla
     TORNEOS, debajo de las mensualidades.
     ═══════════════════════════════════════════════════════════════════════════ */
  /* "NO PAGA" se escribe igual que en las mensualidades —NOPAGA, sin espacio—
     para que las dos pantallas hablen el mismo idioma. — 27/08/2026 */
  const ESTADO_NO_PAGA = 'NOPAGA';
  type CobroTorneo = { id: string; deportista_id: string; estado: string };
  const [cobros, setCobros] = useState<CobroTorneo[]>([]);
  const [cobrando, setCobrando] = useState<string | null>(null);

  /** Cómo se llama el cobro: el mismo nombre del torneo, sin la fecha. */
  const nombreCobro = useMemo(() => {
    if (!torneo) return '';
    return [torneo.torneo, torneo.programa, torneo.categoria].map(limpiar).filter(Boolean).join(' ');
  }, [torneo]);

  const valorTorneo = Math.max(0, Math.round(Number(torneo?.valor) || 0));

  const leerCobros = useCallback(async () => {
    if (!nombreCobro) { setCobros([]); return; }
    try {
      const res = await fetch(
        `${SB_URL_COBROS}/rest/v1/otros_pagos?select=id,deportista_id,estado` +
        `&tipo=eq.torneo&descripcion=eq.${encodeURIComponent(nombreCobro)}`,
        { headers: HDR_COBROS, cache: 'no-store' },
      );
      if (!res.ok) return;
      const f = await res.json();
      if (Array.isArray(f)) setCobros(f);
    } catch { /* sin señal: la columna sale sin marcar */ }
  }, [nombreCobro]);

  useEffect(() => { if (esAdmon) leerCobros(); }, [esAdmon, leerCobros]);

  /** El id del deportista de esa fila. Si la planilla es vieja y no lo trae,
   *  se busca por el nombre entre los convocables de este mismo torneo. */
  function idDeLaFila(f: FilaPlanilla): string {
    if (f.depId) return f.depId;
    const n = limpiar(f.deportista).toUpperCase();
    const d = convocables.find(c => limpiar(c._nombre).toUpperCase() === n);
    return d?.id ?? '';
  }

  const cobroDe = (f: FilaPlanilla) => {
    const id = idDeLaFila(f);
    return id ? cobros.find(c => c.deportista_id === id) : undefined;
  };

  async function cobrarTorneo(f: FilaPlanilla) {
    const id = idDeLaFila(f);
    if (!id || !nombreCobro) {
      setError('No se pudo identificar al deportista de esa fila.');
      return;
    }
    setCobrando(f.id); setError('');
    try {
      const res = await fetch(`${SB_URL_COBROS}/rest/v1/otros_pagos`, {
        method: 'POST',
        headers: { ...HDR_COBROS, Prefer: 'return=representation' },
        body: JSON.stringify([{
          deportista_id: id,
          descripcion:   nombreCobro,
          tipo:          'torneo',
          valor:         valorTorneo,
          estado:        'PEND',
          fecha:         null,
        }]),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`No se pudo cargar el cobro (${res.status}). ${txt.slice(0, 130)}`);
      }
      await leerCobros();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el cobro.');
    } finally {
      setCobrando(null);
    }
  }

  /* ── CAMBIARLE EL ESTADO A UNO SOLO ──────────────────────────────────────
     (dirección, 27/08/2026)

     Tocando la pastilla de un deportista se abre un menú chiquito con los
     cuatro estados posibles de ese torneo para él:

       PENDIENTE  · lo debe (ámbar)
       PAGÓ       · ya pagó (verde)
       NO PAGA    · está exonerado de este torneo (gris)
       QUITAR     · borra el cobro y queda como si nunca se le hubiera puesto

     Sirve para corregir sin tener que entrar al estado de cuenta: si la carga
     en lote le dejó PAGÓ a alguien que en realidad debe, se arregla aquí. */
  const [menuCobro, setMenuCobro] = useState<
    { filaId: string; depId: string; cobro: CobroTorneo | null; x: number; y: number } | null
  >(null);

  useEffect(() => {
    if (!menuCobro) return;
    const cerrar = () => setMenuCobro(null);
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuCobro(null); };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', conEsc);
    window.addEventListener('scroll', cerrar, true);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', conEsc);
      window.removeEventListener('scroll', cerrar, true);
    };
  }, [menuCobro]);

  /** Pone (o cambia) el estado del torneo para UN deportista. */
  async function ponerEstado(depId: string, cobro: CobroTorneo | null, estado: string) {
    if (!depId || !nombreCobro) return;
    setCobrando(depId); setError(''); setMenuCobro(null);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const res = cobro
        ? await fetch(`${SB_URL_COBROS}/rest/v1/otros_pagos?id=eq.${encodeURIComponent(cobro.id)}`, {
            method: 'PATCH',
            headers: HDR_COBROS,
            body: JSON.stringify({ estado, fecha: estado === 'PAGÓ' ? hoy : null }),
          })
        : await fetch(`${SB_URL_COBROS}/rest/v1/otros_pagos`, {
            method: 'POST',
            headers: { ...HDR_COBROS, Prefer: 'return=minimal' },
            body: JSON.stringify([{
              deportista_id: depId,
              descripcion:   nombreCobro,
              tipo:          'torneo',
              valor:         valorTorneo,
              estado,
              fecha:         estado === 'PAGÓ' ? hoy : null,
            }]),
          });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        /* Si la base solo acepta PAGÓ y PEND, "NO PAGA" la rechaza. Se dice en
           cristiano en vez de mostrar el error crudo. */
        if (/check|constraint|violates/i.test(txt) && estado === ESTADO_NO_PAGA) {
          throw new Error(
            'La base todavía no acepta el estado NO PAGA para los torneos. ' +
            'Mientras tanto se puede dejar sin cargar (QUITAR), que para las cuentas es lo mismo.',
          );
        }
        throw new Error(`No se pudo cambiar (${res.status}). ${txt.slice(0, 130)}`);
      }
      await leerCobros();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cambiar el estado.');
    } finally {
      setCobrando(null);
    }
  }

  /** Borra el cobro: queda como si nunca se le hubiera puesto. */
  async function borrarCobro(cobro: CobroTorneo | null) {
    if (!cobro) { setMenuCobro(null); return; }
    setCobrando(cobro.deportista_id); setError(''); setMenuCobro(null);
    try {
      const res = await fetch(
        `${SB_URL_COBROS}/rest/v1/otros_pagos?id=eq.${encodeURIComponent(cobro.id)}`,
        { method: 'DELETE', headers: HDR_COBROS },
      );
      if (!res.ok) throw new Error(`No se pudo quitar (${res.status}).`);
      await leerCobros();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo quitar el cobro.');
    } finally {
      setCobrando(null);
    }
  }

  async function quitarCobro(f: FilaPlanilla, c: CobroTorneo) {
    /* Un torneo YA PAGADO no se quita desde aquí: eso se revierte en el Estado
       de Cuenta, que es donde queda el registro de lo que se hizo. */
    if (c.estado === 'PAGÓ') {
      setError('Ese torneo ya está pagado. Para revertirlo, entra al Estado de Cuenta del deportista.');
      return;
    }
    if (!confirm(`¿Quitarle el cobro de ${nombreCobro} a ${f.deportista}?`)) return;
    setCobrando(f.id); setError('');
    try {
      const res = await fetch(
        `${SB_URL_COBROS}/rest/v1/otros_pagos?id=eq.${encodeURIComponent(c.id)}`,
        { method: 'DELETE', headers: HDR_COBROS },
      );
      if (!res.ok) throw new Error(`No se pudo quitar (${res.status}).`);
      await leerCobros();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo quitar el cobro.');
    } finally {
      setCobrando(null);
    }
  }

  /* ── CONVOCAR A TODOS DE UNA ──────────────────────────────────────────────
     (dirección, 27/08/2026)

     Casi siempre va convocado el equipo entero y solo faltan uno o dos. Marcar
     23 casillas de a una, en el celular y con el partido encima, era el trabajo
     más largo de la planilla.

     Ahora: al marcar la casilla CONVOCADO del PRIMER renglón, se pregunta si se
     le pone lo mismo a todos. Se hace desde el primero a propósito —no desde
     cualquiera— para que nadie lo dispare sin querer estando en la mitad de la
     lista. Después se destildan los dos o tres que no fueron.

     No se manda nada a la base: queda como cambio pendiente, igual que si se
     hubiera marcado a mano, y se guarda con GUARDAR AVANCE. */
  const [pedirTodosConv, setPedirTodosConv] = useState<'' | 'Convocado' | 'No convocado'>('');

  function ponerConvocadoATodos(valor: '' | 'Convocado' | 'No convocado') {
    setFilas(fs => fs.map(f => ({ ...f, convocado: valor })));
    setSinGuardar(true);
    setPedirTodosConv('');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CARGARLE EL TORNEO DE UNA A LOS QUE YA PAGARON  (dirección, 27/08/2026)

     El botón verde de cada renglón es para el que DEBE: le queda el torneo
     PENDIENTE. Pero casi siempre la mayoría ya pagó por fuera, y cargarlos de
     a uno para después marcarlos pagados era el trabajo más largo.

     Este botón —el título negro de la columna— hace eso de una sola vez:
     saca la lista de los que TODAVÍA no lo tienen cargado, se desmarca al que
     no corresponda, y a los demás se les carga el torneo YA PAGADO, con la
     fecha de hoy.

     Y se puede DESHACER: al terminar queda un letrero con el botón, que borra
     exactamente los cobros que se acabaron de crear. Ni uno más: no toca a los
     que ya estaban cargados de antes ni a los que se cargaron de a uno.
     ═══════════════════════════════════════════════════════════════════════ */
  const [abrirLote, setAbirLote] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [loteHecho, setLoteHecho] = useState<{ ids: string[]; cuantos: number } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

  /** Los que todavía no tienen este torneo cargado. */
  const sinCargar = useMemo(() => {
    return filas
      .map(f => ({ f, id: idDeLaFila(f) }))
      .filter(({ f, id }) => !!id && !cobros.some(c => c.deportista_id === id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, cobros, convocables]);

  function abrirCargaLote() {
    setMarcados(new Set(sinCargar.map(({ id }) => id)));
    setLoteHecho(null);
    setAbirLote(true);
  }

  async function confirmarCargaLote() {
    const ids = [...marcados];
    if (!ids.length || !nombreCobro) return;
    setGuardandoLote(true); setError('');
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const res = await fetch(`${SB_URL_COBROS}/rest/v1/otros_pagos`, {
        method: 'POST',
        headers: { ...HDR_COBROS, Prefer: 'return=representation' },
        body: JSON.stringify(ids.map(depId => ({
          deportista_id: depId,
          descripcion:   nombreCobro,
          tipo:          'torneo',
          valor:         valorTorneo,
          estado:        'PAGÓ',
          fecha:         hoy,
        }))),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`No se pudo cargar (${res.status}). ${txt.slice(0, 140)}`);
      }
      const creados = await res.json().catch(() => []);
      const idsCreados = Array.isArray(creados)
        ? creados.map((c: any) => String(c?.id ?? '')).filter(Boolean)
        : [];
      await leerCobros();
      setAbirLote(false);
      setLoteHecho({ ids: idsCreados, cuantos: ids.length });
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el torneo al grupo.');
    } finally {
      setGuardandoLote(false);
    }
  }

  async function deshacerCargaLote() {
    const lote = loteHecho;
    if (!lote?.ids.length) { setLoteHecho(null); return; }
    setDeshaciendo(true); setError('');
    try {
      /* Los números de cobro son solo letras, números y guiones, así que se
         pueden mandar tal cual dentro del paréntesis. */
      const lista = lote.ids.filter(i => /^[A-Za-z0-9-]+$/.test(i)).join(',');
      if (!lista) throw new Error('No se pudo identificar lo que se acaba de cargar.');
      const res = await fetch(
        `${SB_URL_COBROS}/rest/v1/otros_pagos?id=in.(${lista})`,
        { method: 'DELETE', headers: HDR_COBROS },
      );
      if (!res.ok) throw new Error(`No se pudo deshacer (${res.status}).`);
      await leerCobros();
      setLoteHecho(null);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo deshacer. Se puede quitar uno por uno desde el estado de cuenta.');
    } finally {
      setDeshaciendo(false);
    }
  }

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
        /* El PDF lleva las columnas TAL COMO SE VEN, menos CÓDIGO: esa nunca
           sale impresa (dirección, 27/08/2026). */
        columnas: ordenVisible.map(c => ({
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
      definitivo,
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
    setDefinitivo((p as any).definitivo === true);
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

  /** Guarda. `cerrar` = true es GUARDAR DEFINITIVO; false es GUARDAR AVANCE. */
  async function guardarAvance(cerrar = false) {
    if (!numTorneo) {
      setError('Primero escribe el número del torneo.');
      return;
    }
    /* La # FECHA es la que le pone nombre al partido en el BANCO. Sin ella no
       se sabría si esto es la fecha 1 o la 5, y el archivo quedaría revuelto.
       Lo escrito NO se pierde: ya está guardado en este aparato. — 27/08/2026 */
    if (!jornada) {
      setError('Estás en la MATRIZ, que es la lista del torneo, no un partido. Escoge la # FECHA (FECHA 1, FECHA 2…) para poder guardarlo en el banco. Lo que ya escribiste está a salvo en este aparato.');
      return;
    }
    /* EL MARCADOR DEL RIVAL NO PUEDE QUEDAR EN BLANCO (dirección, 27/08/2026).
       El nuestro se suma solo —los goles de los deportistas más los autogoles—,
       pero el del rival hay que escribirlo. Si se deja vacío, el partido queda
       guardado como si hubiera sido 0, y después nadie puede saber si de
       verdad fue 0 o si simplemente se les olvidó anotarlo. Así que se pide,
       así haya sido 0. Vale tanto para el avance como para el definitivo.
       Lo escrito NO se pierde: ya quedó guardado en este aparato. */
    if (!marcadorActivo || !Number.isFinite(ge)) {
      setError('Falta el marcador del rival. Escríbelo en la casilla roja del marcador, aunque haya sido 0. Lo que ya escribiste está a salvo en este aparato.');
      cajaRival.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      cajaRival.current?.focus();
      return;
    }
    /* CERRAR ES UNA DECISIÓN, ASÍ QUE SE PREGUNTA. Después de esto la planilla
       queda bloqueada y hay que oprimir EDITAR para volver a tocarla. */
    if (cerrar && !confirm(
      `¿Cerrar como DEFINITIVO ${etiquetaFecha(jornada)} ${nombreTorneo}?\n\n` +
      'La planilla queda bloqueada y aparece como cerrada en el banco.\n' +
      'Si necesita corregir algo después, se oprime EDITAR y se vuelve a abrir.',
    )) return;

    const p = { ...planillaDeAhora(), definitivo: cerrar };
    guardarBorradorLocal(p);             // primero lo seguro, sin internet
    setGuardandoPlanilla(true);
    setError('');
    try {
      const sacadas = await guardarPlanilla(p);
      setSinGuardar(false);
      setDefinitivo(cerrar);
      setGuardadoEn(p.actualizada_en);
      setAvisoGuardado(cerrar ? 'Cerrado' : 'Guardado');
      /* El partido quedó guardado. Si a la base le faltaba alguna casilla, se
         guardó sin ella y se avisa —en amarillo, no en rojo— qué quedó por
         fuera y cómo se arregla. — 27/08/2026 */
      if (sacadas.length) {
        const cierre = sacadas.includes('definitivo')
          ? ' Mientras tanto, el sello de DEFINITIVO no se guarda en la base: en el banco el partido sigue apareciendo a medias.'
          : '';
        setAvisoBase(
          `El partido SÍ quedó guardado, pero la base todavía no tiene ` +
          `${sacadas.length === 1 ? 'la casilla' : 'las casillas'} ` +
          `"${sacadas.join('", "')}", así que ${sacadas.length === 1 ? 'ese dato' : 'esos datos'} no se guardaron.` +
          cierre +
          ' Se arregla corriendo ARREGLAR-LA-BASE.bat una sola vez.',
        );
      } else {
        setAvisoBase('');
      }
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
    setDefinitivo(false);
    setFilas(convocables.map((d, i) => ({
      ...filaNueva(i),
      depId: d.id,
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

  /** Los partidos del banco, agrupados por torneo y ordenados por fecha.
   *
   *  SOLO LOS DEL TORNEO EN EL QUE SE ESTÁ (dirección, 27/08/2026): estando en
   *  el torneo 9 no tiene por qué salir el banco del torneo 1. Con 58 torneos
   *  la lista se volvía interminable y tocaba buscar el propio entre todos.
   *  Si todavía no se ha escrito el número del torneo, se muestran todos: ahí
   *  el banco sirve de índice para escoger por dónde entrar. */
  const bancoPorTorneo = useMemo(() => {
    const soloEste = String(numTorneo || '').trim();
    /* Al formador, además, solo se le muestran SUS torneos: sin número escrito
       el banco le serviría de atajo para abrir el partido de otro.
       — 27/08/2026 */
    const mios = esProfe ? new Set(misTorneos.map(t => t.num)) : null;
    const grupos = new Map<string, FichaBanco[]>();
    for (const f of banco ?? []) {
      const num = String(f.torneo_num).trim();
      if (soloEste && num !== soloEste) continue;
      if (mios && !mios.has(num)) continue;
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
  }, [banco, nombreDeTorneoNum, numTorneo, esProfe, misTorneos]);

  /** Abre en la planilla de arriba un partido del banco.
   *  Con `paraEditar` además le quita el candado, que es lo que hace el botón
   *  EDITAR: uno espera poder escribir de una, sin un segundo clic. */
  function abrirDelBanco(f: FichaBanco, paraEditar = false) {
    setError('');
    ultimoArmado.current = '';        // que el armado vuelva a correr
    setNumTorneo(f.torneo_num);
    setJornada(f.jornada);
    if (paraEditar) {
      /* Se abre desbloqueado. Va con un respiro porque la planilla se carga
         sola un instante después y ella también toca este mismo dato. */
      setTimeout(() => setDefinitivo(false), 400);
    }
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
      case 'deportista': {
        /* EL NOMBRE ES UN ENLACE (dirección, 27/08/2026).

           DESDE ADMINISTRACIÓN va DERECHO AL ESTADO DE CUENTA, como en todos
           los listados de admón: es lo que se está mirando cuando se toca un
           nombre. El formador y el calidoso no ven plata, así que a ellos el
           nombre les abre la FICHA.

           Se abre en OTRA PESTAÑA a propósito: el formador puede estar en
           media planilla y no se le puede sacar de ella.

           Si la fila viene de una planilla vieja que no guardó el id, no hay
           a dónde ir: entonces se deja como estaba, editable. */
        const idFicha = idDeLaFila(f);
        /* Se le dice a dónde volver: la pestaña que se abre nace sin historial
           y sin esto la flecha de atrás caía en la ficha. — 27/08/2026 */
        const aDonde  = esAdmon
          ? `/alumnos/${idFicha}/estado-cuenta?edit=1&volver=${encodeURIComponent('/postpartido')}`
          : `/alumnos/${idFicha}?volver=${encodeURIComponent('/postpartido')}`;
        if (!idFicha) {
          return (
            <Celda valor={f.deportista} placeholder="Nombre del deportista" grande
              onChange={v => editar(f.id, 'deportista', v.toUpperCase())} />
          );
        }
        return (
          <a
            href={aDonde}
            target="_blank"
            rel="noopener noreferrer"
            title={esAdmon
              ? `Abrir el estado de cuenta de ${f.deportista} en otra pestaña`
              : `Abrir la ficha de ${f.deportista} en otra pestaña`}
            className="flex items-center w-full rounded px-1 text-white text-[11.5px] font-bold
              hover:underline decoration-2 underline-offset-2"
            style={{ height: 30, textDecorationColor: VERDE }}>
            {f.deportista}
          </a>
        );
      }
      case 'convocado':
        return (
          <Escoger valor={f.convocado} opciones={OPC_CON} colores={COLOR_CON} grande
            titulo={i === 0
              ? 'Clic para cambiar. Desde este primer renglón se puede poner lo mismo a todos.'
              : 'Clic para cambiar: Convocado o No convocado'}
            onChange={v => {
              editar(f.id, 'convocado', v);
              /* Solo desde el PRIMER renglón, y solo si hay más de uno. */
              if (i === 0 && v && filas.length > 1) setPedirTodosConv(v);
            }} />
        );
      case 'actua':
        return (
          <Escoger valor={f.titular} opciones={OPC_TIT} colores={COLOR_TIT}
            titulo="Clic para cambiar: Titular · Suplente · No jugó · No asistió"
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

      {/* ── Encabezado ──────────────────────────────────────────────────────
          EN EL CELULAR VA EN DOS RENGLONES (dirección, 27/08/2026).
          Antes iba todo en uno solo y no cabía: el título "Crear Pospartido"
          se partía en tres líneas, los botones de guardar se le montaban
          encima y el logo quedaba cortado por el borde de la pantalla.

          Ahora: arriba la flecha, el título y el logo; abajo los dos guardados,
          repartidos mitad y mitad. En el computador todo vuelve a un renglón,
          igual que antes. */}
      <header className="sticky top-0 z-30 px-3 sm:px-4 py-2.5 sm:py-3
        flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
        style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>

        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 sm:flex-1">
          <button onClick={() => router.push('/dashboard')} aria-label="Volver"
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-black text-[15px] sm:text-base leading-tight">Crear Pospartido</h1>
            <p className="text-white/55 text-[11px] leading-tight truncate">
              {nombreTorneo || (esProfe
                ? 'Escoge tu torneo para armar la planilla'
                : 'Escribe el número del torneo para armar la planilla')}
            </p>
          </div>
          {/* El logo, en el celular, va en este mismo renglón: así se ve
              completo y no lo empujan los botones. */}
          <div className="flex flex-col items-end shrink-0 sm:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-6 w-auto object-contain" />
            <p className="text-white/60 text-[7.5px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
          </div>
        </div>

        {/* Renglón de abajo en el celular · a la derecha en el computador */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
        {/* ── LOS DOS GUARDADOS (dirección, 27/08/2026) ─────────────────────
            Antes había un solo botón GUARDAR y no se sabía si un partido
            estaba terminado o el formador iba por la mitad. Ahora son dos
            cosas distintas:

              GUARDAR AVANCE      · voy llenando, sigo después.
              GUARDAR DEFINITIVO  · este partido quedó cerrado.

            Cuando ya está cerrado, los dos botones desaparecen y queda EDITAR,
            que lo vuelve a abrir. Así el sello no se pierde por un clic sin
            querer, y el módulo de seguimiento puede confiar en él. */}
        {/* En la MATRIZ no hay nada que guardar: no es un partido, y el cobro
            del torneo se manda solo al oprimirlo. — 27/08/2026 */}
        {!!numTorneo && !enMatriz && (
          definitivo ? (
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <span className="rounded-lg flex items-center gap-1 px-2 text-white font-black text-[10px]"
                style={{ height: 32, background: 'rgba(0,176,80,.18)', border: `1px solid ${VERDE}`, color: '#5BE39B' }}>
                <Check className="w-3.5 h-3.5" /> DEFINITIVO
              </span>
              <button onClick={() => { setDefinitivo(false); setAvisoGuardado(''); }}
                title="Volver a abrir esta planilla para corregirla"
                className="rounded-lg flex items-center gap-1.5 px-2.5 text-white font-black text-[11px]"
                style={{ height: 32, background: CAMPO, border: `1px solid ${BORDE}` }}>
                <Save className="w-3.5 h-3.5" /> EDITAR
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <button onClick={() => guardarAvance(false)} disabled={guardandoPlanilla}
                title="Guardar lo que lleva. Puede seguir llenándolo después."
                className="rounded-lg flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5
                  text-white font-black text-[11px] h-[38px] sm:h-8 disabled:opacity-60"
                style={{ background: sinGuardar ? AMBAR : CAMPO, border: `1px solid ${sinGuardar ? AMBAR : BORDE}` }}>
                {guardandoPlanilla
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : avisoGuardado ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {avisoGuardado || 'GUARDAR AVANCE'}
              </button>
              <button onClick={() => guardarAvance(true)} disabled={guardandoPlanilla}
                title="Cerrar el partido: queda como terminado y revisado"
                className="rounded-lg flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5
                  text-white font-black text-[11px] h-[38px] sm:h-8 disabled:opacity-60"
                style={{ background: VERDE }}>
                <Check className="w-3.5 h-3.5" /> GUARDAR DEFINITIVO
              </button>
            </div>
          )
        )}

        {esAdmon && (
        <button onClick={bajarPDF} disabled={bajandoPdf}
          title="Bajar esta planilla en PDF (solo administración)"
          className="rounded-lg flex items-center justify-center gap-1.5 px-2.5 shrink-0
            text-white font-black text-[11px] h-[38px] sm:h-8 disabled:opacity-60"
          style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
          {bajandoPdf
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileDown className="w-3.5 h-3.5" />}
          PDF
        </button>
        )}
        </div>

        {/* La marca, con el logo, igual que en las demás pantallas. En el
            celular ya salió arriba, junto al título: aquí solo va del
            computador para arriba. — 27/08/2026 */}
        <div className="hidden sm:flex flex-col items-end flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/60 text-[8px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
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

        {avisoBase && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
            style={{ background: 'rgba(224,163,58,.16)', border: `1px solid ${AMBAR}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBAR }} />
            <p className="text-white text-[12px] font-semibold">{avisoBase}</p>
          </div>
        )}

        {/* ── ESE TORNEO NO ES SUYO ───────────────────────────────────────
            El formador escribió el número de un torneo que está a cargo de otro.
            No se le arma la planilla; se le dice de quién es y cuáles son los
            suyos, con el número, para que entre de una. — 27/08/2026 */}
        {torneoAjeno && (
          <div className="rounded-2xl p-4 mb-3"
            style={{ background: 'rgba(192,80,77,.16)', border: `1px solid ${ROJO}` }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ROJO }} />
              <div className="min-w-0">
                <p className="text-white font-black text-[13.5px]">
                  El torneo {numTorneo} no está a tu cargo.
                </p>
                <p className="text-white/70 text-[12px] mt-0.5">
                  {[torneoCrudo?.torneo, torneoCrudo?.programa, torneoCrudo?.categoria, torneoCrudo?.nombre]
                    .map(x => limpiar(String(x ?? ''))).filter(Boolean).join(' ')}
                  {torneoCrudo?.formador ? ` · es de ${limpiar(torneoCrudo.formador).toUpperCase()}` : ''}
                </p>

                {misTorneos.length > 0 ? (
                  <>
                    <p className="text-white/45 text-[11.5px] font-black mt-3 mb-1.5 tracking-wide">
                      TUS TORNEOS · oprime uno para abrirlo
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {misTorneos.map(t => (
                        <button key={t.num}
                          onClick={() => setNumTorneo(t.num)}
                          className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-black text-white text-left transition hover:opacity-90"
                          style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                          <span style={{ color: VERDE }}>{t.num}</span> · {t.nombre}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-white/45 text-[11.5px] mt-3">
                    No tienes torneos asignados en el cuadro de Torneos y Competencias.
                    Pídele a administración que te ponga como formador en los tuyos.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TORNEO # ── */}
        <div className="rounded-2xl p-4 mb-3" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-white font-black text-[15px]">
              {esProfe ? 'TORNEO' : 'TORNEO #'}
            </span>

            {/* AL FORMADOR NO SE LE PIDE UN NÚMERO (dirección, 27/08/2026).
                Él no tiene por qué saberse que su torneo es el 17: escoge el
                suyo de una lista, por el nombre, y ya. Y como son los suyos,
                no hay forma de que se meta en el de otro.
                Administración sigue escribiendo el número: son 58 torneos y
                escribir "42" es más rápido que buscarlo en una lista. */}
            {esProfe ? (
              <select
                value={numTorneo}
                onChange={e => setNumTorneo(e.target.value)}
                title="Escoge tu torneo"
                /* En el celular ocupa todo el renglón: con ancho fijo se salía
                   de la pantalla y tocaba deslizar solo para verla.
                   — 27/08/2026 */
                style={{ height: 44, background: CAMPO, border: `1px solid ${BORDE}` }}
                className="w-full sm:w-auto sm:max-w-[460px] min-w-0 rounded-xl px-3
                  text-white font-black text-[13px] sm:text-[15px] outline-none cursor-pointer">
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>
                  — Escoge tu torneo —
                </option>
                {misTorneos.map(t => (
                  <option key={t.num} value={t.num} style={{ color: '#111827', backgroundColor: 'white' }}>
                    {t.num} · {t.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={numTorneo}
                inputMode="numeric"
                onChange={e => setNumTorneo(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="1"
                style={{ width: 96, height: 44, background: VERDE, border: 'none' }}
                className="rounded-xl text-center text-white font-black text-[20px] outline-none placeholder:text-white/40"
              />
            )}

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
                  {esProfe
                    ? (misTorneos.length
                        ? 'Escoge tu torneo en la lista…'
                        : 'No tienes torneos asignados.')
                    : 'Escribe el número del torneo…'}
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
          <div className={enMatriz
            ? 'grid grid-cols-1 sm:grid-cols-[220px] gap-2 mt-3'
            : 'grid grid-cols-2 gap-2 mt-3 sm:grid-cols-[0.8fr_1fr_212px_2fr]'}>
            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                # FECHA
              </label>
              <select value={jornada} onChange={e => setJornada(e.target.value)}
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}
                className="w-full rounded-lg px-2 text-white text-[12.5px] font-bold outline-none cursor-pointer">
                {/* MATRIZ = todavía no se ha escogido fecha. Es la lista pelada
                    de los deportistas del torneo, y es cosa de administración:
                    ahí se cargan los torneos. Al formador esa palabra no le
                    dice nada, así que a él se le pide la fecha y ya.
                    — dirección, 27/08/2026 */}
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>
                  {esProfe ? '— Escoge la fecha —' : 'MATRIZ'}
                </option>
                {/* Si venía algo escrito de antes que no está en la lista, no se pierde. */}
                {jornada && !NUM_FECHAS.includes(jornada) && (
                  <option value={jornada} style={{ color: '#111827', backgroundColor: 'white' }}>{jornada}</option>
                )}
                {NUM_FECHAS.map(f => (
                  <option key={f} value={f} style={{ color: '#111827', backgroundColor: 'white' }}>{f}</option>
                ))}
              </select>
            </div>

            {/* DÍA · HORA · RIVAL son de un PARTIDO. En la matriz —que es la
                lista del torneo para cobrar— no hay partido, así que no se
                muestran. Aparecen apenas se escoge una FECHA.
                — dirección, 27/08/2026 */}
            {!enMatriz && (
            <>
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
            </>
            )}

          </div>

          {/* ── VER SOLO LOS ACTIVOS, O TODOS ─────────────────────────────
              Arranca en ACTIVOS. Se cambia aquí porque es lo que decide QUIÉN
              sale en la lista, y eso hay que poder verlo de una.
              — dirección, 27/08/2026 */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-white/45 text-[9.5px] font-black uppercase tracking-widest">
              Deportistas
            </span>
            <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDE}` }}>
              <button
                onClick={() => setSoloActivos(true)}
                title="Solo los que siguen activos. Los retirados y pausados no salen."
                className="px-3 py-1.5 text-[11px] font-black transition"
                style={{
                  background: soloActivos ? VERDE : 'transparent',
                  color: soloActivos ? '#ffffff' : 'rgba(255,255,255,.45)',
                }}>
                SOLO ACTIVOS
              </button>
              <button
                onClick={() => setSoloActivos(false)}
                title="Muestra también a los retirados y pausados"
                className="px-3 py-1.5 text-[11px] font-black transition"
                style={{
                  background: !soloActivos ? GRIS : 'transparent',
                  color: !soloActivos ? '#ffffff' : 'rgba(255,255,255,.45)',
                  borderLeft: `1px solid ${BORDE}`,
                }}>
                TODOS
              </button>
            </div>
            {!soloActivos && (
              <span className="text-[11px] font-bold" style={{ color: AMBAR }}>
                Estás viendo también a los retirados y pausados.
              </span>
            )}
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
          /* Los dos cuadros del marcador, del mismo tamaño siempre. En el
             celular más chicos, para que el nombre del rival quepa al lado
             y no se caiga al renglón de abajo. — 27/08/2026 */
          .marcador-caja { width: 68px; height: 68px; }
          .marcador-num  { font-size: 30px; }
          @media (max-width: 640px) {
            .marcador-caja { width: 52px !important; height: 52px !important; }
            .marcador-num  { font-size: 24px !important; }
          }
          @media (max-width: 700px) {
            .plan-fija-dep { width: 132px !important; max-width: 132px; }
            .plan-fija-dep input { font-size: 10.5px; }
            /* En el celular la columna CARGAR TORNEO se DESCLAVA de la derecha:
               si se queda clavada, entre ella y el nombre —que va clavado a la
               izquierda— tapan la pantalla y no se alcanza a ver lo del medio.
               Allá se llega a ella corriendo el cuadro. — 27/08/2026 */
            .plan-cargar { position: static !important; }
          }
        `}</style>

        {/* Este aviso es para administración. Al formador solo le estorba: él
            llena la planilla en la cancha, no anda acomodando columnas.
            — dirección, 27/08/2026 */}
        {!esProfe && (
          <p className="text-white/35 text-[11px] mb-1.5 px-1">
            Arrastra el <span className="text-white/60 font-bold">título verde</span> para mover una
            columna de lugar, o su <span className="text-white/60 font-bold">borde derecho</span> para
            hacerla más ancha o más angosta. Queda guardado solo en este computador: al volver a
            entrar, el cuadro está como lo dejaste.
          </p>
        )}

        {/* ── SE CARGÓ EL LOTE · SE PUEDE DESHACER ────────────────────────
            Deshace EXACTAMENTE los cobros que se acabaron de crear: se guardan
            sus números al crearlos. No toca a nadie más. — 27/08/2026 */}
        {verCargar && loteHecho && (
          <div className="rounded-xl px-3 py-2.5 mb-2 flex flex-wrap items-center gap-2"
            style={{ background: 'rgba(0,176,80,.14)', border: `1px solid ${VERDE}` }}>
            <Check className="w-4 h-4 shrink-0" style={{ color: VERDE }} />
            <p className="text-white text-[12px] font-semibold">
              Listo: <b>{loteHecho.cuantos}</b> quedaron con el torneo cargado y <b>PAGADO</b>.
            </p>
            <button
              onClick={deshacerCargaLote}
              disabled={deshaciendo || !loteHecho.ids.length}
              title="Quitarles el torneo a los que se acabaron de cargar"
              className="ml-auto rounded-lg px-3 py-1.5 text-[11px] font-black text-white
                disabled:opacity-50 transition hover:opacity-90"
              style={{ background: AMBAR }}>
              {deshaciendo ? '…' : '↩ DESHACER'}
            </button>
            <button
              onClick={() => setLoteHecho(null)}
              title="Cerrar este aviso"
              className="text-white/45 hover:text-white font-black text-[13px] leading-none px-1">
              ✕
            </button>
          </div>
        )}

        {/* Letrero de la última columna. Solo en la MATRIZ y solo administración.
            Dice a cuánto va el torneo y cuántos lo llevan cargado, para poder
            ir de a uno sin perder la cuenta (dirección, 27/08/2026). */}
        {verCargar && (
          <div className="rounded-lg px-3 py-2 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
            <span className="text-[11px] font-black tracking-wide" style={{ color: VERDE }}>MATRIZ</span>
            <span className="text-white/70 text-[12px]">
              Valor del torneo:{' '}
              <b style={{ color: valorTorneo > 0 ? VERDE : AMBAR }}>{plata(valorTorneo)}</b>
            </span>
            <span className="text-white/70 text-[12px]">
              Ya cargado a <b className="text-white">{cobros.length}</b> de{' '}
              <b className="text-white">{filas.length}</b>
            </span>
            {valorTorneo <= 0 && (
              <span className="text-[11px]" style={{ color: AMBAR }}>
                Este torneo todavía no tiene valor en Torneos y Competencias: se cargaría en $ 0.
              </span>
            )}
          </div>
        )}

        {/* En la MATRIZ el cuadro no necesita todo el ancho: son cuatro
            columnas. Se le pone tope para que no queden estiradas. */}
        <div className="rounded-xl overflow-auto"
          style={{
            border: `1px solid ${BORDE}`,
            maxHeight: 'calc(100vh - 330px)',
            maxWidth: enMatriz ? 660 : undefined,
          }}>
          <table className="text-[11.5px]"
            style={{
              borderCollapse: 'separate', borderSpacing: 0,
              /* En la MATRIZ son cuatro columnas y caben; en la planilla del
                 partido el cuadro es ancho y se corre para el lado. */
              width: '100%', minWidth: enMatriz ? 0 : 1120,
              /* Fijo: cada columna respeta el ancho que le pusimos arriba. Sin
                 esto, un nombre largo estira la columna y en el celular la
                 columna congelada se come media pantalla. */
              tableLayout: 'fixed',
            }}>
            <thead>
              <tr>
                {/* CÓDIGO · solo administración principal, y NUNCA en el PDF.
                    Por el código se sabe quién es becado, y eso no se le
                    muestra a nadie más (dirección, 27/08/2026). */}
                {verCodigo && (
                  <th
                    title="El código de la ficha. Solo lo ve administración; no sale en el PDF."
                    className="px-2 py-3 text-center font-black text-[12.5px] tracking-wide whitespace-nowrap text-white select-none"
                    style={{
                      background: CAMPO,
                      borderRight: BLANCO, borderBottom: BLANCO, borderTop: BLANCO,
                      width: ANCHO_COD,
                      position: 'sticky', top: 0, left: 0, zIndex: 17,
                    }}>
                    CÓDIGO
                  </th>
                )}

                {ordenVisible.map((clave, i) => {
                  const c = COLUMNAS[clave];
                  /* SOLO EL NOMBRE QUEDA CLAVADO (dirección, 27/08/2026).
                     Antes se clavaban las dos primeras columnas y el número se
                     comía un pedazo de la pantalla del celular sin decir nada:
                     el renglón ya se sabe cuál es por el nombre. Ahora, al
                     correr el cuadro para el lado, el número se va debajo y el
                     nombre se queda a la vista. */
                  const fija = clave === 'deportista';
                  const izq  = ANCHO_COD;
                  return (
                    <th key={clave}
                      /* En la MATRIZ no se arrastran columnas: son solo cuatro
                         y el orden guardado es el de la planilla del partido. */
                      draggable={!enMatriz}
                      onDragStart={() => { if (!enMatriz) empezarArrastre(i); }}
                      onDragOver={e => { if (enMatriz) return; e.preventDefault(); setEncima(i); }}
                      onDragLeave={() => setEncima(v => (v === i ? null : v))}
                      onDrop={e => { if (enMatriz) return; e.preventDefault(); setEncima(null); soltarEn(i); }}
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

                {/* CARGAR TORNEO · solo administración (dirección, 27/08/2026).
                    Va aparte del juego de columnas movibles: esas se guardan en
                    el computador de cada quien, y meterle una clave nueva a esa
                    lista le dañaría el orden guardado a todo el que ya la tenía
                    acomodada. Por eso esta va clavada al final. */}
                {verCargar && (
                  <th
                    title="Cargarle a cada deportista el valor de este torneo, uno por uno"
                    className="plan-cargar p-0 text-center font-black text-[12.5px] tracking-wide whitespace-nowrap text-white select-none"
                    style={{
                      background: '#1B222C',      // negro: es un botón, no un título más
                      borderLeft: BLANCO, borderRight: BLANCO,
                      borderBottom: BLANCO, borderTop: BLANCO,
                      /* Clavada a la DERECHA: el cuadro es ancho y toca correrlo
                         para el lado; así el botón queda siempre a la vista sin
                         tener que llegar hasta el final. — 27/08/2026 */
                      width: 150, minWidth: 150,
                      position: 'sticky', top: 0, right: 0, zIndex: 18,
                    }}>
                    {/* EL TÍTULO ES UN BOTÓN (dirección, 27/08/2026): abre la
                        lista para cargarle el torneo, YA PAGADO, a todos los
                        que todavía no lo tienen. */}
                    <button
                      onClick={abrirCargaLote}
                      disabled={sinCargar.length === 0}
                      title={sinCargar.length
                        ? `Cargarle el torneo, ya pagado, a los ${sinCargar.length} que faltan`
                        : 'Ya todos tienen este torneo cargado'}
                      className="w-full px-2 py-3 flex items-center justify-center gap-1.5
                        text-white font-black text-[12.5px] tracking-wide
                        hover:bg-white/10 disabled:opacity-45 disabled:hover:bg-transparent transition">
                      <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: VERDE }} />
                      CARGAR TORNEO
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                  /* El renglón del que NO fue convocado ya no se apaga: antes
                     el gris se comía la fuerza del rojo. Lo que cambia es que
                     sus casillas de datos dicen N/A. — 26/08/2026 */
                  <tr key={f.id} style={{ background: PANEL }}>
                    {verCodigo && (() => {
                        const idDep = idDeLaFila(f);
                        const cod   = codigoPorId.get(idDep) || '';
                        return (
                          <td className="px-1 py-[4px] text-center"
                            style={{
                              borderRight: BLANCO, borderBottom: BLANCO,
                              /* El color del código, igual que en Total
                                 Afiliados. Sin código, el gris del cuadro. */
                              background: cod ? colorCodPorId.get(idDep) ?? CAMPO : CAMPO,
                              position: 'sticky', left: 0, zIndex: 7,
                            }}>
                            <span className="text-white text-[11.5px] font-black tracking-wider">
                              {cod || <span className="text-white/30">—</span>}
                            </span>
                          </td>
                        );
                      })()}

                    {ordenVisible.map((clave, k) => {
                      /* Igual que en el título: el único clavado es el nombre. */
                      const fija = clave === 'deportista';
                      const izq  = ANCHO_COD;
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

                    {verCargar && (() => {
                      /* UNA SOLA PASTILLA CON LOS CUATRO ESTADOS
                         (dirección, 27/08/2026). Antes el botón solo cargaba o
                         quitaba; ahora se toca y sale el menú para dejarlo en
                         PENDIENTE, PAGÓ, NO PAGA, o quitarlo del todo. */
                      const id      = idDeLaFila(f);
                      const c       = cobroDe(f);
                      const ocupado = cobrando === id;
                      const est     = c?.estado ?? '';
                      const pagado  = est === 'PAGÓ';
                      const noPaga  = est === ESTADO_NO_PAGA;
                      const letra   = !c ? 'CARGAR TORNEO'
                                    : pagado ? 'PAGÓ'
                                    : noPaga ? 'NO PAGA'
                                    : 'CARGADO ✓';
                      const fondo   = !c ? VERDE
                                    : pagado ? VERDE
                                    : noPaga ? GRIS
                                    : AMBAR;
                      return (
                        <td className="plan-cargar px-1 py-[4px] text-center"
                          style={{
                            borderLeft: BLANCO, borderRight: BLANCO, borderBottom: BLANCO,
                            background: CAMPO,          // sólido: por debajo pasa el resto del cuadro
                            width: 150, minWidth: 150,
                            position: 'sticky', right: 0, zIndex: 6,
                          }}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (!id) return;
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setMenuCobro({
                                filaId: f.id, depId: id, cobro: c ?? null,
                                x: Math.max(8, r.right - 176), y: r.bottom + 4,
                              });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            disabled={ocupado || !id}
                            title={id
                              ? 'Toca para cambiar: PENDIENTE · PAGÓ · NO PAGA · QUITAR'
                              : 'No se pudo identificar a este deportista en la lista del torneo'}
                            className="w-full rounded-md px-1 py-[6px] text-[10.5px] font-black text-white
                              leading-none whitespace-nowrap disabled:opacity-40"
                            style={{ background: fondo }}>
                            {ocupado ? '…' : letra}
                          </button>
                        </td>
                      );
                    })()}
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
                  <td colSpan={ordenVisible.length + (verCodigo ? 1 : 0) + (verCargar ? 1 : 0)} className="py-8 text-center"
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

        {/* ── EL MENÚ DE UN SOLO DEPORTISTA ───────────────────────────────
            Va por FUERA del cuadro (en un portal) porque la columna está
            clavada a la derecha y con el recorte del cuadro el menú quedaría
            cortado. — 27/08/2026 */}
        {menuCobro && typeof document !== 'undefined' && createPortal(
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: menuCobro.y, left: menuCobro.x, zIndex: 99999,
              width: 176, background: PANEL, border: `1px solid ${BORDE}`,
              boxShadow: '0 18px 40px rgba(0,0,0,.45)',
            }}
            className="rounded-xl overflow-hidden py-1">
            {[
              { texto: 'PENDIENTE', ayuda: 'Lo debe',                    color: AMBAR, estado: 'PEND' },
              { texto: 'PAGÓ',      ayuda: 'Ya pagó este torneo',        color: VERDE, estado: 'PAGÓ' },
              { texto: 'NO PAGA',   ayuda: 'Exonerado de este torneo',   color: GRIS,  estado: ESTADO_NO_PAGA },
            ].map(o => (
              <button key={o.estado} type="button"
                onClick={() => ponerEstado(menuCobro.depId, menuCobro.cobro, o.estado)}
                title={o.ayuda}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-white font-black text-[12px] leading-tight">{o.texto}</span>
                  <span className="block text-white/40 text-[10px] leading-tight">{o.ayuda}</span>
                </span>
                {menuCobro.cobro?.estado === o.estado && (
                  <Check className="w-3.5 h-3.5 shrink-0" style={{ color: VERDE }} />
                )}
              </button>
            ))}
            {menuCobro.cobro && (
              <button type="button"
                onClick={() => borrarCobro(menuCobro.cobro)}
                title="Borrar el cobro: queda como si nunca se le hubiera puesto"
                style={{ borderTop: `1px solid ${BORDE}` }}
                className="w-full px-3 py-2 text-left text-[11.5px] font-black mt-1 hover:bg-white/5 transition"
                >
                <span style={{ color: ROJO }}>QUITAR EL TORNEO</span>
              </button>
            )}
          </div>,
          document.body,
        )}

        {/* ── CARGAR EL TORNEO A LOS QUE YA PAGARON ───────────────────────
            Salen SOLO los que todavía no lo tienen, todos marcados. Se desmarca
            al que no corresponda y listo. — dirección, 27/08/2026 */}
        {abrirLote && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4"
            style={{ background: 'rgba(0,0,0,.62)' }}>
            <div className="rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
              style={{ background: PANEL, border: `1px solid ${BORDE}`, maxHeight: '92vh' }}>

              <div className="px-4 py-3.5 shrink-0" style={{ borderBottom: `1px solid ${BORDE}` }}>
                <h3 className="text-white font-black text-[15px] pr-8">
                  Cargar el torneo a los que ya pagaron
                </h3>
                <p className="text-white/45 text-[11.5px] font-semibold mt-0.5">
                  {nombreCobro} · <b style={{ color: valorTorneo > 0 ? VERDE : AMBAR }}>{plata(valorTorneo)}</b>
                </p>
              </div>

              <div className="mx-4 mt-3 rounded-xl px-3 py-2.5 shrink-0"
                style={{ background: CAMPO, border: `1px solid ${VERDE}` }}>
                <p className="text-white text-[11.5px] leading-relaxed">
                  A los que marques se les carga el torneo y queda{' '}
                  <b style={{ color: VERDE }}>REGISTRADO COMO PAGADO</b> en su estado de cuenta, con la
                  fecha de hoy. Los que ya lo tienen cargado no salen en esta lista.
                </p>
                {valorTorneo <= 0 && (
                  <p className="text-[11px] mt-1.5" style={{ color: AMBAR }}>
                    Ojo: este torneo todavía no tiene valor en Torneos y Competencias. Se cargaría en $ 0.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0">
                <button onClick={() => setMarcados(new Set(sinCargar.map(({ id }) => id)))}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-white transition hover:opacity-90"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                  Marcar todos
                </button>
                <button onClick={() => setMarcados(new Set())}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-white transition hover:opacity-90"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                  Ninguno
                </button>
                <span className="ml-auto text-white/45 text-[11px] font-black">
                  {sinCargar.length} sin cargar
                </span>
              </div>

              <div className="px-4 overflow-auto flex-1">
                {sinCargar.length === 0 ? (
                  <p className="text-white/45 text-[12px] text-center py-6">
                    Ya todos tienen este torneo cargado.
                  </p>
                ) : sinCargar.map(({ f, id }) => {
                  const puesto = marcados.has(id);
                  return (
                    <button key={f.id} type="button"
                      onClick={() => setMarcados(prev => {
                        const n = new Set(prev);
                        n.has(id) ? n.delete(id) : n.add(id);
                        return n;
                      })}
                      className="w-full flex items-center gap-2.5 py-2.5 text-left"
                      style={{ borderBottom: `1px solid ${BORDE}55` }}>
                      <span className="w-[18px] h-[18px] rounded shrink-0 flex items-center justify-center"
                        style={{
                          background: puesto ? VERDE : 'transparent',
                          border: `1px solid ${puesto ? VERDE : BORDE}`,
                        }}>
                        {puesto && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="flex-1 min-w-0 text-white font-bold text-[12px] truncate">
                        {f.deportista}
                      </span>
                      <span className="text-white/45 font-black text-[10.5px] shrink-0">
                        {codigoPorId.get(id) || ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2.5 p-4 shrink-0" style={{ borderTop: `1px solid ${BORDE}` }}>
                <button onClick={() => setAbirLote(false)}
                  className="flex-1 rounded-xl py-3 text-[12.5px] font-bold text-white/70 transition hover:bg-white/5"
                  style={{ border: `1px solid ${BORDE}` }}>
                  Cancelar
                </button>
                <button onClick={confirmarCargaLote}
                  disabled={guardandoLote || marcados.size === 0}
                  className="flex-1 rounded-xl py-3 text-[12.5px] font-black text-white transition
                    hover:opacity-90 disabled:opacity-45"
                  style={{ background: VERDE }}>
                  {guardandoLote ? 'Cargando…' : `Cargar a ${marcados.size} como PAGADO`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ¿SE LO PONGO A TODOS? (CONVOCADO) ───────────────────────────
            Sale al marcar el primer renglón. — dirección, 27/08/2026 */}
        {pedirTodosConv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,.6)' }}>
            <div className="rounded-2xl p-5 w-full max-w-sm relative"
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

              <button
                onClick={() => setPedirTodosConv('')}
                title="Cerrar y dejar solo el primero"
                className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center
                  text-white/50 hover:text-white transition"
                style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-white font-black text-[15px] mb-1 pr-10">
                ¿Se lo pongo a todos?
              </h3>
              <p className="text-white/45 text-[12px] font-semibold mb-4">
                Acabas de marcar{' '}
                <b style={{ color: pedirTodosConv === 'Convocado' ? VERDE : ROJO }}>
                  {pedirTodosConv}
                </b>{' '}
                en el primer renglón.
              </p>

              <div className="rounded-xl px-3 py-3 mb-4"
                style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                <p className="text-white text-[12.5px] font-bold">
                  Son {filas.length} deportistas en esta planilla.
                </p>
                <p className="text-white/40 text-[11px] mt-1.5 leading-snug">
                  Se les pone lo mismo a todos y después destildas los que no fueron.
                  Queda como cambio pendiente — se guarda con GUARDAR AVANCE.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPedirTodosConv('')}
                  className="flex-1 rounded-xl py-3 text-[13px] font-bold text-white/70 transition hover:bg-white/5"
                  style={{ border: `1px solid ${BORDE}` }}>
                  Solo el primero
                </button>
                <button
                  onClick={() => ponerConvocadoATodos(pedirTodosConv)}
                  className="flex-1 rounded-xl py-3 text-[13px] font-black text-white transition hover:opacity-90"
                  style={{ background: pedirTodosConv === 'Convocado' ? VERDE : ROJO }}>
                  Sí, a los {filas.length}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MARCADOR ────────────────────────────────────────────────────
            EN EL CELULAR SE LEE COMO UN MARCADOR DE VERDAD (dirección,
            27/08/2026). Antes todo iba en un solo renglón y en la pantalla del
            teléfono el gol del rival y su nombre se caían al renglón de abajo:
            quedaba "FUTURO ANTIOQUIA 3 VS" arriba y el rival colgando.

            Ahora cada equipo es una columna —su nombre encima y su gol debajo—
            y las dos van lado a lado con el VS en el medio. En el computador se
            ve igual que siempre: nombre y gol en el mismo renglón. */}
        {/* EN LA MATRIZ NO HAY MARCADOR (dirección, 27/08/2026): la matriz es la
            lista del torneo para cobrar, no un partido. Un marcador en cero, un
            VS y un RIVAL vacío ahí no dicen nada y solo estorban. Aparece
            apenas se escoge una FECHA, que es cuando sí hay partido. */}
        {!enMatriz && (
        <div className="rounded-2xl p-3 sm:p-4 mt-2 flex flex-col sm:flex-row flex-wrap
          items-center justify-center gap-3 sm:gap-4"
          style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

          <div className="rounded-xl px-4 sm:px-6 py-2.5 sm:py-3 text-center w-full sm:w-auto"
            style={{ background: resultado ? colorResultado : CAMPO, minWidth: 0,
                     border: resultado ? 'none' : `1px solid ${BORDE}` }}>
            <p className="text-white font-black text-[17px] sm:text-[19px] tracking-wide">
              {resultado || 'SIN MARCADOR'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 sm:gap-4 w-full sm:w-auto">

            {/* NOSOTROS — nombre encima del gol en el celular, al lado en el PC.
                Nuestro marcador se suma solo: goles de los deportistas + autogoles. */}
            <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4 min-w-0 flex-1 sm:flex-none">
              <div className="text-center px-1 sm:px-2 sm:min-w-[170px]">
                <p className="text-white font-black text-[14px] sm:text-[19px] leading-tight">FUTURO</p>
                <p className="text-white font-black text-[14px] sm:text-[19px] leading-tight">ANTIOQUIA</p>
              </div>
              <div className="rounded-xl flex items-center justify-center shrink-0 marcador-caja"
                style={{ background: VERDE }}
                title={`${golesDeLosNinos} de los deportistas${autogoles ? ` + ${autogoles} autogol${autogoles > 1 ? 'es' : ''} del rival` : ''}`}>
                <span className="font-black leading-none marcador-num"
                  style={{ color: marcadorActivo || gn > 0 ? '#ffffff' : 'rgba(255,255,255,.22)' }}>
                  {gn}
                </span>
              </div>
            </div>

            <span className="text-white font-black text-[18px] sm:text-[22px] shrink-0">VS</span>

            {/* EL RIVAL — igual, pero al revés en el computador (gol y luego
                nombre), que es como se lee un marcador. */}
            <div className="flex flex-col sm:flex-row-reverse items-center gap-1.5 sm:gap-4 min-w-0 flex-1 sm:flex-none">
              <div className="text-center px-1 sm:px-2 sm:min-w-[170px]">
                {limpiar(rival)
                  ? enDosLineas(rival).map((r, i) => (
                      <p key={i} className="text-white font-black text-[14px] sm:text-[19px] leading-tight">{r}</p>
                    ))
                  : <p className="text-white/25 font-black text-[14px] sm:text-[19px] leading-tight">RIVAL</p>}
              </div>
              {/* Mientras esté vacía lleva un borde blanco punteado: se ve de una
                  que ahí falta algo, y sin ella no deja guardar. — 27/08/2026 */}
              <input ref={cajaRival} value={golesEllos} inputMode="numeric"
                onChange={e => setGolesEllos(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
                title="Los goles del rival. Escríbelos aquí, aunque sean 0. Sin esto no se puede guardar."
                style={{
                  background: ROJO,
                  border: marcadorActivo ? 'none' : '2px dashed rgba(255,255,255,.55)',
                }}
                className="rounded-xl text-center text-white font-black outline-none shrink-0
                  marcador-caja marcador-num placeholder:text-white/[.22]" />
            </div>
          </div>
        </div>
        )}

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
          {!enMatriz && (
          <div className="flex items-center gap-2 rounded-lg px-2.5 order-1"
            title="Autogoles del rival. Suman a nuestro marcador."
            style={{ height: 36, background: CAMPO, border: `1px solid ${autogoles > 0 ? VERDE : BORDE}` }}>
            {/* En el celular dice solo AUTOGOL, para que quepa al lado del
                promedio. En el computador va completo. — 27/08/2026 */}
            <span className="text-white/60 text-[10.5px] font-black tracking-wide whitespace-nowrap">
              AUTOGOL<span className="hidden sm:inline"> RIVAL</span>
            </span>
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
          )}

          {/* INFO borra el juego. En el celular se va de último —al renglón de
              abajo— que es donde estorba menos y donde no se oprime sin
              querer. — 27/08/2026 */}
          {!enMatriz && (
          <button onClick={borrarEsteJuego} disabled={borrando || !numTorneo}
            title="Borrar la información de este juego: deja la planilla en blanco"
            className="rounded-lg px-2.5 font-black text-[10.5px] flex items-center gap-1
              order-3 sm:order-2 disabled:opacity-40"
            style={{ height: 32, background: 'transparent', border: `1px solid ${ROJO}`, color: ROJO }}>
            {borrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            INFO
          </button>
          )}

          {/* PROMEDIO DEL EQUIPO — SUBIÓ AL LADO DE AUTOGOL (dirección,
              27/08/2026). Antes se iba solo contra la esquina derecha y en el
              celular caía a un renglón aparte, medio perdido. Ahora es una
              pastilla igual a las otras y se lee de corrido con lo demás.
              No se oprime: es el resumen de las calificaciones. */}
          {!enMatriz && (
          <div className="flex items-center gap-2 rounded-lg px-2.5 select-none order-2 sm:order-3 sm:ml-auto"
            title="Promedio de las calificaciones puestas en la columna CAL"
            style={{ height: 36, background: CAMPO, border: `1px solid ${promedioEquipo ? VERDE : BORDE}` }}>
            <span className="text-white/60 font-black text-[10.5px] tracking-wide whitespace-nowrap">
              PROMEDIO<span className="hidden sm:inline"> EQUIPO</span>
            </span>
            <div className="rounded flex items-center justify-center"
              style={{
                height: 26, minWidth: 50,
                background: promedioEquipo ? VERDE : 'transparent',
                border: `1px solid ${promedioEquipo ? VERDE : BORDE}`,
              }}>
              <span className="text-white font-black text-[15px] leading-none">
                {promedioEquipo || <span className="text-white/30">—</span>}
              </span>
            </div>
          </div>
          )}
          {/* El aviso de guardado va de último SIEMPRE: sin esto, al ordenar
              las pastillas para el celular, se colaba de primero. */}
          {enMatriz ? null : sinGuardar ? (
            <p className="text-[11.5px] font-bold order-4" style={{ color: AMBAR }}>
              Tienes cambios sin guardar.
            </p>
          ) : guardadoEn ? (
            <p className="text-white/45 text-[11.5px] font-semibold order-4">
              Guardado {cuandoBonito(guardadoEn)}.
            </p>
          ) : null}

          {numTorneo && convocables.length > 0 ? (
            <p className="text-white/45 text-[11px] order-5 w-full sm:w-auto">
              <span className="text-white font-black">{convocables.length} deportistas</span> tienen
              el torneo {numTorneo} asignado en Total Afiliados. Si falta alguno, hay que
              ponerle ese torneo en su ficha: aquí no se agregan a mano.
            </p>
          ) : numTorneo && torneo ? (
            <p className="text-[11px] font-semibold order-5 w-full sm:w-auto" style={{ color: AMBAR }}>
              Todavía ningún deportista tiene el torneo {numTorneo} puesto en C1, C2, C3 o C4.
              Asígnalos en Total Afiliados y la planilla se arma sola.
            </p>
          ) : (
            <p className="text-white/40 text-[11px] order-5 w-full sm:w-auto">
              {esProfe
                ? 'Escoge tu torneo y salen solos los deportistas asignados.'
                : 'Escribe el número del torneo y salen solos los deportistas asignados.'}
            </p>
          )}
        </div>

        {/* El desglose se ve siempre que haya PARTIDO, aunque vaya en cero: así
            se comprueba de un vistazo que la suma está corriendo. En la matriz
            no, que ahí no hay goles que sumar. — 27/08/2026 */}
        {!!numTorneo && !enMatriz && (
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
              <p className="text-white/75 text-[11px] font-semibold truncate">
                {numTorneo
                  ? `Los partidos de ${nombreTorneo || `el torneo ${numTorneo}`}. Oprime uno para abrirlo.`
                  : 'Todos los partidos ya elaborados. Oprime uno para abrirlo.'}
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
                {numTorneo
                  ? `Este torneo todavía no tiene ningún partido archivado. El primero que guardes aparece aquí.`
                  : 'Todavía no hay ningún partido archivado. El primero que guardes aparece aquí.'}
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
                          <div
                            key={`${f.torneo_num}|${f.jornada}`}
                            className="rounded-lg px-3 py-2 transition"
                            style={{
                              background: PANEL,
                              border: `1px solid ${abierto ? VERDE : BORDE}`,
                              boxShadow: res ? `inset 4px 0 0 0 ${res.color}` : undefined,
                              minWidth: 168,
                            }}>
                            <button onClick={() => abrirDelBanco(f)}
                              title={`Abrir ${etiquetaFecha(f.jornada)} ${g.titulo}`}
                              className="text-left w-full hover:brightness-125">
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

                            {/* ── EL SELLO Y EL BOTÓN DE ABRIRLO ──────────────
                                Verde con chulo = cerrado. Ámbar = va a medias.
                                De un vistazo se ve cuáles partidos están de
                                verdad terminados; eso es lo que va a leer el
                                módulo de seguimiento. — dirección, 27/08/2026 */}
                            <div className="flex items-center gap-1.5 mt-2 pt-1.5"
                                 style={{ borderTop: `1px solid ${BORDE}` }}>
                              {f.definitivo ? (
                                <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black"
                                  style={{ background: 'rgba(0,176,80,.16)', border: `1px solid ${VERDE}`, color: '#5BE39B' }}>
                                  <Check className="w-3 h-3" /> DEFINITIVO
                                </span>
                              ) : (
                                <span className="rounded px-1.5 py-0.5 text-[9px] font-black"
                                  style={{ background: 'rgba(224,163,58,.16)', border: `1px solid ${AMBAR}`, color: AMBAR }}>
                                  A MEDIAS
                                </span>
                              )}
                              <button
                                onClick={() => abrirDelBanco(f, true)}
                                title="Abrirlo para corregirlo"
                                className="ml-auto rounded px-2 py-0.5 text-[9px] font-black text-white/70 hover:text-white transition"
                                style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                                EDITAR
                              </button>
                            </div>
                          </div>
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
