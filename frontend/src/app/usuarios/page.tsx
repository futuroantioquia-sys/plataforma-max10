'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle, Plus, Eye, EyeOff, Users, X, Trash2, ChevronRight } from 'lucide-react';
import { getProfes, saveProfes, deleteProfe, getDeportistas, getFichasProyecto, saveFichaProyecto,
  horaFinEntreno, minutosDeEntreno,
  SEDES_ENTRENO, usaHorarioPorDia, minutosEnSede,
  getHorariosPorDia, saveHorariosPorDia,
  minutosDeHoraTexto, horaTextoDeMinutos } from '@/lib/db';
import type { Profe, Deportista, HorariosPorDia, HorarioDia } from '@/lib/db';
import { useSoloLectura } from '@/lib/permisos';

const PROYECTOS_META_KEY = 'futuro_proyectos_meta';
/* La última hora que se puso, para ofrecerla de primera. Casi todos los
   proyectos de una misma sede entran a la misma hora, así que el atajo ahorra
   media docena de clics por renglón. — dirección, 02/09/2026 */
const LLAVE_ULTIMA_HORA = 'futuro-ultima-hora-entreno';
const SEDES = ['Santa Mónica', 'La 80', 'Centro', 'Sabaneta', 'Bello Niquía', 'Rionegro', 'Institucional'];
const DIAS_SEMANA_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_ORDEN_JS = [1, 2, 3, 4, 5, 6, 0];
const ANIOS_NACIMIENTO = Array.from({ length: 14 }, (_, i) => 2011 + i); // 2011–2024
const ORDEN_PROGRAMA = ['Estimulación', 'Formación', 'Progresión', 'Selección', 'Desarrollo'];

/* ── LAS HORAS EN QUE SE PUEDE ARRANCAR UN ENTRENAMIENTO ──────────────────
   (dirección, 02/09/2026)

   De 7:30 de la mañana a 8 de la noche, de media en media hora. Antes
   arrancaba a las 6, y la dirección la subió: nadie entrena a esa hora y
   quedaban tres renglones de sobra que había que pasar cada vez.

   Es una lista y no una casilla libre a propósito: escribiendo a mano entran
   "4:30pm", "16:30", "4 30 PM" y "430", y después nada cuadra a la hora de
   sumar. */
const HORAS_ENTRENO: string[] = (() => {
  const out: string[] = [];
  for (let m = 7 * 60 + 30; m <= 20 * 60; m += 30) {
    const h24 = Math.floor(m / 60);
    const mm  = String(m % 60).padStart(2, '0');
    const ap  = h24 >= 12 ? 'PM' : 'AM';
    const h   = h24 % 12 === 0 ? 12 : h24 % 12;
    out.push(`${h}:${mm} ${ap}`);
  }
  return out;
})();

/* PRE-PROGRESIÓN SE SACÓ DE ESTE MÓDULO (dirección, 02/09/2026). No es un
   programa vivo: su único renglón era un "Retirado" con cero deportistas, y el
   botón sobraba en la barra. Si algún día vuelve a existir, se quita de esta
   lista y reaparece solo, sin tocar nada más. */
const PROGRAMAS_OCULTOS = ['pre-progresion', 'pre progresion', 'preprogresion'];

const sinTildesProg = (x: any) => String(x ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const programaOculto = (p: string) => PROGRAMAS_OCULTOS.includes(sinTildesProg(p));

/* Los anchos del cuadro. Viven aquí, en un solo sitio, para que TODOS los
   programas los usen iguales. Para ensanchar una columna se cambia aquí. */
const COLS_PROY = [
  { h: 'PROYECTO',        w: 150 },
  { h: '# DEP',           w: 80  },
  { h: 'SEDE',            w: 170 },
  /* HORARIO (dirección, 02/09/2026): se escribe la hora de ENTRADA y la de
     salida sale sola —hora y media, o una hora en Estimulación—. */
  /* Se ensanchó de 190 a 240: en Progresión, Selección y Desarrollo aquí va
     el resumen de la sede y la hora de CADA día. — 03/09/2026 */
  { h: 'HORARIO',         w: 240 },
  { h: 'EDAD',            w: 200 },
  { h: 'DÍAS ENTRENO',    w: 250 },
  { h: 'NOMBRE FORMADOR', w: 240 },
  { h: 'USUARIO',         w: 140 },
  { h: 'CONTRASEÑA',      w: 150 },
] as const;
const ANCHO_TOTAL = COLS_PROY.reduce((s, c) => s + c.w, 0);

function getCol(dep: any, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find((c: string) => rx.test(c.trim()));
  return k ? String(cols[k] ?? '') : '';
}

function uuid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function ordenProg(p: string) {
  const i = ORDEN_PROGRAMA.findIndex(x => x.toLowerCase() === p.trim().toLowerCase());
  return i >= 0 ? i : 999;
}

/** Conteo de deportistas por programa y por proyecto (activos y totales). Se recalcula
 *  cada vez que se vuelve a la pantalla, para reflejar altas/retiros al momento. */
function calcularConteos(deps: any[]) {
  const prog: Record<string, { act: number; tot: number }> = {};
  const proy: Record<string, { act: number; tot: number }> = {};
  /* Y el conteo del GRUPO COMPLETO, sin mirar el programa de cada ficha.
     Un grupo es uno solo aunque un par de sus deportistas estén marcados en
     otro programa; el renglón debe decir cuántos son en total.
     — dirección, 03/09/2026 */
  const grupo: Record<string, { act: number; tot: number }> = {};
  deps.forEach(dep => {
    const progRaw  = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
    const progDisp = progRaw === '__SIN_PROGRAMA__' ? 'Sin Programa' : progRaw;
    const p        = getCol(dep, /^proy/i).trim();
    const activo   = getCol(dep, /^estado/i).trim().toUpperCase() === 'ACTIVO';
    if (!prog[progDisp]) prog[progDisp] = { act: 0, tot: 0 };
    prog[progDisp].tot++; if (activo) prog[progDisp].act++;
    if (p) {
      const k = `${progRaw}::${p}`;
      if (!proy[k]) proy[k] = { act: 0, tot: 0 };
      proy[k].tot++; if (activo) proy[k].act++;
      if (!grupo[p]) grupo[p] = { act: 0, tot: 0 };
      grupo[p].tot++; if (activo) grupo[p].act++;
    }
  });
  return { prog, proy, grupo };
}

/* ── UN GRUPO PERTENECE A UN SOLO PROGRAMA ───────────────────────────────
   (dirección, 03/09/2026 — «filtro desarrollo y me aparecen grupos de
    formación que tienen algún deportista en selección o desarrollo. Estos
    grupos así tengan algún deportista en otro programa es de formación»)

   QUÉ PASABA. El cuadro se armaba mirando la ficha de cada deportista: por
   cada pareja PROGRAMA + PROYECTO que existiera, un renglón. Entonces un
   grupo de Formación con dos niños marcados en Desarrollo salía DOS veces:
   una en Formación y otra en Desarrollo, con los días y la sede repetidos y
   la mitad de los deportistas en cada una.

   LA REGLA — y por qué NO es la mayoría (dirección, 03/09/2026):
   «solo necesito que el proyecto 6, a pesar de tener deportistas en
    desarrollo, no apareciera como un programa de desarrollo sino de
    formación, ya que sus horarios son de formación».

   El proyecto 6 tiene 10 deportistas en Desarrollo y 6 en Formación. Por
   mayoría sería de Desarrollo, y está mal: es un grupo de Formación al que
   varios niños le subieron de programa pero SIGUEN entrenando ahí, con el
   horario de Formación. Eso pasa todo el tiempo — a un niño se le sube de
   programa, no se le cambia de grupo.

   Entonces el grupo es del programa MÁS BAJO de la escalera que tenga gente:
   Estimulación, Formación, Progresión, Selección, Desarrollo. Los que están
   marcados más arriba son deportistas prestados hacia arriba, no otro grupo.

   Se miran los ACTIVOS; si el grupo no tiene ninguno —los "Retirado"— se
   miran todos, que para algo hay que decidir.

   OJO SI ALGÚN DÍA FALLA. Un grupo de verdad de Desarrollo con UN niño
   marcado en Formación saldría en Formación. Hoy eso no pasa en ningún
   grupo; si llega a pasar, se corrige la ficha de ese niño. */
function programaDelGrupo(deps: any[]): Record<string, string> {
  const votos: Record<string, Record<string, { act: number; tot: number }>> = {};
  deps.forEach(dep => {
    const prog = getCol(dep, /^program/i).trim();
    const proy = getCol(dep, /^proy/i).trim();
    if (!proy || !prog) return;
    const activo = getCol(dep, /^estado/i).trim().toUpperCase() === 'ACTIVO';
    if (!votos[proy]) votos[proy] = {};
    if (!votos[proy][prog]) votos[proy][prog] = { act: 0, tot: 0 };
    votos[proy][prog].tot++;
    if (activo) votos[proy][prog].act++;
  });

  const out: Record<string, string> = {};
  Object.keys(votos).forEach(proy => {
    const lista = Object.entries(votos[proy]);
    const hayActivos = lista.some(([, v]) => v.act > 0);
    /* Solo cuentan los programas que de verdad tienen gente. */
    const vivos = lista.filter(([, v]) => (hayActivos ? v.act : v.tot) > 0);
    if (!vivos.length) return;
    vivos.sort((a, b) => {
      const oa = ordenProg(a[0]), ob = ordenProg(b[0]);
      if (oa !== ob) return oa - ob;               // gana el más bajo
      /* Dos nombres que no están en la escalera: gana el que tenga más. */
      return (hayActivos ? b[1].act : b[1].tot) - (hayActivos ? a[1].act : a[1].tot);
    });
    out[proy] = vivos[0][0];
  });
  return out;
}

/** Años de nacimiento (distintos, ordenados) de los deportistas de cada proyecto.
 *  Solo cuenta deportistas ACTIVOS (no retirados). */
function calcularAniosPorProyecto(deps: any[]): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  deps.forEach(dep => {
    const estado = getCol(dep, /^estado/i).trim().toUpperCase();
    if (estado === 'RETIRADO') return;
    const proy = getCol(dep, /^proy/i).trim();
    if (!proy) return;
    const raw = getCol(dep, /^a[ñn]o$/i).trim();
    const m = raw.match(/(19|20)\d{2}/);
    if (!m) return;
    if (!map[proy]) map[proy] = new Set();
    map[proy].add(m[0]);
  });
  const out: Record<string, string[]> = {};
  Object.entries(map).forEach(([k, s]) => { out[k] = Array.from(s).sort(); });
  return out;
}

