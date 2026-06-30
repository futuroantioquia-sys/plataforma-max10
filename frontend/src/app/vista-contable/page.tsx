'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Upload } from 'lucide-react';
import type { Deportista } from '@/lib/deportistas';
import { DEPORTISTAS_KEY, VC_KEY } from '@/lib/deportistas';

/* ── Columnas ANTES de Código ── */
const COLS_ANTES = [
  { key: 'fechaAfil', label: 'FECHA AFIL.',  minW: 110 },
  { key: 'tipoAfil',  label: 'TIPO AFIL.',   minW: 110 },
  { key: 'programa',  label: 'PROGRAMA',     minW: 115 },
  { key: 'estado',    label: 'ESTADO',       minW: 90  },
];

/* ── Columnas DESPUÉS de Nombre (sin SEDE) ── */
const COLS_DESPUES = [
  { key: 'anoNac',   label: 'AÑO NAC.',  minW: 82  },
  { key: 'proyecto', label: 'PROYECTO',  minW: 120 },
];

/* ── Valores monetarios + PAZ Y SALVO ── */
const COLS_VALORES = [
  { key: 'matricula', label: 'MATRÍCULA',            tipo: 'peso'  },
  { key: 'feb',       label: 'FEB',                  tipo: 'peso'  },
  { key: 'mar',       label: 'MAR',                  tipo: 'peso'  },
  { key: 'abr',       label: 'ABR',                  tipo: 'peso'  },
  { key: 'may',       label: 'MAY',                  tipo: 'peso'  },
  { key: 'jun',       label: 'JUN',                  tipo: 'peso'  },
  { key: 'jul',       label: 'JUL',                  tipo: 'peso'  },
  { key: 'ago',       label: 'AGO',                  tipo: 'peso'  },
  { key: 'sep',       label: 'SEP',                  tipo: 'peso'  },
  { key: 'oct',       label: 'OCT',                  tipo: 'peso'  },
  { key: 'nov',       label: 'NOV',                  tipo: 'peso'  },
  { key: 'dic',       label: 'DIC',                  tipo: 'peso'  },
  { key: 'pazSalvo',  label: 'PAZ Y SALVO 1ER SEM',  tipo: 'texto' },
];

type FilaVC = Record<string, string>;

/* ── Helpers ── */

