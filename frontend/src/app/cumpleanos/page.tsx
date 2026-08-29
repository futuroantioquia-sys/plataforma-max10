'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Cake, RefreshCw, Download, Search, CalendarDays, Eye, MessageCircle, Check, Phone, X } from 'lucide-react';
import {
  getDeportistas, getIdsConFoto, getFotosPorIds, getCumpleEnviados, marcarCumpleEnviado,
  getTelefonosWhatsApp, guardarTelefonoWhatsApp, borrarTelefonoWhatsApp,
} from '@/lib/db';
import type { TelefonoWhatsApp } from '@/lib/db';
import type { Deportista } from '@/lib/db';

/* ── Helpers para leer columnas del deportista ── */
function colDe(dep: Deportista, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => rx.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}
const codigoDe   = (d: Deportista) => colDe(d, /^c[oó]d/i);
const programaDe = (d: Deportista) => colDe(d, /^program/i);
const proyectoDe = (d: Deportista) => colDe(d, /^proy/i);
const sedeDe     = (d: Deportista) => colDe(d, /^sede/i);
const profeDe    = (d: Deportista) => colDe(d, /^profe/i);
const estadoDe   = (d: Deportista) => colDe(d, /^estado$/i);
const celularDe  = (d: Deportista) =>
  colDe(d, /celular.*acud|acud.*celular/i) || colDe(d, /^n[uú]mero de celular|^celular|^tel/i);

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESES_CAP = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

/** ¿El deportista ya no está en la institución? (retirado, se fue, etc.)
 *  OJO (26/08/2026): "SOLICITA RETIRO" NO cuenta como retirado. Ese caso está
 *  EN ESTUDIO mientras se coordinan los pagos: el niño sigue activo y sigue
 *  cumpliendo años con nosotros. */
const esRetirado = (estado: string) => {
  const v = norm(estado);
  return /retir/.test(v) && !/solicit/.test(v);
};

/** Mes → número 1..12, acepta nombre en español o número. */
function mesNum(mesRaw: string): number {
  const m = norm(mesRaw);
  const i = MESES.indexOf(m);
  if (i >= 0) return i + 1;
  const n = parseInt(m.replace(/\D/g, ''), 10);
  return (n >= 1 && n <= 12) ? n : 0;
}
function diaNum(diaRaw: string): number {
  const n = parseInt(String(diaRaw ?? '').replace(/\D/g, ''), 10);
  return (n >= 1 && n <= 31) ? n : 0;
}
function anioNum(anioRaw: string): number {
  const n = parseInt(String(anioRaw ?? '').replace(/\D/g, ''), 10);
  return (n >= 1900 && n <= 2100) ? n : 0;
}
/** La foto puede venir con o sin el prefijo data:; devolvemos algo usable en <img>. */
function fotoSrc(b64?: string | null): string {
  if (!b64) return '';
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
}

type Cumple = {
  id: string; codigo: string; nombre: string; programa: string; proyecto: string;
  sede: string; profe: string; estado: string; celular: string;
  dia: number; mes: number; anio: number; edad: number | null; foto: string;
};
type DiaSemana = {
  clave: string;        // "8-19"  (mes-dia)
  fecha: Date;
  nombreDia: string;    // "Martes"
  prefijo: string;      // "HOY" | "MAÑANA" | "AYER" | "PASADO MAÑANA" | ""
  titulo: string;       // "HOY MARTES"  ·  "VIERNES"
  emoji: string;
  esHoy: boolean;
  dif: number;          // -3..+3 respecto de hoy
};

/** Nombres de los días, empezando en domingo (igual que Date.getDay()). */
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

/** Encuentra el encuadre de busto (cabeza + pecho) dentro de un recorte con transparencia. */
function encuadreBusto(capa: HTMLCanvasElement, aspecto: number, centroX = 0.5) {
  const w = capa.width, h = capa.height;
  const d = capa.getContext('2d')!.getImageData(0, 0, w, h).data;
  const minX = new Int32Array(h).fill(w), maxX = new Int32Array(h).fill(-1), n = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 40) { if (x < minX[y]) minX[y] = x; if (x > maxX[y]) maxX[y] = x; n[y]++; }
    }
  }
  let top = 0; while (top < h && n[top] < w * 0.012) top++;
  let bot = h - 1; while (bot > top && n[bot] < w * 0.012) bot--;
  const alto = Math.max(bot - top, 1);

  const muestras: number[] = [];
  for (let y = top; y < top + alto * 0.15; y++) if (maxX[y] >= minX[y]) muestras.push(maxX[y] - minX[y]);
  muestras.sort((a, b) => a - b);
  const anchoCabeza = muestras.length ? muestras[Math.floor(muestras.length / 2)] : w * 0.3;

  let hombros = Math.round(top + alto * 0.28);
  for (let y = top; y <= bot; y++) { if ((maxX[y] - minX[y]) > anchoCabeza * 1.65) { hombros = y; break; } }
  const altoCabeza = Math.max(hombros - top, alto * 0.12);

  const y0 = top - altoCabeza * 0.12;                          // un poco de aire arriba de la cabeza
  const y1 = Math.min(hombros + altoCabeza * 0.72, bot);      // corta bajo los escudos, sin el patrocinador

  let suma = 0, cont = 0;
  for (let y = top; y < hombros; y++) if (maxX[y] >= minX[y]) { suma += (minX[y] + maxX[y]) / 2; cont++; }
  const cx = cont ? suma / cont : w / 2;

  const sh = Math.max(y1 - y0, 10), sw = sh * aspecto;
  // centroX dice en qué parte del marco debe quedar el eje del deportista
  return { sx: cx - sw * centroX, sy: y0, sw, sh };
}

/** Dibuja el camino de un rectángulo de esquinas redondas.
 *  Se hace a mano porque `roundRect` no existe en los navegadores viejos y
 *  aquí hay papás entrando desde teléfonos de todo tipo. — 28/08/2026 */
function cajaRedonda(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radio = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.lineTo(x + w - radio, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radio);
  ctx.lineTo(x + w, y + h - radio);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radio, y + h);
  ctx.lineTo(x + radio, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radio);
  ctx.lineTo(x, y + radio);
  ctx.quadraticCurveTo(x, y, x + radio, y);
  ctx.closePath();
}

/** Deja el celular listo para WhatsApp: solo dígitos y con el 57 de Colombia. */
function celularWhatsApp(bruto: string): string {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('57') && d.length >= 12) return d;
  if (d.length === 10 && d.startsWith('3')) return '57' + d;
  if (d.length >= 10) return d;
  return '';
}

/* Los emojis se arman por código para que no dependan de cómo se guarde
   el archivo: así WhatsApp nunca recibe el rombo negro con interrogante. */
const EMO_REGALO = String.fromCodePoint(0x1F381);   // 🎁
const EMO_BALON  = String.fromCodePoint(0x26BD);    // ⚽
const EMO_MANOS  = String.fromCodePoint(0x1F64F);   // 🙏
const EMO_FIESTA = String.fromCodePoint(0x1F389);   // 🎉

/** Saludo que acompaña la tarjeta.
 *  `atrasado` = el cumpleaños ya pasó, así que la felicitación lo reconoce. */
function saludoCumple(nombre: string, edad: number | null, atrasado: boolean, retirado = false): string {
  const primer = (nombre || '').trim().split(/\s+/)[0] || '';
  const anios = edad && edad > 0 && edad < 100 ? ` en tus ${edad} años` : '';

  /* ── Texto para EXALUMNOS (deportistas retirados) ──
     Aunque ya no entrenen con nosotros, ese día se les manda su tarjeta.
     Si quieres cambiar las palabras, se cambian aquí abajo. */
  if (retirado) {
    const lineasEx = [`${EMO_REGALO} ¡Feliz cumpleaños, ${primer}!`];
    if (atrasado) {
      lineasEx.push(
        `${EMO_MANOS} Se nos pasó tu cumpleaños, pero *no se nos pasa acordarnos de ti.*`
      );
    }
    lineasEx.push(
      `${EMO_BALON} En *Futuro Antioquia* no olvidamos a los nuestros. Aunque hoy no estés entrenando con nosotros, siempre vas a ser parte de esta familia.`,
      `${EMO_FIESTA} Te deseamos un día muy especial${anios}, lleno de cosas buenas.`,
      `${EMO_MANOS} *Las puertas de la institución siempre van a estar abiertas para ti.*`
    );
    return lineasEx.join('\n\n');
  }

  const lineas = [
    `${EMO_REGALO} ¡Feliz cumpleaños, ${primer}!`,
  ];
  if (atrasado) {
    lineas.push(
      `${EMO_MANOS} Aunque se nos pasó tu cumpleaños, *jamás olvidaremos lo valioso que eres para nosotros.*`
    );
  }
  lineas.push(
    `${EMO_BALON} De parte de toda la familia *Futuro Antioquia* te deseamos un día muy especial${anios}.`,
    `${EMO_MANOS} *Gracias por hacernos parte de tu historia.*`
  );
  return lineas.join('\n\n');
}

/** Parte el nombre en dos líneas: nombres arriba, apellidos abajo. */
function partirNombre(nombre: string): [string, string] {
  const p = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return [p[0] || '', ''];
  if (p.length === 2) return [p[0], p[1]];
  if (p.length === 3) return [p[0], p.slice(1).join(' ')];
  return [p.slice(0, 2).join(' '), p.slice(2).join(' ')];
}

