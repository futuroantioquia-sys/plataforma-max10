'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { getDeportistas, getPagos } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

type PagoRow = { detalle: string; estado: string };
type AllPagos = Record<string, PagoRow[]>;

/* ── Meses (igual que estado-cuenta / pagos) ── */
const DETALLE_ROWS = [
  'MATRÍCULA 2026',
  'FEBRERO 2026','MARZO 2026','ABRIL 2026','MAYO 2026','JUNIO 2026',
  'JULIO 2026','AGOSTO 2026','SEPTIEMBRE 2026','OCTUBRE 2026','NOVIEMBRE 2026','DICIEMBRE 2026',
];
const MES_NUM: Record<string, number> = {
  'MATRÍCULA 2026':0,
  'FEBRERO 2026':2,'MARZO 2026':3,'ABRIL 2026':4,'MAYO 2026':5,'JUNIO 2026':6,
  'JULIO 2026':7,'AGOSTO 2026':8,'SEPTIEMBRE 2026':9,'OCTUBRE 2026':10,'NOVIEMBRE 2026':11,'DICIEMBRE 2026':12,
};
const MES_ACTUAL = new Date().getMonth() + 1;
function esFuturo(d: string) { const n = MES_NUM[d]; return n !== undefined && n > 0 && n > MES_ACTUAL; }

