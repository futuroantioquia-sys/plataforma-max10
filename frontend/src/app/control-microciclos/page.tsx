'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  CONTROLANDO LA EMPRESA · MICROCICLOS
//
//  QUÉ ES (dirección, 29/08/2026): el hermano del control de asistencias, pero
//  mirando la PLANEACIÓN. Un renglón por proyecto y, al frente, las semanas del
//  mes. Cada semana es un microciclo:
//
//      TERMINADO    verde  · el microciclo está montado y con objetivos
//      A MEDIAS     naranja· está creado pero sin objetivos escritos
//      SIN INICIAR  gris   · esa semana no tiene microciclo
//
//  DE DÓNDE SALE:
//    · jornadas_proyecto → los proyectos, su sede y quién los maneja
//    · microciclos       → uno por proyecto y por semana (arranca el lunes)
//
//  Las semanas que todavía no arrancan no se cuentan.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertTriangle, Loader2, ShieldCheck, X, Check,
} from 'lucide-react';
import { esSuperAdmin, esAccesoTotal, esDeportivo } from '@/lib/permisos';
import { getProfes, getDeportistas, getMicrociclo, getResumenAsistencia } from '@/lib/db';
import type { Microciclo, ResumenAsistenciaDia } from '@/lib/db';
import { VistaPreliminar } from '@/components/VistaPreliminarMicrociclo';
import { cn } from '@/lib/utils';

/* ── Colores oficiales ──────────────────────────────────────────────────── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
               'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

type Estado = 'TERMINADO' | 'A MEDIAS' | 'SIN INICIAR';

type Proyecto = {
  proyecto: string;
  dias: number[];          // 0 = domingo … 6 = sábado
  formador: string;
  programa: string;
  sede: string;
};

type Semana = {
  desde: Date;
  hasta: Date;
  cuenta: boolean;         // ¿esa semana ya arrancó?
  hay: boolean;            // ¿hay microciclo montado?
  conObjetivos: boolean;   // ¿tiene objetivos escritos?
  estado: Estado;
  /** El microciclo, para poder abrirlo en vista preliminar. — 03/09/2026 */
  id: string;
  cerrado: boolean;        // el formador lo dio por TERMINADO
  lunes: string;           // "2026-08-24" — la llave de la semana
};

/** Lo que se sabe de un microciclo con solo mirar el cuadro. */
type DatoSemana = { id: string; conObjetivos: boolean; cerrado: boolean };

type Renglon = {
  proyecto: Proyecto;
  semanas: Semana[];
  esperados: number;       // semanas que ya arrancaron
  hechos: number;          // microciclos montados
  estado: Estado;
};

/** Saca una casilla de la ficha del deportista buscándola por el nombre de la
 *  columna: PROYECTO, PROGRAMA… Es la misma que usa Control de Asistencia; se
 *  escribe aquí porque `db.ts` no la exporta. — 29/08/2026 */
function casillaDe(dep: any, rx: RegExp): string {
  const cols = dep?._columnas ?? {};
  const k = Object.keys(cols).find(x => rx.test(x));
  return k ? String(cols[k] ?? '') : '';
}