interface ProyMeta {
  nombreFormador: string;
  sede: string;
  dias: number[];
  edades: number[];
  horario?: string;
  calificacion?: string;
}

interface ProyRow {
  programa: string;
  proyecto: string;
  profeId: string | null;
  profeUsuario: string;
  profeClave: string;
}

// BLINDAJE (22/08/2026): se eliminó la lista con las cédulas de los formadores.
// Estaba dentro del JavaScript que descarga cualquier visitante.

/* ── LO QUE LAS PROPIAS FICHAS SABEN DEL PROYECTO ────────────────────────────
   (dirección, 02/09/2026)

   Tercer sitio donde viven los días y la sede: DENTRO de la ficha de cada
   deportista. Esta misma pantalla los venía escribiendo ahí (columnas JORNADA
   y SEDE) cada vez que se guardaba. O sea que aunque la base de proyectos esté
   vacía, el dato existe — repartido entre los niños del grupo.

   Se toma lo que diga la MAYORÍA del grupo: si once fichas dicen SABANETA y una
   dice CENTRO, la sede del proyecto es SABANETA. Un dato suelto mal escrito no
   arrastra al grupo entero. */
function loQueDicenLasFichas(deps: Deportista[]): Record<string, { dias: number[]; sede: string }> {
  const votosSede: Record<string, Record<string, number>> = {};
  const votosDias: Record<string, Record<string, number>> = {};

  deps.forEach(dep => {
    const proy = getCol(dep, /^proy/i).trim();
    if (!proy) return;

    const sede = getCol(dep, /^sede/i).trim();
    if (sede) {
      if (!votosSede[proy]) votosSede[proy] = {};
      votosSede[proy][sede] = (votosSede[proy][sede] ?? 0) + 1;
    }

    /* La columna JORNADA guarda los días como texto: "[1,3,5]". */
    const cruda = getCol(dep, /^jornada/i).trim();
    if (cruda.startsWith('[')) {
      try {
        const arr = JSON.parse(cruda);
        if (Array.isArray(arr) && arr.length && arr.every(n => typeof n === 'number')) {
          const llave = JSON.stringify([...arr].sort((a, b) => a - b));
          if (!votosDias[proy]) votosDias[proy] = {};
          votosDias[proy][llave] = (votosDias[proy][llave] ?? 0) + 1;
        }
      } catch { /* jornada escrita de otra forma: no se cuenta */ }
    }
  });

  const masVotado = (o: Record<string, number> | undefined): string => {
    if (!o) return '';
    const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    return e ? e[0] : '';
  };

  const out: Record<string, { dias: number[]; sede: string }> = {};
  new Set([...Object.keys(votosSede), ...Object.keys(votosDias)]).forEach(proy => {
    let dias: number[] = [];
    const gan = masVotado(votosDias[proy]);
    if (gan) { try { dias = JSON.parse(gan); } catch { dias = []; } }
    out[proy] = { dias, sede: masVotado(votosSede[proy]) };
  });
  return out;
}

