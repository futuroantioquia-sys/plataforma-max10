'use client';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
//  /retiro  ·  SOLICITUD DE RETIRO — la pantalla del CALIDOSO (padre).
//
//  Pensada para el celular: letra grande, un solo camino, botones de 44 px.
//
//  Pasos que ve el padre:
//    1. Ve el CÓDIGO y el NOMBRE de su deportista (no los puede cambiar).
//    2. Escribe el MOTIVO del retiro.
//    3. Oprime ACEPTAR.
//    4. Le sale el aviso: el retiro NO se hace hasta aclarar el estado de pago.
//       El caso queda EN ESTUDIO.
//    5. Si no debe nada, le aparece el botón DESCARGAR PAZ Y SALVO.
//
//  Seguridad: el padre solo puede pedir el retiro DE SU PROPIO hijo. El id sale
//  de la sesión que emitió el servidor al ingresar con código y documento; el
//  middleware ya bloqueó esta ruta para todo el que no sea calidoso.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LogOut, AlertTriangle, CheckCircle2, MessageCircle, FileText, Loader2, Search, Shield } from 'lucide-react';
import { getDeportistaPorId, getDeportistas, getPagosPorCodigos, updateColumnasDeportista } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { esDelEquipo } from '@/lib/permisos';
import {
  estadoDePago, crearSolicitud, getUltimaSolicitud, linkWhatsAppPagos,
  colDe, enPesos, EST_SOLICITA, WA_PAGOS_BONITO, todosLosCodigos,
  documentoDe, documentoBonito,
  RX_CODIGO, RX_ESTADO, RX_PROGRAMA, RX_PROYECTO, RX_SEDE,
  type EstadoDePago, type Solicitud,
} from '@/lib/retiro';
import { descargarPazYSalvo } from '@/lib/paz-y-salvo';

/* ── Colores oficiales ── */
const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const ROJO   = '#C0504D';
const AMBAR  = '#E0A33A';

type Paso = 'cargando' | 'elegir' | 'formulario' | 'listo' | 'sin-sesion';

