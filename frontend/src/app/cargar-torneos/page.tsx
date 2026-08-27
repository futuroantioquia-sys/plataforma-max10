'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  CARGAR TORNEOS  ·  /cargar-torneos
//
//  PARA QUÉ ES (dirección, 27/08/2026): cobrarle el torneo a los deportistas
//  que lo deben, UNO POR UNO.
//
//  Por qué uno por uno y no todos de un golpe: la dirección tiene información
//  que la plataforma no tiene — quién ya le pagó el torneo por fuera. Un botón
//  que le cargue a todos le cobraría de nuevo a esa gente. Así que aquí se ve
//  la lista y se decide de a uno, con el nombre a la vista.
//
//  DE DÓNDE SALE CADA COSA — ningún dato se escribe a mano:
//
//    · Los deportistas  → de su ficha en Total Afiliados, casillas C1 a C4.
//                         Si a alguien no le aparece, es que no tiene ese
//                         torneo puesto en su ficha. Se arregla allá, no aquí.
//    · El valor         → del cuadro de Torneos y Competencias, columna
//                         VALOR DEL TORNEO.
//    · El cobro         → se crea en `otros_pagos` con tipo 'torneo', y sale
//                         solo en el Estado de Cuenta del deportista, en la
//                         tabla TORNEOS, debajo de las mensualidades.
//
//  SE PUEDE VOLVER ATRÁS. Si se carga por equivocación, el mismo botón lo
//  quita — mientras no esté pagado. Un torneo ya pagado no se deja borrar
//  desde aquí: eso se revierte en el Estado de Cuenta, que es donde queda
//  registro de lo que se hizo.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Check, AlertTriangle, Trophy, RefreshCw,
} from 'lucide-react';
import { getCuadro, limpiar, enPesos, type FilaTorneo } from '@/lib/torneos';
import { getDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { partirNombre } from '@/lib/nombres';
import { esSuperAdmin, esAccesoTotal } from '@/lib/permisos';

const LIENZO = '#333F50';
const PANEL  = '#3C4759';
const CAMPO  = '#2B3547';
const BORDE  = '#4A5568';
const VERDE  = '#00B050';
const AMBAR  = '#E0A33A';
const ROJO   = '#C0504D';
const GRIS   = '#7C879A';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const SB_HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

/* ── Leer la ficha ───────────────────────────────────────────────────────── */
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k.trim()));
  return k ? String(dep._columnas[k] ?? '') : '';
}
function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  return k ? String(dep._columnas[k] ?? '') : '';
}
/** Los torneos que tiene puestos en C1..C4. Mismo criterio del Pospartido. */
function torneosDelDeportista(dep: Deportista): number[] {
  const cols = dep._columnas ?? {};
  const nums: number[] = [];
  for (const k of Object.keys(cols)) {
    const t = k.trim();
    const esCasilla =
      /^compite$/i.test(t) || /torneo.?[1-4]/i.test(t) || /^c\s*[1-4]$/i.test(t) ||
      /^__TORNEO[1-4]__$/i.test(t);
    if (!esCasilla) continue;
    const m = String(cols[k] ?? '').match(/\d+/);
    if (m) nums.push(parseInt(m[0], 10));
  }
  return nums;
}

/** Un cobro ya existente de `otros_pagos`. */
type Cobro = { id: string; deportista_id: string; descripcion: string; valor: number; estado: string };

