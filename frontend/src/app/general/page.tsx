'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Users, Save, CheckCircle, Columns3, Upload, X, Trophy, AlertCircle, Trash2 } from 'lucide-react';
import { getDeportistas, saveDeportistas, deleteAllDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { BalonCargando } from '@/components/BalonCargando';

// ── Regex reutilizable para columna de proyecto ───────────────
const RX_PROY = /proyecto|^proy\b/i;

// ── Orden de programas en la tabla ────────────────────────────
const ORDEN_PROGRAMA = [
  'Estimulación', 'Formación', 'Progresión',
  'Pre-Progresión', 'Selección', 'Desarrollo',
];

// ── Columnas con desplegable (opciones auto-generadas del Excel) ─
const SELECTS_RX: RegExp[] = [
  /tipo.*afil|afil.*tipo/i,
  /^program/i,
  /^estado$/i,
];

// ── Convierte serial de Excel a fecha legible ─────────────────
function serialAFecha(val: string): string {
  const n = Number(String(val).trim());
  if (!val || isNaN(n) || n < 30000 || n > 60000) return val;
  try {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return val; }
}

function esFechaAfil(col: string) { return /fecha.*afil|afil.*fecha|fecha_afil/i.test(col.trim()); }
function esCodigo(col: string)    { return /^c[oó]d/i.test(col.trim()); }
function esTipoAfil(col: string)  { return !esFechaAfil(col) && /tipo.*afil|^afil/i.test(col.trim()); }

function prioridadCodigo(cod: number): number {
  if (cod >= 26000 && cod <= 26999) return 1;
  if (cod >= 25000 && cod <= 25999) return 2;
  if (cod >= 24000 && cod <= 24999) return 3;
  if (cod >= 23000 && cod <= 23999) return 4;
  if (cod >= 22000 && cod <= 22999) return 5;
  if (cod >= 21000 && cod <= 21999) return 6;
  if (cod >= 2000  && cod <= 2999)  return 7;
  if (cod >= 9000  && cod <= 9999)  return 8;
  if (cod >= 8000  && cod <= 8999)  return 9;
  if (cod >= 7000  && cod <= 7999)  return 10;
  if (cod >= 6000  && cod <= 6999)  return 11;
  if (cod >= 5000  && cod <= 5999)  return 12;
  if (cod >= 4000  && cod <= 4999)  return 13;
  return 99;
}

function colorCodigo(afil: string): string {
  const v = afil.toLowerCase();
  if (v.includes('nuevo'))     return '#f97316'; // Naranja
  if (v.includes('antigu'))    return '#16a34a'; // Verde
  if (v.includes('reingreso')) return '#2563eb'; // Azul
  if (v.includes('mb instit')) return '#374151'; // Gris oscuro
  if (v.includes('b instit'))  return '#7c3aed'; // Morado
  return '#6b7280';
}

/** Prioridad de orden: Nuevo→Antiguo→Reingreso→MB Inst→B Inst */
function ordenAfil(dep: Deportista): number {
  const v = getColVal(dep, /tipo.*afil|^afil/i).toLowerCase();
  if (v.includes('nuevo'))     return 1;
  if (v.includes('antigu'))    return 2;
  if (v.includes('reingreso')) return 3;
  if (v.includes('mb instit')) return 4;
  if (v.includes('b instit'))  return 5;
  return 6;
}

function getColVal(dep: Deportista, rx: RegExp): string {
  const k = Object.keys(dep._columnas).find(k => rx.test(k.trim()));
  return k ? (dep._columnas[k] ?? '') : '';
}

function ordenPrograma(prog: string) {
  const i = ORDEN_PROGRAMA.findIndex(p => p.toLowerCase() === prog.trim().toLowerCase());
  return i >= 0 ? i : ORDEN_PROGRAMA.length;
}
function esRetirado(dep: Deportista) { return /retir/i.test(getColVal(dep, /^estado$/i)); }
function grupoDep(dep: Deportista): string {
  if (esRetirado(dep)) return '__RETIRADO__';
  return getColVal(dep, /^program/i).trim() || '__SIN_PROGRAMA__';
}

const COLOR_GRUPO: Record<string, string> = {
  'Estimulación':     'bg-[#4b5563]',
  'Formación':        'bg-[#4b5563]',
  'Progresión':       'bg-[#4b5563]',
  'Pre-Progresión':   'bg-[#4b5563]',
  'Selección':        'bg-[#4b5563]',
  'Desarrollo':       'bg-[#4b5563]',
  '__SIN_PROGRAMA__': 'bg-[#4b5563]',
  '__RETIRADO__':     'bg-[#4b5563]',
};
const LABEL_GRUPO: Record<string, string> = {
  '__SIN_PROGRAMA__': 'SIN PROYECTO',
  '__RETIRADO__':     'RETIRADOS',
};

// Claves virtuales para columnas que no vienen del Excel
const VTC  = '__COMPETENCIA__';
const VT1  = '__TORNEO1__';
const VT2  = '__TORNEO2__';
const VT3  = '__TORNEO3__';
const VT4  = '__TORNEO4__';
const VPOS = '__POSICION__';

// Etiquetas de columna — renombra COMPITE → TORNEO 1, muestra labels de virtuales
function labelCol(col: string): string {
  if (/^compite$/i.test(col.trim())) return 'TORNEO 1';
  if (col === VTC)  return 'COMPETENCIA';
  if (col === VT1)  return 'TORNEO 1';
  if (col === VT2)  return 'TORNEO 2';
  if (col === VT3)  return 'TORNEO 3';
  if (col === VT4)  return 'TORNEO 4';
  if (col === VPOS) return 'POSICIÓN';
  return col.toUpperCase();
}

// ─────────────────────────────────────────────────────────────
export default function GeneralPage() {
  const router = useRouter();

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const [edits,       setEdits]       = useState<Record<string, Record<string, string>>>({});
  const [buscar,      setBuscar]      = useState('');
  const [buscarCod,   setBuscarCod]   = useState('');
  const [guardado,    setGuardado]    = useState(false);
  const COL_WIDTHS_KEY   = 'futuro_vg_col_widths';
  const COL_VISIBLE_KEY  = 'futuro_vg_col_visible';

  const [colWidths,      setColWidths]      = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) ?? '{}'); } catch { return {}; }
  });
  const [colVisible,     setColVisible]     = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_VISIBLE_KEY) ?? '{}') as Record<string, boolean>;
      // Nunca ocultar columnas de nombre/deportista
      const RX_NOMBRE = /deportista|alumno|jugador|atleta|^nombre/i;
      Object.keys(saved).forEach(k => {
        if (RX_NOMBRE.test(k.trim())) delete saved[k];
      });
      return saved;
    } catch { return {}; }
  });
  const [panelColumnas,  setPanelColumnas]  = useState(false);
  const [resizingActive, setResizingActive] = useState<string | null>(null);
  const [programaFiltro, setProgramaFiltro] = useState<string | null>(null);
  const [proyectoFiltro, setProyectoFiltro] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Importar Torneos ─────────────────────────────────────────
  type FilaTorneo = { codigo: string; nombre: string; competencia: string; t1: string; t2: string; t3: string; t4: string; depId: string | null; match: 'codigo' | 'nombre' | null };
  const [modalTorneo,   setModalTorneo]   = useState(false);
  const [torneoFilas,   setTorneoFilas]   = useState<FilaTorneo[]>([]);
  const [torneoPaso,    setTorneoPaso]    = useState<'subir' | 'preview' | 'listo'>('subir');
  const [torneoProc,    setTorneoProc]    = useState(false);
  const [torneoArrastr, setTorneoArrastr] = useState(false);
  const [borrando,      setBorrando]      = useState(false);
  const [cargando,      setCargando]      = useState(true);

  // ── Subir Nuevos Deportistas ─────────────────────────────────
  type NuevoReg = { _nombre: string; _columnas: Record<string,string>; duplicado: boolean };
  const [modalNuevos,  setModalNuevos]  = useState(false);
  const [nuevosPaso,   setNuevosPaso]   = useState<'subir'|'preview'|'listo'>('subir');
  const [nuevosFilas,  setNuevosFilas]  = useState<NuevoReg[]>([]);
  const [nuevosProc,   setNuevosProc]   = useState(false);
  const [ultimoLote,   setUltimoLote]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('futuro_ultimo_lote') ?? '[]'); } catch { return []; }
  });
  const nuevosInputRef = useRef<HTMLInputElement>(null);

  async function eliminarYReimportar() {
    if (!confirm('¿Eliminar TODOS los deportistas y volver a importar desde Excel?\n\nEsta acción no se puede deshacer.')) return;
    setBorrando(true);
    try {
      await deleteAllDeportistas();
      router.push('/alumnos/importar');
    } catch {
      alert('Error al eliminar. Intenta de nuevo.');
      setBorrando(false);
    }
  }
  const torneoInputRef = useRef<HTMLInputElement>(null);

  // Cerrar panel al hacer clic fuera
  useEffect(() => {
    if (!panelColumnas) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setPanelColumnas(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelColumnas]);

  // Guardar anchos y visibilidad en localStorage
  useEffect(() => {
    try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths)); } catch {}
  }, [colWidths]);
  useEffect(() => {
    try { localStorage.setItem(COL_VISIBLE_KEY, JSON.stringify(colVisible)); } catch {}
  }, [colVisible]);

  function toggleColVisible(col: string) {
    setColVisible(prev => ({ ...prev, [col]: !(prev[col] ?? true) }));
  }
  function mostrarTodas() {
    setColVisible({});
    try { localStorage.removeItem(COL_VISIBLE_KEY); } catch {}
  }
  // ── Resize de columnas ────────────────────────────────────────
  const resizingCol  = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current  = col;
    resizeStartX.current = e.clientX;
    resizeStartW.current = colWidths[col] ?? 110;
    setResizingActive(col);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const newW = Math.max(40, resizeStartW.current + (ev.clientX - resizeStartX.current));
      setColWidths(prev => ({ ...prev, [resizingCol.current!]: newW }));
    };
    const onUp = () => {
      resizingCol.current = null;
      setResizingActive(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  function resetColWidths() {
    setColWidths({});
    try { localStorage.removeItem(COL_WIDTHS_KEY); } catch {}
  }

  useEffect(() => {
    getDeportistas().then(lista => {
      setCargando(false);
      if (!lista.length) return;
      let cambiado = false;
      const actualizados = lista.map(dep => {
        const keySede     = Object.keys(dep._columnas).find(k => /sede/i.test(k.trim()));
        const keyPrograma = Object.keys(dep._columnas).find(k => /^program/i.test(k.trim()));
        if (!keySede || !keyPrograma) return dep;
        const prog = (dep._columnas[keyPrograma] ?? '').trim();
        const sede = (dep._columnas[keySede] ?? '').trim();
        if (/^(desarrollo|selecci[oó]n)$|desarrollo.*selecc|selecc.*desarrollo/i.test(prog) && sede !== 'INSTITUCIONAL') {
          cambiado = true;
          return { ...dep, _columnas: { ...dep._columnas, [keySede]: 'INSTITUCIONAL' } };
        }
        return dep;
      });
      if (cambiado) saveDeportistas(actualizados);
      setDeportistas(actualizados);
    });
  }, []);

  // ── Columnas ordenadas: FECHA AFIL → CÓD → resto (DIA → PROYECTO → PROFE) ──
  const columnas = useMemo<string[]>(() => {
    if (!deportistas.length) return [];
    let ref = deportistas[0];
    deportistas.forEach(d => {
      if (Object.keys(d._columnas).length > Object.keys(ref._columnas).length) ref = d;
    });
    const todas = Object.keys(ref._columnas);
    const fecha      = todas.filter(c => esFechaAfil(c));
    const tipoAfil   = todas.filter(c => esTipoAfil(c));
    const estado     = todas.filter(c => /^estado$/i.test(c.trim()));  // ESTADO después de TIPO AFIL
    const cod        = todas.filter(c => esCodigo(c));
    const proyecto   = todas.filter(c => /proyecto|^proy\b/i.test(c.trim()));
    const profe      = todas.filter(c => /^prof|\bprofe\b/i.test(c.trim()));
    const compite     = todas.filter(c => /^compite$/i.test(c.trim()));
    const competencia = todas.filter(c => /^competencia$/i.test(c.trim()));
    const torneo2     = todas.filter(c => /torneo.?2/i.test(c.trim()));
    const torneo3     = todas.filter(c => /torneo.?3/i.test(c.trim()));
    const torneo4     = todas.filter(c => /torneo.?4/i.test(c.trim()));
    // Excluir la clave virtual POSICIÓN del bloque "resto" (la colocamos al final)
    const excluidas = new Set([
      ...fecha, ...tipoAfil, ...estado, ...cod, ...proyecto, ...profe,
      ...compite, ...competencia, ...torneo2, ...torneo3, ...torneo4,
      VPOS,
    ]);
    const resto    = todas.filter(c => !excluidas.has(c));

    // Columnas de torneo siempre presentes: COMPETENCIA → T1 → T2 → T3 → T4 → POSICIÓN
    const torneos = [
      ...(competencia.length ? competencia : [VTC]),
      ...(compite.length ? compite : [VT1]),
      ...(torneo2.length ? torneo2 : [VT2]),
      ...(torneo3.length ? torneo3 : [VT3]),
      ...(torneo4.length ? torneo4 : [VT4]),
      VPOS,
    ];

    // Insertar PROYECTO → PROFE → TORNEOS justo después de la columna DIA
    const idxDia = resto.findIndex(c => /^d[ií]a$/i.test(c.trim()));
    if (idxDia >= 0) {
      resto.splice(idxDia + 1, 0, ...proyecto, ...profe, ...torneos);
    } else {
      resto.push(...proyecto, ...profe, ...torneos);
    }

    // Garantía final: si PROFE aparece antes que PROYECTO en el array resultado,
    // mover PROFE a después de PROYECTO (por si los nombres no coincidían con regex)
    const finalArr = [...fecha, ...tipoAfil, ...estado, ...cod, ...resto];
    const iProy = finalArr.findIndex(c => /proyecto|proy/i.test(c.trim()));
    const iProf = finalArr.findIndex(c => /^prof|\bprofe\b/i.test(c.trim()));
    if (iProy > -1 && iProf > -1 && iProf < iProy) {
      const [colProf] = finalArr.splice(iProf, 1);
      const newIProy  = finalArr.findIndex(c => /proyecto|proy/i.test(c.trim()));
      finalArr.splice(newIProy + 1, 0, colProf);
    }
    return finalArr;
  }, [deportistas]);

  // DEPORTISTA/NOMBRE/ALUMNO/JUGADOR/ATLETA nunca se ocultan (columna crítica)
  const RX_NOMBRE_COL = /deportista|alumno|jugador|atleta|^nombre/i;
  const colVisibles   = columnas.filter(c => RX_NOMBRE_COL.test(c.trim()) || colVisible[c] !== false);
  const ocultasCount = columnas.length - colVisibles.length;

  // ── Proyectos disponibles por programa ───────────────────────
  const proyectosPorPrograma = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, Set<string>> = {};
    deportistas.forEach(dep => {
      const prog = getColVal(dep, /^program/i).trim();
      const proy = getColVal(dep, RX_PROY).trim();
      if (proy) {
        const key = prog || '__SIN_PROGRAMA__';
        if (!map[key]) map[key] = new Set();
        map[key].add(proy);
      }
    });
    const result: Record<string, string[]> = {};
    Object.entries(map).forEach(([k, s]) => { result[k] = Array.from(s).sort(); });
    return result;
  }, [deportistas]);

  // ── Columna PROGRAMA (nombre real en el Excel) ────────────────
  const colPrograma = useMemo(
    () => columnas.find(c => /^program/i.test(c.trim())) ?? '',
    [columnas]
  );

  // ── Opciones únicas por columna select ───────────────────────
  const opcionesCol = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, Set<string>> = {};
    columnas.forEach(col => {
      if (SELECTS_RX.some(rx => rx.test(col.trim()))) {
        map[col] = new Set<string>();
        deportistas.forEach(dep => {
          const v = (dep._columnas[col] ?? '').trim();
          if (v) map[col].add(v);
        });
        // Opciones base para PROGRAMA
        if (/^program/i.test(col.trim())) {
          ORDEN_PROGRAMA.forEach(p => map[col].add(p));
        }
      }
    });
    const result: Record<string, string[]> = {};
    Object.entries(map).forEach(([k, s]) => { result[k] = Array.from(s).sort(); });
    return result;
  }, [columnas, deportistas]);

  // ── Filtro + sort ────────────────────────────────────────────
  const ordenados = useMemo(() => {
    const q    = buscar.trim().toLowerCase();
    const qCod = buscarCod.trim().toLowerCase();
    const lista = deportistas.filter(d => {
      if (q && !d._nombre.toLowerCase().includes(q)) return false;
      if (qCod) {
        const cod = getColVal(d, /^c[oó]d/i).toLowerCase();
        if (!cod.includes(qCod)) return false;
      }
      return true;
    });

    return lista.sort((a, b) => {
      // Orden puro por código — sin importar afiliación ni estado
      const nA = Number(getColVal(a, /^c[oó]d/i).replace(/\D/g, '')) || 0;
      const nB = Number(getColVal(b, /^c[oó]d/i).replace(/\D/g, '')) || 0;
      const pA = prioridadCodigo(nA);
      const pB = prioridadCodigo(nB);
      if (pA !== pB) return pA - pB;
      if (nA !== nB) return nA - nB;
      return a._nombre.localeCompare(b._nombre, 'es');
    });
  }, [deportistas, buscar, buscarCod]);

  // ── Grupos ───────────────────────────────────────────────────
  const grupos = useMemo(() => {
    const map = new Map<string, Deportista[]>();
    ordenados.forEach(d => {
      const g = grupoDep(d);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(d);
    });
    const claves = [...map.keys()].sort((a, b) => {
      if (a === '__RETIRADO__') return 1;  if (b === '__RETIRADO__') return -1;
      if (a === '__SIN_PROGRAMA__') return 1; if (b === '__SIN_PROGRAMA__') return -1;
      return ordenPrograma(a) - ordenPrograma(b);
    });
    return claves.map(k => ({ key: k, lista: map.get(k)! }));
  }, [ordenados]);

  // ── Edición ──────────────────────────────────────────────────
  const setCelda = useCallback((depId: string, col: string, val: string) => {
    setEdits(prev => ({
      ...prev,
      [depId]: { ...(prev[depId] ?? {}), [col]: val },
    }));
    setGuardado(false);
  }, []);

  function getValCelda(dep: Deportista, col: string): string {
    return edits[dep.id]?.[col] ?? dep._columnas[col] ?? '';
  }

  const pendingCount = useMemo(
    () => Object.values(edits).reduce((s, d) => s + Object.keys(d).length, 0),
    [edits]
  );

  // ── ACTUALIZAR: guarda TODO ───────────────────────────────────
  function actualizarTodo() {
    const nueva = deportistas.map(d => {
      if (!edits[d.id]) return d;
      return { ...d, _columnas: { ...d._columnas, ...edits[d.id] } };
    });
    saveDeportistas(nueva);
    setDeportistas(nueva);
    setEdits({});
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  }

  // ── Mostrar valor de celda con conversión de fecha ───────────
  function mostrarValor(col: string, rawVal: string): string {
    if (esFechaAfil(col)) return serialAFecha(rawVal);
    return rawVal || '—';
  }

  // ── Procesar Excel de Nuevos Deportistas ─────────────────────
  async function procesarExcelNuevos(file: File) {
    setNuevosProc(true);
    try {
      const XLSX   = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array' });
      const hoja   = wb.Sheets[wb.SheetNames[0]];
      const filas: Record<string,string>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      if (!filas.length) { alert('El archivo está vacío.'); setNuevosProc(false); return; }

      // ── Normalización: mapea encabezados del Excel a las claves exactas
      //    del consolidado (elimina tildes, mayúsculas, espacios para comparar)
      const sinTildes = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

      // Columnas de referencia (el deportista con más columnas)
      const refDep = deportistas.reduce(
        (best, d) => Object.keys(d._columnas).length > Object.keys(best._columnas).length ? d : best,
        deportistas[0] ?? { _columnas: {} } as Deportista
      );
      const existingKeys = Object.keys(refDep._columnas);
      // mapa: clave_normalizada → clave_original del consolidado
      const normMap = new Map<string, string>();
      existingKeys.forEach(k => normMap.set(sinTildes(k), k));

      function mapKey(excelKey: string): string {
        // 1) coincidencia exacta
        if (existingKeys.includes(excelKey)) return excelKey;
        // 2) coincidencia normalizada (sin tildes, sin distinción mayúsc.)
        return normMap.get(sinTildes(excelKey)) ?? excelKey;
      }

      // Clave de nombre real en el consolidado
      const existingNomKey = existingKeys.find(k =>
        /deportista|alumno|jugador|atleta|^nombre/i.test(k.trim())
      ) ?? '';

      // Índice de códigos y nombres existentes para detectar duplicados
      const codsExist  = new Set(deportistas.map(d => getColVal(d, /^c[oó]d/i).trim().toLowerCase()).filter(Boolean));
      const nomesExist = new Set(deportistas.map(d => d._nombre.trim().toLowerCase()).filter(Boolean));

      const RX_NOM = /deportista|alumno|jugador|atleta|^nombre/i;
      const RX_COD = /^c[oó]d/i;

      const parsed: NuevoReg[] = filas
        .filter(fila => Object.values(fila).some(v => String(v ?? '').trim()))
        .map(fila => {
          // Reescribir claves del Excel → claves del consolidado
          const cols: Record<string,string> = {};
          Object.entries(fila).forEach(([k, v]) => {
            cols[mapKey(k)] = String(v ?? '').trim();
          });

          // Extraer nombre: buscar la clave de nombre del consolidado, o por regex
          const kNom = existingNomKey && cols[existingNomKey]
            ? existingNomKey
            : (Object.keys(cols).find(k => RX_NOM.test(k.trim())) ?? '');
          // Evitar que un código numérico puro se convierta en nombre
          const nombre = kNom
            ? cols[kNom]
            : (Object.values(cols).find(v => v && !/^\d{4,6}$/.test(v)) ?? '');

          // Detectar duplicado por código o nombre
          const kCod = Object.keys(cols).find(k => RX_COD.test(k.trim())) ?? '';
          const cod  = kCod ? cols[kCod].toLowerCase() : '';
          const duplicado = (cod && codsExist.has(cod)) || nomesExist.has(nombre.trim().toLowerCase());

          return { _nombre: nombre.trim(), _columnas: cols, duplicado };
        })
        .filter(r => r._nombre);

      setNuevosFilas(parsed);
      setNuevosPaso('preview');
    } catch(e) {
      alert('Error al leer el archivo: ' + String(e));
    }
    setNuevosProc(false);
  }

  async function confirmarNuevos() {
    const nuevos = nuevosFilas.filter(r => !r.duplicado);
    if (!nuevos.length) { setNuevosPaso('listo'); return; }

    const ahora = Date.now();
    const deportsNuevos = nuevos.map((r, i): Deportista => ({
      id:        `nuevo_${ahora}_${i}`,
      nombre:    r._nombre,
      _nombre:   r._nombre,
      _columnas: r._columnas,
    }));

    const idsLote = deportsNuevos.map(d => d.id);
    const lista = [...deportistas, ...deportsNuevos];
    await saveDeportistas(lista);
    setDeportistas(lista);
    setUltimoLote(idsLote);
    try { localStorage.setItem('futuro_ultimo_lote', JSON.stringify(idsLote)); } catch {}
    setNuevosPaso('listo');
  }

  async function eliminarUltimoLote() {
    if (!ultimoLote.length) return;
    const nombres = deportistas.filter(d => ultimoLote.includes(d.id)).map(d => d._nombre);
    if (!confirm(`¿Eliminar los ${ultimoLote.length} deportistas del último lote subido?\n\n${nombres.slice(0,5).join('\n')}${nombres.length > 5 ? `\n…y ${nombres.length - 5} más` : ''}`)) return;
    const lista = deportistas.filter(d => !ultimoLote.includes(d.id));
    await saveDeportistas(lista);
    setDeportistas(lista);
    setUltimoLote([]);
    try { localStorage.removeItem('futuro_ultimo_lote'); } catch {}
  }

  // ── Importar Excel de Torneos ─────────────────────────────────
  function loadXLSX(): Promise<any> {
    return new Promise((resolve, reject) => {
      const w = window as any;
      if (w.XLSX) { resolve(w.XLSX); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload  = () => resolve(w.XLSX);
      s.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
      document.head.appendChild(s);
    });
  }

  async function procesarExcelTorneo(file: File) {
    setTorneoProc(true);
    try {
      const XLSX   = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const wb     = XLSX.read(buffer, { type: 'array' });
      const hoja   = wb.Sheets[wb.SheetNames[0]];
      const filas: Record<string, string>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      if (!filas.length) { alert('El archivo está vacío.'); return; }

      // Detectar columnas automáticamente
      const keys = Object.keys(filas[0]);
      const kCod    = keys.find(k => /^c[oó]d/i.test(k.trim()))   ?? keys[0] ?? '';
      const kNombre = keys.find(k => /deportista|nombre|alumno|jugador/i.test(k.trim())) ?? keys[1] ?? '';
      const kComp   = keys.find(k => /^competencia$/i.test(k.trim())) ?? '';
      const kT1     = keys.find(k => /torneo.?1|compite/i.test(k.trim())) ?? '';
      const kT2     = keys.find(k => /torneo.?2/i.test(k.trim())) ?? '';
      const kT3     = keys.find(k => /torneo.?3/i.test(k.trim())) ?? '';
      const kT4     = keys.find(k => /torneo.?4/i.test(k.trim())) ?? '';

      // Índice de deportistas por código y por nombre
      const porCod: Record<string, string>    = {};
      const porNombre: Record<string, string> = {};
      deportistas.forEach(d => {
        const cod = getColVal(d, /^c[oó]d/i).trim().toLowerCase();
        const nom = d._nombre.trim().toLowerCase();
        if (cod) porCod[cod] = d.id;
        if (nom) porNombre[nom] = d.id;
      });

      const resultado: FilaTorneo[] = filas.map(fila => {
        const codigo = String(fila[kCod]  ?? '').trim();
        const nombre = String(fila[kNombre] ?? '').trim();
        const competencia = String(fila[kComp] ?? '').trim();
        const t1     = String(fila[kT1] ?? '').trim();
        const t2     = String(fila[kT2] ?? '').trim();
        const t3     = String(fila[kT3] ?? '').trim();
        const t4     = String(fila[kT4] ?? '').trim();

        // Buscar match por código primero, luego por nombre
        let depId: string | null = null;
        let match: FilaTorneo['match'] = null;
        if (codigo && porCod[codigo.toLowerCase()]) {
          depId = porCod[codigo.toLowerCase()]; match = 'codigo';
        } else if (nombre && porNombre[nombre.toLowerCase()]) {
          depId = porNombre[nombre.toLowerCase()]; match = 'nombre';
        }
        return { codigo, nombre, competencia, t1, t2, t3, t4, depId, match };
      });

      setTorneoFilas(resultado);
      setTorneoPaso('preview');
    } catch (e: any) {
      alert('Error al leer el archivo: ' + e.message);
    } finally {
      setTorneoProc(false);
    }
  }

  function aplicarTorneos() {
    const lista = deportistas;
    const updates: Record<string, Record<string, string>> = {};

    torneoFilas.forEach(fila => {
      if (!fila.depId) return;
      const dep = lista.find(d => d.id === fila.depId);
      if (!dep) return;

      // Resolver claves reales o virtuales
      const kC  = Object.keys(dep._columnas).find(k => /^competencia$/i.test(k)) || VTC;
      const kT1 = Object.keys(dep._columnas).find(k => /^compite$/i.test(k))     || VT1;
      const kT2 = Object.keys(dep._columnas).find(k => /torneo.?2/i.test(k))     || VT2;
      const kT3 = Object.keys(dep._columnas).find(k => /torneo.?3/i.test(k))     || VT3;
      const kT4 = Object.keys(dep._columnas).find(k => /torneo.?4/i.test(k))     || VT4;

      updates[fila.depId] = {};
      if (fila.competencia) updates[fila.depId][kC]  = fila.competencia;
      if (fila.t1)          updates[fila.depId][kT1] = fila.t1;
      if (fila.t2)          updates[fila.depId][kT2] = fila.t2;
      if (fila.t3)          updates[fila.depId][kT3] = fila.t3;
      if (fila.t4)          updates[fila.depId][kT4] = fila.t4;
    });

    const nueva = lista.map(d =>
      updates[d.id] ? { ...d, _columnas: { ...d._columnas, ...updates[d.id] } } : d
    );
    saveDeportistas(nueva);
    setDeportistas(nueva);
    setTorneoPaso('listo');
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-gray-50">

      {/* ── HEADER ── */}
      <header className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-3 flex items-center gap-3 flex-shrink-0 z-30 overflow-hidden">
        {/* Patrón balones */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-vg" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
                <line x1="36" y1="28" x2="36" y2="18" stroke="white" strokeWidth="0.8"/>
                <line x1="43" y1="33" x2="52" y2="30" stroke="white" strokeWidth="0.8"/>
                <line x1="41" y1="42" x2="47" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="31" y1="42" x2="25" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="29" y1="33" x2="20" y2="30" stroke="white" strokeWidth="0.8"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-vg)"/>
          </svg>
        </div>

        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight">Vista General</h1>
          <p className="text-white/60 text-[11px]">
            {proyectoFiltro
              ? `Proyecto: ${proyectoFiltro}`
              : programaFiltro
              ? `${LABEL_GRUPO[programaFiltro] ?? programaFiltro}`
              : `${deportistas.length} deportistas · ${grupos.length} programas`}
          </p>
        </div>

        {/* Buscadores */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
            <input value={buscarCod} onChange={e => setBuscarCod(e.target.value)}
              placeholder="Buscar código…"
              className="w-36 bg-white/15 text-white placeholder-white/50 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:bg-white/25 transition" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar deportista…"
              className="w-44 bg-white/15 text-white placeholder-white/50 text-xs rounded-xl pl-8 pr-3 py-2 outline-none focus:bg-white/25 transition" />
          </div>
        </div>

        {/* Restablecer anchos — oculto en móvil */}
        {Object.keys(colWidths).length > 0 && (
          <button onClick={resetColWidths}
            className="relative hidden sm:flex text-white/60 hover:text-white text-[10px] font-semibold flex-shrink-0 px-2 py-1 rounded-lg hover:bg-white/10 transition"
            title="Restablecer anchos de columna">
            ↺ anchos
          </button>
        )}

        {/* Botón deshacer último lote — solo visible si hay lote */}
        {ultimoLote.length > 0 && (
          <button
            onClick={eliminarUltimoLote}
            className="relative hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-500/90 hover:bg-amber-600 text-white transition flex-shrink-0"
            title={`Eliminar los ${ultimoLote.length} deportistas del último lote subido`}>
            <Trash2 className="w-3.5 h-3.5" />
            Deshacer último ({ultimoLote.length})
          </button>
        )}

        {/* Botón SUBIR NUEVOS DEPORTISTAS */}
        <button
          onClick={() => { setModalNuevos(true); setNuevosPaso('subir'); setNuevosFilas([]); }}
          className="relative hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#16a34a] text-white hover:bg-[#064e1e] transition flex-shrink-0 shadow-sm">
          <Upload className="w-3.5 h-3.5" />
          Subir nuevos
        </button>

        {/* Input oculto para nuevos deportistas */}
        <input ref={nuevosInputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) procesarExcelNuevos(f); e.target.value = ''; }} />

        {/* Botón importar torneos — oculto en móvil */}
        <button
          onClick={() => { setModalTorneo(true); setTorneoPaso('subir'); setTorneoFilas([]); }}
          className="relative hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-white/15 text-white hover:bg-white/25 transition flex-shrink-0">
          <Trophy className="w-3.5 h-3.5" />
          Torneos
        </button>

        {/* Botón columnas visibles */}
        <div className="relative flex-shrink-0" ref={panelRef}>
          <button
            onClick={() => setPanelColumnas(p => !p)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
              panelColumnas ? 'bg-white text-[#111827]' : 'bg-white/15 text-white hover:bg-white/25'
            }`}>
            <Columns3 className="w-3.5 h-3.5" />
            Columnas
            {ocultasCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {ocultasCount}
              </span>
            )}
          </button>

          {/* Panel desplegable */}
          {panelColumnas && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
              {/* Header del panel */}
              <div className="bg-[#4b5563] px-4 py-2.5 flex items-center justify-between">
                <span className="text-white font-black text-[11px] uppercase tracking-wider">
                  Columnas visibles
                </span>
                {ocultasCount > 0 && (
                  <button onClick={mostrarTodas}
                    className="text-white/70 hover:text-white text-[10px] font-semibold underline transition">
                    Mostrar todas
                  </button>
                )}
              </div>
              {/* Lista de columnas */}
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {colVisibles.map(col => {
                  const visible = colVisible[col] !== false;
                  return (
                    <button key={col}
                      onClick={() => toggleColVisible(col)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition hover:bg-gray-50 ${
                        visible ? '' : 'bg-gray-50'
                      }`}>
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition ${
                        visible
                          ? 'bg-[#16a34a] border-[#16a34a]'
                          : 'bg-white border-gray-300'
                      }`}>
                        {visible && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                      </div>
                      <span className={`text-[11px] font-semibold truncate ${
                        visible ? 'text-[#16a34a]' : 'text-gray-400 line-through'
                      }`}>
                        {labelCol(col)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Botón ACTUALIZAR */}
        <button
          onClick={actualizarTodo}
          disabled={pendingCount === 0 && !guardado}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition flex-shrink-0 ${
            guardado
              ? 'bg-green-100 text-green-900'
              : pendingCount > 0
              ? 'bg-white text-[#16a34a] hover:bg-green-50 shadow-lg animate-pulse'
              : 'bg-white/20 text-white/50 cursor-default'
          }`}>
          {guardado
            ? <><CheckCircle className="w-4 h-4" /> Guardado</>
            : <><Save className="w-4 h-4" /> ACTUALIZAR
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </>
          }
        </button>

        <div className="hidden sm:block relative text-right leading-tight ml-2 flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      {/* ── BARRA DE FILTRO PROGRAMA + PROYECTO ── */}
      {deportistas.length > 0 && (
        <div className="flex-shrink-0 bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex flex-wrap gap-4 items-end">

          {/* Programa */}
          <div className="min-w-[180px]">
            <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Programa</label>
            <select
              value={programaFiltro ?? ''}
              onChange={e => {
                setProgramaFiltro(e.target.value || null);
                setProyectoFiltro(null);
              }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option value="">— Todos —</option>
              {grupos.map(({ key }) => (
                <option key={key} value={key}>{LABEL_GRUPO[key] ?? key}</option>
              ))}
            </select>
          </div>

          {/* Proyecto */}
          <div className="min-w-[180px]">
            <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Proyecto</label>
            <select
              value={proyectoFiltro ?? ''}
              onChange={e => setProyectoFiltro(e.target.value || null)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              <option value="">— Todos —</option>
              {(programaFiltro
                ? (proyectosPorPrograma[programaFiltro] ?? [])
                : Object.entries(proyectosPorPrograma).filter(([k]) => k !== '__RETIRADO__').flatMap(([,v]) => v).filter((v,i,a) => a.indexOf(v) === i).sort()
              ).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

        </div>
      )}

      <main className="flex-1 overflow-auto px-2 pb-3">

        {/* Buscadores móvil */}
        <div className="sm:hidden mt-2 mb-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={buscarCod} onChange={e => setBuscarCod(e.target.value)}
              placeholder="Código…"
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
          <div className="relative flex-[2]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Deportista…"
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
        </div>

        {cargando ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <BalonCargando />
          </div>
        ) : deportistas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <Users className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold text-base">No hay deportistas cargados</p>
            <p className="text-gray-300 text-sm mt-1">Importa el archivo Excel desde Programas y Proyectos</p>
            <button onClick={() => router.push('/alumnos/importar')}
              className="mt-5 px-5 py-2.5 bg-[#16a34a] text-white rounded-xl text-sm font-bold hover:bg-[#064e1e] transition">
              Ir a importar
            </button>
          </div>
        ) : (

          <div className="rounded-2xl shadow-sm border border-gray-200 bg-white">
            <div>
              <table className="border-collapse text-xs" style={{ width: 'max-content', tableLayout: 'fixed' }}>

                {/* ── COLGROUP para anchos ── */}
                <colgroup>
                  <col style={{ width: 36 }} />
                  {colVisibles.map(col => (
                    <col key={col} style={{ width: colWidths[col] ?? (esCodigo(col) ? 130 : esFechaAfil(col) ? 100 : esTipoAfil(col) ? 95 : 110) }} />
                  ))}
                </colgroup>

                {/* ── CABECERA ── */}
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#16a34a] text-white">
                    {/* N° fijo */}
                    <th className="px-2 py-2.5 text-center font-black text-[10px] whitespace-nowrap sticky left-0 bg-[#16a34a] z-30" style={{ border: '2px solid white', color: 'white' }}>
                      N°
                    </th>
                    {colVisibles.map(col => {
                      const esCod = esCodigo(col);
                      return (
                        <>
                        <th key={col}
                          style={{ border: '2px solid white', background: '#16a34a', color: 'white' }}
                          className={`relative px-2 py-2.5 text-center font-black text-[10px] whitespace-nowrap select-none ${
                            esCod ? 'sticky left-[36px] z-30' : ''
                          }`}>
                          <span className={resizingActive === col ? 'opacity-60' : ''}>
                            {labelCol(col)}
                          </span>
                          {/* Handle de resize */}
                          <div
                            onMouseDown={e => onResizeStart(col, e)}
                            className="absolute right-0 top-0 h-full w-4 cursor-col-resize group/handle z-10 flex items-center justify-end"
                            title="⟺ Arrastrar para ajustar ancho · Doble clic para restablecer">
                            <div className={`w-[3px] rounded-full transition-all duration-150 ${
                              resizingActive === col
                                ? 'bg-white h-full shadow-lg shadow-white/50'
                                : 'bg-white/25 h-1/2 group-hover/handle:bg-white group-hover/handle:h-full'
                            }`} />
                          </div>
                        </th>
                        {/* Columna fija DEPORTISTA justo después de CÓDIGO */}
                        {esCod && (
                          <th key="__nombre_th__"
                            style={{ border: '2px solid white', background: '#16a34a', color: 'white', minWidth: 180 }}
                            className="px-3 py-2.5 text-left font-black text-[10px] whitespace-nowrap sticky left-[120px] z-30">
                            DEPORTISTA
                          </th>
                        )}
                        </>
                      );
                    })}
                  </tr>
                </thead>

                {/* ── BODY PLANO — orden global por código ── */}
                <tbody>
                  {(() => {
                    const listaPlana = ordenados.filter(d => {
                      if (programaFiltro !== null && grupoDep(d) !== programaFiltro) return false;
                      if (proyectoFiltro && getColVal(d, RX_PROY).trim() !== proyectoFiltro) return false;
                      return true;
                    });
                    return listaPlana.map((dep, rowIdx) => {
                        const rowNum   = rowIdx + 1;
                        const retirado = esRetirado(dep);
                        const rowBg    = retirado ? '#d1d5db' : '#f1f5f9';
                        const stickyBg = retirado ? '#d1d5db' : '#f1f5f9';
                        return (
                          <tr key={dep.id}
                            style={{ backgroundColor: rowBg }}
                            className="hover:brightness-95 transition-all">

                            {/* N° */}
                            <td className="px-2 py-0 text-center text-[#111827] font-semibold sticky left-0 z-10 text-[10px] w-[36px]"
                              style={{ backgroundColor: stickyBg, border: '2px solid white' }}>
                              {rowNum}
                            </td>

                            {/* Columnas dinámicas */}
                            {colVisibles.map(col => {
                              const rawVal   = getValCelda(dep, col);
                              const esCod    = esCodigo(col);
                              const esFecha  = esFechaAfil(col);
                              const opciones = opcionesCol[col];
                              const changed  = edits[dep.id]?.[col] !== undefined;

                              // CÓD — color por afiliación + columna DEPORTISTA fija a la derecha
                              if (esCod) {
                                const afilVal  = getColVal(dep, /tipo.*afil|^afil/i);
                                const codColor = retirado ? '#9ca3af' : colorCodigo(afilVal);
                                // Buscar el código con regex por si está bajo "CODIGO" (sin tilde) u otra variante
                                const rawValCod = rawVal || getColVal(dep, /^c[oó]d/i);
                                return (
                                  <>
                                  <td key={col}
                                    className="px-0 py-0 text-center sticky left-[36px] z-10"
                                    style={{ backgroundColor: codColor, border: '2px solid white' }}>
                                    <input
                                      value={rawValCod}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      className="w-full text-center outline-none bg-transparent" style={{ fontSize: '16px', fontWeight: '800', color: 'white', letterSpacing: '0.08em', padding: '6px 8px' }}
                                    />
                                  </td>
                                  {/* Columna DEPORTISTA fija */}
                                  <td key="__nombre_td__"
                                    className="px-3 py-0 sticky left-[120px] z-10 whitespace-nowrap"
                                    style={{ backgroundColor: stickyBg, border: '2px solid white', minWidth: 180 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                                      {dep._nombre}
                                    </span>
                                  </td>
                                  </>
                                );
                              }

                              // FECHA AFILIACIÓN
                              if (esFechaAfil(col)) {
                                const display = serialAFecha(rawVal);
                                return (
                                  <td key={col}
                                    style={{ background: '#f1f5f9', border: '2px solid white' }}
                                    className="px-0 py-0 text-center">
                                    <input
                                      value={display}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      className="w-full text-center text-[11px] font-semibold py-[7px] px-2 outline-none bg-transparent text-[#111827] truncate"
                                    />
                                  </td>
                                );
                              }

                              // TIPO AFILIACIÓN — badge coloreado (solo lectura)
                              if (esTipoAfil(col)) {
                                const color = colorCodigo(rawVal);
                                return (
                                  <td key={col}
                                    style={{ border: '2px solid white', backgroundColor: '#f8fafc' }}
                                    className="px-1 py-0 text-center">
                                    <span style={{
                                      display: 'inline-block',
                                      backgroundColor: color,
                                      color: 'white',
                                      borderRadius: 4,
                                      padding: '2px 6px',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: '0.04em',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {rawVal || '—'}
                                    </span>
                                  </td>
                                );
                              }

                              // SELECT (Programa / Estado)
                              if (opciones) return (
                                <td key={col}
                                  style={{ background: '#f1f5f9', border: '2px solid white' }}
                                  className="px-0 py-0">
                                  <select
                                    value={rawVal}
                                    onChange={e => setCelda(dep.id, col, e.target.value)}
                                    className="w-full text-[11px] font-semibold py-[7px] px-1.5 outline-none bg-transparent text-[#111827] cursor-pointer truncate">
                                    <option value="">—</option>
                                    {opciones.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                </td>
                              );

                              // PROYECTO — select verde filtrado por programa
                              const esProyecto = RX_PROY.test(col.trim());
                              if (esProyecto) {
                                const progActual = getValCelda(dep, colPrograma).trim();
                                const opsProy    = (proyectosPorPrograma[progActual] && proyectosPorPrograma[progActual].length > 0)
                                  ? proyectosPorPrograma[progActual]
                                  : Object.entries(proyectosPorPrograma).filter(([k]) => k !== '__RETIRADO__').flatMap(([,v]) => v).filter((v,i,a)=>a.indexOf(v)===i).sort();
                                return (
                                  <td key={col}
                                    style={{ border: '2px solid white', backgroundColor: '#16a34a' }}
                                    className="px-0 py-0">
                                    <select
                                      value={rawVal === '—' ? '' : rawVal}
                                      onChange={e => setCelda(dep.id, col, e.target.value)}
                                      className="w-full text-[13px] font-semibold text-white py-[6px] px-2 outline-none bg-transparent cursor-pointer truncate">
                                      <option value="">—</option>
                                      {opsProy.map(o => <option key={o} value={o} style={{ color: '#111827', backgroundColor: 'white' }}>{o}</option>)}
                                    </select>
                                  </td>
                                );
                              }

                              // PROFE — input, letra más grande
                              const esProfe = /^prof/i.test(col.trim());
                              if (esProfe) return (
                                <td key={col} style={{ background: '#f1f5f9', border: '2px solid white' }} className="px-0 py-0">
                                  <input
                                    value={rawVal === '—' ? '' : rawVal}
                                    onChange={e => setCelda(dep.id, col, e.target.value)}
                                    placeholder="—"
                                    className="w-full text-[13px] font-semibold text-[#111827] py-[6px] px-2 outline-none bg-transparent truncate"
                                  />
                                </td>
                              );

                              // TEXTO genérico
                              return (
                                <td key={col} style={{ background: '#f1f5f9', border: '2px solid white' }} className="px-0 py-0">
                                  <input
                                    value={rawVal === '—' ? '' : rawVal}
                                    onChange={e => setCelda(dep.id, col, e.target.value)}
                                    placeholder="—"
                                    className="w-full text-[11px] text-[#111827] py-[7px] px-2 outline-none bg-transparent truncate"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer con botón ACTUALIZAR */}
            {pendingCount > 0 && (
              <div className="sticky bottom-0 bg-[#f1f5f9] border-t-2 border-white px-5 py-3 flex items-center justify-between">
                <p className="text-[#111827] font-semibold text-sm">
                  Tienes <strong>{pendingCount}</strong> cambio{pendingCount !== 1 ? 's' : ''} sin guardar.
                </p>
                <button onClick={actualizarTodo}
                  className="flex items-center gap-2 bg-[#16a34a] text-white px-5 py-2.5 rounded-xl font-black text-sm hover:bg-[#064e1e] transition shadow-md">
                  <Save className="w-4 h-4" /> ACTUALIZAR TODOS LOS CAMBIOS
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══ MODAL IMPORTAR TORNEOS ══════════════════════════════ */}
      {modalTorneo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header modal */}
            <div className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center gap-3 flex-shrink-0">
              <Trophy className="w-5 h-5 text-white" />
              <div className="flex-1">
                <p className="text-white font-black text-base">Importar Torneos</p>
                <p className="text-white/60 text-[11px]">Sube el Excel con los resultados de torneo</p>
              </div>
              <button onClick={() => setModalTorneo(false)}
                className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white hover:bg-white/30 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── PASO 1: Subir ── */}
            {torneoPaso === 'subir' && (
              <div className="p-6 space-y-5 overflow-y-auto">
                {/* Instrucciones */}
                <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-sm text-[#064e1e] space-y-1">
                  <p className="font-black">Formato esperado del Excel:</p>
                  <p>El archivo debe tener estas columnas (en cualquier orden):</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['CÓDIGO', 'DEPORTISTA', 'COMPETENCIA', 'TORNEO 1', 'TORNEO 2', 'TORNEO 3', 'TORNEO 4'].map(c => (
                      <span key={c} className="bg-[#16a34a] text-white text-[10px] font-black px-2.5 py-1 rounded-full">{c}</span>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#4b5563] mt-2">
                    Solo necesitas incluir los deportistas que quieres actualizar. La búsqueda se hace primero por <strong>Código</strong> y luego por <strong>Nombre</strong>.
                  </p>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setTorneoArrastr(true); }}
                  onDragLeave={() => setTorneoArrastr(false)}
                  onDrop={e => { e.preventDefault(); setTorneoArrastr(false); const f = e.dataTransfer.files[0]; if (f) procesarExcelTorneo(f); }}
                  onClick={() => torneoInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
                    torneoArrastr ? 'border-[#16a34a] bg-green-50' : 'border-gray-200 hover:border-[#22c55e]'
                  }`}>
                  <input ref={torneoInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) procesarExcelTorneo(f); }} />
                  {torneoProc ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
                      <p className="text-gray-500 text-sm">Leyendo Excel…</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-bold text-gray-600">Arrastra el Excel aquí o haz clic</p>
                      <p className="text-xs text-gray-400 mt-1">.xlsx · .xls</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── PASO 2: Preview ── */}
            {torneoPaso === 'preview' && (
              <div className="flex flex-col overflow-hidden flex-1">
                {/* Resumen */}
                {(() => {
                  const encontrados = torneoFilas.filter(f => f.depId).length;
                  const noEncontrados = torneoFilas.filter(f => !f.depId).length;
                  return (
                    <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-[#16a34a] font-bold">
                        <CheckCircle className="w-4 h-4" />{encontrados} encontrados
                      </span>
                      {noEncontrados > 0 && (
                        <span className="flex items-center gap-1.5 text-[#475569] font-bold">
                          <AlertCircle className="w-4 h-4" />{noEncontrados} no encontrados
                        </span>
                      )}
                      <span className="text-gray-400 text-xs">{torneoFilas.length} filas en total</span>
                    </div>
                  );
                })()}

                {/* Tabla preview */}
                <div className="overflow-auto flex-1">
                  <table className="text-xs border-collapse w-full">
                    <thead className="sticky top-0 bg-[#16a34a] text-white">
                      <tr>
                        <th className="px-3 py-2 text-left font-black">ESTADO</th>
                        <th className="px-3 py-2 text-left font-black">CÓDIGO</th>
                        <th className="px-3 py-2 text-left font-black">DEPORTISTA</th>
                        <th className="px-3 py-2 text-left font-black">COMPETENCIA</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 1</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 2</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 3</th>
                        <th className="px-3 py-2 text-left font-black">TORNEO 4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {torneoFilas.map((f, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-1.5 border-b border-gray-100">
                            {f.depId ? (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                f.match === 'codigo' ? 'bg-[#16a34a] text-white' : 'bg-gray-200 text-[#111827]'
                              }`}>
                                {f.match === 'codigo' ? '✓ Código' : '✓ Nombre'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                                No encontrado
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 border-b border-gray-100 font-bold text-[#111827]">{f.codigo || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-100 font-semibold text-gray-800">{f.nombre || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-100 text-gray-600">{f.competencia || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-100 text-gray-600">{f.t1 || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-100 text-gray-600">{f.t2 || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-100 text-gray-600">{f.t3 || '—'}</td>
                          <td className="px-3 py-1.5 border-b border-gray-100 text-gray-600">{f.t4 || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Botones */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 flex items-center gap-3 justify-end">
                  <button onClick={() => setTorneoPaso('subir')}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition">
                    ← Volver
                  </button>
                  <button
                    onClick={aplicarTorneos}
                    disabled={!torneoFilas.some(f => f.depId)}
                    className="flex items-center gap-2 bg-[#16a34a] text-white px-6 py-2.5 rounded-xl text-sm font-black hover:bg-[#064e1e] transition disabled:opacity-50">
                    <Trophy className="w-4 h-4" />
                    Aplicar {torneoFilas.filter(f => f.depId).length} deportistas
                  </button>
                </div>
              </div>
            )}

            {/* ── PASO 3: Listo ── */}
            {torneoPaso === 'listo' && (
              <div className="p-10 text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-[#16a34a]" />
                </div>
                <h3 className="text-xl font-black text-gray-900">¡Torneos actualizados!</h3>
                <p className="text-gray-500 text-sm">
                  Se actualizaron <strong>{torneoFilas.filter(f => f.depId).length}</strong> deportistas con los datos de torneo.
                </p>
                <button onClick={() => setModalTorneo(false)}
                  className="bg-[#16a34a] text-white px-8 py-3 rounded-xl font-black hover:bg-[#064e1e] transition">
                  Cerrar
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ══ MODAL SUBIR NUEVOS DEPORTISTAS ═══════════════════════ */}
      {modalNuevos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

            {/* Header modal */}
            <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-white font-black text-base">Subir Nuevos Deportistas</p>
                <p className="text-white/60 text-xs mt-0.5">
                  {nuevosPaso === 'subir'   && 'Selecciona el Excel con los nuevos registros'}
                  {nuevosPaso === 'preview' && `${nuevosFilas.length} registros encontrados — confirma antes de agregar`}
                  {nuevosPaso === 'listo'   && '¡Deportistas agregados correctamente!'}
                </p>
              </div>
              <button onClick={() => setModalNuevos(false)}
                className="text-white/70 hover:text-white transition p-1 rounded-lg hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Paso 1: Subir archivo */}
            {nuevosPaso === 'subir' && (
              <div className="flex-1 flex flex-col items-center justify-center p-10 gap-5">
                <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center">
                  <Upload className="w-9 h-9 text-[#16a34a]" />
                </div>
                <div className="text-center">
                  <p className="font-black text-gray-800 text-lg">Sube el Excel de nuevos deportistas</p>
                  <p className="text-gray-400 text-sm mt-1">El archivo debe tener encabezados en la primera fila (CÓDIGO, DEPORTISTA, PROGRAMA, PROYECTO…)</p>
                </div>
                <button
                  onClick={() => nuevosInputRef.current?.click()}
                  disabled={nuevosProc}
                  className="bg-[#16a34a] text-white font-bold px-8 py-3 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-50 flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {nuevosProc ? 'Procesando…' : 'Seleccionar archivo .xlsx'}
                </button>
              </div>
            )}

            {/* Paso 2: Preview */}
            {nuevosPaso === 'preview' && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Resumen */}
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-4 text-xs font-bold flex-shrink-0">
                  <span className="text-green-700">✓ {nuevosFilas.filter(r => !r.duplicado).length} nuevos a agregar</span>
                  {nuevosFilas.some(r => r.duplicado) && (
                    <span className="text-amber-600">⚠ {nuevosFilas.filter(r => r.duplicado).length} duplicados (se omitirán)</span>
                  )}
                </div>

                {/* Tabla preview */}
                <div className="flex-1 overflow-auto px-4 py-3">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr style={{ background: '#16a34a' }}>
                        <th style={{ border: '1px solid white', padding: '6px 10px', color: 'white', fontWeight: 900 }}>ESTADO</th>
                        {nuevosFilas[0] && Object.keys(nuevosFilas[0]._columnas).slice(0, 7).map(k => (
                          <th key={k} style={{ border: '1px solid white', padding: '6px 10px', color: 'white', fontWeight: 900, whiteSpace: 'nowrap' }}>
                            {k.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nuevosFilas.map((r, i) => (
                        <tr key={i} style={{ background: r.duplicado ? '#fef3c7' : '#f1f5f9', borderTop: '1px solid white' }}>
                          <td style={{ border: '1px solid white', padding: '5px 8px', textAlign: 'center', fontWeight: 900, fontSize: 10 }}>
                            {r.duplicado
                              ? <span style={{ color: '#d97706' }}>DUPLICADO</span>
                              : <span style={{ color: '#16a34a' }}>NUEVO</span>}
                          </td>
                          {Object.keys(nuevosFilas[0]._columnas).slice(0, 7).map(k => (
                            <td key={k} style={{ border: '1px solid white', padding: '5px 8px', whiteSpace: 'nowrap', color: '#111827' }}>
                              {r._columnas[k] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Botones */}
                <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                  <button onClick={() => { setNuevosPaso('subir'); setNuevosFilas([]); }}
                    className="flex-1 border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold py-2.5 rounded-xl transition text-sm">
                    ← Volver
                  </button>
                  <button onClick={confirmarNuevos}
                    disabled={nuevosFilas.filter(r => !r.duplicado).length === 0}
                    className="flex-1 bg-[#16a34a] text-white font-bold py-2.5 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-40 text-sm flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Agregar {nuevosFilas.filter(r => !r.duplicado).length} deportistas
                  </button>
                </div>
              </div>
            )}

            {/* Paso 3: Listo */}
            {nuevosPaso === 'listo' && (
              <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-3xl flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
                <p className="font-black text-gray-800 text-lg">¡Listo!</p>
                <p className="text-gray-500 text-sm">
                  Se agregaron <strong>{nuevosFilas.filter(r => !r.duplicado).length}</strong> deportistas al consolidado.
                  Ya aparecen en la tabla.
                </p>
                <button onClick={() => setModalNuevos(false)}
                  className="bg-[#16a34a] text-white px-8 py-3 rounded-xl font-black hover:bg-[#064e1e] transition">
                  Cerrar
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