function fmtFecha(v: string): string {
  if (!v) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
  const num = Number(v);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}/${d.getUTCFullYear()}`;
  }
  const iso = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : v;
}
function getMesAfil(cols: Record<string, string>): number {
  const k = Object.keys(cols).find(k => /fecha.*afil|afil.*fecha/i.test(k));
  if (!k) return 1;
  const f = fmtFecha(String(cols[k] ?? '').trim());
  const m = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 1;
  return parseInt(m[2], 10) < 2026 ? 1 : parseInt(m[1], 10);
}

function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  return k ? String(dep._columnas[k] ?? '').trim() : '';
}
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k));
  return k ? String(dep._columnas[k] ?? '').trim() : '';
}
function esBecadoDep(dep: Deportista): boolean {
  const kCod = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  const raw  = kCod ? String(dep._columnas[kCod] ?? '').trim() : '';
  return /^b\d/i.test(raw) && !/^mb/i.test(raw);
}

/* Reúne los pagos guardados de un deportista (por id + códigos) en un mapa por mes */
function mergeMapDe(dep: Deportista, allPagos: AllPagos): Map<string, PagoRow> {
  const posKeys: string[] = [dep.id];
  const seen = new Set(posKeys);
  const kCod = Object.keys(dep._columnas ?? {}).find(k => /^c[oó]d/i.test(k));
  if (kCod) {
    const digits = String(dep._columnas[kCod] ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) {
      const key = String(parseInt(digits, 10));
      if (!seen.has(key)) { seen.add(key); posKeys.push(key); }
      if (digits !== key && !seen.has(digits)) { seen.add(digits); posKeys.push(digits); }
    }
  }
  for (const [k, v] of Object.entries(dep._columnas ?? {})) {
    if (k === kCod) continue;
    const digits = String(v ?? '').replace(/\D/g, '');
    if (digits.length >= 4 && digits.length <= 5) {
      const n = parseInt(digits, 10);
      if (n >= 2000 && n <= 2099 && digits.length === 4) continue;
      const key = String(n);
      if (!seen.has(key)) { seen.add(key); posKeys.push(key); }
      if (digits !== key && !seen.has(digits)) { seen.add(digits); posKeys.push(digits); }
    }
  }
  const map = new Map<string, PagoRow>();
  for (const key of posKeys) for (const r of (allPagos[key] ?? [])) map.set(r.detalle, r);
  return map;
}

/* ¿El deportista DEBE ese mes? */
function debeMes(dep: Deportista, mes: string, allPagos: AllPagos): boolean {
  if (esBecadoDep(dep)) return false;
  const saved = mergeMapDe(dep, allPagos).get(mes);
  if (saved) {
    const est = String(saved.estado ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (est === 'ELIM') return false;
    if (est.startsWith('PAG')) return false;
    if (est === 'PEND') return true;
  }
  // Sin registro: debe si el mes aplica (>= mes de afiliación) y no es futuro
  const n = MES_NUM[mes];
  if (n !== 0 && n < getMesAfil(dep._columnas)) return false;
  if (esFuturo(mes)) return false;
  return true;
}

interface Producto { id: string; descripcion: string; tipo: string; valor: number }

export default function CarteraPage() {
  const router = useRouter();
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [allPagos, setAllPagos] = useState<AllPagos>({});
  const [productos, setProductos] = useState<Producto[]>([]);
  const [otrosPend, setOtrosPend] = useState<{ deportista_id: string; descripcion: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [deps, pagos] = await Promise.all([getDeportistas(), getPagos()]);
        setDeportistas(deps);
        setAllPagos(pagos as any);
        const [prodRes, otrosRes] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/productos?activo=eq.true&order=descripcion.asc`, { headers: SB_HDR }).then(r => r.json()).catch(() => []),
          fetch(`${SB_URL}/rest/v1/otros_pagos?estado=eq.PEND&select=deportista_id,descripcion`, { headers: SB_HDR }).then(r => r.json()).catch(() => []),
        ]);
        setProductos(Array.isArray(prodRes) ? prodRes : []);
        setOtrosPend(Array.isArray(otrosRes) ? otrosRes : []);
      } catch (e) { console.error('[cartera]', e); }
      finally { setCargando(false); }
    })();
  }, []);

  const esMes = DETALLE_ROWS.includes(seleccion);

  // Deportistas que deben lo seleccionado
  const deudores = useMemo(() => {
    if (!seleccion) return [];
    let lista: Deportista[] = [];
    if (esMes) {
      lista = deportistas.filter(d => debeMes(d, seleccion, allPagos));
    } else {
      // Producto / torneo: deportistas con otros_pagos PEND de esa descripción
      const ids = new Set(otrosPend.filter(o => (o.descripcion ?? '').trim() === seleccion.trim()).map(o => o.deportista_id));
      lista = deportistas.filter(d => ids.has(d.id));
    }
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter(d => d._nombre.toLowerCase().includes(q) || codigoDe(d).toLowerCase().includes(q));
    return lista.sort((a, b) => codigoDe(a).localeCompare(codigoDe(b), 'es', { numeric: true }));
  }, [seleccion, esMes, deportistas, allPagos, otrosPend, busqueda]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">Cartera</h1>
          <p className="text-white/60 text-xs">¿Quién debe qué?</p>
        </div>
        <div className="text-right leading-tight flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {cargando ? (
          <div className="flex justify-center py-20"><BalonCargando texto="Cargando cartera…" /></div>
        ) : (
          <>
            {/* Selector */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Pago pendiente</label>
              <select
                value={seleccion}
                onChange={e => setSeleccion(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#16a34a]">
                <option value="">— Elige qué pago revisar —</option>
                <optgroup label="Mensualidad">
                  {DETALLE_ROWS.map(m => (
                    <option key={m} value={m}>{m === 'MATRÍCULA 2026' ? 'Matrícula' : m.replace(' 2026', '')}</option>
                  ))}
                </optgroup>
                {productos.length > 0 && (
                  <optgroup label="Productos / Torneos">
                    {productos.map(p => (
                      <option key={p.id} value={p.descripcion}>
                        {p.tipo === 'torneo' ? '🏆 ' : '👟 '}{p.descripcion}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Conteo */}
            {seleccion && (
              <div className="rounded-2xl p-4 text-white shadow-sm flex items-center gap-3"
                style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
                <Users className="w-8 h-8 flex-shrink-0" />
                <div>
                  <p className="text-3xl font-black leading-none">{deudores.length}</p>
                  <p className="text-white/80 text-xs font-bold mt-1">
                    {deudores.length === 1 ? 'deportista debe' : 'deportistas deben'} {esMes ? (seleccion === 'MATRÍCULA 2026' ? 'MATRÍCULA' : seleccion.replace(' 2026', '')) : seleccion}
                  </p>
                </div>
              </div>
            )}

            {/* Buscador dentro del resultado */}
            {seleccion && deudores.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar en la lista…"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a] bg-white" />
              </div>
            )}

            {/* Lista */}
            {seleccion && (
              deudores.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">✅</div>
                  <p className="font-black text-gray-800">Nadie debe esto</p>
                  <p className="text-gray-400 text-sm mt-1">Ningún deportista tiene pendiente este pago.</p>
                </div>
              ) : (
                <div className="rounded-2xl overflow-x-auto shadow-sm border border-gray-200 bg-white">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-[#064e1e] text-white text-[11px] font-black uppercase tracking-wide">
                        <th className="px-3 py-2.5 text-center">#</th>
                        <th className="px-3 py-2.5 text-center">Código</th>
                        <th className="px-3 py-2.5 text-left">Nombre</th>
                        <th className="px-3 py-2.5 text-left">Programa</th>
                        <th className="px-3 py-2.5 text-left">Proyecto</th>
                        <th className="px-3 py-2.5 text-center">Cuenta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deudores.map((d, i) => (
                        <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2.5 text-center text-gray-400 font-bold">{i + 1}</td>
                          <td className="px-3 py-2.5 text-center font-black text-green-700">{codigoDe(d) || '—'}</td>
                          <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{d._nombre}</td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{getCol(d, /^program/i) || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{getCol(d, /^proy/i) || '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <button onClick={() => router.push(`/alumnos/${d.id}/estado-cuenta?edit=1`)}
                              className="bg-[#16a34a] text-white text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-green-700 transition">Ver</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {!seleccion && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">💰</div>
                <p className="font-black text-gray-800">Selecciona un pago</p>
                <p className="text-gray-400 text-sm mt-1">Elige matrícula, un mes o un producto en el desplegable para ver quiénes lo deben y cuántos son.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
