'use client';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  /consolidado  ·  CONSOLIDADO DEL FORMADOR
//
//  Pedido por la dirección el 01/09/2026:
//  «que en la sección del profe él pueda ver un consolidado de sus asistencias,
//   microciclos e informes. Todo esto por grupo y por deportista, como lo tengo
//   yo.»
//
//  UNA SOLA PANTALLA PARA LOS DOS. No se hicieron tres pantallas ni una copia
//  para el profe: es la misma, y lo único que cambia es CUÁNTO se ve.
//
//     · EL FORMADOR   ve SOLO sus grupos. No escoge: la pantalla los saca de
//                     los proyectos que tiene asignados y no le muestra más.
//     · LA DIRECCIÓN  ve TODOS los grupos, y puede filtrar por formador para
//                     revisar a uno en particular.
//
//  DOS NIVELES, como los pidió la dirección:
//     1. POR GRUPO      — el cuadro de entrada: cómo va cada equipo.
//     2. POR DEPORTISTA — se abre un grupo y se ve niño por niño.
//
//  De paso, esta pantalla tapa dos huecos viejos: en el tablero de la dirección
//  los botones "Control Asistencia" y "Control Micro Ciclos" apuntaban a
//  /control-asistencias y /control-microciclos, que NUNCA se construyeron —
//  eran dos enlaces rotos. Ahora los dos llegan aquí.
//
//  NOTA SOBRE MICROCICLOS: el microciclo es la planeación de la SEMANA del
//  grupo, no algo de cada niño. Por eso en esa pestaña el detalle no es por
//  deportista sino por semana. Se dice en pantalla para que nadie lo busque.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Users, CalendarCheck, ClipboardList,
  CalendarDays, AlertTriangle, ChevronRight, Loader2, Search, X,
} from 'lucide-react';
import { getDeportistasPorProyecto, getProfes, getEvaluacionesResumen, getMicrociclos, getResumenAsistencia } from '@/lib/db';
import type { Deportista, Profe, EvaluacionResumen, Microciclo, ResumenAsistenciaDia } from '@/lib/db';
import { esProfesor, esSuperAdmin, esAccesoTotal } from '@/lib/permisos';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/client';

/* ── Colores oficiales ───────────────────────────────────────────────────── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const VERDECL= '#5BE39B';
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';

/* ── Leer columnas de la ficha (mismos helpers de Control de Informes) ────── */
function celda(dep: Deportista, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => rx.test(c.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}
const codigoDe   = (d: Deportista) => celda(d, /^c[oó]d/i);
const proyectoDe = (d: Deportista) => celda(d, /^proy/i);
const programaDe = (d: Deportista) => celda(d, /^program/i);
const estadoDe   = (d: Deportista) => celda(d, /^estado/i);
/** Solo los ACTIVOS cuentan. Un retirado no entrena ni recibe informe. */
const esActivo   = (d: Deportista) => /activ/i.test(estadoDe(d));

/** Orden natural: "2", "5", "40", "SUB 8A", "SUB 12C". */
const cmpNat = (a: string, b: string) =>
  String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });

