'use client';

import { useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users, Search, FileSpreadsheet, Trash2,
  ChevronRight, ArrowLeft, Camera, GraduationCap,
  LayoutGrid, TableProperties, ChevronDown, Download, Loader2, ClipboardList, Home,
} from 'lucide-react';
import { BalonCargando } from '@/components/BalonCargando';
import { cn } from '@/lib/utils';
import {
  getDeportistas, getDeportistasPorProyecto, saveDeportistas,
  getCalComPorProyecto, saveCalCom,
  getFotosProfes, saveFotoProfe,
} from '@/lib/db';
import type { Deportista } from '@/lib/db';

const FOTOS_PROFE_KEY = 'futuro_fotos_profes';
const CAL_OPTIONS = ['', ...Array.from({ length: 46 }, (_, i) => ((i + 5) / 10).toFixed(1))];

// ── Posición virtual ──────────────────────────────────────────
const VPOS = '__POSICION__';
const POSICIONES = ['Portero','Central','Lateral','Interior','Extremo','Creativo','Delantero'];
const MAX_POS = 3;

function CeldaPosicion({ depId, valor, onChange, readOnly = false }: {
  depId: string; valor: string; onChange: (id: string, v: string) => void; readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div style={{ minWidth: 110, fontSize: 11, color: '#374151', fontWeight: 600, padding: '2px 4px' }}>
        {valor || <span style={{ color: '#d1d5db' }}>—</span>}
      </div>
    );
  }
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
              <button key={pos} type="button" onMouseDown={e => e.stopPropagation()} onClick={() => togglePos(pos)} disabled={disabled}
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
            <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => { onChange(depId, ''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 border-t border-gray-100 transition mt-1">
              Limpiar selección
            </button>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div style={{ position: 'relative', minWidth: 110 }}>
      <button ref={btnRef} type="button" onClick={handleToggle}
        className="w-full text-left text-[10px] font-semibold text-[#111827] hover:text-[#16a34a] transition py-0.5">
        {sel.length > 0 ? sel.join(', ') : <span className="text-gray-300 font-normal">—</span>}
      </button>
      {menu}
    </div>
  );
}

const PALETA = [
  { grad: 'from-[#064e1e] to-[#22c55e]',  accent: '#16a34a', chip: 'bg-green-100 text-green-700'   },
  { grad: 'from-[#064e1e] to-[#16a34a]',  accent: '#16a34a', chip: 'bg-green-100 text-green-700'   },
  { grad: 'from-[#0a0c14] to-[#334155]',  accent: '#334155', chip: 'bg-slate-100 text-slate-700'   },
  { grad: 'from-[#064e1e] to-[#16a34a]',  accent: '#16a34a', chip: 'bg-green-100 text-green-800'   },
  { grad: 'from-[#064e1e] to-[#22c55e]',  accent: '#16a34a', chip: 'bg-green-100 text-green-800'   },
  { grad: 'from-[#0a0c14] to-[#475569]',  accent: '#475569', chip: 'bg-slate-100 text-slate-600'   },
  { grad: 'from-[#052e14] to-[#22c55e]',  accent: '#16a34a', chip: 'bg-green-100 text-green-700'   },
  { grad: 'from-[#064e1e] to-[#052a10]',  accent: '#16a34a', chip: 'bg-green-100 text-green-900'   },
];

// Colores para cada categoría de COMPITE
const COMPITE_COLORS: Record<string, string> = {
  'mundial':      'bg-[#064e1e] text-white',
  'estimulacion': 'bg-[#16a34a] text-white',
  'estimulación': 'bg-[#16a34a] text-white',
  'no quizo':     'bg-[#475569] text-white',
  'no quiso':     'bg-[#475569] text-white',
  'lesionado':    'bg-[#1e2535] text-white',
  'nacional':     'bg-[#4b5563] text-white',
  'departamental':'bg-[#16a34a] text-white',
};
function colorCompite(valor: string): string {
  const v = valor.toLowerCase().replace(/^\d+\.\s*/, '');
  for (const [k, c] of Object.entries(COMPITE_COLORS)) {
    if (v.includes(k)) return c;
  }
  return 'bg-gray-200 text-gray-600';
}

function getCol(dep: Deportista, regex: RegExp) {
  const key = Object.keys(dep._columnas).find(k => regex.test(k));
  return key ? dep._columnas[key] : '';
}

// Normaliza programas hacia sus nombres oficiales:
// - "2. Paso a Formación" (y variantes con "paso") → "3. Formación"
// - "Formación" sin número → "3. Formación"
// Resultado: solo quedan 6 programas en pantalla.
function normalizarPrograma(p: string): string {
  if (/paso/i.test(p))                          return '3. Formación';
  if (/^formaci[oó]n$/i.test(p.trim()))         return '3. Formación';
  return p;
}

const colPrograma = (d: Deportista) => normalizarPrograma(getCol(d, /^program/i) || 'Sin programa');
const colProy     = (d: Deportista) => getCol(d, /^proy/i)    || 'Sin proyecto';
const colProfe    = (d: Deportista) => getCol(d, /^profe/i)   || '';
const colCompite  = (d: Deportista) => getCol(d, /^compite/i) || '';
const colEstado   = (d: Deportista) => getCol(d, /^estado/i)  || '';
const colSede     = (d: Deportista) => getCol(d, /^sede/i)    || 'Sin sede';

// Deportistas retirados: ESTADO contiene "retirado"
const esRetirado   = (d: Deportista) => /retirad/i.test(colEstado(d));
// Deportistas sin proyecto asignado
const esSinProy    = (d: Deportista) => !esRetirado(d) && (colProy(d) === 'Sin proyecto' || colProy(d).trim() === '');

