'use client';

/**
 * VISTA PRELIMINAR DEL MICROCICLO — solo lectura
 *
 * (dirección, 03/09/2026 — «necesito ver cada microciclo de cada profesor en
 *  vista preliminar… y la admón pueda ver, incluso sin abrir, a medias o
 *  terminado»)
 *
 * Esta hoja vivía DENTRO de la pantalla del formador, así que la dirección no
 * tenía cómo verla sin meterse al módulo del profe y buscar el proyecto a
 * mano. Se sacó a un componente aparte para que la use quien la necesite:
 *
 *   · La pantalla del formador (Microciclo) — como siempre.
 *   · Control de Microciclos — la dirección abre cualquier semana de
 *     cualquier profe con un clic, sin salir del cuadro.
 *
 * Es EXACTAMENTE la misma hoja: mismo orden, mismos tamaños, mismo PDF. No se
 * puede editar nada desde aquí.
 */

import { useState } from 'react';
import {
  Users, AlertCircle, MapPin, Clock, Eye, X, Download, Ban,
} from 'lucide-react';
import type { Microciclo, MicrocicloDia, ResumenAsistenciaDia, CargaDia } from '@/lib/db';
import { cn } from '@/lib/utils';

/* ── La paleta y las medidas, iguales a las del módulo Microciclo ── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const HONDO  = '#232B39';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';

const ETQ    = 'text-[11px] font-bold uppercase tracking-wider text-white';
const FRANJA = 'text-[14px] font-black uppercase tracking-wider text-white';
const TXT    = 'text-sm text-white';
const TITULO_DIA = 'text-xl font-black tracking-tight leading-none';

const DIAS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

const VERDE_CHIP = 'bg-[#00B050] text-white border-[#00B050]';
const COMPONENTES: { v: string; t: string; activo: string }[] = [
  { v: 'tecnico',     t: 'Técnico',     activo: VERDE_CHIP },
  { v: 'fisico',      t: 'Físico',      activo: VERDE_CHIP },
  { v: 'tactico',     t: 'Táctico',     activo: VERDE_CHIP },
  { v: 'psicologico', t: 'Psicológico', activo: VERDE_CHIP },
];
const CARGAS: { v: CargaDia; t: string }[] = [
  { v: 'baja',     t: 'Baja'     },
  { v: 'media',    t: 'Media'    },
  { v: 'alta',     t: 'Alta'     },
  { v: 'muy_alta', t: 'Muy alta' },
];

const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function normalizar(t: string) {
  return String(t ?? '').trim().toUpperCase();
}

function fechaLarga(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return String(iso ?? '');
  return `${d.getDate()} de ${MES_LARGO[d.getMonth()]}`;
}

interface Hora12 { h: number; m: string; ap: 'AM' | 'PM'; }

function de24(hhmm: string): Hora12 | null {
  const t = (hhmm ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h24 = Number(m[1]);
  const ap: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h: h12, m: m[2], ap };
}

function partirFranja(valor: string): [string, string] {
  const [a = '', b = ''] = (valor ?? '').split('-');
  return [a.trim(), b.trim()];
}

function textoFranja(valor: string): string {
  const [ini, fin] = partirFranja(valor);
  const a = de24(ini), b = de24(fin);
  if (!a) return '';
  const fmt = (v: Hora12) => `${v.h}:${v.m} ${v.ap}`;
  return b ? `${fmt(a)} – ${fmt(b)}` : fmt(a);
}

// ── VISTA PRELIMINAR (solo lectura) ──────────────────────────────
// Es una hoja vertical: un día debajo del otro, con el mismo tamaño y el
// mismo orden que la pantalla editable, pero sin poder tocar nada.
export function VistaPreliminar({
  mc, asist, onCerrar, programa = '',
}: {
  mc: Microciclo;
  asist: Record<string, ResumenAsistenciaDia>;
  onCerrar: () => void;
  programa?: string;
}) {
  const dias = (mc.dias ?? []).filter(d => d.tipo_dia !== 'descanso');

  /** Lo que se lee en el encabezado: MICROCICLO 27 DESARROLLO SUB 8A */
  const titulo = `MICROCICLO ${mc.numero} ${normalizar(programa)} ${mc.proyecto}`
    .replace(/\s+/g, ' ').trim();
  /** La abreviatura es SOLO el nombre del archivo: MC 27 DES SUB 8A */
  const sigla = `MC ${mc.numero} ${normalizar(programa).slice(0, 3)} ${mc.proyecto}`
    .replace(/\s+/g, ' ').trim();

  /** Descargar en PDF: se imprime SOLO la hoja y el archivo sale con la sigla.
   *  Para que no salgan páginas en blanco al principio, todo lo que no es la
   *  hoja se saca del papel de verdad (display:none), no solo se oculta. */
  function descargarPDF() {
    const capa = document.getElementById('capa-mc');
    if (!capa) return;

    const escondidos: Element[] = [];
    let nodo: HTMLElement | null = capa;
    while (nodo && nodo !== document.body) {
      const padre: HTMLElement | null = nodo.parentElement;
      if (!padre) break;
      Array.from(padre.children).forEach(h => {
        if (h !== nodo) { h.classList.add('oculto-impresion'); escondidos.push(h); }
      });
      nodo = padre;
    }

    const antes = document.title;
    document.title = sigla;

    let hecho = false;
    const restaurar = () => {
      if (hecho) return;
      hecho = true;
      document.title = antes;
      escondidos.forEach(h => h.classList.remove('oculto-impresion'));
      window.removeEventListener('afterprint', restaurar);
    };
    window.addEventListener('afterprint', restaurar);
    window.print();
    setTimeout(restaurar, 4000);   // respaldo si el navegador no avisa
  }

  return (
    <div
      id="capa-mc"
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onCerrar}
    >
      {/* Al imprimir se deja SOLO la hoja: se quitan el fondo y el resto de la pantalla. */}
      <style>{`
        @media print {
          /* Sin margen de página: así el gris llega hasta el borde del papel
             y no quedan parches blancos. También quita la fecha y la
             dirección que Chrome pone en las esquinas. */
          @page { size: A4 portrait; margin: 0; }
          html, body {
            background: #333F50 !important;
            height: auto !important; overflow: visible !important;
          }
          .oculto-impresion, .no-imprimir { display: none !important; }
          #capa-mc {
            position: static !important; display: block !important;
            overflow: visible !important; background: none !important;
            padding: 0 !important; margin: 0 !important; inset: auto !important;
          }
          #hoja-mc {
            position: static !important; width: 100% !important;
            max-width: none !important; margin: 0 !important;
            border-radius: 0 !important; box-shadow: none !important;
            overflow: visible !important;
            background: #333F50 !important;
          }
          /* Todo el fondo del mismo gris, sin parches. */
          #hoja-mc .cuerpo-hoja {
            background: #333F50 !important;
            padding: 6mm 8mm 10mm 8mm !important;
          }
          #hoja-mc .cuerpo-hoja > * + * { margin-top: 6mm !important; }
          #hoja-mc .cabecera-hoja {
            position: static !important;
            padding: 7mm 8mm !important;
            break-after: avoid !important; page-break-after: avoid !important;
          }
          /* El día puede continuar en la página siguiente: así no quedan
             páginas medio vacías. Lo que nunca se parte es cada cuadro. */
          #hoja-mc .dia-hoja { break-inside: auto !important; }
          #hoja-mc .titulo-dia {
            break-after: avoid !important; page-break-after: avoid !important;
            break-inside: avoid !important;
          }
          #hoja-mc .bloque-hoja {
            break-inside: avoid !important; page-break-inside: avoid !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div
        id="hoja-mc"
        className="rounded-2xl w-full max-w-[860px] my-6 shadow-2xl overflow-hidden"
        style={{ background: LIENZO }}
        onClick={e => e.stopPropagation()}
      >
        {/* Encabezado de la hoja */}
        <div className="cabecera-hoja px-5 py-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: VERDE }}>
          <Eye className="w-5 h-5 text-white flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-white font-black text-xl sm:text-2xl leading-tight">
              {titulo}
            </p>
            <p className="text-white text-[11px] mt-0.5 truncate">
              {mc.proyecto}{mc.profesor ? ` · ${mc.profesor}` : ''} ·{' '}
              {fechaLarga(mc.fecha_inicio)} — {fechaLarga(mc.fecha_fin)} ·{' '}
              {dias.length} {dias.length === 1 ? 'sesión' : 'sesiones'}
            </p>
          </div>
          <span className="hidden sm:inline text-[10px] font-black text-white bg-white/25 px-2 py-1 rounded-lg flex-shrink-0">
            SOLO LECTURA
          </span>
          <button onClick={onCerrar} className="no-imprimir text-white hover:text-white flex-shrink-0" title="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* La hoja: un día debajo del otro */}
        <div className="cuerpo-hoja p-4 space-y-4" style={{ background: LIENZO }}>
          {dias.map((d, i) => (
            <DiaLectura key={d.id} dia={d} resumen={asist[d.fecha]} orden={i + 1} />
          ))}
        </div>

        <div className="no-imprimir px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3"
             style={{ borderColor: BORDE }}>
          <p className="text-[11px] text-white leading-snug flex-1 min-w-[200px]">
            Esta vista no se puede editar. El archivo se guarda como <b>{sigla}</b>.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={descargarPDF}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold text-white hover:opacity-90"
              style={{ background: VERDE }}
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>
            <button
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-white border"
              style={{ background: CAMPO, borderColor: BORDE }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Un día dentro de la hoja, con el mismo orden que la pantalla editable ─
function DiaLectura({
  dia, resumen, orden,
}: { dia: MicrocicloDia; resumen?: ResumenAsistenciaDia; orden: number }) {
  const p = resumen && !resumen.cancelado && resumen.convocados > 0 ? resumen.porcentaje : null;
  /** Día cancelado en asistencia: en la hoja no se imprimen ocho cuadros
   *  con rayas, se dice de frente que no hubo entrenamiento.
   *  — dirección, 03/09/2026 */
  const cancelado = Boolean(resumen?.cancelado);

  if (cancelado) {
    return (
      <div className="dia-hoja bloque-hoja rounded-2xl border overflow-hidden"
           style={{ background: PANEL, borderColor: BORDE }}>
        <div className="titulo-dia px-4 py-3 border-b" style={{ background: HONDO, borderColor: BORDE }}>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={TITULO_DIA} style={{ color: VERDE }}>DÍA {orden}</span>
            <span className={cn(TITULO_DIA, 'text-white')}>{DIAS[dia.dia_semana - 1]}</span>
            <span className="text-[11px] text-white">{fechaLarga(dia.fecha)}</span>
          </div>
        </div>
        <div className="px-4 py-4 flex items-center gap-2">
          <Ban className="w-4 h-4 flex-shrink-0" style={{ color: '#E0A33A' }} />
          <p className="text-[12.5px] font-black" style={{ color: '#E0A33A' }}>
            ENTRENAMIENTO CANCELADO — no hubo sesión este día
          </p>
        </div>
        {dia.observaciones?.trim() && (
          <div className="px-4 pb-4">
            <BloqueLectura titulo="Observaciones" texto={dia.observaciones} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dia-hoja rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>
      {/* Cabecera del día — DÍA 1 · LUNES, en letra grande */}
      <div className="titulo-dia px-4 py-3 border-b" style={{ background: HONDO, borderColor: BORDE }}>
        <div className="flex items-baseline gap-3 flex-wrap mb-2">
          <span className={TITULO_DIA} style={{ color: VERDE }}>DÍA {orden}</span>
          <span className={cn(TITULO_DIA, 'text-white')}>{DIAS[dia.dia_semana - 1]}</span>
          <span className="text-[11px] text-white">{fechaLarga(dia.fecha)}</span>
          {p !== null && (
            <span className="ml-auto text-[11px] font-black" style={{ color: VERDE }}>{p}%</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {dia.escenario && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#2B3547] px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" /> {dia.escenario}
            </span>
          )}
          {dia.hora && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#2B3547] px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" /> {textoFranja(dia.hora)}
            </span>
          )}
          {COMPONENTES.filter(c => (dia.componentes ?? []).includes(c.v)).map(c => (
            <span key={c.v} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', c.activo)}>
              {c.t}
            </span>
          ))}
        </div>
      </div>

      {/* Mismo orden y mismo tamaño que la pantalla editable */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Dato titulo="Escenario" texto={dia.escenario} />
          <Dato titulo="Horario"   texto={dia.hora ? textoFranja(dia.hora) : ''} />
        </div>

        <div>
          <p className={cn(ETQ, 'mb-1.5')}>Componente a desarrollar</p>
          <div className="flex flex-wrap gap-2">
            {COMPONENTES.filter(c => (dia.componentes ?? []).includes(c.v)).map(c => (
              <span key={c.v} className={cn('px-3 py-1.5 rounded-full text-[12px] font-bold border', c.activo)}>
                {c.t}
              </span>
            ))}
            {(dia.componentes ?? []).length === 0 && (
              <span className="text-[12px] text-white">—</span>
            )}
          </div>
        </div>

        <div className="sm:max-w-[220px]">
          <Dato titulo="Carga" texto={CARGAS.find(c => c.v === dia.carga)?.t ?? String(dia.carga)} />
        </div>

        <BloqueLectura titulo="Objetivo del día" texto={dia.objetivo_dia} />
        <BloqueLectura titulo="Objetivos específicos" texto={dia.contenidos} />
        <BloqueLectura titulo="Fase inicial"     texto={dia.fase_inicial} />
        <BloqueLectura titulo="Fase central"     texto={dia.fase_central} />
        <BloqueLectura titulo="Fase final"       texto={dia.fase_final} />
        <BloqueLectura titulo="Observaciones"    texto={dia.observaciones} />
      </div>
    </div>
  );
}

/** Un dato corto (escenario, horario, carga) con la misma caja gris. */
function Dato({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="bloque-hoja">
      <p className={cn(ETQ, 'mb-1')}>{titulo}</p>
      <div className={cn('rounded-xl px-3 py-2 border', TXT)}
           style={{ background: CAMPO, borderColor: BORDE }}>
        {texto?.trim() || '—'}
      </div>
    </div>
  );
}

/** Igual que el cuadro editable: franja verde arriba, texto en el gris. */
function BloqueLectura({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="bloque-hoja rounded-xl border overflow-hidden" style={{ borderColor: BORDE }}>
      <div className="px-3 py-2" style={{ background: VERDE }}>
        <span className={FRANJA}>{titulo}</span>
      </div>
      <div className={cn('px-3 py-2 whitespace-pre-wrap break-words leading-snug', TXT)}
           style={{ background: CAMPO, minHeight: 56 }}>
        {texto?.trim() || '—'}
      </div>
    </div>
  );
}
/* El nombre viejo se mantiene como alias para no romper nada que ya lo use. */
export { VistaPreliminar as VistaPreliminarMicrociclo };
