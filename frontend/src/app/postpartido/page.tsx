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
  Archive, X, Zap, GripVertical,
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

/** "2026-08-29" → "SAB 29 AGO". Para los listados. — 29/08/2026 */
function diaCorto(fecha: any): string {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  const dias  = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
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

/**
 * ¿Los renglones guardados SON de este equipo? — dirección, 31/08/2026
 *
 * Es la red que atrapa las planillas que quedaron cruzadas. Se mira cuántos
 * de los renglones guardados corresponden a deportistas que hoy tienen ESTE
 * torneo asignado, comparando por id y también por nombre.
 *
 * No se exige que coincidan todos: un partido viejo puede tener a alguien que
 * ya se retiró, o a quien le cambiaron el torneo. Con que se reconozca la
 * TERCERA PARTE basta para saber que es el equipo correcto. Cuando la planilla
 * es de otro equipo no se reconoce ni uno, así que la diferencia es clarísima
 * y no hay riesgo de botar una planilla buena.
 *
 * Si no hay con qué comparar —la lista de convocables viene vacía porque el
 * torneo es de otro formador o las fichas no han llegado— se responde que SÍ:
 * ante la duda no se toca lo que el formador tenía escrito.
 */
function esDeEsteEquipo(filasGuardadas: any[], convocables: Deportista[]): boolean {
  if (!Array.isArray(filasGuardadas) || filasGuardadas.length === 0) return true;
  if (convocables.length === 0) return true;

  const ids = new Set(convocables.map(d => String(d.id)));
  const nombres = new Set(convocables.map(d => limpiar(d._nombre).toUpperCase()));

  const reconocidos = filasGuardadas.filter(f => {
    const id = String((f as any)?.depId ?? '').trim();
    if (id && ids.has(id)) return true;
    const nom = limpiar((f as any)?.deportista ?? '').toUpperCase();
    return !!nom && nombres.has(nom);
  }).length;

  return reconocidos >= Math.ceil(filasGuardadas.length / 3);
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

/* ── LA CASILLA DEL D.T Y DEL A.T ────────────────────────────────────────────
   Una lista con TODOS los profes del club. De primero, y separado, el que
   tiene el torneo asignado —que es el que casi siempre va—, y debajo los
   demás por orden alfabético, porque cualquiera puede reemplazarlo ese día.
   Va ancha a propósito: ahí tiene que caber el nombre completo.
   Si lo que está guardado no aparece en la lista (un nombre viejo, o alguien
   que ya no está), NO se pierde: se agrega al final para que se siga viendo.
   — dirección, 28/08/2026 */
/** El profe del torneo, buscado en la lista del club: en el cuadro de Torneos
 *  suele estar solo el apellido y en la lista está el nombre completo. Sin
 *  emparejarlos, el mismo señor salía dos veces. — dirección, 29/08/2026 */
function profeDelTorneo(texto: any, todos: string[]): string {
  const pelar2 = (t: any) =>
    String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const t = pelar2(texto);
  if (!t) return '';
  const exacto = todos.find(p => pelar2(p) === t);
  if (exacto) return exacto;
  const porApellido = todos.find(p => pelar2(primerApellidoPP(p)) === t);
  if (porApellido) return porApellido;
  const contenido = todos.find(p => pelar2(p).includes(t));
  if (contenido) return contenido;
  return String(texto ?? '').trim();
}

/** El primer apellido: en Colombia es el penúltimo pedazo del nombre. */
function primerApellidoPP(nombre: string): string {
  const p = String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '';
  if (p.length === 1) return p[0];
  if (p.length === 2) return p[1];
  return p[p.length - 2];
}

function CasillaProfe({ valor, onChange, delEquipo, todos }: {
  valor: string;
  onChange: (v: string) => void;
  delEquipo: string;
  todos: string[];
}) {
  const pelar = (t: string) =>
    String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

  const jefe = limpiar(delEquipo);
  const resto = todos.filter(p =>
    pelar(p) !== pelar(jefe) &&
    !(!!jefe && pelar(primerApellidoPP(p)) === pelar(primerApellidoPP(jefe))));
  const puesto = limpiar(valor);
  const conocido = [jefe, ...resto].some(p => pelar(p) === pelar(puesto));

  return (
    <select
      value={valor}
      onChange={e => onChange(e.target.value)}
      title="Escoge el formador. Sale primero el del equipo, y debajo todos los del club."
      style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}
      className="w-full rounded-lg px-2.5 text-white text-[12.5px] font-bold outline-none cursor-pointer">
      <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>— Sin asignar —</option>
      {!!jefe && (
        <option value={jefe} style={{ color: '#111827', backgroundColor: 'white' }}>
          {jefe}
        </option>
      )}
      {!!puesto && !conocido && (
        <option value={valor} style={{ color: '#111827', backgroundColor: 'white' }}>{valor}</option>
      )}
      {resto.map(p => (
        <option key={p} value={p} style={{ color: '#111827', backgroundColor: 'white' }}>{p}</option>
      ))}
    </select>
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
  const [jornada, setJornada]     = useState('');
  const [fecha, setFecha]         = useState('');
  const [llegar, setLlegar]       = useState('');
  const [rival, setRival]         = useState('');
  /* DÓNDE SE JUEGA — la cancha o el escenario. — dirección, 28/08/2026 */
  const [escenario, setEscenario] = useState('');
  /* BREVE RESUMEN DEL JUEGO — lo escribe el formador. — dirección, 28/08/2026 */
  const [resumen, setResumen]     = useState('');

  /* ── D.T Y A.T (dirección, 28/08/2026) ───────────────────────────────────
     Quién dirigió el partido y quién lo asistió. Arranca con el formador que
     tiene el torneo asignado, pero se puede escoger a CUALQUIER profe del
     club: un domingo cualquiera le toca reemplazar a otro y el papel tiene
     que decir la verdad de quién estuvo en la raya. */
  const [dt, setDt] = useState('');
  const [at, setAt] = useState('');

  /* ── LA LISTA DEL CUERPO TÉCNICO ──────────────────────────────────────────
     Sale del MISMO cuadro de Torneos y Competencias, de la columna FORMADOR:
     esos son los nombres con los que trabaja la academia —CASTRO, TABARES,
     RIOS, CHALARCA…—. Antes se traía de la tabla de profes, que los guarda con
     nombre completo, y la lista salía distinta y con gente repetida.
     — dirección, 29/08/2026 */
  const profesClub = useMemo(() => {
    const set = new Set<string>();
    for (const t of cuadro ?? []) {
      const n = String(limpiar(t.formador) ?? '').toUpperCase();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [cuadro]);
  /* La casilla del marcador del rival: se le hace foco cuando se intenta
     guardar sin haberla llenado. — 27/08/2026 */
  const cajaRival = useRef<HTMLInputElement | null>(null);
  /* La casilla del BREVE RESUMEN, para poder llevarlo hasta allá cuando la
     deje en blanco al cerrar el partido. — dirección, 31/08/2026 */
  const cajaResumen = useRef<HTMLTextAreaElement | null>(null);
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

  /* ═══════════════════════════════════════════════════════════════════════
     DE QUÉ PARTIDO ES LO QUE ESTÁ EN PANTALLA  ·  dirección, 31/08/2026

     PASÓ DE VERDAD Y ERA GRAVE: la dirección abrió el partido del torneo 18
     —ASOBDIM PROGRESIÓN SUB 8 de DORIA— y le salieron los deportistas de
     OTRO equipo, el SUB 11 de MARTIN, con el marcador de aquel partido.

     Por qué pasaba. Al oprimir otro partido, el número del torneo cambia de
     una, pero los renglones de los deportistas tardan: hay que ir a la base
     a buscarlos. En esos milisegundos la pantalla ya dice "torneo 18" pero
     por dentro todavía tiene los deportistas del anterior. Y el autoguardado
     —que corre a los 0,7 segundos de cualquier cambio— alcanzaba a dispararse
     justo ahí y guardaba esa mezcla: el torneo NUEVO con los deportistas
     VIEJOS. Esa mezcla quedaba en el aparato con la hora de ese momento, o
     sea más nueva que la de la base, y por eso al volver a abrir el partido
     la pantalla mostraba la mezcla y no lo bueno. De ahí el "Tienes cambios
     sin guardar" que salía sin que nadie hubiera tocado nada.

     La cura: lo que está en pantalla queda MARCADO con el partido al que
     pertenece. Mientras esa marca no diga el partido que se está mirando,
     NO se guarda nada —ni en el aparato ni en la base—. En cuanto llegan los
     deportistas buenos se pone la marca y todo sigue normal.
     ═══════════════════════════════════════════════════════════════════════ */
  const duenoPantalla = useRef<string>('');
  /** El nombre del partido que se está mirando ahora. */
  const partidoDeAhora = () => `${numTorneo}|${jornada}`;

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
    /* Si el torneo no es de este formador, ni la lista se arma.
       SALVO QUE SEA UN PARTIDO (dirección, 29/08/2026): al formador solo le
       llegan los partidos de SUS torneos —eso ya lo filtra el banco—, así que
       si abrió uno con # FECHA es porque es suyo. Este permiso está para que
       la lista no se le quede vacía cuando el nombre del cuadro y el del
       ingreso están escritos distinto ("CASTRO" y "ALEJANDRO CASTRO
       ESTRADA"), que fue lo que pasó de verdad. */
    if (torneoAjeno && !jornada) return [];
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
        /* SIEMPRE solo los activos (dirección, 28/08/2026): se quitó el botón
           de ver a todos, porque a un retirado no hay para qué convocarlo. */
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
  }, [numTorneo, deportistas, torneoAjeno, jornada]);

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

    /* SE CIERRA LA LLAVE DEL GUARDADO, YA (31/08/2026). Esto pasa ANTES de ir
       a la base. Desde este instante lo que hay en pantalla es del partido
       anterior, y hasta que no lleguen los renglones buenos no se guarda
       absolutamente nada. Es lo que impide que se crucen dos partidos. */
    const mio = `${numTorneo}|${jornada}`;
    duenoPantalla.current = '';

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
      duenoPantalla.current = mio;        // la matriz ya quedó armada: se abre la llave
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

      /* EL ENCABEZADO MANDA DESDE LA BASE (dirección, 29/08/2026).
         Pasó de verdad: CASTRO abrió el partido y le salió el encabezado en
         blanco. La razón es que en ese computador había quedado un BORRADOR
         viejo —de cuando el módulo se llenaba a mano— más nuevo que lo que la
         dirección acababa de programar, y el borrador pisaba el día, la hora,
         el rival y el escenario.
         Ahora se hace al revés: los renglones de los deportistas salen de lo
         más nuevo (que es lo que el formador lleva escrito), pero el
         ENCABEZADO sale de la BASE siempre que la base lo tenga. Lo que la
         dirección programó no lo pisa nada. */
      const conEncabezadoBueno = (p: any) => {
        if (!p) return p;
        if (!enBase) return p;
        const vale = (x: any) => String(x ?? '').trim() !== '';
        return {
          ...p,
          fecha:     vale(enBase.fecha)                ? enBase.fecha                : p.fecha,
          llegar:    vale(enBase.llegar)               ? enBase.llegar               : p.llegar,
          rival:     vale(enBase.rival)                ? enBase.rival                : p.rival,
          escenario: vale((enBase as any).escenario)   ? (enBase as any).escenario   : (p as any).escenario,
          dt:        vale((enBase as any).dt)          ? (enBase as any).dt          : (p as any).dt,
          at:        vale((enBase as any).at)          ? (enBase as any).at          : (p as any).at,
        };
      };

      /* ═══ ¿LOS RENGLONES SON DE ESTE EQUIPO? ═══════════════════════════
         (dirección, 31/08/2026 — corregido el mismo día)

         Aquí se atajan las planillas que quedaron cruzadas por el error del
         autoguardado. Pero OJO CON UNA COSA que se aprendió a los golpes: lo
         que se cruzaba eran los RENGLONES de los deportistas, no el partido.
         El marcador, el día, el rival y el resumen del partido casi siempre
         están BIEN guardados en la base.

         La primera versión de esto botaba todo y dejaba el marcador en cero.
         La dirección lo cazó de una: "arreglaste los niños, pero ¿dónde quedó
         el 0 x 10 y toda la información de ese juego?". Tenía razón.

         Entonces ahora se hace en dos pasos, y solo se bota lo que toca:

           1. Se miran las DOS copias —la de la base y la del aparato— y se
              usa la que SÍ sea de este equipo. Casi siempre la base está
              buena, y ahí el partido se recupera COMPLETO: renglones,
              marcador, resumen, todo.

           2. Solo si las dos vinieran cruzadas se rearman los renglones, y
              aun así se CONSERVA lo del partido: día, hora, rival, escenario,
              marcador y resumen. Lo único que se vuelve a llenar es quién
              jugó. */
      const conFilas = (p: any) => !!p && Array.isArray(p.filas) && p.filas.length > 0;
      const bueno: any = [guardada, enBase, local]
        .find(p => conFilas(p) && esDeEsteEquipo((p as any).filas, convocables));

      if (bueno) {
        /* Si la copia que iba de primeras venía cruzada, esa se bota del
           aparato para que no vuelva a estorbar. */
        const huboCruce = bueno !== guardada;
        if (huboCruce) borrarBorradorLocal(numTorneo, jornada);

        primeraCarga.current = true;      // volcarla no cuenta como cambio
        ponerPlanilla(conEncabezadoBueno(bueno));
        setGuardadoEn(enBase?.actualizada_en ?? '');
        setSinGuardar(huboCruce
          ? false
          : (!enBase || (local ? (local.actualizada_en > (enBase.actualizada_en || '')) : false)));
        if (huboCruce) {
          setAvisoBase(
            'En este computador había quedado guardado un enredo de otro partido, por una falla ' +
            'que ya se corrigió. Se botó y se recuperó el partido bueno tal como está en la base: ' +
            'los deportistas, el marcador y todo lo demás.',
          );
        }
        duenoPantalla.current = mio;
        return;
      }

      if (conFilas(guardada)) {
        /* Las dos copias venían cruzadas. Se conserva TODO lo del partido y
           se rearman únicamente los renglones. Manda la base, que es lo
           oficial. */
        const fuente: any = enBase ?? guardada;
        const cab: any = conEncabezadoBueno(fuente);
        primeraCarga.current = true;
        setFecha(cab.fecha ?? '');
        setLlegar(cab.llegar ?? '');
        setRival(cab.rival ?? '');
        setEscenario(cab.escenario ?? '');
        setResumen(cab.resumen ?? '');
        setDt(cab.dt || limpiar(torneo?.formador ?? ''));
        setAt(cab.at ?? '');
        setGolesNos(fuente.goles_nos ?? '');
        setGolesEllos(fuente.goles_ellos ?? '');
        setAutogoles(parseInt(String(fuente.autogoles ?? '0'), 10) || 0);
        setDefinitivo(fuente.definitivo === true);
        setGuardadoEn(enBase?.actualizada_en ?? '');
        setSinGuardar(false);
        borrarBorradorLocal(numTorneo, jornada);   // el borrador cruzado se va
        setFilas(convocables.map((d, i) => ({
          ...filaNueva(i),
          depId: d.id,
          posicion: posicionDe(d),
          deportista: limpiar(d._nombre).toUpperCase(),
        })));
        setAvisoBase(
          'Este partido tenía guardados los deportistas de OTRO equipo, por una falla que ya se ' +
          'corrigió. Se puso la lista buena, en blanco, para que se vuelva a llenar. ' +
          'El marcador, el día, el rival, el escenario y el resumen NO se tocaron.',
        );
        duenoPantalla.current = mio;
        return;
      }

      /* PLANILLA CREADA DESDE LA PROGRAMACIÓN (dirección, 29/08/2026).
         Viene con el encabezado lleno —día, hora, rival, escenario, D.T, A.T—
         pero SIN deportistas: la lista se arma sola aquí abajo con los que
         tengan ese torneo asignado. Antes este caso se trataba como "no hay
         nada" y se borraba el encabezado que la dirección acababa de
         programar. */
      if (guardada) {
        const cab: any = conEncabezadoBueno(guardada);
        primeraCarga.current = true;
        setFecha(cab.fecha ?? '');
        setLlegar(cab.llegar ?? '');
        setRival(cab.rival ?? '');
        setEscenario(cab.escenario ?? '');
        setResumen(cab.resumen ?? '');
        setDt(cab.dt ?? '');
        setAt(cab.at ?? '');
        setGolesNos(guardada.goles_nos ?? '');
        setGolesEllos(guardada.goles_ellos ?? '');
        setAutogoles(parseInt(String((guardada as any).autogoles ?? '0'), 10) || 0);
        setDefinitivo((guardada as any).definitivo === true);
        setGuardadoEn(enBase?.actualizada_en ?? '');
        setSinGuardar(false);
        setFilas(convocables.map((d, i) => ({
          ...filaNueva(i),
          depId: d.id,
          posicion: posicionDe(d),
          deportista: limpiar(d._nombre).toUpperCase(),
        })));
        duenoPantalla.current = mio;
        return;
      }

      /* No hay nada archivado de esta fecha.
         ÚNICO caso en que se conserva lo que está en pantalla: el formador
         venía llenando SIN fecha (en la matriz) y apenas ahora la escogió.
         En todo lo demás —cambió de torneo, o se pasó de una fecha a otra—
         se arranca limpio, porque es otro partido. */
      if (!cambioElTorneo && veniaDeMatriz && jornada) { duenoPantalla.current = mio; return; }

      primeraCarga.current = true;
      setSinGuardar(false);
      setGuardadoEn('');
      setDefinitivo(false);
      /* El encabezado y el marcador también se van: son de aquel partido. */
      setFecha(''); setLlegar(''); setRival(''); setEscenario(''); setResumen('');
      /* El D.T arranca con el formador que tiene el torneo asignado; si ese
         día lo reemplaza otro, se cambia en la lista. — 28/08/2026 */
      setDt(limpiar(torneo?.formador ?? '')); setAt('');
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
      duenoPantalla.current = mio;
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

  /** Cómo se llama el PDF que se baja:
   *      "SAB 8 AGO LIGA DESARROLLO SUB 8 FECHA 1.pdf"
   *  El día va de primero para que en la carpeta del computador los partidos
   *  queden ordenados y se reconozca cada uno sin abrirlo. El año se deja por
   *  fuera: alarga el nombre y no hace falta. — dirección, 28/08/2026
   *  (Se define más abajo, después de `fechaBonita`.) */

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

  /** "SAB 8 AGO LIGA DESARROLLO SUB 8 FECHA 1" — el nombre del archivo PDF.
   *  El orden lo mandó la dirección (28/08/2026): primero el DÍA del partido,
   *  después el EQUIPO y de último la FECHA. */
  const nombreDelPdf = useMemo(() => {
    const dia = fechaBonita.replace(/\s+\d{4}$/, '').trim();   // sin el año
    const equipo = torneo
      ? [torneo.torneo, torneo.programa, torneo.categoria].map(limpiar).filter(Boolean).join(' ')
      : (numTorneo ? `TORNEO ${numTorneo}` : '');
    const laFecha = jornada ? etiquetaFecha(jornada) : '';
    return [dia, equipo, laFecha].filter(Boolean).join(' ');
  }, [fechaBonita, torneo, numTorneo, jornada]);

  /** "FECHA 1A SAB 4 AGO 2026 / LLEGAR 10:00AM / RIVAL ATLETICO NACIONAL" */
  const renglonJornada = useMemo(() => {
    const partes: string[] = [];
    const j = [limpiar(jornada), fechaBonita].filter(Boolean).join(' ');
    if (j) partes.push(`FECHA ${j.toUpperCase()}`);
    if (limpiar(llegar)) partes.push(`LLEGAR ${limpiar(llegar).toUpperCase()}`);
    if (limpiar(rival)) partes.push(`RIVAL ${limpiar(rival).toUpperCase()}`);
    if (limpiar(escenario)) partes.push(`ESCENARIO ${limpiar(escenario).toUpperCase()}`);
    return partes.join(' / ');
  }, [jornada, fechaBonita, llegar, rival, escenario]);

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

  /* ── EL ADMÓN SOLO MIRA (dirección, 29/08/2026) ───────────────────────────
     Los pospartidos ya NO se crean aquí: se crean desde PROGRAMACIÓN DE
     COMPETENCIA y de ahí caen al banco general y al banco del formador.
     El único que llena la información de un partido es el FORMADOR.
     Por eso, al entrar administración ve el LISTADO de todos los partidos,
     numerado, y un botón VER POST PARTIDO. Al abrir uno, lo ve completo pero
     NO puede escribir: todas las casillas quedan bloqueadas. */
  const [abriPlanilla, setAbriPlanilla] = useState(false);
  /* LOS FILTROS DEL BANCO GENERAL (dirección, 29/08/2026): con 38 partidos y
     subiendo, la dirección necesita poder buscar por estado, por formador y
     por día. */
  /* SE PUEDEN ESCOGER VARIOS ESTADOS A LA VEZ (dirección, 29/08/2026): por
     ejemplo SIN INICIAR + A MEDIAS, que es "lo que falta". Lista vacía = todos. */
  const [filtroEstados, setFiltroEstados]       = useState<string[]>([]);
  const [filtroProfeBanco, setFiltroProfeBanco] = useState('');
  const [bancoDesde, setBancoDesde]             = useState('');
  const [bancoHasta, setBancoHasta]             = useState('');
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
    /* EL PDF YA LO PUEDE BAJAR EL FORMADOR (dirección, 29/08/2026, en la
       tarde). Se abrió junto con el resto del pospartido. Ojo: el PDF sale
       SIN la calificación de cada deportista —esa columna va en blanco—,
       porque se comparte por fuera del club; el promedio del equipo sí sale. */
    if (!esAdmon && !esProfe) {
      setError('El PDF de la planilla lo baja únicamente administración.');
      return;
    }
    setBajandoPdf(true);
    setError('');
    try {
      await descargarPlanillaPDF({
        numeroTorneo: numTorneo,
        torneo: nombreTorneo,
        /* En el papel va quien DIRIGIÓ el partido, no quien figura en el
           cuadro: puede haber sido un reemplazo. — 28/08/2026 */
        formador: [
          limpiar(dt) || limpiar(torneo?.formador ?? ''),
          limpiar(at) ? `A.T ${limpiar(at)}` : '',
        ].filter(Boolean).join('  ·  '),
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
          /* LA CALIFICACIÓN DE CADA NIÑO NO SALE EN EL PDF (dirección,
             28/08/2026). El PDF se comparte con papás y con gente de fuera, y
             la nota de un deportista es asunto del club y de su casa, no de
             todo el mundo. La columna CAL se sigue viendo —con su título y su
             espacio— pero va en blanco; el PROMEDIO DEL EQUIPO sí sale, porque
             ese no señala a nadie. En pantalla las notas siguen igual. */
          calificacion: '',
        })),
        resultado,
        golesNos: String(gn),
        golesEllos,
        rival,
        promedio: promedioEquipo,
        /* Lo que escribió el formador debajo del marcador. — 28/08/2026 */
        resumen,
        /* El archivo lleva el día adelante, después el equipo y de último la
           fecha, para que al buscarlo en el computador se reconozca de una y
           queden ordenados:
              SAB 8 AGO LIGA DESARROLLO SUB 8 FECHA 1.pdf
           — dirección, 28/08/2026 */
        nombreArchivo: nombreDelPdf,
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
      jornada, fecha, llegar, rival, escenario, resumen, dt, at,
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
    setEscenario((p as any).escenario ?? '');
    setResumen((p as any).resumen ?? '');
    setDt((p as any).dt ?? '');
    setAt((p as any).at ?? '');
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
    /* LA LLAVE (31/08/2026). Si lo que hay en pantalla todavía no está marcado
       como de ESTE partido, es que se acaba de cambiar de partido y los
       renglones buenos vienen en camino. Guardar ahora es lo que cruzaba dos
       equipos. Así que no se guarda: se espera. */
    if (duenoPantalla.current !== partidoDeAhora()) return;
    if (primeraCarga.current) { primeraCarga.current = false; return; }
    const t = setTimeout(() => {
      /* Se vuelve a mirar al disparar: en esos 0,7 segundos pudo cambiarse
         de partido otra vez. */
      if (duenoPantalla.current !== partidoDeAhora()) return;
      guardarBorradorLocal(planillaDeAhora());
      setSinGuardar(true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, jornada, fecha, llegar, rival, escenario, resumen, dt, at,
      golesNos, golesEllos, autogoles, numTorneo]);

  /** Guarda. `cerrar` = true es GUARDAR DEFINITIVO; false es GUARDAR AVANCE. */
  async function guardarAvance(cerrar = false) {
    /* LA MISMA LLAVE, también aquí (31/08/2026). Si el partido todavía se
       está abriendo, GUARDAR mandaría a la base los deportistas del partido
       anterior. Se le dice que espere un segundo, que es la verdad. */
    if (duenoPantalla.current !== partidoDeAhora()) {
      setError('El partido todavía se está abriendo. Espera un segundo y vuelve a oprimir GUARDAR.');
      return;
    }
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
    /* ── DOS REVISIONES ANTES DE CERRAR ────────────────────────────────────
       (dirección, 31/08/2026)

       El problema real no es el dato: es que hay planillas que se cierran sin
       haberlas trabajado. Se marca TERMINADO y por dentro está en blanco. Por
       eso, al oprimir GUARDAR DEFINITIVO —y SOLO ahí, el avance nunca se
       estorba— se revisan dos cosas:

         1. EL COMENTARIO ES OBLIGATORIO. Un partido cerrado sin una línea de
            resumen no sirve para nada: no se sabe cómo se jugó. Esta sí es
            talanquera, no pasa.

         2. EL ARQUERO SIN ATAJADAS es un RECORDERIS, no una talanquera. Un
            arquero que jugó los 60 minutos y quedó en cero atajadas casi
            siempre significa que la planilla no se llenó. Casi siempre, pero
            no siempre —puede haber un partido en que de verdad no le llegara
            ninguna—, así que se le avisa con los nombres y él decide.
       ──────────────────────────────────────────────────────────────────── */
    if (cerrar) {
      /* 1 · El comentario. Se piden unas cuantas letras de verdad, para que
             un punto o una letra suelta no cuente como resumen. */
      if (limpiar(resumen).length < 15) {
        setError(
          'Falta el BREVE RESUMEN DEL JUEGO. Un partido no queda TERMINADO sin al menos ' +
          'un renglón contando cómo se jugó. Escríbelo abajo del marcador y vuelve a ' +
          'oprimir GUARDAR DEFINITIVO. Lo que ya escribiste está a salvo en este aparato.',
        );
        cajaResumen.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        cajaResumen.current?.focus();
        return;
      }

      /* 2 · Los arqueros que jugaron y quedaron sin ninguna atajada. */
      const arquerosEnCero = filas.filter(f => {
        if (!esPortero(f.posicion)) return false;
        const jugo = f.titular === 'Titular' || f.titular === 'Suplente';
        if (!jugo) return false;
        const ata = Number(String(f.ataja ?? '').trim());
        return !Number.isFinite(ata) || ata <= 0;
      });

      if (arquerosEnCero.length) {
        const nombres = arquerosEnCero
          .map(f => `   ·  ${limpiar(f.deportista).toUpperCase() || 'SIN NOMBRE'}`)
          .join('\n');
        const seguir = confirm(
          (arquerosEnCero.length === 1
            ? 'ESTE ARQUERO JUGÓ Y QUEDÓ CON CERO ATAJADAS:'
            : 'ESTOS ARQUEROS JUGARON Y QUEDARON CON CERO ATAJADAS:') +
          `\n\n${nombres}\n\n` +
          'Revisa que la columna ATA sí se haya llenado, porque un arquero sin ' +
          'ninguna atajada es muy raro.\n\n' +
          'Si de verdad no le llegó ninguna, sigue y ciérralo.\n\n' +
          '¿Cerrar el partido de todas formas?',
        );
        if (!seguir) return;
      }
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
    setJornada(''); setFecha(''); setLlegar(''); setRival(''); setEscenario(''); setResumen('');
    setDt(''); setAt('');
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

  /** EL FORMADOR DEL TORNEO, el del cuadro de Torneos y Competencias. Es el
   *  dueño del pospartido: a su banco llega y él lo llena, así ese día lo haya
   *  reemplazado un compañero. — dirección, 29/08/2026 */
  const formadorDeTorneoNum = useCallback((num: string): string => {
    const n = parseInt(num, 10);
    if (!cuadro || !Number.isFinite(n) || n < 1 || n > cuadro.length) return '';
    return String(limpiar(cuadro[n - 1].formador) ?? '').toUpperCase();
  }, [cuadro]);

  /** Los partidos del banco, agrupados por torneo y ordenados por fecha.
   *
   *  SOLO LOS DEL TORNEO EN EL QUE SE ESTÁ (dirección, 27/08/2026): estando en
   *  el torneo 9 no tiene por qué salir el banco del torneo 1. Con 58 torneos
   *  la lista se volvía interminable y tocaba buscar el propio entre todos.
   *  Si todavía no se ha escrito el número del torneo, se muestran todos: ahí
   *  el banco sirve de índice para escoger por dónde entrar. */
  /* ── EL ORDEN DE LAS FECHAS LO PONE LA MANO ────────────────────────────────
     La dirección lo pidió el 28/08/2026: como son varias fechas, uno agarra el
     renglón y lo pone donde quiera. El orden se guarda POR TORNEO en este
     computador (no en la base): es una comodidad de quien mira, no un dato de
     la academia. Las fechas que todavía no se han movido quedan de últimas,
     en su orden natural (FECHA 1, FECHA 2…). */
  const ORDEN_BANCO_KEY = 'pospartido-orden-banco';
  const [ordenBanco, setOrdenBanco] = useState<Record<string, string[]>>({});

  useEffect(() => {
    try {
      const g = localStorage.getItem(ORDEN_BANCO_KEY);
      if (!g) return;
      const p = JSON.parse(g);
      if (p && typeof p === 'object' && !Array.isArray(p)) setOrdenBanco(p);
    } catch { /* si está dañado, se sigue con el orden natural */ }
  }, []);

  function guardarOrdenBanco(siguiente: Record<string, string[]>) {
    setOrdenBanco(siguiente);
    try { localStorage.setItem(ORDEN_BANCO_KEY, JSON.stringify(siguiente)); } catch { /* nada */ }
  }

  /** El renglón que se está arrastrando y el que tiene el dedo encima. */
  const filaArrastrada = useRef<{ torneo: string; jornada: string } | null>(null);
  const [filaEncima, setFilaEncima] = useState('');
  /* Cuál se está moviendo, para pintarla más tenue mientras va en el aire. */
  const [filaMoviendo, setFilaMoviendo] = useState('');

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
      .map(([num, partidos]) => {
        /* Primero las que la dirección acomodó a mano, en ese mismo orden;
           detrás, las que no se han tocado, por número de fecha. */
        const aMano = ordenBanco[num] ?? [];
        const puesto = new Map(aMano.map((j, i) => [j, i]));
        const dondeVa = (f: FichaBanco) =>
          puesto.has(f.jornada) ? puesto.get(f.jornada)! : 100000 + numeroDeFecha(f.jornada);
        return {
          num,
          titulo: nombreDeTorneoNum(num),
          aMano: aMano.length > 0,
          partidos: partidos.sort((a, b) => dondeVa(a) - dondeVa(b)),
        };
      })
      .sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
  }, [banco, nombreDeTorneoNum, numTorneo, esProfe, misTorneos, ordenBanco]);

  /** Suelta el renglón que se venía arrastrando encima de otro del mismo torneo. */
  function soltarFilaBanco(numT: string, listaActual: FichaBanco[], destino: FichaBanco) {
    const viene = filaArrastrada.current;
    filaArrastrada.current = null;
    setFilaEncima('');
    setFilaMoviendo('');
    if (!viene || viene.torneo !== numT || viene.jornada === destino.jornada) return;
    const lista = listaActual.map(p => p.jornada);
    const de = lista.indexOf(viene.jornada);
    const a  = lista.indexOf(destino.jornada);
    if (de < 0 || a < 0) return;
    lista.splice(a, 0, lista.splice(de, 1)[0]);
    guardarOrdenBanco({ ...ordenBanco, [numT]: lista });
  }

  /** ── CREAR POSPARTIDO ────────────────────────────────────────────────────
   *  Abre arriba una planilla nueva del MISMO torneo del banco, en la primera
   *  fecha que todavía no exista. Así no toca escribir el número del torneo
   *  otra vez ni acordarse de por cuál fecha va. — dirección, 28/08/2026 */
  function crearPospartido(numT: string, yaHechos: FichaBanco[]) {
    const ocupadas = new Set(yaHechos.map(p => numeroDeFecha(p.jornada)));
    let n = 1;
    while (n <= 30 && ocupadas.has(n)) n++;
    setError('');
    ultimoArmado.current = '';
    setNumTorneo(numT);
    setJornada(`${n}A`);
    setDefinitivo(false);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* nada */ }
  }

  /** El torneo con el que se crearía: el que está escrito arriba y, si no hay
   *  ninguno, el único que esté mostrando el banco. */
  const torneoParaCrear = String(numTorneo || '').trim()
    || (bancoPorTorneo.length === 1 ? bancoPorTorneo[0].num : '');
  const hechosDelTorneo = bancoPorTorneo.find(g => g.num === torneoParaCrear)?.partidos ?? [];

  /** Devuelve un torneo a FECHA 1, FECHA 2, FECHA 3… */
  function ordenNaturalBanco(numT: string) {
    const siguiente = { ...ordenBanco };
    delete siguiente[numT];
    guardarOrdenBanco(siguiente);
  }

  /** Cuando el banco muestra un solo torneo, su nombre se sube al título verde
   *  y abajo ya no hace falta repetirlo. Con varios torneos se deja vacío y
   *  cada grupo lleva su propio renglón con el nombre. — 28/08/2026 */
  const unSoloTorneoEnBanco = bancoPorTorneo.length === 1 ? bancoPorTorneo[0].titulo : '';

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
    /* La palabra va delante del marcador, en mayúscula y del color que le
       corresponde. — dirección, 28/08/2026 */
    if (nos > ellos)  return { texto: 'VICTORIA', color: VERDE };
    if (nos < ellos)  return { texto: 'DERROTA', color: ROJO };
    return { texto: 'EMPATE', color: AMBAR };
  }

  /* ── Editar ────────────────────────────────────────────────────────────── */
  function editar(id: string, campo: keyof FilaPlanilla, valor: string | boolean) {
    setFilas(prev => prev.map(f => (f.id === id ? { ...f, [campo]: valor } as FilaPlanilla : f)));
  }

  /** ¿Esta pantalla es de solo mirar? Para administración, SÍ: la información
   *  del partido la llena el formador. — dirección, 29/08/2026 */
  const soloMira = esAdmon;

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
    /* ADMINISTRACIÓN SOLO MIRA (dirección, 29/08/2026): la casilla se ve tal
       cual, con su color y su número, pero no recibe clics ni escritura. Se
       hace aquí, en un solo lugar, para no tener que tocar una por una las
       diez clases de casilla que hay. El nombre del deportista SÍ se deja
       oprimir: lleva al estado de cuenta y eso no cambia nada del partido. */
    if (soloMira && clave !== 'deportista' && clave !== 'num') {
      return (
        <div style={{ pointerEvents: 'none' }}>
          {contenidoCeldaViva(clave, f, i)}
        </div>
      );
    }
    return contenidoCeldaViva(clave, f, i);
  }

  /** Lo mismo, pero sin el candado: es la casilla de verdad. */
  function contenidoCeldaViva(clave: ClaveCol, f: FilaPlanilla, i: number) {
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

  /* ── LO QUE VE ADMINISTRACIÓN: EL BANCO GENERAL ───────────────────────────
     Todos los partidos que existen, numerados, con un botón para abrir cada
     uno. Aquí no se crea ni se llena nada: los partidos entran por
     PROGRAMACIÓN DE COMPETENCIA y los llena el formador.
     — dirección, 29/08/2026 */
  /* MIENTRAS SE PRUEBA, SOLO CASTRO (dirección, 29/08/2026). Los demás
     formadores siguen viendo el aviso de "en ajustes". Para abrírselo a todos,
     se borra la lista de abajo y ya. */
  /* ABIERTO A TODOS LOS FORMADORES (dirección, 29/08/2026, en la tarde).
     Se terminaron las pruebas: todo formador entra a su Banco de Post
     Partidos y gestiona los partidos que la dirección le programó.
     Si algún día hay que volver a cerrarlo para probar algo, se pone
     POSPARTIDO_PARA_TODOS en false y se escriben los apellidos que sí pueden
     en PROFES_QUE_PUEDEN, así: ['CASTRO']. */
  const POSPARTIDO_PARA_TODOS = true;
  const PROFES_QUE_PUEDEN: string[] = [];
  const sinTildes = (x: any) => String(x ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const yoPuedo = POSPARTIDO_PARA_TODOS || PROFES_QUE_PUEDEN.some(p => {
    const yo = sinTildes(nombreProfe);
    const el = sinTildes(p);
    return !!yo && (yo === el || yo.split(' ').includes(el));
  });

  if ((esAdmon || (esProfe && yoPuedo)) && !abriPlanilla) {
    /* EN QUÉ VA CADA PARTIDO (dirección, 29/08/2026).
       Antes todo lo que no estuviera cerrado decía "A MEDIAS", incluso los que
       la dirección acababa de crear y el formador ni había abierto. Ahora son
       tres estados de verdad:

         SIN INICIAR · creado desde Programación y todavía sin tocar
         A MEDIAS    · ya tiene marcador, pero no se ha cerrado
         TERMINADO   · el formador lo dio por definitivo                */
    const estadoDe = (f: any): 'TERMINADO' | 'A MEDIAS' | 'SIN INICIAR' => {
      if (f?.definitivo === true) return 'TERMINADO';
      const algo = String(f?.goles_nos ?? '').trim() !== ''
                || String(f?.goles_ellos ?? '').trim() !== '';
      return algo ? 'A MEDIAS' : 'SIN INICIAR';
    };
    const pelarNom = (x: any) => String(x ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toUpperCase();
    /* Los formadores que aparecen en el banco, para el filtro. Se toman del
       cuadro de Torneos y Competencias —el dueño del equipo—, NO del D.T que
       se haya escrito en la programación. — dirección, 29/08/2026 */
    const profesDelBanco = [...new Set((banco ?? [])
      .map(f => formadorDeTorneoNum(f.torneo_num))
      .map(pelarNom).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    /* AL FORMADOR SOLO SUS PARTIDOS (dirección, 29/08/2026). Él no escoge
       torneo ni fecha: abre lo que la dirección le creó desde Programación de
       Competencia, y lo llena. Nada más. */
    const mios = esProfe ? new Set(misTorneos.map(t => t.num)) : null;
    /* EL PARTIDO ES DEL FORMADOR DEL TORNEO, PUNTO (dirección, 29/08/2026).
       Se probó a mandárselo también a quien figurara de D.T o de A.T en la
       programación, y no sirvió: se le llenaba el banco a un profe con
       partidos que no son de sus equipos.
       La regla queda así: el pospartido llega ÚNICAMENTE al banco del
       formador que aparece en TORNEOS Y COMPETENCIAS. Si ese día lo reemplazó
       un compañero, el que fue le pasa los datos y el formador oficial es
       quien llena el pospartido en su perfil. */
    const todos = [...(banco ?? [])]
      .filter(f => !mios || mios.has(String(f.torneo_num).trim()))
      .filter(f => !filtroEstados.length || filtroEstados.includes(estadoDe(f)))
      .filter(f => !filtroProfeBanco
                || pelarNom(formadorDeTorneoNum(f.torneo_num)) === filtroProfeBanco)
      .filter(f => {
        if (!bancoDesde && !bancoHasta) return true;
        const d = String(f.fecha ?? '');
        if (!d) return false;                       // sin día no entra en un rango
        if (bancoDesde && d < bancoDesde) return false;
        if (bancoHasta && d > bancoHasta) return false;
        return true;
      })
      .sort((a, b) => {
        /* Por día de juego; los que no tienen día, por torneo y fecha. */
        const fa = a.fecha || '9999-99-99';
        const fb = b.fecha || '9999-99-99';
        if (fa !== fb) return fa.localeCompare(fb);
        const ta = parseInt(a.torneo_num, 10) || 0;
        const tb = parseInt(b.torneo_num, 10) || 0;
        if (ta !== tb) return ta - tb;
        return numeroDeFecha(a.jornada) - numeroDeFecha(b.jornada);
      });

    return (
      <div className="min-h-screen pb-16" style={{ background: LIENZO }}>
        <header className="px-4 py-3 flex flex-wrap items-center gap-3"
          style={{ background: 'linear-gradient(to right, #333F50, #0EA142)' }}>
          <button onClick={() => router.push('/dashboard')}
            title="Volver"
            className="shrink-0 rounded-lg p-2 transition hover:opacity-80"
            style={{ background: 'rgba(255,255,255,.16)' }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-black text-[15px] sm:text-base leading-tight uppercase">
              {esProfe ? 'Mi Banco de Post Partidos' : 'Banco General Post Partido'}
            </h1>
            <p className="text-white/70 text-[11px] font-semibold leading-tight">
              {esProfe
                ? 'Los partidos que te programó la dirección. Ábrelos y llénalos.'
                : 'Todos los partidos. Los crea Programación de Competencia y los llena el formador.'}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
            <p className="text-white/75 text-[9px] font-semibold tracking-wide mt-0.5 text-right leading-tight">CONECTA · GESTIONA · GANA</p>
          </div>
        </header>

        <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1100 }}>
          {bancoFalta ? (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                 style={{ background: 'rgba(224,163,58,.14)', border: `1px solid ${AMBAR}` }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBAR }} />
              <p className="text-white text-[12px] font-semibold leading-relaxed">
                El banco todavía no está preparado en la base.
                Corre una sola vez <span className="font-black">PASO-BANCO-POSPARTIDO.bat</span>.
              </p>
            </div>
          ) : cargandoBanco && banco === null ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: GRIS }} />
              <span className="text-white/50 text-[12px] font-semibold">Abriendo el banco…</span>
            </div>
          ) : todos.length === 0 ? (
            <div className="rounded-2xl p-6 text-center"
                 style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <p className="text-white font-black text-[14px] mb-1.5">
                {esProfe ? 'Todavía no tienes partidos' : 'No hay ningún partido todavía'}
              </p>
              <p className="text-white/55 text-[12.5px] font-semibold leading-relaxed">
                {esProfe
                  ? 'Cuando la dirección te programe un partido, aparece aquí y ya lo puedes llenar.'
                  : 'Los partidos se crean en PROGRAMACIÓN DE COMPETENCIA: se llena el renglón y se oprime el balón. De ahí caen aquí y al banco del formador.'}
              </p>
              {!esProfe && (
                <button onClick={() => router.push('/programacion')}
                  className="mt-4 rounded-xl px-4 py-2.5 text-white font-black text-[12px]"
                  style={{ background: VERDE }}>
                  IR A PROGRAMACIÓN
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl mb-3"
                   style={{ background: VERDE }}>
                <Archive className="w-5 h-5 text-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-black text-[15px] tracking-wide">
                    {esProfe ? 'MI BANCO DE POST PARTIDOS' : 'PARTIDOS'}
                  </h2>
                  <p className="text-white/75 text-[11px] font-semibold">
                    {todos.length} {todos.length === 1 ? 'partido' : 'partidos'}
                  </p>
                </div>
                {/* FILTRAR POR ESTADO Y POR FORMADOR (dirección, 29/08/2026):
                    con 38 partidos, sin esto toca leerlos todos. */}
                {/* LOS TRES ESTADOS, DE BOTONES (dirección, 29/08/2026): se
                    pueden prender dos o los tres. Prendiendo SIN INICIAR y
                    A MEDIAS queda "todo lo que falta" de una. */}
                {!esProfe && (['SIN INICIAR', 'A MEDIAS', 'TERMINADO'] as const).map(e => {
                  const prendido = filtroEstados.includes(e);
                  const cuantos = (banco ?? []).filter(x => estadoDe(x) === e).length;
                  const suColor = e === 'TERMINADO' ? '#5BE39B' : e === 'A MEDIAS' ? AMBAR : GRIS;
                  return (
                    <button
                      key={e}
                      onClick={() => setFiltroEstados(prev =>
                        prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
                      title={`Ver los que están ${e.toLowerCase()}. Se pueden prender varios.`}
                      className="shrink-0 rounded-lg px-2 h-[30px] flex items-center gap-1.5
                        text-white text-[11px] font-black"
                      style={{ background: prendido ? AMBAR : 'rgba(255,255,255,.18)' }}>
                      <span className="rounded-full shrink-0"
                            style={{ width: 8, height: 8, background: suColor }} />
                      {e} · {cuantos}
                    </button>
                  );
                })}

                {!esProfe && (
                  <select
                    value={filtroProfeBanco}
                    onChange={e => setFiltroProfeBanco(e.target.value)}
                    title="Ver los partidos de ese formador, de D.T o de A.T"
                    style={{
                      background: filtroProfeBanco ? AMBAR : 'rgba(255,255,255,.18)',
                      border: 'none', height: 30,
                    }}
                    className="shrink-0 rounded-lg px-2 text-white text-[11px] font-black outline-none cursor-pointer">
                    <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS PROFES</option>
                    {profesDelBanco.map(pr => (
                      <option key={pr} value={pr} style={{ color: '#111827', backgroundColor: 'white' }}>{pr}</option>
                    ))}
                  </select>
                )}

                {!esProfe && (
                  <>
                    <input
                      type="date"
                      value={bancoDesde}
                      onChange={e => setBancoDesde(e.target.value)}
                      title="Desde qué día"
                      style={{
                        background: bancoDesde ? AMBAR : 'rgba(255,255,255,.18)',
                        border: 'none', height: 30, colorScheme: 'dark',
                      }}
                      className="shrink-0 rounded-lg px-2 text-white text-[11px] font-black outline-none cursor-pointer" />
                    <span className="text-white/80 text-[10.5px] font-black">HASTA</span>
                    <input
                      type="date"
                      value={bancoHasta}
                      min={bancoDesde || undefined}
                      onChange={e => setBancoHasta(e.target.value)}
                      title="Hasta qué día"
                      style={{
                        background: bancoHasta ? AMBAR : 'rgba(255,255,255,.18)',
                        border: 'none', height: 30, colorScheme: 'dark',
                      }}
                      className="shrink-0 rounded-lg px-2 text-white text-[11px] font-black outline-none cursor-pointer" />
                  </>
                )}

                {!esProfe && (filtroEstados.length > 0 || !!filtroProfeBanco || !!bancoDesde || !!bancoHasta) && (
                  <button
                    onClick={() => { setFiltroEstados([]); setFiltroProfeBanco(''); setBancoDesde(''); setBancoHasta(''); }}
                    title="Quitar los filtros"
                    className="shrink-0 rounded-lg px-2.5 h-[30px] flex items-center gap-1 text-white text-[11px] font-black"
                    style={{ background: 'rgba(255,255,255,.18)' }}>
                    <X className="w-3.5 h-3.5" /> VER TODOS
                  </button>
                )}

                <button onClick={refrescarBanco}
                  disabled={cargandoBanco}
                  title="Volver a leer el banco"
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-white text-[11px] font-black disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,.18)' }}>
                  ACTUALIZAR
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {todos.map((f, i) => {
                  const res = comoQuedo(f);
                  return (
                    <div key={`${f.torneo_num}|${f.jornada}`}
                      className="rounded-xl flex items-center gap-3 pl-2 pr-2 py-2"
                      style={{
                        background: CAMPO,
                        border: `1px solid ${BORDE}`,
                        boxShadow: res ? `inset 4px 0 0 0 ${res.color}` : undefined,
                      }}>
                      <span className="shrink-0 rounded-lg flex items-center justify-center
                        text-white font-black text-[12.5px]"
                        style={{ width: 34, height: 34, background: BORDE }}>
                        {i + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        {/* EL TORNEO Y EL PROFE EN EL MISMO RENGLÓN (dirección,
                            29/08/2026): el formador iba en una tercera línea y
                            engordaba toda la fila. Ahora son solo dos líneas. */}
                        {/* EL DUEÑO DEL EQUIPO EN VERDE (dirección, 29/08/2026):
                            el que aparece en Torneos y Competencias, que es a
                            quien le llega el pospartido. Si ese día lo dirigió
                            otro, ese otro sale detrás, apagadito y con la
                            palabra DIRIGIÓ, para que no se confunda con el
                            dueño. */}
                        {(() => {
                          const dueno = formadorDeTorneoNum(f.torneo_num);
                          const dt = String((f as any).dt ?? '').toUpperCase();
                          const otro = !!dt && pelarNom(dt) !== pelarNom(dueno);
                          return (
                            <p className="font-black text-[12.5px] leading-tight truncate">
                              <span className="text-white">{nombreDeTorneoNum(f.torneo_num)}</span>
                              {!!dueno && (
                                /* SE DICE CON TODAS LAS LETRAS quién lo va a
                                   llenar, para que no se confunda con el que
                                   dirigió ese día. — dirección, 29/08/2026 */
                                <span style={{ color: GRIS }}>{'  ·  GESTIONA '}{dueno}</span>
                              )}
                              {otro && (
                                <span className="text-white/45">{'  ·  DIRIGIÓ '}{dt}</span>
                              )}
                            </p>
                          );
                        })()}
                        <p className="text-white/50 text-[11px] font-semibold leading-tight truncate">
                          {/* EL DÍA EN QUE SE JUEGA, de primero: es lo que más se
                              busca en el listado. — dirección, 29/08/2026 */}
                          {diaCorto(f.fecha) && (
                            <span className="text-white/75 font-black">{diaCorto(f.fecha)} · </span>
                          )}
                          {etiquetaFecha(f.jornada)}
                          {f.rival ? ` · vs ${f.rival.toUpperCase()}` : ' · sin rival'}
                          {/* CADA RESULTADO DE SU COLOR (dirección, 29/08/2026):
                              VICTORIA en verde, EMPATE en naranja y DERROTA en
                              rojo. De un vistazo se lee cómo le fue a cada uno. */}
                          {res && (
                            <span className="font-black" style={{ color: res.color }}>
                              {` · ${res.texto} ${f.goles_nos || '0'} — ${f.goles_ellos || '0'}`}
                            </span>
                          )}
                        </p>
                      </div>

                      {(() => {
                        const est = estadoDe(f);
                        if (est === 'TERMINADO') return (
                          <span className="shrink-0 flex items-center gap-1 rounded px-2 py-1 text-[9.5px] font-black"
                            style={{ background: 'rgba(0,176,80,.16)', border: `1px solid ${VERDE}`, color: '#5BE39B' }}>
                            <Check className="w-3 h-3" /> TERMINADO
                          </span>
                        );
                        if (est === 'A MEDIAS') return (
                          <span className="shrink-0 rounded px-2 py-1 text-[9.5px] font-black"
                            style={{ background: 'rgba(224,163,58,.16)', border: `1px solid ${AMBAR}`, color: AMBAR }}>
                            A MEDIAS
                          </span>
                        );
                        return (
                          <span className="shrink-0 rounded px-2 py-1 text-[9.5px] font-black"
                            style={{ background: 'rgba(124,135,154,.16)', border: `1px solid ${GRIS}`, color: GRIS }}>
                            SIN INICIAR
                          </span>
                        );
                      })()}

                      <button
                        onClick={() => {
                          ultimoArmado.current = '';
                          setNumTorneo(f.torneo_num);
                          setJornada(f.jornada);
                          setAbriPlanilla(true);
                          try { window.scrollTo({ top: 0 }); } catch { /* nada */ }
                        }}
                        title={esProfe ? 'Abrir y llenar este partido' : 'Ver este partido'}
                        className="shrink-0 rounded-lg px-3 py-2 text-white text-[10.5px] font-black
                          transition hover:brightness-125"
                        style={{
                          background: esProfe ? VERDE : '#20293a',
                          border: `1px solid ${esProfe ? VERDE : BORDE}`,
                        }}>
                        {esProfe ? 'GESTIONAR' : 'VER POST PARTIDO'}
                      </button>

                      {/* BORRAR: solo administración. El formador no borra partidos.
                          — dirección, 29/08/2026 */}
                      {!esProfe && (
                      <button
                        onClick={async () => {
                          const como = `${etiquetaFecha(f.jornada)} ${nombreDeTorneoNum(f.torneo_num)}`;
                          if (!window.confirm(
                            `¿Borrar el pospartido de ${como}?\n\n` +
                            'Se pierde todo lo que tenga escrito. Esto NO se puede deshacer.',
                          )) return;
                          setError('');
                          try {
                            await borrarPlanilla(f.torneo_num, f.jornada);
                            borrarBorradorLocal(f.torneo_num, f.jornada);
                            refrescarBanco();
                          } catch (e: any) {
                            setError(e?.message ?? 'No se pudo borrar ese pospartido.');
                          }
                        }}
                        title="Borrar este pospartido"
                        className="shrink-0 rounded-lg flex items-center justify-center transition hover:brightness-125"
                        style={{ width: 34, height: 34, background: 'transparent', border: `1px solid ${ROJO}` }}>
                        <Trash2 className="w-3.5 h-3.5" style={{ color: ROJO }} />
                      </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-white/40 text-[11.5px] font-semibold mt-4 leading-relaxed">
                {esProfe
                  ? 'Estos son los partidos que la dirección te programó. Ábrelos con GESTIONAR y llénalos.'
                  : 'Administración solo mira. La información de cada partido la llena el formador, y los partidos se crean únicamente desde Programación de Competencia.'}
              </p>
            </>
          )}
        </main>
      </div>
    );
  }

  /* ── POSPARTIDO CERRADO PARA LOS FORMADORES (dirección, 28/08/2026) ───────
     El módulo sigue en ajustes y todavía no se le entrega a los profes. Se
     cierra AQUÍ, en la pantalla, y no solo escondiendo el botón del menú: si
     alguien llega con el enlace pegado, tampoco entra.
     Cuando la dirección diga que ya, se borra este bloque y todo vuelve a
     funcionar como está escrito más abajo. */
  if (esProfe && !yoPuedo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: LIENZO }}>
        <div className="rounded-2xl p-6 max-w-[440px] text-center"
             style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: AMBAR }} />
          <h1 className="text-white font-black text-[16px] mb-2">POSPARTIDO EN AJUSTES</h1>
          <p className="text-white/60 text-[13px] font-semibold leading-relaxed">
            Esta sección todavía la está terminando la dirección. Apenas quede lista
            se les avisa y la podrán usar.
          </p>
          <button
            onClick={() => router.push('/mis-proyectos')}
            className="mt-4 rounded-xl px-4 py-2.5 text-white font-black text-[12px]"
            style={{ background: VERDE }}>
            VOLVER
          </button>
        </div>
      </div>
    );
  }

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
            {/* AL FORMADOR NO SE LE DICE "CREAR": él no crea nada, llena el
                partido que la dirección le programó. — 29/08/2026 */}
            <h1 className="text-white font-black text-[15px] sm:text-base leading-tight">
              {esProfe ? 'Post Partido' : 'Crear Pospartido'}
            </h1>
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
            <p className="text-white/75 text-[9px] font-semibold tracking-wide mt-0.5 text-right leading-tight">CONECTA · GESTIONA · GANA</p>
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
        {!!numTorneo && !enMatriz && !soloMira && (
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

        {/* (INFO no va aquí: la dirección lo puso en el recuadro del TORNEO,
            contra la derecha, encima de la casilla RIVAL. — 28/08/2026) */}

        {(esAdmon || esProfe) && (
        <button onClick={bajarPDF} disabled={bajandoPdf}
          title="Bajar esta planilla en PDF. La calificación de cada deportista sale en blanco."
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
          <p className="text-white/75 text-[9px] font-semibold tracking-wide mt-0.5 text-right leading-tight">CONECTA · GESTIONA · GANA</p>
        </div>
      </header>

      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1350 }}>

        {/* VOLVER A LA LISTA — para los dos. Administración además va con
            candado: solo mira. — dirección, 29/08/2026 */}
        {(soloMira || esProfe) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={() => { setAbriPlanilla(false); refrescarBanco(); }}
              className="rounded-xl px-3 py-2 flex items-center gap-1.5 text-white text-[11.5px] font-black
                transition hover:brightness-125"
              style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
              <ArrowLeft className="w-3.5 h-3.5" />
              {esProfe ? 'VOLVER A MIS PARTIDOS' : 'VOLVER A LA LISTA'}
            </button>
            {soloMira && (
              <span className="text-[11.5px] font-bold" style={{ color: AMBAR }}>
                Estás mirando el partido. La información la llena el formador.
              </span>
            )}
          </div>
        )}

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

        {/* ── TORNEO # ──
            Para administración va con candado: se ve todo, pero no se escribe.
            — dirección, 29/08/2026 */}
        <div className="rounded-2xl p-4 mb-3"
             style={{
               background: PANEL, border: `1px solid ${BORDE}`,
               pointerEvents: soloMira ? 'none' : undefined,
             }}>
          <div className="flex flex-wrap items-center gap-3">
            {/* AL FORMADOR NI TORNEOS NI ESCOGER FECHAS: se le muestra el
                nombre del partido y ya. Todo lo demás es de administración.
                — dirección, 29/08/2026 */}
            {!esProfe && (
              <span className="text-white font-black text-[15px]">TORNEO #</span>
            )}

            {/* AL FORMADOR NO SE LE PIDE UN NÚMERO (dirección, 27/08/2026).
                Él no tiene por qué saberse que su torneo es el 17: escoge el
                suyo de una lista, por el nombre, y ya. Y como son los suyos,
                no hay forma de que se meta en el de otro.
                Administración sigue escribiendo el número: son 58 torneos y
                escribir "42" es más rápido que buscarlo en una lista. */}
            {/* AL FORMADOR YA NO SE LE PIDE ESCOGER (dirección, 29/08/2026):
                el partido se lo abrió la dirección desde la programación, así
                que el torneo viene puesto y no se toca. Antes había una lista
                y podía saltar de un torneo a otro, o quedarse en uno vacío. */}
            {esProfe ? (
              <div className="min-w-0">
                <p className="text-white font-black text-[17px] leading-tight truncate">
                  {nombreTorneo || '—'}
                </p>
                <p className="text-white/55 text-[12px] font-black leading-tight">
                  {jornada ? etiquetaFecha(jornada) : ''}
                  {fechaBonita ? ` · ${fechaBonita}` : ''}
                </p>
              </div>
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
                un espacio de pantalla en una caja aparte. — 26/08/2026
                Al FORMADOR no se le repite: él ya lo tiene arriba, con su
                fecha y su día. — 29/08/2026 */}
            {esProfe ? null : nombreTorneo ? (
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

            {/* INFO — deja en blanco la planilla de este partido. Va AQUÍ, en
                este mismo recuadro, contra la derecha y justo encima de la
                casilla RIVAL. — dirección, 28/08/2026 */}
            {!enMatriz && !soloMira && (
              <button onClick={borrarEsteJuego} disabled={borrando || !numTorneo}
                title="Borrar la información de este juego: deja la planilla en blanco"
                className="ml-auto shrink-0 rounded-lg flex items-center justify-center gap-1.5 px-2.5
                  font-black text-[11px] h-8 disabled:opacity-40"
                style={{ background: 'transparent', border: `1px solid ${ROJO}`, color: ROJO }}>
                {borrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                INFO
              </button>
            )}
          </div>

          {/* # FECHA · DÍA DEL JUEGO · HORA LLEGADA · RIVAL.
              El DÍA DEL JUEGO se señala en un calendario: no hay que escribir
              nada ni acordarse del formato. Por dentro se guarda como
              AAAA-MM-DD y en pantalla se muestra "SAB 4 AGO 2026".
              El # FECHA sale de una lista (1A a 30A) para que todo el mundo la
              escriba igual. — dirección, 26/08/2026 */}
          {/* Los anchos NO son iguales a propósito (dirección, 26/08/2026):
              el reloj ocupa lo justo y los nombres se llevan el espacio grande.
              Al entrar ESCENARIO (28/08/2026) se apretaron un poco # FECHA,
              DÍA DEL JUEGO y RIVAL, que es de donde sobraba, para que la
              cancha quepa en el mismo renglón. */}
          <div className={enMatriz
            ? 'grid grid-cols-1 sm:grid-cols-[220px] gap-2 mt-3'
            : esProfe
              ? 'grid grid-cols-2 gap-2 mt-3 sm:grid-cols-[0.85fr_196px_1.3fr_1.3fr]'
              : 'grid grid-cols-2 gap-2 mt-3 sm:grid-cols-[0.6fr_0.85fr_196px_1.3fr_1.3fr]'}>
            {!esProfe && (
            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                # FECHA
              </label>
              {/* AL FORMADOR LA FECHA TAMPOCO SE LE PIDE (dirección,
                  29/08/2026): el partido se lo abrió la dirección, ya viene
                  con su fecha y no se cambia desde aquí. Antes tenía la lista
                  de 1A a 30A y podía irse a una fecha que no existía. */}
              {esProfe ? (
                <span className="w-full rounded-lg px-2 flex items-center text-white text-[12.5px] font-black"
                  style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}>
                  {jornada ? etiquetaFecha(jornada) : '—'}
                </span>
              ) : (
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
              )}
            </div>
            )}

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
                placeholder="RIVAL"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}
                className="w-full rounded-lg px-2.5 text-white text-[12.5px] font-bold outline-none placeholder:text-white/20" />
            </div>

            {/* ESCENARIO — dónde se juega. — dirección, 28/08/2026 */}
            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                ESCENARIO
              </label>
              <input value={escenario} onChange={e => setEscenario(e.target.value)}
                placeholder="ESCENARIO"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 38 }}
                className="w-full rounded-lg px-2.5 text-white text-[12.5px] font-bold outline-none placeholder:text-white/20" />
            </div>
            </>
            )}

          </div>

          {/* EL BOTÓN "SOLO ACTIVOS / TODOS" SE QUITÓ POR INNECESARIO
              (dirección, 28/08/2026). En la planilla SIEMPRE salen únicamente
              los deportistas activos: al retirado no hay para qué llamarlo a
              un partido. Se quedó la regla, no el botón.

              EN SU LUGAR VAN EL D.T Y EL A.T: quién dirigió el partido y quién
              lo asistió. Se escogen de la lista de TODOS los profes del club,
              porque cualquiera puede reemplazar al del equipo ese día. Las dos
              casillas van anchas: ahí cabe el nombre completo. */}
          {!enMatriz && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                D.T
              </label>
              <CasillaProfe valor={dt} onChange={setDt}
                delEquipo={profeDelTorneo(torneo?.formador, profesClub)} todos={profesClub} />
            </div>
            <div>
              <label className="block text-white/45 text-[9.5px] font-black uppercase tracking-widest mb-1">
                A.T
              </label>
              <CasillaProfe valor={at} onChange={setAt}
                delEquipo={profeDelTorneo(torneo?.formador, profesClub)} todos={profesClub} />
            </div>
          </div>
          )}

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
        <div className="rounded-2xl p-3 sm:p-4 mt-2 flex flex-col
          sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]
          items-center gap-3 sm:gap-4"
          style={{
            background: PANEL, border: `1px solid ${BORDE}`,
            pointerEvents: soloMira ? 'none' : undefined,
          }}>

          {/* Tres puestos: AUTOGOL a la izquierda · el partido en el centro ·
              PROMEDIO a la derecha. El del medio queda CENTRADO de verdad en
              el recuadro y las pastillas se van cada una a su orilla sin
              correr el marcador. — dirección, 28/08/2026 */}
          <div className="flex items-center justify-center sm:justify-self-start w-full sm:w-auto">
            <div className="flex items-center gap-2 rounded-lg px-2.5 shrink-0"
              title="Autogoles del rival. Suman a nuestro marcador."
              style={{ height: 36, background: CAMPO, border: `1px solid ${autogoles > 0 ? VERDE : BORDE}` }}>
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
          </div>

          {/* EL RESULTADO, EL MARCADOR Y EL RIVAL QUEDAN COMO SIEMPRE. */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
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
                nombre), que es como se lee un marcador.
                (INFO se subió al encabezado de la pantalla. — 28/08/2026) */}
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

          {/* ── PROMEDIO EQUIPO, CONTRA LA DERECHA ───────────────────────────
              Y debajo el aviso de guardado. — dirección, 28/08/2026 */}
          <div className="flex flex-col items-center sm:items-end gap-1.5 w-full sm:w-auto sm:justify-self-end">
            <div className="flex items-center gap-2 rounded-lg px-2.5 select-none shrink-0"
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

            {sinGuardar ? (
              <p className="text-[11.5px] font-bold" style={{ color: AMBAR }}>
                Tienes cambios sin guardar.
              </p>
            ) : guardadoEn ? (
              <p className="text-white/45 text-[11.5px] font-semibold">
                Guardado {cuandoBonito(guardadoEn)}.
              </p>
            ) : null}
          </div>
        </div>
        )}

        {/* LOS BOTONES VAN DEBAJO DEL MARCADOR (dirección, 26/08/2026): el
            cuadro y su marcador quedan pegados, como se lee un partido, y lo
            demás va después, ya aparte.
            GUARDAR quedó SOLO arriba, en el encabezado: tenerlo dos veces
            confundía sobre si eran dos guardadas distintas. */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* AUTOGOL RIVAL, PROMEDIO EQUIPO y el aviso de guardado están en el
              recuadro gris del resultado; INFO, en el encabezado.
              LOS LETREROS QUE EXPLICABAN LO OBVIO SE QUITARON (dirección,
              28/08/2026): el que contaba cuántos deportistas tienen el torneo
              y el que desglosaba la suma del marcador. Aquí solo quedan los
              avisos de cuando algo FALTA. */}
          {numTorneo && convocables.length > 0 ? null
            : numTorneo && torneo ? (
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

        {/* El desglose de la suma del marcador se quitó por innecesario
            (dirección, 28/08/2026). La cuenta sigue igual: nuestros goles son
            los de los deportistas más los autogoles del rival, y eso se ve al
            pasar el mouse por encima de nuestro marcador. */}

        {/* ── BREVE RESUMEN DEL JUEGO ──────────────────────────────────────
            Lo escribe el formador, con sus palabras, apenas termina el
            partido: cómo se jugó, qué salió bien, qué hay que trabajar.
            Va debajo del marcador y se guarda con el resto de la planilla.
            En la matriz no aparece: ahí no hay partido. — dirección, 28/08/2026 */}
        {!enMatriz && (
          <div className="rounded-2xl p-3 sm:p-4 mt-3"
               style={{
                 background: PANEL, border: `1px solid ${BORDE}`,
                 pointerEvents: soloMira ? 'none' : undefined,
               }}>
            <label htmlFor="resumen-juego"
              className="flex items-center gap-2 text-white font-black text-[13px] tracking-wide mb-2">
              BREVE RESUMEN DEL JUEGO
              {/* Se avisa desde el principio que sin esto no se puede cerrar,
                  para que no se enteren cuando ya oprimieron. — 31/08/2026 */}
              <span className="rounded-md px-1.5 py-0.5 text-[9.5px] font-black tracking-wider"
                    style={{
                      background: limpiar(resumen).length >= 15 ? 'rgba(0,176,80,.18)' : 'rgba(224,163,58,.18)',
                      color:      limpiar(resumen).length >= 15 ? '#5BE39B' : AMBAR,
                    }}>
                {limpiar(resumen).length >= 15 ? 'LISTO' : 'OBLIGATORIO PARA CERRAR'}
              </span>
            </label>
            <textarea
              id="resumen-juego"
              ref={cajaResumen}
              value={resumen}
              onChange={e => setResumen(e.target.value)}
              rows={4}
              placeholder="Cómo se jugó, qué salió bien y qué hay que trabajar…"
              style={{ background: CAMPO, border: `1px solid ${BORDE}`, resize: 'vertical' }}
              className="w-full rounded-xl px-3 py-2.5 text-white text-[12.5px] font-semibold
                leading-relaxed outline-none placeholder:text-white/20" />
            <p className="text-white/35 text-[10.5px] font-semibold mt-1.5">
              Se guarda junto con la planilla, al oprimir GUARDAR AVANCE o GUARDAR DEFINITIVO.
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            BANCO POSPARTIDO — el archivo de todos los partidos elaborados.
            Agrupados por torneo; cada partido se nombra FECHA 1, FECHA 2…
            Al oprimir uno, se abre arriba tal como quedó guardado.
            — dirección, 27/08/2026

            EN LA MATRIZ NO SE MUESTRA. La matriz es la lista del torneo para
            cargar los cobros, no un partido: ahí el banco estorba. Aparece
            únicamente cuando hay una # FECHA escogida (FECHA 1 … FECHA 12).
            — dirección, 28/08/2026
            ═══════════════════════════════════════════════════════════════════ */}
        {/* AL FORMADOR NO SE LE MUESTRA (dirección, 29/08/2026): él ya entró
            por su propio banco —"MI BANCO DE POST PARTIDOS"— y vuelve a él con
            el botón de arriba. Repetirle el banco aquí abajo lo confunde. */}
        {!enMatriz && !esProfe && (
        <div className="rounded-2xl mt-6 overflow-hidden"
             style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

          {/* Título */}
          <div className="flex items-center gap-3 px-4 py-3"
               style={{ background: VERDE }}>
            <Archive className="w-5 h-5 text-white shrink-0" />
            {/* EL NOMBRE DEL TORNEO VA EN EL TÍTULO VERDE (dirección, 28/08/2026):
                "BANCO POSPARTIDO — LIGA DESARROLLO SUB 8". Así abajo cada fecha
                cabe en un solo renglón, sin repetir el torneo en cada tarjeta. */}
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-black text-[15px] tracking-wide truncate">
                BANCO POST PARTIDO
                {unSoloTorneoEnBanco && (
                  <span className="font-black"> — {unSoloTorneoEnBanco}</span>
                )}
              </h2>
              <p className="text-white/75 text-[11px] font-semibold truncate">
                Oprime un partido para abrirlo. Para cambiarlo de puesto, agárralo de ORDENAR.
              </p>
            </div>
            {/* EL BOTÓN "ACTUALIZAR" SE QUITÓ (dirección, 28/08/2026): nadie
                sabía para qué era. El banco se relee solo al entrar y cada vez
                que se guarda un partido, así que no hacía falta. */}

            {/* CREAR POST PARTIDO SE QUITÓ (dirección, 29/08/2026): de aquí en
                adelante los partidos se crean ÚNICAMENTE desde PROGRAMACIÓN DE
                COMPETENCIA, para que ninguno nazca suelto y sin datos. De allá
                caen al banco general y al banco del formador. */}
            {false && !!torneoParaCrear && (
              <button
                onClick={() => crearPospartido(torneoParaCrear, hechosDelTorneo)}
                title="Empezar un partido nuevo de este torneo"
                className="shrink-0 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition hover:brightness-125"
                style={{ background: '#20293a', border: `1px solid ${BORDE}` }}>
                <Zap className="w-3.5 h-3.5 text-white" />
                <span className="text-white text-[11px] font-black">CREAR POST PARTIDO</span>
              </button>
            )}
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
              /* ── CADA PARTIDO EN UN SOLO RENGLÓN ──────────────────────────
                 La dirección lo pidió así el 28/08/2026: los datos seguidos
                 de izquierda a derecha — FECHA · rival · marcador — y al
                 frente, pegados a la derecha, el sello (TERMINADO verde /
                 A MEDIAS naranja) y el botón EDITAR gris oscuro.
                 Nada de tarjetas anchas: se leen 12 fechas de un vistazo. */
              <div className="flex flex-col gap-3">
                {bancoPorTorneo.map(g => (
                  <div key={g.num} className="flex flex-col gap-1.5">

                    {/* El nombre del torneo solo cuando hay más de uno: si es
                        uno solo, ya está arriba en el título verde. */}
                    {!unSoloTorneoEnBanco && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black text-white"
                              style={{ background: BORDE }}>#{g.num}</span>
                        <span className="text-white font-black text-[12.5px] truncate">{g.titulo}</span>
                        <span className="ml-auto shrink-0 text-white/45 text-[11px] font-bold">
                          {g.partidos.length} {g.partidos.length === 1 ? 'partido' : 'partidos'}
                        </span>
                      </div>
                    )}

                    {/* Solo aparece si las fechas se movieron de puesto: devuelve
                        el torneo a FECHA 1, FECHA 2, FECHA 3… — 28/08/2026 */}
                    {g.aMano && (
                      <div className="flex justify-end px-1">
                        <button
                          onClick={() => ordenNaturalBanco(g.num)}
                          title="Devolver las fechas a su orden natural"
                          className="rounded px-2 py-0.5 text-[9.5px] font-black text-white/60 hover:text-white transition"
                          style={{ background: '#20293a', border: `1px solid ${BORDE}` }}>
                          ORDEN NORMAL
                        </button>
                      </div>
                    )}

                    {g.partidos.map(f => {
                      const res = comoQuedo(f);
                      const abierto = numTorneo === f.torneo_num && jornada === f.jornada;
                      const clave = `${f.torneo_num}|${f.jornada}`;
                      return (
                        <div
                          key={clave}
                          /* EL RENGLÓN NO SE ARRASTRA ENTERO (dirección,
                             28/08/2026): así un clic encima abre el partido,
                             como uno espera. Para cambiarlo de puesto está la
                             manija ORDENAR, a la izquierda, junto a la FECHA.
                             El renglón sí RECIBE lo que se le suelte encima. */
                          onDragOver={e => {
                            const v = filaArrastrada.current;
                            if (!v || v.torneo !== g.num) return;
                            e.preventDefault();
                            if (filaEncima !== clave) setFilaEncima(clave);
                          }}
                          onDragLeave={() => { if (filaEncima === clave) setFilaEncima(''); }}
                          onDrop={e => { e.preventDefault(); soltarFilaBanco(g.num, g.partidos, f); }}
                          onDragEnd={() => {
                            filaArrastrada.current = null; setFilaEncima(''); setFilaMoviendo('');
                          }}
                          className="rounded-lg flex items-center gap-3 pl-2 pr-2 py-1.5 transition"
                          style={{
                            background: CAMPO,
                            border: `1px solid ${abierto ? VERDE : BORDE}`,
                            boxShadow: res ? `inset 4px 0 0 0 ${res.color}` : undefined,
                            outline: filaEncima === clave ? `2px solid ${AMBAR}` : undefined,
                            outlineOffset: filaEncima === clave ? -2 : undefined,
                            opacity: filaMoviendo === clave ? 0.55 : 1,
                          }}>

                          {/* ORDENAR — la manija. SOLO de aquí se agarra el
                              renglón para cambiarlo de puesto. — 28/08/2026 */}
                          <div
                            draggable
                            onDragStart={e => {
                              filaArrastrada.current = { torneo: g.num, jornada: f.jornada };
                              setFilaMoviendo(clave);
                              /* Firefox no arranca el arrastre si no se le pone algo. */
                              try {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', clave);
                              } catch { /* nada */ }
                            }}
                            onDragEnd={() => {
                              filaArrastrada.current = null; setFilaEncima(''); setFilaMoviendo('');
                            }}
                            title="Agarra de aquí para cambiar esta fecha de puesto"
                            className="shrink-0 flex items-center gap-1 rounded px-1.5 py-1 select-none
                              cursor-grab active:cursor-grabbing hover:brightness-125"
                            style={{ background: '#20293a', border: `1px solid ${BORDE}` }}>
                            <GripVertical className="w-3 h-3 text-white/35" />
                            <span className="text-white/40 text-[8.5px] font-black tracking-wide hidden sm:inline">
                              ORDENAR
                            </span>
                          </div>

                          {/* Los datos, seguidos y en una sola línea. Un clic
                              aquí ABRE el partido. */}
                          <button onClick={() => abrirDelBanco(f)}
                            title={`Abrir ${etiquetaFecha(f.jornada)} ${g.titulo}`}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left hover:brightness-125
                              cursor-pointer">
                            <span className="shrink-0 text-white font-black text-[12.5px] w-[62px]">
                              {etiquetaFecha(f.jornada)}
                            </span>
                            {/* CADA DATO DEBAJO DEL DE ARRIBA (dirección,
                                28/08/2026): el rival, la palabra y el marcador
                                llevan un ancho fijo, así los renglones quedan
                                cuadrados como si fueran columnas —aunque no lo
                                sean— por largo que sea el nombre del rival. */}
                            <span className="shrink-0 truncate text-white/60 text-[11.5px] font-semibold
                              w-[150px] sm:w-[250px]">
                              {f.rival ? `vs ${f.rival.toUpperCase()}` : 'sin rival'}
                            </span>
                            {/* EL RESULTADO VA ENSEGUIDA DEL RIVAL — 28/08/2026:
                                primero la palabra (VICTORIA verde, EMPATE ámbar,
                                DERROTA roja) y detrás el marcador. */}
                            <span className="shrink-0 font-black text-[10.5px] tracking-wide w-[62px]"
                                  style={{ color: res?.color }}>
                              {res?.texto || ''}
                            </span>
                            <span className="shrink-0 font-black text-[12px] tabular-nums w-[56px]"
                                  style={{ color: res?.color }}>
                              {res ? `${f.goles_nos || '0'} — ${f.goles_ellos || '0'}` : ''}
                            </span>
                            <span className="flex-1" />
                          </button>

                          {/* Al frente: el sello y EDITAR */}
                          {f.definitivo ? (
                            <span className="shrink-0 flex items-center gap-1 rounded px-2 py-1 text-[9.5px] font-black"
                              style={{ background: 'rgba(0,176,80,.16)', border: `1px solid ${VERDE}`, color: '#5BE39B' }}>
                              <Check className="w-3 h-3" /> TERMINADO
                            </span>
                          ) : (
                            <span className="shrink-0 rounded px-2 py-1 text-[9.5px] font-black"
                              style={{ background: 'rgba(224,163,58,.16)', border: `1px solid ${AMBAR}`, color: AMBAR }}>
                              A MEDIAS
                            </span>
                          )}
                          <button
                            onClick={() => abrirDelBanco(f, true)}
                            title="Abrirlo para corregirlo"
                            className="shrink-0 rounded px-2.5 py-1 text-[9.5px] font-black text-white/75 hover:text-white transition"
                            style={{ background: '#20293a', border: `1px solid ${BORDE}` }}>
                            EDITAR
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

      </main>
    </div>
  );
}