const RETIRADOS_KEY  = '__RETIRADOS__';
const SIN_PROY_KEY   = '__SIN_PROYECTO__';
const colCal      = (d: Deportista) => getCol(d, /^cal$/i)    || '';

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Avatar stack ──────────────────────────────────────────────
function AvatarStack({ lista, fotos, grad, max = 6 }: {
  lista: Deportista[]; fotos: Record<string, string>; grad: string; max?: number;
}) {
  return (
    <div className="flex items-center">
      {lista.slice(0, max).map((d, j) => (
        <div key={d.id}
          className={cn('w-7 h-7 rounded-full ring-2 ring-white overflow-hidden flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 bg-gradient-to-br', grad)}
          style={{ marginLeft: j > 0 ? '-6px' : 0 }}>
          {fotos[d.id] ? <img src={fotos[d.id]} alt="" className="w-full h-full object-cover" /> : iniciales(d._nombre)}
        </div>
      ))}
      {lista.length > max && (
        <div className="w-7 h-7 rounded-full ring-2 ring-white bg-gray-100 flex items-center justify-center flex-shrink-0 text-[9px] font-black text-gray-500" style={{ marginLeft: '-6px' }}>
          +{lista.length - max}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de proyecto con foto del profe ────────────────────
function TarjetaProyecto({
  nombre, lista, programa, pal, fotos, fotosProfe,
  onClick, onFotoProfe,
}: {
  nombre: string; lista: Deportista[]; programa: string;
  pal: typeof PALETA[0]; fotos: Record<string, string>;
  fotosProfe: Record<string, string>;
  onClick: () => void; onFotoProfe: (profe: string, b64: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const profes   = [...new Set(lista.map(d => colProfe(d)).filter(Boolean))];
  const profe    = profes[0] ?? '';
  const fotoP    = profe ? fotosProfe[profe] : null;

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file || !profe) return;
    const reader = new FileReader();
    reader.onload = ev => onFotoProfe(profe, ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer overflow-hidden group">
      {/* Barra de color superior más gruesa */}
      <div className={cn('bg-gradient-to-r h-2', pal.grad)} />
      <div className="p-5">
        {/* Chip de programa */}
        <span className={cn('inline-block text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide mb-3', pal.chip)}>
          {programa}
        </span>

        {/* Nombre del proyecto — protagonista */}
        <div className="mb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Proyecto</p>
          <p className="font-black text-gray-900 text-xl leading-tight">{nombre}</p>
        </div>

        {/* Entrenador */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            'w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0',
            fotoP ? '' : `bg-gradient-to-br ${pal.grad}`
          )}>
            {fotoP
              ? <img src={fotoP} alt={profe} className="w-full h-full object-cover" />
              : <GraduationCap className="w-5 h-5 text-white" />
            }
          </div>
          <div className="flex-1 min-w-0">
            {profe ? (
              <>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Entrenador</p>
                <p className="font-bold text-gray-800 text-sm leading-tight truncate">{profe}</p>
                {profes.length > 1 && (
                  <p className="text-[11px] text-gray-400 truncate">{profes.slice(1).join(', ')}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-300 italic">Sin entrenador asignado</p>
            )}
          </div>
          {profe && (
            <>
              <button
                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition flex-shrink-0"
                title="Subir foto del profe">
                <Camera className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
            </>
          )}
        </div>

        {/* Pie: contador + flecha */}
        <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-500">{lista.length} deportistas</span>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
}

// ── Dashboard del Proyecto (tabla horizontal) ─────────────────
function DashboardProyecto({
  proy, lista, programa, pal, fotos, fotosProfe, esProfe,
  onFotoProfe, onVerPerfil, onPosicion,
}: {
  proy: string; lista: Deportista[]; programa: string;
  pal: typeof PALETA[0]; fotos: Record<string, string>;
  fotosProfe: Record<string, string>;
  esProfe: boolean;
  onFotoProfe: (profe: string, b64: string) => void;
  onVerPerfil: (id: string) => void;
  onPosicion: (depId: string, val: string) => void;
}) {
  const inputRef      = useRef<HTMLInputElement>(null);
  const printRef      = useRef<HTMLDivElement>(null);
  const tableScrollRef= useRef<HTMLDivElement>(null);
  const realTheadRef  = useRef<HTMLTableSectionElement>(null);
  const stickyBarRef  = useRef<HTMLDivElement>(null);
  const profes   = [...new Set(lista.map(d => colProfe(d)).filter(Boolean))];
  const profe    = profes[0] ?? '';
  const fotoP    = profe ? fotosProfe[profe] : null;

  const [busqueda,    setBusqueda]   = useState('');
  const [vistaTabla,  setVistaTabla] = useState(true);
  const [descargando, setDescargando]= useState(false);
  const [showSticky,  setShowSticky] = useState(false);

  // ── Calificaciones (mismo localStorage que asistencia) ─────────
  const mesKey = (() => {
    const now = new Date();
    return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  const calStorageKey = `futuro_cal_${proy}_${mesKey}`;
  const comStorageKey = `futuro_com_${proy}_${mesKey}`;
  const [calMap, setCalMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`futuro_cal_${proy}_${(() => { const n = new Date(); return `${n.getFullYear()}_${String(n.getMonth()+1).padStart(2,'0')}`; })()}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [comMap, setComMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`futuro_com_${proy}_${(() => { const n = new Date(); return `${n.getFullYear()}_${String(n.getMonth()+1).padStart(2,'0')}`; })()}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // ── Carga CAL y COM desde Supabase al montar el componente ────
  // Mergea con localStorage: Supabase sobreescribe, localStorage cubre gaps de red.
  // El profe y el admin ven los mismos datos porque ambos leen de la misma tabla.
  useEffect(() => {
    if (!proy) return;
    getCalComPorProyecto(proy, mesKey)
      .then(({ cal, com }) => {
        if (Object.keys(cal).length > 0) setCalMap(cal);
        if (Object.keys(com).length > 0) setComMap(com);
      })
      .catch(() => {/* red no disponible — localStorage ya inicializó el estado */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proy]);

  // ── Sticky thead clone — se activa cuando el thead real sube por encima del nav ──
  useEffect(() => {
    const container = tableScrollRef.current;
    function sync() {
      if (!realTheadRef.current) return;
      const navEl     = document.querySelector('header');
      const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 64;
      const theadTop  = realTheadRef.current.getBoundingClientRect().top;
      setShowSticky(theadTop < navBottom);
      if (stickyBarRef.current && container) {
        const rect = container.getBoundingClientRect();
        stickyBarRef.current.style.top   = `${navBottom}px`;
        stickyBarRef.current.style.left  = `${rect.left}px`;
        stickyBarRef.current.style.width = `${rect.width}px`;
        stickyBarRef.current.style.right = 'auto';
        stickyBarRef.current.scrollLeft  = container.scrollLeft;
      }
    }
    window.addEventListener('scroll', sync, { passive: true });
    container?.addEventListener('scroll', sync, { passive: true });
    return () => {
      window.removeEventListener('scroll', sync);
      container?.removeEventListener('scroll', sync);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Posicionar el clone exactamente al montarse (antes del primer paint)
  useLayoutEffect(() => {
    if (!showSticky || !stickyBarRef.current || !tableScrollRef.current) return;
    const navEl     = document.querySelector('header');
    const navBottom = navEl ? navEl.getBoundingClientRect().bottom : 64;
    const rect      = tableScrollRef.current.getBoundingClientRect();
    stickyBarRef.current.style.top   = `${navBottom}px`;
    stickyBarRef.current.style.left  = `${rect.left}px`;
    stickyBarRef.current.style.width = `${rect.width}px`;
    stickyBarRef.current.style.right = 'auto';
    stickyBarRef.current.scrollLeft  = tableScrollRef.current.scrollLeft;
    // Copiar anchos exactos del thead real al clone para alineación perfecta.
    // visibility:hidden mantiene dimensiones válidas, getBoundingClientRect() funciona.
    if (realTheadRef.current) {
      const realThs  = Array.from(realTheadRef.current.querySelectorAll('th')) as HTMLElement[];
      const cloneThs = Array.from(stickyBarRef.current.querySelectorAll('th')) as HTMLElement[];
      let stickyLeft = 0;
      let totalWidth = 0;
      realThs.forEach((th, i) => {
        const w = Math.ceil(th.getBoundingClientRect().width);
        totalWidth += w;
        if (cloneThs[i]) {
          cloneThs[i].style.width    = `${w}px`;
          cloneThs[i].style.minWidth = `${w}px`;
          // Recalcular left de celdas sticky según ancho real medido
          if (cloneThs[i].style.position === 'sticky') {
            cloneThs[i].style.left = `${stickyLeft}px`;
            stickyLeft += w;
          }
        }
      });
      // table-layout:fixed es crítico: sin él el browser redistribuye los anchos
      // ignorando los que asignamos (porque el clone no tiene <tbody>)
      const cloneTable = stickyBarRef.current.querySelector('table') as HTMLElement | null;
      if (cloneTable) {
        cloneTable.style.tableLayout = 'fixed';
        cloneTable.style.width       = `${totalWidth}px`;
        cloneTable.style.minWidth    = `${totalWidth}px`;
      }
    }
  }, [showSticky]);

  function setCal(depId: string, value: string) {
    setCalMap(prev => {
      const updated = { ...prev, [depId]: value };
      try { localStorage.setItem(calStorageKey, JSON.stringify(updated)); } catch {}
      return updated;
    });
    // Lee COM desde localStorage (siempre actualizado por saveCalCom de forma sincrónica)
    // en lugar del estado React, para evitar stale closure cuando COM cambió en el mismo batch.
    const latestCom = (() => {
      try { return (JSON.parse(localStorage.getItem(comStorageKey) || '{}') as Record<string, string>)[depId] ?? ''; }
      catch { return ''; }
    })();
    saveCalCom(proy, mesKey, depId, value, latestCom).catch(() => {});
  }
  function setCom(depId: string, value: string) {
    setComMap(prev => {
      const updated = { ...prev, [depId]: value };
      try { localStorage.setItem(comStorageKey, JSON.stringify(updated)); } catch {}
      return updated;
    });
    // Lee CAL desde localStorage (siempre actualizado por saveCalCom de forma sincrónica)
    // en lugar del estado React, para evitar stale closure cuando CAL cambió en el mismo batch.
    const latestCal = (() => {
      try { return (JSON.parse(localStorage.getItem(calStorageKey) || '{}') as Record<string, string>)[depId] ?? ''; }
      catch { return ''; }
    })();
    saveCalCom(proy, mesKey, depId, latestCal, value).catch(() => {});
  }

  // ── Descarga PDF tamaño carta ─────────────────────────────────
  async function descargar() {
    if (!printRef.current || descargando) return;
    setDescargando(true);

    // Quitar restricción de alto en el scroll para capturar toda la tabla
    const scrollEl  = tableScrollRef.current;
    const origMaxH  = scrollEl ? scrollEl.style.maxHeight  : '';
    const origOvY   = scrollEl ? scrollEl.style.overflowY  : '';
    if (scrollEl) { scrollEl.style.maxHeight = 'none'; scrollEl.style.overflowY = 'visible'; }

    try {
      // Cargar librerías bajo demanda
      const loadScript = (src: string) => new Promise<void>((res, rej) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = () => res(); s.onerror = rej;
        document.head.appendChild(s);
      });
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

      await new Promise(r => setTimeout(r, 200)); // esperar repintado

      const canvas = await (window as any).html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f1f5f9',
        scrollY: 0,
        logging: false,
      });

      const { jsPDF } = (window as any).jspdf;
      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW  = pdf.internal.pageSize.getWidth();   // 215.9 mm
      const pageH  = pdf.internal.pageSize.getHeight();  // 279.4 mm
      const margin = 10;
      const cw     = pageW - margin * 2;                 // ancho de contenido
      const imgW   = canvas.width;
      const imgH   = canvas.height;
      const imgData= canvas.toDataURL('image/jpeg', 0.95);
      const totalHmm = (imgH * cw) / imgW;

      if (totalHmm <= pageH - margin * 2) {
        pdf.addImage(imgData, 'JPEG', margin, margin, cw, totalHmm);
      } else {
        // Dividir en páginas
        const pageHmm  = pageH - margin * 2;
        const pageHpx  = (pageHmm * imgW) / cw;
        let yPx = 0;
        while (yPx < imgH) {
          const sliceHpx   = Math.min(pageHpx, imgH - yPx);
          const tmp         = document.createElement('canvas');
          tmp.width  = imgW; tmp.height = sliceHpx;
          tmp.getContext('2d')!.drawImage(canvas, 0, yPx, imgW, sliceHpx, 0, 0, imgW, sliceHpx);
          const sliceHmm   = (sliceHpx * cw) / imgW;
          if (yPx > 0) pdf.addPage();
          pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, cw, sliceHmm);
          yPx += pageHpx;
        }
      }

      // Nombre de archivo
      const clean = (s: string) => s.replace(/[^a-zA-Z0-9ÁÉÍÓÚáéíóúÑñ\s]/g, '').trim().replace(/\s+/g, '_').toUpperCase();
      pdf.save(`PROYECTO_${clean(proy)}_PROFE_${clean(profe || 'SIN_PROFE')}.pdf`);
    } catch(err) {
      console.error(err);
      alert('Error al generar el PDF.');
    } finally {
      if (scrollEl) { scrollEl.style.maxHeight = origMaxH; scrollEl.style.overflowY = origOvY; }
      setDescargando(false);
    }
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profe) return;
    const reader = new FileReader();
    reader.onload = ev => onFotoProfe(profe, ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // Tipo de afiliación
  const colAfil = (d: Deportista) => getCol(d, /tipo.*afil|afil.*tipo/i) || getCol(d, /afiliaci[oó]n/i) || '';

  // Stats por tipo de afiliación
  const nuevos    = lista.filter(d => colAfil(d).toLowerCase().includes('nuevo')).length;
  const antiguos  = lista.filter(d => colAfil(d).toLowerCase().includes('antigu')).length;
  const reingreso = lista.filter(d => colAfil(d).toLowerCase().includes('reingreso')).length;
  const mbInst    = lista.filter(d => colAfil(d).toLowerCase().includes('mb instit')).length;
  const bInst     = lista.filter(d => colAfil(d).toLowerCase().includes('b instit')).length;

  // Color del CÓDIGO según tipo de afiliación
  function colorCodigo(afil: string): string {
    const v = afil.toLowerCase();
    if (v.includes('nuevo'))     return '#f97316'; // Naranja
    if (v.includes('antigu'))    return '#16a34a'; // Verde
    if (v.includes('reingreso')) return '#2563eb'; // Azul
    if (v.includes('mb instit')) return '#374151'; // Gris oscuro
    if (v.includes('b instit'))  return '#7c3aed'; // Morado
    return '#6b7280'; // gris por defecto
  }

  // Helpers celda — declarados antes del sort para que el hoisting los tenga disponibles
  function getRK(dep: Deportista, rx: RegExp) { return Object.keys(dep._columnas).find(k => rx.test(k)) ?? ''; }
  function val(dep: Deportista, key: string): string {
    const map: Record<string, RegExp> = {
      estado:/^estado/i, codigo:/^c[oó]d/i, anio:/^a[ñn]o$/i,
      mes:/^mes$/i, dia:/^d[ií]a$/i, cal:/^cal$/i, compite:/^compite/i,
      afiliacion:/tipo.*afil|afil.*tipo/i,
    };
    if (key === 'nombre') return dep._nombre;
    if (key === 'afiliacion') {
      const k1 = getRK(dep, /tipo.*afil|afil.*tipo/i);
      const k2 = getRK(dep, /afiliaci[oó]n/i);
      return dep._columnas[k1 || k2] ?? '';
    }
    const k = map[key] ? getRK(dep, map[key]) : '';
    return k ? (dep._columnas[k] ?? '') : '';
  }

  // Orden ESTADO: Activo primero, Sin Afiliación último
  function pesoEstado(d: Deportista): number {
    const v = val(d, 'estado').toLowerCase();
    if (!v) return 50;
    if (v.includes('activ')) return 0;
    if (v.includes('sin afil') || v.includes('sin_afil')) return 99;
    return 1;
  }

  // Orden AFILIACIÓN: Antiguo, Nuevo, Reingreso, MB Institucional, B Institucional
  const ORDEN_AFIL = ['antigu','nuevo','reingreso','mb instit','b instit'];
  function pesoAfil(d: Deportista): number {
    const v = val(d, 'afiliacion').toLowerCase();
    if (!v) return ORDEN_AFIL.length;
    const idx = ORDEN_AFIL.findIndex(k => v.includes(k));
    return idx >= 0 ? idx : ORDEN_AFIL.length - 1;
  }

  // ── Detectar columnas clave por nombre Y por valor ──────────
  const AFIL_KWDS = ['antigu','nuevo','reingreso','mb instit','b instit','sin afil','paso'];
  const _allKeys  = lista.length > 0 ? Object.keys(lista[0]._columnas) : [];
  const AFIL_KEY  = _allKeys.find(k => /tipo.*afil|afil.*tipo/i.test(k.trim()))
                 || _allKeys.find(k => /afiliaci[oó]n/i.test(k.trim()))
                 || _allKeys.find(k => lista.some(d => {
                      const v = (d._columnas[k] ?? '').toLowerCase();
                      return AFIL_KWDS.some(kw => v.includes(kw));
                    }))
                 || '';
  const ESTADO_KEY = _allKeys.find(k => /^estado/i.test(k.trim())) || '';

  const ORDEN_AFIL_SORT = ['antigu','nuevo','reingreso','mb instit','b instit'];
  const filtrada = lista
    .filter(d => !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      const ev = (d: Deportista) => (ESTADO_KEY ? d._columnas[ESTADO_KEY] ?? '' : '').toLowerCase();
      const av = (d: Deportista) => (AFIL_KEY   ? d._columnas[AFIL_KEY]   ?? '' : '').toLowerCase();
      const pE = (v: string) => v.includes('activ') ? 0 : (v.includes('sin afil') || v.includes('sin_afil')) ? 99 : (v ? 1 : 50);
      const pA = (v: string) => { const i = ORDEN_AFIL_SORT.findIndex(k => v.includes(k)); return i >= 0 ? i : ORDEN_AFIL_SORT.length; };
      return pE(ev(a)) - pE(ev(b)) || pA(av(a)) - pA(av(b)) || a._nombre.localeCompare(b._nombre, 'es');
    });

  // Color chip afiliación
  function colorAfil(v: string): string {
    const lv = v.toLowerCase();
    if (lv.includes('antigu'))   return 'bg-[#4b5563] text-white';
    if (lv.includes('nuevo'))    return 'bg-[#16a34a] text-white';
    if (lv.includes('reingreso'))return 'bg-[#334155] text-white';
    if (lv.includes('pas'))      return 'bg-[#374151] text-white';
    if (lv.includes('mb instit'))return 'bg-[#064e1e] text-white';
    if (lv.includes('b instit')) return 'bg-[#22c55e] text-[#064e1e]';
    if (lv.includes('sin afil')) return 'bg-[#475569] text-white';
    return 'bg-gray-200 text-gray-600';
  }

  // Columnas fijas
  type Col = { key: string; label: string; minW: number; center?: boolean };
  const hasCodigo  = lista.some(d => getRK(d, /^c[oó]d/i));
  const hayAnio    = lista.some(d => getRK(d, /^a[ñn]o$/i));
  const hasMes     = lista.some(d => getRK(d, /^mes$/i));
  const hasDia     = lista.some(d => getRK(d, /^d[ií]a$/i));
  const hayCal     = lista.some(d => getRK(d, /^cal$/i));
  const hayAfil    = lista.some(d => val(d, 'afiliacion') !== '');

  const cols: Col[] = [
    {                  key:'estado',     label:'ESTADO',        minW:100           },
    ...(hayAfil   ? [{ key:'afiliacion', label:'AFILIACIÓN',   minW:130           }] : []),
    ...(hasCodigo ? [{ key:'codigo',     label:'CÓDIGO',        minW:80            }] : []),
    {                  key:'nombre',     label:'DEPORTISTA',    minW:200           },
    ...(hayAnio   ? [{ key:'anio',       label:'AÑO',           minW:60, center:true }] : []),
    ...(hasMes    ? [{ key:'mes',        label:'MES',           minW:90            }] : []),
    ...(hasDia    ? [{ key:'dia',        label:'DÍA',           minW:50, center:true }] : []),
  ];

  return (
    <div className="space-y-3" ref={printRef}>

      {/* ── Sticky thead clone (fijo bajo el nav cuando el original sale de vista) ── */}
      {showSticky && (
        <>
          <style dangerouslySetInnerHTML={{ __html: '[data-sticky-clone]::-webkit-scrollbar{display:none}[data-hidden-thead] th{position:relative!important;z-index:15!important;background:#ffffff!important;color:transparent!important;border-color:transparent!important}[data-hidden-thead] tr{background:#ffffff!important}' }} />
          <div
            ref={stickyBarRef}
            data-sticky-clone=""
            style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 30, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', pointerEvents: 'none' }}
          >
            <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
              <thead>
                <tr style={{ background: '#16a34a' }}>
                  <th className="border border-[#16375a] px-2 py-2 text-[10px] text-white/40 select-none text-center"
                    style={{ background: '#16a34a', width: 36, minWidth: 36, position: 'sticky', left: 0, zIndex: 4 }}>#</th>
                  {cols.map(c => (
                    <th key={c.key}
                      className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap"
                      style={{ minWidth: c.minW, textAlign: c.center ? 'center' : 'left', background: '#16a34a',
                        ...(c.key === 'nombre' ? { position: 'sticky', left: 36, zIndex: 3, boxShadow: '2px 0 4px rgba(0,0,0,0.15)' } : {}) }}>
                      {c.label}
                    </th>
                  ))}
                  <th className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left" style={{ minWidth: 130, background: '#16a34a' }}>
                    POSICIÓN <span className="text-white/40 font-normal normal-case">(máx. 3)</span>
                  </th>
                  <th className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-center" style={{ minWidth: 90, background: '#7c3aed' }}>CAL</th>
                  <th className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-center" style={{ minWidth: 80, background: '#1d4ed8' }}>COM</th>
                </tr>
              </thead>
            </table>
          </div>
        </>
      )}

      {/* ── Hero profe + stats ── */}
      <div className={cn('rounded-2xl shadow-sm bg-gradient-to-br', pal.grad)}>
        <div className="p-4 text-white">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/20 flex items-center justify-center ring-4 ring-white/30">
                {fotoP ? <img src={fotoP} alt={profe} className="w-full h-full object-cover"/>
                       : <span className="font-black text-lg">{iniciales(profe||'?')}</span>}
              </div>
              {profe && (
                <button onClick={() => inputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full shadow flex items-center justify-center">
                  <Camera className="w-3 h-3 text-gray-600"/>
                </button>
              )}
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFoto}/>
            </div>
            <div className="flex-1">
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Entrenador</p>
              <p className="text-white font-black text-base leading-tight">{profe||'Sin asignar'}</p>
              <p className="text-white/70 text-xs font-semibold">{proy} · {programa}</p>
            </div>
            <div className="flex gap-3 text-center flex-shrink-0 flex-wrap">
              <div><p className="text-xl font-black">{lista.length}</p><p className="text-white/60 text-[10px]">Total</p></div>
              <div className="border-l border-white/20 pl-3"><p className="text-xl font-black">{antiguos}</p><p className="text-white/60 text-[10px]">Antiguos</p></div>
              <div className="border-l border-white/20 pl-3"><p className="text-xl font-black">{nuevos}</p><p className="text-white/60 text-[10px]">Nuevos</p></div>
              <div className="border-l border-white/20 pl-3"><p className="text-xl font-black">{reingreso}</p><p className="text-white/60 text-[10px]">Reingreso</p></div>
              <div className="border-l border-white/20 pl-3"><p className="text-xl font-black">{mbInst}</p><p className="text-white/60 text-[10px]">MB</p></div>
              <div className="border-l border-white/20 pl-3"><p className="text-xl font-black">{bInst}</p><p className="text-white/60 text-[10px]">B</p></div>
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
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#16a34a] placeholder:text-gray-300"/>
        </div>
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        )}
        <span className="text-xs text-gray-400 font-bold flex-shrink-0">{filtrada.length}/{lista.length}</span>
      </div>

      {/* ── Vista tarjetas ── */}
      {!vistaTabla && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtrada.map(dep => {
            const e = colEstado(dep), c = colCompite(dep), a = getRK(dep, /^a[ñn]o$/i) ? dep._columnas[getRK(dep,/^a[ñn]o$/i)] : '';
            const esN = e.toLowerCase().includes('nuevo'), esA = e.toLowerCase().includes('antigu');
            return (
              <div key={dep.id} onClick={() => onVerPerfil(dep.id)}
                className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all overflow-hidden">
                <div className={cn('h-1 bg-gradient-to-r', pal.grad)}/>
                <div className="p-3 flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-br text-white font-black text-[10px]', pal.grad)}>
                    {fotos[dep.id] ? <img src={fotos[dep.id]} alt="" className="w-full h-full object-cover"/> : iniciales(dep._nombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{dep._nombre}</p>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {e && <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', esN?'bg-green-100 text-green-700':esA?'bg-gray-200 text-gray-700':'bg-gray-100 text-gray-500')}>{e}</span>}
                      {c && <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', colorCompite(c))}>{c}</span>}
                    </div>
                  </div>
                  {a && <p className="text-xs text-gray-400 flex-shrink-0">{a}</p>}
                </div>
              </div>
            );
          })}
          {filtrada.length === 0 && <p className="col-span-2 text-center py-8 text-sm text-gray-400">Sin resultados</p>}
        </div>
      )}

      {/* ── Vista tabla Excel (solo lectura) ── */}
      {vistaTabla && (
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">

          {/* Encabezado PROYECTO / FORMADOR */}
          <table className="text-xs border-collapse w-auto">
            <tbody>
              <tr>
                <td className="border border-white px-4 py-1.5 font-black text-white bg-[#4b5563] w-28 uppercase text-[11px]">PROYECTO</td>
                <td className="border border-white px-4 py-1.5 font-bold text-gray-800 min-w-[200px]">{proy}</td>
              </tr>
              <tr>
                <td className="border border-white px-4 py-1.5 font-black text-white bg-[#4b5563] uppercase text-[11px]">FORMADOR</td>
                <td className="border border-white px-4 py-1.5 font-bold text-gray-800">{profe || '—'}</td>
              </tr>
            </tbody>
          </table>

          {/* Tabla */}
          <div ref={tableScrollRef} className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
              <thead ref={realTheadRef} className="z-10" {...(showSticky ? { 'data-hidden-thead': '' } : {})}>
                <tr style={{ background: '#16a34a' }}>
                  <th className="border border-[#16375a] px-2 py-2 text-[10px] text-white/40 w-9 select-none text-center sticky left-0 z-20" style={{ background: '#16a34a' }}>#</th>
                  {cols.map(c => (
                    <th key={c.key}
                      className={`border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap${c.key === 'nombre' ? ' sticky left-9 z-20' : ''}`}
                      style={{ minWidth: c.minW, textAlign: c.center ? 'center' : 'left', background: '#16a34a', ...(c.key === 'nombre' ? { boxShadow: '2px 0 4px rgba(0,0,0,0.15)' } : {}) }}>
                      {c.label}
                    </th>
                  ))}
                  <th className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left" style={{ minWidth: 130 }}>
                    POSICIÓN <span className="text-white/40 font-normal normal-case">(máx. 3)</span>
                  </th>
                  <th className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-center"
                    style={{ minWidth: 90, background: '#7c3aed' }}
                    title="Calificación del mes actual">
                    CAL
                  </th>
                  <th className="border border-[#16375a] px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-center"
                    style={{ minWidth: 80, background: '#1d4ed8' }}
                    title="Competencia en torneo">
                    COM
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((dep, i) => {
                  const estado  = val(dep, 'estado');
                  const esN = estado.toLowerCase().includes('nuevo');
                  const esA = estado.toLowerCase().includes('antigu');
                  const bg  = '#f1f5f9';

                  return (
                    <tr key={dep.id} style={{ background: bg }} className="hover:brightness-95 transition-all">
                      <td className="border border-white px-2 py-1.5 text-center text-[10px] font-bold select-none sticky left-0"
                        style={{ color: '#111827', background: bg, zIndex: 4, minWidth: 36 }}>{i + 1}</td>

                      {cols.map(c => {
                        const v = val(dep, c.key);
                        // CÓDIGO — fondo por tipo de afiliación
                        if (c.key === 'codigo') return (
                          <td key={c.key}
                            className="border border-white px-2 py-1.5 text-center whitespace-nowrap font-black text-white text-sm"
                            style={{ background: colorCodigo(val(dep, 'afiliacion')) }}>
                            {v || '—'}
                          </td>
                        );
                        return (
                          <td key={c.key}
                            className={cn('border border-white px-2 py-1.5', c.key !== 'afiliacion' && 'whitespace-nowrap', c.key === 'nombre' && 'sticky left-9 z-10')}
                            style={{ textAlign: c.center ? 'center' : 'left', verticalAlign: 'middle', ...(c.key === 'nombre' ? { background: bg, boxShadow: `-6px 0 0 6px ${bg}, 2px 0 4px rgba(0,0,0,0.07)`, zIndex: 3 } : {}) }}>

                            {c.key === 'nombre' ? (
                              <span className="font-bold text-[#111827] underline decoration-dotted underline-offset-2 cursor-pointer"
                                onClick={() => onVerPerfil(dep.id)}>{dep._nombre}</span>
                            ) : c.key === 'afiliacion' ? (
                              v ? <span className="text-[10px] font-semibold text-[#111827]">{v}</span>
                                : <span className="text-gray-300">—</span>
                            ) : c.key === 'estado' ? (
                              v ? <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full',
                                    esN ? 'bg-green-200 text-green-900' :
                                    esA ? 'bg-gray-300 text-gray-800' : 'bg-gray-200 text-gray-600')}>{v}</span>
                                : <span className="text-gray-300">—</span>
                            ) : c.key === 'compite' ? (
                              v ? <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', colorCompite(v))}>{v}</span>
                                : <span className="text-gray-300">—</span>
                            ) : (
                              <span className="text-gray-900 font-medium">{v || <span className="text-gray-300">—</span>}</span>
                            )}
                          </td>
                        );
                      })}
                      {/* ── POSICIÓN ── */}
                      <td className="border border-white px-2 py-1.5" style={{ overflow: 'visible', position: 'relative', verticalAlign: 'middle' }}>
                        <CeldaPosicion
                          depId={dep.id}
                          valor={dep._columnas?.[VPOS] ?? ''}
                          onChange={onPosicion}
                          readOnly={!esProfe}
                        />
                      </td>
                      {/* ── CAL ── */}
                      <td className="border border-white px-0.5 py-1 text-center" style={{ background: '#f5f3ff', minWidth: 90 }}>
                        <select value={calMap[dep.id] ?? ''}
                          onChange={e => { if (esProfe) setCal(dep.id, e.target.value); }}
                          disabled={!esProfe}
                          title={esProfe ? 'Calificación del deportista' : 'Solo el formador puede editar'}
                          style={{ fontSize: '13px', fontWeight: 900, width: '72px', textAlign: 'center',
                            background: 'transparent', border: 'none', outline: 'none',
                            color: '#111827', cursor: esProfe ? 'pointer' : 'default' }}>
                          {CAL_OPTIONS.map(v2 => <option key={v2} value={v2}>{v2 || '—'}</option>)}
                        </select>
                      </td>
                      {/* ── COM ── */}
                      <td className="border border-white px-0.5 py-1 text-center" style={{ background: '#eff6ff', minWidth: 80 }}>
                        <select value={comMap[dep.id] ?? ''}
                          onChange={e => { if (esProfe) setCom(dep.id, e.target.value); }}
                          disabled={!esProfe}
                          title={esProfe ? '¿Compite en torneo?' : 'Solo el formador puede editar'}
                          style={{ fontSize: '12px', fontWeight: 900, width: '64px', textAlign: 'center',
                            background: 'transparent', border: 'none', outline: 'none',
                            color: '#111827', cursor: esProfe ? 'pointer' : 'default' }}>
                          <option value="">—</option>
                          <option value="SI">SI</option>
                          <option value="N.Q">N.Q</option>
                          <option value="N.A">N.A</option>
                          <option value="ESP">ESP</option>
                          <option value="INV">INV</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {filtrada.length === 0 && (
                  <tr><td colSpan={cols.length + 3} className="py-10 text-center text-sm text-gray-400 border border-white">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Barra inferior */}
          <div className="bg-[#f1f5f9] border-t border-white px-4 py-1.5 flex items-center gap-4 text-[10px] font-semibold text-[#111827]">
            <span>ADMON 2026</span>
            <span>{filtrada.length} registros · Nuevos: {nuevos} · Antiguos: {antiguos}</span>
            <span className="ml-auto text-[#4b5563]">Clic en el nombre para ver el perfil completo</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function AlumnosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [fotos,       setFotos]       = useState<Record<string, string>>({});
  const [fotosProfe,  setFotosProfe]  = useState<Record<string, string>>({});
  const [programa,    setPrograma]    = useState<string | null>(null);
  const [proy,        setProy]        = useState<string | null>(null);
  const [busqueda,    setBusqueda]    = useState('');
  const [proyEdits,   setProyEdits]   = useState<Record<string, string>>({});
  const [cargando,    setCargando]    = useState(true);
  const [errorCarga,  setErrorCarga]  = useState<string | null>(null);

  // Calidoso/padre: redirigir a su propio perfil en vez de ver la lista completa
  useEffect(() => {
    try {
      const cookies = document.cookie.split(';').map(c => c.trim());
      if (cookies.some(c => c === 'futuro-session=deportista')) {
        const calidosoId = localStorage.getItem('futuro-calidoso-id');
        router.replace(calidosoId ? `/alumnos/${calidosoId}` : '/dashboard');
      }
    } catch {}
  }, [router]);

  // Detección de profesor — se hace en useEffect (cliente) para evitar mismatch de SSR
  const [esProfe, setEsProfe] = useState(false);
  useEffect(() => {
    try {
      const cookies = document.cookie.split(';').map(c => c.trim());
      // Admin (futuro-session=1) nunca es profe, aunque localStorage tenga datos viejos
      if (cookies.some(c => c === 'futuro-session=1')) return;
      if (cookies.some(c => c === 'futuro-session=profesor')) { setEsProfe(true); return; }
      const g = localStorage.getItem('futuro-profe-proyectos');
      const n = localStorage.getItem('futuro-profe-nombre');
      if (g && n) setEsProfe(true);
    } catch {}
  }, []);
  const autoNavRef = useRef(false);

  useEffect(() => {
    const proyParam = searchParams.get('proyecto');
    if (proyParam) {
      // Profe mode (URL tiene ?proyecto=): carga solo los deportistas de ESE proyecto
      getDeportistasPorProyecto(proyParam).then(({ data: lista, error }) => {
        setCargando(false);
        if (lista.length > 0) {
          setDeportistas(lista);
          const prog = lista[0]?._columnas?.['PROGRAMA'] ?? lista[0]?._columnas?.['Programa'] ?? 'Sin programa';
          setPrograma(prog);
          setProy(proyParam);
        } else if (error) {
          setErrorCarga(error);
        }
      });
    } else {
      // Admin mode: carga todos los deportistas
      getDeportistas().then(lista => { setCargando(false); if (lista.length) setDeportistas(lista); });
    }
    try {
      const f = localStorage.getItem('futuro_fotos_deportistas');
      if (f) setFotos(JSON.parse(f));
      const fp = localStorage.getItem(FOTOS_PROFE_KEY);
      if (fp) setFotosProfe(JSON.parse(fp));
    } catch {}
    // Carga fotos de profes desde Supabase (columna profes.foto)
    // Mergea con localStorage para que funcione sin red también
    getFotosProfes()
      .then(fotos => { if (Object.keys(fotos).length > 0) setFotosProfe(fotos); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-navegar al proyecto cuando viene desde mis-proyectos con ?proyecto=
  useEffect(() => {
    const proyParam = searchParams.get('proyecto');
    if (!proyParam || deportistas.length === 0 || autoNavRef.current) return;
    autoNavRef.current = true;
    // Buscar el programa que contiene este proyecto
    const activos = deportistas.filter(d => !esRetirado(d) && !esSinProy(d));
    const porProg: Record<string, Deportista[]> = {};
    activos.forEach(d => {
      const p = colPrograma(d);
      (porProg[p] = porProg[p] || []).push(d);
    });
    for (const [progNombre, deps] of Object.entries(porProg)) {
      if (deps.some(d => colProy(d) === proyParam)) {
        setPrograma(progNombre);
        setProy(proyParam);
        return;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deportistas]);

  function guardarProy(depId: string, valor: string) {
    if (!valor.trim()) return;
    const lista = deportistas.map(d => {
      if (d.id !== depId) return d;
      const kProy = Object.keys(d._columnas).find(k => /^proy/i.test(k)) || 'PROY';
      return { ...d, _columnas: { ...d._columnas, [kProy]: valor.trim() } };
    });
    setDeportistas(lista);
    setProyEdits(prev => { const n = { ...prev }; delete n[depId]; return n; });
    saveDeportistas(lista);
  }

  function guardarFotoProfe(profe: string, b64: string) {
    const nuevo = { ...fotosProfe, [profe]: b64 };
    setFotosProfe(nuevo);
    try { localStorage.setItem(FOTOS_PROFE_KEY, JSON.stringify(nuevo)); } catch {}
    // Persiste en profes.foto de Supabase (columna ya existe, UPDATE por usuario)
    saveFotoProfe(profe, b64).catch(() => {});
  }

  // Grupos especiales — excluidos de todos los programas
  const retirados  = deportistas.filter(d => esRetirado(d));
  const sinProy    = deportistas.filter(d => esSinProy(d));

  // Agrupaciones — excluye retirados y sin-proyecto
  const porPrograma = deportistas
    .filter(d => !esRetirado(d) && !esSinProy(d))
    .reduce<Record<string, Deportista[]>>((acc, d) => {
      const p = colPrograma(d); (acc[p] = acc[p] || []).push(d); return acc;
    }, {});
  const ORDEN_PROGRAMAS = ['estimul','formac','preprogres','progres','selecc','desarrollo'];
  const progRank = (nombre: string) => {
    const n = nombre.toLowerCase();
    const idx = ORDEN_PROGRAMAS.findIndex(k => n.includes(k));
    return idx >= 0 ? idx : 99;
  };
  const programasSorted = Object.entries(porPrograma).sort((a, b) => {
    const ra = progRank(a[0]), rb = progRank(b[0]);
    return ra !== rb ? ra - rb : a[0].localeCompare(b[0]);
  });

  const depPrograma = programa && programa !== RETIRADOS_KEY && programa !== SIN_PROY_KEY
    ? (porPrograma[programa] ?? []) : [];
  const porProy     = depPrograma.reduce<Record<string, Deportista[]>>((acc, d) => {
    const p = colProy(d); (acc[p] = acc[p] || []).push(d); return acc;
  }, {});
  const proysSorted = Object.entries(porProy).sort((a, b) => a[0].localeCompare(b[0]));

  const palIdx = (nombre: string, lista: [string, any][]) =>
    PALETA[lista.findIndex(([n]) => n === nombre) % PALETA.length];

  function limpiar() {
    if (!confirm('¿Eliminar todos los deportistas?')) return;
    ['futuro_deportistas','futuro_fotos_deportistas'].forEach(k => localStorage.removeItem(k));
    setDeportistas([]); setFotos({}); setPrograma(null); setProy(null);
  }

  function handlePosicion(depId: string, val: string) {
    setDeportistas(prev => {
      const next = prev.map(d =>
        d.id === depId
          ? { ...d, _columnas: { ...(d._columnas ?? {}), [VPOS]: val } }
          : d
      );
      saveDeportistas(next);
      return next;
    });
  }

  // ══ NIVEL 1: PROGRAMAS ═══════════════════════════════════════
  // Guard: URL con ?proyecto= → nunca mostrar Level 1 admin, solo loading o error de conexión
  if (!programa) {
    const proyParam = searchParams.get('proyecto');
    if (proyParam) {
      // Mientras carga → spinner
      if (cargando) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
          <BalonCargando />
          <p className="text-sm font-semibold text-gray-500 text-center px-6">
            Cargando proyecto <strong className="text-[#064e1e]">{proyParam}</strong>…
          </p>
        </div>
      );
      // Datos cargando o auto-nav aún no corrió → mantener spinner
      if (deportistas.length > 0) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
          <BalonCargando />
          <p className="text-sm font-semibold text-gray-500 text-center px-6">
            Cargando proyecto <strong className="text-[#064e1e]">{proyParam}</strong>…
          </p>
        </div>
      );
      // Cargó pero vacío → error de conexión con detalle real
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-20 h-20 bg-orange-50 rounded-3xl flex items-center justify-center mb-1">
            <Users className="w-10 h-10 text-orange-300" />
          </div>
          <h2 className="text-lg font-black text-gray-700">No se pudo cargar el proyecto</h2>
          <p className="text-gray-400 text-sm max-w-xs">
            Verifica tu conexión a internet e intenta de nuevo.
          </p>
          {errorCarga && (
            <details className="text-left w-full max-w-sm">
              <summary className="text-xs text-gray-400 cursor-pointer">Ver detalle técnico</summary>
              <p className="text-xs text-red-400 mt-1 break-all bg-red-50 rounded p-2">{errorCarga}</p>
            </details>
          )}
          <button onClick={() => window.location.reload()}
            className="mt-2 bg-[#16a34a] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#064e1e] transition">
            🔄 Reintentar
          </button>
          <button onClick={() => router.push('/mis-proyectos')}
            className="text-sm text-[#16a34a] font-bold underline underline-offset-2">
            ← Volver a mis proyectos
          </button>
        </div>
      );
    }
  }

  if (!programa) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-white">Deportistas</span>
          {deportistas.length > 0 && (
            <span className="text-xs font-bold text-white/70 bg-white/20 px-2 py-0.5 rounded-full">{deportistas.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!esProfe && deportistas.length > 0 && (
            <button onClick={limpiar} className="w-9 h-9 flex items-center justify-center rounded-xl border border-red-200 text-red-400 hover:bg-red-50 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {!esProfe && (
            <button onClick={() => router.push('/alumnos/importar')}
              className="flex items-center gap-2 bg-white text-[#16a34a] px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-50 transition shadow-sm">
              <FileSpreadsheet className="w-4 h-4" /> Importar
            </button>
          )}
          <div className="text-right leading-tight border-l border-white/20 pl-3">
            <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
            <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {cargando ? (
          <BalonCargando />
        ) : deportistas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-5">
              <Users className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-lg font-black text-gray-700">Sin deportistas</h2>
            <p className="text-gray-400 text-sm mt-1 mb-6">Importa tu Excel para ver los programas</p>
            <button onClick={() => router.push('/alumnos/importar')}
              className="flex items-center gap-2 bg-[#16a34a] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#064e1e] transition">
              <FileSpreadsheet className="w-4 h-4" /> Importar Excel
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Deportistas', v: deportistas.length },
                { label: 'Programas',   v: programasSorted.length },
                { label: 'Proyectos',   v: Object.values(porPrograma).reduce((s, l) => s + new Set(l.map(d => colProy(d))).size, 0) },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-black text-gray-900">{s.v}</p>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {programasSorted.map(([nombre, lista]) => {
                const pal = palIdx(nombre, programasSorted);
                return (
                  <button key={nombre}
                    onClick={() => { setPrograma(nombre); setProy(null); setBusqueda(''); }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 text-left group overflow-hidden">
                    <div className={cn('bg-gradient-to-r p-5', pal.grad)}>
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                          <GraduationCap className="w-5 h-5 text-white" />
                        </div>
                        <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <h3 className="text-white font-black text-xl mt-4 leading-tight">{nombre}</h3>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                          {lista.length} deportistas
                        </span>
                        <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                          {new Set(lista.map(d => colProy(d))).size} proyectos
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <AvatarStack lista={lista} fotos={fotos} grad={pal.grad} />
                    </div>
                  </button>
                );
              })}

              {/* Tarjeta SIN PROYECTO */}
              {sinProy.length > 0 && (
                <button
                  onClick={() => { setPrograma(SIN_PROY_KEY); setProy(null); setBusqueda(''); }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 text-left group overflow-hidden">
                  <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] p-5">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <h3 className="text-white font-black text-xl mt-4 leading-tight">SIN PROYECTO</h3>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        {sinProy.length} deportistas
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <AvatarStack lista={sinProy} fotos={fotos} grad="from-[#064e1e] to-[#16a34a]" />
                  </div>
                </button>
              )}

              {/* Tarjeta RETIRADOS */}
              {retirados.length > 0 && (
                <button
                  onClick={() => { setPrograma(RETIRADOS_KEY); setProy(null); setBusqueda(''); }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 text-left group overflow-hidden">
                  <div className="bg-gradient-to-r from-gray-600 to-gray-500 p-5">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <h3 className="text-white font-black text-xl mt-4 leading-tight">RETIRADOS</h3>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        {retirados.length} deportistas
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <AvatarStack lista={retirados} fotos={fotos} grad="from-gray-600 to-gray-500" />
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );

  // ══ NIVEL SIN PROYECTO (tabla directa) ══════════════════════
  if (programa === SIN_PROY_KEY) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-2 sticky top-0 z-20">
        <button onClick={() => setPrograma(null)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-white/60 font-medium hidden sm:block">Programas</span>
        <ChevronRight className="w-3 h-3 text-white/30 hidden sm:block" />
        <span className="text-xs font-black px-3 py-1.5 rounded-full bg-green-100 text-green-900">SIN PROYECTO</span>
        <span className="ml-auto text-sm font-bold text-white/70">{sinProy.length} deportistas</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 shadow-sm mb-4">
          <Search className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
          <input type="text" placeholder="Buscar deportista..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="flex-1 text-xs focus:outline-none placeholder:text-gray-300"/>
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          )}
          <span className="text-xs text-gray-400 font-bold flex-shrink-0">
            {sinProy.filter(d => !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase())).length}/{sinProy.length}
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead className="sticky top-16 z-10">
                <tr style={{ background: '#16a34a' }}>
                  <th className="border border-white px-2 py-2 text-[10px] text-white/60 w-9 text-center select-none">#</th>
                  {['CÓDIGO','DEPORTISTA','PROGRAMA','AÑO','MES','DÍA','ESTADO'].map(h => (
                    <th key={h} className="border border-white px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">{h}</th>
                  ))}
                  <th className="border border-white px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">PROYECTO</th>
                </tr>
              </thead>
              <tbody>
                {sinProy
                  .filter(d => !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase()))
                  .map((dep, i) => {
                    const bg = '#f1f5f9';
                    const cod    = getCol(dep, /^c[oó]d/i);
                    const anio   = getCol(dep, /^a[ñn]o$/i);
                    const mes    = getCol(dep, /^mes$/i);
                    const dia    = getCol(dep, /^d[ií]a$/i);
                    const estado = colEstado(dep);
                    const prog   = colPrograma(dep);
                    const editVal = proyEdits[dep.id] ?? '';
                    const afilDep = colAfil(dep);
                    return (
                      <tr key={dep.id} style={{ background: bg }} className="hover:brightness-95 transition-all">
                        <td className="border border-white px-2 py-1.5 text-center text-[10px] font-bold text-[#111827] select-none">{i + 1}</td>
                        <td className="border border-white px-2 py-1.5 font-black text-white text-center" style={{ background: colorCodigo(afilDep) }}>{cod || '—'}</td>
                        <td className="border border-white px-2 py-1.5">
                          <span className="font-bold text-[#111827] cursor-pointer hover:underline"
                            onClick={() => router.push(`/alumnos/${dep.id}`)}>{dep._nombre}</span>
                        </td>
                        <td className="border border-white px-2 py-1.5 text-[#111827] text-[11px]">{prog}</td>
                        <td className="border border-white px-2 py-1.5 text-center text-[#111827]">{anio || '—'}</td>
                        <td className="border border-white px-2 py-1.5 text-[#111827]">{mes || '—'}</td>
                        <td className="border border-white px-2 py-1.5 text-center text-[#111827]">{dia || '—'}</td>
                        <td className="border border-white px-2 py-1.5">
                          {estado ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-900">{estado}</span>
                                  : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="border border-white px-2 py-1.5 min-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editVal}
                              onChange={e => setProyEdits(prev => ({ ...prev, [dep.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') guardarProy(dep.id, editVal); }}
                              placeholder="Nombre del proyecto..."
                              className="flex-1 text-[11px] border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 bg-white placeholder:text-gray-300 min-w-0"
                            />
                            <button
                              onClick={() => guardarProy(dep.id, editVal)}
                              disabled={!editVal.trim()}
                              className="flex-shrink-0 text-[10px] font-black px-2.5 py-1 rounded-lg bg-[#16a34a] hover:bg-[#064e1e] disabled:opacity-30 disabled:cursor-not-allowed text-white transition whitespace-nowrap">
                              ACTUALIZAR
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {sinProy.length === 0 && (
                  <tr><td colSpan={9} className="py-10 text-center text-sm text-gray-400">Sin deportistas en esta categoría</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-[#f1f5f9] border-t border-white px-4 py-1.5 text-[10px] font-semibold text-[#111827]">
            {sinProy.length} deportistas sin proyecto asignado
          </div>
        </div>
      </main>
    </div>
  );

  // ══ NIVEL RETIRADOS (tabla directa, sin proyectos) ═══════════
  if (programa === RETIRADOS_KEY) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-2 sticky top-0 z-20">
        <button onClick={() => setPrograma(null)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs text-white/60 font-medium hidden sm:block">Programas</span>
        <ChevronRight className="w-3 h-3 text-white/30 hidden sm:block" />
        <span className="text-xs font-black px-3 py-1.5 rounded-full bg-gray-200 text-gray-700">RETIRADOS</span>
        <span className="ml-auto text-sm font-bold text-white/70">{retirados.length} deportistas</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        {/* Búsqueda */}
        <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 shadow-sm mb-4">
          <Search className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
          <input type="text" placeholder="Buscar deportista..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="flex-1 text-xs focus:outline-none placeholder:text-gray-300"/>
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          )}
          <span className="text-xs text-gray-400 font-bold flex-shrink-0">
            {retirados.filter(d => !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase())).length}/{retirados.length}
          </span>
        </div>

        {/* Tabla retirados */}
        <div className="rounded-xl border border-gray-300 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead className="sticky top-16 z-10">
                <tr style={{ background: '#4B5563' }}>
                  <th className="border border-gray-500 px-2 py-2 text-[10px] text-white/40 w-9 text-center select-none">#</th>
                  {(['CÓDIGO','DEPORTISTA','PROYECTO','AÑO','MES','DÍA','ESTADO'] as const).map(h => (
                    <th key={h} className="border border-gray-500 px-3 py-2 font-black text-white text-[11px] tracking-wide whitespace-nowrap text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retirados
                  .filter(d => !busqueda || d._nombre.toLowerCase().includes(busqueda.toLowerCase()))
                  .map((dep, i) => {
                    const bg = i % 2 === 0 ? '#F3F4F6' : '#E5E7EB';
                    const cod  = getCol(dep, /^c[oó]d/i);
                    const anio = getCol(dep, /^a[ñn]o$/i);
                    const mes  = getCol(dep, /^mes$/i);
                    const dia  = getCol(dep, /^d[ií]a$/i);
                    return (
                      <tr key={dep.id} style={{ background: bg }} className="hover:brightness-95 transition-all">
                        <td className="border border-gray-300 px-2 py-1.5 text-center text-[10px] font-bold text-gray-400 select-none">{i + 1}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-gray-700">{cod || '—'}</td>
                        <td className="border border-gray-300 px-2 py-1.5">
                          <span className="font-bold text-gray-700 cursor-pointer hover:underline"
                            onClick={() => router.push(`/alumnos/${dep.id}`)}>{dep._nombre}</span>
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 text-gray-500">{colProy(dep)}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">{anio || '—'}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-gray-700">{mes || '—'}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">{dia || '—'}</td>
                        <td className="border border-gray-300 px-2 py-1.5">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{colEstado(dep)}</span>
                        </td>
                      </tr>
                    );
                  })}
                {retirados.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400">Sin retirados</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-200 border-t border-gray-300 px-4 py-1.5 text-[10px] font-semibold text-gray-500">
            {retirados.length} deportistas retirados
          </div>
        </div>
      </main>
    </div>
  );

  // ══ NIVEL 2: PROYECTOS ═══════════════════════════════════════
  const palProg = palIdx(programa, programasSorted);
  if (!proy) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => (esProfe || !!searchParams.get('proyecto')) ? router.push('/mis-proyectos') : setPrograma(null)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/60 font-medium hidden sm:block flex-shrink-0">{(esProfe || !!searchParams.get('proyecto')) ? 'Mis proyectos' : 'Programas'}</span>
          <ChevronRight className="w-3 h-3 text-white/30 hidden sm:block flex-shrink-0" />
          <span className={cn('text-xs font-black px-3 py-1.5 rounded-full flex-shrink-0', palProg.chip)}>{programa}</span>
        </div>
        <span className="text-sm font-bold text-white/70">{depPrograma.length} deportistas</span>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {(() => {
          // Agrupar proyectos por su sede principal (la más frecuente en el proyecto)
          // Función de orden numérico: extrae el primer número del nombre
          const numProy = (nombre: string) => {
            const m = nombre.match(/\d+/);
            return m ? parseInt(m[0], 10) : 9999;
          };
          const proyPorSede: Record<string, [string, Deportista[]][]> = {};
          proysSorted.forEach(entry => {
            const [, lista] = entry;
            const sedeCount: Record<string, number> = {};
            lista.forEach(d => { const s = colSede(d); sedeCount[s] = (sedeCount[s] || 0) + 1; });
            const sedePrincipal = Object.entries(sedeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sin sede';
            (proyPorSede[sedePrincipal] = proyPorSede[sedePrincipal] || []).push(entry);
          });
          // Ordenar proyectos dentro de cada sede numéricamente
          Object.values(proyPorSede).forEach(arr => {
            arr.sort((a, b) => numProy(a[0]) - numProy(b[0]) || a[0].localeCompare(b[0]));
          });
          const ORDEN_SEDES = ['santa monica','santa mónica','la 80','centro','niquia','niquía','sabaneta'];
          const sedeRank = (s: string) => {
            const idx = ORDEN_SEDES.findIndex(o => s.toLowerCase().includes(o));
            return idx >= 0 ? idx : 999;
          };
          const sedesSorted = Object.entries(proyPorSede).sort((a, b) => {
            const ra = sedeRank(a[0]), rb = sedeRank(b[0]);
            return ra !== rb ? ra - rb : a[0].localeCompare(b[0]);
          });
          let cardIdx = 0;
          return (
            <div className="space-y-8">
              <p className="text-sm font-semibold text-gray-400">
                {proysSorted.length} proyectos en <strong className="text-gray-600">{programa}</strong> · {sedesSorted.length} sedes
              </p>
              {sedesSorted.map(([sede, proyDeSede]) => (
                <section key={sede}>
                  {/* Encabezado de sede */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500 bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200">
                      📍 {sede}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">{proyDeSede.reduce((s, [, l]) => s + l.length, 0)} deportistas</span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {proyDeSede.map(([nombre, lista]) => {
                      const pal = PALETA[cardIdx++ % PALETA.length];
                      return (
                        <TarjetaProyecto
                          key={nombre}
                          nombre={nombre}
                          lista={lista}
                          programa={programa!}
                          pal={pal}
                          fotos={fotos}
                          fotosProfe={fotosProfe}
                          onClick={() => { setProy(nombre); setBusqueda(''); }}
                          onFotoProfe={guardarFotoProfe}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          );
        })()}
      </main>
    </div>
  );

  // ══ NIVEL 3: DASHBOARD DEL PROYECTO (tabla) ═════════════════
  const palProy   = PALETA[Math.max(0, proysSorted.findIndex(([n]) => n === proy)) % PALETA.length] ?? PALETA[0];
  const listaProy = porProy[proy] ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center gap-2 sticky top-0 z-20">
        <button onClick={() => (esProfe || !!searchParams.get('proyecto')) ? router.push('/mis-proyectos') : setProy(null)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0"
          title="Atrás">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {(esProfe || !!searchParams.get('proyecto')) && (
          <button onClick={() => router.push('/mis-proyectos')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition flex-shrink-0"
            title="Inicio – Mis Proyectos">
            <Home className="w-4 h-4" />
          </button>
        )}
        <span className="text-xs text-white/60 hidden sm:block">{programa}</span>
        <ChevronRight className="w-3 h-3 text-white/30 hidden sm:block" />
        <span className={cn('text-xs font-black px-2.5 py-1 rounded-full', palProy.chip)}>{proy}</span>
        {(esProfe || !!searchParams.get('proyecto')) && proy && (
          <button
            onClick={() => router.push(`/asistencia?proyecto=${encodeURIComponent(proy)}`)}
            className="ml-auto flex items-center gap-1.5 bg-white text-[#16a34a] px-3 py-1.5 rounded-xl text-xs font-black hover:bg-green-50 transition shadow-sm whitespace-nowrap">
            <ClipboardList className="w-3.5 h-3.5" />
            GESTIONAR ASISTENCIA
          </button>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        <DashboardProyecto
          proy={proy}
          lista={listaProy}
          programa={programa!}
          pal={palProy}
          fotos={fotos}
          fotosProfe={fotosProfe}
          esProfe={esProfe}
          onFotoProfe={guardarFotoProfe}
          onVerPerfil={id => router.push(`/alumnos/${id}`)}
          onPosicion={handlePosicion}
        />
      </main>
    </div>
  );
}

export default function AlumnosPage() {
  return (
    <Suspense>
      <AlumnosPageContent />
    </Suspense>
  );
}
