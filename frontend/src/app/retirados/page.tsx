'use client';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  /retirados  ·  TOTAL RETIRADOS — la pantalla de ADMINISTRACIÓN.
//
//  Dos pestañas:
//    · SOLICITUDES → lo que piden los padres desde /retiro. Cada caso queda
//      EN ESTUDIO hasta coordinar los pagos pendientes. Aquí se APRUEBA
//      (el deportista pasa a RETIRADO) o se DEVUELVE (sigue activo).
//    · RETIRADOS   → todos los que hoy figuran retirados en Total Afiliados,
//      hayan salido por solicitud del padre o los haya retirado administración.
//
//  REGLA DE ORO: los datos salen de TOTAL AFILIADOS. Esta pantalla los LEE y,
//  cuando se resuelve un caso, escribe únicamente la columna ESTADO de la ficha.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Search, AlertTriangle, CheckCircle2, Undo2,
  Loader2, UserMinus, Inbox, Trash2, FileCheck2, FileX2,
} from 'lucide-react';
import { getDeportistas, updateColumnasDeportista } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import {
  getSolicitudes, resolverSolicitud, eliminarSolicitud, autorizarPazYSalvo,
  clasificarMotivo, MOTIVOS_RETIRO,
  colDe, enPesos,
  pidioRetiro, yaRetirado, fechaBonita,
  EST_RETIRADO,
  RX_CODIGO, RX_ESTADO, RX_PROGRAMA, RX_PROYECTO, RX_SEDE, RX_FECHAAF,
  type Solicitud,
} from '@/lib/retiro';

