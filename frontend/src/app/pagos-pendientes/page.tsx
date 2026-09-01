'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Eye, Clock, AlertCircle, BookOpen } from 'lucide-react';
import { getSoportesPendientes, getSoporteDatos, confirmarSoportePago, eliminarSoportePago, getDeportistas } from '@/lib/db';
import type { SoportePago, Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';
import { abrirSoporte, dataUrlABlobUrl, esPdfDato } from '@/lib/utils';

/* ── Helpers para extraer columnas del deportista ── */
function sinTildes(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
function getCol(dep: Deportista, rx: RegExp): string {
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => rx.test(sinTildes(c.trim())));
  return k ? String(cols[k] ?? '').trim() : '';
}
function getCodigo(dep: Deportista): string {
  const cols = dep._columnas ?? {};
  const kCod = Object.keys(cols).find(k => /^COD/.test(sinTildes(k)));
  if (kCod) return String(cols[kCod] ?? '').trim();
  // Fallback: primer valor 4-5 dígitos
  for (const v of Object.values(cols)) {
    const d = String(v ?? '').replace(/\D/g, '');
    if (d.length >= 4 && d.length <= 5) return d;
  }
  return '';
}

/* ── Tipo de soporte enriquecido con info del deportista ── */
interface SoporteEnriquecido extends SoportePago {
  depNombre: string;
  depCodigo: string;
  depPrograma: string;
  depProyecto: string;
  depId: string;
}

/* ── PALETA OFICIAL DE LA PLATAFORMA ─────────────────────────────
   La misma de Control de Pagos, Asistencia y Microciclo. Esta pantalla
   estaba en azul; se pasó al gris verde el 25/08/2026. */
const LIENZO = '#333F50';   // fondo de la pantalla
const PANEL  = '#3C4759';   // tarjetas y filas
const CAMPO  = '#2B3547';   // casillas y recuadros
const BORDE  = '#4A5568';
const VERDE  = '#00B050';   // verde institucional
const ROJO   = '#C0504D';   // lo que se rechaza
const GRIS   = '#7C879A';   // guiones y casillas sin dato

export default function PagosPendientesPage() {
  const router = useRouter();
  const [soportes,   setSoportes]   = useState<SoporteEnriquecido[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [viendoIdx,  setViendoIdx]  = useState<number | null>(null);
  const [accion,     setAccion]     = useState<{ idx: number; tipo: 'confirmar' | 'rechazar' } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  const [datosMap,   setDatosMap]   = useState<Record<string, string>>({}); // id -> imagen base64 (carga perezosa)
  const [urlVista,   setUrlVista]   = useState('');   // URL que se muestra en el visor (blob: si es PDF)

  // Cargar las imágenes de a una (sin bloquear la lista ni saturar la red)
  useEffect(() => {
    let cancel = false;
    (async () => {
      for (const s of soportes) {
        if (cancel) return;
        if (datosMap[s.id]) continue;
        const d = await getSoporteDatos(s.id);
        if (cancel) return;
        if (d) setDatosMap(prev => ({ ...prev, [s.id]: d }));
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soportes]);

  // Dato del soporte que se esta viendo en el visor
  const datoVista = viendoIdx !== null ? (datosMap[soportes[viendoIdx]?.id || ''] || '') : '';

  /* Un PDF no se puede mostrar con <img> ni abrir con un enlace "data:" — el
     navegador lo bloquea. Se convierte a archivo temporal (blob:) y ese sí abre. */
  useEffect(() => {
    if (!datoVista) { setUrlVista(''); return; }
    if (!esPdfDato(datoVista)) { setUrlVista(datoVista); return; }
    const url = dataUrlABlobUrl(datoVista);
    setUrlVista(url);
    return () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); };
  }, [datoVista]);

  const mostrarToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [pendientes, deportistas] = await Promise.all([
        getSoportesPendientes(),
        getDeportistas(),
      ]);

      // Enriquecer cada soporte con info del deportista
      const enriquecidos: SoporteEnriquecido[] = pendientes.map(s => {
        const dep = deportistas.find(d => d.id === s.deportista_id);
        return {
          ...s,
          depId:       dep?.id ?? s.deportista_id,
          depNombre:   dep?._nombre ?? '—',
          depCodigo:   dep ? getCodigo(dep) : '—',
          depPrograma: dep ? getCol(dep, /^PROG/i) : '—',
          depProyecto: dep ? getCol(dep, /^PROY/i) : '—',
        };
      });

      setSoportes(enriquecidos);
    } catch (e) {
      console.error('[pagos-pendientes] cargar:', e);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleConfirmar(idx: number) {
    const s = soportes[idx];
    setProcesando(true);
    const ok = await confirmarSoportePago(s.id);
    if (ok) {
      setSoportes(prev => prev.filter(x => x.id !== s.id));
      mostrarToast('✅ Pago confirmado correctamente', true);
    } else {
      mostrarToast('❌ No se pudo confirmar. Intenta de nuevo.', false);
    }
    setProcesando(false);
    setAccion(null);
  }

  async function handleRechazar(idx: number) {
    const s = soportes[idx];
    setProcesando(true);
    const ok = await eliminarSoportePago(s.id);
    if (ok) {
      setSoportes(prev => prev.filter(x => x.id !== s.id));
      mostrarToast('🗑️ Soporte eliminado', true);
    } else {
      mostrarToast('❌ No se pudo eliminar. Intenta de nuevo.', false);
    }
    setProcesando(false);
    setAccion(null);
  }

  // Detectar si el dato es imagen o PDF
  function esImagen(data: string): boolean {
    return data.startsWith('data:image/');
  }

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* ── Header ── */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 shadow overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]" aria-hidden>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-pp" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/>
                <polygon points="30,22 37,27 34,35 26,35 23,27" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-pp)"/>
          </svg>
        </div>
        <button onClick={() => router.back()} className="relative text-white hover:opacity-80 transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Pagos Pendientes</h1>
          <p className="text-white text-[11px]">Soportes enviados por padres · MAX 10</p>
        </div>
        {/* Badge de pendientes */}
        {!cargando && soportes.length > 0 && (
          <div className="relative flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5">
            <AlertCircle className="w-4 h-4 text-white"/>
            <span className="text-white font-black text-sm">{soportes.length}</span>
          </div>
        )}
        {/* Logo MAX10 */}
        <div className="relative flex flex-col items-center border-l border-white/30 pl-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX10" className="h-7 object-contain" />
          <p className="text-white text-[9px] leading-none mt-0.5 tracking-wide">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="px-2 py-4">

        {/* ── Cargando ── */}
        {cargando && (
          <div className="flex items-center justify-center py-24">
            <BalonCargando texto="Cargando soportes…" />
          </div>
        )}

        {/* ── Sin pendientes ── */}
        {!cargando && soportes.length === 0 && (
          <div className="rounded-3xl shadow-sm border p-10 text-center max-w-md mx-auto mt-8" style={{ background: PANEL, borderColor: BORDE }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: CAMPO }}>
              <CheckCircle className="w-8 h-8" style={{ color: VERDE }}/>
            </div>
            <p className="text-white font-black text-lg">¡Todo al día!</p>
            <p className="text-white text-sm mt-1">No hay soportes de pago pendientes de confirmar.</p>
          </div>
        )}

        {/* ── Tabla de soportes ── */}
        {!cargando && soportes.length > 0 && (
          <div className="overflow-x-auto rounded-2xl shadow-sm border" style={{ borderColor: BORDE }}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-white text-xs font-black uppercase tracking-wider" style={{ background: VERDE }}>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Código</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Nombre</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Programa</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Proyecto</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Meses Pagando</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Fecha Subido</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Soporte de Pago</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {soportes.map((s, idx) => (
                  <tr key={s.id} style={{ background: PANEL }} className="hover:brightness-125 transition">

                    {/* Código */}
                    <td className="px-3 py-3 font-black whitespace-nowrap" style={{ color: VERDE }}>
                      {s.depCodigo || '—'}
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-3 font-semibold text-white whitespace-nowrap max-w-[160px] truncate">
                      {s.depNombre}
                    </td>

                    {/* Programa */}
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {s.depPrograma || '—'}
                    </td>

                    {/* Proyecto */}
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {s.depProyecto || '—'}
                    </td>

                    {/* Meses pagando */}
                    <td className="px-3 py-3">
                      {s.meses && s.meses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.meses.map(m => (
                            <span key={m} className="px-2 py-0.5 rounded-md text-white text-[11px] font-bold whitespace-nowrap" style={{ background: VERDE }}>
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{ color: GRIS }}>—</span>}
                    </td>

                    {/* Fecha en que se subió el soporte */}
                    <td className="px-3 py-3 text-white whitespace-nowrap text-[12px]">
                      {s.created_at
                        ? new Date(s.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                        : (s.fecha || '—')}
                    </td>

                    {/* Soporte de pago (imagen cargada aparte) */}
                    <td className="px-3 py-3">
                      {(() => {
                        const img = datosMap[s.id];
                        if (!img) {
                          return (
                            <div className="w-14 h-14 rounded-lg border flex items-center justify-center text-[9px] animate-pulse" style={{ background: CAMPO, borderColor: BORDE, color: GRIS }}>
                              cargando…
                            </div>
                          );
                        }
                        return esImagen(img) ? (
                          <button onClick={() => setViendoIdx(idx)} className="relative block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img} alt="Soporte"
                              className="w-14 h-14 object-cover rounded-lg border hover:opacity-80 transition cursor-pointer" style={{ borderColor: BORDE }} />
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                              <Eye className="w-5 h-5 text-white drop-shadow"/>
                            </span>
                          </button>
                        ) : (
                          <button onClick={() => setViendoIdx(idx)}
                            title="Ver el soporte en PDF"
                            className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-lg border text-white hover:opacity-85 transition cursor-pointer" style={{ background: ROJO, borderColor: ROJO }}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
                            <span className="text-[9px] font-black">PDF</span>
                          </button>
                        );
                      })()}
                    </td>

                    {/* Acciones */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 justify-center">
                        <button
                          onClick={() => setAccion({ idx, tipo: 'confirmar' })}
                          title="Confirmar pago"
                          style={{ background: VERDE, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-black text-[11px] transition whitespace-nowrap">
                          <CheckCircle className="w-3.5 h-3.5"/> OK
                        </button>
                        <button
                          onClick={() => setAccion({ idx, tipo: 'rechazar' })}
                          title="Rechazar soporte"
                          style={{ background: ROJO, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-semibold text-[11px] transition">
                          <XCircle className="w-3.5 h-3.5"/>
                        </button>
                        <button
                          onClick={() => router.push(`/alumnos/${s.depId}/estado-cuenta?readonly=1`)}
                          title="Ver cuenta"
                          style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-semibold text-[11px] transition whitespace-nowrap">
                          <Eye className="w-3.5 h-3.5"/> Cuenta
                        </button>
                        {/* ── IR AL LIBRO CONTABLE, YA FILTRADO ─────────────
                            (dirección, 01/09/2026) El papá manda la foto del
                            pago; antes de darle OK hay que comprobar que esa
                            plata SÍ llegó al banco. Eso se mira en el Libro
                            Contable, y hasta hoy tocaba salirse, entrar allá,
                            escoger la pestaña, escribir el código de memoria y
                            devolverse. Este botón hace todo eso de un clic:
                            abre el Libro en TODAS las cuentas, con el código de
                            ESTE deportista puesto en el filtro. Se abre en una
                            ESTE deportista puesto en el filtro. Y allá arriba
                            sale una barra VOLVER A PAGOS PENDIENTES para
                            devolverse de una a darle OK. */}
                        <button
                          onClick={() => router.push(`/contabilidad?codigo=${encodeURIComponent(s.depCodigo || '')}`)}
                          disabled={!String(s.depCodigo || '').trim()}
                          title={String(s.depCodigo || '').trim()
                            ? `Ver en el Libro Contable los movimientos del código ${s.depCodigo}`
                            : 'Este deportista no tiene código: no se puede buscar en el libro'}
                          style={{ background: CAMPO, border: `1px solid ${BORDE}`, minHeight: 34 }}
                          className="flex items-center gap-1 px-2.5 rounded-lg hover:opacity-85 text-white font-semibold text-[11px] transition whitespace-nowrap disabled:opacity-35">
                          <BookOpen className="w-3.5 h-3.5"/> Libro
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </main>

      {/* ── Modal: ver imagen completa ── */}
      {viendoIdx !== null && soportes[viendoIdx] && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setViendoIdx(null)}>
          <div className={`relative w-full ${esPdfDato(datoVista) ? 'max-w-4xl' : 'max-w-2xl'}`} onClick={e => e.stopPropagation()}>
            {esPdfDato(datoVista) ? (
              /* PDF: se muestra dentro del visor del navegador. En celulares que no
                 saben mostrarlo, el boton de abajo lo abre o lo descarga. */
              <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ background: PANEL }}>
                <iframe src={urlVista} title="Soporte de pago en PDF"
                  className="w-full h-[75vh] border-0" style={{ background: CAMPO }} />
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-t" style={{ background: CAMPO, borderColor: BORDE }}>
                  <p className="text-xs font-black text-white truncate">
                    📄 {soportes[viendoIdx].nombre || 'Soporte en PDF'}
                  </p>
                  <button
                    onClick={() => abrirSoporte(datoVista, soportes[viendoIdx].nombre || 'soporte')}
                    style={{ background: VERDE }}
                    className="whitespace-nowrap px-3 py-1.5 rounded-lg hover:opacity-85 text-white font-black text-[11px] transition">
                    Abrir / descargar ↗
                  </button>
                </div>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={urlVista}
                alt="Soporte de pago"
                className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
                style={{ background: PANEL }}
              />
            )}
            <button
              onClick={() => setViendoIdx(null)}
              style={{ background: PANEL, border: `1px solid ${BORDE}` }}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full shadow-lg flex items-center justify-center text-white hover:opacity-70 transition text-lg font-black">
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar acción ── */}
      {accion && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="rounded-3xl shadow-2xl p-6 max-w-sm w-full border" style={{ background: PANEL, borderColor: BORDE }}>
            {accion.tipo === 'confirmar' ? (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: CAMPO }}>
                  <CheckCircle className="w-7 h-7" style={{ color: VERDE }}/>
                </div>
                <h3 className="text-center font-black text-white text-lg mb-1">¿Confirmar pago?</h3>
                <p className="text-center text-white text-sm mb-6">
                  Esto marca el soporte de <strong>{soportes[accion.idx]?.depNombre}</strong> como pagado y confirmado.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAccion(null)}
                    disabled={procesando}
                    style={{ background: CAMPO, borderColor: BORDE, minHeight: 48 }}
                    className="flex-1 rounded-xl border text-white font-semibold text-sm hover:opacity-85 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleConfirmar(accion.idx)}
                    disabled={procesando}
                    style={{ background: VERDE, minHeight: 48 }}
                    className="flex-1 rounded-xl text-white font-black text-sm hover:opacity-85 transition disabled:opacity-50">
                    {procesando ? 'Procesando…' : '✅ Confirmar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: CAMPO }}>
                  <XCircle className="w-7 h-7" style={{ color: ROJO }}/>
                </div>
                <h3 className="text-center font-black text-white text-lg mb-1">¿Rechazar soporte?</h3>
                <p className="text-center text-white text-sm mb-6">
                  El soporte de <strong>{soportes[accion.idx]?.depNombre}</strong> será eliminado. El padre deberá volver a subir el comprobante correcto.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAccion(null)}
                    disabled={procesando}
                    style={{ background: CAMPO, borderColor: BORDE, minHeight: 48 }}
                    className="flex-1 rounded-xl border text-white font-semibold text-sm hover:opacity-85 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleRechazar(accion.idx)}
                    disabled={procesando}
                    style={{ background: ROJO, minHeight: 48 }}
                    className="flex-1 rounded-xl text-white font-black text-sm hover:opacity-85 transition disabled:opacity-50">
                    {procesando ? 'Eliminando…' : '🗑️ Rechazar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-white font-bold text-sm"
             style={{ background: toast.ok ? VERDE : ROJO }}>
          {toast.msg}
        </div>
      )}

    </div>
  );
}
