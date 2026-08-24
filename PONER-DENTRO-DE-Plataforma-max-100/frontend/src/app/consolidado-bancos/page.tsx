'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Landmark, Download, Trash2, ChevronDown, ChevronRight, Loader2, Search, ExternalLink } from 'lucide-react';

import { getBancosHistorico, setBancosHistorico, getDeportistas } from '@/lib/db';

const G   = '#16a34a';
const ROW = '#f1f5f9';
const BW  = '1px solid white';

const ORDEN_CONCEPTO = [
  'MATRÍCULA','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
];

// ── Tipos locales ─────────────────────────────────────────────
type Estado = 'PAGÓ' | 'PAGÓ CON 10%' | 'VERIFICAR' | 'ERROR';
type BancoLinea = {
  destino?:     string;
  fecha?:       string;
  descripcion?: string;
  debito?:      number;
  vPagado?:     number | string;   // compatibilidad versión vieja
  vCargado?:    number | string;
  saldo?:       string;
  cuenta?:      string;
  codigo?:      string;
  deportista?:  string;
  nombre?:      string;            // compatibilidad versión vieja
  detalle?:     string;
  concepto?:    string;            // compatibilidad versión vieja
  estado:       Estado;
  mensaje?:     string;
  depId?:       string;
};
type BancoLote = {
  id:             string;
  fechaSubida:    string;
  totalRegistros: number;
  lineas:         BancoLinea[];
};

