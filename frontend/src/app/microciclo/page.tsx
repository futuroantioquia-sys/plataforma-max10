'use client';

/**
 * MICROCICLO DE ENTRENAMIENTO — categoría SEGUIMIENTO
 *
 * · Lo CONSTRUYE administración (abre la semana).
 * · Lo GESTIONA el formador (llena cada día).
 * · La ASISTENCIA no se digita aquí: se lee del formato /asistencia y solo
 *   se muestra el %, los asistentes y los faltantes con su motivo.
 *
 * Encabezado: PROGRAMA · PROYECTO · FORMADOR · MICROCICLO y sus fechas.
 * De ahí se pasa directo a los días que el proyecto entrena.
 *
 * FASE 2 (pendiente): pizarra de cancha en cada fase, con jugadores,
 * balones, conos, aros y flechas. Las columnas ya están reservadas
 * (pizarra_inicial / pizarra_central / pizarra_final).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CalendarDays, Plus, Save, Trash2, Users, ChevronDown, ChevronUp,
  AlertCircle, PencilRuler, Database, MapPin, Clock, Eye, X, Download, Lock, Unlock,
  Ban,
} from 'lucide-react';
import {
  getDeportistas, getMicrociclos, getMicrociclo, crearMicrociclo,
  guardarMicrocicloDia, guardarMicrociclo, eliminarMicrociclo,
  getResumenAsistencia, claveFecha, getInfoProyecto, getJornadaMes, getProfes,
  estadoTablasMicrociclo, ultimoErrorMicrociclo,
} from '@/lib/db';
import type {
  Deportista, Microciclo, MicrocicloDia, ResumenAsistenciaDia, CargaDia, Profe,
  EstadoMicrociclo,
} from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';
import { PageHeader } from '@/components/PageHeader';
import { esSuperAdmin, esDeportivo, getSesion } from '@/lib/permisos';
import { cn } from '@/lib/utils';

// ── Utilidades de proyecto ───────────────────────────────────────
function getCol(dep: Deportista, rx: RegExp) {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
function proyectoDe(dep: Deportista) {
  return (getCol(dep, /^proy/i) || '').trim();
}
function programaDe(dep: Deportista) {
  return (getCol(dep, /^program/i) || '').trim();
}

/** Orden natural: "2" antes que "10", y los textos alfabéticamente. */
function ordenNatural(a: string, b: string) {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b, 'es');
}

const DIAS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

// ── ESCENARIOS ───────────────────────────────────────────────────
// Sedes donde entrenan los proyectos. "Otro" deja escribir uno nuevo.
// En orden alfabético para encontrarlos rápido en el desplegable.
const ESCENARIOS = [
  'BLOQUE 19',
  'CDC',
  'EAFIT',
  'ELITE',
  'FUNDADORES',
  'LA 80',
  'NIQUÍA',
  'SABANETA',
  'SANTA MÓNICA',
];
const OTRO = '__OTRO__';

// ── PALETA DE LA PLATAFORMA ──────────────────────────────────────
// La misma de Consolidado de asistencias y Vista general: gris muy
// oscuro de fondo, tarjetas un gris más claro, campos de texto en el
// gris intermedio y el verde institucional como único acento.
const LIENZO = '#333F50';   // fondo de toda la pantalla
const PANEL  = '#3C4759';   // tarjetas y paneles
const CAMPO  = '#2B3547';   // campos de texto, desplegables, pastillas
const HONDO  = '#232B39';   // franjas de título dentro de un panel
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const GRIS_TXT = '#FFFFFF';   // en este módulo todo el texto va en blanco
const ROJO   = '#C0504D';   // lo que está incompleto

// ── TIPOGRAFÍA ÚNICA ─────────────────────────────────────────────
// El microciclo editable y la vista preliminar usan exactamente las
// mismas letras y tamaños, para que el formador vea lo mismo en los dos.
const ETQ    = 'text-[11px] font-bold uppercase tracking-wider text-white';
const FRANJA = 'text-[14px] font-black uppercase tracking-wider text-white';
const TXT    = 'text-sm text-white';
const TITULO_DIA = 'text-xl font-black tracking-tight leading-none';

// ── COMPONENTES A DESARROLLAR ────────────────────────────────────
// Se pueden marcar varios en un mismo día.
// Todos van del mismo verde de la plataforma: en la app no hay botones
// de otro color, la marca se distingue por el texto, no por el tono.
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

// ── VISTA PRELIMINAR — qué es un día "gestionado" ────────────────
// La vista preliminar solo abre cuando TODOS los días de entreno del
// microciclo están completos. Los días de descanso no se exigen.
const CAMPOS_DIA: { k: keyof MicrocicloDia; t: string }[] = [
  { k: 'escenario',    t: 'Escenario'         },
  { k: 'hora',         t: 'Horario'           },
  { k: 'componentes',  t: 'Componentes'       },
  { k: 'carga',        t: 'Carga'             },
  { k: 'objetivo_dia', t: 'Objetivo del día'  },
  { k: 'contenidos',   t: 'Objetivos específicos' },
  { k: 'fase_inicial', t: 'Fase inicial'      },
  { k: 'fase_central', t: 'Fase central'      },
  { k: 'fase_final',   t: 'Fase final'        },
];

/** Campos que le faltan a un día. Lista vacía = día gestionado.
 *
 *  ENTRENAMIENTO CANCELADO — dirección, 03/09/2026:
 *  «cuando se cancela un entrenamiento, de igual manera pide información
 *   para llenar el microciclo. Si no hay entrenamiento, este no se debe
 *   llenar».
 *  Si en el formato de asistencia el día quedó marcado CAN, ese día no
 *  hubo entreno: no se le pide escenario, ni hora, ni componentes, ni
 *  fases; tampoco traba la vista preliminar ni el cierre de la semana. */
function faltantesDelDia(d: MicrocicloDia, cancelado = false): string[] {
  if (d.tipo_dia === 'descanso') return [];
  if (cancelado) return [];
  return CAMPOS_DIA
    .filter(c => {
      const v = d[c.k];
      return Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim();
    })
    .map(c => c.t);
}

// ── SESIONES POR SEMANA SEGÚN EL PROGRAMA ────────────────────────
// Regla de la institución: cada programa tiene su carga semanal fija.
// Los días concretos de cada proyecto salen de Asistencia; esta tabla solo
// sirve para avisar cuando un calendario no cuadra con su programa.
const SESIONES_PROGRAMA: Record<string, number> = {
  DESARROLLO:       3,
  SELECCION:        3,
  'PRE PROGRESION': 3,
  PROGRESION:       3,
  FORMACION:        2,
  ESTIMULACION:     1,
};

