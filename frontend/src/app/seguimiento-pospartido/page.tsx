'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  SEGUIMIENTO DE POSPARTIDOS  ·  /seguimiento-pospartido
//
//  PARA QUÉ ES (dirección, 27/08/2026): saber, de un vistazo, cuáles partidos
//  quedaron CERRADOS de verdad y cuáles siguen a medias — y de quién son.
//
//  El formador tiene dos botones al llenar la planilla:
//
//      GUARDAR AVANCE      → voy llenando, sigo después     (definitivo = false)
//      GUARDAR DEFINITIVO  → este partido quedó cerrado     (definitivo = true)
//
//  Esta pantalla lee esa marca. No inventa ningún dato: todo sale de la misma
//  tabla donde el formador guarda, así que lo que aquí se ve es exactamente lo
//  que él dejó.
//
//  LO QUE NO SE VE TAMBIÉN CUENTA. Un torneo del que no hay NINGUNA planilla
//  no aparecería por ningún lado, y esos son justo los que hay que perseguir.
//  Por eso la lista arranca del cuadro de torneos —los 58— y no de las
//  planillas: un torneo sin una sola fecha sale igual, marcado SIN EMPEZAR.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { getCuadro, limpiar, type FilaTorneo } from '@/lib/torneos';
import { getBanco, etiquetaFecha, numeroDeFecha, cuandoBonito, type FichaBanco } from '@/lib/pospartido';

/* ── Paleta de la plataforma ─────────────────────────────────────────────── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';

/** Un torneo con el resumen de sus partidos. */
type Fila = {
  num: string;
  titulo: string;
  formador: string;
  partidos: FichaBanco[];
  cerrados: number;
  medias: number;
};

