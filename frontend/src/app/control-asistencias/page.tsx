'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  CONTROLANDO LA EMPRESA · ASISTENCIAS
//
//  QUÉ ES (dirección, 29/08/2026): NO es para registrar asistencia —eso se hace
//  en Control de Asistencia—. Esto es para VIGILAR: de un vistazo, quién está
//  al día y quién no.
//
//  CÓMO LEE: un renglón por proyecto, con las semanas del mes al frente.
//  Cada semana se pinta según lo que el formador haya registrado de los días
//  en que ese proyecto entrena:
//
//      TERMINADO    verde  · registró TODOS los días de esa semana
//      A MEDIAS     naranja· registró algunos
//      SIN INICIAR  gris   · no registró ninguno
//
//  DE DÓNDE SALE:
//    · jornadas_proyecto → qué días entrena cada proyecto y quién es el profe
//    · asistencia        → qué días quedaron registrados
//
//  Los días que todavía no han llegado no cuentan: a nadie se le puede exigir
//  que registre el entrenamiento del jueves si hoy es martes.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertTriangle, Loader2, ShieldCheck, X, Check,
} from 'lucide-react';
import { esSuperAdmin, esAccesoTotal, esDeportivo } from '@/lib/permisos';
import { getProfes, getDeportistas } from '@/lib/db';

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
  esperados: string[];     // fechas AAAA-MM-DD en que ese proyecto entrena
  hechos: number;
  estado: Estado;
};