// ── Helpers ───────────────────────────────────────────────────
function safeNum(v: number | string | undefined): number {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function formatPeso(n: number): string {
  if (!n) return '—';
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
}

function formatFechaISO(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// Formatea fechas del extracto bancario (serial Excel, ISO, DD/MM/AAAA, etc.)
function formatFecha(v: string | undefined): string {
  if (!v) return '—';
  const s = String(v).trim();
  if (!s || s === '—') return '—';
  // Ya está en DD/MM/AAAA
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  // Serial numérico de Excel (ej: 46059)
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${date.getUTCFullYear()}`;
  }
  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // MM/DD/AAAA → DD/MM/AAAA (formato americano)
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[2].padStart(2,'0')}/${us[1].padStart(2,'0')}/${us[3]}`;
  return s;
}

function estadoBadge(estado: Estado) {
  return estado === 'PAGÓ'
    ? { bg: '#dcfce7', txt: '#166534', label: 'PAGÓ' }
    : { bg: '#fee2e2', txt: '#991b1b', label: 'ERROR' };
}

// Normaliza una línea sin importar versión antigua/nueva
function normLinea(ln: BancoLinea) {
  return {
    destino:     ln.destino     ?? '',
    fecha:       ln.fecha       ?? '',
    descripcion: ln.descripcion ?? '',
    debito:      safeNum(ln.debito ?? ln.vPagado),
    vCargado:    safeNum(ln.vCargado),
    saldo:       ln.saldo       ?? '',
    cuenta:      ln.cuenta      ?? '',
    codigo:      ln.codigo      ?? '',
    deportista:  ln.deportista  ?? ln.nombre ?? '',
    detalle:     ln.detalle     ?? ln.concepto ?? '',
    estado:      (ln.estado     ?? 'ERROR') as Estado,
    mensaje:     ln.mensaje     ?? '',
    depId:       ln.depId       ?? '',
  };
}

// ── Componente ────────────────────────────────────────────────
export default function ConsolidadoBancosPage() {
  const router   = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  const [lotes,        setLotes]       = useState<BancoLote[]>([]);
  const [loteAbierto,  setLoteAbierto] = useState<string | null>(null);
  const [filtroCod,    setFiltroCod]   = useState('');
  const [filtroConc,   setFiltroConc]  = useState('');
  const [filtroEst,    setFiltroEst]   = useState('');
  const [descargando,  setDescargando] = useState(false);
  const [errorLS,      setErrorLS]     = useState('');
  // Buscador por código → estado de cuenta
  const [busqCod,      setBusqCod]     = useState('');
  const [busqResultados, setBusqResultados] = useState<{id:string; nombre:string; codigo:string}[]>([]);

  useEffect(() => {
    getBancosHistorico().then(parsed => {
      if (!Array.isArray(parsed)) { setErrorLS('Formato inválido.'); return; }
      setLotes(parsed as any[]);
    }).catch((e: any) => setErrorLS('Error leyendo datos: ' + e.message));
  }, []);

  // Búsqueda por código → estado de cuenta
  async function buscarPorCodigo(val: string) {
    setBusqCod(val);
    if (!val.trim()) { setBusqResultados([]); return; }
    try {
      const lista: any[] = await getDeportistas();
      const term = val.trim().toLowerCase();
      const res = lista
        .map(d => {
          const k = Object.keys(d._columnas ?? {}).find((k: string) => /^c[oó]d/i.test(k));
          const cod = k ? String(d._columnas[k] ?? '').trim() : '';
          return { id: d.id, nombre: d._nombre ?? '', codigo: cod };
        })
        .filter(d => d.codigo.toLowerCase().includes(term) || d.nombre.toLowerCase().includes(term))
        .slice(0, 6);
      setBusqResultados(res);
    } catch { setBusqResultados([]); }
  }

  // Todas las líneas normalizadas
  const todasLineas = useMemo(() =>
    lotes.flatMap(l =>
      (l.lineas ?? []).map(ln => ({ ...normLinea(ln), loteId: l.id, fechaSubida: l.fechaSubida }))
    ),
  [lotes]);

  const lineaFiltrada = useMemo(() => todasLineas.filter(ln => {
    if (filtroCod  && !ln.codigo.toUpperCase().includes(filtroCod.toUpperCase()))   return false;
    if (filtroConc && ln.detalle !== filtroConc)                                     return false;
    if (filtroEst  && ln.estado  !== filtroEst)                                      return false;
    return true;
  }), [todasLineas, filtroCod, filtroConc, filtroEst]);

  // Totales
  const totalPagado = lineaFiltrada.filter(l => l.estado === 'PAGÓ').reduce((s, l) => s + l.debito, 0);
  const totalError  = lineaFiltrada.filter(l => l.estado === 'ERROR').length;

  // Resumen por concepto
  const porConcepto = useMemo(() => {
    const map = new Map<string, { pagado: number; count: number }>();
    lineaFiltrada.forEach(ln => {
      if (ln.estado !== 'PAGÓ') return;
      const key = ln.detalle || '(sin concepto)';
      const prev = map.get(key) ?? { pagado: 0, count: 0 };
      prev.pagado += ln.debito; prev.count++;
      map.set(key, prev);
    });
    const ordered = ORDEN_CONCEPTO.filter(c => map.has(c)).map(c => ({ concepto: c, ...map.get(c)! }));
    // Conceptos no en la lista ordenada
    map.forEach((v, k) => {
      if (!ORDEN_CONCEPTO.includes(k)) ordered.push({ concepto: k, ...v });
    });
    return ordered;
  }, [lineaFiltrada]);

  // Eliminar lote
  function eliminarLote(id: string) {
    if (!confirm('¿Eliminar este lote del historial? Solo borra el registro, NO revierte los estados de cuenta.')) return;
    const nuevo = lotes.filter(l => l.id !== id);
    setLotes(nuevo);
    setBancosHistorico(nuevo).catch(console.error);
    if (loteAbierto === id) setLoteAbierto(null);
  }

  // Borrar todo el historial
  function borrarTodo() {
    if (!confirm('⚠ ¿Borrar TODO el historial de bancos? Esto NO revierte los estados de cuenta de los deportistas.')) return;
    setBancosHistorico([]).catch(console.error);
    setLotes([]);
    setLoteAbierto(null);
  }

  // PDF
  async function descargarPDF() {
    if (!printRef.current || descargando) return;
    setDescargando(true);
    try {
      const load = (src: string) => new Promise<void>((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = () => res(); s.onerror = rej;
        document.head.appendChild(s);
      });
      await load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await new Promise(r => setTimeout(r, 300));
      const canvas = await (window as any).html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#f1f5f9', logging: false });
      const { jsPDF } = (window as any).jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pW = pdf.internal.pageSize.getWidth();
      const pH = pdf.internal.pageSize.getHeight();
      const m  = 10; const cw = pW - m * 2;
      const iW = canvas.width, iH = canvas.height;
      const totH = (iH * cw) / iW;
      const img  = canvas.toDataURL('image/jpeg', 0.95);
      if (totH <= pH - m * 2) {
        pdf.addImage(img, 'JPEG', m, m, cw, totH);
      } else {
        const pageHmm = pH - m * 2;
        const pageHpx = (pageHmm * iW) / cw;
        let y = 0;
        while (y < iH) {
          const sh = Math.min(pageHpx, iH - y);
          const tmp = document.createElement('canvas');
          tmp.width = iW; tmp.height = sh;
          tmp.getContext('2d')!.drawImage(canvas, 0, y, iW, sh, 0, 0, iW, sh);
          if (y > 0) pdf.addPage();
          pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', m, m, cw, (sh * cw) / iW);
          y += pageHpx;
        }
      }
      pdf.save(`CONSOLIDADO_BANCOS_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (e) { alert('Error al generar PDF.'); }
    finally { setDescargando(false); }
  }

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-10 shadow">
        <button onClick={() => router.push('/dashboard')}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <Landmark className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Consolidado Bancos</h1>
          <p className="text-white/60 text-[11px]">Historial de pagos recibidos · base para contabilidad</p>
        </div>
        <button onClick={descargarPDF} disabled={descargando || lotes.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[11px] font-black transition disabled:opacity-60">
          {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5"/>}
          PDF
        </button>
        {lotes.length > 0 && (
          <button onClick={borrarTodo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-black transition">
            <Trash2 className="w-3.5 h-3.5"/>
            Borrar todo
          </button>
        )}
        <div className="text-right leading-tight hidden sm:block">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* ── BUSCADOR RÁPIDO POR CÓDIGO ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Ir al estado de cuenta</p>
          <div className="relative">
            <div className="flex items-center gap-2 border-2 border-[#16a34a] rounded-xl px-3 py-2.5">
              <Search className="w-4 h-4 text-[#16a34a] flex-shrink-0"/>
              <input
                value={busqCod}
                onChange={e => buscarPorCodigo(e.target.value)}
                placeholder="Buscar por código o nombre del deportista..."
                className="flex-1 text-sm font-semibold text-[#111827] focus:outline-none"
              />
              {busqCod && (
                <button onClick={() => { setBusqCod(''); setBusqResultados([]); }}
                  className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
              )}
            </div>

            {/* Resultados */}
            {busqResultados.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                {busqResultados.map(d => (
                  <button key={d.id}
                    onClick={() => { router.push(`/alumnos/${d.id}/estado-cuenta`); setBusqCod(''); setBusqResultados([]); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition text-left border-b border-gray-100 last:border-0">
                    <div className="w-9 h-9 rounded-lg bg-[#16a34a] flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-black text-xs">{d.codigo || '?'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[#111827] text-sm truncate">{d.nombre}</p>
                      <p className="text-[11px] text-gray-400 font-semibold">Código: {d.codigo || '—'}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#16a34a] flex-shrink-0"/>
                  </button>
                ))}
              </div>
            )}

            {busqCod && busqResultados.length === 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-3">
                <p className="text-sm text-gray-400 font-semibold">Sin resultados para "{busqCod}"</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error localStorage */}
      {errorLS && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-semibold">{errorLS}</div>
        </div>
      )}

      {lotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <Landmark className="w-16 h-16 text-gray-200 mb-4" />
          <p className="text-gray-500 font-black text-lg">Sin registros aún</p>
          <p className="text-gray-400 text-sm mt-1 mb-6">Sube un extracto bancario y aplica los pagos para verlos aquí.</p>
          <button onClick={() => router.push('/subir-bancos')}
            className="px-5 py-2.5 bg-[#16a34a] hover:bg-[#064e1e] text-white rounded-xl text-sm font-black transition">
            Ir a Subir Bancos
          </button>
        </div>
      ) : (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5" ref={printRef}>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total recaudado', val: formatPeso(totalPagado), sub: `${lineaFiltrada.filter(l => l.estado === 'PAGÓ').length} pagos`, color: '#16a34a' },
              { label: 'Errores',         val: String(totalError),     sub: 'código no encontrado',     color: '#991b1b' },
              { label: 'Lotes cargados',  val: String(lotes.length),   sub: `${todasLineas.length} registros totales`, color: '#111827' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-[11px] font-black text-gray-400 uppercase mb-1">{c.label}</p>
                <p className="text-lg font-black" style={{ color: c.color }}>{c.val}</p>
                <p className="text-[10px] text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Resumen por concepto */}
          {porConcepto.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="font-black text-[#111827] text-sm">Resumen por concepto</p>
                <p className="text-[11px] text-gray-400">Base contable — totales recaudados</p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {['CONCEPTO','# PAGOS','TOTAL PAGADO'].map(h => (
                        <th key={h} style={{ background: G, color: 'white', padding: '7px 12px', textAlign: h === 'CONCEPTO' ? 'left' : 'right', fontWeight: 900, borderRight: BW, whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porConcepto.map(row => (
                      <tr key={row.concepto} style={{ background: ROW }}>
                        <td style={{ padding: '6px 12px', borderRight: BW, borderBottom: BW, fontWeight: 900, color: G }}>{row.concepto}</td>
                        <td style={{ padding: '6px 12px', borderRight: BW, borderBottom: BW, textAlign: 'right', color: '#111827', fontWeight: 700 }}>{row.count}</td>
                        <td style={{ padding: '6px 12px', borderBottom: BW, textAlign: 'right', color: '#166534', fontWeight: 900 }}>{formatPeso(row.pagado)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '7px 12px', borderRight: BW, fontWeight: 900, background: '#e2e8f0', color: '#111827' }}>TOTAL</td>
                      <td style={{ padding: '7px 12px', borderRight: BW, textAlign: 'right', background: '#e2e8f0', fontWeight: 900 }}>{porConcepto.reduce((s, r) => s + r.count, 0)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', background: '#e2e8f0', fontWeight: 900, color: '#166534' }}>{formatPeso(porConcepto.reduce((s, r) => s + r.pagado, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Filtros + tabla detallada */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2 items-center">
              <p className="font-black text-[#111827] text-sm flex-1">Detalle de pagos</p>
              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1.5">
                <Search className="w-3 h-3 text-gray-400" />
                <input value={filtroCod} onChange={e => setFiltroCod(e.target.value)}
                  placeholder="Código..."
                  className="text-xs w-20 focus:outline-none text-[#111827]" />
              </div>
              <select value={filtroConc} onChange={e => setFiltroConc(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-none bg-white">
                <option value="">Todos los conceptos</option>
                {ORDEN_CONCEPTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroEst} onChange={e => setFiltroEst(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#111827] focus:outline-none bg-white">
                <option value="">Todos los estados</option>
                <option value="PAGÓ">PAGÓ</option>
                <option value="ERROR">ERROR</option>
              </select>
              <span className="text-[11px] text-gray-400">{lineaFiltrada.length} registros</span>
            </div>

            <div className="overflow-auto" style={{ maxHeight: '55vh' }}>
              <table className="w-full text-xs border-collapse" style={{ minWidth: 1050 }}>
                <thead className="sticky top-0">
                  <tr>
                    {['ESTADO','DESTINO','FECHA','DESCRIPCIÓN','DÉBITO','V. CARGADO','SALDO','CUENTA','CÓDIGO','DEPORTISTA','DETALLE','NOTA'].map(h => (
                      <th key={h} style={{ background: G, color: 'white', padding: '7px 10px', textAlign: ['DÉBITO','V. CARGADO'].includes(h) ? 'right' : 'left', fontWeight: 900, borderRight: BW, whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineaFiltrada.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>Sin registros con estos filtros</td></tr>
                  ) : lineaFiltrada.map((ln, i) => {
                    const b = estadoBadge(ln.estado);
                    return (
                      <tr key={i} style={{ background: ROW }}>
                        <td style={{ padding: '5px 8px', borderRight: BW, borderBottom: BW }}>
                          <span style={{ background: b.bg, color: b.txt, padding: '2px 7px', borderRadius: 6, fontWeight: 900, fontSize: 10, whiteSpace: 'nowrap' }}>{b.label}</span>
                        </td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#111827', whiteSpace: 'nowrap' }}>{ln.destino||'—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#4b5563', whiteSpace: 'nowrap' }}>{formatFecha(ln.fecha)}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#111827' }}>{ln.descripcion||'—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, textAlign: 'right', fontWeight: 900, color: '#111827', whiteSpace: 'nowrap' }}>{ln.debito ? formatPeso(ln.debito) : '—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, textAlign: 'right', color: '#4b5563', whiteSpace: 'nowrap' }}>{ln.vCargado ? formatPeso(ln.vCargado) : '—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#4b5563', whiteSpace: 'nowrap' }}>{ln.saldo||'—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#4b5563', whiteSpace: 'nowrap' }}>{ln.cuenta||'—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, fontWeight: 900, color: G, whiteSpace: 'nowrap' }}>{ln.codigo||'—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{ln.deportista||'—'}</td>
                        <td style={{ padding: '5px 10px', borderRight: BW, borderBottom: BW, color: '#111827', whiteSpace: 'nowrap' }}>{ln.detalle||'—'}</td>
                        <td style={{ padding: '5px 10px', borderBottom: BW, color: '#6b7280', fontSize: 10 }}>{ln.mensaje||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historial de lotes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="font-black text-[#111827] text-sm">Historial de lotes cargados</p>
              <p className="text-[11px] text-gray-400">{lotes.length} lote{lotes.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {lotes.map(lote => {
                const abierto = loteAbierto === lote.id;
                const lineasNorm = (lote.lineas ?? []).map(normLinea);
                return (
                  <div key={lote.id}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition">
                      <button onClick={() => setLoteAbierto(abierto ? null : lote.id)}
                        className="flex items-center gap-2 flex-1 text-left">
                        {abierto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0"/> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0"/>}
                        <div>
                          <p className="font-black text-[#111827] text-sm">{formatFechaISO(lote.fechaSubida)}</p>
                          <p className="text-[11px] text-gray-400">{lote.totalRegistros} registros · {lineasNorm.filter(l => l.estado === 'PAGÓ' || l.estado === 'PAGÓ CON 10%').length} pagados · {lineasNorm.filter(l => l.estado === 'VERIFICAR').length} verificar · {lineasNorm.filter(l => l.estado === 'ERROR').length} errores</p>
                        </div>
                      </button>
                      <button onClick={() => eliminarLote(lote.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </div>
                    {abierto && (
                      <div className="overflow-auto border-t border-gray-100 bg-gray-50" style={{ maxHeight: 280 }}>
                        <table className="w-full text-xs border-collapse" style={{ minWidth: 800 }}>
                          <thead>
                            <tr>
                              {['ESTADO','CÓDIGO','DEPORTISTA','DETALLE','DÉBITO','V. CARGADO','NOTA'].map(h => (
                                <th key={h} style={{ background: '#4b5563', color: 'white', padding: '5px 10px', textAlign: ['DÉBITO','V. CARGADO'].includes(h) ? 'right' : 'left', fontWeight: 900, borderRight: BW, whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lineasNorm.map((ln, i) => {
                              const b = estadoBadge(ln.estado);
                              return (
                                <tr key={i} style={{ background: ROW }}>
                                  <td style={{ padding: '4px 8px', borderRight: BW, borderBottom: BW }}>
                                    <span style={{ background: b.bg, color: b.txt, padding: '2px 6px', borderRadius: 5, fontWeight: 900, fontSize: 10 }}>{b.label}</span>
                                  </td>
                                  <td style={{ padding: '4px 10px', borderRight: BW, borderBottom: BW, fontWeight: 900, color: G }}>{ln.codigo||'—'}</td>
                                  <td style={{ padding: '4px 10px', borderRight: BW, borderBottom: BW, color: '#111827' }}>{ln.deportista||'—'}</td>
                                  <td style={{ padding: '4px 10px', borderRight: BW, borderBottom: BW, color: '#111827' }}>{ln.detalle||'—'}</td>
                                  <td style={{ padding: '4px 10px', borderRight: BW, borderBottom: BW, textAlign: 'right', fontWeight: 900, color: '#111827' }}>{ln.debito ? formatPeso(ln.debito) : '—'}</td>
                                  <td style={{ padding: '4px 10px', borderRight: BW, borderBottom: BW, textAlign: 'right', color: '#4b5563' }}>{ln.vCargado ? formatPeso(ln.vCargado) : '—'}</td>
                                  <td style={{ padding: '4px 10px', borderBottom: BW, color: '#6b7280', fontSize: 10 }}>{ln.mensaje||'—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </main>
      )}
    </div>
  );
}