export default function SeguimientoPospartido() {
  const router = useRouter();

  const [cuadro, setCuadro] = useState<FilaTorneo[] | null>(null);
  const [banco,  setBanco]  = useState<FichaBanco[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  /* Qué mostrar: todo, solo lo que falta, o solo lo cerrado. Arranca en
     "lo que falta", que es a lo que uno entra a esta pantalla. */
  const [ver, setVer] = useState<'todo' | 'falta' | 'listo'>('falta');

  function cargar() {
    setCargando(true);
    setError('');
    Promise.all([getCuadro(), getBanco()])
      .then(([c, b]) => {
        setCuadro(c);
        if (b === undefined) {
          setBanco([]);
          setError('La base todavía no tiene la casilla del guardado definitivo. Corre ARREGLAR-LA-BASE.bat y vuelve a entrar.');
        } else {
          setBanco(b ?? []);
        }
      })
      .catch(e => setError(e?.message ?? 'No se pudo leer la información.'))
      .finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); }, []);

  /* ── Se arma la lista desde el CUADRO, no desde las planillas ─────────── */
  const filas: Fila[] = useMemo(() => {
    if (!cuadro) return [];
    const porTorneo = new Map<string, FichaBanco[]>();
    for (const f of banco ?? []) {
      if (!porTorneo.has(f.torneo_num)) porTorneo.set(f.torneo_num, []);
      porTorneo.get(f.torneo_num)!.push(f);
    }
    return cuadro.map((t, i) => {
      const num = String(i + 1);
      const partidos = (porTorneo.get(num) ?? [])
        .sort((a, b) => numeroDeFecha(a.jornada) - numeroDeFecha(b.jornada));
      return {
        num,
        titulo: [t.torneo, t.programa, t.categoria].map(limpiar).filter(Boolean).join(' ') || `TORNEO ${num}`,
        formador: limpiar(t.formador),
        partidos,
        cerrados: partidos.filter(p => p.definitivo).length,
        medias:   partidos.filter(p => !p.definitivo).length,
      };
    });
  }, [cuadro, banco]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter(f => {
      /* "Lo que falta" = torneos con algún partido a medias, MÁS los que no
         tienen ni una fecha empezada. Esos últimos son los que más se pierden
         de vista, porque no aparecen en ninguna lista de planillas. */
      const falta = f.medias > 0 || f.partidos.length === 0;
      if (ver === 'falta' && !falta) return false;
      if (ver === 'listo' && falta) return false;
      /* La búsqueda se aplica SIEMPRE, después del filtro. Antes los torneos
         sin empezar se colaban aunque no coincidieran con lo buscado. */
      if (!q) return true;
      return f.titulo.toLowerCase().includes(q)
          || f.formador.toLowerCase().includes(q)
          || f.num === q;
    });
  }, [filas, ver, busqueda]);

  /* ── Los totales de arriba ─────────────────────────────────────────────── */
  const tot = useMemo(() => {
    const partidos = banco ?? [];
    return {
      torneos:      filas.length,
      sinEmpezar:   filas.filter(f => f.partidos.length === 0).length,
      conPendiente: filas.filter(f => f.medias > 0).length,
      cerrados:     partidos.filter(p => p.definitivo).length,
      medias:       partidos.filter(p => !p.definitivo).length,
    };
  }, [filas, banco]);

  const Casilla = ({ n, t, color }: { n: number; t: string; color: string }) => (
    <div className="rounded-xl px-4 py-3 flex-1 min-w-[128px]"
      style={{ background: PANEL, border: `1px solid ${color}` }}>
      <div className="font-black text-[26px] leading-none" style={{ color }}>{n}</div>
      <div className="text-white/55 text-[10px] font-black tracking-wider uppercase mt-1.5">{t}</div>
    </div>
  );

  return (
    <div className="min-h-screen pant-oscura" style={{ background: LIENZO }}>
      <style>{`
        .pant-oscura input, .pant-oscura select { color:#ffffff; }
        .pant-oscura input::placeholder { color: rgba(255,255,255,.35); }
        .pant-oscura option { color:#111827; background:#ffffff; }
      `}</style>

      <header className="bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.back()} className="text-white/70 hover:text-white transition shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Seguimiento de Pospartidos</h1>
          <p className="text-white/60 text-xs truncate">Cuáles quedaron cerrados y cuáles van a medias</p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="shrink-0 rounded-xl px-3 py-1.5 flex items-center gap-1.5 border border-white/30 transition hover:bg-white/10 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,.18)' }}>
          <RefreshCw className={`w-3.5 h-3.5 text-white ${cargando ? 'animate-spin' : ''}`} />
          <span className="text-white text-[11px] font-black">Actualizar</span>
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 flex flex-col gap-4">

        {!!error && (
          <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(224,163,58,.14)', border: `1px solid ${AMBAR}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBAR }} />
            <p className="text-white text-[12px] font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        {/* Los totales */}
        <div className="flex flex-wrap gap-2">
          <Casilla n={tot.cerrados}     t="Partidos cerrados"  color={VERDE} />
          <Casilla n={tot.medias}       t="Partidos a medias"  color={AMBAR} />
          <Casilla n={tot.conPendiente} t="Torneos con algo abierto" color={AMBAR} />
          <Casilla n={tot.sinEmpezar}   t="Torneos sin empezar" color={GRIS} />
        </div>

        {/* Buscar y filtrar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar torneo, categoría o formador…"
              className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold outline-none"
              style={{ background: CAMPO, border: `1px solid ${BORDE}` }} />
          </div>
          <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: `1px solid ${BORDE}` }}>
            {([
              ['falta', 'Lo que falta'],
              ['listo', 'Cerrados'],
              ['todo',  'Todos'],
            ] as const).map(([k, t]) => (
              <button key={k} onClick={() => setVer(k)}
                className="px-3 py-2.5 text-[11px] font-black transition"
                style={{
                  background: ver === k ? VERDE : CAMPO,
                  color: ver === k ? '#fff' : 'rgba(255,255,255,.6)',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* La lista */}
        {cargando && cuadro === null ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: GRIS }} />
            <span className="text-white/50 text-[13px] font-semibold">Leyendo los partidos…</span>
          </div>
        ) : cuadro === null ? (
          <p className="text-white/45 text-[13px] font-semibold text-center py-10">
            Todavía no existe el cuadro de torneos.
          </p>
        ) : visibles.length === 0 ? (
          <p className="text-white/45 text-[13px] font-semibold text-center py-10">
            {ver === 'falta'
              ? '¡Todo al día! No hay partidos a medias ni torneos sin empezar.'
              : 'No hay nada que mostrar con este filtro.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibles.map(f => {
              const sinEmpezar = f.partidos.length === 0;
              const alDia = !sinEmpezar && f.medias === 0;
              return (
                <div key={f.num} className="rounded-xl overflow-hidden"
                  style={{
                    background: PANEL,
                    border: `1px solid ${BORDE}`,
                    /* Filo de color: verde al día, ámbar algo abierto, gris sin empezar */
                    boxShadow: `inset 4px 0 0 0 ${alDia ? VERDE : sinEmpezar ? GRIS : AMBAR}`,
                  }}>

                  <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
                    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black text-white"
                      style={{ background: BORDE }}>#{f.num}</span>
                    <span className="text-white font-black text-[13px]">{f.titulo}</span>
                    {f.formador && (
                      <span className="text-white/45 text-[11px] font-bold">· {f.formador}</span>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] font-black rounded px-2 py-1"
                      style={
                        sinEmpezar ? { background: CAMPO, border: `1px solid ${BORDE}`, color: 'rgba(255,255,255,.5)' }
                        : alDia    ? { background: 'rgba(0,176,80,.16)', border: `1px solid ${VERDE}`, color: '#5BE39B' }
                                   : { background: 'rgba(224,163,58,.16)', border: `1px solid ${AMBAR}`, color: AMBAR }
                      }>
                      {sinEmpezar ? 'SIN EMPEZAR'
                        : alDia ? `AL DÍA · ${f.cerrados}`
                        : `${f.medias} A MEDIAS`}
                    </span>
                  </div>

                  {!sinEmpezar && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                      {f.partidos.map(p => (
                        <button key={`${p.torneo_num}|${p.jornada}`}
                          onClick={() => router.push('/postpartido')}
                          title={
                            `${etiquetaFecha(p.jornada)}` +
                            (p.rival ? ` · vs ${p.rival.toUpperCase()}` : '') +
                            (p.actualizada_en ? ` · guardado ${cuandoBonito(p.actualizada_en)}` : '')
                          }
                          className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 transition hover:brightness-125"
                          style={
                            p.definitivo
                              ? { background: 'rgba(0,176,80,.14)', border: `1px solid ${VERDE}` }
                              : { background: 'rgba(224,163,58,.14)', border: `1px solid ${AMBAR}` }
                          }>
                          {p.definitivo
                            ? <Check className="w-3 h-3" style={{ color: '#5BE39B' }} />
                            : <span className="w-3 h-3 rounded-full shrink-0"
                                style={{ border: `2px solid ${AMBAR}` }} />}
                          <span className="text-[10.5px] font-black"
                            style={{ color: p.definitivo ? '#5BE39B' : AMBAR }}>
                            {etiquetaFecha(p.jornada)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-white/35 text-[11px] text-center leading-relaxed pb-6">
          Un partido queda <span className="font-black" style={{ color: '#5BE39B' }}>cerrado</span> cuando
          el formador oprime GUARDAR DEFINITIVO en la planilla.
          Mientras solo guarde avances, se ve <span className="font-black" style={{ color: AMBAR }}>a medias</span>.
        </p>
      </main>
    </div>
  );
}
