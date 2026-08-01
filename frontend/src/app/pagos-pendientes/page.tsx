'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Eye, Clock, AlertCircle } from 'lucide-react';
import { getSoportesPendientes, confirmarSoportePago, eliminarSoportePago, getDeportistas, getPagos } from '@/lib/db';
import type { SoportePago, Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

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

export default function PagosPendientesPage() {
  const router = useRouter();
  const [soportes,   setSoportes]   = useState<SoporteEnriquecido[]>([]);
  const [cargando,   setCargando]   = useState(true);
  const [viendoIdx,  setViendoIdx]  = useState<number | null>(null);
  const [accion,     setAccion]     = useState<{ idx: number; tipo: 'confirmar' | 'rechazar' } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrarToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [pendientes, deportistas, pagos] = await Promise.all([
        getSoportesPendientes(),
        getDeportistas(),
        getPagos(),
      ]);

      const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

      // Meses ya pagados (verificados) de un deportista — busca por id y por código
      const mesesPagados = (depId: string, cod: string): Set<string> => {
        const set = new Set<string>();
        const keys = new Set<string>([depId, cod]);
        const digits = String(cod ?? '').replace(/\D/g, '');
        if (digits) { keys.add(digits); keys.add(String(parseInt(digits, 10))); }
        keys.forEach(k => {
          const rows = (pagos as any)[k];
          if (Array.isArray(rows)) {
            rows.forEach((r: any) => {
              if (norm(r.estado).startsWith('PAG')) set.add(norm(r.detalle));
            });
          }
        });
        return set;
      };

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

      // Ocultar los soportes cuyos meses YA quedaron pagados (verificados en el estado de cuenta)
      const visibles = enriquecidos.filter(s => {
        if (!s.meses || s.meses.length === 0) return true;
        const pagados = mesesPagados(s.depId, s.depCodigo);
        if (pagados.size === 0) return true;
        const todosPagados = s.meses.every(m => {
          const nm = norm(m);
          for (const p of pagados) { if (p === nm || p.startsWith(nm) || nm.startsWith(p)) return true; }
          return false;
        });
        return !todosPagados;
      });

      setSoportes(visibles);
    } catch (e) {
      console.error('[pagos-pendientes] cargar:', e);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleConfirmar(idx: number) {
    const s = soportes[idx];
    setProcesando(true);
    try {
      await confirmarSoportePago(s.id);
      setSoportes(prev => prev.filter((_, i) => i !== idx));
      mostrarToast('✅ Pago confirmado correctamente', true);
    } catch {
      mostrarToast('❌ Error al confirmar el pago', false);
    }
    setProcesando(false);
    setAccion(null);
  }

  async function handleRechazar(idx: number) {
    const s = soportes[idx];
    setProcesando(true);
    try {
      await eliminarSoportePago(s.id);
      setSoportes(prev => prev.filter((_, i) => i !== idx));
      mostrarToast('🗑️ Soporte eliminado', true);
    } catch {
      mostrarToast('❌ Error al eliminar el soporte', false);
    }
    setProcesando(false);
    setAccion(null);
  }

  // Detectar si el dato es imagen o PDF
  function esImagen(data: string): boolean {
    return data.startsWith('data:image/');
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="relative bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#3b82f6] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 shadow overflow-hidden">
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
        <button onClick={() => router.back()} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Pagos Pendientes</h1>
          <p className="text-white/60 text-[11px]">Soportes enviados por padres · MAX 10</p>
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
          <p className="text-white/50 text-[9px] leading-none mt-0.5 tracking-wide">Conecta, Gestiona, Gana</p>
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
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 text-center max-w-md mx-auto mt-8">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500"/>
            </div>
            <p className="text-gray-800 font-black text-lg">¡Todo al día!</p>
            <p className="text-gray-400 text-sm mt-1">No hay soportes de pago pendientes de confirmar.</p>
          </div>
        )}

        {/* ── Tabla de soportes ── */}
        {!cargando && soportes.length > 0 && (
          <div className="overflow-x-auto rounded-2xl shadow-sm border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#1d4ed8] text-white text-xs font-black uppercase tracking-wider">
                  <th className="px-3 py-3 text-left whitespace-nowrap">Código</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Nombre</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Programa</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Proyecto</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Meses Pagando</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">Soporte de Pago</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {soportes.map((s, idx) => (
                  <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>

                    {/* Código */}
                    <td className="px-3 py-3 font-black text-green-700 whitespace-nowrap">
                      {s.depCodigo || '—'}
                    </td>

                    {/* Nombre */}
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap max-w-[160px] truncate">
                      {s.depNombre}
                    </td>

                    {/* Programa */}
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {s.depPrograma || '—'}
                    </td>

                    {/* Proyecto */}
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {s.depProyecto || '—'}
                    </td>

                    {/* Meses pagando */}
                    <td className="px-3 py-3">
                      {s.meses && s.meses.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.meses.map(m => (
                            <span key={m} className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[11px] font-bold whitespace-nowrap">
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Soporte de pago */}
                    <td className="px-3 py-3">
                      {s.datos ? (
                        esImagen(s.datos) ? (
                          <button
                            onClick={() => setViendoIdx(idx)}
                            className="relative block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={s.datos}
                              alt="Soporte"
                              className="w-14 h-14 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition cursor-pointer"
                            />
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                              <Eye className="w-5 h-5 text-white drop-shadow"/>
                            </span>
                          </button>
                        ) : (
                          <a href={s.datos} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-red-600 text-xs font-semibold hover:underline">
                            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
                            PDF
                          </a>
                        )
                      ) : <span className="text-gray-300 text-xs">Sin archivo</span>}
                    </td>

                    {/* Acciones */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 justify-center">
                        <button
                          onClick={() => setAccion({ idx, tipo: 'rechazar' })}
                          title="Rechazar soporte"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 font-semibold text-[11px] transition">
                          <XCircle className="w-3.5 h-3.5"/>
                        </button>
                        <button
                          onClick={() => router.push(`/alumnos/${s.depId}/estado-cuenta?readonly=1`)}
                          title="Ver cuenta"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-[11px] transition whitespace-nowrap">
                          <Eye className="w-3.5 h-3.5"/> Cuenta
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
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={soportes[viendoIdx].datos}
              alt="Soporte de pago"
              className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl bg-white"
            />
            <button
              onClick={() => setViendoIdx(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-red-500 transition text-lg font-black">
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar acción ── */}
      {accion && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full">
            {accion.tipo === 'confirmar' ? (
              <>
                <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-green-600"/>
                </div>
                <h3 className="text-center font-black text-gray-900 text-lg mb-1">¿Confirmar pago?</h3>
                <p className="text-center text-gray-500 text-sm mb-6">
                  Esto marca el soporte de <strong>{soportes[accion.idx]?.depNombre}</strong> como pagado y confirmado.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAccion(null)}
                    disabled={procesando}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleConfirmar(accion.idx)}
                    disabled={procesando}
                    className="flex-1 py-3 rounded-xl bg-green-500 text-white font-black text-sm hover:bg-green-600 transition disabled:opacity-50">
                    {procesando ? 'Procesando…' : '✅ Confirmar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-7 h-7 text-red-600"/>
                </div>
                <h3 className="text-center font-black text-gray-900 text-lg mb-1">¿Rechazar soporte?</h3>
                <p className="text-center text-gray-500 text-sm mb-6">
                  El soporte de <strong>{soportes[accion.idx]?.depNombre}</strong> será eliminado. El padre deberá volver a subir el comprobante correcto.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAccion(null)}
                    disabled={procesando}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleRechazar(accion.idx)}
                    disabled={procesando}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-sm hover:bg-red-600 transition disabled:opacity-50">
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
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-white font-bold text-sm ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

    </div>
  );
}