/* ── Calendario 3D dibujado por código (reemplaza el del arte) ── */
function rrEn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function CumpleanosPage() {
  const router = useRouter();
  const [deps, setDeps]     = useState<Deportista[]>([]);
  const [fotos, setFotos]   = useState<Record<string, string>>({});
  const [idsConFoto, setIdsConFoto] = useState<Set<string>>(new Set());
  const [fotosListas, setFotosListas] = useState(false);   // ya se sabe quién tiene foto
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');

  /* Vista: 'dias' = ayer/hoy/mañana (como siempre) · 1..12 = mes completo */
  const [vista, setVista] = useState<'dias' | 'fotos' | 'anio' | number>('dias');
  const [agruparPor, setAgruparPor] = useState<'proyecto' | 'profe' | 'sede' | 'programa'>('proyecto');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [sede, setSede]   = useState('');
  const [proyecto, setProyecto] = useState('');
  const [programa, setPrograma] = useState('');
  /* Estado: todos · solo activos · SOLO RETIRADOS.
     A los retirados también les llevamos el cronograma de cumpleaños y ese
     día se les manda su tarjeta, con un texto distinto. */
  /* Por defecto entra en SOLO ACTIVOS. Para ver retirados se cambia a mano aquí abajo. */
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'retirados'>('activos');
  /* ── LOS TRES DISEÑOS DE LA TARJETA (dirección, 28/08/2026) ──────────────
     'conFondo' · la foto tal cual, dentro del recuadro pequeño del cromo.
     'sinFondo' · se le quita el fondo al niño y queda sobre el arte.
     'grande'   · la foto ABARCA TODO el recuadro del Mundial 2026, y el
                  nombre y el club se conservan sobre una franja negra.
     Antes era un solo chulo de sí/no; ahora son tres opciones. */
  type Diseno = 'conFondo' | 'sinFondo' | 'grande';
  const [diseno, setDiseno] = useState<Diseno>('sinFondo');

  /* ── VISTA PREVIA DE LA TARJETA (dirección, 28/08/2026) ──────────────────
     El botón VER TARJETA abre esta ventana con la tarjeta ya armada. Ahí se
     cambia entre los tres diseños y se ve cuál queda mejor con la foto de ESE
     deportista, antes de bajarla o de mandarla por WhatsApp. */
  const [previa, setPrevia] = useState<Cumple | null>(null);
  const [previaDis, setPreviaDis] = useState<Diseno>('sinFondo');
  const [previaImg, setPreviaImg] = useState('');
  const [previaCargando, setPreviaCargando] = useState(false);

  /* ── CHULO VERDE: tarjetas que YA se enviaron por WhatsApp ──
     Se guarda por AÑO, así que cada 1 de enero la lista arranca limpia.
     OJO: descargar una tarjeta de prueba NO marca el chulo. Solo lo marca
     el botón de WhatsApp, o usted mismo haciendo clic en el chulo. */
  const ANIO = useMemo(() => new Date().getFullYear(), []);
  const [enviados, setEnviados] = useState<Set<string>>(new Set());

  /* ── TELÉFONO DE WHATSAPP CORREGIDO ──
     Cuando el celular de la ficha no tiene WhatsApp, aquí queda guardado el
     número bueno. No se toca la ficha: es un segundo teléfono de la
     institución, y lo ve cualquier computador del club. */
  const [telAlt, setTelAlt] = useState<Record<string, TelefonoWhatsApp>>({});
  const [editandoTel, setEditandoTel] = useState<Cumple | null>(null);
  const [borradorTel, setBorradorTel] = useState('');
  const [guardandoTel, setGuardandoTel] = useState(false);
  const clicTelRef = useRef<any>(null);

  /** El número que se va a usar de verdad: el corregido manda sobre el de la ficha. */
  const telefonoDe = useCallback(
    (c: Cumple) => (telAlt[c.id]?.telefono || c.celular || '').trim(),
    [telAlt]
  );

  const pedidasRef = useRef<Set<string>>(new Set());

  const cargar = useCallback(() => {
    setCargando(true);
    setFotosListas(false);
    pedidasRef.current = new Set();
    setFotos({});

    /** Pregunta quién tiene foto. Si vuelve vacío suele ser un fallo de red
     *  —no que nadie tenga foto—, así que reintenta un par de veces. */
    async function quienTieneFoto(): Promise<Set<string>> {
      for (let intento = 1; intento <= 3; intento++) {
        try {
          const ids = await getIdsConFoto();
          if (ids.size > 0) return ids;
        } catch { /* reintenta */ }
        await new Promise(r => setTimeout(r, 600 * intento));
      }
      return new Set<string>();
    }

    getCumpleEnviados(new Date().getFullYear())
      .then(setEnviados)
      .catch(() => {});

    getTelefonosWhatsApp()
      .then(setTelAlt)
      .catch(() => {});

    Promise.all([getDeportistas(), quienTieneFoto()])
      .then(([d, ids]) => { setDeps(d); setIdsConFoto(ids); setFotosListas(true); })
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Fechas de referencia (según el reloj del computador)
  const hoy = new Date();
  const claveDe = (d: Date) => `${d.getMonth() + 1}-${d.getDate()}`;
  const dAyer   = new Date(hoy); dAyer.setDate(hoy.getDate() - 1);
  const dManana = new Date(hoy); dManana.setDate(hoy.getDate() + 1);
  const claveHoy = claveDe(hoy), claveAyer = claveDe(dAyer), claveManana = claveDe(dManana);

  // Todos los cumpleaños calculados
  const cumples = useMemo<Cumple[]>(() => {
    return deps.map(dep => {
      const dia = diaNum(colDe(dep, /^d[ií]a$/i) || colDe(dep, /^d[ií]a\b/i));
      const mes = mesNum(colDe(dep, /^mes$/i) || colDe(dep, /^mes\b/i));
      const anio = anioNum(colDe(dep, /^a[ñn]o$/i) || colDe(dep, /^a[ñn]o\b/i));
      const edad = anio ? (hoy.getFullYear() - anio) : null;
      return {
        id: dep.id,
        codigo: codigoDe(dep),
        nombre: dep._nombre,
        programa: programaDe(dep),
        proyecto: proyectoDe(dep),
        sede: sedeDe(dep),
        profe: profeDe(dep),
        estado: estadoDe(dep),
        celular: celularDe(dep),
        dia, mes, anio, edad,
        foto: fotoSrc(dep.foto || fotos[dep.id]),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, fotos]);

  /** ¿Pasa el filtro de estado (todos / solo activos / solo retirados)? */
  const pasaEstado = useCallback((c: Cumple) => {
    if (filtroEstado === 'activos')   return norm(c.estado) === 'activo';
    if (filtroEstado === 'retirados') return esRetirado(c.estado);
    return true;
  }, [filtroEstado]);

  /* Lista de sedes para el desplegable */
  /* ── Desplegables encadenados ─────────────────────────────────
     Cada lista muestra SOLO lo que existe con los otros filtros puestos.
     Ej.: al elegir el programa DESARROLLO, el desplegable de proyectos
     deja de mostrar los proyectos que no pertenecen a ese programa.   */
  const pasaBase = useCallback(
    (c: Cumple, excepto: 'sede' | 'proyecto' | 'programa' | null) => {
      if (!pasaEstado(c)) return false;
      if (excepto !== 'sede'     && sede     && c.sede     !== sede)     return false;
      if (excepto !== 'proyecto' && proyecto && c.proyecto !== proyecto) return false;
      if (excepto !== 'programa' && programa && c.programa !== programa) return false;
      return true;
    },
    [sede, proyecto, programa, pasaEstado]
  );

  const ordenar = (v: string[]) => v.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  const sedes = useMemo(
    () => ordenar(Array.from(new Set(cumples.filter(c => pasaBase(c, 'sede')).map(c => c.sede).filter(Boolean)))),
    [cumples, pasaBase]
  );
  const proyectos = useMemo(
    () => ordenar(Array.from(new Set(cumples.filter(c => pasaBase(c, 'proyecto')).map(c => c.proyecto).filter(Boolean)))),
    [cumples, pasaBase]
  );
  const programas = useMemo(
    () => ordenar(Array.from(new Set(cumples.filter(c => pasaBase(c, 'programa')).map(c => c.programa).filter(Boolean)))),
    [cumples, pasaBase]
  );

  /* Si un filtro elegido deja de existir tras cambiar otro, se limpia solo */
  useEffect(() => {
    if (sede     && sedes.length      && !sedes.includes(sede))          setSede('');
    if (proyecto && proyectos.length  && !proyectos.includes(proyecto))  setProyecto('');
    if (programa && programas.length  && !programas.includes(programa))  setPrograma('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedes, proyectos, programas]);

  /** Filtros comunes: búsqueda + sede + proyecto + programa + estado */
  const pasaFiltros = useCallback((c: Cumple) => {
    const t = norm(q);
    if (t && !norm(c.nombre).includes(t) && !c.codigo.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (sede && c.sede !== sede) return false;
    if (proyecto && c.proyecto !== proyecto) return false;
    if (programa && c.programa !== programa) return false;
    if (!pasaEstado(c)) return false;
    return true;
  }, [q, sede, proyecto, programa, pasaEstado]);

  /* ── LA SEMANA COMPLETA: lunes → domingo ──────────────────────────
     Se arma con la fecha del computador. El día de hoy queda destacado y
     los días vecinos llevan su palabra al frente (HOY, MAÑANA, AYER,
     PASADO MAÑANA); los más lejanos solo llevan el nombre del día.      */
  const semana = useMemo<DiaSemana[]>(() => {
    const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const lunes = new Date(base);
    lunes.setDate(base.getDate() - ((base.getDay() + 6) % 7));   // domingo(0) → retrocede 6
    return Array.from({ length: 7 }, (_, i) => {
      const f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
      const dif = Math.round((f.getTime() - base.getTime()) / 86400000);
      const nombreDia = DIAS_SEMANA[f.getDay()];
      const prefijo =
        dif === 0 ? 'HOY' :
        dif === 1 ? 'MAÑANA' :
        dif === -1 ? 'AYER' :
        dif === 2 ? 'PASADO MAÑANA' : '';
      const emoji =
        dif === 0 ? '🎂' :
        dif > 0 ? '⏭️' : '⏮️';
      return {
        clave: `${f.getMonth() + 1}-${f.getDate()}`,
        fecha: f,
        nombreDia,
        prefijo,
        titulo: (prefijo ? `${prefijo} ${nombreDia}` : nombreDia).toUpperCase(),
        emoji,
        esHoy: dif === 0,
        dif,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveHoy]);

  /** Cumpleaños de cada día de la semana, ya filtrados y ordenados por nombre. */
  const bucketsSemana = useMemo(() => {
    const res: Record<string, Cumple[]> = {};
    semana.forEach(d => { res[d.clave] = []; });
    cumples.forEach(c => {
      if (!c.dia || !c.mes) return;
      const k = `${c.mes}-${c.dia}`;
      if (res[k]) res[k].push(c);
    });
    Object.keys(res).forEach(k => {
      res[k] = res[k].filter(pasaFiltros).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    });
    return res;
  }, [cumples, pasaFiltros, semana]);

  const totalSemana = useMemo(
    () => semana.reduce((n, d) => n + (bucketsSemana[d.clave]?.length ?? 0), 0),
    [semana, bucketsSemana]
  );

  /* Lista completa del mes elegido, ordenada por día */
  const listaMes = useMemo(() => {
    if (vista === 'dias' || vista === 'fotos') return [] as Cumple[];
    if (vista === 'anio') {
      return cumples
        .filter(c => c.mes > 0 && c.dia > 0)
        .filter(pasaFiltros)
        .sort((a, b) => a.mes - b.mes || a.dia - b.dia || a.nombre.localeCompare(b.nombre, 'es'));
    }
    return cumples
      .filter(c => c.mes === vista && c.dia > 0)
      .filter(pasaFiltros)
      .sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre, 'es'));
  }, [cumples, vista, pasaFiltros]);

  /* ── CONTROL DE FOTOS: cuántos tienen, quiénes faltan y por quién preguntar ── */
  const universo = useMemo(() => cumples.filter(pasaFiltros), [cumples, pasaFiltros]);
  const conFotoTotal = useMemo(() => universo.filter(c => idsConFoto.has(c.id)).length, [universo, idsConFoto]);
  const sinFotoTotal = universo.length - conFotoTotal;
  const pctFoto = universo.length ? Math.round((conFotoTotal / universo.length) * 100) : 0;

  const ETIQUETA_GRUPO: Record<string, string> = {
    proyecto: 'Proyecto', profe: 'Profesor', sede: 'Sede', programa: 'Programa',
  };

  const grupos = useMemo(() => {
    const mapa = new Map<string, { total: number; sin: Cumple[] }>();
    universo.forEach(c => {
      const clave = String((c as any)[agruparPor] || '').trim() || '(sin asignar)';
      if (!mapa.has(clave)) mapa.set(clave, { total: 0, sin: [] });
      const g = mapa.get(clave)!;
      g.total += 1;
      if (!idsConFoto.has(c.id)) g.sin.push(c);
    });
    return Array.from(mapa.entries())
      .map(([nombre, g]) => ({
        nombre,
        total: g.total,
        sin: g.sin.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      }))
      .sort((a, b) => b.sin.length - a.sin.length || a.nombre.localeCompare(b.nombre, 'es'));
  }, [universo, agruparPor, idsConFoto]);

  /** Copia la lista de faltantes lista para pegar en WhatsApp. */
  function copiarGrupo(g: { nombre: string; sin: Cumple[] }) {
    const texto =
      `FALTA SUBIR LA FOTO — ${ETIQUETA_GRUPO[agruparPor]}: ${g.nombre}\n` +
      `${g.sin.length} deportista(s) pendiente(s)\n\n` +
      g.sin.map((c, i) => `${i + 1}. ${c.codigo || '—'}  ${c.nombre}`).join('\n');
    try { navigator.clipboard?.writeText(texto); } catch { /* noop */ }
    setCopiado(g.nombre);
    setTimeout(() => setCopiado(null), 1800);
  }

  /* Lo que está a la vista ahora mismo */
  const visibles = useMemo(
    () => vista === 'dias' ? semana.flatMap(d => bucketsSemana[d.clave] ?? [])
         : vista === 'fotos' ? [] as Cumple[]
         : listaMes,
    [vista, semana, bucketsSemana, listaMes]
  );

  /* Trae las fotos SOLO de lo que se está viendo, en tandas, sin repetir */
  useEffect(() => {
    const faltan = visibles
      .filter(c => idsConFoto.has(c.id) && !pedidasRef.current.has(c.id))
      .map(c => c.id);
    if (faltan.length === 0) return;
    faltan.forEach(id => pedidasRef.current.add(id));

    let cancelado = false;
    (async () => {
      for (let i = 0; i < faltan.length; i += 6) {
        const lote = await getFotosPorIds(faltan.slice(i, i + 6));
        if (cancelado) return;
        if (Object.keys(lote).length) setFotos(prev => ({ ...prev, ...lote }));
      }
    })();
    return () => { cancelado = true; };
  }, [visibles, idsConFoto]);

  /* ─────────────────────────────────────────────────────────────
     GENERACIÓN DE LA TARJETA (PNG)
     Usa tu arte como fondo: public/cumpleanos-plantilla.png
     y encima pone la FOTO, el MES, el DÍA y el NOMBRE.
  ───────────────────────────────────────────────────────────── */
  const [generando, setGenerando] = useState<string | null>(null);

  /** Deja constancia de que la tarjeta de este deportista YA se envió.
   *  El chulo se pinta de una y después se guarda en la base de datos,
   *  para que lo vea cualquier computador del club. */
  function apuntarEnviado(c: Cumple, enviado: boolean) {
    setEnviados(prev => {
      const s = new Set(prev);
      if (enviado) s.add(c.id); else s.delete(c.id);
      return s;
    });
    marcarCumpleEnviado(c.id, ANIO, enviado, { codigo: c.codigo, nombre: c.nombre })
      .catch(() => {});
  }

  /* ── DOBLE CLIC EN EL BOTÓN DE WHATSAPP ──
     Un clic manda la tarjeta. Dos clics abren la ventanita para ver y
     corregir el número. Por eso el envío espera un instante: si llega el
     segundo clic, se cancela el envío y se abre la ventanita. */
  function clicWhatsApp(c: Cumple) {
    /* SIN NÚMERO BUENO: no hay nada que enviar. Un solo clic abre de una la
       ventanita para escribir el celular correcto, sin esperar el doble clic.
       (Dirección, 25/08/2026: el botón se pinta de rojo en ese caso.) */
    if (!celularWhatsApp(telefonoDe(c))) { abrirEditorTel(c); return; }
    if (clicTelRef.current) return;                 // ya hay un clic esperando
    clicTelRef.current = setTimeout(() => {
      clicTelRef.current = null;
      descargarTarjeta(c, 'whatsapp');
    }, 280);
  }

  function abrirEditorTel(c: Cumple) {
    if (clicTelRef.current) { clearTimeout(clicTelRef.current); clicTelRef.current = null; }
    setBorradorTel(telefonoDe(c));
    setEditandoTel(c);
  }

  async function guardarTel() {
    const c = editandoTel;
    if (!c) return;
    const limpio = borradorTel.replace(/[^\d+]/g, '').trim();
    if (!celularWhatsApp(limpio)) {
      alert('Ese número no parece un celular válido.\n\nEscríbelo con los 10 dígitos, por ejemplo: 3001234567');
      return;
    }
    setGuardandoTel(true);
    const ok = await guardarTelefonoWhatsApp(c.id, limpio, {
      codigo: c.codigo, nombre: c.nombre, telefonoFicha: c.celular,
    });
    setGuardandoTel(false);
    if (!ok) { alert('No se pudo guardar el número. Revisa el internet e intenta de nuevo.'); return; }
    setTelAlt(prev => ({
      ...prev,
      [c.id]: {
        deportistaId: c.id, telefono: limpio, telefonoFicha: c.celular,
        nota: '', actualizadoEn: new Date().toISOString(),
      },
    }));
    setEditandoTel(null);
  }

  async function quitarTel() {
    const c = editandoTel;
    if (!c) return;
    if (!confirm('¿Volver a usar el celular que está en la ficha?')) return;
    setGuardandoTel(true);
    await borrarTelefonoWhatsApp(c.id);
    setGuardandoTel(false);
    setTelAlt(prev => { const s = { ...prev }; delete s[c.id]; return s; });
    setEditandoTel(null);
  }

  /** Clic en el chulo: marcar o desmarcar a mano. */
  function alternarEnviado(c: Cumple) {
    const yaEstaba = enviados.has(c.id);
    if (yaEstaba && !confirm(`¿Quitar la marca de enviado de ${c.nombre}?`)) return;
    apuntarEnviado(c, !yaEstaba);
  }

  /* ── RECORTE DEL FONDO (MediaPipe Selfie Segmentation, servido desde /mediapipe) ──
     Corre dentro del navegador: la foto NO sale a ningún servidor externo.
     Si por lo que sea no carga, la tarjeta se hace con la foto tal cual. */
  const segRef = useRef<any>(null);

  function cargarScript(src: string) {
    return new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('no script'));
      document.head.appendChild(s);
    });
  }

  async function getSegmentador(): Promise<any> {
    if (segRef.current) return segRef.current;
    await cargarScript('/mediapipe/selfie_segmentation.js');
    const Clase = (window as any).SelfieSegmentation;
    if (!Clase) throw new Error('sin segmentador');
    const seg = new Clase({ locateFile: (f: string) => `/mediapipe/${f}` });
    seg.setOptions({ modelSelection: 0, selfieMode: false });  // 0 = modelo general (mejor para fotos verticales)
    await seg.initialize();
    segRef.current = seg;
    return seg;
  }

  /** Devuelve un lienzo con la persona recortada (fondo transparente). */
  async function recortarPersona(img: HTMLImageElement): Promise<HTMLCanvasElement> {
    const seg = await getSegmentador();
    const mascara: HTMLCanvasElement = await new Promise((resolve, reject) => {
      const tiempo = setTimeout(() => reject(new Error('tardo demasiado')), 15000);
      seg.onResults((res: any) => {
        clearTimeout(tiempo);
        const m = res?.segmentationMask;
        if (!m) return reject(new Error('sin mascara'));
        const mc = document.createElement('canvas');
        mc.width = img.width; mc.height = img.height;
        mc.getContext('2d')!.drawImage(m, 0, 0, mc.width, mc.height);
        resolve(mc);
      });
      seg.send({ image: img }).catch(reject);
    });

    // Se "come" unos pixeles del borde (erosión) para eliminar el halo claro
    // que deja el fondo original, y luego se suaviza el filo.
    const mordida = Math.max(2, Math.round(Math.min(img.width, img.height) * 0.006));
    const mFinal = document.createElement('canvas');
    mFinal.width = img.width; mFinal.height = img.height;
    const mctx = mFinal.getContext('2d')!;
    mctx.drawImage(mascara, 0, 0);
    mctx.globalCompositeOperation = 'destination-in';
    [[mordida, 0], [-mordida, 0], [0, mordida], [0, -mordida],
     [mordida, mordida], [-mordida, -mordida]].forEach(([dx, dy]) => mctx.drawImage(mascara, dx, dy));
    mctx.globalCompositeOperation = 'source-over';

    const mSuave = document.createElement('canvas');
    mSuave.width = img.width; mSuave.height = img.height;
    const sctx = mSuave.getContext('2d')!;
    sctx.filter = `blur(${Math.max(1, Math.round(mordida * 0.35))}px)`;  // filo definido
    sctx.drawImage(mFinal, 0, 0);
    sctx.filter = 'none';

    const out = document.createElement('canvas');
    out.width = img.width; out.height = img.height;
    const octx = out.getContext('2d')!;
    octx.drawImage(img, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(mSuave, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    return out;
  }

  /** Silueta negra del recorte, para el reborde difuminado oscuro. */
  function siluetaNegra(capa: HTMLCanvasElement): HTMLCanvasElement {
    const s = document.createElement('canvas');
    s.width = capa.width; s.height = capa.height;
    const sc = s.getContext('2d')!;
    sc.drawImage(capa, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#000000';
    sc.fillRect(0, 0, s.width, s.height);
    sc.globalCompositeOperation = 'source-over';
    return s;
  }

  const cargarImg = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('no img'));
    img.src = src;
  });

  /** Arma la tarjeta y devuelve el lienzo, SIN entregarla.
   *  Lo usan la vista previa, la descarga y el envío por WhatsApp: los tres
   *  dibujan exactamente lo mismo, así que lo que se ve en la previa es lo
   *  que se manda. — dirección, 28/08/2026 */
  async function armarLienzo(c: Cumple, dis: Diseno): Promise<{ lienzo: HTMLCanvasElement; fondoOk: boolean }> {
    const sinFondo = dis === 'sinFondo';
    {
      // Si el deportista tiene foto pero todavía no llegó, la pedimos ahora mismo
      let foto = c.foto;
      if (!foto && idsConFoto.has(c.id)) {
        const lote = await getFotosPorIds([c.id]);
        if (lote[c.id]) {
          foto = fotoSrc(lote[c.id]);
          setFotos(prev => ({ ...prev, ...lote }));
        }
      }

      // Lienzo del tamaño exacto del arte (vertical)
      const W = 873, H = 1123;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      /* ── Medidas del arte del caramelo (868 x 1123) ── */
      const ZONA = { x: 46, y: 26, w: 344, h: 510 };   // recuadro recto: corta brazos y hombros
      const CAL  = { cx: 698, cy: 267, ang: -6.4 };    // calendario
      const EDAD = { cx: 700, cy: 432, ang: -6 };      // "¡HOY CUMPLES ...!"
      const NOM  = { cx: 212, y1: 562, y2: 588, ancho: 320 };

      /* DISEÑO GRANDE: la foto llena TODO el cromo del Mundial 2026.
         El cromo por dentro va de (20,20) a (500,664).
         — dirección, 28/08/2026 */
      /* OJO CON LAS MEDIDAS: el cromo del arte tiene un marco negro delgadito
         alrededor (de 14 a 19 por fuera del teal). Si el fondo nuevo empieza
         en 20, ese marco queda asomando por los bordes como una tira de
         pixeles viejos. Por eso se arranca en 13 y se tapa completo.
         — dirección, 28/08/2026 */
      const CROMO  = { x: 13, y: 13, w: 496, h: 660 };
      /* El cromo lleva un FONDO DEGRADADO de negro arriba a verde abajo
         (el verde de la casa, #00B050), y la foto va adentro con su margen:
         foto arriba, y debajo el nombre grande con los apellidos más
         pequeños. — dirección, 28/08/2026 */
      const MARGEN = Math.round(CROMO.w * 0.03);
      const FOTO_G = {
        x: CROMO.x + MARGEN,
        y: CROMO.y + MARGEN,
        w: CROMO.w - MARGEN * 2,
        h: Math.round(CROMO.h * 0.881) - MARGEN,
      };
      /* La pastilla verde con el nombre, abajo del todo. */
      const BANDA = {
        x: CROMO.x + MARGEN,
        y: CROMO.y + Math.round(CROMO.h * 0.894),
        w: CROMO.w - MARGEN * 2,
        h: Math.round(CROMO.h * 0.091),
      };
      const REDONDO = { cromo: 22, foto: 13, banda: 15 };
      const grande = dis === 'grande';
      const CAJA = grande ? FOTO_G : ZONA;

      // 1) Fondo: el arte del caramelo
      let fondoOk = false;
      try {
        const bg = await cargarImg('/cumpleanos-plantilla.png?v=6');   // ?v= evita que el navegador use la versión vieja guardada
        ctx.drawImage(bg, 0, 0, W, H);
        fondoOk = true;
      } catch {
        ctx.fillStyle = '#0b2233'; ctx.fillRect(0, 0, W, H);
      }

      // 1b) En el diseño GRANDE el cromo entero se pinta de negro: encima va
      //     la foto con su margen y debajo el nombre. — 28/08/2026
      if (grande) {
        /* Tarjeta NEGRA de esquinas redondas: tapa por completo el cromo del
           arte. Encima va la foto y abajo la pastilla verde con el nombre.
           — dirección, 28/08/2026 */
        ctx.fillStyle = '#000000';
        cajaRedonda(ctx, CROMO.x, CROMO.y, CROMO.w, CROMO.h, REDONDO.cromo);
        ctx.fill();
      }

      // 2) El deportista: recortado sin fondo y encuadrado de cabeza y pecho
      if (foto) {
        try {
          const img = await cargarImg(foto);

          // Se recorta el fondo del niño y con esa silueta se calcula el encuadre.
          let capa: HTMLCanvasElement | HTMLImageElement = img;
          let enc: { sx: number; sy: number; sw: number; sh: number };
          const proporcion = CAJA.w / CAJA.h;
          /* EL ENCUADRE SIEMPRE SALE DE LA SILUETA (dirección, 28/08/2026).
             Antes, si la tarjeta iba CON FONDO, ni se buscaba la silueta y el
             recorte se hacía a ciegas —"la mitad de arriba de la foto"—: por
             eso unas quedaban espectaculares y otras no. Ahora la silueta se
             calcula siempre, aunque el fondo se conserve: sirve para saber
             dónde está la cabeza y dónde los hombros, y así el corte queda
             igual en todas: un poco arriba de la cabeza y hasta los escudos.
             La silueta solo se DIBUJA cuando el diseño es SIN FONDO. */
          try {
            const silueta = await recortarPersona(img);
            if (sinFondo) capa = silueta;                     // va sin fondo
            enc = encuadreBusto(silueta, proporcion, 0.5);
          } catch {
            /* No se pudo hallar la silueta (foto rara o sin señal): se usa la
               foto completa, corrida un poco hacia arriba, que es donde casi
               siempre está la cara. Nunca se recorta a ciegas la mitad. */
            let sh = img.height;
            let sw = sh * proporcion;
            if (sw > img.width) { sw = img.width; sh = sw / proporcion; }
            enc = {
              sx: (img.width - sw) / 2,
              sy: Math.max(0, (img.height - sh) * 0.15),
              sw,
              sh,
            };
          }

          // El deportista, encuadrado en su recuadro (el pequeño o todo el cromo)
          ctx.save();
          if (grande) cajaRedonda(ctx, CAJA.x, CAJA.y, CAJA.w, CAJA.h, REDONDO.foto);
          else { ctx.beginPath(); ctx.rect(CAJA.x, CAJA.y, CAJA.w, CAJA.h); }
          ctx.clip();
          ctx.drawImage(capa, enc.sx, enc.sy, enc.sw, enc.sh, CAJA.x, CAJA.y, CAJA.w, CAJA.h);
          ctx.restore();
        } catch { /* sin foto */ }
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 3) Nombre del deportista
      const [linea1, linea2] = partirNombre(c.nombre);
      ctx.fillStyle = '#ffffff';

      if (grande) {
        /* DISEÑO GRANDE — tal cual el modelo de la dirección (28/08/2026):
           tarjeta negra de esquinas redondas, la foto arriba, y abajo una
           pastilla VERDE con el nombre completo en un solo renglón. */
        ctx.fillStyle = '#00B050';
        cajaRedonda(ctx, BANDA.x, BANDA.y, BANDA.w, BANDA.h, REDONDO.banda);
        ctx.fill();

        const completo = [linea1, linea2].filter(Boolean).join(' ').toUpperCase();
        const anchoTexto = BANDA.w - 28;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        let g1 = 26;
        do { ctx.font = `700 ${g1}px Arial, sans-serif`; if (ctx.measureText(completo).width <= anchoTexto) break; g1 -= 1; } while (g1 > 10);
        ctx.fillText(completo, BANDA.x + BANDA.w / 2, BANDA.y + BANDA.h / 2 + 1);

      } else {
        let f1 = 32;
        do { ctx.font = `700 ${f1}px Arial, sans-serif`; if (ctx.measureText(linea1).width <= NOM.ancho) break; f1 -= 1; } while (f1 > 12);
        ctx.fillText(linea1, NOM.cx, NOM.y1);
        if (linea2) {
          let f2 = 22;
          do { ctx.font = `400 ${f2}px Arial, sans-serif`; if (ctx.measureText(linea2).width <= NOM.ancho) break; f2 -= 1; } while (f2 > 10);
          ctx.fillText(linea2, NOM.cx, NOM.y2);
        }
      }

      // 4) Fecha dentro del calendario (sigue su inclinación)
      let diaSemana = '';
      try {
        const f = new Date(hoy.getFullYear(), c.mes - 1, c.dia);
        if (f.getMonth() === c.mes - 1) diaSemana = f.toLocaleDateString('es-CO', { weekday: 'long' }).toUpperCase();
      } catch { /* sin día de la semana */ }

      ctx.save();
      ctx.translate(CAL.cx, CAL.cy);
      ctx.rotate(CAL.ang * Math.PI / 180);
      const mesTxt = (MESES_CAP[c.mes - 1] ?? '').toUpperCase();
      let fm = 38;
      do { ctx.font = `700 ${fm}px Arial, sans-serif`; if (ctx.measureText(mesTxt).width <= 190) break; fm -= 1; } while (fm > 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(mesTxt, 0, -105);
      ctx.fillStyle = '#141414';
      ctx.font = '400 84px Arial, sans-serif';
      ctx.fillText(String(c.dia || ''), 0, -15);
      if (diaSemana) {
        let fd = 26;
        do { ctx.font = `400 ${fd}px Arial, sans-serif`; if (ctx.measureText(diaSemana).width <= 185) break; fd -= 1; } while (fd > 10);
        ctx.fillText(diaSemana, 0, 52);
      }
      ctx.restore();

      // 5) "¡HOY CUMPLES X AÑOS!"
      if (c.edad != null && c.edad > 0 && c.edad < 100) {
        ctx.save();
        ctx.translate(EDAD.cx, EDAD.cy);
        ctx.rotate(EDAD.ang * Math.PI / 180);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 32px Arial, sans-serif';
        ctx.fillText('¡HOY CUMPLES', 0, 0);
        ctx.fillText(`${c.edad} AÑOS!`, 0, 42);
        ctx.restore();
      }
      ctx.textBaseline = 'alphabetic';

      return { lienzo: canvas, fondoOk };
    }
  }

  /** Entrega la tarjeta: la baja al computador o la manda por WhatsApp. */
  async function descargarTarjeta(
    c: Cumple,
    accion: 'descargar' | 'whatsapp' = 'descargar',
    dis: Diseno = diseno,
  ) {
    setGenerando(c.id);
    try {
      const { lienzo, fondoOk } = await armarLienzo(c, dis);
      const nombreArchivo = `cumple-${c.codigo || c.nombre}.png`;

      if (accion === 'whatsapp') {
        await enviarPorWhatsApp(c, lienzo, nombreArchivo);
      } else {
        const url = lienzo.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a); a.click(); a.remove();
      }

      if (!fondoOk) {
        alert('La tarjeta se generó, pero aún falta subir el arte de fondo (cumpleanos-plantilla.png).');
      }
    } catch (e) {
      alert('No se pudo generar la tarjeta. Intenta de nuevo.');
    } finally {
      setGenerando(null);
    }
  }

  /** Manda la tarjeta al acudiente por WhatsApp.
   *  En celular abre el menú de compartir con la imagen adjunta.
   *  En computador descarga la imagen y abre el chat con el saludo escrito,
   *  para que solo haya que arrastrar la foto. */
  async function enviarPorWhatsApp(c: Cumple, lienzo: HTMLCanvasElement, nombreArchivo: string) {
    // ¿El cumpleaños ya pasó este año? Entonces la felicitación va como atrasada.
    const hoyRef = new Date();
    const fechaCumple = new Date(hoyRef.getFullYear(), c.mes - 1, c.dia);
    const soloDia = new Date(hoyRef.getFullYear(), hoyRef.getMonth(), hoyRef.getDate());
    const atrasado = c.mes > 0 && c.dia > 0 && fechaCumple.getTime() < soloDia.getTime();

    // A los retirados les va el saludo de exalumno.
    const texto = saludoCumple(c.nombre, c.edad, atrasado, esRetirado(c.estado));
    const tel = celularWhatsApp(telefonoDe(c));

    const blob: Blob | null = await new Promise(res => lienzo.toBlob(b => res(b), 'image/png'));

    // En CELULAR conviene el menú de compartir: la imagen va adjunta.
    // En COMPUTADOR conviene el chat directo, porque así el número del acudiente
    // queda preseleccionado (los papás casi nunca están en los contactos).
    const esCelular = typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (esCelular && blob && (navigator as any).canShare) {
      const archivo = new File([blob], nombreArchivo, { type: 'image/png' });
      if ((navigator as any).canShare({ files: [archivo] })) {
        try {
          await (navigator as any).share({ files: [archivo], text: texto });
          apuntarEnviado(c, true);      // ✔ queda con chulo verde
          return;
        } catch { /* si cancela o falla, seguimos por el otro camino */ }
      }
    }

    // Camino de computador: copiar la imagen al portapapeles + descargarla,
    // y abrir el chat con el texto ya escrito. Así solo hay que pegar con Ctrl+V.
    let copiada = false;
    if (blob && typeof navigator !== 'undefined' && (navigator as any).clipboard?.write) {
      try {
        await (navigator as any).clipboard.write([
          new (window as any).ClipboardItem({ 'image/png': blob }),
        ]);
        copiada = true;
      } catch { /* algunos navegadores no lo permiten */ }
    }
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombreArchivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    if (!tel) {
      alert('Este deportista no tiene un número de WhatsApp válido.\n\nLa tarjeta se descargó para que la envíes a mano.\n\nSi conoces otro número, haz DOBLE CLIC en el botón verde de WhatsApp para escribirlo.');
      return;
    }
    // web.whatsapp.com/send entra directo al chat (wa.me mostraba la página
    // intermedia de "abrir WhatsApp"). El nombre de ventana 'whatsappFA' hace
    // que siempre se reutilice la misma pestaña en vez de abrir una nueva.
    const enlace = esCelular
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://web.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(texto)}`;
    window.open(enlace, 'whatsappFA');
    apuntarEnviado(c, true);           // ✔ queda con chulo verde
    setTimeout(() => {
      alert(copiada
        ? 'Se abrió el chat con el saludo escrito.\n\nLa tarjeta quedó COPIADA: haz clic en la caja de texto de WhatsApp y presiona Ctrl + V para pegarla.'
        : 'Se abrió el chat con el saludo escrito.\n\nLa tarjeta se descargó: arrástrala al chat o adjúntala con el clip.');
    }, 400);
  }

  const totalHoy = bucketsSemana[claveHoy]?.length ?? 0;
  const conFotoMes = listaMes.filter(c => idsConFoto.has(c.id)).length;
  const enviadasMes = listaMes.filter(c => enviados.has(c.id)).length;

  /* Una fila de la lista.
     `compacto` = fila delgada (se usa en la vista de la semana, para que
     quepan los 7 días en pantalla sin tanto desplazamiento).            */
  /* Cada vez que se abre la ventana o se cambia de diseño, se vuelve a armar
     la tarjeta y se muestra. Es la MISMA que se descarga: no es un dibujo
     aparte que después no coincida. */
  useEffect(() => {
    if (!previa) { setPreviaImg(''); return; }
    let cancelado = false;
    setPreviaCargando(true);
    setPreviaImg('');
    (async () => {
      try {
        const { lienzo } = await armarLienzo(previa, previaDis);
        if (!cancelado) setPreviaImg(lienzo.toDataURL('image/png'));
      } catch {
        if (!cancelado) setPreviaImg('');
      } finally {
        if (!cancelado) setPreviaCargando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa, previaDis]);

  const Tarjeta = ({ c, destacado, verDia, compacto }: { c: Cumple; destacado?: boolean; verDia?: boolean; compacto?: boolean }) => {
    const kFila   = compacto ? 'gap-2 rounded-xl p-1.5'      : 'gap-3 rounded-2xl p-3';
    const kFoto   = compacto ? 'w-10 h-10 rounded-lg'        : 'w-14 h-14 rounded-xl';
    const kProy   = compacto ? 'w-[64px] h-[28px] text-[13px]' : 'w-[78px] h-[38px] text-[16px]';
    const kNombre = compacto ? 'text-[13px]'                 : '';
    const kBoton  = compacto ? 'text-[11px] px-2.5 py-1.5 gap-1' : 'text-[12px] px-3 py-2 gap-1.5';
    const kIcono  = compacto ? 'w-3 h-3'                     : 'w-3.5 h-3.5';
    const kChulo  = compacto ? 'w-7 h-7'                     : 'w-9 h-9';
    return (
    <div className={`flex items-center border ${kFila} ${destacado ? 'border-pink-400/45 bg-[rgba(236,72,153,.16)]' : 'border-[#4A5568] bg-[#3C4759]'}`}>
      {verDia && (
        <div className={`${compacto ? 'w-9' : 'w-11'} flex-shrink-0 text-center`}>
          <span className={`inline-block w-full bg-[#00B050] text-white font-black rounded-lg py-1 ${compacto ? 'text-sm' : 'text-base'}`}>{c.dia}</span>
        </div>
      )}
      <div className={`${kFoto} overflow-hidden bg-[#2B3547] flex-shrink-0 border border-[#4A5568]`}>
        {c.foto
          ? <img src={c.foto} alt="" className="w-full h-full object-cover" />
          : (!fotosListas || idsConFoto.has(c.id))
            ? <div className="w-full h-full bg-[#2B3547] animate-pulse" />
            : <div className="w-full h-full flex items-center justify-center text-white/30"><Cake className={compacto ? 'w-4 h-4' : 'w-6 h-6'} /></div>}
      </div>
      {c.proyecto ? (
        <span
          title="Proyecto"
          className={`bg-orange-500 text-white font-black rounded-lg flex-shrink-0 ${kProy}
                     flex items-center justify-center overflow-hidden whitespace-nowrap leading-none px-1`}
        >
          {c.proyecto}
        </span>
      ) : (
        <span className={`${kProy} flex-shrink-0`} />
      )}
      <div className="flex-1 min-w-0">
        <div className={`flex items-start gap-2 ${compacto ? 'flex-wrap items-baseline' : ''}`}>
          <span className={`bg-[#00B050] text-white font-black rounded-md flex-shrink-0 ${compacto ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5 mt-0.5'}`}>{c.codigo || '—'}</span>
          {/* Nombre COMPLETO: no se corta, si es muy largo pasa a la línea siguiente */}
          <p className={`font-bold text-white leading-tight break-words ${kNombre}`}>{c.nombre}</p>
          {esRetirado(c.estado) && (
            <span
              title="Deportista retirado · el saludo le sale como exalumno"
              className={`bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md flex-shrink-0 ${compacto ? '' : 'mt-0.5'}`}
            >
              RETIRADO
            </span>
          )}
          {/* En fila delgada la fecha va en la MISMA línea del nombre */}
          {compacto && (
            <span className="text-[11px] text-white/60 leading-tight">
              {c.dia} de {MESES_CAP[c.mes - 1]}
              {c.edad != null && <span className="ml-1.5 text-pink-300 font-bold">cumple {c.edad} años</span>}
              {c.sede && <span className="ml-1.5 text-white/40">· {c.sede}</span>}
            </span>
          )}
        </div>
        {!compacto && (
          <p className="text-[12px] text-white/60 mt-0.5">
            {c.dia} de {MESES_CAP[c.mes - 1]}
            {c.edad != null && <span className="ml-2 text-pink-300 font-bold">cumple {c.edad} años</span>}
            {c.sede && <span className="ml-2 text-white/40">· {c.sede}</span>}
          </p>
        )}
      </div>
      {/* VER TARJETA — abre la vista previa. Reemplazó al botón que llevaba a
          la ficha: desde aquí lo que hace falta es ver cómo va a quedar la
          tarjeta, no abrir la ficha. — dirección, 28/08/2026 */}
      <button
        onClick={() => { setPreviaDis(diseno); setPrevia(c); }}
        title="Ver cómo queda la tarjeta antes de bajarla o mandarla"
        className={`flex items-center border border-[#00B050] text-[#5BE39B] hover:bg-[#2B3547] font-black rounded-xl flex-shrink-0 ${kBoton}`}
      >
        <Eye className={kIcono} />
        Ver tarjeta
      </button>
      {/* VERDE = hay número bueno. Un clic envía · doble clic (o clic derecho) lo corrige.
          ROJO  = no hay número, o el que hay no sirve para WhatsApp. Un solo clic
                  abre la ventanita para escribir el correcto. */}
      <button
        onClick={() => clicWhatsApp(c)}
        onDoubleClick={() => abrirEditorTel(c)}
        onContextMenu={(e) => { e.preventDefault(); abrirEditorTel(c); }}
        disabled={generando === c.id}
        title={celularWhatsApp(telefonoDe(c))
          ? `Enviar la tarjeta al ${telefonoDe(c)}\nDoble clic: ver o cambiar el número`
          : (telefonoDe(c)
              ? `El número que tiene (${telefonoDe(c)}) no sirve para WhatsApp.\nClic para escribir el correcto.`
              : 'Sin celular registrado.\nClic para escribir el número.')}
        className={`relative flex items-center disabled:opacity-50 text-white font-black rounded-xl flex-shrink-0 ${kBoton} ${
          celularWhatsApp(telefonoDe(c))
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        <MessageCircle className={kIcono} />
        WhatsApp
        {telAlt[c.id] && (
          <span
            title="Este deportista tiene un número de WhatsApp corregido"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 border border-white flex items-center justify-center"
          >
            <Phone className="w-2.5 h-2.5 text-white" strokeWidth={4} />
          </span>
        )}
      </button>
      {/* CHULO: verde = ya enviada por WhatsApp. Se puede marcar/desmarcar a mano. */}
      <button
        onClick={() => alternarEnviado(c)}
        title={enviados.has(c.id)
          ? `Enviada por WhatsApp en ${ANIO} · clic para quitar la marca`
          : 'Todavía NO enviada · clic para marcarla como enviada a mano'}
        className={`${kChulo} rounded-full flex items-center justify-center flex-shrink-0 border-2 transition ${
          enviados.has(c.id)
            ? 'bg-green-600 border-green-600 text-white hover:bg-green-700'
            : 'bg-[#3C4759] border-[#4A5568] text-white/30 hover:border-green-400 hover:text-green-400'
        }`}
      >
        <Check className={compacto ? 'w-4 h-4' : 'w-5 h-5'} strokeWidth={4} />
      </button>
      <button
        onClick={() => descargarTarjeta(c)}
        disabled={generando === c.id}
        title={!fotosListas
          ? 'Verificando si tiene foto…'
          : idsConFoto.has(c.id) ? 'Tiene foto subida' : 'Sin foto: la tarjeta saldrá incompleta'}
        className={`flex items-center disabled:opacity-50 text-white font-black rounded-xl flex-shrink-0 ${kBoton} ${
          !fotosListas
            ? 'bg-[#7C879A]'
            : idsConFoto.has(c.id) ? 'bg-[#00B050] hover:brightness-110' : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        <Download className={kIcono} />
        {generando === c.id ? 'Generando…' : 'Tarjeta'}
      </button>
    </div>
    );
  };

  /* Un día de la semana. Cabecera delgada; si nadie cumple, no ocupa cuerpo. */
  const Seccion = ({ d }: { d: DiaSemana }) => {
    const lista = bucketsSemana[d.clave] ?? [];
    const destacado = d.esHoy;
    const vacia = !cargando && lista.length === 0;
    return (
      <div className={`bg-[#3C4759] rounded-2xl border shadow-sm overflow-hidden ${destacado ? 'border-pink-400/60 ring-2 ring-pink-400/40' : 'border-[#4A5568]'}`}>
        <div className={`flex items-center gap-2 px-3 py-2 ${
          destacado ? 'bg-gradient-to-r from-pink-500 to-rose-400'
                    : vacia ? 'bg-[#333F50]' : 'bg-[#00B050]'}`}>
          <span className="text-base leading-none">{d.emoji}</span>
          <h2 className={`font-black text-[13px] tracking-wide ${destacado ? 'text-white' : vacia ? 'text-white/60' : 'text-white'}`}>
            {d.titulo}
          </h2>
          <span className={`text-[11px] font-bold ${destacado ? 'text-white/80' : vacia ? 'text-white/40' : 'text-white/75'}`}>
            {d.fecha.getDate()} de {MESES_CAP[d.fecha.getMonth()]}
          </span>
          {vacia
            ? <span className="ml-auto text-[11px] font-bold text-white/40">Nadie cumple</span>
            : <span className={`ml-auto text-[11px] font-black px-2 py-0.5 rounded-full ${destacado ? 'bg-[#3C4759]/25 text-white' : 'bg-[#3C4759]/25 text-white'}`}>
                {cargando ? '…' : lista.length}
              </span>}
        </div>
        {!vacia && (
          <div className="p-2 space-y-1.5">
            {cargando
              ? <p className="text-center text-white/40 text-sm py-4">Cargando…</p>
              : lista.map(c => <Tarjeta key={c.id} c={c} destacado={destacado} compacto />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#333F50] cumple-oscuro">
      {/* ── FONDO OSCURO (dirección, 26/08/2026) ─────────────────────────────
          Cumpleaños era la última pantalla blanca de la app. Ahora usa el mismo
          gris oscuro con verde de todo lo demás. Lo ÚNICO que se dejó en rojo
          es lo que avisa que a un deportista le falta la foto —o sea, que su
          tarjeta va a salir incompleta—, porque ese aviso tiene que gritar.
          Aquí se le pone color a lo que se escribe: si no, el navegador deja
          la letra negra sobre fondo oscuro y no se lee nada. */}
      <style>{`
        .cumple-oscuro input,
        .cumple-oscuro select,
        .cumple-oscuro textarea { color: #ffffff; }
        .cumple-oscuro input::placeholder { color: rgba(255,255,255,.35); }
        .cumple-oscuro option { color: #111827; background: #ffffff; }
      `}</style>
      <header className="bg-gradient-to-r from-[#00B050] to-[#00B050] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => { window.location.href = '/dashboard'; }} title="Volver al menú principal" className="text-white/80 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <Cake className="w-6 h-6 text-white" />
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">Cumpleaños</h1>
          <p className="text-white/70 text-xs">
            {vista === 'dias' ? 'Toda la semana — de lunes a domingo'
              : vista === 'fotos' ? 'Control de fotos — a quién hay que apurar'
              : vista === 'anio' ? 'Todos los deportistas y su cumpleaños'
              : `Todos los de ${MESES_CAP[(vista as number) - 1]}`}
          </p>
        </div>
        <button onClick={cargar} title="Actualizar" className="text-white/80 hover:text-white transition"><RefreshCw className="w-4 h-4" /></button>
      </header>

      {/* Ancho grande en computador para que el nombre completo quepa sin cortarse */}
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 space-y-4">
        {totalHoy > 0 && vista === 'dias' && (
          <div className="bg-gradient-to-r from-pink-500 to-rose-400 text-white rounded-2xl px-4 py-3 text-center font-black shadow">
            🎉 Hoy {totalHoy === 1 ? 'cumple' : 'cumplen'} {totalHoy} deportista{totalHoy === 1 ? '' : 's'} — ¡a felicitarlos!
            {totalSemana > totalHoy && (
              <span className="block text-[12px] font-bold text-white/85 mt-0.5">
                {totalSemana} en toda la semana (lunes a domingo)
              </span>
            )}
          </div>
        )}

        {/* ── Filtros: mes y sede ── */}
        <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-wide mb-1">Ver</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5BE39B] pointer-events-none" />
                <select
                  value={typeof vista === 'number' ? String(vista) : vista}
                  onChange={e => {
                    const v = e.target.value;
                    setVista(
                      (v === 'dias' || v === 'fotos' || v === 'anio')
                        ? (v as 'dias' | 'fotos' | 'anio')
                        : Number(v)
                    );
                  }}
                  className="w-full pl-9 pr-3 py-2.5 border border-[#4A5568] rounded-xl text-sm font-bold bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="dias">📅 Toda la semana (lunes a domingo)</option>
                  <option value="anio">📋 Todo el año — todos los deportistas</option>
                  <option value="fotos">📸 Control de fotos — quién falta</option>
                  {MESES_CAP.map((m, i) => <option key={m} value={i + 1}>Todos los de {m}</option>)}
                </select>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-wide mb-1">Sede</label>
              <select
                value={sede}
                onChange={e => setSede(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#4A5568] rounded-xl text-sm bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="">Todas las sedes</option>
                {sedes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-wide mb-1">Proyecto</label>
              <select
                value={proyecto}
                onChange={e => setProyecto(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#4A5568] rounded-xl text-sm bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">Todos los proyectos</option>
                {proyectos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-wide mb-1">Programa</label>
              <select
                value={programa}
                onChange={e => setPrograma(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#4A5568] rounded-xl text-sm bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="">Todos los programas</option>
                {programas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o código…"
              className="w-full pl-9 pr-3 py-2.5 border border-[#4A5568] rounded-xl text-sm bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>

          <div>
            <label className="text-[11px] font-black text-white/60 uppercase">Estado del deportista</label>
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value as 'todos' | 'activos' | 'retirados')}
              className={`mt-1 w-full px-3 py-2.5 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                filtroEstado === 'retirados'
                  ? 'bg-[rgba(139,114,217,.18)] border-[#8B72D9] text-white'
                  : 'bg-[#3C4759] border-[#4A5568] text-white'
              }`}
            >
              <option value="todos">Todos los deportistas</option>
              <option value="activos">Solo deportistas activos</option>
              <option value="retirados">Solo deportistas RETIRADOS</option>
            </select>
            {filtroEstado === 'retirados' && (
              <p className="text-[12px] text-[#C4B5FD] font-semibold mt-1.5">
                Ellos también reciben su tarjeta el día del cumpleaños. El saludo de WhatsApp
                les sale con un texto distinto, de exalumno.
              </p>
            )}
          </div>

          {/* ── LOS TRES DISEÑOS DE LA TARJETA ─────────────────────────────
              Se escoge aquí y la tarjeta sale así, tanto al descargar como al
              mandarla por WhatsApp. — dirección, 28/08/2026 */}
          <div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-wide mb-1.5">
              Diseño de la tarjeta
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'conFondo', tit: 'CON FONDO',      pie: 'recuadro pequeño, la foto tal cual' },
                { id: 'sinFondo', tit: 'SIN FONDO',      pie: 'recuadro pequeño, el niño recortado' },
                { id: 'grande',   tit: 'RECUADRO GRANDE', pie: 'la foto llena todo el cromo del Mundial' },
              ] as const).map(o => {
                const puesto = diseno === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setDiseno(o.id)}
                    title={o.pie}
                    className="rounded-xl px-3 py-2 text-left transition"
                    style={{
                      background: puesto ? 'rgba(0,176,80,.16)' : '#2B3547',
                      border: `1px solid ${puesto ? '#00B050' : '#4A5568'}`,
                    }}>
                    <span className="block text-[11.5px] font-black"
                          style={{ color: puesto ? '#5BE39B' : '#ffffff' }}>
                      {o.tit}
                    </span>
                    <span className="block text-[10px] font-semibold text-white/40">{o.pie}</span>
                  </button>
                );
              })}
            </div>
            {diseno === 'grande' && (
              <p className="text-[11.5px] text-white/45 font-semibold mt-1.5">
                La foto abarca todo el recuadro del Mundial 2026, y el nombre con el club
                quedan sobre una franja negra, como en los cromos.
              </p>
            )}
          </div>
        </div>

        {vista === 'fotos' ? (
          <div className="space-y-3">
            {/* Contadores */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-3 text-center">
                <p className="text-2xl font-black text-white leading-none">{universo.length}</p>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wide mt-1">Deportistas</p>
              </div>
              <div className="bg-[#3C4759] rounded-2xl border border-[#00B050]/45 shadow-sm p-3 text-center">
                <p className="text-2xl font-black text-[#5BE39B] leading-none">{conFotoTotal}</p>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wide mt-1">Con foto</p>
              </div>
              <div className="bg-[#3C4759] rounded-2xl border border-[#C0504D]/55 shadow-sm p-3 text-center">
                <p className="text-2xl font-black text-[#F08A87] leading-none">{sinFotoTotal}</p>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wide mt-1">Sin foto</p>
              </div>
            </div>

            {/* Barra de avance */}
            <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-white/60 uppercase tracking-wide">Avance de fotos</span>
                <span className="text-sm font-black text-[#5BE39B]">{pctFoto}%</span>
              </div>
              <div className="h-2.5 w-full bg-[#2B3547] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all" style={{ width: `${pctFoto}%` }} />
              </div>
            </div>

            {/* Agrupar por */}
            <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-3">
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-wide mb-1">Ver quién falta, agrupado por</label>
              <select
                value={agruparPor}
                onChange={e => { setAgruparPor(e.target.value as any); setAbierto(null); }}
                className="w-full px-3 py-2.5 border border-[#4A5568] rounded-xl text-sm font-bold bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="proyecto">Proyecto</option>
                <option value="profe">Profesor</option>
                <option value="sede">Sede</option>
                <option value="programa">Programa</option>
              </select>
            </div>

            {/* Grupos */}
            {cargando ? (
              <p className="text-center text-white/40 text-sm py-8">Cargando…</p>
            ) : grupos.length === 0 ? (
              <p className="text-center text-white/40 text-sm py-8">No hay deportistas con estos filtros.</p>
            ) : grupos.map(g => {
              const abiertoAqui = abierto === g.nombre;
              const listo = g.sin.length === 0;
              return (
                <div key={g.nombre} className={`bg-[#3C4759] rounded-2xl border shadow-sm overflow-hidden ${listo ? 'border-[#00B050]/45' : 'border-[#C0504D]/55'}`}>
                  <button
                    onClick={() => setAbierto(abiertoAqui ? null : g.nombre)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[#333F50] transition"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${listo ? 'bg-[#00B050]' : 'bg-rose-500'}`} />
                    <span className="font-black text-sm text-white truncate flex-1">{g.nombre}</span>
                    <span className="text-[11px] text-white/40 font-bold whitespace-nowrap">{g.total - g.sin.length}/{g.total}</span>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${listo ? 'bg-[#2B3547] text-[#5BE39B]' : 'bg-[#2B3547] text-[#F08A87]'}`}>
                      {listo ? 'completo' : `${g.sin.length} sin foto`}
                    </span>
                  </button>

                  {abiertoAqui && !listo && (
                    <div className="border-t border-[#4A5568] p-3 space-y-1.5">
                      <button
                        onClick={() => copiarGrupo(g)}
                        className="w-full bg-[#00B050] hover:brightness-110 text-white text-[12px] font-black py-2 rounded-xl mb-1"
                      >
                        {copiado === g.nombre ? '¡Lista copiada!' : 'Copiar lista para WhatsApp'}
                      </button>
                      {g.sin.map(c => (
                        <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#333F50]">
                          <span className="bg-[#7C879A] text-white text-[10px] font-black px-1.5 py-0.5 rounded">{c.codigo || '—'}</span>
                          <span className="text-[13px] text-white font-semibold flex-1 break-words">{c.nombre}</span>
                          {c.profe && agruparPor !== 'profe' && <span className="text-[11px] text-white/40 whitespace-nowrap">{c.profe}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : vista === 'dias' ? (
          <div className="space-y-2">
            {semana.map(d => <Seccion key={d.clave} d={d} />)}
          </div>
        ) : (
          <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 rounded-t-2xl bg-gradient-to-r from-[#00B050] to-[#00B050]">
              <span className="text-lg">🎈</span>
              <h2 className="font-black text-sm text-white uppercase">
                {vista === 'anio' ? 'Todo el año' : MESES_CAP[(vista as number) - 1]}
              </h2>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#3C4759]/25 text-white">{listaMes.length} en total</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#3C4759]/25 text-white">{conFotoMes} con foto</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-green-500 text-white">{enviadasMes} enviadas ✓</span>
              </span>
            </div>
            <div className="p-3 space-y-2">
              {cargando
                ? <p className="text-center text-white/40 text-sm py-6">Cargando…</p>
                : listaMes.length === 0
                  ? <p className="text-center text-white/40 text-sm py-6">
                      No hay deportistas {vista === 'anio' ? '' : `de ${MESES_CAP[(vista as number) - 1]} `}con estos filtros.
                    </p>
                  : listaMes.map(c => <Tarjeta key={c.id} c={c} verDia />)}
            </div>
          </div>
        )}

        <div className="h-6" />
      </main>

      {/* ── VENTANITA: VER Y CORREGIR EL NÚMERO DE WHATSAPP ── */}
      {editandoTel && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !guardandoTel && setEditandoTel(null)}
        >
          <div
            className="bg-[#3C4759] rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-green-600">
              <Phone className="w-4 h-4 text-white" />
              <h3 className="font-black text-sm text-white uppercase">Número de WhatsApp</h3>
              <button
                onClick={() => setEditandoTel(null)}
                disabled={guardandoTel}
                className="ml-auto text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="bg-[#00B050] text-white text-[11px] font-black px-2 py-0.5 rounded-md">
                  {editandoTel.codigo || '—'}
                </span>
                <p className="font-black text-white break-words">{editandoTel.nombre}</p>
              </div>

              <div className="bg-[#333F50] border border-[#4A5568] rounded-xl p-3">
                <p className="text-[11px] font-black text-white/60 uppercase">Celular que está en la ficha</p>
                <p className="text-lg font-black text-white mt-0.5">
                  {editandoTel.celular || 'No tiene celular registrado'}
                </p>
              </div>

              <div>
                <label className="text-[11px] font-black text-white/60 uppercase">
                  Número al que se enviará el WhatsApp
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={borradorTel}
                  onChange={(e) => setBorradorTel(e.target.value)}
                  placeholder="3001234567"
                  autoFocus
                  className="mt-1 w-full border-2 border-[#4A5568] focus:border-green-500 outline-none
                             rounded-xl px-3 py-3 text-2xl font-black tracking-wide text-white"
                />
                <p className="text-[12px] text-white/60 mt-1.5">
                  Escríbelo con los 10 dígitos, sin espacios ni guiones. Si es de Colombia, el 57 se pone solo.
                </p>
              </div>

              {telAlt[editandoTel.id] && (
                <div className="bg-[rgba(224,163,58,.16)] border border-[#E0A33A]/60 rounded-xl p-3">
                  <p className="text-[12px] text-[#F3C46A] font-bold">
                    Este deportista ya tiene un número corregido guardado por la institución.
                  </p>
                  {telAlt[editandoTel.id].telefonoFicha && (
                    <p className="text-[12px] text-[#F3C46A] mt-0.5">
                      El de la ficha era: {telAlt[editandoTel.id].telefonoFicha}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={guardarTel}
                  disabled={guardandoTel}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white
                             font-black text-sm py-3 rounded-xl"
                >
                  {guardandoTel ? 'Guardando…' : 'Guardar número'}
                </button>
                {telAlt[editandoTel.id] && (
                  <button
                    onClick={quitarTel}
                    disabled={guardandoTel}
                    className="border-2 border-[#4A5568] text-white/70 hover:bg-[#333F50] disabled:opacity-50
                               font-black text-sm px-3 py-3 rounded-xl"
                  >
                    Usar el de la ficha
                  </button>
                )}
              </div>

              <p className="text-[12px] text-white/60 text-center">
                Al guardar, cierra esta ventana y vuelve a hacer clic en WhatsApp:
                el mensaje se irá al número nuevo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── VENTANA: VER LA TARJETA ANTES DE MANDARLA ────────────────────────
          Se ve la tarjeta ya armada y se cambia entre los tres diseños para
          escoger cuál queda mejor con la foto de ese deportista.
          — dirección, 28/08/2026 */}
      {previa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3"
          style={{ background: 'rgba(0,0,0,.72)' }}
          onClick={() => setPrevia(null)}
        >
          <div
            className="rounded-2xl w-full max-w-[820px] max-h-[92vh] overflow-y-auto"
            style={{ background: '#3C4759', border: '1px solid #4A5568' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Título */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-t-2xl" style={{ background: '#00B050' }}>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-black text-[14px] uppercase truncate">{previa.nombre}</h3>
                <p className="text-white/75 text-[11px] font-semibold">
                  {previa.dia} de {MESES_CAP[previa.mes - 1]}
                  {previa.edad != null && ` · cumple ${previa.edad} años`}
                </p>
              </div>
              <button
                onClick={() => setPrevia(null)}
                title="Cerrar"
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-white text-[11px] font-black"
                style={{ background: 'rgba(255,255,255,.18)' }}
              >
                CERRAR
              </button>
            </div>

            <div className="p-4 flex flex-col sm:flex-row gap-4">
              {/* La tarjeta */}
              <div className="flex-1 min-w-0 flex items-start justify-center">
                {previaCargando ? (
                  <div className="w-full flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#00B050] animate-spin" />
                    <p className="text-white/50 text-[12px] font-semibold">Armando la tarjeta…</p>
                  </div>
                ) : previaImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previaImg} alt="Tarjeta de cumpleaños"
                    className="w-full rounded-xl"
                    style={{ maxWidth: 380, border: '1px solid #4A5568' }} />
                ) : (
                  <p className="text-[12px] font-semibold py-16 text-center" style={{ color: '#E0A33A' }}>
                    No se pudo armar la tarjeta. Puede que este deportista todavía no tenga foto.
                  </p>
                )}
              </div>

              {/* Los tres diseños y los botones */}
              <div className="sm:w-[250px] shrink-0 flex flex-col gap-2">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wide">
                  Escoge el diseño
                </p>
                {([
                  { id: 'conFondo', tit: 'CON FONDO',       pie: 'recuadro pequeño, la foto tal cual' },
                  { id: 'sinFondo', tit: 'SIN FONDO',       pie: 'recuadro pequeño, el niño recortado' },
                  { id: 'grande',   tit: 'RECUADRO GRANDE', pie: 'la foto llena todo el cromo' },
                ] as const).map(o => {
                  const puesto = previaDis === o.id;
                  return (
                    <button key={o.id} type="button"
                      onClick={() => setPreviaDis(o.id)}
                      disabled={previaCargando}
                      className="rounded-xl px-3 py-2 text-left transition disabled:opacity-50"
                      style={{
                        background: puesto ? 'rgba(0,176,80,.16)' : '#2B3547',
                        border: `1px solid ${puesto ? '#00B050' : '#4A5568'}`,
                      }}>
                      <span className="block text-[11.5px] font-black"
                            style={{ color: puesto ? '#5BE39B' : '#ffffff' }}>
                        {o.tit}
                      </span>
                      <span className="block text-[10px] font-semibold text-white/40">{o.pie}</span>
                    </button>
                  );
                })}

                <p className="text-[11px] text-white/40 font-semibold mt-1">
                  Se manda tal como se ve aquí.
                </p>

                <button
                  onClick={() => descargarTarjeta(previa, 'descargar', previaDis)}
                  disabled={previaCargando || !previaImg || generando === previa.id}
                  className="rounded-xl px-3 py-2.5 text-white font-black text-[12px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: '#00B050' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  BAJAR ESTA TARJETA
                </button>

                <button
                  onClick={() => { const q = previa; setPrevia(null); if (q) descargarTarjeta(q, 'whatsapp', previaDis); }}
                  disabled={previaCargando || !previaImg || generando === previa.id}
                  className="rounded-xl px-3 py-2.5 text-white font-black text-[12px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: celularWhatsApp(telefonoDe(previa)) ? '#16a34a' : '#C0504D' }}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  MANDAR POR WHATSAPP
                </button>

                <button
                  onClick={() => { const q = previa; setPrevia(null); if (q) router.push(`/alumnos/${q.id}?volver=/cumpleanos`); }}
                  className="rounded-xl px-3 py-2 text-white/70 font-black text-[11px]"
                  style={{ background: '#2B3547', border: '1px solid #4A5568' }}
                >
                  ABRIR LA FICHA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