export default function SolicitudRetiroPage() {
  const router = useRouter();

  const [paso,   setPaso]   = useState<Paso>('cargando');
  const [dep,    setDep]    = useState<Deportista | null>(null);
  const [pago,   setPago]   = useState<EstadoDePago | null>(null);
  const [abierta, setAbierta] = useState<Solicitud | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [bajando,  setBajando]  = useState(false);
  const [error,  setError]  = useState('');

  /* Modo administración: el mismo módulo, pero entrando desde Deportistas.
     Sirve para radicar el retiro de un padre que llamó por teléfono. */
  const [modoAdmin, setModoAdmin] = useState(false);
  const [lista, setLista]   = useState<Deportista[]>([]);
  const [busca, setBusca]   = useState('');

  /* ── Traer un deportista y todo lo suyo ────────────────────────────────── */
  async function abrirDeportista(d: Deportista) {
    setDep(d);
    setPaso('cargando');
    try {
      /* Los pagos pueden estar guardados bajo el CÓDIGO (lo que sube el Libro
         Contable) o bajo el id interno (las correcciones a mano). Hay que pedir
         los dos o la cuenta del paz y salvo sale mal. */
      const claves = [d.id, ...todosLosCodigos(d)];
      const [todos, previa] = await Promise.all([
        getPagosPorCodigos(claves).catch(() => null),
        getUltimaSolicitud(d.id).catch(() => null),
      ]);
      setPago(estadoDePago(d, todos as any));
      setAbierta(previa);
      setMotivo('');
      /* Si ya radicó una y sigue viva (en estudio o aprobada), se le muestra
         en qué va —y su Paz y Salvo— en vez del formulario en blanco.
         Solo si se la DEVOLVIERON puede volver a pedir el retiro. */
      const viva = !!previa && previa.estado !== 'DEVUELTA';
      setPaso(viva ? 'listo' : 'formulario');
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la información.');
      setPaso('formulario');
    }
  }

  /* ── Al entrar: ¿es un padre o es administración? ──────────────────────── */
  useEffect(() => {
    let vivo = true;
    (async () => {
      let id = (typeof window !== 'undefined'
        ? localStorage.getItem('futuro-calidoso-id')
        : '') || '';

      /* Si el navegador no lo tiene guardado, se le PREGUNTA AL SERVIDOR de
         quién es esta sesión (26/08/2026). Antes solo se miraba la memoria del
         navegador, y por eso a un padre retirado que acababa de ingresar bien
         esta pantalla le decía "vuelve a ingresar": el ingreso no había
         alcanzado a guardar el id. El servidor sí sabe, porque va dentro de la
         cookie firmada. */
      if (!id) {
        try {
          const r = await fetch('/api/auth/quien-soy', { cache: 'no-store' });
          if (r.ok) {
            const d = await r.json();
            if (d?.rol === 'deportista' && d?.id) {
              id = String(d.id);
              try { localStorage.setItem('futuro-calidoso-id', id); } catch { /* noop */ }
            }
          }
        } catch { /* se sigue con lo de abajo */ }
      }

      /* Sin id de calidoso: si es alguien del equipo, se abre el buscador
         para que escoja el deportista. Si no, se le pide volver a ingresar. */
      if (!id) {
        if (esDelEquipo()) {
          setModoAdmin(true);
          try {
            const todos = await getDeportistas();
            if (!vivo) return;
            setLista(todos);
            setPaso('elegir');
          } catch (e: any) {
            if (!vivo) return;
            setError(e?.message || 'No se pudo cargar la lista de deportistas.');
            setPaso('elegir');
          }
        } else {
          setPaso('sin-sesion');
        }
        return;
      }

      try {
        const d = await getDeportistaPorId(id);
        if (!vivo) return;
        if (!d) { setPaso('sin-sesion'); return; }
        await abrirDeportista(d);
      } catch (e: any) {
        if (!vivo) return;
        setError(e?.message || 'No se pudo cargar la información.');
        setPaso('formulario');
      }
    })();
    return () => { vivo = false; };
  }, []);

  /* ── Buscador de administración ────────────────────────────────────────── */
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return lista
      .filter(d => `${colDe(d, RX_CODIGO)} ${d._nombre}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [lista, busca]);

  const codigo   = colDe(dep, RX_CODIGO);
  const nombre   = dep?._nombre ?? '';
  const programa = colDe(dep, RX_PROGRAMA);
  const proyecto = colDe(dep, RX_PROYECTO);
  const sede     = colDe(dep, RX_SEDE);

  /* ── ACEPTAR: radicar la solicitud ─────────────────────────────────────── */
  async function aceptar() {
    if (!dep) return;
    const texto = motivo.trim();
    if (texto.length < 5) {
      setError('Por favor escribe el motivo del retiro.');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      const p = pago ?? estadoDePago(dep, null);

      // 1. Queda la solicitud, con el motivo y una foto del estado de pago.
      const sol = await crearSolicitud({
        deportistaId: dep.id,
        codigo, nombre, programa, proyecto, sede,
        motivo: texto,
        pago: p,
      });

      // 2. El deportista NO se retira: queda EN ESTUDIO con estado
      //    "SOLICITA RETIRO", que es lo que ve administración en Total Afiliados.
      const kEstado = Object.keys(dep._columnas ?? {}).find(k => RX_ESTADO.test(k.trim())) || 'ESTADO';
      await updateColumnasDeportista(dep.id, { ...(dep._columnas ?? {}), [kEstado]: EST_SOLICITA });

      setAbierta(sol);
      setPaso('listo');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar la solicitud. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  /* ── Bajar el PDF del Paz y Salvo ──────────────────────────────────────── */
  async function bajarPazYSalvo() {
    if (!dep) return;
    /* Doble llave: no basta con estar al día, administración lo tuvo que
       autorizar. Se comprueba otra vez aquí y no solo escondiendo el botón. */
    if (!abierta?.paz_salvo) {
      setError('El Paz y Salvo todavía no está autorizado por administración.');
      return;
    }
    setError('');
    setBajando(true);
    try {
      await descargarPazYSalvo({
        nombre,
        codigo,
        documento: documentoBonito(documentoDe(dep)),
      });
    } catch (e: any) {
      setError(e?.message || 'No se pudo armar el PDF. Inténtalo otra vez.');
    }
    setBajando(false);
  }

  /* ── Pantallas ─────────────────────────────────────────────────────────── */

  if (paso === 'cargando') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: LIENZO }}>
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-bold">Cargando tu información…</p>
        </div>
      </div>
    );
  }

  if (paso === 'sin-sesion') {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ background: LIENZO }}>
        <div className="w-full max-w-md rounded-2xl p-6 text-center" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <LogOut className="w-10 h-10 mx-auto mb-3" style={{ color: AMBAR }} />
          <h1 className="text-white font-black text-lg mb-2">Vuelve a ingresar</h1>
          <p className="text-white/70 text-sm mb-5">
            Para pedir el retiro necesitamos saber de qué deportista se trata.
            Ingresa otra vez con el código y el número de documento.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full rounded-xl font-black text-white"
            style={{ background: VERDE, minHeight: 48 }}>
            IR AL INGRESO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: LIENZO }}>

      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{ background: CAMPO, borderBottom: `1px solid ${BORDE}` }}>
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="rounded-xl flex items-center justify-center shrink-0"
          style={{ width: 44, height: 44, background: PANEL, border: `1px solid ${BORDE}` }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-black text-base leading-tight">Solicitud de retiro</h1>
          <p className="text-white/55 text-[11px] leading-tight">
            {modoAdmin ? 'Administración · radicar por el padre' : 'Futuro Antioquia · MAX 10'}
          </p>
        </div>
        {modoAdmin && dep && paso !== 'elegir' && (
          <button
            onClick={() => { setDep(null); setPago(null); setAbierta(null); setMotivo(''); setError(''); setPaso('elegir'); }}
            className="rounded-xl font-black text-white px-3 shrink-0"
            style={{ minHeight: 44, background: PANEL, border: `1px solid ${BORDE}`, fontSize: 11 }}>
            CAMBIAR
          </button>
        )}
      </header>

      <main className="px-4 pt-5 mx-auto w-full" style={{ maxWidth: 520 }}>

        {/* ── Aviso de que se está actuando por el padre ── */}
        {modoAdmin && (
          <div className="rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"
            style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
            <Shield className="w-4 h-4 shrink-0 mt-0.5" style={{ color: AMBAR }} />
            <p className="text-white/70 text-[12px] leading-relaxed">
              Estás entrando como <b className="text-white">administración</b>. Aquí ves lo
              mismo que ve el padre y puedes radicar el retiro por él —
              por ejemplo, cuando llama por teléfono.
            </p>
          </div>
        )}

        {/* ═══ PASO 0 — escoger el deportista (solo administración) ═══ */}
        {paso === 'elegir' && (
          <>
            <div className="flex items-center gap-2 rounded-xl px-3 mb-4"
              style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 48 }}>
              <Search className="w-4 h-4 text-white/45 shrink-0" />
              <input
                autoFocus
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Escribe el código o el nombre…"
                className="flex-1 bg-transparent outline-none text-white text-[15px] py-2"
              />
              {busca && (
                <button onClick={() => setBusca('')} className="text-white/50 text-[13px] font-bold px-2">✕</button>
              )}
            </div>

            {busca.trim().length < 2 && (
              <p className="text-white/45 text-[13px] text-center py-8">
                Escribe al menos dos letras o números para buscar.
              </p>
            )}
            {busca.trim().length >= 2 && resultados.length === 0 && (
              <p className="text-white/45 text-[13px] text-center py-8">
                No encontramos a nadie con eso.
              </p>
            )}

            <div className="space-y-2">
              {resultados.map(d => (
                <button
                  key={d.id}
                  onClick={() => abrirDeportista(d)}
                  className="w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left"
                  style={{ background: PANEL, border: `1px solid ${BORDE}`, minHeight: 52 }}>
                  <span className="rounded-lg px-2 py-1 text-white font-black text-[13px] shrink-0"
                    style={{ background: VERDE, minWidth: 62, textAlign: 'center' }}>
                    {colDe(d, RX_CODIGO) || '—'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-white font-bold text-[14px] truncate">{d._nombre}</span>
                    <span className="block text-white/45 text-[11px] truncate">
                      {[colDe(d, RX_PROGRAMA), colDe(d, RX_PROYECTO)].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Quién es el deportista (no se puede cambiar) ── */}
        {paso !== 'elegir' && (
        <section className="rounded-2xl overflow-hidden mb-5" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <div className="px-4 py-2.5" style={{ background: VERDE }}>
            <p className="text-white font-black text-[11px] tracking-wider">DEPORTISTA</p>
          </div>
          <div className="p-4 space-y-3">
            <Dato etiqueta="Código"     valor={codigo || '—'} grande />
            <Dato etiqueta="Nombre"     valor={nombre || '—'} grande />
            {programa && <Dato etiqueta="Programa" valor={programa} />}
            {proyecto && <Dato etiqueta="Proyecto" valor={proyecto} />}
          </div>
        </section>
        )}

        {/* ═══ PASO 1 — el formulario ═══ */}
        {paso === 'formulario' && (
          <>
            <section className="rounded-2xl p-4 mb-4" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
              <label htmlFor="motivo" className="block text-white font-black text-sm mb-1">
                Motivo del retiro
              </label>
              <p className="text-white/55 text-[12px] mb-3">
                Cuéntanos por qué se retira, es muy importante para nosotros saberlo.
              </p>
              <textarea
                id="motivo"
                value={motivo}
                onChange={e => { setMotivo(e.target.value); if (error) setError(''); }}
                rows={5}
                maxLength={600}
                placeholder="Escribe aquí el motivo…"
                className="w-full rounded-xl p-3 text-white text-[15px] outline-none resize-y"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 120 }}
              />
              <p className="text-white/40 text-[11px] mt-1 text-right">{motivo.length}/600</p>
            </section>

            {error && (
              <div className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2"
                style={{ background: '#4a2320', border: `1px solid ${ROJO}` }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROJO }} />
                <p className="text-white text-[13px] font-semibold">{error}</p>
              </div>
            )}

            <button
              onClick={aceptar}
              disabled={enviando || !dep}
              className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: VERDE, minHeight: 52, fontSize: 15, letterSpacing: '0.04em' }}>
              {enviando ? <><Loader2 className="w-5 h-5 animate-spin" /> ENVIANDO…</> : 'ACEPTAR'}
            </button>

            <p className="text-white/45 text-[12px] text-center mt-3 leading-relaxed">
              Al aceptar, la solicitud entra en estudio. El deportista
              <b className="text-white/70"> no queda retirado de inmediato</b>.
            </p>
          </>
        )}

        {/* ═══ PASO 2 — el aviso ═══ */}
        {paso === 'listo' && (
          <Resultado
            pago={pago}
            codigo={codigo}
            nombre={nombre}
            motivo={abierta?.motivo || motivo}
            aprobado={abierta?.estado === 'APROBADA'}
            autorizado={!!abierta?.paz_salvo}
            bajando={bajando}
            onDescargar={bajarPazYSalvo}
            /* ── LA ADMÓN MIRA; EL PAPÁ SÍ PUEDE PAGAR ────────────────────
               (dirección, 04/09/2026 — «en retiros la admón observa el estado
                de cuentas, pero no como padre: dice PAGAR»)

               Esta pantalla la usan los dos. Cuando entra la dirección a
               radicar el retiro por el padre (modoAdmin), el estado de cuenta
               se abre SOLO PARA MIRAR: los meses sin pagar dicen PEND en vez
               del botón rojo, y no hay forma de arrancar un pago a nombre de
               una familia por equivocación.

               Cuando es el papá el que está en su propio retiro, el botón de
               PAGAR se le deja: si queda debiendo, ahí mismo puede ponerse al
               día y sacar su paz y salvo. */
            onEstadoCuenta={() => router.push(
              `/alumnos/${dep?.id}/estado-cuenta${modoAdmin ? '?readonly=1' : ''}`)}
            onInicio={() => router.push(`/alumnos/${dep?.id}`)}
          />
        )}
      </main>
    </div>
  );
}

/* ── Un dato de la ficha ─────────────────────────────────────────────────── */
function Dato({ etiqueta, valor, grande }: { etiqueta: string; valor: string; grande?: boolean }) {
  return (
    <div>
      <p className="text-white/50 text-[11px] font-bold tracking-wider">{etiqueta.toUpperCase()}</p>
      <p className={`text-white font-black ${grande ? 'text-[17px]' : 'text-[14px]'} leading-snug`}>{valor}</p>
    </div>
  );
}

/* ── El aviso que sale después de aceptar ────────────────────────────────── */
function Resultado({
  pago, codigo, nombre, motivo, aprobado, autorizado, bajando, onDescargar, onEstadoCuenta, onInicio,
}: {
  pago: EstadoDePago | null;
  codigo: string;
  nombre: string;
  motivo: string;
  aprobado: boolean;
  autorizado: boolean;
  bajando: boolean;
  onDescargar: () => void;
  onEstadoCuenta: () => void;
  onInicio: () => void;
}) {
  const alDia  = !!pago?.alDia;
  const becado = !!pago?.becado;

  return (
    <>
      {/* ── LO PRIMERO QUE VE, SEGÚN EN QUÉ VA EL TRÁMITE ──────────────────
          · TODAVÍA EN TRÁMITE → se le confirma que quedó radicada y se le
            repite el motivo que escribió, para que sepa qué fue lo que mandó.
          · YA EN EL PASO DE DESCARGAR → eso ya no da a lugar: aquí solo va la
            despedida de la casa, en grande.

          OJO (26/08/2026): esto NO se decide solo por "retiro aprobado". La
          casa puede autorizar el Paz y Salvo con la solicitud todavía en
          estudio —de hecho es lo normal— y en ese momento el padre ya está en
          el paso de descargar. Cualquiera de las dos cosas manda. */}
      {(aprobado || autorizado) ? (
        <section className="rounded-2xl px-5 py-7 mb-4 text-center"
          style={{ background: PANEL, border: `2px solid ${VERDE}` }}>
          {/* Los cortes de renglón son los que pidió la dirección, no los que
              decida el ancho de la pantalla. Por eso van forzados con <br />
              y no se dejan al azar. — 26/08/2026 */}
          <p className="font-black italic leading-snug"
            style={{ color: VERDE, fontSize: 21 }}>
            Te deseamos el mayor de los éxitos<br />
            en todos tus proyectos.
          </p>
          <p className="font-black italic leading-snug mt-5"
            style={{ color: VERDE, fontSize: 21 }}>
            Gracias por habernos hecho<br />
            parte de tu historia.
          </p>
          <p className="font-black italic leading-snug mt-5"
            style={{ color: VERDE, fontSize: 21 }}>
            Si algún día deseas volver<br />
            esta es tu casa.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl p-4 mb-4 text-center" style={{ background: PANEL, border: `2px solid ${VERDE}` }}>
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: VERDE }} />
          <h2 className="text-white font-black text-base mb-1">Recibimos tu solicitud</h2>
          <p className="text-white/65 text-[13px] leading-relaxed">
            Quedó radicada y el caso <b className="text-white">entra en estudio</b>.
          </p>
          {motivo && (
            <p className="text-white/50 text-[12px] mt-3 italic px-2 break-words">“{motivo}”</p>
          )}
        </section>
      )}

      {/* ── AVISO DE PAGOS ────────────────────────────────────────────────
          Solo sale si el deportista DEBE algo (o si no se pudo leer su estado
          de cuenta). Al que está a paz y salvo no se le manda a aclarar nada:
          sería mandarlo a resolver un problema que no tiene. — 26/08/2026 */}
      {!alDia && (
      <section className="rounded-2xl overflow-hidden mb-4" style={{ background: PANEL, border: `2px solid ${AMBAR}` }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: AMBAR }}>
          <AlertTriangle className="w-4 h-4 text-white shrink-0" />
          <p className="text-white font-black text-[12px] tracking-wide">AVISO IMPORTANTE</p>
        </div>
        <div className="p-4">
          <p className="text-white font-bold text-[15px] leading-relaxed">
            El retiro no puede realizarse hasta no aclarar el estado de pago del deportista.
          </p>

          {pago && !pago.sinInformacion && pago.pendientes > 0 && (
            <div className="rounded-xl px-3 py-3 mt-3" style={{ background: CAMPO, border: `1px solid ${ROJO}` }}>
              <p className="text-white/60 text-[11px] font-bold tracking-wider mb-1">LO QUE FIGURA PENDIENTE</p>
              <p className="text-white font-black text-[16px]">
                {pago.pendientes} {pago.pendientes === 1 ? 'mes' : 'meses'}
                {pago.valor > 0 && <span className="text-white/70 font-bold text-[14px]"> · {enPesos(pago.valor)}</span>}
              </p>
              {pago.meses.length > 0 && (
                <p className="text-white/55 text-[12px] mt-1 leading-snug">{pago.meses.join(' · ')}</p>
              )}
            </div>
          )}

          {pago?.sinInformacion && (
            <p className="text-white/55 text-[12px] mt-3 leading-relaxed">
              No pudimos leer tu estado de cuenta en este momento. Revísalo abajo o
              escríbele a la línea de pagos.
            </p>
          )}

          <p className="text-white/60 text-[13px] mt-4 mb-2 leading-relaxed">
            Para coordinarlo, usa cualquiera de estos dos caminos:
          </p>

          <button
            onClick={onEstadoCuenta}
            className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2 mb-2"
            style={{ background: '#4E8FD6', minHeight: 48, fontSize: 14 }}>
            <FileText className="w-4 h-4" /> VER MI ESTADO DE CUENTA
          </button>
          <p className="text-white/40 text-[11px] text-center mb-4">
            Allí está el buzón del Área de Pagos para dejar tu mensaje.
          </p>

          <a
            href={linkWhatsAppPagos(codigo, nombre)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2"
            style={{ background: '#25D366', minHeight: 48, fontSize: 14 }}>
            <MessageCircle className="w-4 h-4" /> WHATSAPP LÍNEA DE PAGOS
          </a>
          <p className="text-white/40 text-[11px] text-center mt-1">{WA_PAGOS_BONITO}</p>
        </div>
      </section>
      )}

      {/* ── PAZ Y SALVO ──────────────────────────────────────────────────────
          Dos llaves, no una: hay que estar al día Y que administración lo
          haya AUTORIZADO en Total Retirados. La constancia va firmada por la
          representante legal, así que esa decisión es de la casa. */}
      {alDia && (
        autorizado ? (
          <section className="rounded-2xl overflow-hidden mb-4" style={{ background: PANEL, border: `2px solid ${VERDE}` }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: VERDE }}>
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
              <p className="text-white font-black text-[12px] tracking-wide">PAZ Y SALVO AUTORIZADO</p>
            </div>
            <div className="p-4">
              <p className="text-white/70 text-[13px] mb-3 leading-relaxed">
                {becado
                  ? 'Este deportista es becado: no tiene mensualidades pendientes.'
                  : 'No figura ningún mes pendiente y la constancia ya está autorizada.'}
              </p>
              <button
                onClick={onDescargar}
                disabled={bajando}
                className="w-full rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: VERDE, minHeight: 48, fontSize: 14 }}>
                {bajando
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> ARMANDO EL PDF…</>
                  : <><FileText className="w-4 h-4" /> DESCARGAR PAZ Y SALVO</>}
              </button>
              <p className="text-white/40 text-[11px] text-center mt-2">
                Se baja a tu carpeta de Descargas.
              </p>
            </div>
          </section>
        ) : (
          /* Está a paz y salvo pero la institución todavía no lo valida.
             Nada de aclarar pagos: solo se le dice cuándo lo va a poder bajar. */
          <section className="rounded-2xl overflow-hidden mb-4" style={{ background: PANEL, border: `2px solid ${VERDE}` }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: VERDE }}>
              <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
              <p className="text-white font-black text-[12px] tracking-wide">ESTÁS A PAZ Y SALVO</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-white font-bold text-[15px] leading-relaxed mb-2">
                No tienes nada pendiente.
              </p>
              <p className="text-white/70 text-[13.5px] leading-relaxed mb-4">
                En las próximas <b className="text-white">24 horas</b> la institución
                valida tu solicitud y podrás descargar aquí mismo tu
                <b className="text-white"> Paz y Salvo</b>.
              </p>
              <div className="rounded-xl px-3 py-3 flex items-center justify-center gap-2"
                style={{ background: CAMPO, border: `1px solid ${BORDE}` }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: AMBAR }} />
                <p className="text-white/60 text-[12.5px] font-bold">Esperando la validación</p>
              </div>
              <p className="text-white/40 text-[11.5px] mt-3 leading-relaxed">
                Vuelve a entrar más tarde con tu código y documento: el botón
                aparecerá aquí.
              </p>
            </div>
          </section>
        )
      )}

      <button
        onClick={onInicio}
        className="w-full rounded-xl font-bold text-white/80"
        style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 46, fontSize: 13 }}>
        Volver al inicio
      </button>
    </>
  );
}