type Renglon = {
  proyecto: Proyecto;
  semanas: Semana[];
  esperados: number;
  hechos: number;
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
export default function ControlAsistenciasPage() {
  const router = useRouter();

  const [puedeEntrar, setPuedeEntrar] = useState<boolean | null>(null);
  useEffect(() => {
    setPuedeEntrar(esSuperAdmin() || esAccesoTotal() || esDeportivo());
  }, []);

  const hoy = new Date();
  const [mes, setMes]   = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());

  const [proyectos, setProyectos]   = useState<Proyecto[] | null>(null);
  const [registradas, setRegistradas] = useState<Record<string, Set<string>>>({});
  const [cargando, setCargando]     = useState(true);
  const [error, setError]           = useState('');

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
    const mesKey = `${anio}_${String(mes + 1).padStart(2, '0')}`;
    const base = `${SB_URL}/rest/v1/asistencia?select=proyecto,fecha&anio_mes=eq.${mesKey}&order=id.asc`;
    const PASO = 1000;

    const pedazo = async (desde: number, conCuenta = false) => {
      const res = await fetch(base, {
        headers: {
          ...HDR,
          Range: `${desde}-${desde + PASO - 1}`,
          'Range-Unit': 'items',
          /* Al primer pedazo se le pide además CUÁNTAS filas hay en total: es
             lo que permite pedir todo lo demás al tiempo. */
          ...(conCuenta ? { Prefer: 'count=exact' } : {}),
        },
        cache: 'no-store',
      });
      if (!res.ok && res.status !== 206) throw new Error('No se pudo leer la asistencia del mes.');
      const filas = await res.json();
      return { lote: Array.isArray(filas) ? filas : [], cabecera: res.headers.get('content-range') ?? '' };
    };

    try {
      /* DE A PEDAZOS, PERO TODOS A LA VEZ (dirección, 29/08/2026).
         La base corta en las primeras mil filas y en un mes hay miles —una por
         deportista y por día—. Pedirlas de a mil EN FILA hacía esperar.
         Ahora el primer pedazo trae además cuántas filas hay en total, y con
         eso se piden todos los demás AL TIEMPO. Se pasa de catorce viajes uno
         detrás de otro a uno solo más una tanda. */
      const primero = await pedazo(0, true);
      const mapa: Record<string, Set<string>> = {};
      const meter = (lote: any[]) => {
        for (const r of lote) {
          const p = String(r?.proyecto ?? '').trim();
          const f = String(r?.fecha ?? '').trim();
          if (!p || !f) continue;
          (mapa[p] ??= new Set<string>()).add(f);
        }
      };
      meter(primero.lote);

      /* "0-999/14231" → 14231 */
      const total = Number(String(primero.cabecera).split('/')[1]) || 0;
      const traidas = primero.lote.length;

      if (total > traidas && traidas > 0) {
        const arranques: number[] = [];
        for (let d = traidas; d < total; d += PASO) arranques.push(d);
        /* De a seis al tiempo: rápido, sin ahogar la conexión. */
        for (let i = 0; i < arranques.length; i += 6) {
          const tanda = await Promise.all(arranques.slice(i, i + 6).map(d => pedazo(d)));
          tanda.forEach(t => meter(t.lote));
        }
      } else if (traidas === PASO) {
        /* La base no dijo el total: se sigue de a uno hasta que se acabe. */
        let desde = traidas;
        for (let vuelta = 0; vuelta < 80; vuelta++) {
          const t = await pedazo(desde);
          meter(t.lote);
          if (t.lote.length === 0) break;
          desde += t.lote.length;
        }
      }

      setRegistradas(mapa);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer la asistencia del mes.');
      setRegistradas({});
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
      const hechasDelProyecto = registradas[p.proyecto] ?? new Set<string>();

      const semanas: Semana[] = semanasDelMes.map(s => {
        const esperados: string[] = [];
        const d = new Date(s.desde);
        while (d <= s.hasta) {
          /* Solo los días de ESTE mes, de los que ese proyecto entrena, y que
             ya pasaron: el futuro no se le puede exigir a nadie. */
          if (d.getMonth() === mes && p.dias.includes(d.getDay()) && d <= finDeHoy) {
            esperados.push(clave(d));
          }
          d.setDate(d.getDate() + 1);
        }
        const hechos = esperados.filter(f => hechasDelProyecto.has(f)).length;
        return { desde: s.desde, hasta: s.hasta, esperados, hechos, estado: estadoDe(esperados.length, hechos) };
      });

      const esperados = semanas.reduce((n, s) => n + s.esperados.length, 0);
      const hechos    = semanas.reduce((n, s) => n + s.hechos, 0);
      return { proyecto: p, semanas, esperados, hechos, estado: estadoDe(esperados, hechos) };
    });
  }, [proyectos, registradas, semanasDelMes, mes, programaDe]);

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
      .filter(r => !r.proyecto.dias.length ? false : true)   // sin días no se puede medir
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
    renglones.filter(r => r.proyecto.dias.length).forEach(r => { c[r.estado]++; });
    return c;
  }, [renglones]);

  const sinDias = useMemo(
    () => (proyectos ?? []).filter(p => !p.dias.length).length,
    [proyectos],
  );

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
            Control de Asistencias
          </h1>
          <p className="text-white/70 text-[11px] font-semibold leading-tight">
            Quién está al día y quién no. Semana por semana.
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

                      {r.semanas.map((s, i) => (
                        <div key={i}
                          title={s.esperados.length === 0
                            ? 'Esa semana no tenía entrenamiento (o todavía no llega)'
                            : `${s.hechos} de ${s.esperados.length} días registrados`}
                          className="rounded-lg flex items-center justify-center
                            text-[10.5px] font-black"
                          style={{
                            height: 28,
                            background: s.esperados.length === 0
                              ? 'transparent'
                              : `${colorDe(s.estado)}26`,
                            border: `1px solid ${s.esperados.length === 0 ? BORDE : colorDe(s.estado)}`,
                            color: s.esperados.length === 0 ? 'rgba(255,255,255,.25)' : colorDe(s.estado),
                          }}>
                          {s.esperados.length === 0 ? '—' : `${s.hechos}/${s.esperados.length}`}
                        </div>
                      ))}

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
          Cada casilla dice <span className="text-white font-black">cuántos días registró de los que tocaban</span> esa
          semana. Los días que todavía no llegan no se cuentan. Los proyectos aparecen con el más
          atrasado de primero.
          {sinDias > 0 && (
            <> {sinDias} {sinDias === 1 ? 'proyecto no tiene' : 'proyectos no tienen'} días de
            entrenamiento definidos, así que no se pueden medir y no salen en la lista.</>
          )}
        </p>

        <div aria-hidden style={{ height: 120 }} />
      </main>
    </div>
  );
}