export default function UsuariosPage() {
  const router = useRouter();

  const [profes,      setProfes]      = useState<Profe[]>([]);
  const [proyRows,    setProyRows]    = useState<ProyRow[]>([]);
  const [meta,        setMeta]        = useState<Record<string, ProyMeta>>({});
  const [metaEdits,   setMetaEdits]   = useState<Record<string, Partial<ProyMeta>>>({});
  /* La última hora escogida, para ofrecerla de primera en el desplegable.
     Se guarda en ESTE computador: es una comodidad de quien está llenando el
     cuadro, no un dato de la academia. — dirección, 02/09/2026 */
  const [ultimaHora, setUltimaHora] = useState('');
  useEffect(() => {
    try { setUltimaHora(localStorage.getItem(LLAVE_ULTIMA_HORA) || ''); } catch { /* nada */ }
  }, []);

  /* ── HORARIO DÍA POR DÍA ────────────────────────────────────────────────
     (dirección, 03/09/2026 — «con los grupos de progresión, selección y
      desarrollo se hace más complejo ya que ellos entrenan por lo general en
      sedes y horas diferentes»)

     A esos tres programas la casilla HORARIO no les alcanza con una sola
     hora: el lunes están en el CDC a las 4:30 y el miércoles en el Bloque 19
     a las 5:00. Entonces a ellos la casilla les abre una pantalla con un
     renglón por día de entreno, con su sede y su hora.

     A los demás —Estimulación y Formación— no les cambia nada. */
  const [horariosDia, setHorariosDia] = useState<HorariosPorDia>({});
  const [modalHorario, setModalHorario] = useState<ProyRow | null>(null);
  useEffect(() => { getHorariosPorDia().then(setHorariosDia).catch(() => {}); }, []);

  function ponerHorario(row: ProyRow, v: string) {
    setMetaEdit(row, 'horario', v);
    if (!v) return;
    setUltimaHora(v);
    try { localStorage.setItem(LLAVE_ULTIMA_HORA, v); } catch { /* nada */ }
  }
  const [profeEdits,  setProfeEdits]  = useState<Record<string, { usuario?: string; clave?: string; nombre?: string }>>({});
  const [profesDirty, setProfesDirty] = useState(false); // reasignaciones de proyecto pendientes
  const [filtroPrograma, setFiltroPrograma] = useState('');
  /* POR FORMADOR (dirección, 02/09/2026): «anexa botón por profes para ubicar
     sus proyectos». Con 87 proyectos repartidos en cinco programas, buscar los
     de uno solo era leerlos todos. Guarda el USUARIO del profe, que es único. */
  const [filtroFormador, setFiltroFormador] = useState('');
  const [guardando,   setGuardando]   = useState(false);
  const [guardado,    setGuardado]    = useState(false);
  const [errorGuard,  setErrorGuard]  = useState('');
  const [claveVis,    setClaveVis]    = useState<Record<string, boolean>>({});
  const [agregando,   setAgregando]   = useState(false);
  const [nuevo,       setNuevo]       = useState({ usuario: '', clave: '', nombre: '' });
  const [verFormadores, setVerFormadores] = useState(false); // modal lista de formadores
  const soloLectura = useSoloLectura(); // contabilidad: solo puede ver, no editar

  // Conteos de deportistas por programa y por proyecto (activos y totales)
  const [conteos, setConteos] = useState<{
    prog:  Record<string, { act: number; tot: number }>;
    proy:  Record<string, { act: number; tot: number }>;
    /** Todo el grupo junto, sin mirar el programa de cada ficha. */
    grupo: Record<string, { act: number; tot: number }>;
  }>({ prog: {}, proy: {}, grupo: {} });
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set()); // programas desplegados (vacío = todos plegados)
  const [modoConteo, setModoConteo] = useState<'act' | 'tot'>('act'); // 'act' = activos (por defecto), 'tot' = todos
  const [aniosProy, setAniosProy] = useState<Record<string, string[]>>({}); // años de nacimiento por proyecto
  const [cargando,   setCargando]   = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    Promise.all([getProfes(), getDeportistas()]).then(([listaProfes, deps]) => {
      // Si la base no responde, no se inventan formadores: la lista queda vacía.
      setProfes(listaProfes);

      // Construir filas de proyectos desde deportistas
      const map: Record<string, Set<string>> = {};
      deps.forEach(dep => {
        const prog = getCol(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
        const proy = getCol(dep, /^proy/i).trim();
        if (!proy) return;
        if (!map[prog]) map[prog] = new Set();
        map[prog].add(proy);
      });

      // Conteos de deportistas por programa y por proyecto
      setConteos(calcularConteos(deps));
      setAniosProy(calcularAniosPorProyecto(deps));

      /* Cada grupo, en su programa y en ninguno más. — 03/09/2026 */
      const dueno = programaDelGrupo(deps);

      const rows: ProyRow[] = [];
      Object.entries(map)
        .sort(([a], [b]) => ordenProg(a) - ordenProg(b))
        .forEach(([programa, proySet]) => {
          [...proySet].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })).forEach(proyecto => {
            /* Si este grupo es de otro programa, aquí no se muestra: sale una
               sola vez, en el suyo. Si ninguna ficha dice el programa, no hay
               dueño y se deja como estaba. — dirección, 03/09/2026 */
            if (dueno[proyecto] && dueno[proyecto] !== programa) return;
            // ANTES decía `inicial`, una lista de formadores escrita a mano que se
            // eliminó el 22/08/2026 por seguridad (traía las cédulas). Al quitarla
            // quedó esta línea apuntando a una variable que ya no existe: el módulo
            // reventaba justo aquí, después de pintar los formadores y antes de
            // construir los proyectos. De ahí el "0 proyectos · 25 formadores".
            // Los datos nunca se perdieron. — 22/08/2026
            const profe = listaProfes.find(p => p.proyectos.includes(proyecto));
            rows.push({
              programa,
              proyecto,
              profeId:      profe?.id ?? null,
              profeUsuario: profe?.usuario ?? '',
              profeClave:   profe?.clave ?? '',
            });
          });
        });
      setProyRows(rows);

      /* ── DE DÓNDE SALEN LOS DÍAS Y LA SEDE ────────────────────────────
         (dirección, 02/09/2026 — «recuperar los días que entrena cada
          proyecto… debes llenar las sedes»)

         Antes salían de un solo sitio: la memoria de ESTE navegador. Por eso
         se veía todo vacío. Ahora se arma en cascada, y cada escalón le gana
         al anterior:

           1. Lo guardado en este navegador  (lo de siempre, de última)
           2. Lo que dicen las FICHAS de los deportistas del grupo
           3. La tabla de proyectos de la BASE  ← esta manda

         Así, si la base tiene el dato, ese vale. Si no, se rescata de las
         fichas. Y si tampoco, queda lo que hubiera en el navegador. */
      const base: Record<string, ProyMeta> = {};
      try {
        const raw = localStorage.getItem(PROYECTOS_META_KEY);
        if (raw) Object.assign(base, JSON.parse(raw));
      } catch {}

      const deFichas = loQueDicenLasFichas(deps);
      rows.forEach(r => {
        const k = `${r.programa}::${r.proyecto}`;
        const f = deFichas[r.proyecto];
        if (!f) return;
        const actual = base[k] ?? { nombreFormador: '', sede: '', dias: [], edades: [] };
        base[k] = {
          ...actual,
          sede: actual.sede || f.sede,
          dias: (actual.dias && actual.dias.length) ? actual.dias : f.dias,
        };
      });

      setMeta(base);          // se pinta ya, sin esperar a la base
      setCargando(false);

      /* Y por detrás, la base — que es la que manda. Llega y corrige. */
      getFichasProyecto().then(fichas => {
        if (!Object.keys(fichas).length) return;
        setMeta(prev => {
          const out = { ...prev };
          rows.forEach(r => {
            const info = fichas[r.proyecto];
            if (!info) return;
            const k = `${r.programa}::${r.proyecto}`;
            const actual = out[k] ?? { nombreFormador: '', sede: '', dias: [], edades: [] };
            out[k] = {
              ...actual,
              sede: info.sede || actual.sede,
              dias: (info.dias && info.dias.length) ? info.dias : actual.dias,
              nombreFormador: actual.nombreFormador || info.formador,
              /* La hora de entrada, si la base ya la tiene. — 02/09/2026 */
              horario: info.hora || actual.horario || '',
            };
          });
          try { localStorage.setItem(PROYECTOS_META_KEY, JSON.stringify(out)); } catch {}
          return out;
        });
      }).catch(() => { /* sin base: se queda con lo rescatado de las fichas */ });
    }).catch((e: any) => {
      // Sin este catch, cualquier error dejaba la pantalla vacía sin decir nada.
      console.error('[usuarios] no se pudo armar la lista de proyectos:', e);
      setErrorCarga(String(e?.message ?? e));
      setCargando(false);
    });
  }, []);

  // Refrescar los conteos al volver a la pantalla (refleja altas/retiros al momento)
  useEffect(() => {
    const refrescar = () => { getDeportistas().then(deps => { setConteos(calcularConteos(deps)); setAniosProy(calcularAniosPorProyecto(deps)); }).catch(() => {}); };
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') refrescar(); };
    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refrescar);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Migración (una sola vez): sube a la BD los nombres de formador que estaban solo en la
  // configuración local del navegador. Así aparecen en todas partes (incluido Vercel).
  // En un navegador sin esa config local, no encuentra nada y no hace nada.
  const migradoNombresRef = useRef(false);
  useEffect(() => {
    if (migradoNombresRef.current) return;
    if (profes.length === 0 || proyRows.length === 0) return;
    const actualizados = profes.map(p => {
      if (p.nombre && p.nombre.trim()) return p;
      const nm = nombreDeProfe(p);
      return nm ? { ...p, nombre: nm } : p;
    });
    const cambio = actualizados.some((p, i) => (p.nombre ?? '') !== (profes[i].nombre ?? ''));
    migradoNombresRef.current = true;
    if (cambio) {
      setProfes(actualizados);
      saveProfes(actualizados).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profes, proyRows, meta]);

  // ── Helpers ────────────────────────────────────────────────────
  function metaKey(row: ProyRow): string {
    return `${row.programa}::${row.proyecto}`;
  }

  function getMetaVal<K extends keyof ProyMeta>(row: ProyRow, field: K): ProyMeta[K] {
    const k = metaKey(row);
    const edit = metaEdits[k];
    if (edit && field in edit) return edit[field] as ProyMeta[K];
    const saved = meta[k];
    if (saved && field in saved) return saved[field] as ProyMeta[K];
    if (field === 'dias' || field === 'edades') return [] as unknown as ProyMeta[K];
    return '' as unknown as ProyMeta[K];
  }

  function setMetaEdit(row: ProyRow, field: keyof ProyMeta, value: unknown) {
    const k = metaKey(row);
    setMetaEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: value } }));
  }

  function getDias(row: ProyRow): number[] {
    return getMetaVal(row, 'dias') as number[];
  }

  function toggleDia(row: ProyRow, jsDay: number) {
    const curr   = getDias(row);
    const newDias = curr.includes(jsDay) ? curr.filter(d => d !== jsDay) : [...curr, jsDay].sort();
    setMetaEdit(row, 'dias', newDias);
    // Auto-save para que /asistencia lo lea de inmediato
    try { localStorage.setItem(`futuro_dias_${row.proyecto}`, JSON.stringify(newDias)); } catch {}
  }

  function getEdades(row: ProyRow): number[] {
    return getMetaVal(row, 'edades') as number[];
  }

  /** Etiqueta corta del día: 1 → "LUN". */
  function nombreDia(jsDay: number): string {
    const i = DIAS_ORDEN_JS.indexOf(jsDay);
    return (i >= 0 ? DIAS_SEMANA_LABELS[i] : '').toUpperCase();
  }

  /** Lo que hay puesto día por día, en el orden de la semana. */
  function porDiaDe(row: ProyRow): { dia: number; sede: string; ini: string; fin: string }[] {
    const guardado = horariosDia[row.proyecto] ?? {};
    return getDias(row)
      .slice()
      .sort((a, b) => DIAS_ORDEN_JS.indexOf(a) - DIAS_ORDEN_JS.indexOf(b))
      .map(d => {
        const h = guardado[String(d)];
        const sede = h?.sede ?? '';
        const ini  = h?.hora ?? '';
        const m    = minutosDeHoraTexto(ini);
        return {
          dia: d, sede, ini,
          fin: (m >= 0 && sede) ? horaTextoDeMinutos(m + minutosEnSede(sede, row.programa)) : '',
        };
      });
  }

  /** Guarda el horario por día de UN proyecto, sin tocar el de los demás. */
  async function guardarHorarioDia(row: ProyRow, valores: Record<string, HorarioDia>) {
    /* Se lee el mapa completo de la base antes de escribir: si otro
       computador puso el horario de otro proyecto mientras esta pantalla
       estaba abierta, no se le borra. */
    let base: HorariosPorDia = {};
    try { base = await getHorariosPorDia(); } catch { base = horariosDia; }
    const nuevo: HorariosPorDia = { ...base, [row.proyecto]: valores };
    const ok = await saveHorariosPorDia(nuevo);
    if (ok) setHorariosDia(nuevo);
    /* La casilla HORARIO de siempre se queda con la hora del PRIMER día, para
       que todo lo que lee una sola hora —la ficha del proyecto— siga
       funcionando. Se aplica al oprimir GUARDAR arriba, como todo lo demás. */
    const primera = getDias(row)
      .slice().sort((a, b) => DIAS_ORDEN_JS.indexOf(a) - DIAS_ORDEN_JS.indexOf(b))
      .map(d => valores[String(d)]?.hora).find(h => !!h);
    if (primera) setMetaEdit(row, 'horario', primera);
    return ok;
  }

  function toggleEdad(row: ProyRow, anio: number) {
    const curr = getEdades(row);
    if (curr.includes(anio))    setMetaEdit(row, 'edades', curr.filter(a => a !== anio));
    else if (curr.length < 5)   setMetaEdit(row, 'edades', [...curr, anio].sort());
  }

  function getProfeVal(row: ProyRow, field: 'usuario' | 'clave'): string {
    if (!row.profeId) return '';
    const edit = profeEdits[row.profeId];
    if (edit && field in edit) return edit[field] ?? '';
    return field === 'usuario' ? row.profeUsuario : row.profeClave;
  }

  function setProfeEdit(row: ProyRow, field: 'usuario' | 'clave', value: string) {
    if (!row.profeId) return;
    setProfeEdits(prev => ({ ...prev, [row.profeId!]: { ...prev[row.profeId!], [field]: value } }));
  }

  /** Nombre completo conocido de un profe: su campo `nombre`, o el que ya tenga
   *  escrito en algún proyecto que le pertenezca. Sirve para autocompletar al reasignar. */
  function nombreDeProfe(profe: Profe | undefined): string {
    if (!profe) return '';
    if (profe.nombre && profe.nombre.trim()) return profe.nombre.trim();
    for (const r of proyRows) {
      if (r.profeId === profe.id) {
        const nm = String(getMetaVal(r, 'nombreFormador') || '').trim();
        if (nm) return nm;
      }
    }
    return '';
  }

  /** Nombre a mostrar en la columna "Nombre del formador".
   *  Si el proyecto tiene profe asignado → es el "Nombre completo" del profe (relación directa).
   *  Si no tiene profe → texto libre del proyecto. */
  function getNombreFormador(row: ProyRow): string {
    if (row.profeId) {
      const edit = profeEdits[row.profeId];
      if (edit && edit.nombre !== undefined) return edit.nombre;
      const profe = profes.find(p => p.id === row.profeId);
      return nombreDeProfe(profe);
    }
    return getMetaVal(row, 'nombreFormador') as string;
  }

  /** Editar el nombre en la tabla actualiza el "Nombre completo" del profe (se refleja en
   *  todos sus proyectos y en "Ver formadores"). Si no hay profe, queda como texto del proyecto. */
  function setNombreFormador(row: ProyRow, value: string) {
    if (row.profeId) {
      setProfeEdits(prev => ({ ...prev, [row.profeId!]: { ...prev[row.profeId!], nombre: value.toUpperCase() } }));
    } else {
      setMetaEdit(row, 'nombreFormador', value);
    }
  }

  // ── Guardar ────────────────────────────────────────────────────
  async function guardar() {
    setGuardando(true); setErrorGuard('');

    // 1. Meta → localStorage
    const newMeta: Record<string, ProyMeta> = { ...meta };
    Object.entries(metaEdits).forEach(([k, edits]) => {
      newMeta[k] = {
        nombreFormador: '', sede: '', dias: [], edades: [],
        ...(newMeta[k] ?? {}),
        ...edits,
      };
      const proy = k.split('::').slice(1).join('::');
      if (proy && Array.isArray(newMeta[k].dias)) {
        try { localStorage.setItem(`futuro_dias_${proy}`, JSON.stringify(newMeta[k].dias)); } catch {}
      }
    });
    localStorage.setItem(PROYECTOS_META_KEY, JSON.stringify(newMeta));
    setMeta(newMeta);

    /* ── Y AHORA SÍ, A LA BASE ─────────────────────────────────────────────
       (dirección, 02/09/2026)

       Aquí estaba el hueco por el que se perdían los días: se guardaban en el
       navegador y en las fichas, pero NUNCA en la tabla de proyectos. Al
       cambiar de computador, o al limpiar el navegador, desaparecían.

       Se escribe solo lo que USTED tocó en esta sesión —no las 87 filas—, y si
       alguna no se puede guardar se dice con nombre propio en vez de fingir
       que quedó. */
    const tocados = Object.keys(metaEdits);
    if (tocados.length) {
      const fallaron: string[] = [];
      for (const k of tocados) {
        const proy = k.split('::').slice(1).join('::');
        if (!proy) continue;
        const m = newMeta[k];
        const ok = await saveFichaProyecto(proy, {
          dias: Array.isArray(m?.dias) ? m.dias : [],
          sede: String(m?.sede ?? ''),
          nombre_formador: String(m?.nombreFormador ?? ''),
          hora: String(m?.horario ?? ''),
        });
        if (!ok) fallaron.push(proy);
      }
      if (fallaron.length) {
        setErrorGuard(
          `Quedó guardado en este computador, pero NO en la base: ${fallaron.slice(0, 4).join(', ')}` +
          (fallaron.length > 4 ? ` y ${fallaron.length - 4} más.` : '.'),
        );
        setTimeout(() => setErrorGuard(''), 12000);
      }
    }

    setMetaEdits({});

    // 2. Profes → Supabase
    if (Object.keys(profeEdits).length > 0 || profesDirty) {
      const updatedProfes = profes.map(p => {
        const edit = profeEdits[p.id];
        if (!edit) return p;
        return {
          ...p,
          usuario: (edit.usuario !== undefined ? edit.usuario : p.usuario).toUpperCase(),
          clave:    edit.clave   !== undefined ? edit.clave   : p.clave,
          nombre:   edit.nombre  !== undefined ? edit.nombre  : (p.nombre ?? ''),
        };
      });
      const { ok, msg } = await saveProfes(updatedProfes);
      if (!ok) { setErrorGuard(msg ?? 'Error al guardar'); setTimeout(() => setErrorGuard(''), 8000); }
      setProfes(updatedProfes);
      setProyRows(prev => prev.map(row => {
        if (!row.profeId) return row;
        const edit = profeEdits[row.profeId];
        if (!edit) return row;
        return {
          ...row,
          profeUsuario: (edit.usuario !== undefined ? edit.usuario : row.profeUsuario).toUpperCase(),
          profeClave:    edit.clave   !== undefined ? edit.clave   : row.profeClave,
        };
      }));
      setProfeEdits({});
      setProfesDirty(false);
    }

    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  function agregarProfe() {
    if (!nuevo.usuario.trim() || !nuevo.clave.trim() || !nuevo.nombre.trim()) return;
    const p: Profe = {
      id: uuid(),
      usuario: nuevo.usuario.trim().toUpperCase(),
      clave: nuevo.clave.trim(),
      nombre: nuevo.nombre.trim().toUpperCase(),
      proyectos: [],
    };
    const nuevos = [...profes, p];
    setProfes(nuevos);
    saveProfes(nuevos).catch(() => {}); // persistir el nuevo formador de una vez
    setNuevo({ usuario: '', clave: '', nombre: '' });
    setAgregando(false);
  }

  /** Elimina un formador (botón de borrar en la ventana de formadores). */
  async function eliminarProfe(id: string, usuario: string) {
    if (!confirm(`¿Eliminar al formador "${usuario}"? Esta acción no se puede deshacer.`)) return;
    const nuevos = profes.filter(p => p.id !== id);
    setProfes(nuevos);
    setProyRows(prev => prev.map(r => r.profeId === id ? { ...r, profeId: null, profeUsuario: '', profeClave: '' } : r));
    await deleteProfe(id);
  }

  /** Asigna (o cambia) el formador de un proyecto desde el desplegable de Usuario. */
  function asignarProfe(row: ProyRow, profeId: string) {
    const profe = profes.find(p => p.id === profeId);
    // Actualizar los arreglos de proyectos: quitar este proyecto a todos y dárselo al elegido
    const nuevos = profes.map(p => {
      const sinEste = p.proyectos.filter(pr => pr !== row.proyecto);
      if (profe && p.id === profe.id) return { ...p, proyectos: [...sinEste, row.proyecto] };
      return { ...p, proyectos: sinEste };
    });
    setProfes(nuevos);
    setProfesDirty(true);
    // Actualizar la fila visible
    setProyRows(prev => prev.map(r =>
      (r.programa === row.programa && r.proyecto === row.proyecto)
        ? { ...r, profeId: profe?.id ?? null, profeUsuario: profe?.usuario ?? '', profeClave: profe?.clave ?? '' }
        : r
    ));
    // El nombre del formador se deriva del profe (relación directa), no hace falta fijarlo aquí.
  }

  const programas = useMemo(() => {
    const set = new Set<string>();
    proyRows.forEach(r => {
      if (r.programa !== '__SIN_PROGRAMA__' && !programaOculto(r.programa)) set.add(r.programa);
    });
    return [...set].sort((a, b) => ordenProg(a) - ordenProg(b));
  }, [proyRows]);

  /* Los formadores que de verdad tienen proyectos, con cuántos lleva cada uno.
     No se lista a los 25: al que no tiene ninguno no hay para qué buscarlo. */
  const formadoresConProyecto = useMemo(() => {
    const cuenta = new Map<string, number>();
    proyRows.forEach(r => {
      if (programaOculto(r.programa)) return;
      const u = (r.profeUsuario || '').toUpperCase().trim();
      if (!u) return;
      cuenta.set(u, (cuenta.get(u) ?? 0) + 1);
    });
    return [...cuenta.entries()]
      .map(([usuario, cuantos]) => ({ usuario, cuantos }))
      .sort((a, b) => a.usuario.localeCompare(b.usuario, 'es'));
  }, [proyRows]);

  const gruposDisplay = useMemo(() => {
    let filtered = proyRows.filter(r => !programaOculto(r.programa));
    if (filtroPrograma) filtered = filtered.filter(r => r.programa === filtroPrograma);
    if (filtroFormador) filtered = filtered.filter(r => (r.profeUsuario || '').toUpperCase() === filtroFormador);
    const map: Record<string, ProyRow[]> = {};
    filtered.forEach(row => {
      const prog = row.programa === '__SIN_PROGRAMA__' ? 'Sin Programa' : row.programa;
      if (!map[prog]) map[prog] = [];
      map[prog].push(row);
    });
    return Object.entries(map).sort(([a], [b]) => ordenProg(a) - ordenProg(b));
  }, [proyRows, filtroPrograma, filtroFormador]);

  const hayEdits = Object.keys(metaEdits).length > 0 || Object.keys(profeEdits).length > 0 || profesDirty;
  /* ── LA PALETA OFICIAL DE LA PLATAFORMA (dirección, 02/09/2026) ──────────
     Este módulo se había quedado con el verde viejo (#16a34a) y con grises
     claros de cuando la plataforma era blanca. Queda con los mismos colores de
     Contabilidad, Asistencia y Torneos, para que se vea todo de la misma casa. */
  const G     = '#00B050';   // verde institucional
  const PANEL = '#3C4759';   // tarjetas y renglones
  const GRIS  = '#7C879A';   // lo que está sin llenar
  const AMBAR = '#E0A33A';   // el número de deportistas
  const CAMPO = '#2B3547';   // el fondo de las casillas
  const BORDE = '#4A5568';   // el borde de las casillas
  /* Las listas que se despliegan las pinta Windows, no la página: se les dice
     fondo blanco y letra oscura para que no queden blanco sobre blanco. */
  const OPC   = { color: '#111827', backgroundColor: 'white' } as const;
  const BW = '2px solid white';
  const inputCls = 'w-full bg-transparent outline-none text-white font-semibold text-[11px] px-1.5 py-1 rounded hover:bg-[#2B3547] focus:bg-[#2B3547] transition';

  function toggleAbierto(prog: string) {
    setAbiertos(prev => {
      const n = new Set(prev);
      if (n.has(prog)) n.delete(prog); else n.add(prog);
      return n;
    });
  }

  return (
    <div className="min-h-screen bg-[#333F50]">

      {/* Header */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-usr2" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-usr2)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Información de Proyectos y Formadores</h1>
          <p className="text-white/60 text-xs">{proyRows.length} proyectos · {profes.length} formadores</p>
        </div>
        {!soloLectura && (
        <div className="relative flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setAgregando(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Plus className="w-3.5 h-3.5" /> Nuevo formador
          </button>
          <button onClick={() => setVerFormadores(true)}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition">
            <Users className="w-3.5 h-3.5" /> Ver formadores
          </button>
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={guardar} disabled={guardando}
              className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl transition shadow-sm ${
                guardado   ? 'bg-[#3C4759] text-[#5BE39B]'
                : errorGuard ? 'bg-red-500 text-white'
                : 'bg-[#3C4759] text-[#5BE39B] hover:bg-[#2B3547]'}`}>
              {guardando ? 'Guardando…' : guardado ? <><CheckCircle className="w-3.5 h-3.5" />¡Guardado!</> : <><Save className="w-3.5 h-3.5" />Guardar cambios</>}
            </button>
            {errorGuard && <span className="text-red-200 text-[9px] max-w-[180px] text-right leading-tight">{errorGuard}</span>}
          </div>
        </div>
        )}
      </header>

      {/* Modal nuevo formador */}
      {agregando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#3C4759] rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-black text-white text-lg mb-4">Nuevo formador</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-black text-white/40 uppercase tracking-widest">Nombre completo</label>
                <input value={nuevo.nombre}
                  onChange={e => setNuevo(p => ({ ...p, nombre: e.target.value.toUpperCase() }))}
                  placeholder="NOMBRE Y APELLIDOS"
                  className="mt-1 w-full border border-[#4A5568] rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-[11px] font-black text-white/40 uppercase tracking-widest">Usuario (apellido)</label>
                <input value={nuevo.usuario}
                  onChange={e => setNuevo(p => ({ ...p, usuario: e.target.value.toUpperCase() }))}
                  placeholder="APELLIDO"
                  className="mt-1 w-full border border-[#4A5568] rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-[11px] font-black text-white/40 uppercase tracking-widest">Contraseña</label>
                <input value={nuevo.clave}
                  onChange={e => setNuevo(p => ({ ...p, clave: e.target.value }))}
                  placeholder="Número de cédula"
                  className="mt-1 w-full border border-[#4A5568] rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setAgregando(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#4A5568] text-sm font-bold text-white/70 hover:bg-[#333F50] transition">Cancelar</button>
              <button onClick={agregarProfe}
                className="flex-1 py-2.5 rounded-xl bg-[#00B050] text-white text-sm font-bold hover:bg-[#0EA142] transition">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: lista de formadores creados (ver / editar usuario y contraseña) */}
      {verFormadores && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setVerFormadores(false)}>
          <div className="bg-[#3C4759] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#4A5568] flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-black text-white text-lg">Formadores creados</h2>
                <p className="text-xs text-white/40">{profes.length} formadores · edita nombre, usuario y contraseña</p>
              </div>
              <button onClick={() => setVerFormadores(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {profes.length === 0 && <p className="text-center text-sm text-white/40 py-6">Aún no hay formadores creados.</p>}
              {[...profes].sort((a, b) => a.usuario.localeCompare(b.usuario, 'es')).map(p => {
                const u = profeEdits[p.id]?.usuario ?? p.usuario;
                const c = profeEdits[p.id]?.clave ?? p.clave;
                const vis = !!claveVis['fm-' + p.id];
                return (
                  <div key={p.id} className="rounded-xl border border-[#4A5568] p-3 bg-[#333F50]">
                    <div className="flex items-end gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Nombre completo</label>
                        <input value={profeEdits[p.id]?.nombre ?? nombreDeProfe(p)}
                          onChange={e => setProfeEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], nombre: e.target.value.toUpperCase() } }))}
                          placeholder="NOMBRE Y APELLIDOS"
                          className="mt-1 w-full border border-[#4A5568] rounded-lg px-3 py-2 text-sm font-bold text-white bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <button type="button" onClick={() => eliminarProfe(p.id, p.usuario)}
                        title="Eliminar formador"
                        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-[rgba(192,80,77,.14)] text-[#F08A87] hover:bg-[rgba(192,80,77,.20)] border border-[rgba(192,80,77,.45)] transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Usuario (apellido)</label>
                        <input value={u}
                          onChange={e => setProfeEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], usuario: e.target.value.toUpperCase() } }))}
                          className="mt-1 w-full border border-[#4A5568] rounded-lg px-3 py-2 text-sm font-bold text-white bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Contraseña</label>
                        <div className="relative mt-1">
                          <input type={vis ? 'text' : 'password'} value={c}
                            onChange={e => setProfeEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], clave: e.target.value } }))}
                            className="w-full border border-[#4A5568] rounded-lg px-3 py-2 pr-9 text-sm font-bold text-white bg-[#3C4759] focus:outline-none focus:ring-2 focus:ring-green-500" />
                          <button type="button" onClick={() => setClaveVis(prev => ({ ...prev, ['fm-' + p.id]: !prev['fm-' + p.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                            {vis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    {p.proyectos && p.proyectos.length > 0 && (
                      <p className="text-[11px] text-white/70 mt-2 truncate">📋 Proyectos: {p.proyectos.join(', ')}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-[#4A5568] flex justify-end gap-2 flex-shrink-0">
              <button onClick={() => setVerFormadores(false)}
                className="px-4 py-2 rounded-xl border border-[#4A5568] text-sm font-bold text-white/70 hover:bg-[#333F50] transition">Cerrar</button>
              <button onClick={() => { guardar(); setVerFormadores(false); }} disabled={guardando || !hayEdits}
                className="px-4 py-2 rounded-xl bg-[#00B050] text-white text-sm font-bold hover:bg-[#0EA142] disabled:opacity-40 transition flex items-center gap-1.5">
                <Save className="w-4 h-4" /> Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="px-3 py-4 space-y-5">

        {/* Filtro programa */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Programa:</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroPrograma('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                !filtroPrograma ? 'bg-[#00B050] text-white border-[#00B050]' : 'bg-[#3C4759] text-white/70 border-[#4A5568] hover:border-[#00B050]'}`}>
              Todos
            </button>
            {programas.map(p => (
              <button key={p} onClick={() => setFiltroPrograma(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                  filtroPrograma === p ? 'bg-[#00B050] text-white border-[#00B050]' : 'bg-[#3C4759] text-white/70 border-[#4A5568] hover:border-[#00B050]'}`}>
                {p}
              </button>
            ))}

            {/* ── POR FORMADOR ─────────────────────────────────────────────
                (dirección, 02/09/2026) Con 87 proyectos, ubicar los de un
                formador era leerlos todos. Se escoge aquí y el cuadro se queda
                solo con los suyos. Se combina con el programa: "los de MARTIN,
                de Desarrollo". */}
            <select
              value={filtroFormador}
              onChange={e => setFiltroFormador(e.target.value)}
              title="Ver solo los proyectos de un formador"
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer outline-none ${
                filtroFormador ? 'bg-[#E0A33A] text-[#111827] border-[#E0A33A]' : 'bg-[#3C4759] text-white/70 border-[#4A5568] hover:border-[#00B050]'}`}>
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS FORMADORES</option>
              {formadoresConProyecto.map(f => (
                <option key={f.usuario} value={f.usuario} style={{ color: '#111827', backgroundColor: 'white' }}>
                  {f.usuario} · {f.cuantos} {f.cuantos === 1 ? 'proyecto' : 'proyectos'}
                </option>
              ))}
            </select>

            {(filtroPrograma || filtroFormador) && (
              <button onClick={() => { setFiltroPrograma(''); setFiltroFormador(''); }}
                title="Quitar los filtros"
                className="px-3 py-1.5 rounded-xl text-xs font-black border transition
                  bg-[#3C4759] text-white/70 border-[#4A5568] hover:border-[#00B050]">
                ✕ VER TODOS
              </button>
            )}
          </div>

          {/* Toggle Activos / Todos (por defecto: Activos) */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">Contar:</span>
            <div className="flex bg-[#3C4759] border border-[#4A5568] rounded-xl overflow-hidden">
              <button onClick={() => setModoConteo('act')}
                className={`px-3 py-1.5 text-xs font-black transition ${modoConteo === 'act' ? 'bg-[#00B050] text-white' : 'text-white/70 hover:bg-[#333F50]'}`}>Activos</button>
              <button onClick={() => setModoConteo('tot')}
                className={`px-3 py-1.5 text-xs font-black transition ${modoConteo === 'tot' ? 'bg-[#0EA142] text-white' : 'text-white/70 hover:bg-[#333F50]'}`}>Todos</button>
            </div>
          </div>
        </div>

        {/* Tabla por programa */}
        {gruposDisplay.length === 0 ? (
          <div className="bg-[#3C4759] rounded-2xl border border-[#4A5568] shadow-sm p-16 text-center">
            {cargando ? (
              <p className="text-white/40 font-semibold text-sm">Cargando proyectos…</p>
            ) : errorCarga ? (
              <div className="space-y-3">
                <p className="text-[#F08A87] font-black text-sm">No se pudo cargar la lista de proyectos.</p>
                <p className="text-white/70 text-xs max-w-md mx-auto break-words">{errorCarga}</p>
                <button onClick={() => window.location.reload()}
                  className="bg-[#00B050] text-white font-black text-xs px-4 py-2 rounded-lg hover:bg-[#0EA142] transition">
                  Reintentar
                </button>
              </div>
            ) : (
              <p className="text-white/40 font-semibold text-sm">
                Se leyeron los deportistas, pero ninguno tiene proyecto asignado.<br/>
                Revisa la columna PROY en el consolidado de afiliados.
              </p>
            )}
          </div>
        ) : gruposDisplay.map(([programa, filas]) => {
          const pc = conteos.prog[programa]?.[modoConteo] ?? 0;
          return (
          <div key={programa} className="rounded-2xl shadow-sm border border-[#4A5568] overflow-hidden">

            {/* Cabecera programa (título fijo) */}
            <div style={{ background: 'linear-gradient(to right, #333F50, #0EA142)' }}
              className="w-full px-5 py-2.5 flex items-center gap-3">
              <span className="text-white font-black text-sm uppercase tracking-widest">{programa}</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {filas.length} proyecto{filas.length !== 1 ? 's' : ''}
              </span>
              <span className="flex-1" />
              <span className="flex items-center gap-1 bg-white/20 text-white text-xs font-black px-2.5 py-0.5 rounded-full flex-shrink-0" title="Deportistas en el programa">
                <Users className="w-3.5 h-3.5" /> {pc}
              </span>
            </div>

            <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
              {/* ── LAS COLUMNAS, IGUALES EN TODOS LOS PROGRAMAS ────────────
                  (dirección, 02/09/2026 — «las columnas de cada programa están
                   diferentes, no alineadas»)

                  Cada programa pinta su propio cuadro, y con `minWidth` cada
                  uno repartía el ancho según lo que le tocara adentro: si en
                  Desarrollo había un nombre largo, esa columna crecía solo ahí
                  y los cuadros quedaban desparejos uno debajo del otro.

                  Con `tableLayout: fixed` y este `colgroup`, los anchos los
                  manda esta lista y NO el contenido. Todos los programas
                  quedan cuadrados. De paso PROYECTO pasa de 64 a 150: con 64
                  las etiquetas salían cortadas ("SUB 12E", "Retirad…"). */}
              <table className="w-full border-collapse" style={{ minWidth: ANCHO_TOTAL, tableLayout: 'fixed' }}>
                <colgroup>
                  {COLS_PROY.map(c => <col key={c.h} style={{ width: c.w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    {COLS_PROY.map(({ h }) => (
                      <th key={h} style={{ border: BW, background: G, position: 'sticky', top: 0, zIndex: 2 }}
                        className="px-3 py-2 text-left text-white font-black text-[10px] uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((row, iFila) => {
                    const sede          = getMetaVal(row, 'sede') as string;
                    /* La hora de entrada y la de salida, que se calcula. */
                    const horaIni       = String(getMetaVal(row, 'horario') ?? '');
                    const horaFin       = horaFinEntreno(horaIni, row.programa);
                    const nombreFormador = getMetaVal(row, 'nombreFormador') as string;
                    const dias          = getDias(row);
                    const edades        = getEdades(row);
                    const idVis         = `${row.proyecto}_clave`;
                    const visible       = !!claveVis[idVis];

                    return (
                      /* EL RENGLÓN ERA BLANCO (dirección, 02/09/2026). La
                         pantalla se pasó a oscuro pero estas filas se quedaron
                         con el gris claro de antes, y encima con letra blanca
                         en unas casillas y negra en otras. Ahora van en los dos
                         grises de la plataforma, uno sí y uno no, para poder
                         seguir el renglón con el ojo. */
                      <tr key={row.proyecto} style={{ background: iFila % 2 ? PANEL : '#36404F', borderTop: BW }}>

                        {/* PROYECTO — solo el código, recuadro verde con letra blanca */}
                        <td style={{ border: BW, padding: '4px 6px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 58, height: 34, padding: 0,
                            background: G, color: '#fff',
                            fontWeight: 900, fontSize: '1.1rem', lineHeight: 1,
                            borderRadius: 9, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            whiteSpace: 'nowrap',
                          }}>
                            {row.proyecto}
                          </span>
                        </td>

                        {/* # DEP — cantidad de deportistas, recuadro naranja, número blanco grande */}
                        <td style={{ border: BW, padding: '4px 6px', textAlign: 'center' }}>
                          <span title="Deportistas en el grupo" style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 42, height: 34, padding: '0 10px',
                            background: AMBAR, color: '#111827',
                            fontWeight: 900, fontSize: '1.1rem', lineHeight: 1,
                            borderRadius: 9, boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          }}>
                            {/* TODO el grupo, no solo los que tienen marcado
                                este programa en su ficha. Antes un grupo de
                                Formación con dos niños en Desarrollo mostraba
                                la cuenta partida en dos renglones.
                                — dirección, 03/09/2026 */}
                            {conteos.grupo[row.proyecto]?.[modoConteo]
                              ?? conteos.proy[`${row.programa}::${row.proyecto}`]?.[modoConteo] ?? 0}
                          </span>
                        </td>

                        {/* SEDE */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <select
                            value={sede}
                            onChange={e => setMetaEdit(row, 'sede', e.target.value)}
                            style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.7rem', color: sede ? '#fff' : GRIS, cursor: 'pointer' }}>
                            <option value="" style={OPC}>— Sede —</option>
                            {SEDES.map(s => <option key={s} value={s} style={OPC}>{s}</option>)}
                          </select>
                        </td>

                        {/* ── HORARIO DE ENTRENAMIENTO ──────────────────────
                            (dirección, 02/09/2026)

                            Se escoge la hora de ENTRADA. La de salida no se
                            escribe: la pone la plataforma sumando lo que dura
                            el entrenamiento de ese programa —hora y media, y
                            una hora en Estimulación—.

                            Se guarda solo la de entrada. Guardar las dos sería
                            guardar dos veces la misma cuenta, y algún día una
                            de las dos quedaría mal. */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          {/* PROGRESIÓN · SELECCIÓN · DESARROLLO — entrenan en
                              sedes y horas distintas cada día, así que aquí no
                              va una hora sino un botón que abre la pantalla del
                              horario por día. — dirección, 03/09/2026 */}
                          {usaHorarioPorDia(row.programa) ? (() => {
                            const lineas = porDiaDe(row);
                            const puestos = lineas.filter(l => l.sede && l.ini).length;
                            return (
                              <button
                                onClick={() => setModalHorario(row)}
                                title="Poner la sede y la hora de cada día"
                                style={{ width: '100%', textAlign: 'left', cursor: 'pointer',
                                         background: CAMPO, border: `1px solid ${puestos ? BORDE : AMBAR}`,
                                         borderRadius: 8, padding: '5px 7px' }}>
                                {lineas.length === 0 ? (
                                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: AMBAR }}>
                                    Marca primero los días de entreno
                                  </span>
                                ) : (
                                  <>
                                    {lineas.map(l => (
                                      <div key={l.dia} style={{ fontSize: '0.63rem', fontWeight: 800,
                                                                lineHeight: 1.5, whiteSpace: 'nowrap',
                                                                overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <span style={{ color: GRIS, display: 'inline-block', width: 26 }}>
                                          {nombreDia(l.dia)}
                                        </span>
                                        {l.sede && l.ini
                                          ? <span style={{ color: '#fff' }}>
                                              {l.sede} · <span style={{ color: '#5BE39B' }}>{l.ini} – {l.fin}</span>
                                            </span>
                                          : <span style={{ color: AMBAR }}>sin poner</span>}
                                      </div>
                                    ))}
                                  </>
                                )}
                              </button>
                            );
                          })() : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={horaIni}
                              onChange={e => ponerHorario(row, e.target.value)}
                              title={`Hora en que arranca el entrenamiento. ${row.programa} entrena ${minutosDeEntreno(row.programa) === 60 ? '1 hora' : '1 hora y media'}.`}
                              style={{ background: CAMPO, border: `1px solid ${BORDE}`, borderRadius: 7,
                                       padding: '3px 5px', outline: 'none', fontWeight: 800,
                                       fontSize: '0.7rem', color: horaIni ? '#fff' : GRIS, cursor: 'pointer' }}>
                              <option value="" style={OPC}>— poner —</option>
                              {/* EL ÚLTIMO QUE SE USÓ, DE PRIMERO (dirección,
                                  02/09/2026). Los proyectos de una misma sede
                                  suelen entrar a la misma hora. */}
                              {!!ultimaHora && (
                                <optgroup label="EL ÚLTIMO QUE USASTE" style={OPC}>
                                  <option value={ultimaHora} style={OPC}>{ultimaHora}</option>
                                </optgroup>
                              )}
                              <optgroup label={ultimaHora ? 'LAS DEMÁS' : 'HORA DE ENTRADA'} style={OPC}>
                                {HORAS_ENTRENO.filter(h => h !== ultimaHora)
                                  .map(h => <option key={h} value={h} style={OPC}>{h}</option>)}
                              </optgroup>
                            </select>
                            {horaFin ? (
                              <>
                                <span style={{ color: GRIS, fontWeight: 900, fontSize: '0.7rem' }}>a</span>
                                <span style={{ fontWeight: 900, fontSize: '0.7rem', color: '#5BE39B',
                                               whiteSpace: 'nowrap' }}>{horaFin}</span>
                              </>
                            ) : null}
                          </div>
                          )}
                        </td>

                        {/* EDAD — años de nacimiento de los deportistas del proyecto (automático) */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.72rem', color: '#fff', whiteSpace: 'nowrap' }}>
                            {(aniosProy[row.proyecto] && aniosProy[row.proyecto].length) ? aniosProy[row.proyecto].join(' / ') : '—'}
                          </span>
                        </td>

                        {/* DÍAS ENTRENO */}
                        <td style={{ border: BW, padding: '6px 8px' }}>
                          <div className="flex gap-1 flex-wrap">
                            {DIAS_ORDEN_JS.map((jsDay, i) => {
                              const sel = dias.includes(jsDay);
                              return (
                                <button key={jsDay} onClick={() => toggleDia(row, jsDay)}
                                  className={`w-7 h-7 rounded text-[9px] font-black transition select-none ${
                                    sel ? 'bg-[#00B050] text-white shadow-sm' : 'bg-[#2B3547] text-white/70 hover:bg-[#4A5568]'
                                  }`}>
                                  {DIAS_SEMANA_LABELS[i].slice(0, 2)}
                                </button>
                              );
                            })}
                          </div>
                        </td>

                        {/* NOMBRE FORMADOR — solo lectura (se edita en "Ver formadores") */}
                        <td style={{ border: BW, padding: '8px 12px' }}>
                          {getNombreFormador(row)
                            ? <span className="font-semibold text-white text-[11px]">{getNombreFormador(row)}</span>
                            : <span className="text-white/40 text-[10px] italic">— (edítalo en Ver formadores)</span>}
                        </td>

                        {/* USUARIO */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          <select
                            value={row.profeId ?? ''}
                            onChange={e => asignarProfe(row, e.target.value)}
                            style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.7rem', color: row.profeId ? '#fff' : GRIS, cursor: 'pointer' }}>
                            <option value="" style={OPC}>— Sin asignar —</option>
                            {[...profes].sort((a, b) => a.usuario.localeCompare(b.usuario)).map(p => (
                              <option key={p.id} value={p.id} style={OPC}>{p.usuario}</option>
                            ))}
                          </select>
                        </td>

                        {/* CONTRASEÑA */}
                        <td style={{ border: BW, padding: '4px 6px' }}>
                          {row.profeId ? (
                            <div className="flex items-center gap-1">
                              <input
                                type={visible ? 'text' : 'password'}
                                value={getProfeVal(row, 'clave')}
                                onChange={e => setProfeEdit(row, 'clave', e.target.value)}
                                placeholder="•••• (vacío = no cambiar)"
                                title="Por seguridad la contraseña no se muestra. Escribe una nueva solo si quieres cambiarla."
                                className={`flex-1 bg-transparent outline-none font-semibold text-[11px] px-1.5 py-1 rounded hover:bg-[#2B3547] focus:bg-[#2B3547] transition text-white`}
                              />
                              <button onClick={() => setClaveVis(v => ({ ...v, [idVis]: !v[idVis] }))}
                                className="text-white/40 hover:text-white/70 p-0.5 flex-shrink-0">
                                {visible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-white/40 text-[10px] italic px-1.5">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          );
        })}

      </main>

      {/* Barra inferior fija con botón Guardar (solo para quien puede editar) */}
      {!soloLectura && (
      <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur border-t border-[#4A5568] px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-white/70">
          {hayEdits ? '⚠️ Tienes cambios sin guardar' : '✓ Todo guardado'}
        </span>
        <button onClick={guardar} disabled={guardando}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm shadow transition ${
            guardado ? 'bg-green-600 text-white'
            : errorGuard ? 'bg-red-500 text-white'
            : 'bg-[#00B050] text-white hover:bg-[#0EA142]'}`}>
          {guardando ? 'Guardando…' : guardado ? <><CheckCircle className="w-4 h-4" />¡Guardado!</> : <><Save className="w-4 h-4" />Guardar cambios</>}
        </button>
      </div>
      )}

      {/* Horario día por día — Progresión, Selección y Desarrollo */}
      {modalHorario && (
        <PantallaHorarioDia
          proyecto={modalHorario.proyecto}
          programa={modalHorario.programa}
          dias={getDias(modalHorario)}
          valores={horariosDia[modalHorario.proyecto] ?? {}}
          onCerrar={() => setModalHorario(null)}
          onGuardar={async v => {
            const row = modalHorario;
            const ok = await guardarHorarioDia(row, v);
            if (ok) setModalHorario(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANTALLA DE HORARIO DÍA POR DÍA
   (dirección, 03/09/2026)

   Un renglón por cada día que el proyecto entrena. En cada uno se escoge la
   SEDE y la HORA DE ENTRADA; la de salida sale sola: hora y media, o UNA HORA
   cuando la sede es el CDC (Casa de Campeones), que es el mismo sitio con dos
   nombres.

   Los días no se escogen aquí: son los que estén marcados en DÍAS ENTRENO. Si
   ahí no hay ninguno, esta pantalla lo dice y no deja seguir — poner una hora
   a un día que el grupo no entrena no significa nada.
   ═══════════════════════════════════════════════════════════════════════════ */
function PantallaHorarioDia({
  proyecto, programa, dias, valores, onCerrar, onGuardar,
}: {
  proyecto: string;
  programa: string;
  dias: number[];
  valores: Record<string, HorarioDia>;
  onCerrar: () => void;
  onGuardar: (v: Record<string, HorarioDia>) => Promise<boolean>;
}) {
  const VERDE = '#00B050', VERDECL = '#5BE39B', PANEL = '#3C4759';
  const CAMPO = '#2B3547', BORDE = '#4A5568', GRIS = '#7C879A';
  const AMBAR = '#E0A33A', HONDO = '#2A3342';
  const OPC = { color: '#111827', backgroundColor: 'white' } as const;

  const [v, setV] = useState<Record<string, HorarioDia>>(() => ({ ...valores }));
  const [guardando, setGuardando] = useState(false);

  const enOrden = dias.slice().sort((a, b) => DIAS_ORDEN_JS.indexOf(a) - DIAS_ORDEN_JS.indexOf(b));
  const nombreLargo = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

  function poner(dia: number, campo: keyof HorarioDia, valor: string) {
    setV(prev => {
      const antes = prev[String(dia)] ?? { sede: '', hora: '' };
      return { ...prev, [String(dia)]: { ...antes, [campo]: valor } };
    });
  }

  /** Casi siempre los días se repiten, así que se copia el primero. */
  function copiarElPrimero() {
    const p = v[String(enOrden[0])];
    if (!p || (!p.sede && !p.hora)) return;
    const n: Record<string, HorarioDia> = {};
    enOrden.forEach(d => { n[String(d)] = { ...p }; });
    setV(n);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
         onClick={onCerrar}>
      <div className="rounded-2xl shadow-2xl w-full max-w-[760px] my-6 overflow-hidden"
           style={{ background: PANEL, border: `1px solid ${BORDE}` }}
           onClick={e => e.stopPropagation()}>

        <div className="px-5 py-4 flex items-center gap-3 flex-wrap" style={{ background: VERDE }}>
          <div className="flex-1 min-w-[200px]">
            <p className="text-white font-black text-lg leading-tight">HORARIO POR DÍA</p>
            <p className="text-white text-[11px] mt-0.5">{proyecto} · {programa}</p>
          </div>
          <span className="text-[9.5px] font-black uppercase tracking-widest text-white bg-white/25 px-2.5 py-1 rounded-lg">
            {enOrden.length} {enOrden.length === 1 ? 'día' : 'días'} de entreno
          </span>
          <button onClick={onCerrar} className="text-white hover:opacity-75" title="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {enOrden.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] font-bold" style={{ color: AMBAR }}>
            Este proyecto no tiene días de entreno marcados.<br />
            <span className="font-semibold text-white/80 text-[12px]">
              Márcalos primero en la columna DÍAS ENTRENO y vuelve aquí.
            </span>
          </p>
        ) : (
          <>
            {enOrden.map((d, i) => {
              const h    = v[String(d)] ?? { sede: '', hora: '' };
              const mIni = minutosDeHoraTexto(h.hora);
              const dur  = minutosEnSede(h.sede, programa);
              const corta = !!h.sede && dur === 60;
              const fin  = (mIni >= 0 && h.sede) ? horaTextoDeMinutos(mIni + dur) : '—';

              return (
                <div key={d} className="px-5 py-3"
                     style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDE}` }}>
                  <div className="grid gap-2.5 items-end"
                       style={{ gridTemplateColumns: 'minmax(84px,88px) minmax(150px,1.3fr) 132px 116px 84px' }}>
                    <p className="font-black text-[14px] text-white pb-2">{nombreLargo[d]}</p>

                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest mb-1"
                             style={{ color: GRIS }}>Sede</label>
                      <select value={h.sede} onChange={e => poner(d, 'sede', e.target.value)}
                        style={{ width: '100%', height: 38, background: CAMPO, border: `1px solid ${BORDE}`,
                                 borderRadius: 10, color: h.sede ? '#fff' : GRIS, fontWeight: 700,
                                 fontSize: '0.78rem', padding: '0 8px', outline: 'none', cursor: 'pointer' }}>
                        <option value="" style={OPC}>— Escoger —</option>
                        {SEDES_ENTRENO.map(s => (
                          <option key={s.nombre} value={s.nombre} style={OPC}>{s.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest mb-1"
                             style={{ color: GRIS }}>Inicia</label>
                      <select value={h.hora} onChange={e => poner(d, 'hora', e.target.value)}
                        style={{ width: '100%', height: 38, background: CAMPO, border: `1px solid ${BORDE}`,
                                 borderRadius: 10, color: h.hora ? '#fff' : GRIS, fontWeight: 700,
                                 fontSize: '0.78rem', padding: '0 8px', outline: 'none', cursor: 'pointer' }}>
                        <option value="" style={OPC}>— Escoger —</option>
                        {HORAS_ENTRENO.map(x => <option key={x} value={x} style={OPC}>{x}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest mb-1"
                             style={{ color: GRIS }}>Termina</label>
                      <div className="flex items-center px-2.5 font-black text-[12.5px]"
                           style={{ height: 38, background: HONDO, border: `1px solid ${BORDE}`,
                                    borderRadius: 10, color: VERDECL }}>
                        {fin}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest mb-1"
                             style={{ color: GRIS }}>Dura</label>
                      <div className="flex items-center justify-center font-black text-[11px]"
                           style={{ height: 38, borderRadius: 10,
                                    background: corta ? 'rgba(224,163,58,.16)' : 'rgba(0,176,80,.16)',
                                    border: `1px solid ${corta ? 'rgba(224,163,58,.55)' : 'rgba(0,176,80,.5)'}`,
                                    color: corta ? AMBAR : VERDECL }}>
                        {h.sede ? (corta ? '1 hora' : '1 h 30') : '—'}
                      </div>
                    </div>
                  </div>

                  {corta && (
                    <p className="text-[11px] font-bold mt-1.5" style={{ color: AMBAR }}>
                      En el CDC (Casa de Campeones) el entrenamiento es de una hora.
                    </p>
                  )}
                </div>
              );
            })}

            <div className="px-5 py-2.5 flex items-center gap-2 flex-wrap text-[11px]"
                 style={{ borderTop: `1px solid ${BORDE}`, color: GRIS }}>
              Atajo:
              <button onClick={copiarElPrimero}
                className="px-3 py-1.5 rounded-lg font-black text-[10.5px] text-white/80 hover:text-white"
                style={{ background: 'transparent', border: `1px solid ${BORDE}` }}>
                Copiar el {nombreLargo[enOrden[0]].toLowerCase()} a todos los días
              </button>
              <button onClick={() => setV({})}
                className="px-3 py-1.5 rounded-lg font-black text-[10.5px] text-white/80 hover:text-white"
                style={{ background: 'transparent', border: `1px solid ${BORDE}` }}>
                Dejar todo en blanco
              </button>
            </div>
          </>
        )}

        <div className="px-5 py-3 flex flex-wrap items-center gap-2.5"
             style={{ borderTop: `1px solid ${BORDE}`, background: HONDO }}>
          <p className="flex-1 min-w-[220px] text-[11px] leading-relaxed text-white/70">
            La hora de salida no se escoge: sale sola. El microciclo del formador
            toma de aquí la sede y la hora <b>de cada día</b>.
          </p>
          <button onClick={onCerrar}
            className="px-4 py-2.5 rounded-xl font-black text-[11.5px] uppercase tracking-wider text-white"
            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
            Cancelar
          </button>
          <button
            onClick={async () => { setGuardando(true); await onGuardar(v); setGuardando(false); }}
            disabled={guardando || enOrden.length === 0}
            className="px-5 py-2.5 rounded-xl font-black text-[11.5px] uppercase tracking-wider text-white disabled:opacity-60"
            style={{ background: VERDE }}>
            {guardando ? 'Guardando…' : 'Guardar horario'}
          </button>
        </div>
      </div>
    </div>
  );
}
