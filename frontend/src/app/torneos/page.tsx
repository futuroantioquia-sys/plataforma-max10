'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Trophy, ChevronRight, Users,
  CheckCircle, ChevronDown, Search,
  TableProperties, LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPORTISTAS_KEY } from '@/lib/deportistas';
import type { Deportista } from '@/lib/deportistas';

// ── Clave virtual POSICIÓN ─────────────────────────────────────
const VPOS = '__POSICION__';

const POSICIONES = [
  'Portero','Central','Lateral',
  'Interior','Extremo','Creativo','Delantero',
];
const MAX_POS = 3;

// ── Helpers ────────────────────────────────────────────────────
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k.trim()));
  return k ? (dep._columnas[k] ?? '') : '';
}
function getRK(dep: Deportista, rx: RegExp) {
  return Object.keys(dep._columnas).find(k => rx.test(k.trim())) ?? '';
}

function getTorneos(dep: Deportista): string[] {
  const vals = [
    getCol(dep, /^compite$/i)  || dep._columnas['__TORNEO1__'] || '',
    getCol(dep, /torneo.?2/i)  || dep._columnas['__TORNEO2__'] || '',
    getCol(dep, /torneo.?3/i)  || dep._columnas['__TORNEO3__'] || '',
    getCol(dep, /torneo.?4/i)  || dep._columnas['__TORNEO4__'] || '',
  ];
  return vals.map(v => v.trim()).filter(Boolean);
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const colAfil   = (d: Deportista) =>
  getCol(d, /tipo.*afil|afil.*tipo/i) || getCol(d, /afiliaci[oó]n/i) || '';
const colCodigo  = (d: Deportista) => getCol(d, /^c[oó]d/i) || '';
const colEstado  = (d: Deportista) => getCol(d, /^estado/i) || '';
const colPosVirtual = (d: Deportista) => d._columnas[VPOS] || '';

// ── Categorías ─────────────────────────────────────────────────
function getCat(nombre: string): string {
  const n = nombre.toLowerCase().trim();
  if (n.startsWith('liga'))    return 'Liga';
  if (n.startsWith('aso'))     return 'Aso';
  if (n.startsWith('fes'))     return 'Fes';
  if (n.startsWith('valor'))   return 'Valores';
  if (n.startsWith('amistad')) return 'Amistad';
  if (n.startsWith('cri'))     return 'Cri';
  if (n.startsWith('santos'))  return 'Santos';
  if (n.startsWith('rave'))    return 'Rave';
  if (n.startsWith('fab'))     return 'Fab';
  if (n.startsWith('tes'))     return 'Tes';
  if (n.startsWith('abc'))     return 'Abc';
  return 'Otros';
}

const CAT_RANK: Record<string, number> = {
  Liga:0, Aso:1, Fes:2, Valores:3, Amistad:4,
  Cri:5, Santos:6, Rave:7, Fab:8, Tes:9, Abc:10, Otros:11,
};

const CAT_PAL: Record<string, { grad: string; chip: string; hdr: string }> = {
  Liga:    { grad: 'from-[#064e1e] to-[#22c55e]', chip: 'bg-green-100 text-green-800',  hdr: '#064e1e' },
  Aso:     { grad: 'from-[#064e1e] to-[#16a34a]', chip: 'bg-green-100 text-green-900', hdr: '#064e1e' },
  Fes:     { grad: 'from-[#0a0c14] to-[#334155]', chip: 'bg-slate-100 text-slate-800', hdr: '#0a0c14' },
  Valores: { grad: 'from-[#064e1e] to-[#16a34a]', chip: 'bg-green-100 text-green-900', hdr: '#052e14' },
  Amistad: { grad: 'from-[#064e1e] to-[#16a34a]', chip: 'bg-green-100 text-green-900', hdr: '#064e1e' },
  Cri:     { grad: 'from-[#0a0c14] to-[#475569]', chip: 'bg-slate-100 text-slate-700', hdr: '#1e2535' },
  Santos:  { grad: 'from-[#064e1e] to-[#22c55e]', chip: 'bg-green-100 text-green-800', hdr: '#064e1e' },
  Rave:    { grad: 'from-[#064e1e] to-[#16a34a]', chip: 'bg-green-100 text-green-900', hdr: '#064e1e' },
  Fab:     { grad: 'from-[#052e14] to-[#16a34a]', chip: 'bg-green-100 text-green-900', hdr: '#052e14' },
  Tes:     { grad: 'from-[#064e1e] to-[#16a34a]', chip: 'bg-green-100 text-green-900', hdr: '#064e1e' },
  Abc:     { grad: 'from-[#0a0c14] to-[#334155]', chip: 'bg-slate-100 text-slate-800', hdr: '#0a0c14' },
  Otros:   { grad: 'from-[#334155] to-[#64748b]', chip: 'bg-slate-100 text-slate-600', hdr: '#334155' },
};
const getPal = (cat: string) => CAT_PAL[cat] ?? CAT_PAL['Otros'];

// ── Chip AFILIACIÓN ────────────────────────────────────────────
function colorAfil(v: string): string {
  const lv = v.toLowerCase();
  if (lv.includes('antigu'))    return 'bg-[#4b5563] text-white';
  if (lv.includes('nuevo'))     return 'bg-[#16a34a] text-white';
  if (lv.includes('reingreso')) return 'bg-[#334155] text-white';
  if (lv.includes('pas'))       return 'bg-[#374151] text-white';
  if (lv.includes('mb instit')) return 'bg-[#064e1e] text-white';
  if (lv.includes('b instit'))  return 'bg-[#22c55e] text-[#064e1e]';
  if (lv.includes('sin afil'))  return 'bg-[#475569] text-white';
  return 'bg-gray-200 text-gray-600';
}

// ── Dropdown POSICIÓN ──────────────────────────────────────────
function CeldaPosicion({ depId, valor, onChange }: {
  depId: string; valor: string; onChange: (id: string, v: string) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sel = valor ? valor.split(',').map(p => p.trim()).filter(Boolean) : [];

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  }

  function togglePos(pos: string) {
    const idx = sel.indexOf(pos);
    const next = idx >= 0
      ? sel.filter(p => p !== pos)
      : sel.length >= MAX_POS ? sel : [...sel, pos];
    onChange(depId, next.join(', '));
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
        <div ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 99999, minWidth: 210 }}
          className="bg-white rounded-2xl shadow-2xl border border-gray-100 py-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pb-1.5 border-b border-gray-100">
            Máx. {MAX_POS} posiciones
          </p>
          {POSICIONES.map(pos => {
            const checked  = sel.includes(pos);
            const disabled = !checked && sel.length >= MAX_POS;
            return (
              <button key={pos} type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => togglePos(pos)}
                disabled={disabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition
                  ${checked  ? 'bg-[#f0fdf4] text-[#064e1e] font-bold' : ''}
                  ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50'}
                  ${!checked && !disabled ? 'text-gray-700' : ''}`}>
                <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border
                  ${checked ? 'bg-[#16a34a] border-[#16a34a]' : 'border-gray-300'}`}>
                  {checked && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                {pos}
              </button>
            );
          })}
          {sel.length > 0 && (
            <button type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { onChange(depId, ''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 border-t border-gray-100 transition mt-1">
              Limpiar selección
            </button>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div style={{ minWidth: 190 }}>
      <button ref={btnRef} type="button" onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition
          ${open ? 'border-[#22c55e] bg-[#f0fdf4] text-[#064e1e]'
                 : 'border-gray-200 bg-white hover:border-[#22c55e] hover:bg-[#f0fdf4] text-gray-700'}`}>
        <span className="truncate text-left leading-snug text-xs">
          {sel.length > 0 ? sel.join(', ') : <span className="text-gray-300 font-normal">Posición…</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-[#16a34a]' : 'text-gray-400'}`}/>
      </button>
      {menu}
    </div>
  );
}

// ── Tarjeta de equipo ──────────────────────────────────────────
function TarjetaGrupo({ nombre, cat, count, onClick }: {
  nombre: string; cat: string; count: number; onClick: () => void;
}) {
  const pal = getPal(cat);
  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer overflow-hidden group">
      <div className={`h-2 bg-gradient-to-r ${pal.grad}`} />
      <div className="p-5">
        <span className={`inline-block text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide mb-3 ${pal.chip}`}>
          {cat}
        </span>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Equipo</p>
        <p className="font-black text-gray-900 text-xl leading-tight pr-2">{nombre}</p>
        <div className="border-t border-gray-100 pt-3 mt-4 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-bold text-gray-500">
            <Users className="w-3.5 h-3.5 text-gray-400"/>
            {count} deportistas
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all"/>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard del equipo (replica DashboardProyecto) ──────────
function DashboardEquipo({
  nombre, cat, lista, onVerPerfil, onPosicion,
}: {
  nombre: string; cat: string; lista: Deportista[];
  onVerPerfil: (id: string) => void;
  onPosicion: (depId: string, val: string) => void;
}) {
  const pal = getPal(cat);
  const [busqueda,   setBusqueda]   = useState('');
  const [vistaTabla, setVistaTabla] = useState(true);

  const nuevos   = lista.filter(d => colEstado(d).toLowerCase().includes('nuevo')).length;
  const antiguos = lista.filter(d => colEstado(d).toLowerCase().includes('antigu')).length;

  const AFIL_KWDS_T   = ['antigu','nuevo','reingreso','mb instit','b instit','sin afil','paso'];
  const _allKeysT     = lista.length > 0 ? Object.keys(lista[0]._columnas) : [];
  const AFIL_KEY_T    = _allKeysT.find(k => /tipo.*afil|afil.*tipo/i.test(k.trim()))
                     || _allKeysT.find(k => /afiliaci[oó]n/i.test(k.trim()))
                     || _allKeysT.find(k => lista.some(d => {
                          const v = (d._columnas[k] ?? '').toLowerCase();
                          return AFIL_KWDS_T.some(kw => v.includes(kw));
                        }))
                     || '';
  const ESTADO_KEY_T  = _allKeysT.find(k => /^estado/i.test(k.trim())) || '';
  const ORDEN_AFIL_T  = ['antigu','nuevo','reingreso','pas','sin afil','mb instit','b instit'];
  const filtrada = lista
    .filter(d => !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      const ev = (d: Deportista) => (ESTADO_KEY_T ? d._columnas[ESTADO_KEY_T] ?? '' : '').toLowerCase();
      const av = (d: Deportista) => (AFIL_KEY_T   ? d._columnas[AFIL_KEY_T]   ?? '' : '').toLowerCase();
      const pE = (v: string) => v.includes('activ') ? 0 : (v.includes('sin afil') || v.includes('sin_afil')) ? 99 : (v ? 1 : 50);
      const pA = (v: string) => { const i = ORDEN_AFIL_T.findIndex(k => v.includes(k)); return i >= 0 ? i : ORDEN_AFIL_T.length; };
      return pE(ev(a)) - pE(ev(b)) || pA(av(a)) - pA(av(b)) || a._nombre.localeCompare(b._nombre, 'es');
    });

  const hayCodigo = lista.some(d => getRK(d, /^c[oó]d/i));
  const hayAfil   = lista.some(d => colAfil(d) !== '');

  return (
    <div className="space-y-3">

      {/* ── Hero ── */}
      <div className={cn('rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br', pal.grad)}>
        <div className="p-4 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center ring-4 ring-white/30 flex-shrink-0">
              <Trophy className="w-7 h-7 text-white"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Equipo · {cat}</p>
              <p className="text-white font-black text-base leading-tight truncate">{nombre}</p>
            </div>
            <div className="flex gap-4 text-center flex-shrink-0">
              <div><p className="text-xl font-black">{lista.length}</p><p className="text-white/60 text-[10px]">Total</p></div>
              <div className="border-l border-white/20 pl-4"><p className="text-xl font-black">{nuevos}</p><p className="text-white/60 text-[10px]">Nuevos</p></div>
              <div className="border-l border-white/20 pl-4"><p className="text-xl font-black">{antiguos}</p><p className="text-white/60 text-[10px]">Antiguos</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra búsqueda + toggle ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300"/>
          <input type="text" placeholder="Buscar deportista..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#1F4E79] placeholder:text-gray-300"/>
        </div>
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        )}
        <span className="text-xs text-gray-400 font-bold flex-shrink-0">{filtrada.length}/{lista.length}</span>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setVistaTabla(true)}
            className={cn('px-2.5 py-1.5 transition', vistaTabla ? 'bg-[#1F4E79] text-white' : 'text-gray-400 hover:bg-gray-50')}>
            <TableProperties className="w-3.5 h-3.5"/>
          </button>
          <button onClick={() => setVistaTabla(false)}
            className={cn('px-2.5 py-1.5 border-l border-gray-200 transition', !vistaTabla ? 'bg-[#16a34a] text-white' : 'text-gray-400 hover:bg-gray-50')}>
            <LayoutGrid className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>

      {/* ── Vista tarjetas ── */}
      {!vistaTabla && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtrada.map(dep => {
            const estado = colEstado(dep);
            const esN = estado.toLowerCase().includes('nuevo');
            const esA = estado.toLowerCase().includes('antigu');
            return (
              <div key={dep.id} onClick={() => onVerPerfil(dep.id)}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all overflow-hidden">
                <div className={cn('h-1 bg-gradient-to-r', pal.grad)}/>
                <div className="p-3 flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-br text-white font-black text-[10px]', pal.grad)}>
                    {iniciales(dep._nombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{dep._nombre}</p>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {estado && (
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                          esN ? 'bg-green-100 text-green-700' : esA ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500')}>
                          {estado}
                        </span>
                      )}
                      {colCodigo(dep) && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#16a34a] text-white">
                          {colCodigo(dep)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtrada.length === 0 && (
            <p className="col-span-2 text-center py-8 text-sm text-gray-400">Sin resultados</p>
          )}
        </div>
      )}

      {/* ── Vista tabla ── */}
      {vistaTabla && (
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">

          {/* Mini-header EQUIPO */}
          <table className="text-xs border-collapse w-auto">
            <tbody>
              <tr>
                <td style={{ border: '2px solid white', background: '#16a34a', color: 'white' }} className="px-4 py-1.5 font-black w-28 uppercase text-[11px]">EQUIPO</td>
                <td style={{ border: '2px solid white', background: '#f1f5f9', color: '#111827' }} className="px-4 py-1.5 font-bold min-w-[200px]">{nombre}</td>
              </tr>
            </tbody>
          </table>

          {/* Tabla principal */}
          <div className="overflow-x-auto" style={{ maxHeight: '65vh', overflowY: 'auto', overflowX: 'visible' }}>
            <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
              <thead className="sticky top-0 z-10">
                <tr style={{ background: '#16a34a' }}>
                  <th style={{ border: '2px solid white', background: '#4b5563' }} className="px-2 py-1.5 text-[10px] text-white w-8 text-center select-none">#</th>
                  <th style={{ border: '2px solid white', background: '#16a34a' }} className="px-3 py-1.5 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">ESTADO</th>
                  {hayAfil && (
                    <th style={{ border: '2px solid white', background: '#16a34a' }} className="px-3 py-1.5 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">AFILIACIÓN</th>
                  )}
                  {hayCodigo && (
                    <th style={{ border: '2px solid white', background: '#16a34a' }} className="px-3 py-1.5 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-center">CÓDIGO</th>
                  )}
                  <th style={{ border: '2px solid white', background: '#16a34a' }} className="px-3 py-1.5 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">DEPORTISTA</th>
                  <th style={{ border: '2px solid white', background: '#16a34a' }} className="px-3 py-1.5 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">
                    POSICIÓN <span className="text-white/60 font-normal normal-case">(máx. 3)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((dep, i) => {
                  const estado = colEstado(dep);
                  const afil   = colAfil(dep);
                  const cod    = colCodigo(dep);
                  const esN = estado.toLowerCase().includes('nuevo');
                  const esA = estado.toLowerCase().includes('antigu');
                  const bg  = '#f1f5f9';

                  return (
                    <tr key={dep.id} style={{ background: bg }} className="hover:brightness-95 transition-all">
                      <td style={{ border: '2px solid white', color: '#111827', background: bg }}
                        className="px-2 py-1 text-center text-[10px] font-bold select-none">{i + 1}</td>

                      {/* ESTADO */}
                      <td style={{ border: '2px solid white', background: bg }} className="px-2 py-1 whitespace-nowrap">
                        {estado
                          ? <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full',
                              esN ? 'bg-green-200 text-green-900' :
                              esA ? 'bg-gray-300 text-gray-800' : 'bg-gray-200 text-gray-600')}>{estado}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>

                      {/* AFILIACIÓN */}
                      {hayAfil && (
                        <td style={{ border: '2px solid white', background: bg }} className="px-2 py-1 whitespace-nowrap">
                          {afil
                            ? <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', colorAfil(afil))}>{afil}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      )}

                      {/* CÓDIGO */}
                      {hayCodigo && (
                        <td style={{ border: '2px solid white', background: '#16a34a' }}
                          className="px-2 py-1 text-center whitespace-nowrap font-black text-white text-sm">
                          {cod || '—'}
                        </td>
                      )}

                      {/* NOMBRE */}
                      <td style={{ border: '2px solid white', background: bg }} className="px-2 py-1 whitespace-nowrap">
                        <span className="font-bold text-[#111827] underline decoration-dotted underline-offset-2 cursor-pointer"
                          onClick={() => onVerPerfil(dep.id)}>{dep._nombre}</span>
                      </td>

                      {/* POSICIÓN */}
                      <td style={{ border: '2px solid white', background: bg, overflow: 'visible', position: 'relative' }} className="px-2 py-1">
                        <CeldaPosicion
                          depId={dep.id}
                          valor={colPosVirtual(dep)}
                          onChange={onPosicion}
                        />
                      </td>

                    </tr>
                  );
                })}
                {filtrada.length === 0 && (
                  <tr><td colSpan={10} style={{ border: '2px solid white', background: '#f1f5f9' }} className="py-10 text-center text-sm text-gray-400">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer barra */}
          <div style={{ background: '#f1f5f9', borderTop: '2px solid white' }} className="px-4 py-1.5 flex items-center gap-4 text-[10px] font-semibold text-[#111827]">
            <span>ADMON 2026</span>
            <span>{filtrada.length} registros · Nuevos: {nuevos} · Antiguos: {antiguos}</span>
            <span className="ml-auto text-[#111827]">Clic en el nombre para ver el perfil completo</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PÁGINA PRINCIPAL ───────────────────────────────────────────
export default function TorneosPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [guardado,    setGuardado]    = useState(false);
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);
  const guardadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEPORTISTAS_KEY);
      if (raw) setDeportistas(JSON.parse(raw));
    } catch {}
  }, []);

  const grupoMap = useMemo(() => {
    const map: Record<string, Deportista[]> = {};
    deportistas.forEach(dep => {
      const vistos = new Set<string>();
      getTorneos(dep).forEach(t => {
        if (vistos.has(t)) return;
        vistos.add(t);
        if (!map[t]) map[t] = [];
        map[t].push(dep);
      });
    });
    return map;
  }, [deportistas]);

  const categorias = useMemo(() => {
    const catMap: Record<string, { nombre: string; deps: Deportista[] }[]> = {};
    Object.entries(grupoMap).forEach(([nombre, deps]) => {
      const cat = getCat(nombre);
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push({ nombre, deps });
    });
    return Object.entries(catMap)
      .map(([cat, grupos]) => ({
        cat,
        rank: CAT_RANK[cat] ?? 11,
        grupos: grupos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      }))
      .sort((a, b) => a.rank - b.rank);
  }, [grupoMap]);

  const listaActiva = grupoActivo ? (grupoMap[grupoActivo] ?? []) : [];
  const catActiva   = grupoActivo ? getCat(grupoActivo) : '';

  const handlePosicion = useCallback((depId: string, val: string) => {
    setDeportistas(prev => {
      const updated = prev.map(dep =>
        dep.id === depId
          ? { ...dep, _columnas: { ...dep._columnas, [VPOS]: val } }
          : dep
      );
      try { localStorage.setItem(DEPORTISTAS_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
    setGuardado(true);
    if (guardadoTimer.current) clearTimeout(guardadoTimer.current);
    guardadoTimer.current = setTimeout(() => setGuardado(false), 1500);
  }, []);

  function navBack() {
    if (grupoActivo) setGrupoActivo(null);
    else router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.10]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-torn" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-torn)"/>
          </svg>
        </div>

        <button onClick={navBack}
          className="relative text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5"/>
        </button>

        {/* Breadcrumb */}
        <div className="relative flex items-center gap-2 flex-1 min-w-0">
          {grupoActivo ? (
            <>
              <span className="text-white/60 text-xs hidden sm:block">Torneos y Estadísticas</span>
              <ChevronRight className="w-3 h-3 text-white/30 hidden sm:block flex-shrink-0"/>
              <span className={cn('text-xs font-black px-3 py-1.5 rounded-full', getPal(catActiva).chip)}>
                {grupoActivo}
              </span>
            </>
          ) : (
            <div>
              <h1 className="text-white font-black text-lg">Torneos y Estadísticas</h1>
              <p className="text-white/60 text-xs">Por categoría y equipo</p>
            </div>
          )}
        </div>

        {grupoActivo && guardado && (
          <div className="relative flex items-center gap-1.5 bg-white/20 text-white px-3 py-1.5 rounded-xl text-xs font-bold">
            <CheckCircle className="w-3.5 h-3.5"/> Guardado
          </div>
        )}

        <div className="relative text-right leading-tight">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="px-3 py-4 space-y-6">

        {/* ══ LISTA DE CATEGORÍAS / EQUIPOS ══ */}
        {!grupoActivo && (
          categorias.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
              <Trophy className="w-14 h-14 text-gray-200 mx-auto mb-3"/>
              <p className="text-gray-400 font-semibold">No hay equipos cargados.</p>
              <p className="text-gray-300 text-sm mt-1">
                Importa torneos desde Vista General. Los valores de TORNEO 1, 2, 3 y 4 se convierten en grupos aquí.
              </p>
            </div>
          ) : (
            categorias.map(({ cat, grupos }) => {
              const p     = getPal(cat);
              const total = grupos.reduce((s, g) => s + g.deps.length, 0);
              return (
                <div key={cat} className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className={`bg-gradient-to-r ${p.grad} px-5 py-3 flex items-center gap-3`}>
                    <Trophy className="w-4 h-4 text-white/80 flex-shrink-0"/>
                    <span className="text-white font-black text-sm uppercase tracking-widest">{cat}</span>
                    <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full ml-auto whitespace-nowrap">
                      {grupos.length} {grupos.length === 1 ? 'equipo' : 'equipos'} · {total} deportistas
                    </span>
                  </div>
                  <div className="bg-white p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grupos.map(({ nombre, deps }) => (
                      <TarjetaGrupo key={nombre} nombre={nombre} cat={cat}
                        count={deps.length} onClick={() => setGrupoActivo(nombre)}/>
                    ))}
                  </div>
                </div>
              );
            })
          )
        )}

        {/* ══ DETALLE DEL EQUIPO ══ */}
        {grupoActivo && (
          <div className="max-w-5xl mx-auto">
            <DashboardEquipo
              nombre={grupoActivo}
              cat={catActiva}
              lista={listaActiva}
              onVerPerfil={id => router.push(`/alumnos/${id}`)}
              onPosicion={handlePosicion}
            />
          </div>
        )}

      </main>
    </div>
  );
}