/** Quita tildes y mayúsculas para que "Selección" y "SELECCION" sean lo mismo. */
function normalizar(t: string) {
  return (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

/** Sesiones semanales que le corresponden a un programa (0 = no definido). */
function sesionesDelPrograma(programa: string): number {
  const n = normalizar(programa);
  const clave = Object.keys(SESIONES_PROGRAMA).find(k => n.includes(k));
  return clave ? SESIONES_PROGRAMA[clave] : 0;
}

// ── CALENDARIO DE MICROCICLOS ────────────────────────────────────
// La temporada arranca en FEBRERO porque el club NO entrena en enero:
// el MICROCICLO 1 es siempre la semana del primer lunes de febrero, y de
// ahí en adelante se cuentan las semanas reales del año hasta la última
// que empieza en diciembre. Aplica igual para todos los programas.
const MC_ANIO = 2026;

/** Primer lunes de febrero de la temporada — allí empieza el microciclo 1. */
function primerLunesFebrero(anio: number): Date {
  const d = new Date(anio, 1, 1);                 // 1 de febrero
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

const MC_ANCLA_NUMERO = 1;
const MC_ANCLA_LUNES  = primerLunesFebrero(MC_ANIO);

/** Último microciclo: la última semana que todavía empieza dentro del año. */
const MC_ULTIMO = (() => {
  const fin = new Date(MC_ANIO, 11, 31);
  const dow = fin.getDay() === 0 ? 7 : fin.getDay();
  fin.setDate(fin.getDate() - (dow - 1));
  return 1 + Math.round((fin.getTime() - MC_ANCLA_LUNES.getTime()) / (7 * 86400000));
})();

const DIA_ABR = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
               'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

/** Lunes con el que arranca el microciclo número n. */
function lunesDeMicrociclo(n: number): Date {
  const base = new Date(MC_ANCLA_LUNES);
  base.setDate(base.getDate() + (n - MC_ANCLA_NUMERO) * 7);
  return base;
}

/** Microciclo al que pertenece una fecha (acotado al rango de la temporada). */
function microcicloDeFecha(f: Date): number {
  const dia = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  const dow = dia.getDay() === 0 ? 7 : dia.getDay();
  dia.setDate(dia.getDate() - (dow - 1));
  const semanas = Math.round((dia.getTime() - MC_ANCLA_LUNES.getTime()) / (7 * 86400000));
  return Math.min(MC_ULTIMO, Math.max(MC_ANCLA_NUMERO, MC_ANCLA_NUMERO + semanas));
}

/* ── DESDE CUÁNDO SE LE COBRAN LOS MICROCICLOS AL FORMADOR ────────────────
   (dirección, 02/09/2026 — «los microciclos desde agosto hasta la fecha»)

   Una semana puede fallar de DOS maneras muy distintas, y solo una se veía:

     · SIN CERRAR  — el microciclo existe, se llenó a medias y nadie oprimió
                     «Dar por terminado». Sale en NARANJA.
     · SIN ABRIR   — nunca se creó. No existe en la base, así que no se podía
                     mostrar como pendiente: no había qué mostrar. Es el hueco
                     que encontró la dirección. Sale en ROJO.

   La segunda se calcula: se recorren las semanas de agosto para acá, se
   descartan las que el proyecto no entrena según su calendario, y lo que
   quede sin microciclo es una semana saltada. */
const MC_DESDE = (() => {
  const d = new Date(MC_ANIO, 7, 1);              // 1 de agosto
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return 1 + Math.round((d.getTime() - MC_ANCLA_LUNES.getTime()) / (7 * 86400000));
})();

/** "1 – 7 jun" para el desplegable. */
function rangoCorto(lunes: Date): string {
  const dom = new Date(lunes); dom.setDate(dom.getDate() + 6);
  const mesCorto = (d: Date) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  return lunes.getMonth() === dom.getMonth()
    ? `${lunes.getDate()} – ${dom.getDate()} ${mesCorto(lunes)}`
    : `${lunes.getDate()} ${mesCorto(lunes)} – ${dom.getDate()} ${mesCorto(dom)}`;
}

/**
 * "LUN 1, MIÉ 3, VIE 5 DE JUNIO" — y si la semana se pasa de mes,
 * "LUN 29 DE JUNIO · MIÉ 1, VIE 3 DE JULIO".
 */
function textoSesiones(fechas: Date[]): string {
  if (!fechas.length) return '';
  const grupos: { mes: number; dias: string[] }[] = [];
  fechas.forEach(f => {
    const etiqueta = `${DIA_ABR[f.getDay()]} ${f.getDate()}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.mes === f.getMonth()) ultimo.dias.push(etiqueta);
    else grupos.push({ mes: f.getMonth(), dias: [etiqueta] });
  });
  return grupos.map(g => `${g.dias.join(', ')} DE ${MESES[g.mes]}`).join(' · ');
}

// ── HORARIO ──────────────────────────────────────────────────────
// El día guarda su franja en la columna `hora` como "HH:MM-HH:MM" en
// formato 24 h. En pantalla se muestra y se edita en 12 h con AM/PM,
// y los minutos solo pueden ser 00, 15, 30 o 45.
const HORAS_12  = Array.from({ length: 12 }, (_, i) => i + 1);   // 1 … 12
const MINUTOS   = ['00', '15', '30', '45'];

interface Hora12 { h: number; m: string; ap: 'AM' | 'PM'; }

/** "14:30" → { h: 2, m: '30', ap: 'PM' }. Vacío → null. */
function de24(hhmm: string): Hora12 | null {
  const t = (hhmm ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h24 = Number(m[1]);
  const ap: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = MINUTOS.includes(m[2]) ? m[2] : '00';
  return { h: h12, m: min, ap };
}

/** { h: 2, m: '30', ap: 'PM' } → "14:30". */
function a24(v: Hora12): string {
  const h24 = v.ap === 'AM' ? (v.h === 12 ? 0 : v.h) : (v.h === 12 ? 12 : v.h + 12);
  return `${String(h24).padStart(2, '0')}:${v.m}`;
}

/** "07:00-08:30" → ["07:00", "08:30"]. */
function partirFranja(valor: string): [string, string] {
  const [a = '', b = ''] = (valor ?? '').split('-');
  return [a.trim(), b.trim()];
}

/** Texto amable para la línea del día: "7:00 AM – 8:30 AM". */
function textoFranja(valor: string): string {
  const [ini, fin] = partirFranja(valor);
  const a = de24(ini), b = de24(fin);
  if (!a) return '';
  const fmt = (v: Hora12) => `${v.h}:${v.m} ${v.ap}`;
  return b ? `${fmt(a)} – ${fmt(b)}` : fmt(a);
}

function fechaLarga(iso: string) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

// ═══════════════════════════════════════════════════════════════
export default function MicrocicloPage() {
  const [cargando, setCargando]   = useState(true);
  /** { PROGRAMA: [proyectos…] } — construido desde las fichas de los deportistas. */
  const [mapa, setMapa]           = useState<Record<string, string[]>>({});
  const [programa, setPrograma]   = useState('');
  const [proyecto, setProyecto]   = useState('');
  /** Formador escrito a mano; si está vacío manda el que trae la ficha. */
  const [formadorEdit, setFormadorEdit] = useState('');
  const [profes, setProfes]             = useState<Profe[]>([]);
  const [formadorFicha, setFormadorFicha] = useState('');
  const [lista, setLista]         = useState<Microciclo[]>([]);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  /* La dirección puede destapar aquí las semanas ya cerradas. Por defecto no
     se ven: su sitio es Mi Consolidado. — 02/09/2026 */
  const [verCerrados, setVerCerrados] = useState(false);

  // Calendario de entrenamiento del proyecto
  const [diasBase, setDiasBase]     = useState<number[]>([]);          // 0=dom … 6=sáb
  const [ajustesMes, setAjustesMes] = useState<Record<string, number[]>>({});
  const [mcSel, setMcSel]           = useState<number>(MC_ANCLA_NUMERO);
  const [creando, setCreando]       = useState(false);

  /** Diagnóstico de la base: null = revisando, '' = todo bien, texto = problema. */
  const [fallaBase, setFallaBase] = useState<string | null>(null);

  const [esAdmin, setEsAdmin] = useState(false);
  const [esProfe, setEsProfe] = useState(false);
  useEffect(() => {
    setEsAdmin(esSuperAdmin() || esDeportivo());
    setEsProfe(getSesion() === 'profesor');
    getProfes().then(setProfes).catch(() => {});
    setMcSel(microcicloDeFecha(new Date()));   // arranca en la semana actual
    estadoTablasMicrociclo()
      .then(r => setFallaBase(r.ok ? '' : r.motivo))
      .catch(() => setFallaBase('SIN_CONEXION'));
  }, []);

  // Programas y sus proyectos
  useEffect(() => {
    getDeportistas().then(deps => {
      let mios: string[] = [];
      try {
        const raw = localStorage.getItem('futuro-profe-proyectos');
        mios = raw ? JSON.parse(raw) : [];
      } catch { /* sin filtro */ }
      const filtrarProfe = getSesion() === 'profesor' && mios.length > 0;

      const acum: Record<string, Set<string>> = {};
      deps.forEach(d => {
        const proy = proyectoDe(d);
        if (!proy) return;
        if (filtrarProfe && !mios.includes(proy)) return;
        const prog = programaDe(d) || 'SIN PROGRAMA';
        if (!acum[prog]) acum[prog] = new Set();
        acum[prog].add(proy);
      });

      const m: Record<string, string[]> = {};
      Object.keys(acum).forEach(k => { m[k] = Array.from(acum[k]).sort(ordenNatural); });
      setMapa(m);

      const progs = Object.keys(m);

      /* Si el formador entró desde su proyecto (botón MICROCICLOS), se
         abre directamente en ese programa y ese proyecto. */
      let elegido = '';
      try {
        const q = new URLSearchParams(window.location.search);
        elegido = (q.get('proyecto') ?? '').trim();
      } catch { /* sin parámetros */ }

      if (elegido) {
        const prog = progs.find(k => m[k].includes(elegido));
        if (prog) { setPrograma(prog); setProyecto(elegido); }
      } else if (progs.length === 1) {
        setPrograma(progs[0]);
        if (m[progs[0]].length === 1) setProyecto(m[progs[0]][0]);
      }
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  const programas = useMemo(
    () => Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'es')),
    [mapa]
  );

  const proyectos = useMemo(
    () => (programa ? (mapa[programa] ?? []) : []),
    [mapa, programa]
  );

  function cambiarPrograma(v: string) {
    setPrograma(v);
    const l = mapa[v] ?? [];
    setProyecto(l.length === 1 ? l[0] : '');
  }

  const recargar = useCallback(() => {
    if (!proyecto) { setLista([]); return; }
    getMicrociclos(proyecto).then(setLista).catch(() => setLista([]));
  }, [proyecto]);

  useEffect(() => { recargar(); setAbiertoId(null); }, [recargar]);

  // Ficha del proyecto: días de entreno, formador y sede
  useEffect(() => {
    setDiasBase([]); setAjustesMes({}); setFormadorEdit(''); setFormadorFicha('');
    if (!proyecto) return;
    getInfoProyecto(proyecto).then(info => {
      setDiasBase(info.dias);
      setFormadorFicha(info.formador);
    }).catch(() => {});
    getJornadaMes(proyecto).then(setAjustesMes).catch(() => {});
  }, [proyecto]);

  /**
   * Formador del proyecto. La fuente principal es la tabla `profes`
   * (es la que se administra en "Info Proyectos y Formadores"); si allí no
   * aparece, se usa el nombre guardado en la jornada del proyecto.
   */
  const formadorAuto = useMemo(() => {
    if (!proyecto) return '';
    const p = profes.find(x => (x.proyectos ?? []).includes(proyecto));
    if (p) return (p.nombre || p.usuario || '').trim();
    return formadorFicha;
  }, [profes, proyecto, formadorFicha]);

  const formador = formadorEdit || formadorAuto;

  /** Fechas con sesión de un microciclo, según el calendario del proyecto. */
  const sesionesDe = useCallback((n: number): Date[] => {
    const lunes = lunesDeMicrociclo(n);
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const f = new Date(lunes); f.setDate(f.getDate() + i);
      const mesKey = `${f.getFullYear()}_${String(f.getMonth() + 1).padStart(2, '0')}`;
      const dias = ajustesMes[mesKey] ?? diasBase;
      if (dias.includes(f.getDay())) out.push(f);
    }
    return out;
  }, [diasBase, ajustesMes]);

  const sesionesSel = useMemo(() => sesionesDe(mcSel), [sesionesDe, mcSel]);
  const esperadas   = useMemo(() => sesionesDelPrograma(programa), [programa]);

  const desajuste = useMemo(() => {
    if (!esperadas || diasBase.length === 0) return null;
    return diasBase.length === esperadas ? null : diasBase.length;
  }, [esperadas, diasBase]);

  const numeros = useMemo(
    () => Array.from({ length: MC_ULTIMO - MC_ANCLA_NUMERO + 1 }, (_, i) => MC_ANCLA_NUMERO + i),
    []
  );

  const yaExiste = useMemo(
    () => lista.find(m => m.fecha_inicio === claveFecha(lunesDeMicrociclo(mcSel))) ?? null,
    [lista, mcSel]
  );

  /** Abre la semana `n`. Sirve para el botón de arriba y para las semanas
      saltadas que se listan en rojo. — 02/09/2026 */
  async function crearSemana(n: number) {
    if (!proyecto) return;
    const ya = lista.find(m => m.fecha_inicio === claveFecha(lunesDeMicrociclo(n)));
    if (ya) { setAbiertoId(ya.id); return; }

    setCreando(true);
    const id = await crearMicrociclo({
      proyecto,
      profesor:      formador,
      numero:        n,
      fecha_inicio:  claveFecha(lunesDeMicrociclo(n)),
      creado_por:    esProfe ? (formador || 'FORMADOR') : 'ADMON',
      fechasEntreno: sesionesDe(n).map(claveFecha),
    });
    setCreando(false);
    if (!id) {
      const r = await estadoTablasMicrociclo();
      setFallaBase(r.ok ? '' : r.motivo);
      alert(
        r.motivo === 'FALTAN_TABLAS'
          ? 'Faltan las tablas del microciclo en Supabase.\n\nEjecuta MICROCICLO-TABLAS.sql (usa 1-COPIAR-SQL.bat).'
          : `No se pudo crear el microciclo.\n\n${ultimoErrorMicrociclo() || r.motivo}`
      );
      return;
    }
    recargar();
    setAbiertoId(id);
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar este microciclo y todos sus días?')) return;
    const ok = await eliminarMicrociclo(id);
    if (!ok) { alert('No se pudo eliminar.'); return; }
    if (abiertoId === id) setAbiertoId(null);
    recargar();
  }

  if (cargando) return <BalonCargando texto="Cargando microciclos..." />;

  const inp = 'w-full rounded-xl px-3 py-2 text-sm text-white bg-[#2B3547] '
            + 'border border-[#4A5568] placeholder:text-[#8C94A0] '
            + 'focus:outline-none focus:ring-2 focus:ring-[#00B050]';

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>
      <PageHeader
        titulo="Microciclo de Entrenamiento"
        subtitulo="Planeación semanal · Seguimiento"
        color="verde"
        backTo="/dashboard"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* PROGRAMA · PROYECTO · FORMADOR */}
        <div className="rounded-2xl border shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
             style={{ background: PANEL, borderColor: BORDE }}>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white mb-1">
              Programa
            </label>
            <select value={programa} onChange={e => cambiarPrograma(e.target.value)} className={inp}>
              <option value="">— Seleccionar programa —</option>
              {programas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white mb-1">
              Proyecto
            </label>
            <select
              value={proyecto}
              disabled={!programa}
              onChange={e => setProyecto(e.target.value)}
              className={cn(inp, 'disabled:bg-[#2B3547]/60 disabled:text-white')}
            >
              <option value="">
                {programa ? '— Seleccionar proyecto —' : 'Elige primero el programa'}
              </option>
              {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white mb-1">
              Formador
            </label>
            <input
              value={formador}
              onChange={e => setFormadorEdit(e.target.value)}
              placeholder={proyecto ? 'Sin formador asignado' : '—'}
              disabled={!proyecto}
              className={cn(inp, 'disabled:bg-[#2B3547]/60 disabled:text-white')}
            />
          </div>
        </div>

        {/* La base no está lista */}
        {fallaBase ? (
          <div className="bg-[#4A2226] border border-[#8A3B42] rounded-2xl p-4 flex items-start gap-3">
            <Database className="w-5 h-5 text-[#FF7A7A] mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              {fallaBase === 'FALTAN_TABLAS' ? (
                <>
                  <p className="text-sm font-black text-[#FFC9C9]">Faltan las tablas en Supabase</p>
                  <p className="text-[12px] text-[#F0B9B9] mt-1 leading-snug">
                    En la carpeta del proyecto, doble clic a <b>1-COPIAR-SQL.bat</b>, luego a
                    <b> INSTALAR-TABLAS-1-CLIC.bat</b>, pega con Ctrl+V y oprime <b>Correr</b>.
                    Después vuelve aquí y oprime F5.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-[#FFC9C9]">Supabase respondió con un error</p>
                  <p className="text-[11px] text-[#F0B9B9] mt-1 font-mono break-all">{fallaBase}</p>
                </>
              )}
            </div>
          </div>
        ) : null}

        {esProfe && (
          <div className="rounded-2xl p-3 flex items-start gap-2 border"
               style={{ background: 'rgba(0,176,80,.10)', borderColor: 'rgba(0,176,80,.35)' }}>
            <PencilRuler className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: VERDE }} />
            <p className="text-[12px] leading-snug" style={{ color: GRIS_TXT }}>
              Las sesiones salen del calendario del proyecto y <b>la asistencia se toma sola</b> del
              formato que usted ya diligencia. Usted completa escenario, hora, componentes y las fases.
            </p>
          </div>
        )}

        {/* MICROCICLO + SESIONES */}
        {proyecto && (
          <div className="rounded-2xl border shadow-sm p-4 flex flex-wrap items-end gap-3"
               style={{ background: PANEL, borderColor: BORDE }}>
            <div className="min-w-[210px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-white mb-1">
                Microciclo
              </label>
              <select value={mcSel} onChange={e => setMcSel(Number(e.target.value))} className={inp}>
                {numeros.map(n => {
                  const existe = lista.some(m => m.fecha_inicio === claveFecha(lunesDeMicrociclo(n)));
                  return (
                    <option key={n} value={n}>
                      {existe ? '✓ ' : ''}MICROCICLO {n} · {rangoCorto(lunesDeMicrociclo(n))}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex-1 min-w-[240px]">
              <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white mb-1">
                Sesiones
                {esperadas > 0 && (
                  <span className="text-[10px] font-bold text-white normal-case tracking-normal">
                    · {programa} entrena {esperadas} {esperadas === 1 ? 'vez' : 'veces'} por semana
                  </span>
                )}
              </label>
              <div className={cn(
                'rounded-xl px-3 py-2 text-sm font-bold border min-h-[42px] flex items-center gap-2',
                sesionesSel.length
                  ? 'bg-[#2B3547] border-[#00B050] text-white'
                  : 'bg-[#2B3547] border-[#4A5568] text-[#E0A33A] font-semibold'
              )}>
                <span className="flex-1">
                  {sesionesSel.length
                    ? textoSesiones(sesionesSel)
                    : diasBase.length === 0
                      ? 'Este proyecto no tiene días de entreno definidos (se configuran en Asistencia).'
                      : 'Semana sin sesiones según el calendario del proyecto.'}
                </span>
                {sesionesSel.length > 0 && esperadas > 0 && (
                  <span className={cn(
                    'text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0',
                    sesionesSel.length === esperadas
                      ? 'bg-[#00B050] text-white'
                      : 'bg-[#E0A33A] text-[#232B39]'
                  )}>
                    {sesionesSel.length}/{esperadas}
                  </span>
                )}
              </div>

              {desajuste !== null && (
                <p className="text-[11px] text-[#E0A33A] mt-1 leading-snug">
                  ⚠ El calendario de <b>{proyecto}</b> tiene {desajuste}{' '}
                  {desajuste === 1 ? 'día' : 'días'} a la semana, pero <b>{programa}</b> entrena{' '}
                  {esperadas}. Se ajusta en <b>Asistencia</b>.
                </p>
              )}
            </div>

            {(esAdmin || esProfe) && (
              <button
                onClick={() => crearSemana(mcSel)}
                disabled={creando}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition flex-shrink-0',
                  creando ? 'bg-[#4A5568]'
                    : yaExiste ? 'bg-[#00B050] hover:bg-[#00913F]'
                    : 'bg-[#00B050] hover:bg-[#00913F]'
                )}
              >
                <Plus className="w-4 h-4" />
                {creando ? 'Creando…' : yaExiste ? `Abrir microciclo ${mcSel}` : `Crear microciclo ${mcSel}`}
              </button>
            )}
          </div>
        )}

        {/* Lista */}
        {!proyecto ? (
          <div className="rounded-2xl border p-10 text-center" style={{ background: PANEL, borderColor: BORDE }}>
            <CalendarDays className="w-8 h-8 text-white mx-auto mb-2" />
            <p className="text-sm text-white">
              {programa
                ? 'Selecciona un proyecto para ver sus microciclos.'
                : 'Selecciona primero el programa y luego el proyecto.'}
            </p>
          </div>
        ) : (() => {

          /* ── QUÉ SE VE AQUÍ Y QUÉ SE VA AL CONSOLIDADO ─────────────────
             (dirección, 02/09/2026)

             La regla que definió la dirección cabe en una frase:
                 CERRADO se va al Consolidado · SIN CERRAR se queda aquí.

             De ahí salen tres grupos:
               · ESTA SEMANA        — el microciclo de hoy, arriba y abierto.
               · LE QUEDARON PENDIENTES — semanas que ya pasaron y el formador
                 nunca cerró. Salen en NARANJA y no se van hasta que las
                 termine. Es lo que la dirección quería ver de un vistazo.
               · YA PLANEADAS       — semanas futuras que alguien adelantó.

             Los cerrados no se pintan: se leen en Mi Consolidado. Abajo queda
             el enlace, y la dirección tiene un «ver aquí» por si necesita
             revisar alguno sin salir de esta pantalla. */

          const mcHoy     = microcicloDeFecha(new Date());
          const abiertos  = lista.filter(m => m.estado !== 'cerrado');
          const cerrados  = lista.filter(m => m.estado === 'cerrado');

          /* SEMANAS SALTADAS. Las que ya pasaron, el proyecto sí entrenaba, y
             el microciclo nunca se creó. No pueden salir como «pendientes»
             porque no existen: se calculan aquí y se ofrecen para abrirlas.
             — dirección, 02/09/2026 */
          const yaCreadas   = new Set(lista.map(m => Number(m.numero)));
          const sinAbrir: number[] = [];
          if (diasBase.length > 0) {
            for (let n = Math.max(MC_DESDE, MC_ANCLA_NUMERO); n < mcHoy; n++) {
              if (yaCreadas.has(n)) continue;
              if (sesionesDe(n).length === 0) continue;   // esa semana no se entrenaba
              sinAbrir.push(n);
            }
          }
          sinAbrir.reverse();                              // la más reciente primero

          const deHoy      = abiertos.filter(m => m.numero === mcHoy);
          const pendientes = abiertos.filter(m => m.numero <  mcHoy)
                                     .sort((a, b) => b.numero - a.numero);
          const futuros    = abiertos.filter(m => m.numero >  mcHoy);

          const pintar = (mc: Microciclo, tono: 'hoy' | 'pendiente' | 'futuro' | 'cerrado') => (
            <TarjetaMicrociclo
              key={mc.id}
              cabecera={mc}
              abierto={abiertoId === mc.id}
              onToggle={() => setAbiertoId(abiertoId === mc.id ? null : mc.id)}
              onBorrar={() => borrar(mc.id)}
              esAdmin={esAdmin}
              esProfe={esProfe}
              programa={programa}
              tono={tono}
              /* Los días que el proyecto entrena HOY, según Gestión de
                 Asistencia. Sirve para avisar si el microciclo se quedó con
                 los de antes. — dirección, 02/09/2026 */
              diasDeHoy={sesionesDe(mc.numero).map(f => f.getDay())}
            />
          );

          const Rotulo = ({ texto, color }: { texto: string; color: string }) => (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] font-black uppercase tracking-[.18em] flex-shrink-0"
                    style={{ color }}>{texto}</span>
              <span className="flex-1 h-px" style={{ background: BORDE }} />
            </div>
          );

          return (
            <div className="space-y-3">

              {deHoy.length > 0 && (
                <>
                  <Rotulo texto="Esta semana" color={VERDE} />
                  {deHoy.map(mc => pintar(mc, 'hoy'))}
                </>
              )}

              {pendientes.length > 0 && (
                <>
                  <Rotulo
                    texto={`Le quedaron pendientes · ${pendientes.length}`}
                    color="#E0A33A"
                  />
                  {pendientes.map(mc => pintar(mc, 'pendiente'))}
                </>
              )}

              {/* ── SEMANAS QUE NUNCA SE ABRIERON ──────────────────────────
                  En rojo, y con el botón para abrirlas de una vez. Es la
                  única falla que la plataforma no podía mostrar antes: un
                  microciclo que no existe no se puede marcar de ningún
                  color. — dirección, 02/09/2026 */}
              {sinAbrir.length > 0 && (
                <>
                  <Rotulo texto={`Nunca se abrieron · ${sinAbrir.length}`} color="#C0504D" />
                  <div className="rounded-2xl border overflow-hidden"
                       style={{ background: PANEL, borderColor: '#C0504D', borderLeftWidth: 5 }}>
                    <p className="px-4 pt-3 pb-1 text-[12px] font-semibold leading-snug text-white/85">
                      Estas semanas ya pasaron, el proyecto sí entrenaba y{' '}
                      <b style={{ color: '#F0A6A3' }}>el microciclo nunca se creó</b>.
                      No salen como pendientes porque no existen todavía.
                    </p>
                    <div className="p-3 pt-2 space-y-2">
                      {sinAbrir.map(n => {
                        const ses = sesionesDe(n);
                        return (
                          <div key={n}
                               className="flex items-center gap-3 rounded-xl px-3 py-2"
                               style={{ background: '#2B3547', border: `1px solid ${BORDE}` }}>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-black text-white">
                                Microciclo {n}
                                <span className="font-semibold ml-2">{rangoCorto(lunesDeMicrociclo(n))}</span>
                              </p>
                              <p className="text-[11px] font-semibold" style={{ color: '#7C879A' }}>
                                {ses.length} {ses.length === 1 ? 'día de entreno' : 'días de entreno'} · sin abrir
                              </p>
                            </div>
                            {(esAdmin || esProfe) && (
                              <button
                                onClick={() => crearSemana(n)}
                                disabled={creando}
                                className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg
                                           text-[10px] font-black uppercase tracking-wide
                                           text-white disabled:opacity-60 hover:opacity-85"
                                style={{ background: '#C0504D' }}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {creando ? 'Abriendo…' : `Abrir semana ${n}`}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {futuros.length > 0 && (
                <>
                  <Rotulo texto="Ya planeadas" color="#7C879A" />
                  {futuros.map(mc => pintar(mc, 'futuro'))}
                </>
              )}

              {abiertos.length === 0 && sinAbrir.length === 0 && (
                lista.length === 0 ? (
                  <div className="rounded-2xl border p-10 text-center"
                       style={{ background: PANEL, borderColor: BORDE }}>
                    <CalendarDays className="w-8 h-8 text-white mx-auto mb-2" />
                    <p className="text-sm text-white">
                      Todavía no hay microciclos para <b>{proyecto}</b>.
                      {(esAdmin || esProfe)
                        ? ' Escoja la semana arriba y oprima Crear microciclo.'
                        : ' Todavía no se ha abierto la semana.'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border p-8 text-center"
                       style={{ background: PANEL, borderColor: VERDE }}>
                    <Lock className="w-7 h-7 mx-auto mb-2" style={{ color: VERDE }} />
                    <p className="text-sm text-white font-bold">
                      Todo al día: no hay ninguna semana pendiente en <b>{proyecto}</b>.
                    </p>
                    <p className="text-[12px] text-white/70 mt-1">
                      Las semanas terminadas se leen en Mi Consolidado.
                    </p>
                  </div>
                )
              )}

              {cerrados.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                  <a href="/consolidado"
                     className="text-[12px] font-bold hover:underline"
                     style={{ color: '#5BE39B' }}>
                    {cerrados.length === 1
                      ? 'Hay 1 semana terminada — está en Mi Consolidado →'
                      : `Hay ${cerrados.length} semanas terminadas — están en Mi Consolidado →`}
                  </a>
                  <button
                    onClick={() => setVerCerrados(!verCerrados)}
                    className="text-[11px] font-bold text-[#7C879A] hover:text-white"
                  >
                    {verCerrados ? '(ocultarlas aquí)' : '(verlas aquí)'}
                  </button>
                </div>
              )}

              {verCerrados && cerrados.map(mc => pintar(mc, 'cerrado'))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
function TarjetaMicrociclo({
  cabecera, abierto, onToggle, onBorrar, esAdmin, esProfe = false, programa = '', diasDeHoy = [],
  tono = 'hoy',
}: {
  cabecera: Microciclo; abierto: boolean; onToggle: () => void;
  onBorrar: () => void; esAdmin: boolean; esProfe?: boolean; programa?: string;
  diasDeHoy?: number[];
  /** Cómo se pinta: la semana de hoy, una atrasada, una futura o una cerrada. */
  tono?: 'hoy' | 'pendiente' | 'futuro' | 'cerrado';
}) {
  const [detalle, setDetalle]   = useState<Microciclo | null>(null);
  const [asist, setAsist]       = useState<Record<string, ResumenAsistenciaDia>>({});
  const [cargando, setCargando] = useState(false);
  /** Por defecto solo se muestran los días en que el proyecto entrena. */

  /** Vista preliminar: solo lectura, y solo si la semana está completa. */
  const [previa, setPrevia]     = useState(false);
  const [aviso, setAviso]       = useState<{ dia: string; faltan: string[] }[] | null>(null);
  const [revisando, setRevisando] = useState(false);

  /** Microciclo terminado: queda en solo lectura para todo el mundo. */
  const [estado, setEstado]   = useState<EstadoMicrociclo>(cabecera.estado);
  const [cerrando, setCerrando] = useState(false);
  const cerrado = estado === 'cerrado';

  /** Trae la semana completa (días + asistencia). Se usa al abrir y en la previa. */
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [mc, res] = await Promise.all([
        getMicrociclo(cabecera.id),
        getResumenAsistencia(cabecera.proyecto, cabecera.fecha_inicio, cabecera.fecha_fin),
      ]);
      setDetalle(mc);
      setAsist(res);
      if (mc) setEstado(mc.estado);
      // Se devuelven LOS DOS: quien revisa la semana necesita saber, del
      // mismo tirón, qué días quedaron cancelados en asistencia. El estado
      // de React todavía no está actualizado cuando termina esta función.
      return { mc, asis: res };
    } finally {
      setCargando(false);
    }
  }, [cabecera.id, cabecera.proyecto, cabecera.fecha_inicio, cabecera.fecha_fin]);

  useEffect(() => {
    if (!abierto || detalle) return;
    void cargar();
  }, [abierto, detalle, cargar]);

  async function abrirPrevia() {
    setAviso(null);
    setRevisando(true);
    // Siempre se vuelve a leer de la base: la vista preliminar muestra lo
    // que está GUARDADO, no lo que se acabó de escribir sin guardar.
    const { mc, asis } = await cargar();
    setRevisando(false);

    if (!mc) {
      setAviso([{ dia: 'Microciclo', faltan: ['No se pudo leer la información de la semana. Oprima F5 y vuelva a intentar.'] }]);
      return;
    }

    const dias = (mc.dias ?? []).filter(d => d.tipo_dia !== 'descanso');
    if (!dias.length) {
      setAviso([{ dia: 'Semana sin sesiones', faltan: ['Este microciclo no tiene días de entreno.'] }]);
      return;
    }

    const pendientes = dias
      .map(d => ({
        dia: `${DIAS[d.dia_semana - 1]} ${fechaLarga(d.fecha)}`,
        faltan: faltantesDelDia(d, Boolean(asis[d.fecha]?.cancelado)),
      }))
      .filter(x => x.faltan.length > 0);

    if (pendientes.length) { setAviso(pendientes); return; }
    setPrevia(true);
  }

  /** Deja el microciclo terminado: nadie lo puede volver a editar. */
  async function cerrarMicrociclo() {
    setAviso(null);
    setCerrando(true);
    const { mc, asis } = await cargar();
    if (!mc) {
      setCerrando(false);
      setAviso([{ dia: 'Microciclo', faltan: ['No se pudo leer la semana. Oprima F5 y vuelva a intentar.'] }]);
      return;
    }

    const dias = (mc.dias ?? []).filter(d => d.tipo_dia !== 'descanso');
    const pendientes = dias
      .map(d => ({
        dia: `${DIAS[d.dia_semana - 1]} ${fechaLarga(d.fecha)}`,
        faltan: faltantesDelDia(d, Boolean(asis[d.fecha]?.cancelado)),
      }))
      .filter(x => x.faltan.length > 0);

    if (!dias.length || pendientes.length) {
      setCerrando(false);
      setAviso(pendientes.length ? pendientes
        : [{ dia: 'Semana sin sesiones', faltan: ['Este microciclo no tiene días de entreno.'] }]);
      return;
    }

    const seguro = window.confirm(
      `¿Dar por TERMINADO el microciclo ${cabecera.numero}?\n\n`
      + 'Después de esto NADIE lo puede editar — ni administración.\n'
      + 'Queda solo para leer y descargar en PDF.'
    );
    if (!seguro) { setCerrando(false); return; }

    const ok = await guardarMicrociclo(cabecera.id, { estado: 'cerrado' });
    setCerrando(false);
    if (ok) setEstado('cerrado');
    else alert('No se pudo cerrar el microciclo. Intente de nuevo.');
  }

  /** Solo el súper administrador puede volver a abrirlo, por si hubo un error. */
  async function reabrirMicrociclo() {
    if (!window.confirm(`¿Volver a abrir el microciclo ${cabecera.numero} para edición?`)) return;
    setCerrando(true);
    const ok = await guardarMicrociclo(cabecera.id, { estado: 'borrador' });
    setCerrando(false);
    if (ok) setEstado('borrador');
    else alert('No se pudo reabrir el microciclo.');
  }

  /** Promedio de asistencia de la semana (solo días con registro). */
  const promedio = useMemo(() => {
    const dias = Object.values(asist).filter(d => d.convocados > 0);
    if (!dias.length) return null;
    return Math.round(dias.reduce((s, d) => s + d.porcentaje, 0) / dias.length);
  }, [asist]);

  /* Una semana que ya pasó y nadie cerró: se pinta en naranja para que el
     formador la vea de una vez. — dirección, 02/09/2026
     Si el formador la cierra sin salir de la pantalla, deja de estar en
     naranja al instante: por eso se mira también el estado de aquí. */
  const pendiente = tono === 'pendiente' && !cerrado;
  const atraso    = Math.max(0, microcicloDeFecha(new Date()) - cabecera.numero);

  return (
    <div className="rounded-2xl border shadow-sm overflow-hidden"
         style={{
           background:     PANEL,
           borderColor:    pendiente ? '#E0A33A' : tono === 'hoy' ? VERDE : BORDE,
           borderLeftWidth: pendiente || tono === 'hoy' ? 5 : 1,
         }}>
      <div className="w-full px-4 py-3.5 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 text-left flex-1 min-w-0 hover:opacity-75 transition"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={pendiente
                 ? { background: 'rgba(224,163,58,.18)', color: '#E0A33A' }
                 : { background: 'rgba(0,176,80,.16)',   color: VERDE }}>
            {pendiente ? <AlertCircle className="w-5 h-5" /> : <CalendarDays className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm text-white leading-tight">
              Microciclo {cabecera.numero}
              <span className="font-semibold text-white ml-2">
                {fechaLarga(cabecera.fecha_inicio)} — {fechaLarga(cabecera.fecha_fin)}
              </span>
            </p>
            {pendiente ? (
              <p className="text-[11px] font-bold truncate mt-0.5" style={{ color: '#E0A33A' }}>
                {atraso <= 1 ? 'La semana pasada' : `Hace ${atraso} semanas`} · quedó sin cerrar
                {cabecera.profesor ? ` · ${cabecera.profesor}` : ''}
              </p>
            ) : cabecera.profesor && (
              <p className="text-[11px] text-white truncate mt-0.5">{cabecera.profesor}</p>
            )}
          </div>
        </button>

        {pendiente && (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg flex-shrink-0"
                style={{ background: '#E0A33A', color: '#111827' }}
                title="Esta semana nunca se dio por terminada">
            Pendiente
          </span>
        )}

        {cerrado && (
          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider
                           text-white px-2 py-1 rounded-lg flex-shrink-0"
                style={{ background: VERDE }}
                title="Microciclo terminado — solo lectura">
            <Lock className="w-3 h-3" /> Terminado
          </span>
        )}

        {promedio !== null && (
          <span className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-white bg-[#2B3547] px-2 py-1 rounded-lg flex-shrink-0">
            <Users className="w-3 h-3" /> {promedio}%
          </span>
        )}

        {/* En una semana PENDIENTE no va vista preliminar: está a medio llenar,
            no hay nada que imprimir todavía. Lo único que hay que hacer con
            ella es abrirla y terminarla. — dirección, 02/09/2026 */}
        {pendiente ? (
          <button
            onClick={onToggle}
            title="Abrir esta semana y terminar de llenarla"
            className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg border transition
                       text-[10px] font-black uppercase tracking-wide hover:opacity-85"
            style={{ background: '#E0A33A', color: '#111827', borderColor: '#E0A33A' }}
          >
            <PencilRuler className="w-3.5 h-3.5" />
            Abrir y terminar
          </button>
        ) : (
          /* VISTA PRELIMINAR — solo lectura, junto al % de asistencia */
          <button
            onClick={abrirPrevia}
            disabled={revisando}
            title="Ver toda la labor de la semana sin poder editarla"
            className={cn(
              'flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg border transition',
              'text-[10px] font-black uppercase tracking-wide',
              revisando
                ? 'bg-[#4A5568] text-white border-[#4A5568]'
                : 'bg-[#00B050] text-white border-[#00B050] hover:bg-[#00913F]'
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            {revisando ? 'Revisando…' : 'Vista preliminar'}
          </button>
        )}

        <button onClick={onToggle} className="flex-shrink-0 text-white hover:text-white">
          {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Aviso de por qué no se puede abrir la vista preliminar */}
      {aviso && (
        <div className="border-t px-4 py-3 flex items-start gap-2"
             style={{ background: 'rgba(224,163,58,.12)', borderColor: 'rgba(224,163,58,.45)' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#E0A33A' }} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-black text-[#F0C070]">
              La vista preliminar todavía no se puede abrir
            </p>
            <p className="text-[11px] text-white mt-0.5 leading-snug">
              Solo abre cuando <b>todos los días del microciclo están gestionados</b>.
              Esta revisión lee lo que está <b>guardado</b>: si acabó de escribir algo,
              oprima <b>Guardar</b> en ese día y vuelva a intentar. Falta por llenar:
            </p>
            <ul className="mt-2 space-y-1">
              {aviso.map((x, i) => (
                <li key={i} className="text-[11px] text-[#EBEDF0] leading-snug">
                  <b>{x.dia}:</b> {x.faltan.join(' · ')}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => setAviso(null)}
            className="text-[#E0A33A] hover:text-white flex-shrink-0"
            title="Cerrar el aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {previa && detalle && (
        <VistaPreliminar mc={detalle} asist={asist} programa={programa} onCerrar={() => setPrevia(false)} />
      )}

      {abierto && (
        <div className="border-t p-4 space-y-3" style={{ borderColor: BORDE, background: LIENZO }}>
          {cargando && <p className="text-xs text-white text-center py-4">Cargando la semana…</p>}
          {!cargando && !detalle && (
            <p className="text-xs text-[#FF7A7A] text-center py-4">No se pudo cargar el microciclo.</p>
          )}

          {!cargando && detalle && cerrado && (
            <div className="rounded-2xl border px-4 py-3 flex items-start gap-2"
                 style={{ background: 'rgba(0,176,80,.12)', borderColor: VERDE }}>
              <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: VERDE }} />
              <div>
                <p className="text-[12px] font-black text-white">Microciclo terminado · solo lectura</p>
                <p className="text-[11px] text-white mt-0.5 leading-snug">
                  Esta semana quedó cerrada y <b>no la puede editar nadie</b>, ni administración.
                  Se puede leer y descargar en PDF con <b>VISTA PRELIMINAR</b>.
                </p>
              </div>
            </div>
          )}

          {/* ── ¿LOS DÍAS SE QUEDARON VIEJOS? ────────────────────────────────
              (dirección, 02/09/2026 — «en los microciclos no se actualizan con
               los días de entrenamiento que se seleccionan en Gestión de
               Asistencia»)

              QUÉ PASA. Un microciclo se crea con los días que el proyecto tenía
              ESE día. Después se cambian en Gestión de Asistencia —de lunes,
              miércoles y viernes a lunes, martes y viernes, por ejemplo— y el
              microciclo ya creado sigue con los de antes. Por eso arriba dice
              LUN · MAR · VIE y adentro sale MIÉRCOLES.

              NO SE CAMBIA SOLO, A PROPÓSITO. Un día ya trabajado —con
              escenario, hora, objetivo y fases— no se puede borrar por un
              cambio de calendario. Así que se avisa, se dice exactamente qué
              sobra y qué falta, y se deja un botón. Al oprimirlo solo se tocan
              los días que están EN BLANCO; los que tienen trabajo se respetan y
              se dicen por su nombre. */}
          {!cargando && detalle && !cerrado && (() => {
            const NOM = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
            const dias = detalle.dias ?? [];
            const hoy  = new Set(diasDeHoy);
            const vacio = (d: any) =>
              !String(d.escenario ?? '').trim() && !String(d.hora ?? '').trim() &&
              !String(d.objetivo_dia ?? '').trim() && !String(d.contenidos ?? '').trim() &&
              !String(d.fase_inicial ?? '').trim() && !String(d.fase_central ?? '').trim() &&
              !(Array.isArray(d.componentes) && d.componentes.length);
            const diaJs = (d: any) => Number(d.dia_semana) % 7;   // 7 = domingo → 0

            const faltan = dias.filter(d => hoy.has(diaJs(d)) && d.tipo_dia === 'descanso');
            const sobran = dias.filter(d => !hoy.has(diaJs(d)) && d.tipo_dia !== 'descanso');
            if (!diasDeHoy.length || (!faltan.length && !sobran.length)) return null;

            const sobranConTrabajo = sobran.filter(d => !vacio(d));
            const sobranVacios     = sobran.filter(vacio);

            async function ponerAlDia() {
              if (!window.confirm(
                'Se van a poner los días de este microciclo como están hoy en Gestión de Asistencia.\n\n' +
                'Solo se tocan los días EN BLANCO. Los que ya tengan trabajo escrito NO se tocan.\n\n¿Seguir?'
              )) return;
              setCargando(true);
              for (const d of faltan)        await guardarMicrocicloDia(d.id, { tipo_dia: 'entreno' });
              for (const d of sobranVacios)  await guardarMicrocicloDia(d.id, { tipo_dia: 'descanso' });
              const mc = await getMicrociclo(cabecera.id);
              if (mc) setDetalle(mc);
              setCargando(false);
            }

            return (
              <div className="mx-3 mb-3 rounded-xl px-4 py-3"
                   style={{ background: 'rgba(224,163,58,.12)', border: '1px solid #E0A33A' }}>
                <p className="font-black text-[12.5px]" style={{ color: '#E0A33A' }}>
                  Los días de este microciclo no son los que el proyecto entrena hoy
                </p>
                <p className="text-white/80 text-[12px] font-semibold mt-1 leading-relaxed">
                  {faltan.length > 0 && <>Falta: <b>{faltan.map(d => NOM[diaJs(d)]).join(', ')}</b>. </>}
                  {sobranVacios.length > 0 && <>Sobra (y está en blanco): <b>{sobranVacios.map(d => NOM[diaJs(d)]).join(', ')}</b>. </>}
                  {sobranConTrabajo.length > 0 && (
                    <>Sobra pero <b style={{ color: '#5BE39B' }}>ya tiene trabajo escrito</b>:{' '}
                      <b>{sobranConTrabajo.map(d => NOM[diaJs(d)]).join(', ')}</b> — ese no se toca.</>
                  )}
                </p>
                {(faltan.length > 0 || sobranVacios.length > 0) && (
                  <button onClick={ponerAlDia}
                    className="mt-2.5 rounded-lg px-3 py-2 text-[11.5px] font-black"
                    style={{ background: '#E0A33A', color: '#111827' }}>
                    PONER LOS DÍAS AL DÍA
                  </button>
                )}
              </div>
            );
          })()}

          {/* SOLO LOS DÍAS DE ENTRENO (dirección, 02/09/2026).
              Antes salían los tres días de entreno y debajo un renglón
              «▼ Ver la semana completa (4 días sin sesión)». El proyecto
              entrena tres veces por semana: los otros cuatro días no son
              asunto del formador y solo estorbaban. Ese renglón se quitó.

              El único caso en que se muestran todos es cuando el microciclo
              se quedó SIN NINGÚN día de entreno —calendario mal puesto—;
              ahí es mejor ver algo que ver una tarjeta vacía. */}
          {!cargando && detalle && (() => {
            const todos     = detalle.dias ?? [];
            const conSesion = todos.filter(d => d.tipo_dia !== 'descanso');
            const visibles  = conSesion.length ? conSesion : todos;

            return (
              <>
                {visibles.map(d => (
                  <DiaCard
                    key={d.id}
                    dia={d}
                    resumen={asist[d.fecha]}
                    marcar={aviso !== null}
                    orden={conSesion.indexOf(d) + 1}
                    cerrado={cerrado}
                  />
                ))}

                {/* Dar por terminado: se bloquea para todos */}
                {!cerrado && (
                  <button
                    onClick={cerrarMicrociclo}
                    disabled={cerrando}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                               text-sm font-bold text-white transition disabled:opacity-60"
                    style={{ background: VERDE }}
                  >
                    <Lock className="w-4 h-4" />
                    {cerrando ? 'Revisando…' : 'Dar por terminado el microciclo'}
                  </button>
                )}

                {/* EDITAR = REABRIR (dirección, 02/09/2026). Un microciclo
                    cerrado quedaba trancado para el formador: si se le fue un
                    error, no tenía cómo entrar a corregirlo. Ahora lo puede
                    reabrir él mismo. */}
                {cerrado && (esSuperAdmin() || esAdmin || esProfe) && (
                  <button
                    onClick={reabrirMicrociclo}
                    disabled={cerrando}
                    className="flex items-center gap-2 text-[11px] font-bold text-white px-2 py-1 hover:opacity-80"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Volver a abrir para edición
                  </button>
                )}

                {/* ELIMINAR — también el formador (dirección, 02/09/2026).
                    Antes solo la dirección, y solo si no estaba cerrado: un
                    microciclo creado por equivocación se quedaba ahí para
                    siempre. Sigue preguntando antes de borrar. */}
                {(esAdmin || esProfe) && (
                  <button
                    onClick={onBorrar}
                    className="flex items-center gap-2 text-[11px] font-bold text-[#FF7A7A] hover:text-[#F0B9B9] px-2 py-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar este microciclo
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── VISTA PRELIMINAR (solo lectura) ──────────────────────────────
// Es una hoja vertical: un día debajo del otro, con el mismo tamaño y el
// mismo orden que la pantalla editable, pero sin poder tocar nada.
function VistaPreliminar({
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

// ── Un día del microciclo ────────────────────────────────────────
function DiaCard({
  dia, resumen, marcar = false, orden = 0, cerrado = false,
}: {
  dia: MicrocicloDia; resumen?: ResumenAsistenciaDia;
  marcar?: boolean; orden?: number; cerrado?: boolean;
}) {
  const escenarioInicial = dia.escenario || '';
  const esDeLaLista = ESCENARIOS.includes(escenarioInicial.toUpperCase());

  const [escenario, setEscenario] = useState(
    escenarioInicial ? (esDeLaLista ? escenarioInicial.toUpperCase() : OTRO) : ''
  );
  const [escenarioOtro, setEscenarioOtro] = useState(esDeLaLista ? '' : escenarioInicial);
  const [horaIni, setHoraIni] = useState<Hora12>(() => de24(partirFranja(dia.hora)[0]) ?? { h: 8, m: '00', ap: 'AM' });
  const [horaFin, setHoraFin] = useState<Hora12>(() => de24(partirFranja(dia.hora)[1]) ?? { h: 9, m: '30', ap: 'AM' });
  /** Si el día venía sin horario, no se inventa: hay que marcarlo. */
  const [conHorario, setConHorario] = useState(Boolean(partirFranja(dia.hora)[0]));
  const [componentes, setComponentes]     = useState<string[]>(dia.componentes ?? []);
  const [carga, setCarga]                 = useState<string>(dia.carga);
  const [objetivo, setObjetivo]           = useState(dia.objetivo_dia);
  const [contenidos, setContenidos]       = useState(dia.contenidos);
  const [faseI, setFaseI]                 = useState(dia.fase_inicial);
  const [faseC, setFaseC]                 = useState(dia.fase_central);
  const [faseF, setFaseF]                 = useState(dia.fase_final);
  const [observaciones, setObservaciones] = useState(dia.observaciones);

  /** Se enciende al oprimir Guardar: de ahí en adelante lo que siga
   *  vacío se señala en rojo, hasta que el formador lo llene. */
  const [intento, setIntento]     = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk]               = useState(false);
  const [abierto, setAbierto]     = useState(false);

  const escenarioFinal = escenario === OTRO ? escenarioOtro.trim().toUpperCase() : escenario;
  const franja = conHorario ? `${a24(horaIni)}-${a24(horaFin)}` : '';

  /** ENTRENAMIENTO CANCELADO — dirección, 03/09/2026.
   *  El formador marcó CAN en el formato de asistencia: ese día no hubo
   *  entreno. Entonces el microciclo NO le pide nada — ni escenario, ni
   *  hora, ni fases —, no pinta nada de rojo y no traba el cierre de la
   *  semana. Las casillas siguen ahí por si quiere dejar una nota, pero
   *  ya no son obligatorias. */
  const cancelado = Boolean(resumen?.cancelado);

  /** Mientras esté el aviso de la vista preliminar, lo que falte va en rojo.
   *  Se apaga solo: apenas el formador llena la casilla, deja de estar roja. */
  const senalar   = !cerrado && !cancelado && (marcar || intento);
  const faltaEsc  = senalar && !escenarioFinal;
  const faltaHora = senalar && !franja;
  const faltaComp = senalar && componentes.length === 0;

  /** Lista de lo que sigue vacío, para el renglón rojo del pie. */
  const pendientes = !senalar ? [] : [
    !escenarioFinal        && 'Escenario',
    !franja                && 'Horario',
    componentes.length === 0 && 'Componentes',
    !objetivo.trim()       && 'Objetivo del día',
    !contenidos.trim()     && 'Objetivos específicos',
    !faseI.trim()          && 'Fase inicial',
    !faseC.trim()          && 'Fase central',
    !faseF.trim()          && 'Fase final',
  ].filter(Boolean) as string[];

  /** Marco rojo para una casilla vacía. */
  const marco = (falta: boolean) =>
    falta ? { borderColor: ROJO, boxShadow: `0 0 0 1px ${ROJO}` } : undefined;
  /** Etiqueta roja cuando la casilla de al lado está vacía. */
  const etq = (falta: boolean) => ({ color: falta ? ROJO : GRIS_TXT });

  function alternarComponente(v: string) {
    setComponentes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  async function guardar() {
    setIntento(true);
    setGuardando(true);
    const r = await guardarMicrocicloDia(dia.id, {
      escenario:     escenarioFinal,
      hora:          franja,
      componentes,
      carga:         carga as CargaDia,
      objetivo_dia:  objetivo,
      contenidos,
      fase_inicial:  faseI,
      fase_central:  faseC,
      fase_final:    faseF,
      observaciones,
    });
    setGuardando(false);
    if (r) { setOk(true); setTimeout(() => setOk(false), 1800); return; }

    const err = ultimoErrorMicrociclo();

    // Se guardó todo menos escenario / horario / componentes.
    if (err?.startsWith('SOLO_FALTAN_NUEVAS')) {
      alert(
        'Se guardó el objetivo, los objetivos específicos, las fases y las observaciones.\n\n'
        + 'NO se pudo guardar: ESCENARIO, HORARIO y COMPONENTES.\n'
        + 'A la base todavía le faltan esas tres columnas.\n\n'
        + 'Para habilitarlas: abre MICROCICLO-TABLAS.sql, cópialo completo y\n'
        + 'córrelo en el SQL Editor del proyecto  fykdyalpuydkwfjqguip.\n'
        + 'Al final te muestra si quedaron creadas.'
      );
      setOk(true); setTimeout(() => setOk(false), 1800);
      return;
    }

    alert(
      err?.startsWith('FALTAN_COLUMNAS')
        ? 'A la base le faltan las columnas ESCENARIO, HORARIO y COMPONENTES.\n\n'
          + 'QUÉ HACER:\n'
          + '  1. Abre el archivo MICROCICLO-TABLAS.sql (raíz del proyecto).\n'
          + '  2. Cópialo COMPLETO.\n'
          + '  3. Pégalo en el SQL Editor del proyecto  fykdyalpuydkwfjqguip\n'
          + '     — verifica el nombre del proyecto arriba a la izquierda —\n'
          + '  4. RUN. Al final te muestra una tabla: deben salir TRES filas\n'
          + '     (escenario, hora, componentes). Si no sale ninguna, estás en\n'
          + '     el proyecto equivocado.\n'
          + '  5. Vuelve aquí y oprime F5.\n\n'
          + '── detalle técnico ──\n' + String(err).split('|').slice(1).join('|')
        : `No se pudo guardar el día.\n\n${err}`
    );
  }

  // Los cuadros de objetivo, contenidos, fases y observaciones van en el
  // gris intermedio con letra blanca, para que se lean sobre la tarjeta.
  const inp = 'w-full rounded-xl px-3 py-2 text-sm text-white bg-[#2B3547] resize-none '
            + 'border border-[#4A5568] placeholder:text-[#8C94A0] '
            + 'focus:outline-none focus:ring-2 focus:ring-[#00B050]';

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>
      {/* Cabecera del día */}
      <button onClick={() => setAbierto(!abierto)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#46536A] transition">
        <div className="flex-shrink-0">
          <p className="flex items-baseline gap-2">
            {orden > 0 && <span className={TITULO_DIA} style={{ color: VERDE }}>DÍA {orden}</span>}
            <span className={cn(TITULO_DIA, 'text-white')}>{DIAS[dia.dia_semana - 1]}</span>
          </p>
          <p className="text-[11px] text-white mt-0.5">{fechaLarga(dia.fecha)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {cancelado && (
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide
                             px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: '#E0A33A', color: '#111827' }}
                  title="Este día se canceló en el formato de asistencia">
              <Ban className="w-3 h-3" /> Sin entrenamiento
            </span>
          )}
          {escenarioFinal && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#2B3547] px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" /> {escenarioFinal}
            </span>
          )}
          {franja && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#2B3547] px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" /> {textoFranja(franja)}
            </span>
          )}
          {COMPONENTES.filter(c => componentes.includes(c.v)).map(c => (
            <span key={c.v} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', c.activo)}>
              {c.t}
            </span>
          ))}
          {!cancelado && !escenarioFinal && !franja && componentes.length === 0 && (
            <span className="text-[11px] font-bold" style={{ color: marcar ? ROJO : GRIS_TXT }}>
              Sin escenario ni hora
            </span>
          )}
        </div>

        <MiniAsistencia resumen={resumen} />
        {abierto ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
      </button>

      {abierto && (
        <div className="border-t p-4 space-y-3" style={{ borderColor: BORDE, background: PANEL }}>

          {/* ENTRENAMIENTO CANCELADO — dirección, 03/09/2026 */}
          {cancelado && !cerrado && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                 style={{ background: 'rgba(224,163,58,.12)', border: '1px solid #E0A33A' }}>
              <Ban className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#E0A33A' }} />
              <div className="min-w-0">
                <p className="text-[12.5px] font-black" style={{ color: '#E0A33A' }}>
                  Este día no hubo entrenamiento
                </p>
                <p className="text-[11.5px] text-white mt-0.5 leading-snug">
                  Quedó <b>cancelado</b> en el formato de asistencia, así que
                  <b> no hay que llenar nada</b> de este día. No se pide escenario,
                  ni horario, ni fases, y la semana se puede dar por terminada así.
                  Si quiere dejar constancia de por qué se canceló, escríbalo en
                  <b> Observaciones</b>.
                </p>
              </div>
            </div>
          )}

          {/* ESCENARIO Y HORA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={cn(ETQ, 'block mb-1')} style={etq(faltaEsc)}>
                Escenario{faltaEsc ? ' · falta' : ''}
              </label>
              <select className={inp} style={marco(faltaEsc)} disabled={cerrado}
                      value={escenario} onChange={e => setEscenario(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {ESCENARIOS.map(e => <option key={e} value={e}>{e}</option>)}
                <option value={OTRO}>Otro…</option>
              </select>
              {escenario === OTRO && (
                <input
                  className={cn(inp, 'mt-2')}
                  value={escenarioOtro}
                  onChange={e => setEscenarioOtro(e.target.value)}
                  placeholder="Escribe el nombre del escenario"
                  readOnly={cerrado}
                />
              )}
            </div>

            <div>
              <label className={cn(ETQ, 'flex items-center gap-2 mb-1')} style={etq(faltaHora)}>
                Horario{faltaHora ? ' · falta' : ''}
                {!conHorario && !cerrado && (
                  <button
                    type="button"
                    onClick={() => setConHorario(true)}
                    className="text-[10px] font-bold normal-case tracking-normal hover:opacity-80"
                    style={{ color: VERDE }}
                  >
                    + poner horario
                  </button>
                )}
              </label>

              {conHorario ? (
                <div className="space-y-2">
                  <SelectorHora etiqueta="Inicio"  valor={horaIni} onChange={setHoraIni} bloqueado={cerrado} />
                  <SelectorHora etiqueta="Termina" valor={horaFin} onChange={setHoraFin} bloqueado={cerrado} />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-3 py-2 text-sm"
                     style={{
                       borderColor: faltaHora ? ROJO : BORDE,
                       background:  CAMPO,
                       color:       faltaHora ? ROJO : '#fff',
                     }}>
                  Sin horario definido
                </div>
              )}
            </div>
          </div>

          {/* COMPONENTE A DESARROLLAR */}
          <div>
            <label className={cn(ETQ, 'block mb-1.5')} style={etq(faltaComp)}>
              Componente a desarrollar{faltaComp ? ' · falta' : ''}
              <span className="ml-2 text-[10px] font-semibold normal-case tracking-normal text-white">
                puedes marcar varios
              </span>
            </label>
            <div className="flex flex-wrap gap-2 rounded-xl"
                 style={faltaComp ? { boxShadow: `0 0 0 1px ${ROJO}`, padding: 6 } : undefined}>
              {COMPONENTES.map(c => {
                const activo = componentes.includes(c.v);
                return (
                  <button
                    key={c.v}
                    type="button"
                    onClick={() => { if (!cerrado) alternarComponente(c.v); }}
                    disabled={cerrado}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[12px] font-bold border transition',
                      cerrado && 'cursor-default',
                      activo ? c.activo : 'bg-[#2B3547] text-white border-[#4A5568] hover:border-[#00B050]'
                    )}
                  >
                    {activo ? '✓ ' : ''}{c.t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CARGA */}
          <div className="sm:max-w-[220px]">
            <label className={cn(ETQ, 'block mb-1')}>Carga</label>
            <select className={inp} value={carga} disabled={cerrado}
                    onChange={e => setCarga(e.target.value)}>
              {CARGAS.map(c => <option key={c.v} value={c.v}>{c.t}</option>)}
            </select>
          </div>

          <Bloque titulo="Objetivo del día" filas={2} valor={objetivo}      onChange={setObjetivo}      marcar={senalar} bloqueado={cerrado} />
          <Bloque titulo="Objetivos específicos" filas={3} valor={contenidos}    onChange={setContenidos}    marcar={senalar} bloqueado={cerrado} />

          <Bloque titulo="Fase inicial"     filas={3} valor={faseI}         onChange={setFaseI}         marcar={senalar} bloqueado={cerrado} pizarra />
          <Bloque titulo="Fase central"     filas={3} valor={faseC}         onChange={setFaseC}         marcar={senalar} bloqueado={cerrado} pizarra />
          <Bloque titulo="Fase final"       filas={3} valor={faseF}         onChange={setFaseF}         marcar={senalar} bloqueado={cerrado} pizarra />

          <Bloque titulo="Observaciones"    filas={2} valor={observaciones} onChange={setObservaciones} bloqueado={cerrado} />

          <PanelAsistencia resumen={resumen} />

          {/* Barra de guardado: queda pegada abajo mientras el día está abierto,
              para no tener que bajar hasta el final para guardar. */}
          {!cerrado && (
          <div className="sticky bottom-0 -mx-4 -mb-4 px-4 py-3 backdrop-blur border-t"
               style={{ background: 'rgba(60,71,89,.95)', borderColor: BORDE }}>
            <button
              onClick={guardar}
              disabled={guardando}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition',
                ok ? 'bg-[#00B050]' : guardando ? 'bg-[#4A5568]' : 'bg-[#00B050] hover:bg-[#00913F]'
              )}
            >
              <Save className="w-4 h-4" />
              {ok ? '✓ Guardado' : guardando ? 'Guardando…' : `Guardar ${DIAS[dia.dia_semana - 1].toLowerCase()}`}
            </button>

            {/* Qué quedó sin llenar. Se guarda igual: es solo un recordatorio,
                pero la vista preliminar no abre mientras falte algo. */}
            {pendientes.length > 0 && (
              <p className="text-[11px] font-bold mt-2 leading-snug" style={{ color: ROJO }}>
                Falta por completar: {pendientes.join(' · ')}
              </p>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bloque de escritura: franja verde arriba, cuadro gris debajo ─
// Objetivo, contenidos, las tres fases y observaciones se ven todos
// iguales: encabezado verde con letra blanca, igual que Guardar.
function Bloque({
  titulo, valor, onChange, filas = 3, pizarra = false, marcar = false, bloqueado = false,
}: {
  titulo: string; valor: string; onChange: (v: string) => void;
  filas?: number; pizarra?: boolean; marcar?: boolean; bloqueado?: boolean;
}) {
  /** Si está el aviso de la vista preliminar y la casilla sigue vacía,
   *  la franja se pone roja hasta que el formador escriba algo. */
  const falta = marcar && !valor.trim();
  // El cuadro crece solo: cada vez que cambia el texto se mide cuánto
  // ocupa de verdad y se estira, para no tener que usar barra interna.
  const caja = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: falta ? ROJO : BORDE }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: VERDE }}>
        <span className={FRANJA}>{titulo}</span>

        {/* Aviso de que esta casilla quedó vacía al intentar guardar */}
        {falta && (
          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: '#fff', color: ROJO }}>
            falta por llenar
          </span>
        )}

        {pizarra && (
          <span className="text-[9px] font-semibold text-white flex items-center gap-1 ml-auto">
            <PencilRuler className="w-3 h-3" /> pizarra próximamente
          </span>
        )}
      </div>
      <textarea
        ref={caja}
        rows={filas}
        value={valor}
        onChange={e => onChange(e.target.value)}
        readOnly={bloqueado}
        className="w-full px-3 py-2 text-sm text-white focus:outline-none resize-none overflow-hidden block"
        style={{ background: CAMPO, minHeight: filas * 20 + 16 }}
      />
    </div>
  );
}

// ── Indicador compacto de asistencia ─────────────────────────────
function MiniAsistencia({ resumen }: { resumen?: ResumenAsistenciaDia }) {
  if (!resumen || resumen.cancelado || resumen.convocados === 0) {
    return <span className="text-[10px] text-white font-semibold flex-shrink-0 w-14 text-right">—</span>;
  }
  const p = resumen.porcentaje;
  const color = p >= 85 ? 'text-[#00B050]' : p >= 70 ? 'text-[#E0A33A]' : 'text-[#FF7A7A]';
  return <span className={cn('text-[11px] font-black flex-shrink-0 w-14 text-right', color)}>{p}%</span>;
}

// ── Panel de asistencia: % , asistentes y faltantes con motivo ───
function PanelAsistencia({ resumen }: { resumen?: ResumenAsistenciaDia }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: CAMPO, borderColor: BORDE }}>
      <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: HONDO }}>
        <Users className="w-3.5 h-3.5 text-white/80" />
        <span className="text-[11px] font-black uppercase tracking-wider text-white">Asistencia del día</span>
        <span className="ml-auto text-[9px] font-semibold text-white/50">viene del formato de asistencia</span>
      </div>

      {!resumen || resumen.convocados === 0 ? (
        <p className="px-3 py-4 text-[12px] text-white flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          {resumen?.cancelado
            ? 'Sesión cancelada en el formato de asistencia.'
            : 'El formador todavía no ha registrado la asistencia de este día.'}
        </p>
      ) : (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Cifra valor={`${resumen.porcentaje}%`} etiqueta="Asistencia" destacado />
            <Cifra valor={String(resumen.asistentes)} etiqueta="Asistentes" />
            <Cifra valor={String(resumen.faltantes)} etiqueta="Faltantes" />
          </div>

          {resumen.lista.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-white mb-1.5">
                Faltantes y motivo
              </p>
              <div className="space-y-1">
                {resumen.lista.map(f => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border"
                       style={{ background: PANEL, borderColor: BORDE }}>
                    {f.codigo && <span className="text-[10px] font-mono text-white flex-shrink-0">{f.codigo}</span>}
                    <span className="text-[12px] font-semibold text-white truncate flex-1">{f.nombre}</span>
                    <span className="text-[10px] font-bold text-white bg-[#2B3547] px-2 py-0.5 rounded-full flex-shrink-0">
                      {f.motivo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Selector de una hora: 1-12 · 00/15/30/45 · AM/PM ─────────────
function SelectorHora({
  etiqueta, valor, onChange, bloqueado = false,
}: { etiqueta: string; valor: Hora12; onChange: (v: Hora12) => void; bloqueado?: boolean }) {
  const sel = 'rounded-xl px-2 py-2 text-sm text-white bg-[#2B3547] border border-[#4A5568] '
            + 'focus:outline-none focus:ring-2 focus:ring-[#00B050]';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-white w-14 flex-shrink-0">{etiqueta}</span>
      <select
        className={sel}
        disabled={bloqueado}
        value={valor.h}
        onChange={e => onChange({ ...valor, h: Number(e.target.value) })}
      >
        {HORAS_12.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="font-black text-white">:</span>
      <select
        className={sel}
        disabled={bloqueado}
        value={valor.m}
        onChange={e => onChange({ ...valor, m: e.target.value })}
      >
        {MINUTOS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        className={sel}
        disabled={bloqueado}
        value={valor.ap}
        onChange={e => onChange({ ...valor, ap: e.target.value as 'AM' | 'PM' })}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

function Cifra({ valor, etiqueta, destacado = false }: { valor: string; etiqueta: string; destacado?: boolean }) {
  return (
    <div className="rounded-xl px-2 py-2 text-center border"
         style={{ background: destacado ? 'rgba(0,176,80,.16)' : PANEL, borderColor: destacado ? VERDE : BORDE }}>
      <p className="font-black leading-none text-lg" style={{ color: destacado ? VERDE : '#fff' }}>{valor}</p>
      <p className="text-[9px] font-bold uppercase tracking-wider text-white mt-1">{etiqueta}</p>
    </div>
  );
}