export default function CargarTorneos() {
  const router = useRouter();

  const [puede, setPuede] = useState<boolean | null>(null);
  useEffect(() => { setPuede(esSuperAdmin() || esAccesoTotal()); }, []);

  const [cuadro, setCuadro] = useState<FilaTorneo[] | null>(null);
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [num, setNum] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);

  /** Relee los cobros de torneo que ya existen. */
  async function leerCobros() {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/otros_pagos?select=id,deportista_id,descripcion,valor,estado&tipo=eq.torneo`,
        { headers: SB_HDR, cache: 'no-store' },
      );
      if (!res.ok) return;
      const filas = await res.json();
      if (Array.isArray(filas)) setCobros(filas);
    } catch { /* sin señal: la lista sale sin marcar */ }
  }

  function cargarTodo() {
    setCargando(true);
    setError('');
    Promise.all([getCuadro(), getDeportistas(), leerCobros()])
      .then(([c, d]) => { setCuadro(c); setDeportistas(d ?? []); })
      .catch(e => setError(e?.message ?? 'No se pudo leer la información.'))
      .finally(() => setCargando(false));
  }
  useEffect(() => { cargarTodo(); }, []);

  /* ── El torneo escogido ──────────────────────────────────────────────── */
  const n = parseInt(num, 10);
  const torneo = useMemo(() => {
    if (!cuadro || !Number.isFinite(n) || n < 1 || n > cuadro.length) return null;
    return cuadro[n - 1];
  }, [cuadro, n]);

  const nombreTorneo = useMemo(() => {
    if (!torneo) return '';
    return [torneo.torneo, torneo.programa, torneo.categoria].map(limpiar).filter(Boolean).join(' ');
  }, [torneo]);

  const valorTorneo = Math.max(0, Math.round(Number(torneo?.valor) || 0));

  /* ── Los deportistas que tienen ESE torneo en su ficha ───────────────── */
  const lista = useMemo(() => {
    if (!Number.isFinite(n) || n < 1) return [];
    return deportistas
      .filter(d => torneosDelDeportista(d).includes(n))
      .sort((a, b) => {
        const ca = parseInt(codigoDe(a).replace(/\D/g, ''), 10);
        const cb = parseInt(codigoDe(b).replace(/\D/g, ''), 10);
        if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
        return (a._nombre || '').localeCompare(b._nombre || '', 'es');
      });
  }, [deportistas, n]);

  /** El cobro de ESTE torneo que ya tenga ese deportista, si lo tiene. */
  const cobroDe = (depId: string) =>
    cobros.find(c => c.deportista_id === depId && c.descripcion === nombreTorneo);

  const yaCargados = lista.filter(d => !!cobroDe(d.id)).length;

  /* ── Cargar y quitar ─────────────────────────────────────────────────── */
  async function cargar(dep: Deportista) {
    if (!nombreTorneo) return;
    setTrabajando(dep.id); setError(''); setAviso('');
    try {
      const res = await fetch(`${SB_URL}/rest/v1/otros_pagos`, {
        method: 'POST',
        headers: SB_HDR,
        body: JSON.stringify([{
          deportista_id: dep.id,
          descripcion:   nombreTorneo,
          tipo:          'torneo',
          valor:         valorTorneo,
          estado:        'PEND',
          fecha:         null,
        }]),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`No se pudo cargar (${res.status}). ${txt.slice(0, 140)}`);
      }
      await leerCobros();
      setAviso(`Cargado a ${dep._nombre}.`);
      setTimeout(() => setAviso(''), 2500);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el torneo.');
    } finally {
      setTrabajando(null);
    }
  }

  async function quitar(dep: Deportista, c: Cobro) {
    if (c.estado === 'PAGÓ') return;   // un pago hecho no se borra desde aquí
    if (!confirm(`¿Quitarle el cobro de ${nombreTorneo} a ${dep._nombre}?`)) return;
    setTrabajando(dep.id); setError('');
    try {
      const res = await fetch(`${SB_URL}/rest/v1/otros_pagos?id=eq.${encodeURIComponent(c.id)}`,
        { method: 'DELETE', headers: SB_HDR });
      if (!res.ok) throw new Error(`No se pudo quitar (${res.status}).`);
      await leerCobros();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo quitar el cobro.');
    } finally {
      setTrabajando(null);
    }
  }

  if (puede === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: LIENZO }}>
        <p className="text-white/70 font-black text-sm text-center">
          Esta pantalla es solo de administración.
        </p>
      </div>
    );
  }

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
          <h1 className="text-white font-black text-base sm:text-lg leading-tight">Cargar Torneos</h1>
          <p className="text-white/60 text-xs truncate">Cóbrale el torneo, uno por uno, a quien lo deba</p>
        </div>
        <button onClick={cargarTodo} disabled={cargando}
          className="shrink-0 rounded-xl px-3 py-1.5 flex items-center gap-1.5 border border-white/30 transition hover:bg-white/10 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,.18)' }}>
          <RefreshCw className={`w-3.5 h-3.5 text-white ${cargando ? 'animate-spin' : ''}`} />
          <span className="text-white text-[11px] font-black">Actualizar</span>
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3">

        {!!error && (
          <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(192,80,77,.14)', border: `1px solid ${ROJO}` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#F08A87' }} />
            <p className="text-white text-[12px] font-semibold leading-relaxed">{error}</p>
          </div>
        )}
        {!!aviso && (
          <div className="rounded-xl px-3 py-2 flex items-center gap-2"
            style={{ background: 'rgba(0,176,80,.14)', border: `1px solid ${VERDE}` }}>
            <Check className="w-4 h-4 shrink-0" style={{ color: '#5BE39B' }} />
            <p className="text-white text-[12px] font-bold">{aviso}</p>
          </div>
        )}

        {/* Escoger el torneo */}
        <div className="rounded-2xl p-4" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-white/50 text-[10px] font-black tracking-widest uppercase mb-1.5">
                Torneo #
              </label>
              <input
                value={num}
                onChange={e => setNum(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="1"
                className="rounded-xl px-3 py-2 text-lg font-black text-center outline-none"
                style={{ background: CAMPO, border: `1px solid ${BORDE}`, width: 86 }} />
            </div>
            <div className="flex-1 min-w-[180px]">
              {torneo ? (
                <>
                  <p className="text-white font-black text-[15px] leading-tight">{nombreTorneo}</p>
                  <p className="text-white/50 text-[11.5px] font-bold mt-0.5">
                    Formador: {limpiar(torneo.formador) || '—'}
                  </p>
                </>
              ) : (
                <p className="text-white/40 text-[12px] font-semibold">
                  {num ? `No hay un torneo con el número ${num}.` : 'Escribe el número del torneo.'}
                </p>
              )}
            </div>
            {torneo && (
              <div className="rounded-xl px-4 py-2.5 text-center shrink-0"
                style={{
                  background: valorTorneo > 0 ? 'rgba(0,176,80,.14)' : CAMPO,
                  border: `1px solid ${valorTorneo > 0 ? VERDE : AMBAR}`,
                }}>
                <div className="text-white/50 text-[9px] font-black tracking-widest uppercase">Valor</div>
                <div className="font-black text-[17px] leading-none mt-1"
                  style={{ color: valorTorneo > 0 ? '#5BE39B' : AMBAR }}>
                  {valorTorneo > 0 ? enPesos(valorTorneo) : 'SIN VALOR'}
                </div>
              </div>
            )}
          </div>

          {torneo && valorTorneo === 0 && (
            <p className="text-[11.5px] font-semibold mt-3 leading-relaxed" style={{ color: AMBAR }}>
              Este torneo todavía no tiene precio en el cuadro de Torneos y Competencias.
              Se puede cargar igual —queda en cero— pero lo sano es ponerle el valor primero.
            </p>
          )}
        </div>

        {/* La lista */}
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: GRIS }} />
            <span className="text-white/50 text-[13px] font-semibold">Leyendo las fichas…</span>
          </div>
        ) : !torneo ? null : lista.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: PANEL, border: `1px solid ${BORDE}` }}>
            <Trophy className="w-8 h-8 mx-auto mb-2" style={{ color: GRIS }} />
            <p className="text-white/70 text-[13px] font-black">
              Ningún deportista tiene el torneo {num} en su ficha.
            </p>
            <p className="text-white/45 text-[12px] mt-1.5 leading-relaxed">
              Los deportistas salen de las casillas C1, C2, C3 y C4 de Total Afiliados.
              Hay que ponerles ahí el número del torneo; aquí no se agregan a mano.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-white/55 text-[11.5px] font-bold">
                {lista.length} {lista.length === 1 ? 'deportista' : 'deportistas'} en este torneo
              </p>
              <p className="text-white/55 text-[11.5px] font-bold">
                <span style={{ color: '#5BE39B' }}>{yaCargados}</span> ya cargados
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              {lista.map(dep => {
                const c = cobroDe(dep.id);
                const pagado = c?.estado === 'PAGÓ';
                const ocupado = trabajando === dep.id;
                const { nombres, apellidos } = partirNombre(dep._nombre);
                return (
                  <div key={dep.id}
                    className="rounded-xl flex items-center gap-3 px-3 py-2.5"
                    style={{
                      background: PANEL,
                      border: `1px solid ${BORDE}`,
                      boxShadow: c ? `inset 4px 0 0 0 ${pagado ? VERDE : AMBAR}` : undefined,
                    }}>
                    <span className="shrink-0 rounded-md px-2 py-1 text-[11px] font-black text-white"
                      style={{ background: CAMPO, border: `1px solid ${BORDE}`, minWidth: 52, textAlign: 'center' }}>
                      {codigoDe(dep) || '—'}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-[12.5px] leading-tight uppercase truncate">
                        {nombres || dep._nombre}
                      </p>
                      {apellidos && (
                        <p className="text-white/70 text-[11px] font-normal leading-tight uppercase truncate">
                          {apellidos}
                        </p>
                      )}
                    </div>

                    {/* Estado + acción */}
                    {pagado ? (
                      <span className="shrink-0 rounded-lg px-3 py-1.5 text-[10.5px] font-black flex items-center gap-1.5"
                        style={{ background: 'rgba(0,176,80,.16)', border: `1px solid ${VERDE}`, color: '#5BE39B' }}>
                        <Check className="w-3.5 h-3.5" /> PAGÓ
                      </span>
                    ) : c ? (
                      <button
                        onClick={() => quitar(dep, c)}
                        disabled={ocupado}
                        title="Ya tiene el cobro. Clic para quitárselo."
                        className="shrink-0 rounded-lg px-3 py-1.5 text-[10.5px] font-black transition hover:brightness-125 disabled:opacity-50 flex items-center gap-1.5"
                        style={{ background: 'rgba(224,163,58,.16)', border: `1px solid ${AMBAR}`, color: AMBAR }}>
                        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        CARGADO
                      </button>
                    ) : (
                      <button
                        onClick={() => cargar(dep)}
                        disabled={ocupado}
                        title={`Cobrarle ${nombreTorneo} a este deportista`}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-[10.5px] font-black text-white transition hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5"
                        style={{ background: VERDE }}>
                        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
                        CARGAR TORNEO
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-white/35 text-[11px] text-center leading-relaxed pt-2 pb-6">
              El cobro aparece en el Estado de Cuenta del deportista, en la tabla TORNEOS,
              debajo de las mensualidades. Se marca como pagado allá.
              <br />
              Un torneo ya pagado no se puede quitar desde aquí.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