/* ── Colores oficiales ── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';
const GRIS   = '#7C879A';
const BLANCO = '1px solid #ffffff';

const ESTADO_ACTIVO = 'ACTIVO';

type Pestana = 'solicitudes' | 'retirados';

export default function TotalRetiradosPage() {
  const router = useRouter();

  const [pestana, setPestana]   = useState<Pestana>('solicitudes');
  const [deps, setDeps]         = useState<Deportista[]>([]);
  const [sols, setSols]         = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [busca, setBusca]       = useState('');
  const [trabajando, setTrabajando] = useState<string>('');   // id de la solicitud en curso

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [d, s] = await Promise.all([
        getDeportistas(),
        getSolicitudes().catch(e => { throw e; }),
      ]);
      setDeps(d);
      setSols(s);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la información.');
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  /* ── Índice para encontrar la ficha de cada solicitud ─────────────────── */
  const porId = useMemo(() => {
    const m: Record<string, Deportista> = {};
    for (const d of deps) m[d.id] = d;
    return m;
  }, [deps]);

  const filtra = (txt: string) => {
    const q = busca.trim().toLowerCase();
    return !q || txt.toLowerCase().includes(q);
  };

  /* ── Pestaña 1: solicitudes ───────────────────────────────────────────── */
  const enEstudio = useMemo(
    () => sols.filter(s => s.estado === 'EN ESTUDIO' && filtra(`${s.codigo} ${s.nombre} ${s.proyecto}`)),
    [sols, busca],
  );
  const resueltas = useMemo(
    () => sols.filter(s => s.estado !== 'EN ESTUDIO' && filtra(`${s.codigo} ${s.nombre} ${s.proyecto}`)),
    [sols, busca],
  );

  /* ── Pestaña 2: los que hoy figuran retirados ─────────────────────────────
     A cada uno se le pega su solicitud, si la tiene. Los retirados ANTIGUOS
     no la tienen —salieron antes de que existiera este módulo— y por eso les
     quedan vacías la fecha y el motivo. Es lo esperado, no un error.

     El orden lo pidió la dirección (26/08/2026): primero los antiguos, en
     orden alfabético, y AL FINAL los que salieron por la plataforma. Así los
     casos nuevos se van acumulando abajo y se encuentran de una. */
  const solPorDep = useMemo(() => {
    const m: Record<string, Solicitud> = {};
    // De más vieja a más nueva, para que quede guardada la MÁS RECIENTE.
    for (const s of [...sols].reverse()) m[s.deportista_id] = s;
    return m;
  }, [sols]);

  type FilaRetirado = {
    dep: Deportista;
    sol: Solicitud | undefined;
    fechaRetiro: string;   // cuándo se resolvió (o cuándo se radicó)
    motivoTipo: string;    // la casilla que escogió administración
    motivoTexto: string;   // lo que escribió el padre, tal cual
  };

  const retirados = useMemo<FilaRetirado[]>(() => {
    const filas = deps
      .filter(d => yaRetirado(colDe(d, RX_ESTADO)))
      .filter(d => {
        const s = solPorDep[d.id];
        return filtra(
          `${colDe(d, RX_CODIGO)} ${d._nombre} ${colDe(d, RX_PROYECTO)} ` +
          `${s?.motivo_tipo ?? ''} ${s?.motivo ?? ''}`,
        );
      })
      .map(d => {
        const s = solPorDep[d.id];
        return {
          dep: d,
          sol: s,
          fechaRetiro: fechaCorta(s?.resuelta_en || s?.creada_en || null),
          motivoTipo:  s?.motivo_tipo ?? '',
          motivoTexto: s?.motivo ?? '',
        };
      });

    // Los que salieron por la plataforma van de últimos.
    const antiguos = filas.filter(f => !f.sol).sort((a, b) => a.dep._nombre.localeCompare(b.dep._nombre, 'es'));
    const nuevos   = filas.filter(f =>  f.sol).sort((a, b) => a.dep._nombre.localeCompare(b.dep._nombre, 'es'));
    return [...antiguos, ...nuevos];
  }, [deps, sols, solPorDep, busca]);

  /* ── Por qué se nos está yendo la gente ───────────────────────────────
     La cuenta que solo se puede sacar gracias a la casilla del motivo. */
  const porMotivo = useMemo(() => {
    const cuenta: Record<string, number> = {};
    for (const s of sols) {
      const k = (s.motivo_tipo ?? '').trim();
      if (k) cuenta[k] = (cuenta[k] ?? 0) + 1;
    }
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  }, [sols]);

  /* ── Deportistas TRABADOS ─────────────────────────────────────────────
     Están marcados "SOLICITA RETIRO" en Total Afiliados pero ya no tienen
     ninguna solicitud abierta: quedaron así de pruebas viejas o de
     solicitudes borradas. Hay que poder devolverlos a ACTIVO de un golpe. */
  const trabados = useMemo(() => {
    const conSolicitud = new Set(
      sols.filter(s => s.estado === 'EN ESTUDIO').map(s => s.deportista_id),
    );
    return deps.filter(d => pidioRetiro(colDe(d, RX_ESTADO)) && !conSolicitud.has(d.id));
  }, [deps, sols]);

  async function destrabar() {
    if (!window.confirm(
      `Hay ${trabados.length} deportista(s) marcados como "SOLICITA RETIRO" en ` +
      `Total Afiliados que ya no tienen ninguna solicitud abierta.\n\n` +
      `¿Devolverlos todos a ACTIVO?`
    )) return;

    setTrabajando('__destrabar__');
    setError('');
    let malos = 0;
    for (const d of trabados) {
      const kEstado = Object.keys(d._columnas ?? {}).find(k => RX_ESTADO.test(k.trim())) || 'ESTADO';
      const ok = await updateColumnasDeportista(d.id, { ...(d._columnas ?? {}), [kEstado]: ESTADO_ACTIVO });
      if (ok) {
        setDeps(prev => prev.map(x =>
          x.id === d.id ? { ...x, _columnas: { ...x._columnas, [kEstado]: ESTADO_ACTIVO } } : x));
      } else { malos++; }
    }
    if (malos) setError(`Quedaron ${malos} sin poder cambiar. Revísalos en Total Afiliados.`);
    setTrabajando('');
  }

  /* ── Resolver un caso ─────────────────────────────────────────────────── */
  async function resolver(sol: Solicitud, decision: 'APROBADA' | 'DEVUELTA') {
    const dep = porId[sol.deportista_id];
    const palabra = decision === 'APROBADA'
      ? `RETIRAR a ${sol.nombre} (código ${sol.codigo})`
      : `DEVOLVER a ${sol.nombre} (código ${sol.codigo}) a la actividad normal`;

    /* Si se aprueba el retiro sin clasificar el motivo, ese caso se pierde
       para siempre de la estadística. Se avisa, pero no se bloquea. */
    if (decision === 'APROBADA' && !sol.motivo_tipo) {
      if (!window.confirm(
        `Todavía no clasificaste el motivo de ${sol.nombre}.\n\n` +
        `Sin esa casilla el caso no cuenta en la estadística de por qué se ` +
        `retira la gente.\n\n¿Aprobar el retiro de todas formas?`
      )) return;
    }

    if (!window.confirm(`¿Confirmas ${palabra}?`)) return;

    setTrabajando(sol.id);
    setError('');
    try {
      // 1. La ficha manda: se escribe el ESTADO en Total Afiliados.
      if (dep) {
        const kEstado = Object.keys(dep._columnas ?? {}).find(k => RX_ESTADO.test(k.trim())) || 'ESTADO';
        const nuevo   = decision === 'APROBADA' ? EST_RETIRADO : ESTADO_ACTIVO;
        const ok = await updateColumnasDeportista(dep.id, { ...(dep._columnas ?? {}), [kEstado]: nuevo });
        if (!ok) throw new Error('No se pudo cambiar el estado del deportista en Total Afiliados.');
        setDeps(prev => prev.map(x =>
          x.id === dep.id ? { ...x, _columnas: { ...x._columnas, [kEstado]: nuevo } } : x));
      }
      // 2. Queda la constancia de quién resolvió y cuándo.
      await resolverSolicitud(sol.id, decision, 'administración');
      setSols(prev => prev.map(s => s.id === sol.id
        ? { ...s, estado: decision, resuelta_en: new Date().toISOString(), resuelta_por: 'administración' }
        : s));
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la decisión.');
    }
    setTrabajando('');
  }

  /* ── Autorizar (o quitar) el Paz y Salvo ──────────────────────────────── */
  async function cambiarPazYSalvo(sol: Solicitud, autorizar: boolean) {
    const aviso = autorizar
      ? `¿AUTORIZAR el Paz y Salvo de ${sol.nombre}?\n\n` +
        `El padre va a poder descargar la constancia firmada por la representante legal.` +
        ((sol.meses_pendientes ?? 0) > 0
          ? `\n\nOJO: al radicar figuraba debiendo ${sol.meses_pendientes} mes(es).`
          : '')
      : `¿Quitar la autorización del Paz y Salvo de ${sol.nombre}?\n\nEl padre dejará de poder descargarlo.`;
    if (!window.confirm(aviso)) return;

    setTrabajando(sol.id);
    setError('');
    try {
      await autorizarPazYSalvo(sol.id, autorizar, 'administración');
      setSols(prev => prev.map(s => s.id === sol.id
        ? { ...s, paz_salvo: autorizar, paz_salvo_en: autorizar ? new Date().toISOString() : null,
            paz_salvo_por: autorizar ? 'administración' : null }
        : s));
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la autorización.');
    }
    setTrabajando('');
  }

  /* ── Clasificar el motivo (se guarda apenas se escoge) ────────────────── */
  async function ponerMotivoTipo(sol: Solicitud, tipo: string) {
    // Se pinta de una vez para que no se sienta lento; si falla, se devuelve.
    const antes = sol.motivo_tipo ?? '';
    setSols(prev => prev.map(s => s.id === sol.id ? { ...s, motivo_tipo: tipo || null } : s));
    setError('');
    try {
      await clasificarMotivo(sol.id, tipo);
    } catch (e: any) {
      setSols(prev => prev.map(s => s.id === sol.id ? { ...s, motivo_tipo: antes || null } : s));
      setError(e?.message || 'No se pudo guardar la clasificación.');
    }
  }

  /* ── Eliminar una solicitud (pruebas o radicadas por error) ─────────────
     OJO: si el deportista quedó marcado "SOLICITA RETIRO" en Total Afiliados,
     hay que devolverlo a ACTIVO EN LA MISMA OPERACIÓN. Si no, se borra el
     papel pero el niño queda trabado en un estado que ya no corresponde a
     ninguna solicitud — y eso es lo que hacía que los conteos mintieran. */
  async function borrar(sol: Solicitud) {
    const dep     = porId[sol.deportista_id];
    const trabado = !!dep && pidioRetiro(colDe(dep, RX_ESTADO));

    if (!window.confirm(
      `¿Eliminar la solicitud de ${sol.nombre} (código ${sol.codigo})?\n\n` +
      `Se borra el registro y no se puede recuperar.` +
      (trabado
        ? `\n\nEn Total Afiliados quedó marcado "SOLICITA RETIRO": se le devuelve ` +
          `el estado a ACTIVO automáticamente.`
        : '')
    )) return;

    setTrabajando(sol.id);
    setError('');
    try {
      await eliminarSolicitud(sol.id);
      setSols(prev => prev.filter(s => s.id !== sol.id));

      // Y se le quita la marca al deportista, para que no quede colgado.
      if (trabado && dep) {
        const kEstado = Object.keys(dep._columnas ?? {}).find(k => RX_ESTADO.test(k.trim())) || 'ESTADO';
        const ok = await updateColumnasDeportista(dep.id, { ...(dep._columnas ?? {}), [kEstado]: ESTADO_ACTIVO });
        if (ok) {
          setDeps(prev => prev.map(x =>
            x.id === dep.id ? { ...x, _columnas: { ...x._columnas, [kEstado]: ESTADO_ACTIVO } } : x));
        } else {
          setError(
            `Se eliminó la solicitud, pero NO se pudo devolver a ${sol.nombre} a ACTIVO. ` +
            `Cámbialo a mano en Total Afiliados.`
          );
        }
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar la solicitud.');
    }
    setTrabajando('');
  }

  /* ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen pb-14" style={{ background: LIENZO }}>

      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
        style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>
        <button
          onClick={() => router.push('/dashboard')}
          aria-label="Volver"
          className="rounded-xl flex items-center justify-center shrink-0"
          style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-black text-base leading-tight">Retiros</h1>
          <p className="text-white/55 text-[11px] leading-tight">
            Solicitudes de los padres y deportistas retirados
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          title="Volver a leer"
          className="rounded-xl flex items-center justify-center shrink-0 disabled:opacity-50"
          style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
          <RefreshCw className={`w-4 h-4 text-white ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* El cuadro de RETIRADOS tiene diez columnas: se le da todo el ancho de
          la pantalla. Las solicitudes son tarjetas de leer, y esas se dejan
          angostas a propósito, que leer renglones larguísimos cansa. */}
      <main className="px-4 pt-4 mx-auto w-full"
        style={{ maxWidth: pestana === 'retirados' ? 1800 : 1100 }}>

        {/* ── Pestañas ── */}
        <div className="flex gap-2 mb-4">
          <Tab
            activa={pestana === 'solicitudes'}
            onClick={() => setPestana('solicitudes')}
            icono={<Inbox className="w-4 h-4" />}
            texto="Solicitudes"
            cuenta={enEstudio.length}
            color={AMBAR}
          />
          <Tab
            activa={pestana === 'retirados'}
            onClick={() => setPestana('retirados')}
            icono={<UserMinus className="w-4 h-4" />}
            texto="Retirados"
            cuenta={retirados.length}
            color={GRIS}
          />
        </div>

        {/* ── Buscador ── */}
        <div className="flex items-center gap-2 rounded-xl px-3 mb-4"
          style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 46 }}>
          <Search className="w-4 h-4 text-white/45 shrink-0" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por código, nombre o proyecto…"
            className="flex-1 bg-transparent outline-none text-white text-[14px] py-2"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="text-white/50 text-[12px] font-bold px-2">
              ✕
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2"
            style={{ background: '#4a2320', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
            <p className="text-white text-[13px] font-semibold">{error}</p>
          </div>
        )}

        {cargando && (
          <div className="flex flex-col items-center gap-3 text-white py-16">
            <Loader2 className="w-7 h-7 animate-spin" />
            <p className="text-sm font-bold">Cargando…</p>
          </div>
        )}

        {/* ═══ PESTAÑA SOLICITUDES ═══ */}
        {!cargando && pestana === 'solicitudes' && (
          <>
            {/* Deportistas que quedaron marcados sin solicitud abierta */}
            {trabados.length > 0 && (
              <div className="rounded-xl px-3 py-3 mb-4" style={{ background: CAMPO, border: `1px solid ${AMBAR}` }}>
                <p className="text-white text-[12.5px] leading-relaxed mb-2">
                  En Total Afiliados hay <b>{trabados.length}</b> deportista(s) marcados
                  como “SOLICITA RETIRO” que <b>ya no tienen solicitud abierta</b>
                  {' '}(pruebas o solicitudes borradas). Mientras sigan así, se ven en ámbar
                  en el cuadro.
                </p>
                <p className="text-white/45 text-[11.5px] mb-2.5 leading-snug">
                  {trabados.slice(0, 6).map(d => colDe(d, RX_CODIGO) || d._nombre).join(' · ')}
                  {trabados.length > 6 ? ` y ${trabados.length - 6} más` : ''}
                </p>
                <button
                  onClick={destrabar}
                  disabled={trabajando === '__destrabar__'}
                  className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: AMBAR, minHeight: 42, fontSize: 12.5 }}>
                  {trabajando === '__destrabar__'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> ARREGLANDO…</>
                    : <><Undo2 className="w-4 h-4" /> DEVOLVERLOS A ACTIVO</>}
                </button>
              </div>
            )}

            {enEstudio.length === 0 && (
              <Vacio texto="No hay solicitudes en estudio." />
            )}

            <div className="space-y-3">
              {enEstudio.map(s => (
                <Tarjeta
                  key={s.id}
                  sol={s}
                  dep={porId[s.deportista_id]}
                  trabajando={trabajando === s.id}
                  onAprobar={() => resolver(s, 'APROBADA')}
                  onDevolver={() => resolver(s, 'DEVUELTA')}
                  onPazYSalvo={autorizar => cambiarPazYSalvo(s, autorizar)}
                  onBorrar={() => borrar(s)}
                  onClasificar={tipo => ponerMotivoTipo(s, tipo)}
                />
              ))}
            </div>

            {/* ── Por qué se retiran ── */}
            {porMotivo.length > 0 && (
              <div className="rounded-xl px-3 py-3 mt-7" style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                <p className="text-white/50 text-[10px] font-bold tracking-wider mb-2">POR QUÉ SE RETIRAN</p>
                <div className="flex flex-wrap gap-2">
                  {porMotivo.map(([m, n]) => (
                    <span key={m}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-white flex items-center gap-2"
                      style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
                      {m}
                      <span className="rounded-md px-1.5" style={{ background: VERDE }}>{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {resueltas.length > 0 && (
              <>
                <h2 className="text-white/60 font-black text-[12px] tracking-wider mt-7 mb-3">
                  YA RESUELTAS ({resueltas.length})
                </h2>
                <div className="space-y-3">
                  {resueltas.map(s => (
                    <Tarjeta
                      key={s.id}
                      sol={s}
                      dep={porId[s.deportista_id]}
                      trabajando={trabajando === s.id}
                      onPazYSalvo={autorizar => cambiarPazYSalvo(s, autorizar)}
                      onBorrar={() => borrar(s)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ PESTAÑA RETIRADOS ═══ */}
        {!cargando && pestana === 'retirados' && (
          <>
            {retirados.length === 0 && <Vacio texto="No hay deportistas retirados." />}

            {retirados.length > 0 && (
              <>
                <p className="text-white/45 text-[11.5px] mb-2 leading-snug">
                  Los retirados de antes no tienen fecha ni motivo: salieron cuando este
                  módulo no existía. Los que salieron por la plataforma van de últimos.
                </p>
                {/* El alto tope es lo que hace que el encabezado se quede pegado
                    arriba al bajar: sin él, el que se desplaza es toda la página
                    y no hay contra qué pegarlo. — 26/08/2026 */}
                <div className="rounded-xl overflow-auto"
                  style={{ border: `1px solid ${BORDE}`, maxHeight: 'calc(100vh - 205px)' }}>
                  <table className="text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 1080 }}>
                    <thead>
                      <tr>
                        {['N°', 'CÓDIGO', 'DEPORTISTA', 'PROGRAMA', 'PROYECTO', 'SEDE', 'AFILIACIÓN',
                          'FECHA DE RETIRO', 'MOTIVO DE RETIRO', 'LO QUE ESCRIBIÓ EL PADRE'].map(h => (
                          <th key={h}
                            className="sticky top-0 z-10 px-2 py-2 text-center font-black text-[10px] whitespace-nowrap text-white"
                            style={{ background: VERDE, borderRight: BLANCO, borderBottom: BLANCO, borderTop: BLANCO }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {retirados.map((f, i) => {
                        const d = f.dep;
                        /* Los que salieron por la plataforma se distinguen con un
                           borde ámbar a la izquierda: son los del proceso nuevo. */
                        const porPlataforma = !!f.sol;
                        return (
                          <tr key={d.id} style={{ background: PANEL }}>
                            <Celda centro>
                              <span style={porPlataforma ? { color: AMBAR } : undefined}>{i + 1}</span>
                            </Celda>
                            <Celda centro fuerte>{colDe(d, RX_CODIGO) || '—'}</Celda>
                            <Celda>{d._nombre || '—'}</Celda>
                            <Celda>{colDe(d, RX_PROGRAMA) || '—'}</Celda>
                            <Celda centro>{colDe(d, RX_PROYECTO) || '—'}</Celda>
                            <Celda>{colDe(d, RX_SEDE) || '—'}</Celda>
                            <Celda centro>{fechaBonita(colDe(d, RX_FECHAAF)) || '—'}</Celda>
                            {/* Las tres del proceso nuevo van al final (26/08/2026):
                                así lo de siempre queda a la izquierda, donde el ojo
                                lo busca, y estas no empujan el nombre hacia el lado. */}
                            <Celda centro>
                              {f.fechaRetiro || <span style={{ color: GRIS }}>—</span>}
                            </Celda>
                            <Celda centro>
                              {f.motivoTipo
                                ? <span className="inline-block rounded-md px-2 py-[3px] text-[10.5px] font-black whitespace-nowrap"
                                    style={{ background: '#5A6478' }}>{f.motivoTipo}</span>
                                : <span style={{ color: GRIS }}>—</span>}
                            </Celda>
                            <Celda>
                              {f.motivoTexto
                                ? <span className="block text-[11.5px] font-normal"
                                    style={{ maxWidth: 260, whiteSpace: 'normal', lineHeight: 1.35 }}
                                    title={f.motivoTexto}>
                                    “{f.motivoTexto}”
                                  </span>
                                : <span style={{ color: GRIS }}>—</span>}
                            </Celda>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ── Pestaña ─────────────────────────────────────────────────────────────── */
function Tab({ activa, onClick, icono, texto, cuenta, color }: {
  activa: boolean; onClick: () => void; icono: ReactNode;
  texto: string; cuenta: number; color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl flex items-center justify-center gap-2 font-black text-[13px]"
      style={{
        minHeight: 46,
        background: activa ? color : CAMPO,
        color: 'white',
        border: `1px solid ${activa ? color : BORDE}`,
      }}>
      {icono}
      <span>{texto}</span>
      <span className="rounded-full px-2 py-0.5 text-[11px]"
        style={{ background: activa ? 'rgba(0,0,0,0.25)' : PANEL }}>
        {cuenta}
      </span>
    </button>
  );
}

/* ── Una celda de la tabla, con su contorno blanco ───────────────────────── */
function Celda({ children, centro, fuerte }: { children: ReactNode; centro?: boolean; fuerte?: boolean }) {
  return (
    <td
      className={`px-2 py-[7px] text-white ${centro ? 'text-center' : ''} ${fuerte ? 'font-black' : 'font-semibold'}`}
      style={{ borderRight: BLANCO, borderBottom: BLANCO }}>
      {children}
    </td>
  );
}

/* ── Aviso de lista vacía ────────────────────────────────────────────────── */
function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl py-12 text-center" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
      <Inbox className="w-8 h-8 mx-auto mb-2 text-white/30" />
      <p className="text-white/55 text-[13px] font-semibold">{texto}</p>
    </div>
  );
}

/* ── Tarjeta de una solicitud ────────────────────────────────────────────── */
function Tarjeta({ sol, dep, trabajando, onAprobar, onDevolver, onPazYSalvo, onBorrar, onClasificar }: {
  sol: Solicitud;
  dep?: Deportista;
  trabajando: boolean;
  onAprobar?: () => void;
  onDevolver?: () => void;
  onPazYSalvo?: (autorizar: boolean) => void;
  onBorrar?: () => void;
  onClasificar?: (tipo: string) => void;
}) {
  const abierta = sol.estado === 'EN ESTUDIO';
  const debe    = (sol.meses_pendientes ?? 0) > 0;
  const pys     = !!sol.paz_salvo;
  const colorEstado = sol.estado === 'APROBADA' ? GRIS : sol.estado === 'DEVUELTA' ? VERDE : AMBAR;

  return (
    <article className="rounded-2xl overflow-hidden" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>

      {/* Franja de estado */}
      <div className="px-4 py-2 flex items-center justify-between gap-3" style={{ background: colorEstado }}>
        <p className="text-white font-black text-[11px] tracking-wider">
          {sol.estado === 'EN ESTUDIO' ? 'EN ESTUDIO' : sol.estado === 'APROBADA' ? 'RETIRO APROBADO' : 'DEVUELTO A LA ACTIVIDAD'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-white/85 text-[11px] font-bold whitespace-nowrap">
            {fechaCorta(sol.creada_en)}
          </p>
          {/* Botoncito de eliminar: para quitar las pruebas o una radicada por error. */}
          {onBorrar && (
            <button
              onClick={onBorrar}
              disabled={trabajando}
              title="Eliminar esta solicitud"
              aria-label="Eliminar esta solicitud"
              className="rounded-md flex items-center justify-center disabled:opacity-40"
              style={{ width: 24, height: 24, background: 'rgba(0,0,0,0.22)' }}>
              <Trash2 className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Quién */}
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className="text-white font-black text-[16px]">{sol.codigo || '—'}</span>
          <span className="text-white font-bold text-[15px]">{sol.nombre || '—'}</span>
        </div>
        <p className="text-white/50 text-[12px] mb-3">
          {[sol.programa, sol.proyecto, sol.sede].filter(Boolean).join(' · ') || '—'}
        </p>

        {/* Motivo — lo que escribió el padre, y la casilla que le pone la casa */}
        <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
          <p className="text-white/50 text-[10px] font-bold tracking-wider mb-1">MOTIVO DEL RETIRO</p>
          <p className="text-white text-[13px] leading-relaxed break-words">{sol.motivo || '—'}</p>

          {onClasificar && (
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDE}` }}>
              <label className="block text-white/50 text-[10px] font-bold tracking-wider mb-1.5">
                CLASIFÍCALO
              </label>
              <select
                value={sol.motivo_tipo ?? ''}
                onChange={e => onClasificar(e.target.value)}
                title="Para poder contar después de qué se nos está yendo la gente"
                className="w-full rounded-lg text-white font-bold text-[12.5px] px-2 outline-none cursor-pointer"
                style={{
                  minHeight: 42,
                  background: PANEL,
                  border: `2px solid ${sol.motivo_tipo ? VERDE : AMBAR}`,
                }}>
                <option value="" style={{ color: '#111827', backgroundColor: 'white' }}>
                  Sin clasificar…
                </option>
                {MOTIVOS_RETIRO.map(m => (
                  <option key={m} value={m} style={{ color: '#111827', backgroundColor: 'white' }}>{m}</option>
                ))}
              </select>
              {!sol.motivo_tipo && (
                <p className="text-white/45 text-[11px] mt-1.5 leading-snug">
                  Escoge una casilla antes de resolver. Es lo que después deja
                  sacar la cuenta de por qué se retira la gente.
                </p>
              )}
            </div>
          )}

          {/* En las ya resueltas solo se muestra, sin poder cambiarla. */}
          {!onClasificar && sol.motivo_tipo && (
            <p className="mt-2 inline-block rounded-md px-2 py-1 text-[11px] font-black text-white"
              style={{ background: '#5A6478' }}>
              {sol.motivo_tipo}
            </p>
          )}
        </div>

        {/* Estado de pago al momento de radicar */}
        <div className="rounded-xl px-3 py-2.5 mb-3"
          style={{ background: CAMPO, border: `1px solid ${debe ? ROJO : VERDE}` }}>
          <p className="text-white/50 text-[10px] font-bold tracking-wider mb-1">
            ESTADO DE PAGO AL RADICAR
          </p>
          {debe ? (
            <p className="text-white font-black text-[14px]">
              Debe {sol.meses_pendientes} {sol.meses_pendientes === 1 ? 'mes' : 'meses'}
              {sol.valor_pendiente > 0 && (
                <span className="text-white/70 font-bold"> · {enPesos(sol.valor_pendiente)}</span>
              )}
            </p>
          ) : (
            <p className="font-black text-[14px]" style={{ color: VERDE }}>A paz y salvo</p>
          )}
          {dep && (
            /* ── LA ADMÓN MIRA, NO PAGA (dirección, 04/09/2026) ──────────
               «En retiros la admón observa el estado de cuenta, pero no como
                padre: dice PAGAR.»

               El estado de cuenta es la MISMA pantalla para todo el mundo, y
               por eso traía el botón rojo de PAGAR — que es del papá, para
               subir su soporte—. La dirección entra a REVISAR una deuda antes
               de firmar un retiro, no a pagarla. Con `readonly=1` los meses sin
               pagar salen como PEND y no como un botón: se lee igual de bien
               y no hay forma de empezar un pago por equivocación en nombre de
               una familia. Es el mismo camino que usa Pagos Pendientes. */
            <a
              href={`/alumnos/${dep.id}/estado-cuenta?readonly=1`}
              className="inline-block mt-1.5 text-[12px] font-bold underline"
              style={{ color: '#4E8FD6' }}>
              Ver el estado de cuenta de hoy →
            </a>
          )}
        </div>

        {/* ── PAZ Y SALVO — lo autoriza administración, nadie más ──────────
            Estar al día NO alcanza: la constancia va firmada por la
            representante legal, así que la decisión es de la casa. */}
        {onPazYSalvo && (
          <div className="rounded-xl px-3 py-2.5 mb-3"
            style={{ background: CAMPO, border: `1px solid ${pys ? VERDE : BORDE}` }}>
            <p className="text-white/50 text-[10px] font-bold tracking-wider mb-1.5">PAZ Y SALVO</p>
            {pys ? (
              <>
                <p className="font-black text-[13px] mb-2" style={{ color: VERDE }}>
                  Autorizado · el padre ya lo puede descargar
                </p>
                <p className="text-white/45 text-[11px] mb-2">
                  {sol.paz_salvo_en ? `Autorizado el ${fechaCorta(sol.paz_salvo_en)}` : ''}
                  {sol.paz_salvo_por ? ` por ${sol.paz_salvo_por}` : ''}
                </p>
                <button
                  onClick={() => onPazYSalvo(false)}
                  disabled={trabajando}
                  className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: PANEL, border: `1px solid ${BORDE}`, minHeight: 42, fontSize: 12 }}>
                  <FileX2 className="w-4 h-4" /> QUITAR LA AUTORIZACIÓN
                </button>
              </>
            ) : (
              <>
                <p className="text-white/60 text-[12px] mb-2 leading-relaxed">
                  Sin autorizar. El padre ve el botón apagado y un aviso de que está en revisión.
                  {debe && <b className="text-white"> Ojo: al radicar figuraba debiendo.</b>}
                </p>
                <button
                  onClick={() => onPazYSalvo(true)}
                  disabled={trabajando}
                  className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: debe ? AMBAR : VERDE, minHeight: 44, fontSize: 12.5 }}>
                  {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                  AUTORIZAR PAZ Y SALVO
                </button>
              </>
            )}
          </div>
        )}

        {/* Decisión */}
        {abierta && onAprobar && onDevolver && (
          <>
            {debe && (
              <p className="text-white/55 text-[12px] mb-2 leading-relaxed">
                Coordina primero los pagos pendientes. Aprobar el retiro no borra la deuda.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={onDevolver}
                disabled={trabajando}
                className="flex-1 rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: VERDE, minHeight: 46, fontSize: 13 }}>
                {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                DEVOLVER
              </button>
              <button
                onClick={onAprobar}
                disabled={trabajando}
                className="flex-1 rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: ROJO, minHeight: 46, fontSize: 13 }}>
                {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                APROBAR RETIRO
              </button>
            </div>
          </>
        )}

        {!abierta && sol.resuelta_en && (
          <p className="text-white/45 text-[12px]">
            Resuelto el {fechaCorta(sol.resuelta_en)}
            {sol.resuelta_por ? ` por ${sol.resuelta_por}` : ''}.
          </p>
        )}
      </div>
    </article>
  );
}

/* ── 26/08/2026 · 3:40 p. m. ─────────────────────────────────────────────── */
function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