/** La fecha escrita como la guarda la asistencia: 2026-08-29. */
function clave(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** El lunes de la semana de esa fecha. */
function lunesDe(d: Date): Date {
  const x = new Date(d);
  const dia = x.getDay();                 // 0 domingo … 6 sábado
  const atras = dia === 0 ? 6 : dia - 1;  // la semana arranca en lunes
  x.setDate(x.getDate() - atras);
  x.setHours(0, 0, 0, 0);
  return x;
}

function estadoDe(esperados: number, hechos: number): Estado {
  if (esperados === 0) return 'SIN INICIAR';
  if (hechos >= esperados) return 'TERMINADO';
  return hechos > 0 ? 'A MEDIAS' : 'SIN INICIAR';
}

function colorDe(e: Estado): string {
  return e === 'TERMINADO' ? VERDE : e === 'A MEDIAS' ? AMBAR : GRIS;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ControlMicrociclosPage() {
  const router = useRouter();

  const [puedeEntrar, setPuedeEntrar] = useState<boolean | null>(null);
  useEffect(() => {
    setPuedeEntrar(esSuperAdmin() || esAccesoTotal() || esDeportivo());
  }, []);

  const hoy = new Date();
  const [mes, setMes]   = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());

  const [proyectos, setProyectos]   = useState<Proyecto[] | null>(null);
  /* proyecto → lunes de cada semana que tiene microciclo, y si trae objetivos */
  /* proyecto → lunes → lo que se sabe de ese microciclo.
     Antes solo se guardaba «tiene objetivos: sí/no». Ahora se guarda también
     el ID y si quedó CERRADO, porque la dirección necesita abrirlo en vista
     preliminar con un clic. — dirección, 03/09/2026 */
  const [montados, setMontados] = useState<Record<string, Record<string, DatoSemana>>>({});
  const [cargando, setCargando]     = useState(true);
  const [error, setError]           = useState('');

  /* ── LA HOJA QUE SE ABRE AL TOCAR UNA CASILLA ──────────────────────────
     (dirección, 03/09/2026 — «necesito ver cada microciclo de cada profesor
      en vista preliminar… necesito YA evaluarlos a cada profe»)

     Antes este cuadro solo decía ✓ · ✗: se veía QUIÉN iba al día, pero no se
     podía ver QUÉ escribió. Para revisarle el trabajo a un formador tocaba
     meterse a su módulo y buscar el proyecto a mano.

     Ahora cada casilla con microciclo se puede tocar y se abre la MISMA hoja
     de vista preliminar del formador —con su PDF— sin salir de aquí. Es de
     solo lectura: desde este cuadro no se edita nada. */
  const [hoja, setHoja]         = useState<Microciclo | null>(null);
  const [hojaAsis, setHojaAsis] = useState<Record<string, ResumenAsistenciaDia>>({});
  const [abriendo, setAbriendo] = useState('');

  async function abrirHoja(r: Renglon, s: Semana) {
    if (!s.id || abriendo) return;
    setAbriendo(s.id);
    try {
      const hastaISO = new Date(s.hasta);
      const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const [mc, asis] = await Promise.all([
        getMicrociclo(s.id),
        getResumenAsistencia(r.proyecto.proyecto, s.lunes, f(hastaISO)).catch(() => ({})),
      ]);
      if (!mc) { setError('No se pudo abrir ese microciclo. Intenta de nuevo.'); return; }
      setHojaAsis(asis as Record<string, ResumenAsistenciaDia>);
      setHoja(mc);
    } catch {
      setError('No se pudo abrir ese microciclo. Intenta de nuevo.');
    } finally {
      setAbriendo('');
    }
  }

  const [filtroProfe, setFiltroProfe]       = useState('');
  const [filtroPrograma, setFiltroPrograma] = useState('');
  const [filtroSede, setFiltroSede]         = useState('');
  const [filtroEstado, setFiltroEstado]     = useState('');

  /* ── Los proyectos: qué días entrena cada uno y de quién es ──────────────
     El formador NO sale de `jornadas_proyecto` —esa casilla viene casi
     siempre vacía—, sino de la tabla de PROFES: cada profe tiene la lista de
     los proyectos que maneja. — dirección, 29/08/2026 */
  useEffect(() => {
    (async () => {
      try {
        const [res, profes] = await Promise.all([
          fetch(
            `${SB_URL}/rest/v1/jornadas_proyecto?select=proyecto,dias,nombre_formador,sede&order=proyecto`,
            { headers: HDR, cache: 'no-store' },
          ),
          getProfes().catch(() => []),
        ]);
        if (!res.ok) throw new Error('No se pudo leer la lista de proyectos.');
        const filas = await res.json();

        /* proyecto → formador */
        const dueno = new Map<string, string>();
        for (const pr of (profes ?? [])) {
          const quien = String(pr?.usuario ?? '').trim().toUpperCase();
          for (const py of (pr?.proyectos ?? [])) {
            const k = String(py ?? '').trim();
            if (k && quien && !dueno.has(k)) dueno.set(k, quien);
          }
        }

        setProyectos((Array.isArray(filas) ? filas : []).map((r: any) => {
          const proyecto = String(r?.proyecto ?? '').trim();
          return {
            proyecto,
            dias: Array.isArray(r?.dias) ? r.dias.map((x: any) => Number(x)).filter((x: number) => x >= 0 && x <= 6) : [],
            formador: String(r?.nombre_formador ?? '').trim().toUpperCase()
                   || dueno.get(proyecto) || '',
            programa: '',
            sede: String(r?.sede ?? '').trim(),
          };
        }).filter((p: Proyecto) => p.proyecto));
      } catch (e: any) {
        setError(e?.message ?? 'No se pudo leer la lista de proyectos.');
        setProyectos([]);
      }
    })();
  }, []);

  /* ── EL PROGRAMA, APARTE Y SIN HACER ESPERAR (dirección, 29/08/2026) ──────
     El programa de cada proyecto está escrito en las fichas de Total
     Afiliados, y son cientos: traerlas antes de pintar hacía esperar de más.
     Ahora el cuadro sale de una y la columna PROGRAMA se llena sola cuando
     llegan las fichas —que además quedan guardadas, así que la segunda vez es
     instantáneo—. */
  const [programaDe, setProgramaDe] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      try {
        const deportistas = await getDeportistas();
        const mapa: Record<string, string> = {};
        for (const d of (deportistas ?? [])) {
          const py = casillaDe(d, /^proy/i).trim();
          const pg = casillaDe(d, /^program/i).trim().toUpperCase();
          if (py && pg && !mapa[py]) mapa[py] = pg;
        }
        setProgramaDe(mapa);
      } catch { /* sin fichas: la columna PROGRAMA queda en raya */ }
    })();
  }, []);

  /* ── Lo registrado en el mes que se está viendo ──────────────────────────
     Se piden SOLO las dos casillas que hacen falta —proyecto y fecha— y solo
     de ese mes. Se repiten por deportista; aquí se dejan sin repetir. */
  const traerMes = useCallback(async () => {
    setCargando(true);
    setError('');
    /* Se piden los microciclos que arrancan dentro del mes —y el de la semana
       que viene cruzada desde el mes anterior—. Son pocos: uno por proyecto y
       por semana. Aun así se pide de a pedazos, que es la regla de la casa: la
       base corta en las primeras mil filas. */
    const desdeISO = new Date(anio, mes, 1);
    desdeISO.setDate(desdeISO.getDate() - 7);
    const hastaISO = new Date(anio, mes + 1, 0);
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const base = `${SB_URL}/rest/v1/microciclos`
      + `?select=id,proyecto,fecha_inicio,estado,objetivo_general,objetivo_tecnico,objetivo_tactico,objetivo_fisico,objetivo_psico`
      + `&fecha_inicio=gte.${f(desdeISO)}&fecha_inicio=lte.${f(hastaISO)}&order=fecha_inicio.asc`;
    const PASO = 1000;
    try {
      const mapa: Record<string, Record<string, DatoSemana>> = {};
      let desde = 0;
      for (let vuelta = 0; vuelta < 40; vuelta++) {
        const res = await fetch(base, {
          headers: { ...HDR, Range: `${desde}-${desde + PASO - 1}`, 'Range-Unit': 'items' },
          cache: 'no-store',
        });
        if (!res.ok && res.status !== 206) throw new Error('No se pudieron leer los microciclos del mes.');
        const filas = await res.json();
        const lote = Array.isArray(filas) ? filas : [];
        for (const r of lote) {
          const p = String(r?.proyecto ?? '').trim();
          const ini = String(r?.fecha_inicio ?? '').trim();
          if (!p || !ini) continue;
          const conObjetivos = ['objetivo_general', 'objetivo_tecnico', 'objetivo_tactico',
                                'objetivo_fisico', 'objetivo_psico']
            .some(k => String(r?.[k] ?? '').trim() !== '');
          (mapa[p] ??= {});
          const antes = mapa[p][ini];
          mapa[p][ini] = {
            id: String(r?.id ?? '') || (antes?.id ?? ''),
            conObjetivos: (antes?.conObjetivos ?? false) || conObjetivos,
            cerrado: (antes?.cerrado ?? false) || String(r?.estado ?? '') === 'cerrado',
          };
        }
        if (lote.length === 0) break;
        desde += lote.length;
      }
      setMontados(mapa);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron leer los microciclos del mes.');
      setMontados({});
    } finally {
      setCargando(false);
    }
  }, [mes, anio]);

  useEffect(() => { void traerMes(); }, [traerMes]);

  /* ── Las semanas del mes ── */
  const semanasDelMes = useMemo(() => {
    const primero = new Date(anio, mes, 1);
    const ultimo  = new Date(anio, mes + 1, 0);
    const semanas: { desde: Date; hasta: Date }[] = [];
    let cursor = lunesDe(primero);
    while (cursor <= ultimo) {
      const fin = new Date(cursor);
      fin.setDate(fin.getDate() + 6);
      semanas.push({ desde: new Date(cursor), hasta: fin });
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
    }
    return semanas;
  }, [mes, anio]);

  /* ── El cuadro ── */
  const renglones = useMemo<Renglon[]>(() => {
    if (!proyectos) return [];
    const finDeHoy = new Date();
    finDeHoy.setHours(23, 59, 59, 999);

    return proyectos.map(pBase => {
      const p = { ...pBase, programa: pBase.programa || programaDe[pBase.proyecto] || '' };
      const suyos = montados[p.proyecto] ?? {};

      const semanas: Semana[] = semanasDelMes.map(s => {
        /* El microciclo arranca el LUNES de la semana. Esa es la llave. */
        const lunes = `${s.desde.getFullYear()}-${String(s.desde.getMonth() + 1).padStart(2, '0')}-${String(s.desde.getDate()).padStart(2, '0')}`;
        /* Solo cuentan las semanas que ya arrancaron y que tocan este mes. */
        const tocaElMes = s.desde.getMonth() === mes || s.hasta.getMonth() === mes;
        const cuenta = tocaElMes && s.desde <= finDeHoy;
        const info = suyos[lunes];
        const hay = !!info;
        const conObjetivos = !!info?.conObjetivos;
        const estado: Estado = !cuenta ? 'SIN INICIAR'
          : !hay ? 'SIN INICIAR'
          : conObjetivos ? 'TERMINADO' : 'A MEDIAS';
        return { desde: s.desde, hasta: s.hasta, cuenta, hay, conObjetivos, estado,
                 id: info?.id ?? '', cerrado: !!info?.cerrado, lunes };
      });

      const esperados = semanas.filter(s => s.cuenta).length;
      const hechos    = semanas.filter(s => s.cuenta && s.hay).length;
      return { proyecto: p, semanas, esperados, hechos, estado: estadoDe(esperados, hechos) };
    });
  }, [proyectos, montados, semanasDelMes, mes, programaDe]);

  const profesParaFiltrar = useMemo(() => {
    const set = new Set<string>();
    (proyectos ?? []).forEach(p => { if (p.formador) set.add(p.formador); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [proyectos]);

  const sedesParaFiltrar = useMemo(() => {
    const set = new Set<string>();
    (proyectos ?? []).forEach(p => { if (p.sede) set.add(p.sede.toUpperCase()); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [proyectos]);

  const programasParaFiltrar = useMemo(() => {
    const set = new Set<string>();
    Object.values(programaDe).forEach(p => { const v = String(p ?? ''); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [programaDe]);

  const visibles = useMemo(() => {
    const orden: Record<Estado, number> = { 'SIN INICIAR': 0, 'A MEDIAS': 1, 'TERMINADO': 2 };
    return renglones
      .filter(r => !filtroProfe || r.proyecto.formador === filtroProfe)
      .filter(r => !filtroPrograma || r.proyecto.programa === filtroPrograma)
      .filter(r => !filtroSede || r.proyecto.sede.toUpperCase() === filtroSede)
      .filter(r => !filtroEstado || r.estado === filtroEstado)
      /* LO QUE ESTÁ MAL, DE PRIMERO. Para eso es esta pantalla. */
      .sort((a, b) => {
        const d = orden[a.estado] - orden[b.estado];
        if (d !== 0) return d;
        return a.proyecto.proyecto.localeCompare(b.proyecto.proyecto, 'es');
      });
  }, [renglones, filtroProfe, filtroPrograma, filtroSede, filtroEstado]);

  const cuenta = useMemo(() => {
    const c = { 'TERMINADO': 0, 'A MEDIAS': 0, 'SIN INICIAR': 0 } as Record<Estado, number>;
    renglones.forEach(r => { c[r.estado]++; });
    return c;
  }, [renglones]);

  const sinDias = 0;   // aquí no hace falta: el microciclo no depende de los días

  const hayFiltro = !!filtroProfe || !!filtroPrograma || !!filtroSede || !!filtroEstado;

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
            Este cuadro es de control de la dirección.
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

  const pinta = (encendido: boolean) => ({
    background: encendido ? AMBAR : 'transparent',
    border: `1px solid ${encendido ? AMBAR : 'rgba(255,255,255,.6)'}`,
    color: '#ffffff',
    height: 32,
  });

  /* El PROYECTO es un código corto —"11", "12B"—: no necesita ancho. Quien
     necesita espacio es el FORMADOR. — dirección, 29/08/2026 */
  const COLUMNAS = `minmax(190px,1.3fr) 78px minmax(140px,1fr) minmax(130px,1fr) repeat(${semanasDelMes.length}, 74px) 80px 112px`;
  const ANCHO_MINIMO = 190 + 78 + 140 + 130 + semanasDelMes.length * 74 + 80 + 112 + 100;

  /* ═════════════════════════════════════════════════════════════════════════ */
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
            Control de Microciclos
          </h1>
          <p className="text-white/70 text-[11px] font-semibold leading-tight">
Quién tiene la planeación montada y quién no. Semana por semana.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/80 text-[9px] font-semibold tracking-wide mt-0.5 text-right leading-tight">
            CONECTA · GESTIONA · GANA
          </p>
        </div>
      </header>

      <main className="px-4 pt-4 mx-auto w-full" style={{ maxWidth: 1550 }}>

        {!!error && (
          <div className="rounded-xl px-3 py-2.5 mb-3 flex items-start gap-2"
               style={{ background: 'rgba(192,80,77,.16)', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
            <p className="text-white text-[12.5px] font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── ENCABEZADO VERDE, CON LOS FILTROS ── */}
        <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2"
             style={{ background: 'linear-gradient(to right, #05502A, #00B050)' }}>
          <ShieldCheck className="w-5 h-5 text-white shrink-0" />
          <div className="min-w-0 mr-2">
            <h2 className="text-white font-black text-[15px] tracking-wide leading-tight">
              {MESES[mes]} {anio}
            </h2>
            <p className="text-white/75 text-[11px] font-semibold">
              {visibles.length} {visibles.length === 1 ? 'proyecto' : 'proyectos'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              title="Ver otro mes"
              style={pinta(false)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              {MESES.map((m, i) => (
                <option key={m} value={i} style={{ color: '#111827', backgroundColor: 'white' }}>{m}</option>
              ))}
            </select>

            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              title="Ver otro año"
              style={pinta(false)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              {[anio - 1, anio, anio + 1].map(a => (
                <option key={a} value={a} style={{ color: '#111827', backgroundColor: 'white' }}>{a}</option>
              ))}
            </select>

            <select
              value={filtroProfe}
              onChange={e => setFiltroProfe(e.target.value)}
              title="Ver solo los proyectos de un formador"
              style={pinta(!!filtroProfe)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS PROFES</option>
              {profesParaFiltrar.map(p => (
                <option key={p} value={p} style={{ color: '#111827', backgroundColor: 'white' }}>{p}</option>
              ))}
            </select>

            <select
              value={filtroPrograma}
              onChange={e => setFiltroPrograma(e.target.value)}
              title="Ver solo los proyectos de un programa"
              style={pinta(!!filtroPrograma)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODOS LOS PROGRAMAS</option>
              {programasParaFiltrar.map(p => (
                <option key={p} value={p} style={{ color: '#111827', backgroundColor: 'white' }}>{p}</option>
              ))}
            </select>

            <select
              value={filtroSede}
              onChange={e => setFiltroSede(e.target.value)}
              title="Ver solo los proyectos de una sede"
              style={pinta(!!filtroSede)}
              className="rounded-lg px-2 text-[11.5px] font-black outline-none cursor-pointer">
              <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>TODAS LAS SEDES</option>
              {sedesParaFiltrar.map(p => (
                <option key={p} value={p} style={{ color: '#111827', backgroundColor: 'white' }}>{p}</option>
              ))}
            </select>

            {(['SIN INICIAR', 'A MEDIAS', 'TERMINADO'] as Estado[]).map(e => (
              <button
                key={e}
                onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
                title={`Ver solo los que están ${e.toLowerCase()}`}
                className="rounded-lg px-2.5 flex items-center gap-1.5 text-[11px] font-black"
                style={pinta(filtroEstado === e)}>
                <span className="rounded-full shrink-0"
                      style={{ width: 9, height: 9, background: colorDe(e) }} />
                {e} · {cuenta[e]}
              </button>
            ))}

            {hayFiltro && (
              <button
                onClick={() => { setFiltroProfe(''); setFiltroPrograma(''); setFiltroSede(''); setFiltroEstado(''); }}
                title="Quitar los filtros"
                className="rounded-lg px-2.5 flex items-center gap-1 text-[11px] font-black"
                style={pinta(false)}>
                <X className="w-3.5 h-3.5" /> VER TODOS
              </button>
            )}

            <button
              onClick={() => void traerMes()}
              disabled={cargando}
              title="Volver a leer la asistencia del mes"
              className="rounded-lg px-2.5 flex items-center gap-1.5 text-[11px] font-black disabled:opacity-50"
              style={pinta(false)}>
              {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              ACTUALIZAR
            </button>
          </div>
        </div>

        {/* ── EL CUADRO ── */}
        <div className="pt-3">
          {cargando && !proyectos ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white/50" />
              <span className="text-white/50 text-[12px] font-semibold">Mirando el mes…</span>
            </div>
          ) : visibles.length === 0 ? (
            <p className="text-white/40 text-[12px] font-semibold text-center py-8">
              {hayFiltro
                ? 'Ningún proyecto cumple con ese filtro. Oprime VER TODOS.'
                : 'Todavía no hay proyectos con días de entrenamiento definidos.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: ANCHO_MINIMO }}>

                {/* Los títulos */}
                <div className="grid gap-2 px-3 py-1.5 mb-2"
                     style={{ gridTemplateColumns: COLUMNAS }}>
                  {['FORMADOR', 'PROYECTO', 'PROGRAMA', 'SEDE'].map(t => (
                    <div key={t}
                      className="rounded-lg px-2 flex items-center justify-center
                        text-white text-[10.5px] font-black uppercase tracking-wide whitespace-nowrap"
                      style={{ background: VERDE, height: 30 }}>
                      {t}
                    </div>
                  ))}
                  {semanasDelMes.map((s, i) => (
                    <div key={i}
                      title={`Del ${s.desde.getDate()}/${s.desde.getMonth() + 1} al ${s.hasta.getDate()}/${s.hasta.getMonth() + 1}`}
                      className="rounded-lg px-1 flex flex-col items-center justify-center
                        text-white font-black uppercase leading-none"
                      style={{ background: VERDE, height: 30 }}>
                      <span className="text-[10.5px]">SEM {i + 1}</span>
                      <span className="text-[8px] text-white/75 mt-0.5">
                        {s.desde.getDate()}–{s.hasta.getDate()}
                      </span>
                    </div>
                  ))}
                  {['MES', 'AL DÍA'].map(t => (
                    <div key={t}
                      className="rounded-lg px-2 flex items-center justify-center
                        text-white text-[10.5px] font-black uppercase tracking-wide whitespace-nowrap"
                      style={{ background: VERDE, height: 30 }}>
                      {t}
                    </div>
                  ))}
                </div>

                {/* Los renglones */}
                <div className="flex flex-col gap-1.5">
                  {visibles.map(r => (
                    <div key={r.proyecto.proyecto}
                      className="grid gap-2 items-center rounded-xl px-3 py-1.5"
                      style={{
                        gridTemplateColumns: COLUMNAS,
                        background: CAMPO,
                        border: `1px solid ${BORDE}`,
                        boxShadow: `inset 4px 0 0 0 ${colorDe(r.estado)}`,
                      }}>

                      <p className="text-white font-black text-[12px] truncate"
                         title={r.proyecto.formador}>
                        {r.proyecto.formador || '—'}
                      </p>

                      <p className="text-white font-black text-[12px] text-center truncate"
                         title={r.proyecto.proyecto}>
                        {r.proyecto.proyecto}
                      </p>

                      <p className="text-white/70 font-bold text-[11.5px] truncate"
                         title={r.proyecto.programa}>
                        {r.proyecto.programa || '—'}
                      </p>

                      <p className="text-white/55 font-bold text-[11.5px] truncate"
                         title={r.proyecto.sede}>
                        {r.proyecto.sede || '—'}
                      </p>

                      {r.semanas.map((s, i) => {
                        /* Si hay microciclo, la casilla se puede tocar y abre
                           la hoja del formador. — dirección, 03/09/2026 */
                        const seAbre = s.hay && !!s.id;
                        return (
                        <button key={i}
                          onClick={() => seAbre && abrirHoja(r, s)}
                          disabled={!seAbre}
                          title={!s.cuenta
                            ? 'Esa semana todavía no arranca'
                            : !s.hay ? 'No hay microciclo montado'
                            : `${s.cerrado ? 'TERMINADO por el formador' : 'A medias, sin cerrar'} · toca para ver la hoja`}
                          className={cn('rounded-lg flex items-center justify-center text-[10.5px] font-black transition',
                            seAbre && 'hover:brightness-150 cursor-pointer')}
                          style={{
                            height: 28,
                            background: !s.cuenta ? 'transparent' : `${colorDe(s.estado)}26`,
                            border: `1px solid ${!s.cuenta ? BORDE : colorDe(s.estado)}`,
                            color: !s.cuenta ? 'rgba(255,255,255,.25)' : colorDe(s.estado),
                          }}>
                          {abriendo === s.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : !s.cuenta ? '—' : !s.hay ? '✗' : s.conObjetivos ? '✓' : '·'}
                        </button>
                        );
                      })}

                      <p className="text-center text-white font-black text-[12px]">
                        {r.hechos}/{r.esperados}
                      </p>

                      <div className="flex items-center justify-center">
                        <span className="rounded px-2 py-1 text-[9.5px] font-black flex items-center gap-1"
                          style={{
                            background: `${colorDe(r.estado)}26`,
                            border: `1px solid ${colorDe(r.estado)}`,
                            color: colorDe(r.estado),
                          }}>
                          {r.estado === 'TERMINADO' && <Check className="w-3 h-3" />}
                          {r.estado}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          )}
        </div>

        <p className="text-white/40 text-[11.5px] font-semibold mt-3 leading-relaxed">
          Cada casilla es el microciclo de esa semana: <span className="text-white font-black">✓</span> montado
          y con objetivos, <span className="text-white font-black">·</span> montado pero sin objetivos
          escritos, <span className="text-white font-black">✗</span> sin montar. Las semanas que todavía no
          arrancan no se cuentan. Los proyectos aparecen con el más atrasado de primero.
          <br />
          <span className="text-white font-black">Toca cualquier casilla con ✓ o ·</span> y se abre la hoja
          del formador tal como él la ve, de solo lectura y con su botón de PDF. Así se le revisa el
          trabajo sin entrar a su módulo.
        </p>

        <div aria-hidden style={{ height: 120 }} />
      </main>

      {/* La hoja del formador, de solo lectura, con su botón de PDF. */}
      {hoja && (
        <VistaPreliminar
          mc={hoja}
          asist={hojaAsis}
          programa={programaDe[hoja.proyecto] ?? ''}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}
