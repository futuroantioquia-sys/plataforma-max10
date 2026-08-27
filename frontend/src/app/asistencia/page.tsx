'use client';
export const dynamic = 'force-dynamic';

import React, { Suspense, useState, useMemo, useEffect, useCallback, memo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Users, FileDown, Save, CheckCircle2, ChevronDown, ChevronUp, Home, LogOut, Search, X } from 'lucide-react';
import { getDeportistas, getDeportistasPorProyecto, getAsistencia, getAsistenciaPorProyecto, getAsistenciaDeportistas, saveAsistenciaProyecto, saveAsistenciaLocal, deleteAsistenciaFecha, getCalificaciones, saveCalificacion, getValoracionesAnio, getJornadaMes, saveJornadaMes, getProfes, getResumenGestion, getEvaluacionesResumen } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_INICIAL = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM'];
const JS_DIA_A_ISO = (d: number) => d === 0 ? 7 : d;
const DIAS_ORDEN_JS = [1, 2, 3, 4, 5, 6, 0];

const PROYECTOS_META_KEY = 'futuro_proyectos_meta';
const CAL_OPTIONS = ['', ...Array.from({ length: 46 }, (_, i) => ((i + 5) / 10).toFixed(1))];

// ── Vista CONSOLIDADO: asistencias mes a mes (FEB…DIC) ──────────
// Se activa con Mes = "CONSOLIDADO" (o con Proyecto = TODOS).
const TODOS = '__TODOS__';   // valor especial del desplegable PROYECTO
const TODO_ANIO = -1;        // valor especial del desplegable MES
const MESES_ABR = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
// Meses que se muestran en el resumen: FEB … DIC (índices 0-based)
const MESES_RESUMEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

type Estado = 'A' | 'F' | 'S' | 'ES' | 'FA' | 'NQ' | 'C' | 'CAN' | 'SE' | '';
type AsistenciaData = Record<string, Record<string, Record<string, Record<string, Estado>>>>;

const ESTADO_ORDEN: Estado[] = ['', 'A', 'F', 'S', 'ES', 'FA', 'NQ', 'C', 'SE'];
const ESTADO_NEXT: Record<Estado, Estado> = Object.fromEntries(
  ESTADO_ORDEN.map((e, i) => [e, ESTADO_ORDEN[(i + 1) % ESTADO_ORDEN.length]])
) as Record<Estado, Estado>;

const ESTADO_LABEL: Record<string, string> = {
  'A': 'Asistió', 'F': 'Faltó', 'S': 'Salud', 'ES': 'Estudio',
  'FA': 'Familia', 'NQ': 'No quizo', 'C': 'Compite',
  'CAN': 'Cancelado', 'SE': 'Sin Empezar', '': '',
};
/* ── COLOR DE CADA ESTADO (arte del 22/08/2026) ─────────────────────────────
   Se pasó de nueve colores distintos a una lectura de un vistazo:
     VERDE  → asistió
     ROJO   → no vino, sea cual sea el motivo (faltó, salud, estudio, familia,
              no quiso, compite). El motivo sigue escrito dentro de la pastilla.
     GRIS   → el entrenamiento no ocurrió o el deportista aún no empezaba, así
              que no es una falta de nadie: cancelado, sin empezar, sin marcar.
   Los tonos son los mismos del consolidado. */
const ESTADO_COLOR: Record<string, { fondo: string; texto: string }> = {
  'A':   { fondo: '#00B050', texto: '#ffffff' },
  'F':   { fondo: '#C0504D', texto: '#ffffff' },
  'S':   { fondo: '#C0504D', texto: '#ffffff' },
  'ES':  { fondo: '#C0504D', texto: '#ffffff' },
  'FA':  { fondo: '#C0504D', texto: '#ffffff' },
  'NQ':  { fondo: '#C0504D', texto: '#ffffff' },
  'C':   { fondo: '#C0504D', texto: '#ffffff' },
  'CAN': { fondo: '#717985', texto: '#ffffff' },
  'SE':  { fondo: '#717985', texto: 'rgba(255,255,255,.75)' },
  '':    { fondo: '#717985', texto: 'rgba(255,255,255,.35)' },
};

// Colores tabla
const G    = '#16a34a';
const OK_BG   = '#16a34a';   // verde: ya lo subió / ya lo hizo
const NO_BG   = '#fdbdbd';   // rojo suave: pendiente
const SEP_BG  = '#111827';   // franja negra que separa Documentos de Informes
const AZUL = '#4b5563';
const ROW1 = '#f1f5f9';
const BW   = '2px solid white';

// ── PALETA DEL CONSOLIDADO ───────────────────────────────────────────────────
//  Tomada directamente del arte aprobado (22/08/2026). Son colores de la paleta
//  de Office, por eso combinan con los informes y presentaciones del club.
const LIENZO     = '#333F50';   // fondo del cuadro entero
const VERDE      = '#00B050';   // encabezados y todo lo que ya está listo
const GRIS_DATO  = '#B1B6BC';   // pastilla de un mes CON asistencias
const GRIS_VACIO = '#717985';   // mes sin datos / documento pendiente
const AZUL_PCT   = '#44546A';   // pastilla del porcentaje
const PANEL      = '#3C4759';   // tarjetas y paneles sobre el lienzo
const CAMPO      = '#2B3547';   // desplegables y campos de texto
const BORDE      = '#4A5568';   // borde suave de paneles y campos
const ROJO_CERO  = '#C0504D';   // mes ya pasado que quedó en cero

/** Pastilla redondeada: la pieza con la que está armada toda la tabla. */
function pastilla(fondo: string, color = '#ffffff', extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: fondo, color, borderRadius: 6, minHeight: 22,
    padding: '2px 7px', fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1.15,
    ...extra,
  };
}
/** Celda base: el fondo es el lienzo y el espacio entre pastillas lo da el padding. */
const celda: React.CSSProperties = { background: LIENZO, padding: '2px 3px', border: 'none' };
/** Separador vertical continuo entre grupos de columnas. */
const separador: React.CSSProperties = {
  border: 'none', padding: 0, width: 13, minWidth: 13,
  background: `linear-gradient(to right, ${LIENZO} 0 6px, #FFFFFF 6px 8px, ${LIENZO} 8px 100%)`,
};

// ── COLUMNAS CONGELADAS ────────────────────────────────────────
// CÓDIGO y NOMBRE quedan siempre quietos a la izquierda y el resto de la
// tabla se corre por debajo. Es lo que necesita el formador en la cancha:
// deslizar con el pulgar sin perder de vista a quién le está marcando.
// En celular se angostan para dejar aire a los días.
const ANCHO_COD = { movil: 42, ancho: 58 };
const ANCHO_NOM = { movil: 116, ancho: 190 };

function styleCod(bg: string, zIndex: number, movil: boolean) {
  const w = movil ? ANCHO_COD.movil : ANCHO_COD.ancho;
  return {
    background: bg, border: 'none', padding: movil ? '2px 1px' : '2px 3px',
    position: 'sticky' as const, left: 0, zIndex,
    width: w, minWidth: w, maxWidth: w,
  };
}

function styleNom(bg: string, zIndex: number, movil: boolean) {
  const w = movil ? ANCHO_NOM.movil : ANCHO_NOM.ancho;
  return {
    background: bg, border: 'none', padding: movil ? '2px 2px' : '2px 3px',
    position: 'sticky' as const, left: movil ? ANCHO_COD.movil : ANCHO_COD.ancho, zIndex,
    width: w, minWidth: w, maxWidth: w,
    /* En celular el nombre largo se corta con puntos suspensivos en vez de
       empujar la tabla. */
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    fontSize: movil ? 10.5 : undefined,
    /* Raya blanca que marca dónde termina lo congelado. */
    boxShadow: '2px 0 0 0 #FFFFFF',
  };
}

function getCol(dep: Deportista, rx: RegExp) {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(k => rx.test(k));
  return k ? cols[k] : '';
}
function proyectoDe(dep: Deportista) {
  return getCol(dep, /^proy/i) || '__SIN_PROYECTO__';
}
/**
 * Fecha de afiliación del deportista.
 * La columna llega en dos formatos: serial de Excel (46047.16) o "d/m/aaaa".
 */