// Fecha robusta: serial Excel, ISO, o DD/MM/AAAA
function displayFecha(v: string): string {
  if (!v) return '';
  const num = Number(v);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${date.getUTCDate().toString().padStart(2,'0')}/${(date.getUTCMonth()+1).toString().padStart(2,'0')}/${date.getUTCFullYear()}`;
  }
  const iso = v.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return v;
}

// Mostrar valor monetario con $
function displayPeso(v: string): string {
  if (!v) return '';
  if (v.startsWith('$')) return v;
  const n = parseFloat(v.replace(/[^0-9.,]/g,'').replace(',','.'));
  if (isNaN(n) || n < 100) return v;
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g,'.');
}

// Sumar columna peso
function sumarCol(filas: FilaVC[], key: string): number {
  return filas.reduce((s, f) => {
    const n = parseFloat((f[key] || '').replace(/[^0-9.,]/g,'').replace(',','.'));
    return s + (isNaN(n) ? 0 : n);
  }, 0);
}
function fmtTotal(n: number) {
  return n > 0 ? '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g,'.') : '';
}

// Color ESTADO
function chipEstado(e: string) {
  const v = e.toLowerCase();
  if (v.includes('activ'))                          return { bg:'#dcfce7', color:'#166534', border:'#86efac' };
  if (v.includes('retir') || v.includes('inactiv')) return { bg:'#fee2e2', color:'#991b1b', border:'#fca5a5' };
  return { bg:'#f3f4f6', color:'#374151', border:'#d1d5db' };
}

// Chip PAZ Y SALVO
function chipPaz(v: string) {
  const u = v.toUpperCase();
  if (!v) return null;
  if (u === 'SI' || u === 'SÍ' || u.includes('AL DÍA') || u.includes('AL DIA') || u.includes('PAZ'))
    return { bg:'#dcfce7', color:'#166534', border:'#86efac' };
  if (u === 'NO' || u.includes('PEND') || u.includes('MORA') || u.includes('DEBER'))
    return { bg:'#fee2e2', color:'#991b1b', border:'#fca5a5' };
  return { bg:'#fef9c3', color:'#854d0e', border:'#fde68a' };
}

// Buscar columna del deportista
function getCol(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k));
  return k ? dep._columnas[k] : '';
}
function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas).find(k => /^c[oó]d/i.test(k));
  return k ? dep._columnas[k] : '';
}

export default function VistaContablePage() {
  const router = useRouter();

  const [filas,    setFilas]    = useState<FilaVC[]>([]);
  const [programa, setPrograma] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [estado,   setEstado]   = useState('');
  const [busqueda, setBusqueda] = useState('');

  /* ── Cargar y enriquecer con datos de la plataforma ── */
  useEffect(() => {
    try {
      const rawVC  = localStorage.getItem(VC_KEY);
      if (!rawVC) return;
      const parsed: FilaVC[] = JSON.parse(rawVC);

      // Enriquecer con datos de deportistas en plataforma
      try {
        const rawDep = localStorage.getItem(DEPORTISTAS_KEY);
        if (rawDep) {
          const deps: Deportista[] = JSON.parse(rawDep);
          const enriquecidas = parsed.map(fila => {
            const dep = deps.find(d => {
              const cod = codigoDe(d);
              return (fila.codigo && cod && cod.toLowerCase() === fila.codigo.toLowerCase()) ||
                     (fila.nombre && d._nombre.toLowerCase() === fila.nombre.toLowerCase());
            });
            if (!dep) return fila;
            return {
              ...fila,
              tipoAfil: fila.tipoAfil || getCol(dep, /tipo.*afil|afil.*tipo|tipo.*mat/i),
              estado:   fila.estado   || getCol(dep, /^estado/i),
              anoNac:   fila.anoNac   || getCol(dep, /^a[ñn]o/i),
              proyecto: fila.proyecto || getCol(dep, /^proy/i),
            };
          });
          setFilas(enriquecidas);
          return;
        }
      } catch {}

      setFilas(parsed);
    } catch {}
  }, []);

  /* Filtros */
  const programas = useMemo(() => [...new Set(filas.map(f => f.programa).filter(Boolean))].sort(), [filas]);
  const estados   = useMemo(() => [...new Set(filas.map(f => f.estado).filter(Boolean))].sort(),   [filas]);
  const proyectos = useMemo(() => [...new Set(
    filas.filter(f => !programa || f.programa === programa).map(f => f.proyecto).filter(Boolean)
  )].sort(), [filas, programa]);

  const filtradas = useMemo(() => filas.filter(f => {
    if (programa && f.programa !== programa) return false;
    if (proyecto && f.proyecto !== proyecto) return false;
    if (estado   && f.estado   !== estado)   return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return Object.values(f).some(v => v.toLowerCase().includes(q));
    }
    return true;
  }), [filas, programa, proyecto, estado, busqueda]);

  const BL   = '#4b5563';
  const G    = '#16a34a';
  const BW   = '2px solid white';
  const W_NUM = 40;
  const W_COD = 80;
  const W_NOM = 200;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-vc" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-vc)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <h1 className="text-white font-black text-lg">Vista Contable</h1>
          <p className="text-white/60 text-xs">Valores cargados · {new Date().getFullYear()}</p>
        </div>
        <div className="flex items-center gap-3 relative">
          {filas.length > 0 && (
            <span className="bg-white/20 text-white font-bold text-xs px-2.5 py-1 rounded-full">
              {filtradas.length}/{filas.length}
            </span>
          )}
          <button onClick={() => router.push('/pagos/importar-valores')}
            className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition">
            <Upload className="w-3.5 h-3.5" /> Cargar archivo
          </button>
          <div className="text-right leading-tight border-l border-white/30 pl-3">
            <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
            <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      {/* SIN DATOS */}
      {filas.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-blue-300" />
          </div>
          <div className="text-center max-w-xs">
            <h2 className="font-black text-[#1e3a8a] text-lg mb-1">Sin datos contables</h2>
            <p className="text-gray-400 text-sm mb-4">
              Sube el archivo <strong>VISTA CONTABLE</strong> para ver la información aquí.
            </p>
            <button onClick={() => router.push('/pagos/importar-valores')}
              className="bg-[#1e3a8a] text-white rounded-xl px-5 py-2.5 font-bold text-sm flex items-center gap-2 mx-auto hover:bg-[#1e3a5a] transition">
              <Upload className="w-4 h-4" /> Cargar archivo Excel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* FILTROS */}
          <div className="px-4 py-3 bg-white border-b border-gray-100 shadow-sm flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Buscar</p>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Nombre, código..."
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-blue-400 w-40"/>
            </div>
            {[
              { label:'Programa', val:programa, set:(v:string)=>{setPrograma(v);setProyecto('');}, opts:programas },
              { label:'Proyecto', val:proyecto, set:setProyecto, opts:proyectos },
              { label:'Estado',   val:estado,   set:setEstado,   opts:estados   },
            ].map(f => (
              <div key={f.label}>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{f.label}</p>
                <select value={f.val} onChange={e => f.set(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white min-w-[110px]">
                  <option value="">Todos</option>
                  {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div className="ml-auto text-right">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Deportistas</p>
              <p className="text-xl font-black text-[#1e3a8a]">{filtradas.length}</p>
            </div>
          </div>

          {/* TABLA */}
          <main className="px-3 py-3">
            <div className="overflow-auto rounded-2xl shadow border border-gray-200"
              style={{ maxHeight: 'calc(100vh - 220px)' }}>
              <table className="border-collapse text-xs" style={{ minWidth: 1600 }}>

                <thead className="sticky top-0 z-20">
                  <tr>
                    {/* # sticky */}
                    <th rowSpan={2} style={{
                      background:G, color:'white', border:BW,
                      padding:'8px 6px', textAlign:'center', fontWeight:900, fontSize:10,
                      minWidth:W_NUM, position:'sticky', left:0, zIndex:30,
                    }}>#</th>

                    {/* Antes de código */}
                    {COLS_ANTES.map(c => (
                      <th key={c.key} rowSpan={2} style={{
                        background:G, color:'white', border:BW,
                        padding:'8px 8px', textAlign:'center', fontWeight:900,
                        fontSize:10, minWidth:c.minW,
                      }}>{c.label}</th>
                    ))}

                    {/* CÓDIGO sticky */}
                    <th rowSpan={2} style={{
                      background:G, color:'white', border:BW,
                      padding:'8px 8px', textAlign:'center', fontWeight:900,
                      fontSize:10, minWidth:W_COD,
                      position:'sticky', left:W_NUM, zIndex:30,
                    }}>CÓDIGO</th>

                    {/* NOMBRE sticky */}
                    <th rowSpan={2} style={{
                      background:G, color:'white', border:BW,
                      padding:'8px 10px', textAlign:'left', fontWeight:900,
                      fontSize:10, minWidth:W_NOM,
                      position:'sticky', left:W_NUM+W_COD, zIndex:30,
                    }}>NOMBRE DEL DEPORTISTA</th>

                    {/* Después de nombre */}
                    {COLS_DESPUES.map(c => (
                      <th key={c.key} rowSpan={2} style={{
                        background:G, color:'white', border:BW,
                        padding:'8px 8px', textAlign:'center', fontWeight:900,
                        fontSize:10, minWidth:c.minW,
                      }}>{c.label}</th>
                    ))}

                    {/* Grupo VALORES — título de sección → gris */}
                    <th colSpan={COLS_VALORES.length} style={{
                      background:'#4b5563', color:'white', border:BW,
                      padding:'6px 10px', textAlign:'center', fontWeight:900,
                      fontSize:10, letterSpacing:'0.06em',
                    }}>VALORES CARGADOS {new Date().getFullYear()}</th>
                  </tr>
                  <tr>
                    {COLS_VALORES.map(c => (
                      <th key={c.key} style={{
                        background: c.key==='pazSalvo' ? '#4b5563' : G,
                        color:'white', border:BW,
                        padding:'6px 5px', textAlign:'center', fontWeight:900,
                        fontSize:c.key==='pazSalvo' ? 9 : 10,
                        minWidth: c.key==='pazSalvo' ? 130 : 82,
                        whiteSpace: c.key==='pazSalvo' ? 'normal' : 'nowrap',
                      }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filtradas.map((f, idx) => {
                    const bg  = '#f1f5f9';
                    const est = chipEstado(f.estado || '');

                    return (
                      <tr key={idx}>
                        {/* # */}
                        <td style={{
                          background:'#f1f5f9', color:'#111827', border:BW,
                          padding:'6px 6px', textAlign:'center', fontWeight:700,
                          position:'sticky', left:0, zIndex:10,
                        }}>{idx+1}</td>

                        {/* Antes */}
                        {COLS_ANTES.map(c => {
                          if (c.key === 'fechaAfil') return (
                            <td key={c.key} style={{
                              background:bg, color:'#374151', border:'2px solid white',
                              padding:'6px 8px', textAlign:'center', whiteSpace:'nowrap', fontWeight:600,
                            }}>{displayFecha(f.fechaAfil)}</td>
                          );
                          if (c.key === 'estado' && f.estado) return (
                            <td key={c.key} style={{
                              background:bg, border:'2px solid white',
                              padding:'4px 6px', textAlign:'center',
                            }}>
                              <span style={{
                                background:est.bg, color:est.color, border:`1px solid ${est.border}`,
                                padding:'2px 7px', borderRadius:4, fontWeight:700, fontSize:10, whiteSpace:'nowrap',
                              }}>{f.estado}</span>
                            </td>
                          );
                          return (
                            <td key={c.key} style={{
                              background:bg, color:'#374151', border:'2px solid white',
                              padding:'6px 8px', textAlign:'center', whiteSpace:'nowrap',
                            }}>{f[c.key] || ''}</td>
                          );
                        })}

                        {/* CÓDIGO sticky */}
                        <td style={{
                          background:G, color:'white', border:BW,
                          padding:'6px 8px', textAlign:'center', fontWeight:900, fontSize:12,
                          position:'sticky', left:W_NUM, zIndex:10,
                        }}>{f.codigo || '—'}</td>

                        {/* NOMBRE sticky */}
                        <td style={{
                          background:bg, color:'#111827', border:'2px solid white',
                          padding:'6px 10px', fontWeight:700, fontSize:12,
                          position:'sticky', left:W_NUM+W_COD, zIndex:10, whiteSpace:'nowrap',
                        }}>{f.nombre || '—'}</td>

                        {/* Después */}
                        {COLS_DESPUES.map(c => (
                          <td key={c.key} style={{
                            background:bg, color:'#374151', border:'2px solid white',
                            padding:'6px 8px', textAlign:'center', whiteSpace:'nowrap',
                          }}>{f[c.key] || ''}</td>
                        ))}

                        {/* Valores */}
                        {COLS_VALORES.map(c => {
                          if (c.tipo === 'texto') {
                            const val = f[c.key] || '';
                            const pz  = chipPaz(val);
                            // Rojo solo cuando hay texto negativo (NO, PEND, MORA, etc.)
                            const esSinPaz = !!val && pz?.bg === '#fee2e2';
                            const cellBg   = esSinPaz ? '#fca5a5' : (pz?.bg === '#dcfce7' ? '#dcfce7' : bg);
                            return (
                              <td key={c.key} style={{
                                background: cellBg, border:'2px solid white',
                                padding:'4px 6px', textAlign:'center',
                              }}>
                                {val
                                  ? <span style={{ fontWeight:700, fontSize:10, whiteSpace:'nowrap',
                                      color: esSinPaz ? '#991b1b' : (pz?.color ?? '#374151'),
                                    }}>{val}</span>
                                  : null
                                }
                              </td>
                            );
                          }
                          const v = displayPeso(f[c.key] || '');
                          return (
                            <td key={c.key} style={{
                              background: c.key==='matricula' && v ? '#bbf7d0' : bg,
                              color: c.key==='matricula' && v ? '#166534' : '#111827',
                              border:'2px solid white',
                              padding:'6px 6px', textAlign:'right',
                              fontWeight: v ? 700 : 400, whiteSpace:'nowrap',
                            }}>{v}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>

                {/* TOTALES */}
                <tfoot className="sticky bottom-0 z-20">
                  <tr>
                    <td style={{background:BL,border:BW,padding:'8px 6px',position:'sticky',left:0,zIndex:15}}/>
                    {COLS_ANTES.map(c => <td key={c.key} style={{background:BL,border:BW,padding:'8px 6px'}}/>)}
                    <td style={{
                      background:G, color:'white', border:BW, padding:'8px 8px',
                      textAlign:'center', fontWeight:900, fontSize:10,
                      position:'sticky', left:W_NUM, zIndex:15,
                    }}>{filtradas.length}</td>
                    <td style={{
                      background:BL, color:'white', border:BW, padding:'8px 10px',
                      fontWeight:900, fontSize:10,
                      position:'sticky', left:W_NUM+W_COD, zIndex:15,
                    }}>TOTAL ({filtradas.length} deportistas)</td>
                    {COLS_DESPUES.map(c => <td key={c.key} style={{background:BL,border:BW,padding:'8px 6px'}}/>)}
                    {COLS_VALORES.map(c => (
                      <td key={c.key} style={{
                        background: c.key==='matricula'||c.key==='pazSalvo' ? G : BL,
                        color:'white', border:BW,
                        padding:'8px 6px', textAlign:'right',
                        fontWeight:900, fontSize:11,
                      }}>
                        {c.tipo==='texto' ? '' : fmtTotal(sumarCol(filtradas, c.key))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-center text-[11px] text-gray-400 mt-3">
              {filtradas.length} de {filas.length} deportistas · Archivo VISTA CONTABLE
            </p>
          </main>
        </>
      )}
    </div>
  );
}