const pelar = (x: any) => String(x ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase();

/* ── Fechas ──────────────────────────────────────────────────────────────── */
const hoyISO = () => new Date().toISOString().slice(0, 10);
/** Primer y último día del mes 'YYYY-MM'. */
function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}
const mesActual = () => hoyISO().slice(0, 7);
function mesBonito(mes: string): string {
  const NOM = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
               'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const [a, m] = mes.split('-').map(Number);
  return `${NOM[(m || 1) - 1]} ${a}`;
}
/** Los últimos N meses, del más nuevo al más viejo. */
function ultimosMeses(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
/** El lunes de la semana de una fecha, en YYYY-MM-DD. */
function lunesDe(f: Date): string {
  const d = new Date(f);
  const dia = (d.getDay() + 6) % 7;          // 0 = lunes
  d.setDate(d.getDate() - dia);
  return d.toISOString().slice(0, 10);
}

/* ── LOS FORMADORES, PERO SIN LAS FOTOS ──────────────────────────────────────
   (dirección, 01/09/2026)

   getProfes() de la librería trae también la FOTO de cada formador, guardada
   como texto dentro de la misma tabla. Son 25 formadores y **6,16 MB**: más
   pesado que las 1.168 fichas de los deportistas juntas.

   Esta pantalla no muestra ninguna foto. Solo necesita saber quién es y qué
   grupos tiene — eso son unos pocos kilobytes. Así que se piden solo esas tres
   casillas y se deja la foto quieta.

   Si esta consulta falla por lo que sea, arriba se cae al getProfes() de
   siempre: más lento, pero la pantalla no se queda sin datos. */
async function getProfesSinFotos(): Promise<Profe[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profes?select=id,usuario,nombre,proyectos&order=usuario`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: 'no-store',
    },
  );
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('respuesta rara');
  return data.map((r: any): Profe => ({
    id:        String(r.id ?? ''),
    usuario:   String(r.usuario ?? ''),
    clave:     '',                       // no se pide, y no hace falta aquí
    nombre:    String(r.nombre ?? ''),
    proyectos: Array.isArray(r.proyectos) ? r.proyectos.map(String) : [],
  }));
}

/** Los meses de la temporada: FEBRERO a DICIEMBRE del año en curso.
 *  Enero no va — la academia no entrena en enero. (dirección, 01/09/2026) */
const MES_CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
function mesesTemporada(anio: number): { clave: string; corto: string }[] {
  const out: { clave: string; corto: string }[] = [];
  for (let m = 2; m <= 12; m++) {
    out.push({ clave: `${anio}-${String(m).padStart(2, '0')}`, corto: MES_CORTO[m - 1] });
  }
  return out;
}

/** Separador invisible para armar la "huella" de una lista de grupos. */
const SEP = '\u0001';

type Pestana = 'asistencia' | 'microciclos' | 'informes';

/* ── Lo que se muestra de cada grupo ─────────────────────────────────────── */
interface FilaGrupo {
  proyecto:   string;
  profe:      string;
  programa:   string;
  activos:    number;
  /* Asistencia del mes escogido */
  diasConRegistro: number;
  diasSinLlenar:   number;
  promedio:        number;   // 0-100
  /* Microciclos */
  semanas:      number;
  ultimaSemana: string;
  semanaAlDia:  boolean;
  /* Informes */
  conInf1: number;
  conInf2: number;
  sinNada: number;
}

export default function ConsolidadoPage() {
  const router = useRouter();

  /* ── Quién está mirando ────────────────────────────────────────────────── */
  const [soyProfe, setSoyProfe] = useState(false);
  const [soyAdmon, setSoyAdmon] = useState(false);
  const [misProyectos, setMisProyectos] = useState<string[]>([]);
  const [miNombre, setMiNombre] = useState('');

  useEffect(() => {
    const p = esProfesor();
    setSoyProfe(p);
    setSoyAdmon(esSuperAdmin() || esAccesoTotal());
    try {
      const raw = localStorage.getItem('futuro-profe-proyectos');
      const lista = raw ? JSON.parse(raw) : [];
      if (Array.isArray(lista)) setMisProyectos(lista.map(String));
    } catch { /* sin lista guardada: se queda vacía */ }
    try { setMiNombre(localStorage.getItem('futuro-profe-nombre') || ''); } catch { /* nada */ }
  }, []);

  /* ── Datos ─────────────────────────────────────────────────────────────── */
  const [deps, setDeps]     = useState<Deportista[]>([]);
  const [profes, setProfes] = useState<Profe[]>([]);
  const [evals, setEvals]   = useState<EvaluacionResumen[]>([]);
  const [micros, setMicros] = useState<Microciclo[]>([]);
  const [cargando, setCargando] = useState(true);        // los formadores (rápido)
  const [cargandoDeps, setCargandoDeps] = useState(true);  // las fichas (pesado)
  const [error, setError]   = useState('');

  /* La asistencia se pide POR PROYECTO, así que va aparte y se va llenando.
     Con un formador son tres o cuatro viajes; con la dirección pueden ser
     muchos, y por eso se muestra el avance en vez de dejar la pantalla
     congelada. */
  const [asis, setAsis] = useState<Record<string, Record<string, ResumenAsistenciaDia>>>({});
  const [cargandoAsis, setCargandoAsis] = useState(false);
  const [avanceAsis, setAvanceAsis] = useState({ hechos: 0, total: 0 });

  /* Lo ya traído se guarda aquí, con el año al que pertenece. Sirve para no
     volver a pedir un grupo que ya llegó. */
  const asisCache = useRef<{ anio: number; datos: Record<string, Record<string, ResumenAsistenciaDia>> }>({ anio: 0, datos: {} });

  /* El botón ACTUALIZAR sube este número, y eso —y solo eso— vuelve a pedir
     todo desde cero. Sin él, nada se repite. */
  const [recarga, setRecarga] = useState(0);

  const [pestana, setPestana] = useState<Pestana>('asistencia');
  const [mes, setMes] = useState(mesActual());
  const [fProfe, setFProfe] = useState('');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState<string>('');   // el grupo desplegado
  /** El año que se está mirando: sale del mes escogido arriba. */
  const anioVista = useMemo(() => Number(mes.slice(0, 4)) || new Date().getFullYear(), [mes]);

  /* ── PRIMERO LO LIGERO, DESPUÉS LO PESADO ───────────────────────────────
     (dirección, 01/09/2026 — la pantalla se quedaba en "Cargando…")

     QUÉ PASABA: se esperaba a que llegaran los 1.168 deportistas —2,3 MB con
     toda la ficha de cada uno— ANTES de pintar nada. Diez, quince segundos de
     pantalla muerta. Y peor: la asistencia tampoco arrancaba, porque no sabía
     qué grupos había hasta que llegaran los deportistas.

     LA CURA: la lista de grupos NO sale de los deportistas. Sale de la tabla
     de FORMADORES, que son 25 renglones y llega en un parpadeo — y para el
     formador, de la lista que ya tiene guardada en su propio navegador, o sea
     al instante. El cuadro se pinta de una, y los números de cada grupo se van
     llenando solos cuando lleguen los deportistas.

     Se ve trabajando en vez de verse congelada, que es lo que importa. */
  const cargarTodo = useCallback(() => {
    setCargando(true); setCargandoDeps(true); setError('');
    asisCache.current = { anio: 0, datos: {} };   // ACTUALIZAR bota lo guardado
    setRecarga(n => n + 1);

    /* LO LIGERO: los formadores, sin fotos. Con esto ya hay grupos que pintar. */
    getProfesSinFotos()
      .catch(() => getProfes())          // si falla, el de siempre
      .then(setProfes)
      .catch(e => setError(e?.message ?? 'No se pudo leer la lista de formadores.'))
      .finally(() => setCargando(false));

    /* Y estos dos por detrás, sin detener nada. */
    getEvaluacionesResumen().then(setEvals).catch(() => {});
    getMicrociclos().then(setMicros).catch(() => {});
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  /* ── Qué proyecto es de qué formador ───────────────────────────────────── */
  const profePorProyecto = useMemo(() => {
    const m = new Map<string, string>();
    profes.forEach(p => (p.proyectos ?? []).forEach(proy => {
      const k = String(proy).trim();
      if (k && !m.has(k)) m.set(k, (p.nombre || p.usuario || '').trim());
    }));
    return m;
  }, [profes]);

  /* ── EL UNIVERSO DE GRUPOS ──────────────────────────────────────────────
     (dirección, 01/09/2026 — «se queda titilando: aparece y desaparece»)

     LA CAUSA DEL TITILEO, en cristiano: esta lista se armaba TAMBIÉN con los
     deportistas que iban llegando. Y las fichas se pedían a partir de esta
     lista. O sea que llegaba un grupo de deportistas → la lista se rehacía →
     eso mandaba a pedir las fichas otra vez desde cero → llegaba otro grupo →
     se rehacía otra vez… Una culebra mordiéndose la cola: la pantalla se
     pintaba y se borraba sola, y el contador se quedaba en "0 de 2 grupos"
     porque cada vuelta lo devolvía a cero.

     LA CURA: la lista de grupos sale ÚNICAMENTE de los formadores (o, para el
     profe, de sus proyectos guardados). No mira los deportistas. Así queda
     quieta, se piden las fichas UNA sola vez, y ya no se muerde la cola.

     Aquí está además toda la diferencia entre el formador y la dirección, y
     es una sola línea: el formador solo ve los proyectos que tiene asignados.
     No es un filtro que él pueda quitar — es el universo de su pantalla. */
  const proyectosUniverso = useMemo(() => {
    const todos = new Set<string>();
    if (soyProfe) {
      misProyectos.forEach(p => { const k = String(p).trim(); if (k) todos.add(k); });
    } else {
      profes.forEach(pr => (pr.proyectos ?? []).forEach(p => {
        const k = String(p).trim(); if (k) todos.add(k);
      }));
    }
    return [...todos].sort(cmpNat);
  }, [soyProfe, misProyectos, profes]);

  /* ── LA HUELLA DE LA LISTA, NO LA LISTA ─────────────────────────────────
     React compara por "es el mismo objeto", no por "dice lo mismo". Una lista
     recién armada con los mismos dos grupos es, para él, una lista NUEVA — y
     eso vuelve a disparar todo. Por eso lo que se vigila es este texto:
     "SUB 8A|SUB 8B". Mientras diga lo mismo, no se pide nada de nuevo. */
  const claveUniverso = useMemo(() => proyectosUniverso.join(SEP), [proyectosUniverso]);

  /* Lo que se ve en pantalla: el universo, pasado por los filtros de arriba. */
  const proyectosVisibles = useMemo(() => {
    let lista = proyectosUniverso;
    if (!soyProfe && fProfe) {
      lista = lista.filter(p => pelar(profePorProyecto.get(p)) === pelar(fProfe));
    }
    if (buscar.trim()) {
      const q = pelar(buscar);
      lista = lista.filter(p => pelar(p).includes(q) || pelar(profePorProyecto.get(p)).includes(q));
    }
    return lista;
  }, [proyectosUniverso, soyProfe, fProfe, buscar, profePorProyecto]);

  const claveVisibles = useMemo(() => proyectosVisibles.join(SEP), [proyectosVisibles]);

  /* ── LAS FICHAS, SOLO LAS DE SUS GRUPOS ─────────────────────────────────
     (dirección, 01/09/2026 — la pantalla se quedaba en "Trayendo las fichas…")

     QUÉ PASABA: se pedían las 1.168 fichas de toda la academia —2,3 MB— para
     después usar las 21 de sus dos grupos. Además de tardarse, era un
     desperdicio: el 98% de lo que llegaba se botaba.

     LA CURA: la base sabe filtrar por proyecto. Se le piden solo los grupos
     que están en pantalla, uno por uno. Para el formador con dos grupos son
     dos consultas chiquitas en vez de una gigante, y cada grupo aparece
     completo apenas llega el suyo — no hay que esperar a que estén todos. */
  useEffect(() => {
    /* Se pide por el UNIVERSO, no por lo filtrado: así, buscar o cambiar de
       formador en los filtros de arriba no vuelve a pedir nada. */
    const lista = claveUniverso ? claveUniverso.split(SEP) : [];
    if (!lista.length) { setDeps([]); setCargandoDeps(false); return; }
    let vivo = true;
    setCargandoDeps(true);
    (async () => {
      const acc: Deportista[] = [];
      const cola = [...lista];
      const obrero = async () => {
        while (cola.length) {
          const proy = cola.shift()!;
          try {
            const r = await getDeportistasPorProyecto(proy);
            if (!vivo) return;
            if (r.data?.length) {
              acc.push(...r.data);
              setDeps([...acc]);          // cada grupo aparece apenas llega
            }
          } catch { /* ese grupo se queda en cero, los demás siguen */ }
        }
      };
      await Promise.all([obrero(), obrero(), obrero()]);
      if (!vivo) return;
      setCargandoDeps(false);
    })();
    return () => { vivo = false; };
  }, [claveUniverso, recarga]);

  /* ── La asistencia del mes, proyecto por proyecto ──────────────────────── */
  useEffect(() => {
    /* SOLO EN SU PESTAÑA (01/09/2026): la asistencia se pide grupo por grupo.
       Si se pidiera siempre, entrar a mirar INFORMES dispararía un viaje por
       cada grupo sin que nadie los vaya a ver. */
    if (pestana !== 'asistencia') return;

    const lista = claveVisibles ? claveVisibles.split(SEP) : [];
    if (!lista.length) { setAsis({}); setCargandoAsis(false); return; }

    /* ── LO QUE YA SE TRAJO, NO SE VUELVE A PEDIR ──────────────────────────
       Si se cambia de año, se bota todo y se empieza de nuevo. Si no, solo se
       piden los grupos que falten: así, escribir en el buscador o mover el mes
       no dispara ni un viaje más. */
    if (asisCache.current.anio !== anioVista) asisCache.current = { anio: anioVista, datos: {} };
    const faltan = lista.filter(p => !(p in asisCache.current.datos));
    if (!faltan.length) {
      setAsis({ ...asisCache.current.datos });
      setCargandoAsis(false);
      return;
    }

    let vivo = true;

    /* ── Y UN SOLO VIAJE POR GRUPO, PARA TODO EL AÑO ───────────────────────
       La dirección pidió ver todos los meses, de febrero a diciembre. Pedir
       mes por mes serían once viajes por cada grupo. Se pide el año entero de
       una sola vez —la base lo devuelve por fecha— y aquí se reparte por mes. */
    const desde = `${anioVista}-01-01`;
    const hasta = `${anioVista}-12-31`;
    setCargandoAsis(true);
    setAvanceAsis({ hechos: 0, total: faltan.length });
    (async () => {
      const cola = [...faltan];
      const uno = async (proy: string) => {
        let r: Record<string, ResumenAsistenciaDia> = {};
        try { r = await getResumenAsistencia(proy, desde, hasta); }
        catch { r = {}; }
        asisCache.current.datos[proy] = r;
        if (!vivo) return;
        /* Cada grupo se pinta apenas llega el suyo. */
        setAsis({ ...asisCache.current.datos });
        setAvanceAsis(a => ({ ...a, hechos: a.hechos + 1 }));
      };

      /* ── EL PRIMER GRUPO VA SOLO. NO ES CAPRICHO ───────────────────────
         (dirección, 01/09/2026 — se quedaba en "0 de 2 grupos")

         getResumenAsistencia(), por dentro, pide TODAS las fichas de la
         academia para poder ponerle nombre a cada faltante. Guarda copia,
         pero solo cuando termina la primera vez.

         Si se lanzan cinco grupos de una, los cinco encuentran la copia
         vacía y los cinco se bajan sus propios 2,3 MB: once megas para
         traer exactamente lo mismo. Eso era el atasco.

         Mandando el primero SOLO, él deja la copia hecha; los que siguen
         la encuentran lista y salen de una. */
      const primero = cola.shift();
      if (primero) await uno(primero);
      if (!vivo) return;

      const obrero = async () => {
        while (cola.length) {
          const proy = cola.shift()!;
          await uno(proy);
          if (!vivo) return;
        }
      };
      /* Ya con la copia hecha, el resto de a cinco. */
      await Promise.all([obrero(), obrero(), obrero(), obrero(), obrero()]);
      if (!vivo) return;
      setCargandoAsis(false);
    })();
    return () => { vivo = false; };
  }, [claveVisibles, anioVista, pestana, recarga]);

  /* ── Informes por código de deportista ─────────────────────────────────── */
  const infoPorCodigo = useMemo(() => {
    const m = new Map<string, { total: number; inf1: boolean; inf2: boolean; ultima: string }>();
    evals.forEach(e => {
      const c = String(e.codigo ?? '').trim().toUpperCase();
      if (!c) return;
      const a = m.get(c) ?? { total: 0, inf1: false, inf2: false, ultima: '' };
      a.total += 1;
      const n = String(e.numeroInforme ?? '').trim();
      if (n === '1' || /^informe\s*1/i.test(n)) a.inf1 = true;
      if (n === '2' || /^informe\s*2/i.test(n)) a.inf2 = true;
      const f = String(e.fecha ?? '').slice(0, 10);
      if (f && f > a.ultima) a.ultima = f;
      m.set(c, a);
    });
    return m;
  }, [evals]);

  /* ── Microciclos por proyecto ──────────────────────────────────────────── */
  const microsPorProyecto = useMemo(() => {
    const m = new Map<string, Microciclo[]>();
    micros.forEach(mc => {
      const p = String(mc.proyecto ?? '').trim();
      if (!p) return;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(mc);
    });
    m.forEach(lista => lista.sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio))));
    return m;
  }, [micros]);

  const lunesDeEstaSemana = useMemo(() => lunesDe(new Date()), []);

  /* ── EL CUADRO: una fila por grupo ─────────────────────────────────────── */
  const filas = useMemo<FilaGrupo[]>(() => {
    return proyectosVisibles.map(proy => {
      const delGrupo = deps.filter(d => esActivo(d) && proyectoDe(d) === proy);

      /* Asistencia del mes */
      /* OJO con el `?? {}`: si se deja pelado, TypeScript ya no sabe qué hay
         dentro y trata cada día como "desconocido". Se le dice el tipo. */
      const dias: ResumenAsistenciaDia[] = Object.values(asis[proy] ?? ({} as Record<string, ResumenAsistenciaDia>));
      /* Un día CANCELADO no es una falla del formador: él avisó. */
      const cuentan = dias.filter(d => !d.cancelado);
      const sinLlenar = cuentan.filter(d => d.sinRegistro).length;
      const conReg = cuentan.filter(d => !d.sinRegistro);
      const promedio = conReg.length
        ? Math.round(conReg.reduce((s, d) => s + (d.porcentaje || 0), 0) / conReg.length)
        : 0;

      /* Microciclos */
      const mcs = microsPorProyecto.get(proy) ?? [];
      const ultima = mcs[0]?.fecha_inicio ? String(mcs[0].fecha_inicio).slice(0, 10) : '';
      const alDia = mcs.some(mc => String(mc.fecha_inicio).slice(0, 10) === lunesDeEstaSemana);

      /* Informes */
      let conInf1 = 0, conInf2 = 0, sinNada = 0;
      delGrupo.forEach(d => {
        const i = infoPorCodigo.get(codigoDe(d).toUpperCase());
        if (!i || i.total === 0) { sinNada += 1; return; }
        if (i.inf1) conInf1 += 1;
        if (i.inf2) conInf2 += 1;
      });

      return {
        proyecto: proy,
        profe: profePorProyecto.get(proy) || '',
        programa: programaDe(delGrupo[0] ?? ({} as Deportista)) || '',
        activos: delGrupo.length,
        diasConRegistro: conReg.length,
        diasSinLlenar: sinLlenar,
        promedio,
        semanas: mcs.length,
        ultimaSemana: ultima,
        semanaAlDia: alDia,
        conInf1, conInf2, sinNada,
      };
    });
  }, [proyectosVisibles, deps, asis, microsPorProyecto, infoPorCodigo, profePorProyecto, lunesDeEstaSemana]);

  /* ── Los deportistas de un grupo, con sus faltas y sus informes ─────────── */
  const detalleDe = useCallback((proy: string) => {
    const delGrupo = deps.filter(d => esActivo(d) && proyectoDe(d) === proy);

    /* ── CUÁNTAS ASISTIÓ DE CUÁNTAS (dirección, 01/09/2026) ────────────────
       Antes esta lista solo decía cuántas veces faltó el niño, y un "0" no
       dice nada: puede ser un niño perfecto o un mes en que no hubo
       entrenamiento. Ahora dice 8/10, que es lo que se entiende de una.

       CÓMO SE SACA. La base guarda, por cada día, quiénes FALTARON — no
       quiénes fueron. Así que:
            asistió = días de entrenamiento  −  las veces que faltó
       Los días que cuentan son los que el formador SÍ llenó. Un día que él
       marcó como cancelado, o uno que no alcanzó a llenar, no se le cobran al
       niño: no fue culpa suya. */
    /* Se recorre el AÑO entero y se va repartiendo por mes: cuántos días de
       entrenamiento hubo en cada mes, y cuántas veces faltó cada niño en cada
       uno. Con eso sale el 8/10 de cada casilla. */
    const diasPorMes = new Map<string, number>();          // '2026-08' → 9
    const faltasPorIdMes = new Map<string, number>();      // 'idNiño|2026-08' → 3
    let diasBase = 0;                                       // los del mes escogido arriba
    const faltasPorId = new Map<string, { veces: number; motivos: Record<string, number> }>();

    Object.values(asis[proy] ?? ({} as Record<string, ResumenAsistenciaDia>)).forEach((dia: ResumenAsistenciaDia) => {
      if (dia.cancelado || dia.sinRegistro) return;
      const suMes = String(dia.fecha ?? '').slice(0, 7);
      diasPorMes.set(suMes, (diasPorMes.get(suMes) ?? 0) + 1);
      const esDelMesEscogido = suMes === mes;
      if (esDelMesEscogido) diasBase += 1;

      (dia.lista ?? []).forEach(f => {
        const k = `${f.id}|${suMes}`;
        faltasPorIdMes.set(k, (faltasPorIdMes.get(k) ?? 0) + 1);
        if (!esDelMesEscogido) return;
        const a = faltasPorId.get(f.id) ?? { veces: 0, motivos: {} };
        a.veces += 1;
        const mot = String(f.motivo ?? '').trim() || 'Sin motivo';
        a.motivos[mot] = (a.motivos[mot] ?? 0) + 1;
        faltasPorId.set(f.id, a);
      });
    });
    return delGrupo.map(d => {
      const cod = codigoDe(d);
      const inf = infoPorCodigo.get(cod.toUpperCase());
      const fal = faltasPorId.get(d.id) ?? { veces: 0, motivos: {} };
      const motivoTop = Object.entries(fal.motivos).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      /* Nunca menos de cero, por si un niño entró a mitad de mes y aparece
         como faltante en días en que todavía no estaba. */
      const asistio = Math.max(0, diasBase - fal.veces);
      /* Una casilla por mes de la temporada: asistió / de cuántas. */
      const porMes: Record<string, { fue: number; de: number }> = {};
      mesesTemporada(anioVista).forEach(({ clave }) => {
        const de  = diasPorMes.get(clave) ?? 0;
        const fue = Math.max(0, de - (faltasPorIdMes.get(`${d.id}|${clave}`) ?? 0));
        porMes[clave] = { fue, de };
      });
      return {
        id: d.id,
        codigo: cod,
        nombre: String(d._nombre ?? '').toUpperCase(),
        porMes,
        asistio,
        deCuantas: diasBase,
        faltas: fal.veces,
        motivo: motivoTop,
        inf1: !!inf?.inf1,
        inf2: !!inf?.inf2,
        total: inf?.total ?? 0,
        ultima: inf?.ultima ?? '',
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [deps, asis, infoPorCodigo, mes, anioVista]);

  /* ── Totales de arriba ─────────────────────────────────────────────────── */
  const totales = useMemo(() => {
    const grupos = filas.length;
    const deportistas = filas.reduce((s, f) => s + f.activos, 0);
    const sinLlenar = filas.reduce((s, f) => s + f.diasSinLlenar, 0);
    const sinMicro = filas.filter(f => !f.semanaAlDia).length;
    const sinInforme = filas.reduce((s, f) => s + f.sinNada, 0);
    const conReg = filas.filter(f => f.diasConRegistro > 0);
    const prom = conReg.length
      ? Math.round(conReg.reduce((s, f) => s + f.promedio, 0) / conReg.length) : 0;
    return { grupos, deportistas, sinLlenar, sinMicro, sinInforme, prom };
  }, [filas]);

  const nombresProfes = useMemo(
    () => [...new Set(profes.map(p => (p.nombre || p.usuario || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [profes],
  );

  /* ── Pintado ───────────────────────────────────────────────────────────── */
  const colorPct = (p: number) => (p >= 85 ? VERDECL : p >= 70 ? AMBAR : ROJO);

  return (
    <div className="min-h-screen pb-16" style={{ background: LIENZO }}>

      <header className="sticky top-0 z-30 px-4 py-3 flex flex-wrap items-center gap-3"
        style={{ background: 'linear-gradient(to right, #333F50, #0EA142)' }}>
        <button onClick={() => router.back()} title="Volver"
          className="shrink-0 rounded-lg p-2 transition hover:opacity-80"
          style={{ background: 'rgba(255,255,255,.16)' }}>
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-[15px] sm:text-base leading-tight uppercase">
            Consolidado{soyProfe && miNombre ? ` · ${miNombre.toUpperCase()}` : ''}
          </h1>
          <p className="text-white/70 text-[11px] font-semibold leading-tight">
            {soyProfe
              ? `Tus grupos: asistencia, microciclos e informes · ${totales.grupos} ${totales.grupos === 1 ? 'grupo' : 'grupos'}`
              : `Todos los grupos de la academia · ${totales.grupos} ${totales.grupos === 1 ? 'grupo' : 'grupos'}`}
          </p>
        </div>
        <button onClick={cargarTodo} disabled={cargando}
          className="rounded-lg px-3 py-2 flex items-center gap-1.5 text-white text-[11.5px] font-black transition hover:brightness-110 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,.16)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> ACTUALIZAR
        </button>
      </header>

      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1180 }}>

        {error && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
            style={{ background: 'rgba(192,80,77,.18)', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
            <p className="text-white text-[12px] font-semibold">{error}</p>
          </div>
        )}

        {/* ── Tarjetas de arriba: el resumen de todo ─────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          {[
            { t: 'GRUPOS',            v: String(totales.grupos),        c: '#fff',  s: cargandoDeps ? 'contando deportistas…' : `${totales.deportistas} deportistas` },
            { t: 'ASISTENCIA',        v: `${totales.prom}%`,            c: colorPct(totales.prom), s: mesBonito(mes) },
            { t: 'DÍAS SIN LLENAR',   v: String(totales.sinLlenar),     c: totales.sinLlenar ? ROJO : VERDECL, s: 'del mes escogido' },
            { t: 'SIN INFORME',       v: cargandoDeps ? '…' : String(totales.sinInforme), c: totales.sinInforme && !cargandoDeps ? AMBAR : VERDECL, s: 'deportistas' },
          ].map(k => (
            <div key={k.t} className="rounded-xl px-3.5 py-3"
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <p className="text-[9.5px] font-black tracking-widest" style={{ color: GRIS }}>{k.t}</p>
              <p className="font-black text-[24px] leading-tight mt-0.5" style={{ color: k.c }}>{k.v}</p>
              <p className="text-[10.5px] font-semibold" style={{ color: GRIS }}>{k.s}</p>
            </div>
          ))}
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[190px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: GRIS }} />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar grupo o formador…"
              style={{ background: CAMPO, border: `1px solid ${BORDE}`, height: 36 }}
              className="w-full pl-8 pr-3 rounded-lg text-[12px] text-white placeholder:text-white/30 outline-none" />
          </div>
          {buscar && (
            <button onClick={() => setBuscar('')} className="rounded-lg flex items-center justify-center"
              style={{ width: 36, height: 36, background: CAMPO, border: `1px solid ${BORDE}` }}>
              <X className="w-4 h-4 text-white" />
            </button>
          )}

          {/* EL FORMADOR NO VE ESTA LISTA: sus grupos son los suyos y punto. */}
          {!soyProfe && (
            <select value={fProfe} onChange={e => setFProfe(e.target.value)}
              title="Ver solo los grupos de un formador"
              style={{ height: 36, background: fProfe ? AMBAR : CAMPO, border: `1px solid ${fProfe ? AMBAR : BORDE}` }}
              className="shrink-0 rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS FORMADORES</option>
              {nombresProfes.map(n => (
                <option key={n} value={n} style={{ color: '#111827', backgroundColor: 'white' }}>{n.toUpperCase()}</option>
              ))}
            </select>
          )}

          <select value={mes} onChange={e => setMes(e.target.value)}
            title="El mes de la asistencia"
            style={{ height: 36, background: CAMPO, border: `1px solid ${BORDE}` }}
            className="shrink-0 rounded-lg px-2 text-white text-[11.5px] font-black outline-none cursor-pointer">
            {ultimosMeses(12).map(m => (
              <option key={m} value={m} style={{ color: '#111827', backgroundColor: 'white' }}>{mesBonito(m)}</option>
            ))}
          </select>
        </div>

        {/* ── Las tres pestañas ─────────────────────────────────────────── */}
        <div className="flex gap-1.5 mb-3">
          {([
            ['asistencia',  'ASISTENCIA',  CalendarCheck],
            ['microciclos', 'MICROCICLOS', CalendarDays],
            ['informes',    'INFORMES',    ClipboardList],
          ] as const).map(([k, l, Icono]) => (
            <button key={k} onClick={() => setPestana(k)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-black transition"
              style={{
                background: pestana === k ? VERDE : CAMPO,
                border: `1px solid ${pestana === k ? VERDE : BORDE}`,
                color: '#fff',
              }}>
              <Icono className="w-3.5 h-3.5" /> {l}
            </button>
          ))}
        </div>

        {cargandoDeps && (
          <p className="text-[11.5px] font-semibold mb-2 flex items-center gap-2" style={{ color: GRIS }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Trayendo los deportistas de cada grupo… van apareciendo uno por uno.
          </p>
        )}

        {cargandoAsis && pestana === 'asistencia' && (
          <p className="text-[11.5px] font-semibold mb-2 flex items-center gap-2" style={{ color: GRIS }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Leyendo la asistencia… {avanceAsis.hechos} de {avanceAsis.total} grupos
          </p>
        )}

        {pestana === 'microciclos' && (
          <p className="text-[11.5px] font-semibold mb-2 rounded-lg px-3 py-2"
            style={{ color: '#E6EAF0', background: CAMPO, border: `1px solid ${BORDE}` }}>
            El microciclo es la planeación de la <b>semana del grupo</b>, no de cada niño.
            Por eso aquí el detalle va por semana y no por deportista.
          </p>
        )}

        {/* ── EL CUADRO POR GRUPO ───────────────────────────────────────── */}
        {cargando && filas.length === 0 ? (
          <div className="rounded-2xl py-14 text-center" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2" style={{ color: GRIS }} />
            <p className="text-white/50 text-[13px] font-semibold">Cargando…</p>
          </div>
        ) : filas.length === 0 ? (
          <div className="rounded-2xl py-14 text-center px-6" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
            <Users className="w-9 h-9 mx-auto mb-3" style={{ color: GRIS }} />
            <p className="text-white font-black text-[14px]">
              {soyProfe ? 'No tienes grupos asignados' : 'Ningún grupo coincide'}
            </p>
            <p className="text-white/50 text-[12.5px] mt-1">
              {soyProfe
                ? 'Habla con la dirección para que te asignen tus proyectos.'
                : 'Prueba quitando el filtro o la búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filas.map(f => {
              const desplegado = abierto === f.proyecto;
              return (
                <div key={f.proyecto} className="rounded-xl overflow-hidden"
                  style={{ background: PANEL, border: `1px solid ${desplegado ? VERDE : BORDE}` }}>

                  {/* ── El renglón del grupo ── */}
                  <button
                    onClick={() => setAbierto(desplegado ? '' : f.proyecto)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left transition hover:brightness-110">
                    <ChevronRight className="w-4 h-4 shrink-0 transition"
                      style={{ color: GRIS, transform: desplegado ? 'rotate(90deg)' : 'none' }} />

                    <div className="min-w-0" style={{ width: 190 }}>
                      <p className="text-white font-black text-[13.5px] truncate">{f.proyecto}</p>
                      <p className="text-[11px] font-semibold truncate" style={{ color: GRIS }}>
                        {cargandoDeps ? 'contando…' : `${f.activos} deportistas`}
                        {!soyProfe && f.profe ? ` · ${f.profe}` : ''}
                      </p>
                    </div>

                    {/* Los números cambian según la pestaña */}
                    {pestana === 'asistencia' && (
                      <div className="flex-1 flex flex-wrap items-center justify-end gap-2">
                        <span className="font-black text-[19px]" style={{ color: colorPct(f.promedio) }}>
                          {f.diasConRegistro ? `${f.promedio}%` : '—'}
                        </span>
                        <span className="text-[11px] font-semibold" style={{ color: GRIS }}>
                          {f.diasConRegistro} {f.diasConRegistro === 1 ? 'día llenado' : 'días llenados'}
                        </span>
                        {f.diasSinLlenar > 0 ? (
                          <span className="text-[10.5px] font-black rounded px-2 py-1"
                            style={{ background: ROJO, color: '#fff' }}>
                            {f.diasSinLlenar} SIN LLENAR
                          </span>
                        ) : f.diasConRegistro > 0 && (
                          <span className="text-[10.5px] font-black rounded px-2 py-1"
                            style={{ background: VERDE, color: '#fff' }}>AL DÍA</span>
                        )}
                      </div>
                    )}

                    {pestana === 'microciclos' && (
                      <div className="flex-1 flex flex-wrap items-center justify-end gap-2">
                        <span className="font-black text-[19px] text-white">{f.semanas}</span>
                        <span className="text-[11px] font-semibold" style={{ color: GRIS }}>
                          {f.semanas === 1 ? 'semana cargada' : 'semanas cargadas'}
                          {f.ultimaSemana ? ` · última ${f.ultimaSemana}` : ''}
                        </span>
                        <span className="text-[10.5px] font-black rounded px-2 py-1"
                          style={{ background: f.semanaAlDia ? VERDE : AMBAR, color: f.semanaAlDia ? '#fff' : CAMPO }}>
                          {f.semanaAlDia ? 'ESTA SEMANA LISTA' : 'FALTA ESTA SEMANA'}
                        </span>
                      </div>
                    )}

                    {pestana === 'informes' && (
                      <div className="flex-1 flex flex-wrap items-center justify-end gap-2">
                        <span className="text-[11px] font-black rounded px-2 py-1"
                          style={{ background: CAMPO, color: VERDECL, border: `1px solid ${BORDE}` }}>
                          INF 1 · {cargandoDeps ? '…' : `${f.conInf1}/${f.activos}`}
                        </span>
                        <span className="text-[11px] font-black rounded px-2 py-1"
                          style={{ background: CAMPO, color: VERDECL, border: `1px solid ${BORDE}` }}>
                          INF 2 · {cargandoDeps ? '…' : `${f.conInf2}/${f.activos}`}
                        </span>
                        {!cargandoDeps && f.sinNada > 0 && (
                          <span className="text-[10.5px] font-black rounded px-2 py-1"
                            style={{ background: AMBAR, color: CAMPO }}>
                            {f.sinNada} SIN NINGUNO
                          </span>
                        )}
                      </div>
                    )}
                  </button>

                  {/* ── EL DETALLE: niño por niño (o semana por semana) ── */}
                  {desplegado && (
                    <div className="px-4 pb-4" style={{ background: CAMPO }}>
                      {pestana === 'microciclos' ? (
                        <DetalleMicrociclos lista={microsPorProyecto.get(f.proyecto) ?? []} lunesHoy={lunesDeEstaSemana} />
                      ) : (
                        <DetalleDeportistas filas={detalleDe(f.proyecto)} pestana={pestana}
                          meses={mesesTemporada(anioVista)} cargando={cargandoDeps} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-[11px] mt-6 leading-relaxed" style={{ color: GRIS }}>
          En el renglón de cada grupo, el porcentaje es del <b>mes escogido</b> arriba.
          Abriendo el grupo se ven <b>todos los meses del año</b>, de febrero a diciembre.<br />
          Cada casilla dice <b>cuántas asistió de cuántas</b>. Un mes sin entrenamientos sale con un punto.
          Los días que el formador marcó como <b>cancelados</b>, o que no alcanzó a llenar, no se le cuentan al deportista.
        </p>
      </main>
    </div>
  );
}

/* ── Detalle: los deportistas del grupo ────────────────────────────────── */
function DetalleDeportistas({ filas, pestana, meses, cargando }: {
  filas: { id: string; codigo: string; nombre: string;
           porMes: Record<string, { fue: number; de: number }>;
           asistio: number; deCuantas: number; faltas: number; motivo: string;
           inf1: boolean; inf2: boolean; total: number; ultima: string }[];
  pestana: Pestana;
  meses: { clave: string; corto: string }[];
  cargando: boolean;
}) {
  /* MIENTRAS LAS FICHAS VIENEN EN CAMINO no se dice "no tiene deportistas":
     eso asusta y además es mentira. Se dice que están llegando. */
  if (!filas.length && cargando) {
    return (
      <p className="text-white/45 text-[12.5px] font-semibold py-4 text-center flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Trayendo los deportistas de este grupo…
      </p>
    );
  }
  if (!filas.length) {
    return <p className="text-white/45 text-[12.5px] font-semibold py-4 text-center">Este grupo no tiene deportistas activos.</p>;
  }
  /* EN ASISTENCIA EL CUADRO SE CORRE PARA EL LADO: son once meses más el
     nombre, y en un portátil no caben. El nombre y el código se quedan
     clavados a la izquierda para no perder de vista de quién es el renglón. */
  const anchoMes = 52;
  return (
    <div className="rounded-lg mt-1" style={{ border: `1px solid ${BORDE}`, overflowX: 'auto' }}>
      <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-black tracking-wider"
        style={{ background: VERDE, color: '#fff', width: 'max-content', minWidth: '100%' }}>
        <span style={{ width: 66, position: 'sticky', left: 0, background: VERDE }}>CÓDIGO</span>
        <span style={{ width: 178, position: 'sticky', left: 66, background: VERDE }}>DEPORTISTA</span>
        {pestana === 'asistencia'
          ? <>{meses.map(m => (
                <span key={m.clave} style={{ width: anchoMes, textAlign: 'center' }}>{m.corto}</span>
              ))}
              <span style={{ width: 74, textAlign: 'center' }}>AÑO</span></>
          : <><span style={{ width: 52, textAlign: 'center' }}>INF 1</span>
              <span style={{ width: 52, textAlign: 'center' }}>INF 2</span>
              <span style={{ width: 92 }}>ÚLTIMO</span></>}
      </div>
      {filas.map((d, i) => {
        const fondo = i % 2 ? PANEL : '#36404F';
        /* El total del año: la suma de todos los meses. */
        const anioFue = meses.reduce((s2, m) => s2 + (d.porMes[m.clave]?.fue ?? 0), 0);
        const anioDe  = meses.reduce((s2, m) => s2 + (d.porMes[m.clave]?.de  ?? 0), 0);
        return (
        <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-[12px]"
          style={{ background: fondo, borderTop: `1px solid ${BORDE}55`, width: 'max-content', minWidth: '100%' }}>
          <span className="font-black tracking-wider" style={{ width: 66, color: VERDECL, position: 'sticky', left: 0, background: fondo }}>{d.codigo || '—'}</span>
          <span className="text-white font-semibold truncate" style={{ width: 178, position: 'sticky', left: 66, background: fondo }}>{d.nombre}</span>
          {pestana === 'asistencia' ? (
            <>
              {meses.map(m => {
                const c2 = d.porMes[m.clave] ?? { fue: 0, de: 0 };
                /* Un mes sin entrenamientos no se pinta de rojo: no hubo. */
                const col = c2.de === 0 ? GRIS
                          : c2.fue === c2.de ? VERDECL
                          : c2.fue / c2.de >= 0.7 ? AMBAR : ROJO;
                return (
                  <span key={m.clave} className="font-black text-[11.5px]"
                    style={{ width: 52, textAlign: 'center', color: col }}>
                    {c2.de === 0 ? '·' : `${c2.fue}/${c2.de}`}
                  </span>
                );
              })}
              <span className="font-black text-[12.5px]" style={{
                width: 74, textAlign: 'center',
                color: anioDe === 0 ? GRIS : anioFue === anioDe ? VERDECL : anioFue / anioDe >= 0.7 ? AMBAR : ROJO,
              }}>
                {anioDe === 0 ? '—' : `${anioFue}/${anioDe}`}
              </span>
            </>
          ) : (
            <>
              <span style={{ width: 52, textAlign: 'center', color: d.inf1 ? VERDECL : ROJO }} className="font-black">
                {d.inf1 ? '✓' : '—'}
              </span>
              <span style={{ width: 52, textAlign: 'center', color: d.inf2 ? VERDECL : ROJO }} className="font-black">
                {d.inf2 ? '✓' : '—'}
              </span>
              <span style={{ width: 92, color: GRIS }}>{d.ultima || '—'}</span>
            </>
          )}
        </div>
        );
      })}
    </div>
  );
}

/* ── Detalle: las semanas del grupo ────────────────────────────────────── */
function DetalleMicrociclos({ lista, lunesHoy }: { lista: Microciclo[]; lunesHoy: string }) {
  if (!lista.length) {
    return <p className="text-white/45 text-[12.5px] font-semibold py-4 text-center">Este grupo todavía no tiene ningún microciclo cargado.</p>;
  }
  return (
    <div className="rounded-lg overflow-hidden mt-1" style={{ border: `1px solid ${BORDE}` }}>
      <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-black tracking-wider"
        style={{ background: VERDE, color: '#fff' }}>
        <span style={{ width: 56 }}>SEMANA</span>
        <span style={{ width: 106 }}>DESDE</span>
        <span style={{ width: 106 }}>HASTA</span>
        <span className="flex-1">OBJETIVO</span>
        <span style={{ width: 78, textAlign: 'center' }}>DÍAS</span>
      </div>
      {lista.slice(0, 16).map((mc, i) => {
        const esta = String(mc.fecha_inicio).slice(0, 10) === lunesHoy;
        return (
          <div key={mc.id} className="flex items-center gap-3 px-3 py-2 text-[12px]"
            style={{ background: esta ? 'rgba(0,176,80,.16)' : i % 2 ? PANEL : '#36404F', borderTop: `1px solid ${BORDE}55` }}>
            <span className="font-black" style={{ width: 56, color: esta ? VERDECL : '#fff' }}>#{mc.numero || '—'}</span>
            <span style={{ width: 106, color: GRIS }}>{String(mc.fecha_inicio ?? '').slice(0, 10) || '—'}</span>
            <span style={{ width: 106, color: GRIS }}>{String(mc.fecha_fin ?? '').slice(0, 10) || '—'}</span>
            <span className="flex-1 text-white/85 truncate">{mc.objetivo_general || <span style={{ color: GRIS }}>sin objetivo escrito</span>}</span>
            <span className="font-black" style={{ width: 78, textAlign: 'center', color: (mc.dias?.length ?? 0) ? VERDECL : GRIS }}>
              {mc.dias?.length ?? '—'}
            </span>
          </div>
        );
      })}
      {lista.length > 16 && (
        <p className="text-center text-[11px] py-2" style={{ color: GRIS, background: PANEL }}>
          … y {lista.length - 16} semanas más atrás
        </p>
      )}
    </div>
  );
}