function fechaAfiliacionDe(dep: Deportista): Date | null {
  const raw = String(getCol(dep, /^fecha\s*de\s*afili/i) || '').trim();
  if (!raw) return null;

  // Serial de Excel (días desde el 30/12/1899)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = parseFloat(raw);
    if (!isFinite(n) || n < 1000) return null;       // 0 / basura
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  // d/m/aaaa
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // aaaa-mm-dd
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function fechaAfiliacionTexto(dep: Deportista): string {
  const f = fechaAfiliacionDe(dep);
  if (!f) return '—';
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${f.getFullYear()}`;
}
function estadoDe(dep: Deportista) {
  const v = (getCol(dep, /^estado$/i) || '').trim();
  return v || 'Activo';
}
// Un deportista está retirado si su columna ESTADO contiene "retirado".
function esRetirado(dep: Deportista) {
  return /retirad/i.test(getCol(dep, /^estado/i) || '');
}
function semanaNum(fecha: Date) {
  const iso = fecha.getDay() === 0 ? 7 : fecha.getDay();
  const lun = new Date(fecha);
  lun.setDate(fecha.getDate() - (iso - 1));
  lun.setHours(0, 0, 0, 0);
  return lun.getTime();
}

/** MICROCICLO CORRIDO DEL AÑO.
 *  El microciclo 1 es la primera semana de FEBRERO (el primer lunes del mes);
 *  de ahí en adelante se cuenta seguido, sin reiniciar cada mes. Por eso en
 *  agosto ya va por los treinta y pico, no por el 1. — 23/08/2026
 *  Recibe el lunes de la semana (el mismo valor que devuelve semanaNum). */
function microcicloDe(lunesMs: number): number {
  const lunes = new Date(lunesMs);
  const feb = new Date(lunes.getFullYear(), 1, 1);       // 1 de febrero
  const isoFeb = feb.getDay() === 0 ? 7 : feb.getDay();
  const primerLunesFeb = new Date(feb);
  if (isoFeb !== 1) primerLunesFeb.setDate(feb.getDate() + (8 - isoFeb));
  primerLunesFeb.setHours(0, 0, 0, 0);
  const SEMANA = 7 * 24 * 60 * 60 * 1000;
  return Math.round((lunes.getTime() - primerLunesFeb.getTime()) / SEMANA) + 1;
}

// ── Celda memoizada — evita re-render de todo el tbody ──────────
const CeldaEstado = memo(function CeldaEstado({
  estado, onClick, readOnly = false,
}: { estado: Estado; onClick: () => void; readOnly?: boolean }) {
  return (
    <td style={celda} className="text-center">
      {readOnly ? (
        <div
          title={ESTADO_LABEL[estado] || 'Sin registro'}
          style={{ ...pastilla(ESTADO_COLOR[estado].fondo, ESTADO_COLOR[estado].texto, { fontSize: 8, padding: '2px 2px' }), minHeight: 26, width: '100%' }}>
          {ESTADO_LABEL[estado]}
        </div>
      ) : (
        <button
          onClick={onClick}
          title={ESTADO_LABEL[estado] || 'Sin registro'}
          style={{ ...pastilla(ESTADO_COLOR[estado].fondo, ESTADO_COLOR[estado].texto, { fontSize: 8, padding: '2px 2px' }), minHeight: 26, width: '100%' }}
          className="transition active:scale-90">
          {ESTADO_LABEL[estado]}
        </button>
      )}
    </td>
  );
});

// ── Error Boundary — atrapa crashes de render y los muestra en la UI ──
class AsistenciaErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AsistenciaErrorBoundary] render crash:', error.message, '\n', error.stack, '\n', info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: LIENZO }}>
          <div className="bg-[#3C4759] rounded-2xl shadow-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-black text-[#F08A87] mb-3">⚠️ Error en Asistencia</h2>
            <pre className="bg-[#2B3547] rounded-lg p-3 text-xs overflow-auto mb-4 whitespace-pre-wrap break-all" style={{ maxHeight: 240 }}>
              {this.state.error.message}{'\n\n'}{this.state.error.stack}
            </pre>
            <p className="text-xs text-white/70 mb-4">Toma captura de pantalla y envíala al desarrollador.</p>
            <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="w-full bg-green-600 text-white font-black py-3 rounded-xl text-base">
              🔄 Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AsistenciaInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [deportistas,  setDeportistas]  = useState<Deportista[]>([]);
  const [asistencia,   setAsistencia]   = useState<AsistenciaData>({});
  const [programa,     setPrograma]     = useState('');
  const [proyecto,     setProyecto]     = useState('');
  const [mostrarRetirados, setMostrarRetirados] = useState(false); // modo "solo retirados"
  const [mes,          setMes]          = useState(0);
  const [anio,         setAnio]         = useState(2026);
  const [diasSel,      setDiasSel]      = useState<number[]>([]);
  const [overridesMes, setOverridesMes] = useState<Record<string, number[]>>({}); // días ajustados por mes
  const [cargando,     setCargando]     = useState(false); // cambia a false por defecto — profe no carga todo
  const [cargandoProy, setCargandoProy] = useState(false); // carga del proyecto específico
  const [guardando,    setGuardando]    = useState(false);
  const [guardado,     setGuardado]     = useState(false);
  const [hayCambios,   setHayCambios]   = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(false);
  const [controlesAbiertos, setControlesAbiertos] = useState(true);
  const [calMap,           setCalMap]           = useState<Record<string, string>>({});
  const [scrolledX,        setScrolledX]        = useState(false); // (se conserva por compatibilidad)
  /** true en pantallas de celular: las columnas fijas se angostan. */
  const [movil,            setMovil]            = useState(false);
  const [errorMsg,         setErrorMsg]         = useState<string | null>(null);

  // Botones laterales flotantes — se ocultan cuando llegan los inline del fondo

  useEffect(() => {
    const medir = () => setMovil(window.innerWidth < 640);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const mesKey = `${anio}_${String(mes + 1).padStart(2, '0')}`;

  /* ── RENDIMIENTO (25/08/2026) ──────────────────────────────────────────────
     La asistencia se pedía COMPLETA: todos los deportistas, todos los meses de
     todos los años. Son decenas de miles de filas que el servidor entrega de a
     mil, o sea decenas de viajes seguidos antes de poder pintar nada. Eso era
     lo que hacía lento este módulo.

     Ahora se piden solo los 12 meses del AÑO que se está viendo. Cambiar de mes
     no pide nada (ya está en memoria); cambiar de año sí recarga. */
  const mesesDeAnio = (a: number) =>
    Array.from({ length: 12 }, (_, i) => `${a}_${String(i + 1).padStart(2, '0')}`);
  // Promedio de valoraciones del año, para la columna VAL del consolidado
  const [valAnio, setValAnio] = useState<Record<string, string>>({});

  // Vista consolidado mes a mes
  const esTodosProy = proyecto === TODOS;              // todos los proyectos del programa
  const esResumen   = esTodosProy || (mes === TODO_ANIO && !!proyecto);
  const [busquedaTodos, setBusquedaTodos] = useState('');
  const [generandoPDF,  setGenerandoPDF]  = useState(false);

  // Buscador global: encontrar UN deportista sin saber su programa ni su proyecto
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [qCodigo,         setQCodigo]         = useState('');
  const [qNombre,         setQNombre]         = useState('');

  // Gestión del profe: foto / documento / EPS / informes (solo se carga en el consolidado)
  const [gestion, setGestion] = useState<{ conFoto: Set<string>; conDoc: Set<string>; conEps: Set<string>; conCal: Set<string> } | null>(null);
  const [informes, setInformes] = useState<Set<string> | null>(null);   // claves "CODIGO|1" y "CODIGO|2"

  // ── Valores iniciales iguales al SSR — se actualizan en el useEffect de rol+carga ──
  const [esProfe,        setEsProfe]        = useState(false);
  const [proyectosProfe, setProyectosProfe] = useState<string[]>([]);
  const [nombreProfe,    setNombreProfe]    = useState('Profe');
  // Nombre del formador (nombre completo) por proyecto — para el subtítulo del grupo
  const [formadorPorProy, setFormadorPorProy] = useState<Record<string, string>>({});
  useEffect(() => {
    getProfes().then(lista => {
      const m: Record<string, string> = {};
      (lista || []).forEach((p: any) => (p.proyectos || []).forEach((pr: string) => {
        const k = String(pr).trim().toUpperCase();
        if (k && !m[k]) m[k] = (p.nombre && p.nombre.trim()) ? p.nombre.trim() : (p.usuario || '');
      }));
      setFormadorPorProy(m);
    }).catch(() => {});
  }, []);

  const [fotoProfe, setFotoProfe] = useState('');
  useEffect(() => {
    try {
      if (nombreProfe && typeof nombreProfe === 'string' && nombreProfe !== 'Profe') {
        const f1 = localStorage.getItem(`futuro-foto-profe-${nombreProfe.toUpperCase()}`);
        if (f1) { setFotoProfe(f1); return; }
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('futuro-foto-profe-')) {
          const f2 = localStorage.getItem(k);
          if (f2) { setFotoProfe(f2); return; }
        }
      }
      const f3 = localStorage.getItem('futuro-profe-foto');
      if (f3) setFotoProfe(f3);
    } catch { /* localStorage no disponible o nombreProfe inválido */ }
  }, [nombreProfe]);

  // ── Atrapa cualquier Promise no capturada y la muestra en la UI ──
  // Esto evita que Next.js muestre "Application error" y en cambio muestra el error real
  useEffect(() => {
    function onUnhandledRejection(ev: PromiseRejectionEvent) {
      const reason = ev.reason;
      const msg = reason?.message
        ? `${reason.message}\n\n${reason.stack ?? ''}`
        : String(reason ?? 'Error desconocido en promesa');
      console.error('[asistencia] unhandledrejection:', reason);
      setErrorMsg(msg);
      ev.preventDefault(); // previene la pantalla de error de Next.js
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  // ── Detecta rol + carga datos en un único effect (evita stale closure de esProfe) ──
  useEffect(() => {
    // 0. Inicializar fecha y searchParams del lado del cliente (evita hydration mismatch)
    const now = new Date();
    setMes(now.getMonth());
    setAnio(now.getFullYear());
    const prgParam = searchParams.get('programa') ?? '';
    const proyParam = searchParams.get('proyecto') ?? '';
    if (prgParam) setPrograma(prgParam);
    if (proyParam) setProyecto(proyParam);

    // 1. Detectar rol desde cookies/localStorage
    const cookies = document.cookie.split(';').map(c => c.trim());
    const isAdmin = cookies.some(c => c === 'futuro-session=1');
    let isProfe = !isAdmin && cookies.some(c => c === 'futuro-session=profesor');
    if (!isProfe && !isAdmin) {
      try {
        const g = localStorage.getItem('futuro-profe-proyectos');
        const n = localStorage.getItem('futuro-profe-nombre');
        if (g && n) isProfe = true;
      } catch {}
    }

    // 2. Sincronizar estado de UI con el rol real
    setEsProfe(isProfe);
    try {
      const rg = localStorage.getItem('futuro-profe-proyectos');
      if (rg) {
        const parsed = JSON.parse(rg);
        if (Array.isArray(parsed)) setProyectosProfe(parsed);
      }
      const rn = localStorage.getItem('futuro-profe-nombre');
      if (rn) {
        const parsed = JSON.parse(rn);
        setNombreProfe(typeof parsed === 'string' ? parsed : String(parsed));
      }
    } catch {}

    // 3. Carga de datos usando isProfe local (sin stale closure)
    if (isProfe) {
      // Profe: carga proyecto asignado → luego asistencia por IDs (sigue al deportista aunque cambie de proyecto)
      const proyUrl = searchParams.get('proyecto');
      if (proyUrl) {
        setCargandoProy(true);
        getDeportistasPorProyecto(proyUrl)
          .then(({ data: deps }) => {
            if (deps.length) setDeportistas(deps);
            const ids = deps.map(d => d.id);
            // Cargar asistencia por deportista_id para que los traslados de proyecto no pierdan historial
            return ids.length
              ? getAsistenciaDeportistas(ids, mesesDeAnio(now.getFullYear()))
              : getAsistenciaPorProyecto(proyUrl); // fallback si no hay IDs aún
          })
          .then(asistData => {
            setCargandoProy(false);
            if (Object.keys(asistData).length) setAsistencia(asistData as any);
          })
          .catch(err => {
            console.error('[asistencia] carga profe:', err);
            setCargandoProy(false);
          });
      } else {
        // Sin proyecto en URL → redirigir a mis-proyectos
        router.replace('/mis-proyectos');
      }
    } else {
      /* ── RENDIMIENTO (25/08/2026) ─────────────────────────────────────────
         Antes el administrador esperaba DOS cosas antes de ver nada:
           1) las 1.163 fichas completas, y
           2) la asistencia de TODA la academia.
         Y con `Promise.all` la pantalla no pintaba hasta que llegaran las dos.

         La asistencia de toda la academia son más de cien mil filas al año, y
         además NO se necesita para pintar la pantalla inicial: el administrador
         primero escoge programa y proyecto. Se trae después, ya acotada al
         proyecto que abra (lo hace el efecto de más abajo).

         Aquí queda solo la lista de deportistas, y sin esperar a nada más. */
      setCargando(true);
      getDeportistas()
        .then(lista => {
          setCargando(false);
          if (lista.length) setDeportistas(lista);
        })
        .catch(err => {
          console.error('[asistencia] carga admin:', err);
          setCargando(false);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Cuando se cambia de proyecto manualmente → carga los atletas del nuevo.
     Antes se comparaba contra el proyecto de la dirección web, así que si el
     formador se iba a otro proyecto y VOLVÍA al primero, la pantalla no
     recargaba y quedaba mostrando la lista del otro. Ahora se recuerda cuál
     fue el último que se cargó de verdad. — 25/08/2026 */
  const proyectoCargado = useRef<string | null>(null);
  useEffect(() => {
    if (!proyecto) return;
    /* TODOS (resumen anual del programa) también necesita su asistencia. Antes
       la sacaba de la carga inicial, que traía toda la academia; ahora se pide
       aquí, acotada al programa. — 25/08/2026 */
    const clave = proyecto === TODOS ? `${TODOS}|${programa}` : proyecto;
    if (proyectoCargado.current === null && proyecto === searchParams.get('proyecto')) {
      proyectoCargado.current = clave;   // el de la dirección ya lo cargó el arranque
      return;
    }
    if (proyectoCargado.current === clave) return;
    proyectoCargado.current = clave;
    if (proyecto === TODOS) {
      const idsPrograma = deportistas
        .filter(d => !programa || getCol(d, /^program/i) === programa)
        .map(d => d.id).filter(Boolean);
      if (!idsPrograma.length) return;
      getAsistenciaDeportistas(idsPrograma, mesesDeAnio(anio))
        .then(asistData => {
          if (Object.keys(asistData).length) {
            setAsistencia(prev => {
              const out: any = { ...prev };
              for (const [proy, meses] of Object.entries(asistData as any)) {
                out[proy] = { ...(out[proy] || {}), ...(meses as any) };
              }
              return out;
            });
          }
        })
        .catch(err => console.error('[asistencia] TODOS:', err));
      return;
    }
    if (esProfe) {
      // Profe cambia de proyecto → recargar deportistas + asistencia por IDs
      setCargandoProy(true);
      setDeportistas([]);
      getDeportistasPorProyecto(proyecto)
        .then(({ data: deps }) => {
          if (deps.length) setDeportistas(deps);
          const ids = deps.map(d => d.id);
          return ids.length ? getAsistenciaDeportistas(ids, mesesDeAnio(anio)) : getAsistenciaPorProyecto(proyecto);
        })
        .then(asistData => {
          setCargandoProy(false);
          if (Object.keys(asistData).length) setAsistencia(asistData as any);
      }).catch(err => {
        console.error('[asistencia] cambio proyecto profe:', err);
        setCargandoProy(false);
      });
    } else {
      // Admin cambia de proyecto → cargar asistencia por deportista_id
      // Así los deportistas trasladados de proyecto no pierden su historial
      const idsEnProy = deportistas.filter(d => proyectoDe(d) === proyecto).map(d => d.id);
      const loader = idsEnProy.length
        ? getAsistenciaDeportistas(idsEnProy, mesesDeAnio(anio))
        : getAsistenciaPorProyecto(proyecto); // fallback si aún no hay deportistas cargados
      loader.then(asistData => {
        if (Object.keys(asistData).length) {
          setAsistencia(prev => ({ ...prev, ...(asistData as any) }));
        }
      }).catch(err => {
        console.error('[asistencia] refresh admin proyecto:', err);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto, programa, esProfe, deportistas.length]);

  /* ── AL CAMBIAR DE AÑO, TRAER ESE AÑO ─────────────────────────────────────
     Como la asistencia ya no se baja completa sino por año, cuando el usuario
     cambia el año hay que ir por ese. Se hace UNA vez por año y se mezcla con
     lo que ya está en memoria, así devolverse al año anterior es inmediato.
     — 25/08/2026 */
  const aniosCargados = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!anio || aniosCargados.current.has(anio)) return;
    // El año con el que arrancó la pantalla ya lo trajo la carga inicial.
    if (aniosCargados.current.size === 0) { aniosCargados.current.add(anio); return; }
    aniosCargados.current.add(anio);

    const ids = deportistas.map(d => d.id).filter(Boolean);
    const traer = ids.length
      ? getAsistenciaDeportistas(ids, mesesDeAnio(anio))
      : getAsistencia(mesesDeAnio(anio));

    traer.then(asistData => {
      if (!asistData || !Object.keys(asistData).length) return;
      // Mezcla por proyecto y por mes: no se pisa lo que ya estaba de otros años.
      setAsistencia(prev => {
        const out: any = { ...prev };
        for (const [proy, meses] of Object.entries(asistData as any)) {
          out[proy] = { ...(out[proy] || {}), ...(meses as any) };
        }
        return out;
      });
    }).catch(err => console.error('[asistencia] cambio de año:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio]);

  // Cargar días del proyecto seleccionado (y resetear a [] al cambiar de proyecto)
  useEffect(() => {
    setDiasSel([]);
    if (!proyecto || proyecto === TODOS) return;

    // 1.ª opción: clave rápida localStorage (mismo navegador, inmediata)
    try {
      const rawDias = localStorage.getItem(`futuro_dias_${proyecto}`);
      if (rawDias) {
        const dias = JSON.parse(rawDias) as number[];
        if (Array.isArray(dias) && dias.length > 0) { setDiasSel(dias); }
      } else {
        // 2.ª opción: meta compuesta localStorage
        const rawMeta = localStorage.getItem(PROYECTOS_META_KEY);
        if (rawMeta) {
          const meta = JSON.parse(rawMeta) as Record<string, { dias?: number[] }>;
          const proyLower = proyecto.trim().toLowerCase();
          const k = Object.keys(meta).find(mk =>
            mk.trim().toLowerCase().endsWith(`::${proyLower}`) ||
            mk.trim().toLowerCase() === proyLower
          );
          if (k && Array.isArray(meta[k]?.dias) && (meta[k]!.dias!).length > 0) {
            setDiasSel(meta[k]!.dias!);
          }
        }
      }
    } catch {}

    // 3.ª opción: API Supabase (funciona en cualquier dispositivo — principal para profes)
    fetch(`/api/jornada-proyecto?proyecto=${encodeURIComponent(proyecto)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { dias: [] })
      .then(({ dias }: { dias: number[] }) => {
        if (Array.isArray(dias) && dias.length > 0) {
          setDiasSel(dias);
          try { localStorage.setItem(`futuro_dias_${proyecto}`, JSON.stringify(dias)); } catch {}
        }
      })
      .catch(() => {/* silencioso */});

    // Cargar los ajustes de días por MES de este proyecto (el profe puede cambiarlos solo para un mes)
    setOverridesMes({});
    getJornadaMes(proyecto).then(setOverridesMes).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto]);

  // 4.ª opción: leer días desde columna jornada en los deportistas ya cargados
  // (respaldo secundario si el API falló pero los deportistas vienen con jornada)
  useEffect(() => {
    if (!proyecto || proyecto === TODOS || deportistas.length === 0) return;
    const proyLower = proyecto.trim().toLowerCase();
    const match = deportistas.find(dep =>
      proyectoDe(dep).trim().toLowerCase() === proyLower
    );
    if (!match) return;
    const jornadaRaw = getCol(match, /^jornada/i);
    if (!jornadaRaw) return;
    try {
      const parsed = JSON.parse(jornadaRaw) as number[];
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(n => typeof n === 'number' && n >= 0 && n <= 6)
      ) {
        setDiasSel(parsed);
        try { localStorage.setItem(`futuro_dias_${proyecto}`, JSON.stringify(parsed)); } catch {}
      }
    } catch {
      // jornada tiene formato texto (legacy), no hacer nada
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deportistas, proyecto]);

  // Cargar calificaciones del mes desde Supabase (por deportista_id, no por proyecto)
  // Así los deportistas trasladados conservan su CAL
  /* Limpieza única de las notas guardadas en este navegador. Se borran las que
     quedaron de antes del corte del 23/08/2026, para que no reaparezcan encima
     de la base ya limpia. */
  useEffect(() => {
    try {
      if (localStorage.getItem('futuro_cal_purgado_20260823')) return;
      Object.keys(localStorage)
        .filter(k => k.startsWith('futuro_cal_'))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem('futuro_cal_purgado_20260823', '1');
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!proyecto || esResumen) return;
    // La nota arranca vacía: manda la nube. El navegador solo guarda una copia
    // DESPUÉS de que el formador la escribe, nunca antes.
    setCalMap({});
    try {
      const calKey = `futuro_cal_${proyecto}_${mesKey}`;
      const raw = localStorage.getItem(calKey);
      if (raw) setCalMap(JSON.parse(raw));
    } catch {}
    // Sobreescribir con Supabase (fuente de verdad por deportista_id)
    const ids = deportistas.filter(d => proyectoDe(d) === proyecto).map(d => d.id);
    if (!ids.length) return;
    getCalificaciones(ids, mesKey)
      .then(data => { if (Object.keys(data).length) setCalMap(data); })
      .catch(err => console.error('[asistencia] load CAL Supabase:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto, mesKey, deportistas.length]);

  /* Los botones flotantes se ven siempre. Antes se desvanecían cuando
     aparecía la barra de Inicio / Salir del fondo; esa barra se retiró el
     22/08/2026, así que ya no hay nada que los tape. */

  // Programas y proyectos para el admin (no se usa para profe)
  const programas = useMemo(() => {
    if (esProfe) return [];
    const set = new Set<string>();
    deportistas.forEach(d => {
      const p = getCol(d, /^program/i);
      if (p) set.add(p);
    });
    const numN = (s: string) => { const m = s.match(/\d+/); return m ? parseInt(m[0], 10) : 9999; };
    return Array.from(set).sort((a, b) => numN(a) - numN(b) || a.localeCompare(b, 'es'));
  }, [deportistas, esProfe]);

  const proyectos = useMemo(() => {
    if (esProfe) return proyectosProfe;
    const set = new Set<string>();
    deportistas
      .filter(d => !programa || getCol(d, /^program/i) === programa)
      .forEach(d => {
        const p = proyectoDe(d);
        if (p !== '__SIN_PROYECTO__') set.add(p);
      });
    const numN = (s: string) => { const m = s.match(/\d+/); return m ? parseInt(m[0], 10) : 9999; };
    return Array.from(set).sort((a, b) => numN(a) - numN(b) || a.localeCompare(b, 'es'));
  }, [deportistas, programa, esProfe, proyectosProfe]);

  useEffect(() => {
    if (esProfe || deportistas.length === 0) return;
    if (proyecto && proyecto !== TODOS && !proyectos.includes(proyecto)) setProyecto('');
  }, [proyectos, deportistas.length, esProfe]);

  const atletas = useMemo(() => {
    if (!proyecto || proyecto === TODOS) return [];
    // Filtro por estado: en modo normal se OCULTAN los retirados; en modo retirados solo ellos.
    const pasaEstado = (d: Deportista) => mostrarRetirados ? esRetirado(d) : !esRetirado(d);
    if (esProfe) {
      // Para profe los deportistas ya vienen filtrados del API
      return [...deportistas].filter(pasaEstado).sort((a, b) => a._nombre.localeCompare(b._nombre));
    }
    return deportistas
      .filter(d => proyectoDe(d) === proyecto && pasaEstado(d))
      .sort((a, b) => a._nombre.localeCompare(b._nombre));
  }, [deportistas, proyecto, esProfe, mostrarRetirados]);

  // ── VISTA RESUMEN — asistencias mes a mes (FEB…DIC) ─────────────
  // Listado: todos los del programa (Proyecto = TODOS) o los del proyecto elegido.
  const atletasResumen = useMemo(() => {
    if (!esResumen) return [];
    const q = busquedaTodos.trim().toLowerCase();
    const buscar = (d: Deportista) => {
      if (!q) return true;
      const cod = String(getCol(d, /^c[oó]d/i) || '').toLowerCase();
      return d._nombre.toLowerCase().includes(q) || cod.includes(q);
    };
    if (!esTodosProy) return atletas.filter(buscar);
    const pasaEstado = (d: Deportista) => mostrarRetirados ? esRetirado(d) : !esRetirado(d);
    return deportistas
      .filter(d => (!programa || getCol(d, /^program/i) === programa) && pasaEstado(d))
      .filter(buscar)
      .sort((a, b) => a._nombre.localeCompare(b._nombre));
  }, [esResumen, esTodosProy, atletas, deportistas, programa, mostrarRetirados, busquedaTodos]);

  /* CONSOLIDADO: promedio de las valoraciones del año de cada deportista.
     Va DESPUÉS de `atletasResumen`: si se declara antes, al renderizar se lee
     una constante que todavía no existe y el módulo revienta. */
  useEffect(() => {
    if (!esResumen) return;
    const ids = atletasResumen.map(d => d.id);
    if (!ids.length) { setValAnio({}); return; }
    getValoracionesAnio(ids, anio)
      .then(setValAnio)
      .catch(e => console.error('[asistencia] VAL del año:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esResumen, anio, atletasResumen.length, proyecto, programa]);

  // Conteo de asistencias (A = Asistió, C = Compite) por deportista y por mes del AÑO.
  //  · Proyecto concreto → solo los registros de ese proyecto (igual que la vista mensual).
  //  · Proyecto = TODOS  → se suman todos los proyectos (el trasladado no pierde historial).
  const resumenAnual = useMemo(() => {
    const m: Record<string, number[]> = {};
    if (!esResumen) return m;
    const ids = new Set(atletasResumen.map(a => a.id));
    if (!ids.size) return m;
    const claves = esTodosProy ? Object.keys(asistencia) : [proyecto];
    for (const proy of claves) {
      const meses = (asistencia as any)[proy] || {};
      for (const mk of Object.keys(meses)) {
        const [y, mm] = String(mk).split('_');
        if (Number(y) !== anio) continue;
        const idx = Number(mm) - 1;
        if (!(idx >= 0 && idx <= 11)) continue;
        const deps = meses[mk] || {};
        for (const depId of Object.keys(deps)) {
          if (!ids.has(depId)) continue;
          const fechas = deps[depId] || {};
          let n = 0;
          for (const f of Object.keys(fechas)) {
            const e = fechas[f];
            if (e === 'A' || e === 'C') n++;
          }
          if (!n) continue;
          if (!m[depId]) m[depId] = new Array(12).fill(0);
          m[depId][idx] += n;
        }
      }
    }
    return m;
  }, [esResumen, esTodosProy, asistencia, proyecto, atletasResumen, anio]);

  // Sesiones realizadas por proyecto y por mes (días con al menos un registro válido)
  const sesionesPorProy = useMemo(() => {
    const m: Record<string, number[]> = {};
    if (!esResumen) return m;
    const claves = esTodosProy ? Object.keys(asistencia) : [proyecto];
    for (const proy of claves) {
      const meses = (asistencia as any)[proy] || {};
      const t: number[] = new Array(12).fill(0);
      for (const mk of Object.keys(meses)) {
        const [y, mm] = String(mk).split('_');
        if (Number(y) !== anio) continue;
        const idx = Number(mm) - 1;
        if (!(idx >= 0 && idx <= 11)) continue;
        const dias = new Set<string>();
        const deps = meses[mk] || {};
        for (const depId of Object.keys(deps)) {
          const fechas = deps[depId] || {};
          for (const f of Object.keys(fechas)) {
            const e = fechas[f];
            if (e && e !== 'CAN' && e !== 'SE') dias.add(f);
          }
        }
        t[idx] = dias.size;
      }
      m[proy] = t;
    }
    return m;
  }, [esResumen, esTodosProy, asistencia, proyecto, anio]);

  // Fila "SES. REALIZADAS" — solo con UN proyecto seleccionado
  const sesionesPorMes = useMemo(
    () => (esResumen && !esTodosProy ? (sesionesPorProy[proyecto] || new Array(12).fill(0)) : new Array(12).fill(0)),
    [esResumen, esTodosProy, sesionesPorProy, proyecto]
  );

  function totalAnual(depId: string) {
    const fila = resumenAnual[depId];
    if (!fila) return 0;
    return MESES_RESUMEN.reduce((acc, i) => acc + (fila[i] || 0), 0);
  }

  // Meses que todavía no llegan (respecto a hoy) → se pintan en azul, no en rojo
  const hoyRef = new Date();
  const esMesFuturo = (i: number) =>
    anio > hoyRef.getFullYear() || (anio === hoyRef.getFullYear() && i > hoyRef.getMonth());

  // Carga la gestión (foto/doc/EPS e informes) la primera vez que se abre el consolidado
  useEffect(() => {
    if (!esResumen) return;
    if (!gestion) getResumenGestion().then(setGestion).catch(() => setGestion({ conFoto: new Set(), conDoc: new Set(), conEps: new Set(), conCal: new Set() }));
    if (!informes) {
      getEvaluacionesResumen()
        .then(lista => {
          const set = new Set<string>();
          (lista || []).forEach(ev => {
            const cod = String(ev.codigo || '').trim().toUpperCase();
            const num = String(ev.numeroInforme || '').trim();
            if (cod && num) set.add(`${cod}|${num}`);
          });
          setInformes(set);
        })
        .catch(() => setInformes(new Set()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esResumen]);

  const codigoDe = (dep: Deportista) => String(getCol(dep, /^c[oó]d/i) || '').trim().toUpperCase();

  // Resultados del buscador global (todos los programas y proyectos).
  // Se puede buscar por código, por nombre, o por los dos a la vez.
  const hayBusquedaGlobal = qCodigo.trim().length >= 1 || qNombre.trim().length >= 2;
  const resultadosGlobal = useMemo(() => {
    const qc = qCodigo.trim().toLowerCase();
    const qn = qNombre.trim().toLowerCase();
    if (qc.length < 1 && qn.length < 2) return [];
    return deportistas
      .filter(d => (!qc || codigoDe(d).toLowerCase().includes(qc)) &&
                   (!qn || d._nombre.toLowerCase().includes(qn)))
      .sort((a, b) => a._nombre.localeCompare(b._nombre))
      .slice(0, 40);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qCodigo, qNombre, deportistas]);

  /** Salta al consolidado del deportista elegido y deja la tabla con él solo. */
  function irADeportista(dep: Deportista) {
    const prog = getCol(dep, /^program/i) || '';
    const proy = proyectoDe(dep);
    setPrograma(prog);
    setProyecto(proy === '__SIN_PROYECTO__' ? '' : proy);
    setMes(TODO_ANIO);
    setMostrarRetirados(esRetirado(dep));
    setBusquedaTodos(codigoDe(dep) || dep._nombre);
    setQCodigo(''); setQNombre('');
    setBuscadorAbierto(false);
  }

  /**
   * Abre la ficha del deportista (documentos, estado de cuenta, seguimiento…)
   * en una pestaña nueva, para no perder los filtros del consolidado.
   */
  function abrirFicha(dep: Deportista) {
    /* Desde ADMINISTRACIÓN el nombre va derecho al ESTADO DE CUENTA, como en
       todos los listados de admón (dirección, 27/08/2026). Al formador, que no
       ve plata, le sigue abriendo la ficha. */
    const volver = `/asistencia?programa=${encodeURIComponent(programa)}&proyecto=${encodeURIComponent(proyecto)}`;
    const url = esProfe
      ? `/alumnos/${dep.id}?volver=${encodeURIComponent(volver)}`
      : `/alumnos/${dep.id}/estado-cuenta?edit=1&volver=${encodeURIComponent(volver)}`;
    try {
      const w = window.open(url, '_blank');
      if (!w) router.push(url);      // si el navegador bloquea la pestaña
    } catch {
      router.push(url);
    }
  }
  const tieneFoto = (dep: Deportista) => !!gestion?.conFoto.has(dep.id);
  const tieneDoc  = (dep: Deportista) => !!gestion?.conDoc.has(dep.id);
  const tieneEps  = (dep: Deportista) => !!gestion?.conEps.has(dep.id);
  const tieneCal  = (dep: Deportista) => !!gestion?.conCal.has(dep.id);
  const tieneInf  = (dep: Deportista, n: 1 | 2) => !!informes?.has(`${codigoDe(dep)}|${n}`);

  /**
   * ¿El mes le aplica al deportista?  No aplica si es anterior a su afiliación.
   * Esos meses salen como "N.A" y no cuentan para el %.
   */
  function mesAplica(dep: Deportista, i: number): boolean {
    const f = fechaAfiliacionDe(dep);
    if (!f) return true;                       // sin fecha → le aplica todo
    if (f.getFullYear() < anio) return true;
    if (f.getFullYear() > anio) return false;
    return i >= f.getMonth();
  }

  // % sobre las sesiones realizadas del proyecto, contando SOLO los meses que le aplican
  function porcentajeResumen(dep: Deportista): string {
    const proy  = esTodosProy ? proyectoDe(dep) : proyecto;
    const ses   = sesionesPorProy[proy];
    if (!ses) return '—';
    const total = MESES_RESUMEN.reduce((a, i) => a + (mesAplica(dep, i) ? (ses[i] || 0) : 0), 0);
    if (!total) return '—';
    return Math.round((totalAnual(dep.id) / total) * 100) + '%';
  }

  // FECHA AFI., ESTADO, CÓDIGO, DEPORTISTA, AÑO (+ PROYECTO en modo TODOS)
  // El orden cambió el 22/08/2026 para seguir el arte aprobado del consolidado.
  const colsBaseResumen = esTodosProy ? 6 : 5;
  const tituloResumen = esTodosProy
    ? `ASISTENCIAS ${anio}${programa ? ` · ${programa}` : ''}`
    : `ASISTENCIAS ${anio}${programa ? ` · ${programa}` : ''} / ${proyecto}`;
  const nombreArchivoResumen =
    `Asistencias_${(esTodosProy ? (programa || 'TODOS') : proyecto).replace(/[^A-Za-z0-9]+/g, '')}_${anio}`;

  function descargarResumenCSV() {
    if (!atletasResumen.length) return;
    const sep = ';';
    const e = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const extraCol = esTodosProy ? [e('PROYECTO')] : [];
    const cab = [e('FECHA AFI.'), e('ESTADO'), e('CÓDIGO'), e('DEPORTISTA'), e('AÑO'), ...extraCol,
      ...MESES_RESUMEN.map(i => e(MESES_ABR[i])), e('TOTAL'), e('%'),
      e('FOTO'), e('DOC'), e('EPS'), e('CAL'), e('INF 1'), e('INF 2')].join(sep);
    const filas = atletasResumen.map(dep => {
      const fila = resumenAnual[dep.id];
      const proy = proyectoDe(dep);
      return [
        e(fechaAfiliacionTexto(dep)), e(estadoDe(dep)), e(getCol(dep, /^c[oó]d/i) || ''),
        e(dep._nombre), e(getCol(dep, /^a[ñn]o$/i) || ''),
        ...(esTodosProy ? [e(proy === '__SIN_PROYECTO__' ? '' : proy)] : []),
        ...MESES_RESUMEN.map(i => e(mesAplica(dep, i) ? (fila?.[i] || 0) : 'N.A')),
        e(totalAnual(dep.id)), e(porcentajeResumen(dep)),
        e(tieneFoto(dep) ? 'SI' : 'NO'), e(tieneDoc(dep) ? 'SI' : 'NO'), e(tieneEps(dep) ? 'SI' : 'NO'),
        e(tieneCal(dep) ? 'SI' : 'NO'),
        e(tieneInf(dep, 1) ? 'SI' : 'NO'), e(tieneInf(dep, 2) ? 'SI' : 'NO'),
      ].join(sep);
    });
    const relleno = Array(colsBaseResumen - 2).fill(e(''));
    const extra: string[] = [];
    if (!esTodosProy) {
      extra.push([e(''), e('SESIONES REALIZADAS'), ...relleno,
        ...MESES_RESUMEN.map(i => e(sesionesPorMes[i])), e(''), e(''),
        e(''), e(''), e(''), e(''), e(''), e('')].join(sep));
    }
    const contenido = [e(tituloResumen), cab, ...filas, ...extra].join('\r\n');
    const blob = new Blob(['\ufeff' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombreArchivoResumen}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Carga un script externo una sola vez. */
  function cargarScript(src: string): Promise<void> {
    return new Promise((ok, mal) => {
      if (document.querySelector(`script[data-pdf="${src}"]`)) return ok();
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.setAttribute('data-pdf', src);
      el.onload = () => ok();
      el.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.appendChild(el);
    });
  }

  /** Arma el HTML del cuadro (estilos limitados a #pdfArea para no tocar la app). */
  function armarHtmlResumen(): { estilos: string; cuerpo: string } {
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formador = !esTodosProy ? (formadorPorProy[proyecto.trim().toUpperCase()] || '') : '';

    const thMes = MESES_RESUMEN.map(i => `<th class="m">${MESES_ABR[i]}</th>`).join('');
    const filas = atletasResumen.map(dep => {
      const fila = resumenAnual[dep.id];
      const proy = proyectoDe(dep);
      const celdas = MESES_RESUMEN.map(i => {
        const n = fila?.[i] || 0;
        if (!mesAplica(dep, i)) return '<td class="n na">N.A</td>';
        if (esMesFuturo(i)) return '<td class="n f"></td>';
        return `<td class="n${n > 0 ? '' : ' z'}">${n > 0 ? n : 0}</td>`;
      }).join('');
      return `<tr>
        <td class="ce">${esc(fechaAfiliacionTexto(dep))}</td>
        <td class="est">${esc(estadoDe(dep))}</td>
        <td class="cod">${esc(getCol(dep, /^c[oó]d/i) || '—')}</td>
        <td class="nom">${esc(dep._nombre)}</td>
        <td class="anio">${esc(getCol(dep, /^a[ñn]o$/i))}</td>
        ${esTodosProy ? `<td class="ce">${esc(proy === '__SIN_PROYECTO__' ? '' : proy)}</td>` : ''}
        ${celdas}
        <td class="tot">${totalAnual(dep.id) || ''}</td>
        <td class="pct">${esc(porcentajeResumen(dep))}</td>
        <td class="sep"></td>
        <td class="g ${tieneFoto(dep)   ? 'ok' : 'no'}">Foto</td>
        <td class="g ${tieneDoc(dep)    ? 'ok' : 'no'}">Doc</td>
        <td class="g ${tieneEps(dep)    ? 'ok' : 'no'}">EPS</td>
        <td class="g ${tieneCal(dep)    ? 'ok' : 'no'}">CAL</td>
        <td class="sep"></td>
        <td class="g ${tieneInf(dep, 1) ? 'ok' : 'no'}">Inf 1</td>
        <td class="g ${tieneInf(dep, 2) ? 'ok' : 'no'}">Inf 2</td>
        <td class="sep"></td>
      </tr>`;
    }).join('');

    const filaSes = esTodosProy ? '' : `<tr class="pie ses">
      <td colspan="${colsBaseResumen}">SES. REALIZADAS</td>
      ${MESES_RESUMEN.map(i => `<td>${sesionesPorMes[i] || ''}</td>`).join('')}
      <td>${MESES_RESUMEN.reduce((a, i) => a + sesionesPorMes[i], 0) || ''}</td>
      <td colspan="10"></td>
    </tr>`;

    const estilos = `
  #pdfArea { font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; padding: 10px; }
  #pdfArea * { box-sizing: border-box; }
  #pdfArea .cab { background: #064e1e; color: #fff; padding: 8px 10px; border-radius: 6px; margin-bottom: 6px; }
  #pdfArea .cab h1 { margin: 0; font-size: 14px; letter-spacing: .4px; }
  #pdfArea .cab p  { margin: 2px 0 0; font-size: 10px; opacity: .85; }
  #pdfArea table { border-collapse: collapse; width: auto; margin: 0 auto; }
  #pdfArea th, #pdfArea td { border: 1px solid #fff; padding: 2px 3px; white-space: nowrap; vertical-align: middle; line-height: 1.1; }
  #pdfArea thead th { background: #16a34a; color: #fff; font-size: 8px; text-transform: uppercase; text-align: center; padding: 6px 4px; }
  #pdfArea thead th.m { width: 22px; }
  #pdfArea thead th.nomh { text-align: left; }
  #pdfArea thead th.gh { background: #0f766e; }
  #pdfArea thead th.ih { background: #0f766e; }
  #pdfArea td.est { background: #16a34a; color: #fff; font-weight: 800; font-size: 7px; text-align: center; text-transform: uppercase; }
  #pdfArea td.anio{ background: #16a34a; color: #fff; font-weight: 800; font-size: 8px; text-align: center; }
  #pdfArea td.cod { background: #16a34a; color: #fff; font-weight: 900; font-size: 8px; text-align: center; }
  #pdfArea td.nom { background: #f1f5f9; font-weight: 700; font-size: 9px; text-align: left; }
  #pdfArea td.ce  { background: #f1f5f9; font-weight: 700; font-size: 8px; text-align: center; }
  #pdfArea td.n   { background: #f1f5f9; font-weight: 400; font-size: 12px; text-align: center; width: 26px; padding: 3px 2px; }
  #pdfArea td.n.z { background: #fee2e2; }
  #pdfArea td.n.f { background: #4b5563; }
  #pdfArea td.n.na{ background: #f1f5f9; color: #111827; font-weight: 700; font-size: 7px; }
  #pdfArea td.tot { background: #16a34a; color: #fff; font-weight: 900; font-size: 10px; text-align: center; width: 22px; }
  #pdfArea td.pct { background: #4b5563; color: #fff; font-weight: 900; font-size: 9px;  text-align: center; width: 24px; }
  #pdfArea td.g   { color: #fff; font-weight: 900; font-size: 7px; text-align: center; text-transform: uppercase; width: 26px; }
  #pdfArea td.g.ok{ background: #16a34a; }
  #pdfArea td.g.no{ background: #fdbdbd; }
  #pdfArea td.sep, #pdfArea th.sep { background: #111827; border: none; padding: 0; width: 6px; }
  #pdfArea tr.pie td { color: #fff; font-weight: 900; font-size: 9px; text-align: center; background: #334155; padding: 6px 3px; }
  #pdfArea tr.pie td:first-child { text-align: left; padding-left: 6px; }
  #pdfArea .nota { font-size: 8px; color: #6b7280; padding-top: 6px; text-align: right; }
  #pdfArea thead { display: table-header-group; }
  #pdfArea tr { page-break-inside: avoid; }`;

    const cuerpo = `<div class="cab">
  <h1>${esc(tituloResumen)}${mostrarRetirados ? ' · RETIRADOS' : ''}</h1>
  <p>${formador ? 'Formador: ' + esc(formador) + ' · ' : ''}${atletasResumen.length} deportistas · MAX 10 SPORT · Futuro Antioquia</p>
</div>
<table>
  <thead><tr>
    <th>FECHA AFI.</th><th>ESTADO</th><th>CÓDIGO</th><th class="nomh">DEPORTISTA</th><th>AÑO</th>
    ${esTodosProy ? '<th>PROYECTO</th>' : ''}
    ${thMes}<th>TOT</th><th>%</th>
    <th class="sep"></th>
    <th class="gh">Foto</th><th class="gh">Doc</th><th class="gh">EPS</th><th class="gh">CAL</th>
    <th class="sep"></th>
    <th class="ih">Inf 1</th><th class="ih">Inf 2</th>
    <th class="sep"></th>
  </tr></thead>
  <tbody>${filas}${filaSes}</tbody>
</table>
<p class="nota">Generado el ${new Date().toLocaleDateString('es-CO')}</p>`;

    return { estilos, cuerpo };
  }

  /** Respaldo: si el CDN no responde, se usa el diálogo de impresión. */
  function imprimirResumenFallback() {
    const { estilos, cuerpo } = armarHtmlResumen();
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${nombreArchivoResumen}</title>
<style>@page { size: A4 landscape; margin: 8mm; }
body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${estilos}</style></head><body><div id="pdfArea">${cuerpo}</div></body></html>`;

    const tituloPrevio = document.title;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0'; iframe.style.bottom = '0';
    iframe.style.width = '0'; iframe.style.height = '0';
    iframe.style.border = '0'; iframe.style.opacity = '0';
    document.body.appendChild(iframe);
    const limpiar = () => {
      document.title = tituloPrevio;
      setTimeout(() => { try { iframe.remove(); } catch {} }, 300);
    };
    const doc = iframe.contentWindow?.document;
    if (!doc) { limpiar(); return; }
    doc.open(); doc.write(html); doc.close();
    document.title = nombreArchivoResumen;
    const win = iframe.contentWindow!;
    win.onafterprint = limpiar;
    setTimeout(() => { try { win.focus(); win.print(); } catch { limpiar(); } }, 350);
    setTimeout(limpiar, 60000);
  }

  /**
   * Descarga el PDF DIRECTO a la carpeta de descargas (A4 horizontal), sin diálogo de impresión.
   * Usa html2canvas + jsPDF desde CDN; si no cargan, cae al diálogo de impresión.
   */
  async function descargarResumenPDF() {
    if (!atletasResumen.length || generandoPDF) return;
    setGenerandoPDF(true);
    let contenedor: HTMLDivElement | null = null;
    let hoja: HTMLStyleElement | null = null;
    try {
      await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = (window as any).html2canvas;
      const jsPDFCtor   = (window as any).jspdf?.jsPDF;
      if (!html2canvas || !jsPDFCtor) throw new Error('librerías no disponibles');

      const { estilos, cuerpo } = armarHtmlResumen();

      hoja = document.createElement('style');
      hoja.textContent = estilos;
      document.head.appendChild(hoja);

      contenedor = document.createElement('div');
      contenedor.id = 'pdfArea';
      contenedor.innerHTML = cuerpo;
      contenedor.style.position = 'absolute';   // 'fixed' + 'max-content' rompía la medición
      contenedor.style.left = '-10000px';
      contenedor.style.top = '0';
      contenedor.style.background = '#ffffff';
      document.body.appendChild(contenedor);

      const ancho = Math.ceil(contenedor.scrollWidth);
      const alto  = Math.ceil(contenedor.scrollHeight);
      contenedor.style.width = ancho + 'px';

      const lienzo: HTMLCanvasElement = await html2canvas(contenedor, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        width: ancho, height: alto, windowWidth: ancho, windowHeight: alto,
        scrollX: 0, scrollY: 0,
      });
      // Si la captura sale deformada (una tira), mejor caer al diálogo de impresión
      if (!lienzo.width || !lienzo.height || lienzo.width / lienzo.height > 12) {
        throw new Error(`captura inválida ${lienzo.width}x${lienzo.height}`);
      }

      const pdf = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const anchoPag = pdf.internal.pageSize.getWidth();
      const altoPag  = pdf.internal.pageSize.getHeight();
      const margen   = 14;
      const anchoImg = anchoPag - margen * 2;
      const escala   = anchoImg / lienzo.width;          // px del lienzo → pt del PDF
      const altoImg  = lienzo.height * escala;

      if (altoImg <= altoPag - margen * 2) {
        pdf.addImage(lienzo.toDataURL('image/jpeg', 0.92), 'JPEG', margen, margen, anchoImg, altoImg);
      } else {
        // Varias páginas: el lienzo se recorta en tiras del alto de una página
        const altoTira = Math.floor((altoPag - margen * 2) / escala);
        let y = 0, pagina = 0;
        while (y < lienzo.height) {
          const alto = Math.min(altoTira, lienzo.height - y);
          const tira = document.createElement('canvas');
          tira.width = lienzo.width; tira.height = alto;
          const ctx = tira.getContext('2d');
          if (!ctx) break;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, tira.width, tira.height);
          ctx.drawImage(lienzo, 0, y, lienzo.width, alto, 0, 0, lienzo.width, alto);
          if (pagina > 0) pdf.addPage();
          pdf.addImage(tira.toDataURL('image/jpeg', 0.92), 'JPEG', margen, margen, anchoImg, alto * escala);
          y += alto; pagina++;
        }
      }

      pdf.save(`${nombreArchivoResumen}.pdf`);
    } catch (e) {
      console.error('[asistencia] PDF directo falló, se usa impresión:', e);
      imprimirResumenFallback();
    } finally {
      try { if (contenedor) contenedor.remove(); } catch {}
      try { if (hoja) hoja.remove(); } catch {}
      setGenerandoPDF(false);
    }
  }

  // Días EFECTIVOS del mes.
  const mesTieneAjuste = mesKey in overridesMes;

  // Días de la semana con asistencia registrada este mes, SOLO en el proyecto actual.
  // (Así, si un deportista viene de otro grupo con días distintos, esos días viejos NO
  //  contaminan la vista de este grupo. Su historial completo se ve en su ficha.)
  const diasConDataMes = useMemo(() => {
    const set = new Set<number>();
    const idsRoster = new Set(atletas.map(a => a.id));
    const mesData = (asistencia[proyecto] as any)?.[mesKey];
    if (mesData) {
      for (const depId of Object.keys(mesData)) {
        if (!idsRoster.has(depId)) continue;
        for (const fecha of Object.keys(mesData[depId])) {
          if (!mesData[depId][fecha]) continue;
          const dt = new Date(fecha + 'T00:00:00');
          if (!isNaN(dt.getTime())) set.add(dt.getDay());
        }
      }
    }
    return set;
  }, [asistencia, proyecto, mesKey, atletas]);

  // ¿Es un mes pasado? (para no imponerle los días NUEVOS del proyecto a meses viejos)
  const _hoy = new Date();
  const mesKeyActual = `${_hoy.getFullYear()}_${String(_hoy.getMonth() + 1).padStart(2, '0')}`;
  const esMesPasado = mesKey < mesKeyActual;

  // Regla: la asistencia histórica NUNCA se oculta (siempre se incluyen los días que tienen datos).
  //  · Mes con ajuste propio → sus días ajustados (+ los que tengan datos).
  //  · Mes pasado sin ajuste → SOLO los días que realmente se usaron (conserva los días anteriores).
  //  · Mes actual/futuro → los días base actuales del proyecto (+ los que tengan datos).
  const diasEfectivos = useMemo(() => {
    const conData = [...diasConDataMes];
    let base: number[];
    if (mesTieneAjuste) base = overridesMes[mesKey] || [];
    else if (esMesPasado) base = [];
    else base = diasSel;
    const union = [...new Set([...base, ...conData])];
    return union.length ? union : diasSel;
  }, [mesTieneAjuste, overridesMes, mesKey, esMesPasado, diasSel, diasConDataMes]);

  const diasDelMes = useMemo(() => {
    const dias: Date[] = [];
    const d = new Date(anio, mes, 1);
    while (d.getMonth() === mes) {
      if (diasEfectivos.includes(d.getDay())) dias.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return dias.sort((a, b) => {
      const isoA = JS_DIA_A_ISO(a.getDay());
      const isoB = JS_DIA_A_ISO(b.getDay());
      const lunA = new Date(a); lunA.setDate(a.getDate() - (isoA - 1));
      const lunB = new Date(b); lunB.setDate(b.getDate() - (isoB - 1));
      const diff = lunA.getTime() - lunB.getTime();
      return diff !== 0 ? diff : isoA - isoB;
    });
  }, [mes, anio, diasEfectivos]);

  // ── Memoizar estado por celda ────────────────────────────────
  // SOLO el proyecto actual: cada grupo muestra únicamente SU propia asistencia.
  // El historial completo del deportista (incluidos grupos anteriores) se ve en su ficha.
  const estadoMap = useMemo(() => {
    const m: Record<string, Record<string, Estado>> = {};
    atletas.forEach(dep => {
      m[dep.id] = {};
      diasDelMes.forEach(d => {
        const fk = d.toISOString().split('T')[0];
        m[dep.id][fk] = asistencia[proyecto]?.[mesKey]?.[dep.id]?.[fk] ?? '';
      });
    });
    return m;
  }, [atletas, diasDelMes, asistencia, proyecto, mesKey]);

  // ── Memoizar totales ─────────────────────────────────────────
  const totalesMap = useMemo(() => {
    const m: Record<string, number> = {};
    atletas.forEach(dep => {
      m[dep.id] = diasDelMes.filter(d => {
        const e = estadoMap[dep.id]?.[d.toISOString().split('T')[0]] ?? '';
        return e === 'A' || e === 'C';
      }).length;
    });
    return m;
  }, [atletas, diasDelMes, estadoMap]);

  const sesionesRealizadas = useMemo(() => {
    return diasDelMes.filter(d => {
      const fk = d.toISOString().split('T')[0];
      return atletas.some(dep => {
        const e = estadoMap[dep.id]?.[fk] ?? '';
        return e !== '' && e !== 'CAN' && e !== 'SE';
      });
    }).length;
  }, [atletas, diasDelMes, estadoMap]);

  function getEstado(depId: string, fk: string): Estado {
    return estadoMap[depId]?.[fk] ?? '';
  }

  const toggleEstado = useCallback((depId: string, fecha: Date) => {
    const fk   = fecha.toISOString().split('T')[0];
    const curr = estadoMap[depId]?.[fk] ?? '';
    if (curr === 'CAN') return;
    const next = ESTADO_NEXT[curr];

    // Si volvemos a vacío Y había un valor real → eliminar la fila de Supabase
    if (!next && curr) {
      deleteAsistenciaFecha(proyecto, mesKey, depId, fk)
        .catch(e => console.error('[asistencia] delete:', e));
    }

    setAsistencia(prev => {
      const prevMes = prev[proyecto]?.[mesKey] ?? {};
      const prevDep = prevMes[depId] ?? {};
      let newDep: Record<string, string>;
      if (!next) {
        // Volver a vacío = eliminar la clave (no guardar '' en Supabase)
        const { [fk]: _removed, ...rest } = prevDep;
        newDep = rest;
      } else {
        newDep = { ...prevDep, [fk]: next };
      }
      const newMes  = { ...prevMes, [depId]: newDep };
      const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
      // Solo localStorage en cada click — evita carreras con Supabase
      saveAsistenciaLocal(updated);
      setHayCambios(true);
      return updated;
    });
  }, [estadoMap, proyecto, mesKey]);

  function cancelarDia(fecha: Date) {
    const fk      = fecha.toISOString().split('T')[0];
    const diaStr  = `${DIAS_SEMANA[JS_DIA_A_ISO(fecha.getDay()) - 1]} ${fecha.getDate()}`;
    const yaCancelado = atletas.length > 0 && getEstado(atletas[0].id, fk) === 'CAN';
    if (yaCancelado) {
      if (!window.confirm(`¿Deshacer el cancelado del ${diaStr}?`)) return;
      // Deshacer cancelado: eliminar la fila CAN de Supabase por cada atleta
      atletas.forEach(d => {
        deleteAsistenciaFecha(proyecto, mesKey, d.id, fk)
          .catch(e => console.error('[asistencia] delete undo-cancel:', e));
      });
      setAsistencia(prev => {
        const prevMes = prev[proyecto]?.[mesKey] ?? {};
        const newMes  = { ...prevMes };
        atletas.forEach(d => {
          const { [fk]: _removed, ...rest } = newMes[d.id] ?? {};
          newMes[d.id] = rest;
        });
        const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
        saveAsistenciaLocal(updated);
        setHayCambios(true);
        return updated;
      });
    } else {
      if (!window.confirm(`¿CANCELAR el día ${diaStr}?`)) return;
      setAsistencia(prev => {
        const prevMes = prev[proyecto]?.[mesKey] ?? {};
        const newMes  = { ...prevMes };
        atletas.forEach(d => { newMes[d.id] = { ...(newMes[d.id] ?? {}), [fk]: 'CAN' }; });
        const updated: AsistenciaData = { ...prev, [proyecto]: { ...(prev[proyecto] ?? {}), [mesKey]: newMes } };
        saveAsistenciaLocal(updated);
        setHayCambios(true);
        return updated;
      });
    }
  }

  function porcentaje(depId: string): string {
    if (sesionesRealizadas === 0) return '—';
    return Math.round((totalesMap[depId] / sesionesRealizadas) * 100) + '%';
  }

  // El profe ajusta los días SOLO para el mes visible (no cambia los demás meses).
  function toggleDia(jsDay: number) {
    if (!proyecto) return;
    const base = (mesKey in overridesMes) ? overridesMes[mesKey] : diasSel;
    const newDias = base.includes(jsDay)
      ? base.filter(x => x !== jsDay)
      : [...base, jsDay].sort();
    setOverridesMes(prev => ({ ...prev, [mesKey]: newDias }));
    saveJornadaMes(proyecto, mesKey, newDias).catch(() => {});
  }

  // Volver los días de este mes a los del proyecto (quitar el ajuste del mes)
  function restaurarDiasMes() {
    if (!proyecto || !(mesKey in overridesMes)) return;
    setOverridesMes(prev => ({ ...prev, [mesKey]: [...diasSel] }));
    saveJornadaMes(proyecto, mesKey, diasSel).catch(() => {});
  }

  function setCal(depId: string, value: string) {
    setCalMap(prev => {
      const updated = { ...prev, [depId]: value };
      // localStorage como caché instantáneo (UX sin latencia)
      try {
        const calKey = `futuro_cal_${proyecto}_${mesKey}`;
        localStorage.setItem(calKey, JSON.stringify(updated));
      } catch {}
      // Supabase como fuente de verdad — keyed por deportista_id para sobrevivir traslados
      if (depId && mesKey) {
        saveCalificacion(depId, mesKey, value)
          .catch(e => console.error('[asistencia] save CAL Supabase:', e));
      }
      return updated;
    });
  }

  async function guardarAsistencia() {
    if (guardando || !proyecto) return;
    setGuardando(true);
    setGuardado(false);
    setErrorGuardar(false);
    try {
      // Solo guarda el proyecto activo — nunca sobreescribe datos de otros profes
      const ok = await saveAsistenciaProyecto(proyecto, asistencia);
      if (ok) {
        setGuardado(true);
        setHayCambios(false);
        setTimeout(() => setGuardado(false), 4000);
      } else {
        setErrorGuardar(true);
        setTimeout(() => setErrorGuardar(false), 6000);
      }
    } finally {
      setGuardando(false);
    }
  }

  function descargarExcel() {
    if (!proyecto || atletas.length === 0 || diasDelMes.length === 0) return;
    const sep = ';';
    const e   = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const grupos: { semLabel: number; isos: string[] }[] = [];
    let semLabel = 0;
    diasDelMes.forEach(d => {
      const s = semanaNum(d); const iso = d.toISOString();
      if (!grupos.length || semanaNum(new Date(grupos[grupos.length - 1].isos[0])) !== s) {
        semLabel++; grupos.push({ semLabel, isos: [iso] });
      } else { grupos[grupos.length - 1].isos.push(iso); }
    });
    const colsBase = esProfe ? 2 : 3;
    const fila1 = [e(`ASISTENCIA ${MESES[mes].toUpperCase()} ${anio} / ${proyecto}`), ...Array(colsBase - 1 + diasDelMes.length + 1).fill(e(''))].join(sep);
    const semCeldas = grupos.flatMap(g => [e(`SEMANA ${g.semLabel}`), ...Array(g.isos.length - 1).fill(e(''))]);
    const fila2 = [...Array(colsBase).fill(e('')), ...semCeldas, e('TOTAL'), e('%'), ...(esProfe ? [e('VALORACIÓN')] : [])].join(sep);
    const colDias = diasDelMes.map(d => { const iso = JS_DIA_A_ISO(d.getDay()); return e(`${DIAS_INICIAL[iso - 1]} ${d.getDate()}`); });
    const fila3 = esProfe
      ? [e('CÓDIGO'), e('NOMBRE DEL DEPORTISTA'), ...colDias, e('TOTAL'), e('%'), e('VAL')].join(sep)
      : [e('CÓDIGO'), e('NOMBRE DEL DEPORTISTA'), e('AÑO'), ...colDias, e('TOTAL'), e('%')].join(sep);
    const filasData = atletas.map(dep => {
      const cod = getCol(dep, /^c[oó]d/i); const año = getCol(dep, /^a[ñn]o$/i);
      const tot = totalesMap[dep.id];
      const celdas = diasDelMes.map(d => { const fk = d.toISOString().split('T')[0]; return e(ESTADO_LABEL[estadoMap[dep.id]?.[fk] ?? ''] || ''); });
      const base = esProfe ? [e(cod || ''), e(dep._nombre)] : [e(cod || ''), e(dep._nombre), e(año || '')];
      const calVal = esProfe ? [e(calMap[dep.id] ?? '')] : [];   // VAL del mes
      return [...base, ...celdas, e(tot > 0 ? tot : ''), e(tot > 0 ? porcentaje(dep.id) : ''), ...calVal].join(sep);
    });
    const filaFinal = [...Array(colsBase).fill(e('')),
      ...diasDelMes.map(d => { const fk = d.toISOString().split('T')[0]; const r = atletas.some(dep => { const est = estadoMap[dep.id]?.[fk] ?? ''; return est !== '' && est !== 'CAN' && est !== 'SE'; }); return e(r ? '✓' : ''); }),
      e(sesionesRealizadas), e(''),
    ].join(sep);
    const contenido = [fila1, fila2, fila3, ...filasData, filaFinal].join('\r\n');
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Asistencia_${proyecto}_${MESES[mes]}_${anio}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Grupos de semanas para la cabecera
  const gruposSemana = useMemo(() => {
    const grupos: { sem: number; semLabel: number; count: number; isos: string[] }[] = [];
    let semLabel = 0;
    diasDelMes.forEach(d => {
      const s = semanaNum(d); const iso = d.toISOString();
      if (!grupos.length || grupos[grupos.length - 1].sem !== s) {
        semLabel++; grupos.push({ sem: s, semLabel, count: 1, isos: [iso] });
      } else { grupos[grupos.length - 1].count++; grupos[grupos.length - 1].isos.push(iso); }
    });
    return grupos;
  }, [diasDelMes]);

  /** Posiciones (dentro de diasDelMes) donde empieza una semana nueva.
   *  Sirve para dibujar la raya divisoria entre SEM 1, SEM 2, SEM 3… */
  const iniciosSemana = useMemo(() => {
    const set = new Set<number>();
    let acum = 0;
    gruposSemana.forEach((g, i) => { if (i > 0) set.add(acum); acum += g.count; });
    return set;
  }, [gruposSemana]);

  const estaCargando = cargando || cargandoProy;

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* ── Panel de error diagnóstico (visible en lugar de "Application error") ── */}
      {errorMsg && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#3C4759] rounded-2xl shadow-2xl p-6 max-w-lg w-full">
            <h2 className="text-xl font-black text-[#F08A87] mb-2">⚠️ Error detectado</h2>
            <p className="text-xs text-white/70 mb-3">Toma captura de pantalla y envíala al desarrollador:</p>
            <pre className="bg-[#2B3547] rounded-lg p-3 text-[11px] font-mono overflow-auto mb-4 whitespace-pre-wrap break-all" style={{ maxHeight: 280 }}>
              {errorMsg}
            </pre>
            <div className="flex gap-3">
              <button onClick={() => { setErrorMsg(null); window.location.reload(); }}
                className="flex-1 bg-green-600 text-white font-black py-3 rounded-xl text-sm">
                🔄 Recargar
              </button>
              <button onClick={() => setErrorMsg(null)}
                className="flex-1 bg-[#2B3547] text-white font-black py-3 rounded-xl text-sm">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push(esProfe ? '/mis-proyectos' : '/dashboard'); }} className="text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Control de Asistencia</h1>
          {proyecto && <p className="text-white/60 text-xs truncate">{esTodosProy ? `Consolidado ${anio}` : `${proyecto}${esResumen ? ` · consolidado ${anio}` : ''}`}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {proyecto && !esResumen && atletas.length > 0 && esProfe && (
            <>
              <button onClick={descargarExcel}
                className="hidden sm:flex items-center gap-1 bg-white/20 hover:bg-white/35 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition border border-white/30">
                <FileDown className="w-3.5 h-3.5" />CSV
              </button>
            </>
          )}
          <div className="flex flex-col items-end flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
            <p className="text-white/60 text-[8px] mt-0.5 text-right leading-tight">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      <main className="px-2 sm:px-3 py-2 sm:py-3 pb-32 space-y-2 sm:space-y-3">

        {/* ── Bienvenida profe ───────────────────────────────── */}
        {esProfe && !proyecto && !estaCargando && (
          <div className="min-h-[80vh] flex flex-col items-center justify-center py-6 px-4">
            {/* Tarjeta compacta */}
            <div className="w-full max-w-xs mb-6">
              <div className="bg-gradient-to-br from-[#064e1e] to-[#16a34a] rounded-2xl p-6 flex flex-col items-center text-center shadow-xl">
                {fotoProfe ? (
                  <img src={fotoProfe} alt={nombreProfe}
                    className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg mb-3" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/60 flex items-center justify-center shadow-lg mb-3">
                    <span className="text-3xl font-black text-white">{typeof nombreProfe === 'string' ? nombreProfe.charAt(0) : '?'}</span>
                  </div>
                )}
                <p className="text-white/70 text-xs font-semibold tracking-widest uppercase">¡Hola,</p>
                <h2 className="text-xl font-black text-white">{nombreProfe}!</h2>
                <p className="text-white/50 text-[11px] mt-1">
                  {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
            <p className="text-white/55 text-sm mb-5 text-center font-medium">
              {Array.isArray(proyectosProfe) && proyectosProfe.length > 0 ? 'Selecciona el proyecto:' : 'Sin proyectos asignados. Contacta al admin.'}
            </p>
            {Array.isArray(proyectosProfe) && proyectosProfe.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-sm">
                {proyectosProfe.map(proy => (
                  <button key={proy} onClick={() => setProyecto(proy)}
                    className="bg-[#3C4759] border-2 border-[#4A5568] hover:border-[#16a34a] rounded-2xl p-4 text-center shadow-sm hover:shadow-md transition-all active:scale-95">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#064e1e] to-[#22c55e] rounded-xl flex items-center justify-center mx-auto mb-2">
                      <svg className="w-6 h-6" viewBox="0 0 100 100" fill="none">
                        <circle cx="50" cy="50" r="40" stroke="white" strokeWidth="4"/>
                        <polygon points="50,30 64,40 59,56 41,56 36,40" fill="white"/>
                      </svg>
                    </div>
                    <p className="font-black text-[#064e1e] text-base leading-tight">{proy}</p>
                    <p className="text-xs text-white/40 mt-0.5">Pasar asistencia →</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Controles — colapsables en móvil ───────────────── */}
        <div className="border shadow-sm rounded-xl" style={{ background: PANEL, borderColor: BORDE }}>
          {/* Cabecera del panel (siempre visible) */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 sm:hidden"
            onClick={() => setControlesAbiertos(v => !v)}>
            {/* Antes esta barra repetía "SUB 8A · Agosto 2026", que ya está
                abajo en el título de la tabla y en los propios selectores.
                Ahora solo dice qué es y para qué se abre. — 25/08/2026 */}
            <span className="text-sm font-black text-white/80 text-left">
              ⚙️ Ajustes
              {esProfe && proyectos.length > 1 && !controlesAbiertos && (
                <span className="block text-[10px] font-bold normal-case mt-0.5" style={{ color: '#00B050' }}>
                  toca para cambiar de proyecto
                </span>
              )}
            </span>
            {controlesAbiertos ? <ChevronUp className="w-4 h-4 text-white/50" /> : <ChevronDown className="w-4 h-4 text-white/50" />}
          </button>

          {/* Controles expandibles */}
          <div className={`${controlesAbiertos ? 'block' : 'hidden'} sm:block px-3 sm:px-4 pb-3 pt-0 sm:pt-3`}>
            <div className="flex flex-wrap items-end gap-3">

              {/* Programa — solo admin */}
              {!esProfe && (
                <div className="min-w-[140px]">
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Programa</label>
                  <select value={programa} onChange={e => { setPrograma(e.target.value); setProyecto(''); }}
                    className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border" style={{ background: CAMPO, borderColor: BORDE }}>
                    <option value="">— Todos —</option>
                    {programas.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {/* Proyecto — solo admin. El formador lo tiene al lado del MES. */}
              {!esProfe && (
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Proyecto</label>
                  <select value={proyecto} onChange={e => setProyecto(e.target.value)}
                    className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border" style={{ background: CAMPO, borderColor: BORDE }}
                    disabled={proyectos.length === 0}>
                    <option value="">— Selecciona —</option>
                    <option value={TODOS}>★ TODOS — resumen anual</option>
                    {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {/* Buscador global — un deportista sin importar programa ni proyecto */}
              {!esProfe && (
                <div className="relative">
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Buscar</label>
                  <button
                    type="button"
                    onClick={() => setBuscadorAbierto(v => !v)}
                    title="Buscar un deportista en todos los proyectos"
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-black border transition whitespace-nowrap ${
                      buscadorAbierto ? 'bg-[#00B050] text-white border-[#00B050]' : 'bg-[#3C4759] text-white/80 border-[#4A5568] hover:bg-[#44506380]'
                    }`}>
                    <Search className="w-4 h-4" /> Deportista
                  </button>

                  {buscadorAbierto && (
                    <div className="absolute z-40 mt-2 left-0 w-[380px] bg-[#3C4759] border border-[#4A5568] rounded-xl shadow-xl p-2">
                      <div className="flex items-start gap-1">
                        <div className="w-[110px]">
                          <label className="block text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Código</label>
                          <input
                            autoFocus
                            value={qCodigo}
                            onChange={e => setQCodigo(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') { setBuscadorAbierto(false); setQCodigo(''); setQNombre(''); }
                              if (e.key === 'Enter' && resultadosGlobal.length) irADeportista(resultadosGlobal[0]);
                            }}
                            placeholder="22194"
                            className="w-full border border-[#4A5568] rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Nombre</label>
                          <input
                            value={qNombre}
                            onChange={e => setQNombre(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') { setBuscadorAbierto(false); setQCodigo(''); setQNombre(''); }
                              if (e.key === 'Enter' && resultadosGlobal.length) irADeportista(resultadosGlobal[0]);
                            }}
                            placeholder="Apellido o nombre"
                            className="w-full border border-[#4A5568] rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <button type="button" onClick={() => { setBuscadorAbierto(false); setQCodigo(''); setQNombre(''); }}
                          className="p-1.5 mt-4 text-white/40 hover:text-white" title="Cerrar">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-2 max-h-72 overflow-auto">
                        {!hayBusquedaGlobal ? (
                          <p className="text-[11px] text-white/40 font-semibold px-1 py-2">Escribe un código, o 2 letras del nombre…</p>
                        ) : resultadosGlobal.length === 0 ? (
                          <p className="text-[11px] text-white/40 font-semibold px-1 py-2">Sin resultados</p>
                        ) : resultadosGlobal.map(d => {
                          const proy = proyectoDe(d);
                          return (
                            <button key={d.id} type="button" onClick={() => irADeportista(d)}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[rgba(0,176,80,.14)] transition flex items-center gap-2">
                              <span className="text-white font-black text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: VERDE }}>
                                {codigoDe(d) || '—'}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[12px] font-bold text-white truncate">{d._nombre}</span>
                                <span className="block text-[10px] text-white/40 font-semibold truncate">
                                  {getCol(d, /^program/i) || '—'} · {proy === '__SIN_PROYECTO__' ? 'sin proyecto' : proy}
                                  {esRetirado(d) ? ' · retirado' : ''}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Botón CONSOLIDADO — acceso directo (profe y admin) */}
              {proyecto && proyecto !== TODOS && (
                <div>
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Vista anual</label>
                  <button
                    type="button"
                    onClick={() => setMes(esResumen ? new Date().getMonth() : TODO_ANIO)}
                    title={esResumen ? 'Volver a pasar asistencia del mes' : 'Ver el consolidado del año de tu proyecto'}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-black border transition whitespace-nowrap ${
                      esResumen
                        ? 'bg-[#00B050] text-white border-[#00B050] hover:brightness-110'
                        : 'bg-[#00B050] text-white border-[#00B050] hover:brightness-110'
                    }`}>
                    {esResumen ? '← Volver a asistencia' : '📊 CONSOLIDADO'}
                  </button>
                </div>
              )}

              {/* Toggle Activos / Retirados */}
              <div>
                <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Vista</label>
                <button onClick={() => setMostrarRetirados(v => !v)}
                  title="Alterna entre deportistas activos y retirados"
                  className={`rounded-lg px-3 py-1.5 text-sm font-black border transition whitespace-nowrap ${mostrarRetirados ? 'bg-red-500 text-white border-red-500' : 'bg-[#3C4759] text-white/80 border-[#4A5568] hover:bg-[#44506380]'}`}>
                  {mostrarRetirados ? '● Retirados' : 'Activos'}
                </button>
              </div>

              {/* Proyecto + Mes + Año en fila */}
              <div className="flex gap-2 flex-wrap">
                {/* CAMBIAR DE PROYECTO SIN SALIR DE ASISTENCIA — 25/08/2026
                    El formador tenía que volver a Mis Proyectos para pasarse a
                    su otro grupo. Ahora lo cambia aquí mismo, al lado del mes.
                    Solo aparece si tiene más de un proyecto asignado. */}
                {esProfe && proyectos.length > 1 && (
                  <div className="min-w-[130px] flex-1">
                    <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">
                      Proyecto <span className="normal-case tracking-normal font-bold text-[#00B050]">· cámbialo aquí</span>
                    </label>
                    <select value={proyecto} onChange={e => setProyecto(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-sm font-black focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border"
                      style={{ background: CAMPO, borderColor: '#00B050' }}>
                      {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                <div className="min-w-[145px]">
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Mes</label>
                  <select value={mes} onChange={e => setMes(Number(e.target.value))}
                    className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border" style={{ background: CAMPO, borderColor: BORDE }}>
                    <option value={TODO_ANIO}>CONSOLIDADO</option>
                    {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div className="min-w-[80px]">
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">Año</label>
                  <select value={anio} onChange={e => setAnio(Number(e.target.value))}
                    className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border" style={{ background: CAMPO, borderColor: BORDE }}>
                    {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Días de entreno — el profe puede ajustarlos SOLO para el mes visible */}
              {proyecto && !esResumen && (
                <div>
                  <label className="block text-[10px] font-black text-white/55 uppercase tracking-widest mb-1">
                    Días de entreno
                    {esProfe && (
                      <span className="ml-1 font-semibold normal-case" style={{ color: VERDE }}>
                        · toca para ajustar solo {MESES[mes]}
                      </span>
                    )}
                    {mesTieneAjuste && (
                      <button onClick={restaurarDiasMes} type="button"
                        className="ml-2 text-[#8FBEF0] hover:text-blue-800 font-semibold normal-case underline">
                        volver a los del proyecto
                      </button>
                    )}
                  </label>
                  <div className="flex gap-1">
                    {DIAS_ORDEN_JS.map((jsDay, i) => {
                      const activo = diasEfectivos.includes(jsDay);
                      // Profesor: editable (solo afecta este mes)
                      if (esProfe) {
                        return (
                          <button key={jsDay} type="button" onClick={() => toggleDia(jsDay)}
                            title={`Ajustar los días de ${MESES[mes]} (no cambia otros meses)`}
                            className={`w-9 h-9 rounded-lg text-[10px] font-black flex items-center justify-center transition ${
                              activo ? 'bg-[#00B050] text-white shadow-sm' : 'bg-[#2B3547] text-white/60 hover:bg-[#44506A]'
                            }`}>
                            {DIAS_SEMANA[i].slice(0, 2)}
                          </button>
                        );
                      }
                      // Admin: solo lectura (los días base se gestionan en /usuarios)
                      return (
                        <span key={jsDay}
                          title="Los días base se configuran en Información de Proyectos"
                          className={`w-9 h-9 rounded-lg text-[10px] font-black flex items-center justify-center select-none ${
                            activo ? 'bg-[#00B050] text-white' : 'bg-[#2B3547] text-white/60'
                          }`}>
                          {DIAS_SEMANA[i].slice(0, 2)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}


            </div>

            {/* Formador del grupo seleccionado (debajo de Programa y Proyecto) */}
            {!esProfe && proyecto && formadorPorProy[proyecto.trim().toUpperCase()] && (
              <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: BORDE }}>
                <span className="text-[10px] font-black text-white/55 uppercase tracking-widest">Formador</span>
                <span className="inline-flex items-center text-white text-sm font-black px-3 py-1 rounded-lg" style={{ background: VERDE }}>
                  {formadorPorProy[proyecto.trim().toUpperCase()]}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tabla */}
        {estaCargando ? (
          <div className="rounded-xl border shadow-sm" style={{ background: PANEL, borderColor: BORDE }}>
            <BalonCargando />
          </div>
        ) : esResumen ? (
          /* ── RESUMEN MES A MES — compacto y vertical (apto para PDF/WhatsApp) ── */
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={busquedaTodos}
                onChange={e => setBusquedaTodos(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="flex-1 min-w-[180px] rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#00B050] text-white border placeholder:text-white/40"
                style={{ background: CAMPO, borderColor: BORDE }} />
              <button onClick={descargarResumenPDF} disabled={generandoPDF}
                className="flex items-center gap-1 bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs font-black px-3 py-2 rounded-lg transition">
                <FileDown className="w-3.5 h-3.5" /> {generandoPDF ? 'GENERANDO…' : 'PDF'}
              </button>
              <button onClick={descargarResumenCSV}
                className="flex items-center gap-1 hover:brightness-110 text-white text-xs font-black px-3 py-2 rounded-lg transition" style={{ background: VERDE }}>
                <FileDown className="w-3.5 h-3.5" /> CSV
              </button>
              <span className="text-xs font-black text-white/55 uppercase tracking-widest">
                {atletasResumen.length} deportistas
              </span>
            </div>

            {esProfe && (
              <div className="border rounded-xl p-3 space-y-2" style={{ background: PANEL, borderColor: BORDE }}>
                <p className="text-[12px] font-black text-[#065f46] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Estas son las asistencias que quedaron guardadas y que ve la administración.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ['Sin foto',   atletasResumen.filter(d => !tieneFoto(d)).length],
                    ['Sin doc',    atletasResumen.filter(d => !tieneDoc(d)).length],
                    ['Sin EPS',    atletasResumen.filter(d => !tieneEps(d)).length],
                    ['Sin CAL',    atletasResumen.filter(d => !tieneCal(d)).length],
                    ['Sin Inf 1',  atletasResumen.filter(d => !tieneInf(d, 1)).length],
                    ['Sin Inf 2',  atletasResumen.filter(d => !tieneInf(d, 2)).length],
                  ] as [string, number][]).map(([etiqueta, n]) => (
                    <span key={etiqueta}
                      className={`text-[11px] font-black px-2 py-1 rounded-lg border ${
                        n === 0
                          ? 'bg-[rgba(0,176,80,.20)] text-[#5BE39B] border-[rgba(0,176,80,.45)]'
                          : 'bg-[rgba(192,80,77,.14)] text-[#F08A87] border-red-200'
                      }`}>
                      {etiqueta}: {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {atletasResumen.length === 0 ? (
              <div className="rounded-xl border shadow-sm p-12 text-center" style={{ background: PANEL, borderColor: BORDE }}>
                <Users className="w-12 h-12 text-white/25 mx-auto mb-3" />
                <p className="text-white/55 font-semibold">No hay deportistas con esos filtros</p>
              </div>
            ) : (
            <div className="rounded-2xl shadow-lg overflow-hidden inline-block max-w-full align-top" style={{ background: LIENZO }}>
              <div className="overflow-auto px-3 pb-3 pt-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                <table style={{ width: 'max-content', borderCollapse: 'collapse' }}>
                  <thead className="sticky top-0 z-20">
                    {/* Fila 1 · títulos de grupo, en blanco sobre el lienzo */}
                    <tr>
                      <th colSpan={colsBaseResumen + 1} style={{ ...celda, paddingBottom: 6 }}
                        className="text-left text-white font-bold text-[13px] whitespace-nowrap pl-1">
                        {tituloResumen}{mostrarRetirados ? ' · RETIRADOS' : ''}
                      </th>
                      <th rowSpan={2} style={separador} />
                      <th colSpan={MESES_RESUMEN.length} style={{ ...celda, paddingBottom: 6 }}
                        className="text-center text-white font-bold text-[13px] whitespace-nowrap">
                        ASISTENCIAS POR MES
                      </th>
                      {/* Van pegados abajo para quedar a la misma altura y del mismo
                          tamaño que las pastillas de los meses. */}
                      <th rowSpan={2} style={{ ...celda, width: 40, verticalAlign: 'bottom' }}>
                        <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.04em', padding: '2px 4px' })}>#&nbsp;A</div>
                      </th>
                      <th rowSpan={2} style={{ ...celda, width: 46, verticalAlign: 'bottom' }}>
                        <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, padding: '2px 4px' })}>%</div>
                      </th>
                      <th rowSpan={2} style={separador} />
                      <th colSpan={4} style={{ ...celda, paddingBottom: 6 }}
                        className="text-center text-white font-bold text-[13px] whitespace-nowrap">
                        DOCUMENTOS
                      </th>
                      <th rowSpan={2} style={separador} />
                      <th colSpan={2} style={{ ...celda, paddingBottom: 6 }}
                        className="text-center text-white font-bold text-[13px] whitespace-nowrap">
                        INFO.
                      </th>
                      <th rowSpan={2} style={separador} />
                    </tr>

                    {/* Fila 2 · nombres de columna, en pastilla verde */}
                    <tr>
                      {(['FECHA AFI.', 'ESTADO', 'CÓDIGO'] as string[]).map(t => (
                        <th key={t} style={celda}>
                          <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.05em' })}>{t}</div>
                        </th>
                      ))}
                      <th style={{ ...celda, minWidth: 210 }}>
                        <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.05em' })}>DEPORTISTA</div>
                      </th>
                      <th style={celda}>
                        <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.05em' })}>AÑO</div>
                      </th>
                      {esTodosProy && (
                        <th style={celda}>
                          <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.05em' })}>PROYECTO</div>
                        </th>
                      )}
                      {/* VAL — promedio de las valoraciones del año */}
                      <th style={{ ...celda, width: 54 }}>
                        <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.05em' })}>VAL</div>
                      </th>
                      {MESES_RESUMEN.map(i => (
                        <th key={i} style={{ ...celda, width: 44 }}>
                          <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, padding: '2px 4px' })}>{MESES_ABR[i]}</div>
                        </th>
                      ))}
                      {['FOTO', 'DOC', 'EPS', 'CAL'].map(t => (
                        <th key={t} style={{ ...celda, width: 46 }}>
                          <div style={pastilla(VERDE, '#fff', { fontSize: 8.5, padding: '2px 4px' })}>{t}</div>
                        </th>
                      ))}
                      {['INF 1', 'INF 2'].map(t => (
                        <th key={t} style={{ ...celda, width: 46 }}>
                          <div style={pastilla(VERDE, '#fff', { fontSize: 8.5, padding: '2px 4px' })}>{t}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {atletasResumen.map(dep => {
                      const fila = resumenAnual[dep.id];
                      const tot  = totalAnual(dep.id);
                      const proy = proyectoDe(dep);
                      return (
                        <tr key={dep.id} className="group">
                          {/* Datos del deportista: texto suelto sobre el lienzo, sin pastilla */}
                          <td style={celda} className="text-center text-white font-semibold text-[11px] whitespace-nowrap px-2">
                            {fechaAfiliacionTexto(dep)}
                          </td>
                          <td style={celda} className="text-center text-white font-semibold text-[11px] whitespace-nowrap px-2">
                            {estadoDe(dep)}
                          </td>
                          <td style={celda}>
                            <div style={pastilla(VERDE, '#fff', { fontSize: 10.5, padding: '2px 8px' })}>
                              {getCol(dep, /^c[oó]d/i) || '—'}
                            </div>
                          </td>
                          <td style={celda} className="text-left whitespace-nowrap px-2">
                            <button
                              type="button"
                              onClick={() => abrirFicha(dep)}
                              title={esProfe
                                ? `Abrir la ficha de ${dep._nombre}`
                                : `Abrir el estado de cuenta de ${dep._nombre}`}
                              className="text-white font-semibold text-[12px] hover:text-[#00B050] hover:underline transition-colors cursor-pointer text-left w-full">
                              {dep._nombre}
                            </button>
                          </td>
                          <td style={celda} className="text-center text-white font-semibold text-[11px] whitespace-nowrap px-2">
                            {getCol(dep, /^a[ñn]o$/i)}
                          </td>
                          {esTodosProy && (
                            <td style={celda} className="text-center text-white font-semibold text-[11px] whitespace-nowrap px-2">
                              {proy === '__SIN_PROYECTO__' ? '—' : proy}
                            </td>
                          )}

                          {/* VAL — promedio del año. Se pone en la vista mensual. */}
                          <td style={celda}>
                            <div title={valAnio[dep.id] ? 'Promedio de las valoraciones del año' : 'Sin valoraciones este año'}
                              style={pastilla(valAnio[dep.id] ? VERDE : ROJO_CERO, '#fff', { fontSize: 11.5 })}>
                              {valAnio[dep.id] || ''}
                            </div>
                          </td>

                          <td style={separador} />

                          {/* Meses: pastilla clara si hubo asistencias, apagada si no aplica o aún no llega */}
                          {MESES_RESUMEN.map(i => {
                            const n  = fila?.[i] || 0;
                            const na = !mesAplica(dep, i);
                            const futuro = esMesFuturo(i);
                            let fondo = GRIS_VACIO, texto = '#ffffff', contenido: React.ReactNode = '';
                            let tam = 12;
                            if (na)            { contenido = 'N.A'; tam = 8.5; }
                            else if (n > 0)    { fondo = GRIS_DATO; texto = LIENZO; contenido = n; }
                            else if (futuro)   { contenido = ''; }
                            else               { fondo = ROJO_CERO; contenido = 0; }
                            return (
                              <td key={i} style={celda}>
                                <div style={pastilla(fondo, texto, { fontSize: tam })}>{contenido}</div>
                              </td>
                            );
                          })}

                          <td style={celda}>
                            <div style={pastilla(tot > 0 ? VERDE : GRIS_VACIO, '#fff', { fontSize: 12.5 })}>
                              {tot > 0 ? tot : ''}
                            </div>
                          </td>
                          <td style={celda}>
                            <div style={pastilla(AZUL_PCT, '#fff', { fontSize: 10.5 })}>
                              {porcentajeResumen(dep)}
                            </div>
                          </td>

                          {/* Documentos e informes: verde = listo, gris = pendiente */}
                          {([
                            ['__SEP__', false],
                            ['FOTO',  tieneFoto(dep)],
                            ['DOC',   tieneDoc(dep)],
                            ['EPS',   tieneEps(dep)],
                            ['CAL',   tieneCal(dep)],
                            ['__SEP__', false],
                            ['INF 1', tieneInf(dep, 1)],
                            ['INF 2', tieneInf(dep, 2)],
                            ['__SEP__', false],
                          ] as [string, boolean][]).map(([etiqueta, ok], idx) => (
                            etiqueta === '__SEP__' ? (
                              <td key={`sep-${idx}`} style={separador} />
                            ) : (
                              <td key={etiqueta} style={celda}>
                                <div title={`${etiqueta}: ${ok ? 'listo' : 'pendiente'}`}
                                  style={pastilla(ok ? VERDE : GRIS_VACIO, ok ? '#fff' : 'rgba(255,255,255,.55)', { fontSize: 8, padding: '2px 3px' })}>
                                  {ok ? etiqueta : ''}
                                </div>
                              </td>
                            )
                          ))}
                        </tr>
                      );
                    })}

                    {/* Sesiones realizadas por mes — solo con un proyecto concreto */}
                    {!esTodosProy && (
                    <tr>
                      <td colSpan={colsBaseResumen + 1} style={{ ...celda, paddingTop: 8 }}
                        className="text-left text-white font-bold text-[10px] uppercase tracking-widest whitespace-nowrap pl-2">
                        SES. REALIZADAS
                      </td>
                      <td style={separador} />
                      {MESES_RESUMEN.map(i => (
                        <td key={i} style={{ ...celda, paddingTop: 8 }}>
                          <div style={pastilla(AZUL_PCT, '#fff', { fontSize: 11.5 })}>{sesionesPorMes[i] || ''}</div>
                        </td>
                      ))}
                      <td style={{ ...celda, paddingTop: 8 }}>
                        <div style={pastilla(AZUL_PCT, '#fff', { fontSize: 11.5 })}>
                          {MESES_RESUMEN.reduce((a, i) => a + sesionesPorMes[i], 0) || ''}
                        </div>
                      </td>
                      <td style={{ ...celda, paddingTop: 8 }} />
                      <td style={separador} />
                      <td colSpan={4} style={{ ...celda, paddingTop: 8 }} />
                      <td style={separador} />
                      <td colSpan={2} style={{ ...celda, paddingTop: 8 }} />
                      <td style={separador} />
                    </tr>
                    )}

                    {/* ── FALTANTES ──────────────────────────────────────────────
                        Cuántos deportistas de la lista NO tienen cada documento o
                        informe. Verde = no falta ninguno. */}
                    <tr>
                      <td colSpan={colsBaseResumen + 1} style={{ ...celda, paddingTop: 6 }}
                        className="text-left text-white font-bold text-[10px] uppercase tracking-widest whitespace-nowrap pl-2">
                        FALTANTES
                      </td>
                      <td style={separador} />
                      <td colSpan={MESES_RESUMEN.length + 2} style={{ ...celda, paddingTop: 6 }} />
                      <td style={separador} />
                      {([
                        ['FOTO',  atletasResumen.filter(d => !tieneFoto(d)).length],
                        ['DOC',   atletasResumen.filter(d => !tieneDoc(d)).length],
                        ['EPS',   atletasResumen.filter(d => !tieneEps(d)).length],
                        ['CAL',   atletasResumen.filter(d => !tieneCal(d)).length],
                      ] as [string, number][]).map(([etiqueta, n]) => (
                        <td key={etiqueta} style={{ ...celda, paddingTop: 6 }}>
                          <div title={`${n} de ${atletasResumen.length} sin ${etiqueta}`}
                            style={pastilla(n === 0 ? VERDE : ROJO_CERO, '#fff', { fontSize: 11.5 })}>
                            {n}
                          </div>
                        </td>
                      ))}
                      <td style={separador} />
                      {([
                        ['INF 1', atletasResumen.filter(d => !tieneInf(d, 1)).length],
                        ['INF 2', atletasResumen.filter(d => !tieneInf(d, 2)).length],
                      ] as [string, number][]).map(([etiqueta, n]) => (
                        <td key={etiqueta} style={{ ...celda, paddingTop: 6 }}>
                          <div title={`${n} de ${atletasResumen.length} sin ${etiqueta}`}
                            style={pastilla(n === 0 ? VERDE : ROJO_CERO, '#fff', { fontSize: 11.5 })}>
                            {n}
                          </div>
                        </td>
                      ))}
                      <td style={separador} />
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        ) : !proyecto ? (
          <div className="rounded-xl border shadow-sm p-12 text-center" style={{ background: PANEL, borderColor: BORDE }}>
            <Users className="w-12 h-12 text-white/25 mx-auto mb-3" />
            <p className="text-white/55 font-semibold">Selecciona un proyecto</p>
          </div>
        ) : atletas.length === 0 ? (
          <div className="rounded-xl border shadow-sm p-12 text-center" style={{ background: PANEL, borderColor: BORDE }}>
            <p className="text-white/55 font-semibold">No hay deportistas en este proyecto</p>
          </div>
        ) : (
          <div className="rounded-2xl shadow-lg overflow-hidden inline-block max-w-full align-top" style={{ background: LIENZO }}>
            <div className="overflow-auto px-3 pb-3 pt-2" style={{ maxHeight: 'calc(100vh - 220px)' }}
              onScroll={e => { const l = e.currentTarget.scrollLeft > 8; setScrolledX(prev => prev === l ? prev : l); }}>
              <table style={{ width: 'max-content', borderCollapse: 'collapse' }}>
                <thead className="sticky top-0 z-20">
                  {/* Fila 1 · título y semanas, en blanco sobre el lienzo */}
                  <tr>
                    <th colSpan={esProfe ? 3 : 4}
                      style={{ ...celda, paddingBottom: 6, position: 'sticky', left: 0, zIndex: 25 }}
                      className="text-left text-white font-bold text-[13px] whitespace-nowrap pl-1">
                      ASISTENCIA {MESES[mes].toUpperCase()} {anio} / {proyecto}
                    </th>
                    <th rowSpan={2} style={separador} />
                    {gruposSemana.map((g, i) => {
                      const mc       = microcicloDe(g.sem);
                      const mcTexto  = String(mc).padStart(2, '0');
                      /* Con menos de 3 días no cabe el rótulo largo: se abrevia
                         y se parte en dos renglones para no ensanchar el día. */
                      const angosto  = g.count < 3;
                      return (
                        <React.Fragment key={i}>
                          {i > 0 && <th style={separador} />}
                          <th colSpan={g.count} style={{ ...celda, paddingBottom: 6 }}
                            className={
                              'text-center text-white font-bold tracking-wide '
                              + (angosto ? 'text-[10px] leading-tight' : 'text-[12px] whitespace-nowrap')
                            }>
                            SEM {g.semLabel}
                            {mc > 0 && (angosto ? (
                              <>
                                <br />
                                <span className="text-white/55 font-semibold">MC {mcTexto}</span>
                              </>
                            ) : (
                              <span className="text-white/55 font-semibold">
                                {' · MICROCICLO '}{mcTexto}
                              </span>
                            ))}
                          </th>
                        </React.Fragment>
                      );
                    })}
                    {/* Raya que separa la última semana del TOTAL y el % */}
                    <th rowSpan={2} style={separador} />

                    {/* Mismo alto que las pastillas de los días (38 px) y pegados
                        abajo, para que la fila de encabezados quede pareja. */}
                    <th rowSpan={2} style={{ ...celda, width: 46, verticalAlign: 'bottom' }}>
                      <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, letterSpacing: '.04em', padding: '3px 4px', minHeight: 38 })}>TOT</div>
                    </th>
                    <th rowSpan={2} style={{ ...celda, width: 50, verticalAlign: 'bottom' }}>
                      <div style={pastilla(VERDE, '#fff', { fontSize: 9.5, padding: '3px 4px', minHeight: 38 })}>%</div>
                    </th>
                    <th rowSpan={2} style={separador} />
                  </tr>

                  {/* Fila 2 · columnas y días, en pastilla verde */}
                  <tr>
                    <th style={styleCod(LIENZO, 15, movil)}>
                      <div style={pastilla(VERDE, '#fff', { fontSize: 9.5 })}>CÓD</div>
                    </th>
                    <th style={styleNom(LIENZO, 15, movil)}>
                      <div style={pastilla(VERDE, '#fff', { fontSize: 9.5 })}>NOMBRE</div>
                    </th>
                    {!esProfe && (
                      <th style={celda}>
                        <div style={pastilla(VERDE, '#fff', { fontSize: 9.5 })}>AÑO</div>
                      </th>
                    )}
                    {/* VAL — la valoración del mes, editable por el formador.
                        Se llamaba CAL y se confundía con las calificaciones
                        escolares del bloque DOCUMENTOS. — 23/08/2026 */}
                    <th style={{ ...celda, width: 62, minWidth: 62 }}>
                      <div style={pastilla(VERDE, '#fff', { fontSize: 9.5 })}>VAL</div>
                    </th>
                    {diasDelMes.map((d, idx) => {
                      const fk = d.toISOString().split('T')[0];
                      const cancelado = atletas.length > 0 && atletas.every(dep => estadoMap[dep.id]?.[fk] === 'CAN');
                      return (
                        <React.Fragment key={fk}>
                        {iniciosSemana.has(idx) && <th style={separador} />}
                        <th style={{ ...celda, width: 62, minWidth: 62 }}>
                          <div
                            onClick={esProfe ? () => cancelarDia(d) : undefined}
                            title={esProfe ? (cancelado ? `Deshacer cancelado ${d.getDate()}` : `Cancelar día ${d.getDate()}`) : undefined}
                            style={{
                              ...pastilla(cancelado ? GRIS_VACIO : VERDE, '#fff', { fontSize: 9.5, padding: '3px 4px' }),
                              flexDirection: 'column', gap: 1, minHeight: 38,
                              cursor: esProfe ? 'pointer' : 'default',
                            }}
                            className={esProfe ? 'hover:opacity-85 transition-opacity select-none' : 'select-none'}>
                            <span style={{ fontSize: 9 }}>{DIAS_INICIAL[JS_DIA_A_ISO(d.getDay()) - 1]}</span>
                            {cancelado
                              ? <span style={{ fontSize: 7.5, letterSpacing: '.04em' }}>✕CAN</span>
                              : <span style={{ fontSize: 15, lineHeight: 1 }}>{d.getDate()}</span>}
                          </div>
                        </th>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {atletas.map(dep => {
                    const cod = getCol(dep, /^c[oó]d/i);
                    const año = getCol(dep, /^a[ñn]o$/i);
                    const tot = totalesMap[dep.id];
                    return (
                      <tr key={dep.id}>
                        <td style={styleCod(LIENZO, 10, movil)}>
                          <div style={pastilla(VERDE, '#fff', { fontSize: 10, padding: '2px 6px' })}>{cod || '—'}</div>
                        </td>
                        {/* El nombre es un enlace, en otra pestaña, como en todo
                            listado de la plataforma (dirección, 27/08/2026).
                            Desde ADMINISTRACIÓN va derecho al estado de cuenta;
                            al formador, que no ve plata, le abre la ficha.
                            Otra pestaña porque de aquí no se puede sacar a nadie
                            en media planilla de asistencia. */}
                        <td style={styleNom(LIENZO, 10, movil)}
                          className="text-left whitespace-nowrap px-2">
                          <a
                            href={esProfe ? `/alumnos/${dep.id}` : `/alumnos/${dep.id}/estado-cuenta?edit=1`}
                            target="_blank" rel="noopener noreferrer"
                            title={esProfe
                              ? `Abrir la ficha de ${dep._nombre} en otra pestaña`
                              : `Abrir el estado de cuenta de ${dep._nombre} en otra pestaña`}
                            className="text-white font-semibold text-[12px] hover:underline">
                            {dep._nombre}
                          </a>
                        </td>
                        {!esProfe && (
                          <td style={celda} className="text-center text-white font-semibold text-[11px] whitespace-nowrap px-2">
                            {año}
                          </td>
                        )}

                        {/* VAL — ROJA mientras nadie la haya puesto, VERDE apenas
                            se elige una nota. Así se ve de un golpe a quién le
                            falta valoración este mes. — 23/08/2026 */}
                        <td style={celda}>
                          {esProfe && !mostrarRetirados ? (
                            <select
                              value={calMap[dep.id] ?? ''}
                              onChange={e => setCal(dep.id, e.target.value)}
                              title={calMap[dep.id] ? 'Valoración del mes' : 'Sin valorar — elige una nota'}
                              style={{
                                ...pastilla(calMap[dep.id] ? VERDE : ROJO_CERO, '#ffffff', { fontSize: 11.5 }),
                                width: '100%', border: 'none', cursor: 'pointer', appearance: 'none',
                                textAlign: 'center', textAlignLast: 'center',
                              }}>
                              {CAL_OPTIONS.map(o => (
                                <option key={o || '__'} value={o} style={{ color: '#111827', background: '#fff' }}>
                                  {o || '—'}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div style={pastilla(calMap[dep.id] ? VERDE : ROJO_CERO, '#fff', { fontSize: 11.5 })}>
                              {calMap[dep.id] || ''}
                            </div>
                          )}
                        </td>

                        <td style={separador} />
                        {diasDelMes.map((d, idx) => {
                          const fk = d.toISOString().split('T')[0];
                          return (
                            <React.Fragment key={fk}>
                              {iniciosSemana.has(idx) && <td style={separador} />}
                              <CeldaEstado
                                estado={estadoMap[dep.id]?.[fk] ?? ''}
                                onClick={() => toggleEstado(dep.id, d)}
                                readOnly={!esProfe || mostrarRetirados}
                              />
                            </React.Fragment>
                          );
                        })}
                        <td style={separador} />
                        <td style={celda}>
                          <div style={pastilla(tot > 0 ? VERDE : GRIS_VACIO, '#fff', { fontSize: 12.5 })}>
                            {tot > 0 ? tot : ''}
                          </div>
                        </td>
                        <td style={celda}>
                          <div style={pastilla(AZUL_PCT, '#fff', { fontSize: 10.5 })}>
                            {tot > 0 ? porcentaje(dep.id) : ''}
                          </div>
                        </td>
                        <td style={separador} />
                      </tr>
                    );
                  })}

                  {/* Sesiones realizadas */}
                  <tr>
                    <td colSpan={esProfe ? 3 : 4}
                      style={{ ...celda, paddingTop: 8, position: 'sticky', left: 0, zIndex: 10 }}
                      className="text-left text-white font-bold text-[10px] uppercase tracking-widest whitespace-nowrap pl-2">
                      SES. REALIZADAS
                    </td>
                    <td style={separador} />
                    {diasDelMes.map((d, idx) => {
                      const fk = d.toISOString().split('T')[0];
                      const realizado = atletas.some(dep => {
                        const e = estadoMap[dep.id]?.[fk] ?? '';
                        return e !== '' && e !== 'CAN' && e !== 'SE';
                      });
                      return (
                        <React.Fragment key={fk}>
                          {iniciosSemana.has(idx) && <td style={separador} />}
                          <td style={{ ...celda, paddingTop: 8 }}>
                            <div style={pastilla(realizado ? VERDE : GRIS_VACIO, '#fff', { fontSize: 11 })}>
                              {realizado ? '✓' : '✗'}
                            </div>
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td style={separador} />
                    <td style={{ ...celda, paddingTop: 8 }}>
                      <div style={pastilla(VERDE, '#fff', { fontSize: 12.5 })}>{sesionesRealizadas}</div>
                    </td>
                    <td style={{ ...celda, paddingTop: 8 }}>
                      <div style={pastilla(AZUL_PCT, '#fff', { fontSize: 9.5 })}>de {diasDelMes.length}</div>
                    </td>
                    <td style={separador} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 22/08/2026 — se retiró la barra de Inicio / Salir del fondo.
            Quedan solo los botones flotantes del costado derecho, iguales a
            los del resto de módulos. */}

      </main>

      {/* 22/08/2026 — este módulo tenía SUS PROPIOS botones de Inicio y Salir,
          además de la barra del fondo. Los dos se retiraron: los flotantes de
          <BotonInicioFlotante /> viven en layout.tsx y salen en toda la
          plataforma, así que aquí había tres pares haciendo lo mismo. */}

      {/* ── BOTÓN GUARDAR FLOTANTE ─────────────────────────── */}
      {esProfe && proyecto && !esResumen && atletas.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}>
          <button
            onClick={guardarAsistencia}
            disabled={guardando}
            style={{
              width: '100%',
              maxWidth: 480,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '16px 0',
              borderRadius: 18,
              border: 'none',
              cursor: guardando ? 'wait' : 'pointer',
              fontWeight: 900,
              fontSize: 17,
              letterSpacing: '0.03em',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              background: errorGuardar
                ? '#b45309'
                : guardado
                  ? '#15803d'
                  : hayCambios
                    ? '#dc2626'
                    : '#16a34a',
              color: '#fff',
              transition: 'background 0.2s',
            }}
          >
            {errorGuardar ? (
              <><Save style={{ width: 22, height: 22 }} /> ⚠️ ERROR — REINTENTAR</>
            ) : guardado ? (
              <><CheckCircle2 style={{ width: 22, height: 22 }} /> ¡ASISTENCIA GUARDADA!</>
            ) : guardando ? (
              <><Save style={{ width: 22, height: 22, animation: 'pulse 1s infinite' }} /> GUARDANDO...</>
            ) : hayCambios ? (
              <><Save style={{ width: 22, height: 22 }} /> GUARDAR CAMBIOS ⚠️</>
            ) : (
              <><Save style={{ width: 22, height: 22 }} /> GUARDAR ASISTENCIA</>
            )}
          </button>
          {errorGuardar && (
            <p style={{ textAlign: 'center', color: '#fcd34d', fontSize: 12, marginTop: 6, fontWeight: 700 }}>
              ❌ No se pudo guardar en el servidor. Revisa tu conexión y vuelve a intentarlo.
            </p>
          )}
          {hayCambios && !guardando && !guardado && !errorGuardar && (
            <p style={{ textAlign: 'center', color: '#fca5a5', fontSize: 12, marginTop: 6, fontWeight: 700 }}>
              ⚠️ Tienes cambios sin guardar — presiona el botón para no perderlos
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AsistenciaPage() {
  return (
    <Suspense>
      <AsistenciaErrorBoundary>
        <AsistenciaInner />
      </AsistenciaErrorBoundary>
    </Suspense>
  );
}
