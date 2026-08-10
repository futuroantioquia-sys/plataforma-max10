'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Calculator, Save, Search, Download, Database, CheckCircle, AlertCircle, X, BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { getDeportistas, publicarPagosEstado, getPagadosKeys } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import {
  normNombre, soloDigitos, normCuenta, clasificarConcepto, mesDesdeFecha, hashMov,
  getMapeoIndex, guardarMapeo, guardarMovimientos, getMovimientos, ultimoSaldo,
  hashesExistentes, contarMapeo, sembrarDiccionario, contarMovimientos, importarHistorico,
  getConceptos, guardarConcepto, borrarConcepto, actualizarMovimiento, asignarCodigoBulk,
  getMapeoRows, borrarMapeo, getMesesPorCodigo,
  type MapeoIdx, type MovCont, type Concepto,
} from '@/lib/contabilidad';

const BANCOS = ['Bancolombia 613', 'Bancolombia 908', 'Bancolombia 382'];

// Columnas del Libro (para anchos ajustables por el usuario). El orden DEBE
// coincidir con el orden en que se pintan las celdas en el cuerpo de la tabla.
const COLS_LIBRO: { key: string; label: string; def: number }[] = [
  { key: 'acciones',   label: '',            def: 54 },
  { key: 'num',        label: 'N°',          def: 70 },
  { key: 'cuenta',     label: 'CUENTA',      def: 42 },
  { key: 'fecha',      label: 'FECHA',       def: 114 },
  { key: 'desc',       label: 'DESCRIPCIÓN', def: 96 },
  { key: 'debito',     label: 'DÉBITO',      def: 82 },
  { key: 'credito',    label: 'CRÉDITO',     def: 82 },
  { key: 'saldo',      label: 'SALDO',       def: 82 },
  { key: 'concepto',   label: 'CONCEPTO',    def: 104 },
  { key: 'codigo',     label: 'CÓDIGO',      def: 94 },
  { key: 'deportista', label: 'DEPORTISTA',  def: 210 },
  { key: 'detalle',    label: 'DETALLE',     def: 124 },
];

// Caché en memoria del libro: al volver del estado de cuenta NO se recarga de la nube
// (se reutiliza al instante). Se refresca al guardar cambios o subir un extracto.
let libroCache: { key: string; data: MovCont[] } | null = null;
// Ciclo de pagos de la plataforma (mismo orden que el estado de cuenta): FEB→DIC 2026
const MESES_CICLO = ['FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026', 'MAYO 2026', 'JUNIO 2026', 'JULIO 2026', 'AGOSTO 2026', 'SEPTIEMBRE 2026', 'OCTUBRE 2026', 'NOVIEMBRE 2026', 'DICIEMBRE 2026'];
// Opciones para el desplegable de la columna DETALLE (meses + inscripción, etc.)
const MESES_DET = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const DETALLE_OPCIONES: string[] = (() => {
  const arr = ['INSCRIPCIÓN', 'MATRÍCULA'];
  for (const y of [2026]) for (const m of MESES_DET) arr.push(`${m} ${y}`);
  arr.push('OTRO');
  return arr;
})();

function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel'));
    document.head.appendChild(s);
  });
}
function fechaISO(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}
function numVal(v: any): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function pick(obj: any, ...cands: string[]): any {
  const keys = Object.keys(obj);
  for (const c of cands) { const k = keys.find(k => normNombre(k) === normNombre(c)); if (k) return obj[k]; }
  for (const c of cands) { const k = keys.find(k => normNombre(k).includes(normNombre(c))); if (k) return obj[k]; }
  return '';
}
function getCod(d: Deportista): string {
  const cols = (d as any)._columnas ?? {};
  const k = Object.keys(cols).find(c => /^c[oó]d/i.test(c.trim()));
  return k ? String(cols[k] ?? '').trim() : '';
}
const fmt = (n: number) => (n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Agarrador visible para redimensionar una columna (arrastrar / doble clic = restablecer)
function ColResizer({ onDown, onReset }: { onDown: (e: React.MouseEvent) => void; onReset: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <span
      onMouseDown={onDown}
      onDoubleClick={onReset}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Arrastra para ajustar el ancho · doble clic para restablecer"
      style={{
        position: 'absolute', top: 0, right: -6, height: '100%', width: 14, zIndex: 6,
        cursor: 'col-resize', display: 'flex', justifyContent: 'center', alignItems: 'stretch',
        background: hov ? 'rgba(255,255,255,0.15)' : 'transparent', touchAction: 'none',
      }}
    >
      <span style={{ width: hov ? 3 : 2, background: hov ? '#ffffff' : 'rgba(255,255,255,0.45)' }} />
    </span>
  );
}

export default function ContabilidadPage() {
  const router = useRouter();
  // Para volver exactamente aquí con "Atrás": refs de control del scroll y del estado
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRestaurado = useRef(false);
  const primerResetLimite = useRef(true);
  const saltarReset = useRef(false);

  const [banco, setBanco] = useState(BANCOS[0]);
  const [vista, setVista] = useState<'subir' | 'libro' | 'cuentas' | 'desconocidas' | 'diccionario'>('subir');
  const [conceptos, setConceptos] = useState<Concepto[]>([]);

  const [deportistas, setDeportistas] = useState<Deportista[]>([]);
  const codMap = useMemo(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const c = getCod(d); if (c) m[c] = d._nombre; });
    return m;
  }, [deportistas]);
  // código → id del deportista (para abrir su estado de cuenta desde el libro)
  const codToId = useMemo(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const c = getCod(d); if (c) m[c] = d.id; });
    return m;
  }, [deportistas]);
  // nombre → id del deportista (respaldo del link cuando el código no está en la ficha)
  const nombreToId = useMemo(() => {
    const m: Record<string, string> = {};
    deportistas.forEach(d => { const n = normNombre(d._nombre); if (n) m[n] = d.id; });
    return m;
  }, [deportistas]);

  const [mapeoCount, setMapeoCount] = useState(0);
  const [idx, setIdx] = useState<MapeoIdx>({ cuenta: {}, nombre: {} });
  const [revision, setRevision] = useState<MovCont[]>([]);
  const mapeoQueue = useRef<Record<string, { tipo: string; clave: string; codigo: string }>>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sembrando, setSembrando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [movCount, setMovCount] = useState(-1);
  const [importando, setImportando] = useState(false);

  const [libro, setLibro] = useState<MovCont[]>([]);
  const [cargandoLibro, setCargandoLibro] = useState(false);
  // Vista Libro: cuenta a mostrar ('TODAS' = las tres pegadas) y filtros por columna
  const [libroBanco, setLibroBanco] = useState<string>('TODAS');
  const [fil, setFil] = useState({ banco: '', fecha: '', desc: '', debito: '', credito: '', saldo: '', concepto: '', codigo: '', deportista: '', detalle: '' });
  // Cuántas filas se dibujan a la vez (los últimos N movimientos; "Mostrar más" trae más atrás)
  const [limite, setLimite] = useState(100);
  // Filtro con retraso: no recalcular en cada tecla (se aplica al dejar de escribir)
  const [filDebounced, setFilDebounced] = useState({ banco: '', fecha: '', desc: '', debito: '', credito: '', saldo: '', concepto: '', codigo: '', deportista: '', detalle: '' });
  // Ver solo "transacciones por orientar" (pagos recibidos sin código/deportista)
  const [soloPorOrientar, setSoloPorOrientar] = useState(false);
  // Filtro por el chulo (estado de confirmación): 'todos' | 'verde' (confirmado) | 'rojo' (pendiente)
  const [filChulo, setFilChulo] = useState<'todos' | 'verde' | 'rojo'>('todos');
  // Editor por movimiento (para editar y dividir una cifra en varias filas)
  const [editRow, setEditRow] = useState<{ orig: MovCont; filas: MovCont[] } | null>(null);
  const [guardandoEd, setGuardandoEd] = useState(false);
  // Celda del libro que se está editando (para no dibujar 300 desplegables a la vez)
  const [editCell, setEditCell] = useState<{ id: string; campo: 'concepto' | 'detalle' | 'codigo' } | null>(null);
  // Cambios pendientes del libro (NO se guardan hasta pulsar "Guardar ahora")
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [guardandoCambios, setGuardandoCambios] = useState(false);
  // Publicación MANUAL de pagos del libro → estado de cuenta (solo al autorizar)
  const [publicando, setPublicando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  // Fila a resaltar al volver del estado de cuenta (la que clicaste)
  const [resaltarId, setResaltarId] = useState<string | null>(null);
  // Fila bajo el mouse (sombreado estilo Excel para saber en qué fila se está trabajando)
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Pagos ya publicados en esta sesión (clave código|mes) → el chulito se pone verde
  const [publicadas, setPublicadas] = useState<Set<string>>(new Set());
  // Estado de cuenta abierto EN VENTANA sobre el libro (el libro no se mueve)
  const [estadoCuentaUrl, setEstadoCuentaUrl] = useState<string | null>(null);
  // Anchos ajustables de las columnas del Libro (se guardan en el navegador)
  const [colW, setColW] = useState<Record<string, number>>(() => Object.fromEntries(COLS_LIBRO.map(c => [c.key, c.def])));
  useEffect(() => {
    try {
      const s = localStorage.getItem('cont_colW_libro_v3');
      const saved = s ? JSON.parse(s) : {};
      // Migración única: el ancho por defecto de la columna N° pasó a 70. Quitamos el valor
      // viejo guardado una sola vez, sin tocar los anchos que ya ajustaste en otras columnas.
      if (!localStorage.getItem('cont_colW_num70')) {
        delete saved.num;
        localStorage.setItem('cont_colW_num70', '1');
      }
      setColW(w => ({ ...w, ...saved }));
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('cont_colW_libro_v3', JSON.stringify(colW)); } catch { /* noop */ }
  }, [colW]);
  function iniciarResize(key: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = colW[key] ?? 80;
    const onMove = (ev: MouseEvent) => setColW(prev => ({ ...prev, [key]: Math.max(28, startW + (ev.clientX - startX)) }));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.userSelect = ''; };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  function resetCol(key: string) { setColW(prev => ({ ...prev, [key]: COLS_LIBRO.find(c => c.key === key)?.def ?? 80 })); }
  function pasoCol(key: string, delta: number) { setColW(prev => ({ ...prev, [key]: Math.max(28, (prev[key] ?? 80) + delta) })); }
  function resetTodasCols() { setColW(Object.fromEntries(COLS_LIBRO.map(c => [c.key, c.def]))); }
  const [panelCols, setPanelCols] = useState(false);
  // Cambiar concepto/detalle/código en una celda del libro. NO guarda: queda PENDIENTE
  // hasta pulsar "Guardar ahora". Al cambiar el código, se actualiza el deportista
  // (y si se deja vacío, se "des-orienta" el pago: código y deportista quedan en blanco).
  function cambiarCampoLibro(m: MovCont, campo: 'concepto' | 'detalle' | 'codigo', val: string) {
    setLibro(prev => prev.map(x => {
      if (x.id !== m.id) return x;
      const next: MovCont = { ...x, [campo]: val };
      if (campo === 'codigo') { next.deportista = val ? (codMap[val] || '') : ''; }
      return next;
    }));
    setDirtyIds(prev => { const n = new Set(prev); if (m.id) n.add(m.id); return n; });
  }
  async function guardarCambiosLibro() {
    if (!dirtyIds.size) return;
    setGuardandoCambios(true);
    const ids = Array.from(dirtyIds);
    let ok = true;
    const aprender: { tipo: string; clave: string; codigo: string }[] = [];
    for (const id of ids) {
      const m = libro.find(x => x.id === id);
      if (!m) continue;
      const r = await actualizarMovimiento(id, { concepto: m.concepto, detalle: m.detalle, codigo: m.codigo, deportista: m.deportista });
      if (!r) ok = false;
      // Aprender el cruce en el DICCIONARIO: si la fila quedó con código y trae referencia
      // confiable (no PAGO QR ni "null"), se guarda para que el próximo extracto la cruce solo.
      const cod = String(m.codigo ?? '').trim();
      const ref = String(m.referencia ?? '');
      const refConfiable = !/PAGO\s*QR/i.test(m.descripcion || '') && !/null/i.test(ref);
      if (cod && ref && refConfiable) {
        const refDig = soloDigitos(ref);
        if (refDig.length >= 5) aprender.push({ tipo: 'cuenta', clave: refDig, codigo: cod });
        else { const kn = normNombre(ref); if (kn) aprender.push({ tipo: 'nombre', clave: kn, codigo: cod }); }
      }
    }
    if (aprender.length) { try { await guardarMapeo(aprender); } catch { /* noop */ } }
    setGuardandoCambios(false);
    if (ok) {
      setDirtyIds(new Set());
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: libro }; // refresca caché
      flash(`✓ ${ids.length} cambio(s) guardado(s)${aprender.length ? ' · ' + aprender.length + ' al diccionario' : ''}`);
    } else flash('⚠ Algunos cambios no se pudieron guardar');
  }
  function descartarCambiosLibro() {
    if (!window.confirm('¿Descartar los cambios sin guardar y volver a como estaba?')) return;
    setDirtyIds(new Set());
    cargarLibro();
  }
  // Publicar MANUALMENTE los pagos verificados del libro al estado de cuenta de los deportistas
  async function actualizarEstadosCuenta() {
    // Si hay cambios en amarillo sin guardar, los guardamos automáticamente antes de
    // publicar (así no te bloquea y lo que se publica es lo último que editaste).
    if (dirtyIds.size > 0) {
      const idsPend = Array.from(dirtyIds);
      let okg = true;
      for (const id of idsPend) {
        const mm = libro.find(x => x.id === id);
        if (!mm) continue;
        const rr = await actualizarMovimiento(id, { concepto: mm.concepto, detalle: mm.detalle, codigo: mm.codigo, deportista: mm.deportista });
        if (!rr) okg = false;
      }
      if (!okg) { flash('⚠ Algunos cambios no se pudieron guardar; revísalos antes de publicar.'); return; }
      setDirtyIds(new Set());
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: libro };
    }
    if (!window.confirm(
      'AUTORIZAR ACTUALIZACIÓN DE ESTADOS DE CUENTA\n\n' +
      'Se publicarán al estado de cuenta de cada deportista TODOS los pagos del libro que tengan CÓDIGO y MES (Detalle) asignados.\n' +
      '• Solo actualiza lo PAGADO (no toca lo que deben / lo cargado).\n' +
      '• Puedes repetirlo cuando quieras; vuelve a dejarlo al día.\n\n' +
      '¿Continuar?'
    )) return;
    setPublicando(true);
    flash('Publicando pagos al estado de cuenta…');
    try {
      const movs = await getMovimientos(); // todos los movimientos, de todas las cuentas
      const acc: Record<string, Record<string, { sum: number; banco: string; fecha: string }>> = {};
      for (const m of movs) {
        const cod = String(m.codigo ?? '').trim();
        const det = String(m.detalle ?? '').trim();
        if (!cod || !det || !(Number(m.credito) > 0)) continue;
        acc[cod] = acc[cod] || {};
        const cur = acc[cod][det] || { sum: 0, banco: '', fecha: '' };
        cur.sum += Number(m.credito) || 0;
        if ((m.fecha ?? '') >= cur.fecha) { cur.fecha = m.fecha ?? ''; cur.banco = m.banco ?? cur.banco; }
        acc[cod][det] = cur;
      }
      const rows: { deportista_id: string; detalle: string; vPagado: string; destino: string; fecha: string }[] = [];
      for (const cod of Object.keys(acc)) {
        for (const det of Object.keys(acc[cod])) {
          const v = acc[cod][det];
          rows.push({ deportista_id: cod, detalle: det, vPagado: '$ ' + Math.round(v.sum).toLocaleString('es-CO'), destino: v.banco, fecha: v.fecha });
        }
      }
      const r = await publicarPagosEstado(rows);
      if (r.ok) {
        setPublicadas(prev => { const n = new Set(prev); for (const x of rows) n.add(x.deportista_id + '|' + x.detalle); return n; });
        flash(`✓ Estados de cuenta actualizados · ${r.n.toLocaleString('es-CO')} pagos publicados`);
      } else flash('⚠ Error al publicar: ' + (r.msg || ''));
    } catch (e: any) { flash('⚠ Error al publicar: ' + (e?.message || e)); }
    setPublicando(false);
  }
  const colsVis = COLS_LIBRO.filter(c => c.key !== 'cuenta' || libroBanco === 'TODAS');

  useEffect(() => {
    getDeportistas().then(setDeportistas).catch(() => {});
    getMapeoIndex().then(setIdx).catch(() => {});
    contarMapeo().then(setMapeoCount).catch(() => {});
    contarMovimientos().then(setMovCount).catch(() => {});
    getConceptos().then(setConceptos).catch(() => {});
    // Marcar en verde (permanente) lo que ya está pagado en el estado de cuenta
    getPagadosKeys().then(keys => setPublicadas(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; })).catch(() => {});
  }, []);

  async function importarHist() {
    if (!window.confirm('Importar TODO tu LIBRO CONTABLE histórico (~12.000 movimientos) al libro dinámico. Se hace una sola vez. ¿Continuar?')) return;
    setImportando(true); setProgreso('Descargando histórico…');
    try {
      const res = await fetch('/contabilidad/historico-seed.json');
      const arr = await res.json();
      await importarHistorico(arr, (n, tot) => setProgreso(`Importando ${n.toLocaleString('es-CO')}/${tot.toLocaleString('es-CO')}…`));
      await contarMovimientos().then(setMovCount);
      flash('Histórico importado ✓');
      if (vista === 'libro') cargarLibro();
    } catch (e: any) { flash('Error importando histórico: ' + (e?.message || e)); }
    setImportando(false); setProgreso('');
  }

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(null), 3500); }

  // ── Subir extracto ──
  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setVista('subir');            // el resultado se ve aquí: saltamos a "Movimientos"
    setCargando(true); setRevision([]); mapeoQueue.current = {};
    flash(`Leyendo "${file.name}"…`);
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas: any[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
      if (!filas.length) { flash('⚠ El archivo no tiene filas legibles. ¿Es el Excel del banco?'); setCargando(false); return; }

      const idxLocal = idx;
      const yaHash = await hashesExistentes(banco);
      let saldo = await ultimoSaldo(banco);
      // MES PENDIENTE = primer mes del ciclo que el deportista NO tiene cubierto.
      // "Cubierto" = pagado en el ESTADO DE CUENTA (pagos_estado) O ya asignado en el libro.
      const mesesLibro = await getMesesPorCodigo();
      const pagadosKeys = await getPagadosKeys();
      const mesesCubiertos: Record<string, Set<string>> = {};
      for (const cod of Object.keys(mesesLibro)) mesesCubiertos[cod] = new Set(mesesLibro[cod]);
      for (const k of pagadosKeys) { const i = k.indexOf('|'); if (i < 0) continue; const cod = k.slice(0, i); (mesesCubiertos[cod] = mesesCubiertos[cod] || new Set()).add(k.slice(i + 1)); }
      const asignadosBatch: Record<string, Set<string>> = {};

      const out: MovCont[] = [];
      for (const f of filas) {
        const fecha = fechaISO(pick(f, 'FECHA'));
        const descripcion = String(pick(f, 'DESCRIPCION', 'DESCRIPCIÓN') || '').trim();
        const referencia = String(pick(f, 'REFERENCIA', 'REFERENCI') || '').trim();
        const valor = numVal(pick(f, 'VALOR'));
        if (!fecha && !descripcion && !valor) continue;

        const debito = valor < 0 ? Math.abs(valor) : 0;
        const credito = valor >= 0 ? valor : 0;

        // Cruce: 1) cuenta  2) nombre  3) concepto por descripción
        let codigo = ''; let via = '';
        // NO auto-asignar por referencia cuando el movimiento es un PAGO QR (la referencia
        // es la cuenta del recaudo/QR, COMPARTIDA por muchos pagadores, no la del deportista)
        // ni cuando la referencia viene malformada ("null"). Estos quedan "por asignar" para
        // que se orienten a mano y NUNCA se relacionen mal automáticamente.
        const refConfiable = !/PAGO\s*QR/i.test(descripcion) && !/null/i.test(referencia);
        const refDig = soloDigitos(referencia);
        const refCta = normCuenta(referencia); // sin ceros a la izquierda (para el cruce)
        if (refConfiable && refDig.length >= 5 && idxLocal.cuenta[refCta]) { codigo = idxLocal.cuenta[refCta]; via = 'cuenta'; }
        if (!codigo && refConfiable) {
          const kn = normNombre(referencia);
          if (kn && idxLocal.nombre[kn]) { codigo = idxLocal.nombre[kn]; via = 'nombre'; }
        }
        const clas = clasificarConcepto(descripcion);
        let concepto = '';
        let deportista = '';
        let detalle = '';
        if (codigo) {
          deportista = codMap[codigo] || '';
          const esMatricula = /MATRICUL|INSCRIP/i.test(descripcion);
          concepto = esMatricula ? 'MATRÍCULA' : 'APORTE FORMACIÓN';
          if (esMatricula) {
            detalle = 'MATRÍCULA 2026';
          } else {
            // CONSECUTIVO: el mes que SIGUE al último mes cubierto (NO rellena huecos:
            // si abril quedó excusado/saltado, no se devuelve a abril; sigue hacia adelante).
            const pagados = new Set<string>([...Array.from(mesesCubiertos[codigo] || []), ...Array.from(asignadosBatch[codigo] || [])]);
            let lastIdx = -1;
            for (let i = 0; i < MESES_CICLO.length; i++) if (pagados.has(MESES_CICLO[i])) lastIdx = i;
            const sig = MESES_CICLO[lastIdx + 1];
            detalle = sig || mesDesdeFecha(fecha); // si ya llegó a diciembre, usa el mes del movimiento
            if (sig) { (asignadosBatch[codigo] = asignadosBatch[codigo] || new Set()).add(sig); }
          }
        } else if (clas.concepto) {
          concepto = clas.concepto;
        }
        const pendiente = !codigo && !clas.concepto;

        saldo = saldo + credito - debito;
        const hash = hashMov({ banco, fecha, descripcion, referencia, debito, credito });
        out.push({
          banco, fecha, descripcion, referencia, debito, credito, saldo,
          concepto, codigo, deportista, detalle,
          dictado: false, origen: file.name, hash,
          _via: via || (clas.concepto ? 'concepto' : ''), _pendiente: pendiente,
          // marca duplicado reusando id temporal
          id: yaHash.has(hash) ? '__DUP__' : undefined,
        });
      }
      setRevision(out);
      const dup = out.filter(r => r.id === '__DUP__').length;
      flash(`${out.length} movimientos leídos · ${dup} ya existían`);
    } catch (err: any) {
      flash('Error leyendo el Excel: ' + (err?.message || err));
    }
    setCargando(false);
  }

  function asignarDeportista(i: number, cod: string, nombre: string) {
    setRevision(prev => prev.map((r, j) => {
      if (j !== i) return r;
      // recordar el cruce (aprende): por cuenta si la ref es numérica, si no por nombre.
      // Los PAGO QR y referencias "null" NO se aprenden (su cuenta es compartida y ensuciaría
      // el diccionario), pero la asignación manual de esta fila sí se respeta.
      const refDig = soloDigitos(r.referencia);
      const refConfiable = !/PAGO\s*QR/i.test(r.descripcion || '') && !/null/i.test(r.referencia || '');
      if (refConfiable && refDig.length >= 5) mapeoQueue.current['c_' + refDig] = { tipo: 'cuenta', clave: refDig, codigo: cod };
      else if (refConfiable) { const kn = normNombre(r.referencia); if (kn) mapeoQueue.current['n_' + kn] = { tipo: 'nombre', clave: kn, codigo: cod }; }
      return { ...r, codigo: cod, deportista: nombre, concepto: r.concepto || 'APORTE FORMACIÓN', detalle: r.detalle || mesDesdeFecha(r.fecha), _pendiente: false, _via: 'manual' };
    }));
  }
  function editarCampo(i: number, campo: keyof MovCont, val: string) {
    setRevision(prev => prev.map((r, j) => j === i ? { ...r, [campo]: val } : r));
  }

  async function guardarLibro() {
    const nuevos = revision.filter(r => r.id !== '__DUP__');
    if (!nuevos.length) { flash('No hay movimientos nuevos para guardar.'); return; }
    setGuardando(true);
    const r = await guardarMovimientos(nuevos);
    const cola = Object.values(mapeoQueue.current);
    if (cola.length) await guardarMapeo(cola);
    setGuardando(false);
    if (r.ok) {
      flash(`Guardados ${r.insertados} movimientos en el libro.`);
      mapeoQueue.current = {};
      setRevision([]);
      libroCache = null; // hay movimientos nuevos → el libro debe recargarse
      getMapeoIndex().then(setIdx); contarMapeo().then(setMapeoCount); contarMovimientos().then(setMovCount);
    } else {
      flash('Error al guardar: ' + (r.msg || ''));
    }
  }

  async function cargarLibro(forzar = false) {
    const key = libroBanco === 'TODAS' ? '__TODAS__' : libroBanco;
    // Si ya lo tenemos en memoria (misma cuenta), lo mostramos AL INSTANTE sin recargar
    if (!forzar && libroCache && libroCache.key === key && libroCache.data.length) {
      setLibro(libroCache.data);
      setDirtyIds(new Set());
      setCargandoLibro(false);
      return;
    }
    setCargandoLibro(true);
    const m = await getMovimientos(libroBanco === 'TODAS' ? undefined : libroBanco);
    libroCache = { key, data: m };
    setLibro(m);
    setDirtyIds(new Set());
    setCargandoLibro(false);
  }
  useEffect(() => { if (vista === 'libro') cargarLibro(); /* eslint-disable-next-line */ }, [vista, libroBanco]);

  // Libro filtrado por columnas. La "cifra" busca dentro de débito o crédito;
  // el "código" trae todos los movimientos de ese deportista aunque estén en
  // cuentas distintas (porque el libro está pegado con las tres cuentas).
  const esTodas = libroBanco === 'TODAS';
  const libroFiltrado = useMemo(() => {
    const f = filDebounced;
    const inc = (v: any, q: string) => String(v ?? '').toLowerCase().includes(q.trim().toLowerCase());
    const dig = (s: any) => String(s ?? '').replace(/\D/g, '');
    const incDig = (v: any, q: string) => { const d = dig(q); return !d || dig(v).includes(d); };
    return libro.filter(m => {
      if (f.banco && !inc(m.banco, f.banco)) return false;
      if (f.fecha && !inc(m.fecha, f.fecha)) return false;
      if (f.desc && !inc(m.descripcion, f.desc)) return false;
      if (f.debito && !incDig(m.debito, f.debito)) return false;
      if (f.credito && !incDig(m.credito, f.credito)) return false;
      if (f.saldo && !incDig(m.saldo, f.saldo)) return false;
      if (f.concepto && !inc(m.concepto, f.concepto)) return false;
      // CÓDIGO = coincidencia EXACTA (no trae códigos donde el número aparezca dentro de otra cifra)
      if (f.codigo && String(m.codigo ?? '').trim() !== f.codigo.trim()) return false;
      if (f.deportista && !inc(m.deportista, f.deportista)) return false;
      if (f.detalle && !inc(m.detalle, f.detalle)) return false;
      // "Por orientar": pagos (crédito) sin código. Mostramos también los que acabas
      // de orientar (fila con cambios pendientes) para que no desaparezcan hasta guardar.
      if (soloPorOrientar) {
        const esPorOrientar = (Number(m.credito) > 0) && !String(m.codigo ?? '').trim();
        if (!esPorOrientar && !dirtyIds.has(m.id || '')) return false;
      }
      // Filtro por el chulo: verde = ya confirmado en el estado de cuenta;
      // rojo = pago con código y mes pero AÚN sin confirmar (pendiente).
      if (filChulo !== 'todos') {
        const cod = String(m.codigo ?? '').trim();
        const det = String(m.detalle ?? '').trim();
        const verde = publicadas.has(cod + '|' + det);
        const esPago = cod && det && Number(m.credito) > 0;
        if (filChulo === 'verde' && !verde) return false;
        if (filChulo === 'rojo' && !(esPago && !verde)) return false;
      }
      return true;
    });
  }, [libro, filDebounced, soloPorOrientar, dirtyIds, filChulo, publicadas]);
  const porOrientarCount = useMemo(
    () => libro.filter(m => (Number(m.credito) > 0) && !String(m.codigo ?? '').trim()).length,
    [libro],
  );
  // Detección de errores por fila: MISMO deportista con el MISMO mes repetido (duplicado)
  const filasProblema = useMemo(() => {
    const porClave: Record<string, string[]> = {};
    for (const m of libro) {
      const cod = String(m.codigo ?? '').trim();
      const det = String(m.detalle ?? '').trim();
      if (!cod || !det || !(Number(m.credito) > 0)) continue;
      const k = cod + '|' + det;
      (porClave[k] = porClave[k] || []).push(m.id || '');
    }
    const prob: Record<string, string> = {};
    for (const k of Object.keys(porClave)) {
      if (porClave[k].length > 1) {
        const [, det] = k.split('|');
        for (const id of porClave[k]) prob[id] = `Mes duplicado: hay ${porClave[k].length} pagos de "${det}" para el mismo deportista`;
      }
    }
    return prob;
  }, [libro]);
  const numProblemas = useMemo(() => new Set(Object.keys(filasProblema)).size, [filasProblema]);

  // Recalcular el MES (Detalle) de los pagos del 5 de agosto en adelante, al mes PENDIENTE
  // correcto de cada deportista (baseline = sus meses de antes del 5-ago en el libro).
  async function recalcularMeses() {
    const CUT = '2026-08-05';
    setRecalculando(true);
    flash('Analizando meses pendientes…');
    let updates: { id: string; detalle: string }[] = [];
    try {
      const movs = await getMovimientos();
      // Meses YA confirmados en el ESTADO DE CUENTA (fuente de verdad). Si borraste
      // un mes ahí (p. ej. por incapacidad), deja de contar y el siguiente pago va al
      // mes que sigue.
      const pagadosKeys = await getPagadosKeys(); // ["codigo|MES", ...]
      const cubiertoEstado: Record<string, Set<string>> = {};
      for (const k of pagadosKeys) {
        const i = k.indexOf('|'); if (i < 0) continue;
        const c = k.slice(0, i).trim(); const mes = k.slice(i + 1).trim();
        if (!c || !mes) continue;
        (cubiertoEstado[c] = cubiertoEstado[c] || new Set()).add(mes);
      }
      const porCod: Record<string, MovCont[]> = {};
      for (const m of movs) { const cod = String(m.codigo ?? '').trim(); if (cod) (porCod[cod] = porCod[cod] || []).push(m); }
      for (const cod of Object.keys(porCod)) {
        const list = porCod[cod];
        // Baseline = lo que REALMENTE aparece en el estado de cuenta del deportista.
        // Si aún no tiene estado de cuenta, usamos como respaldo sus créditos
        // históricos del libro (antes del 5-ago).
        const baseline = new Set<string>();
        const desdeEstado = cubiertoEstado[cod];
        if (desdeEstado && desdeEstado.size) {
          for (const mes of desdeEstado) if (MESES_CICLO.includes(mes)) baseline.add(mes);
        } else {
          for (const m of list) {
            if (Number(m.credito) > 0 && String(m.fecha ?? '') < CUT) {
              const det = String(m.detalle ?? '').trim(); if (det) baseline.add(det);
            }
          }
        }
        // Pagos mensuales del 5-ago en adelante (sin matrícula), en orden por fecha
        const nuevos = list.filter(m => Number(m.credito) > 0 && String(m.fecha ?? '') >= CUT && !/MATR[IÍ]CUL|INSCRIP/i.test(String(m.concepto ?? '')));
        nuevos.sort((a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')));
        const asignados = new Set<string>(baseline);
        for (const m of nuevos) {
          // El mes que SIGUE al último cubierto (no rellena huecos saltados/excusados)
          let lastIdx = -1;
          for (let i = 0; i < MESES_CICLO.length; i++) if (asignados.has(MESES_CICLO[i])) lastIdx = i;
          const sig = MESES_CICLO[lastIdx + 1];
          if (!sig) continue;
          asignados.add(sig);
          if (sig !== String(m.detalle ?? '').trim() && m.id) updates.push({ id: m.id, detalle: sig });
        }
      }
    } catch (e: any) { setRecalculando(false); flash('⚠ Error al analizar: ' + (e?.message || e)); return; }
    setRecalculando(false);
    if (!updates.length) { flash('✓ No hay meses por corregir; todo está en su mes pendiente.'); return; }
    if (!window.confirm(
      `Se corregirá el MES (Detalle) de ${updates.length} pago(s) del 5 de agosto en adelante,\n` +
      `poniéndoles el mes PENDIENTE correcto de cada deportista.\n\n` +
      `• El mes que sigue se calcula según el ESTADO DE CUENTA (lo que ya tiene ahí);\n` +
      `  si borraste un mes por incapacidad, no se vuelve a asignar.\n` +
      `• Solo cambia el libro (NO toca el estado de cuenta).\n` +
      `• Los históricos (antes del 5-ago) no se tocan.\n\n¿Continuar?`
    )) return;
    setRecalculando(true);
    const porDetalle: Record<string, string[]> = {};
    for (const u of updates) (porDetalle[u.detalle] = porDetalle[u.detalle] || []).push(u.id);
    let ok = true;
    for (const det of Object.keys(porDetalle)) {
      const r = await asignarCodigoBulk(porDetalle[det], { detalle: det });
      if (!r) ok = false;
    }
    libroCache = null;
    await cargarLibro(true);
    setRecalculando(false);
    flash(ok ? `✓ ${updates.length} pago(s) corregidos a su mes pendiente` : '⚠ Algunos no se pudieron corregir');
  }

  // Publicar el pago de UNA sola fila al estado de cuenta (para ensayar uno por uno)
  async function actualizarPagoFila(m: MovCont) {
    const cod = String(m.codigo ?? '').trim();
    const det = String(m.detalle ?? '').trim();
    if (!cod || !det || !(Number(m.credito) > 0)) { flash('⚠ La fila necesita código, mes (Detalle) y ser un crédito.'); return; }
    // Si la fila está en amarillo (cambio sin guardar), la guardamos automáticamente
    // antes de publicar — así no te bloquea y actualizas tranquilo.
    if (dirtyIds.has(m.id || '')) {
      const rg = await actualizarMovimiento(m.id || '', { concepto: m.concepto, detalle: m.detalle, codigo: m.codigo, deportista: m.deportista });
      if (!rg) { flash('⚠ No se pudo guardar el cambio de la fila. Intenta de nuevo.'); return; }
      setDirtyIds(prev => { const n = new Set(prev); n.delete(m.id || ''); return n; });
      libroCache = { key: libroBanco === 'TODAS' ? '__TODAS__' : libroBanco, data: libro };
    }
    const sum = libro
      .filter(x => String(x.codigo ?? '').trim() === cod && String(x.detalle ?? '').trim() === det && Number(x.credito) > 0)
      .reduce((s, x) => s + (Number(x.credito) || 0), 0);
    if (!window.confirm(`Publicar al estado de cuenta de ${m.deportista || cod}:\n${det} = $${Math.round(sum).toLocaleString('es-CO')}\n\n¿Continuar?`)) return;
    const r = await publicarPagosEstado([{ deportista_id: cod, detalle: det, vPagado: '$ ' + Math.round(sum).toLocaleString('es-CO'), destino: m.banco || '', fecha: m.fecha || '' }]);
    if (r.ok) {
      setPublicadas(prev => { const n = new Set(prev); n.add(cod + '|' + det); return n; });
      flash(`✓ Pago publicado: ${m.deportista || cod} · ${det}`);
    } else flash('⚠ Error: ' + (r.msg || ''));
  }
  // Lista de códigos únicos (ordenados) para el desplegable del filtro de Código
  const codigosUnicos = useMemo(() =>
    Array.from(new Set(libro.map(m => String(m.codigo ?? '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [libro]);
  const totDebito = useMemo(() => libroFiltrado.reduce((s, m) => s + (Number(m.debito) || 0), 0), [libroFiltrado]);
  const totCredito = useMemo(() => libroFiltrado.reduce((s, m) => s + (Number(m.credito) || 0), 0), [libroFiltrado]);
  const filVacio = { banco: '', fecha: '', desc: '', debito: '', credito: '', saldo: '', concepto: '', codigo: '', deportista: '', detalle: '' };
  const hayFiltro = Object.values(fil).some(v => v);
  // Al montar, recuperar el estado guardado (pestaña, cuenta, filtros, filas) para volver con "Atrás"
  useEffect(() => {
    let ui: any = null;
    try { const s = sessionStorage.getItem('cont_ui_v1'); ui = s ? JSON.parse(s) : null; } catch { /* noop */ }
    if (ui) {
      saltarReset.current = true; // que el cambio de filtros/cuenta no reinicie el límite recuperado
      if (ui.vista) setVista(ui.vista);
      if (ui.libroBanco) setLibroBanco(ui.libroBanco);
      if (ui.fil) setFil((prev: any) => ({ ...prev, ...ui.fil }));
      if (typeof ui.limite === 'number') setLimite(ui.limite);
    }
    // eslint-disable-next-line
  }, []);
  // Al cambiar de cuenta o de filtro, volvemos a mostrar desde el primer bloque
  // (saltamos el primer montaje y la restauración, para no borrar el estado recuperado)
  useEffect(() => {
    if (primerResetLimite.current) { primerResetLimite.current = false; return; }
    if (saltarReset.current) { saltarReset.current = false; return; }
    setLimite(100);
  }, [fil, libroBanco]);
  // Aplicar el filtro con un pequeño retraso (evita recalcular/redibujar en cada tecla)
  useEffect(() => { const t = setTimeout(() => setFilDebounced(fil), 250); return () => clearTimeout(t); }, [fil]);
  // Guardar el estado de la vista para poder volver exactamente aquí.
  // Saltamos el PRIMER montaje para no sobrescribir con valores por defecto lo ya guardado.
  const primerPersist = useRef(true);
  useEffect(() => {
    if (primerPersist.current) { primerPersist.current = false; return; }
    try { sessionStorage.setItem('cont_ui_v1', JSON.stringify({ vista, libroBanco, fil, limite })); } catch { /* noop */ }
  }, [vista, libroBanco, fil, limite]);
  // visibles = los últimos `limite` movimientos (más recientes). Para MOSTRARLOS en orden
  // normal de libro (antiguo → reciente, lo último abajo) invertimos solo la vista.
  const visibles = useMemo(() => libroFiltrado.slice(0, limite), [libroFiltrado, limite]);
  const visiblesVista = useMemo(() => visibles.slice().reverse(), [visibles]);
  // Número de fila estilo Excel sobre TODO el libro (no cambia al filtrar): la fila 1 es
  // el movimiento más antiguo. Como `libro` viene en orden fecha DESC, el rango cronológico
  // de la fila en la posición k es (total - k). Así, al filtrar un deportista, cada pago
  // muestra en qué fila exacta del libro completo está.
  const numFila = useMemo(() => {
    const map: Record<string, number> = {};
    const n = libro.length;
    libro.forEach((m, k) => { if (m.id) map[m.id] = n - k; });
    return map;
  }, [libro]);
  // Al volver del estado de cuenta: ubicar EXACTAMENTE la fila del deportista que
  // clicaste — carga hasta esa fila si hace falta, se desplaza a ella y la resalta.
  useEffect(() => {
    if (vista !== 'libro' || cargandoLibro || scrollRestaurado.current) return;
    let target: string | null = null;
    try { target = sessionStorage.getItem('cont_last_row'); } catch { /* noop */ }
    if (!target) { scrollRestaurado.current = true; return; }
    const idx = libroFiltrado.findIndex(m => m.id === target);
    if (idx < 0) { scrollRestaurado.current = true; return; }
    if (idx >= limite) { setLimite(idx + 20); return; } // cargar hasta esa fila y reintentar
    scrollRestaurado.current = true;
    setResaltarId(target);
    setTimeout(() => setResaltarId(null), 2800);
    requestAnimationFrame(() => {
      const el = document.getElementById('mov-' + target);
      if (el) el.scrollIntoView({ block: 'center' });
      try { sessionStorage.removeItem('cont_last_row'); } catch { /* noop */ }
    });
  }, [vista, cargandoLibro, libroFiltrado, limite]);

  // ── Editor / división de un movimiento ──
  function abrirEditor(m: MovCont) { setEditRow({ orig: m, filas: [{ ...m }] }); }
  function agregarFila() {
    setEditRow(er => er && ({
      ...er,
      filas: [...er.filas, {
        ...er.orig,
        // El id de la fila dividida DERIVA del id de la original (mismo prefijo). Así, aunque
        // todo el lote comparta 'creado', el orden por id las deja pegadas una debajo de la otra.
        id: er.orig.id ? `${er.orig.id}_d${Math.random().toString(36).slice(2, 6)}` : undefined,
        hash: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        debito: 0, credito: 0, saldo: null,
        // hereda 'creado' de la original (via ...er.orig) para quedar en el mismo grupo
      }],
    }));
  }
  function editarSplit(i: number, campo: keyof MovCont, val: any) {
    setEditRow(er => er && ({ ...er, filas: er.filas.map((r, j) => j === i ? { ...r, [campo]: val } : r) }));
  }
  function quitarSplit(i: number) {
    setEditRow(er => er && ({ ...er, filas: er.filas.filter((_, j) => j !== i) }));
  }
  async function guardarEditor() {
    if (!editRow || !editRow.filas.length) return;
    setGuardandoEd(true);
    try {
      const [orig, ...resto] = editRow.filas;
      if (orig.id) await actualizarMovimiento(orig.id, orig);
      const nuevos = resto.filter(r => (Number(r.debito) || 0) !== 0 || (Number(r.credito) || 0) !== 0 || !!r.concepto || !!r.codigo || !!r.detalle);
      if (nuevos.length) await guardarMovimientos(nuevos as MovCont[]);
      flash('Movimiento actualizado ✓');
      setEditRow(null);
      libroCache = null;              // invalidar caché para que se vean los cambios
      await cargarLibro(true);        // FORZAR recarga (no usar la caché vieja)
    } catch (e: any) { flash('Error al guardar: ' + (e?.message || e)); }
    setGuardandoEd(false);
  }

  async function sembrar() {
    if (!window.confirm('Sembrar el diccionario con ~4.600 cruces (una sola vez). ¿Continuar?')) return;
    setSembrando(true); setProgreso('Descargando diccionario…');
    try {
      const res = await fetch('/contabilidad/mapeo-seed.json');
      const arr = await res.json();
      await sembrarDiccionario(arr, (n, tot) => setProgreso(`Sembrando ${n}/${tot}…`));
      await getMapeoIndex().then(setIdx);
      await contarMapeo().then(setMapeoCount);
      flash('Diccionario sembrado ✓');
    } catch (e: any) { flash('Error sembrando: ' + (e?.message || e)); }
    setSembrando(false); setProgreso('');
  }

  async function exportarLibro() {
    const XLSX = await loadXLSX();
    // Exporta lo que se está viendo (cuenta + filtros aplicados), con CÓDIGO antes de DEPORTISTA.
    const rows = libroFiltrado.map(m => ({
      BANCO: m.banco, FECHA: m.fecha, DESCRIPCIÓN: m.descripcion, REFERENCIA: m.referencia,
      DÉBITO: m.debito, CRÉDITO: m.credito, SALDO: m.saldo, CONCEPTO: m.concepto,
      CÓDIGO: m.codigo, DEPORTISTA: m.deportista, DETALLE: m.detalle,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Libro');
    XLSX.writeFile(wb, `LibroDinamico_${(esTodas ? 'TODAS' : libroBanco).replace(/\s+/g, '')}.xlsx`);
  }

  const totRev = revision.length;
  const autom = revision.filter(r => !r._pendiente && r.id !== '__DUP__').length;
  const pend = revision.filter(r => r._pendiente && r.id !== '__DUP__').length;
  const dup = revision.filter(r => r.id === '__DUP__').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/20 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><Calculator className="w-4 h-4 text-white" /></div>
          <div>
            <h1 className="font-black text-white text-base sm:text-lg leading-tight">Contabilidad · Libro Dinámico</h1>
            <p className="text-white/60 text-xs">Sube el extracto del banco y el sistema arma el libro</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVista('diccionario')} title="Diccionario de cuentas y códigos"
            className="flex items-center gap-1.5 text-[11px] sm:text-xs font-black text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition">
            <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">Diccionario de cuentas y códigos</span><span className="sm:hidden">Diccionario</span> ({mapeoCount.toLocaleString('es-CO')})
          </button>
        </div>
      </header>

      {msg && <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg ${msg.startsWith('✓') ? 'bg-[#16a34a]' : msg.startsWith('⚠') ? 'bg-red-600' : 'bg-gray-900'}`}>{msg}</div>}

      {/* Barra de cambios pendientes del libro: nada se graba hasta pulsar "Guardar ahora" */}
      {vista === 'libro' && dirtyIds.size > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 bg-white border-2 border-[#16a34a] shadow-2xl rounded-full pl-4 pr-2 py-2">
          <span className="text-sm font-black text-gray-800">{dirtyIds.size} cambio(s) sin guardar</span>
          <button onClick={descartarCambiosLibro} disabled={guardandoCambios} className="text-xs font-bold text-gray-500 hover:text-gray-800 px-2 py-1.5 disabled:opacity-60">Descartar</button>
          <button onClick={guardarCambiosLibro} disabled={guardandoCambios} className="flex items-center gap-1.5 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-full hover:bg-[#064e1e] transition disabled:opacity-60">
            <Save className="w-4 h-4" /> {guardandoCambios ? 'Guardando…' : 'Guardar ahora'}
          </button>
        </div>
      )}

      {/* Estado de cuenta EN VENTANA sobre el libro — al cerrar, sigues en la misma fila */}
      {estadoCuentaUrl && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-1 sm:p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-5xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-[#064e1e] text-white flex-shrink-0">
              <span className="font-black text-sm">Estado de cuenta del deportista</span>
              <div className="flex items-center gap-2">
                <a href={estadoCuentaUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-white/80 hover:text-white underline">Abrir en pestaña</a>
                <button onClick={() => { setEstadoCuentaUrl(null); getPagadosKeys().then(keys => setPublicadas(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; })).catch(() => {}); }}
                  className="flex items-center gap-1 bg-white/20 hover:bg-white/35 px-3 py-1.5 rounded-lg text-sm font-black transition">
                  <X className="w-4 h-4" /> Volver al libro
                </button>
              </div>
            </div>
            <iframe src={estadoCuentaUrl} className="flex-1 w-full" style={{ border: 0 }} title="Estado de cuenta" />
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-5 space-y-4">

        {/* Controles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cuenta bancaria</label>
            <select value={banco} onChange={e => setBanco(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-xl cursor-pointer hover:bg-[#064e1e] transition">
            <Upload className="w-4 h-4" /> {cargando ? 'Leyendo…' : 'Subir extracto'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onArchivo} disabled={cargando} />
          </label>
          <div className="ml-auto flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
            {([['subir', 'Movimientos'], ['libro', 'Libro'], ['desconocidas', 'Por asignar'], ['cuentas', 'Cuentas']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setVista(v)}
                className={`text-sm font-black px-3 py-1.5 rounded-lg transition ${vista === v ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}>{l}</button>
            ))}
          </div>
          {mapeoCount < 100 && (
            <button onClick={sembrar} disabled={sembrando} className="flex items-center gap-1.5 border border-amber-300 text-amber-700 bg-amber-50 text-xs font-black px-3 py-2 rounded-xl hover:bg-amber-100 transition disabled:opacity-60">
              <Database className="w-4 h-4" /> {sembrando ? progreso || 'Sembrando…' : 'Sembrar diccionario'}
            </button>
          )}
          {movCount === 0 && (
            <button onClick={importarHist} disabled={importando} className="flex items-center gap-1.5 border border-blue-300 text-blue-700 bg-blue-50 text-xs font-black px-3 py-2 rounded-xl hover:bg-blue-100 transition disabled:opacity-60">
              <BookOpen className="w-4 h-4" /> {importando ? progreso || 'Importando…' : 'Importar histórico'}
            </button>
          )}
        </div>

        {/* ── Vista SUBIR / revisión ── */}
        {vista === 'subir' && (
          revision.length === 0 ? (
            cargando ? (
              <div className="bg-white rounded-2xl border-2 border-dashed border-green-200 p-12 text-center">
                <div className="w-10 h-10 border-4 border-green-200 border-t-[#16a34a] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-[#16a34a] font-black">Leyendo el archivo, un momento…</p>
                <p className="text-gray-400 text-sm mt-1">Separando débito/crédito y cruzando cada pago con su deportista.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                <Calculator className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">Sube el Excel del banco para empezar</p>
                <p className="text-gray-400 text-sm mt-1">El sistema separa débito/crédito, cruza cada pago con el deportista y arma el libro.</p>
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['Movimientos', totRev, '#374151'], ['Automáticos', autom, '#16a34a'], ['Por revisar', pend, '#f97316'], ['Ya existían', dup, '#6b7280']].map(([l, v, c]) => (
                  <div key={l as string} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
                    <p className="text-2xl font-black" style={{ color: c as string }}>{v as number}</p>
                    <p className="text-xs text-gray-400 font-medium">{l as string}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto" style={{ maxHeight: '62vh' }}>
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 920 }}>
                    <thead>
                      <tr>
                        {['FECHA', 'DESCRIPCIÓN', 'REFERENCIA', 'DÉBITO', 'CRÉDITO', 'CONCEPTO', 'DEPORTISTA / CÓDIGO'].map(h => (
                          <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {revision.map((r, i) => (
                        <FilaRevision key={i} r={r} i={i} deportistas={deportistas} conceptos={conceptos} onAsignar={asignarDeportista} onEditar={editarCampo} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={guardarLibro} disabled={guardando} className="flex items-center gap-2 bg-[#16a34a] text-white font-black px-6 py-3 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
                  <Save className="w-4 h-4" /> {guardando ? 'Guardando…' : `Guardar ${totRev - dup} en el libro`}
                </button>
              </div>
            </>
          )
        )}

        {/* ── Vista LIBRO ── */}
        {vista === 'libro' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
              {/* Selector de cuenta: TODAS pega las tres cuentas */}
              <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
                {['TODAS', ...BANCOS].map(b => (
                  <button key={b} onClick={() => setLibroBanco(b)}
                    className={`text-xs font-black px-2.5 py-1.5 rounded-lg transition ${libroBanco === b ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}>
                    {b === 'TODAS' ? 'Todas las cuentas' : b.replace('Bancolombia ', '')}
                  </button>
                ))}
              </div>
              <p className="font-black text-gray-700 text-sm">
                {hayFiltro || soloPorOrientar
                  ? <>{libroFiltrado.length.toLocaleString('es-CO')} <span className="text-gray-400 font-semibold">de {libro.length.toLocaleString('es-CO')}</span></>
                  : <>{libro.length.toLocaleString('es-CO')}</>} movimientos
              </p>
              <button onClick={() => setSoloPorOrientar(v => !v)} title="Pagos recibidos que aún no tienen deportista asignado"
                className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${soloPorOrientar ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
                {soloPorOrientar ? '✓ ' : ''}Por confirmar / orientar ({porOrientarCount.toLocaleString('es-CO')})
              </button>
              {numProblemas > 0 && (
                <span className="text-xs font-black text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg" title="Filas en rojo: mismo deportista con el mismo mes repetido. Revísalas y corrige el mes antes de actualizar.">
                  ⚠ {numProblemas.toLocaleString('es-CO')} con posible error (mes duplicado)
                </span>
              )}
              <button onClick={recalcularMeses} disabled={recalculando}
                title="Corrige el mes de los pagos del 5 de agosto en adelante al mes pendiente de cada deportista (no toca el estado de cuenta)"
                className="flex items-center gap-1.5 text-sm font-black text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition disabled:opacity-60">
                🔁 {recalculando ? 'Recalculando…' : 'Recalcular meses (5-ago+)'}
              </button>
              {hayFiltro && (
                <button onClick={() => setFil(filVacio)}
                  className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition">
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
              <button onClick={actualizarEstadosCuenta} disabled={publicando}
                title="Publica al estado de cuenta de los deportistas los pagos verificados del libro (acción manual)"
                className="ml-auto flex items-center gap-1.5 text-sm font-black text-white bg-blue-600 border border-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                ⬆ {publicando ? 'Publicando…' : 'Actualizar estados de cuenta'}
              </button>
              <button onClick={() => setPanelCols(v => !v)} className={`flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-lg border transition ${panelCols ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'text-gray-600 bg-white border-gray-200 hover:bg-gray-100'}`}>
                ⚙ Columnas
              </button>
              <button onClick={exportarLibro} disabled={!libroFiltrado.length} className="flex items-center gap-1.5 text-sm font-black text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition disabled:opacity-50">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>

            {/* Panel para ajustar el ancho de columnas con − / + (sin arrastrar) */}
            {panelCols && (
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black text-gray-600">Ajustar ancho de columnas</p>
                  <button onClick={resetTodasCols} className="text-[11px] font-black text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-100 transition">Restablecer todo</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {colsVis.filter(c => c.label).map(c => (
                    <div key={c.key} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                      <span className="text-[11px] font-bold text-gray-600 mr-1">{c.label}</span>
                      <button onClick={() => pasoCol(c.key, -20)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black">−</button>
                      <span className="text-[11px] text-gray-400 w-8 text-center tabular-nums">{colW[c.key] ?? c.def}</span>
                      <button onClick={() => pasoCol(c.key, 20)} className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-black">+</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="px-4 py-1.5 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
              💡 ¿Ajustar columnas? Usa el botón <b>⚙ Columnas</b> (botones − / +, sin arrastrar). También puedes arrastrar la línea blanca del borde del encabezado.
            </p>
            <datalist id="codigos-libro">
              {codigosUnicos.map(c => <option key={c} value={c} />)}
            </datalist>
            <div ref={scrollRef} className="overflow-x-auto" style={{ maxHeight: '72vh' }}>
              <table className="border-collapse text-xs" style={{ tableLayout: 'fixed', width: colsVis.reduce((s, c) => s + (colW[c.key] ?? c.def), 0) }}>
                <colgroup>
                  {colsVis.map(c => <col key={c.key} style={{ width: colW[c.key] ?? c.def }} />)}
                </colgroup>
                <thead>
                  <tr>
                    {colsVis.map(c => (
                      <th key={c.key} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 4px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>
                        {c.label}
                        <ColResizer onDown={e => iniciarResize(c.key, e)} onReset={() => resetCol(c.key)} />
                      </th>
                    ))}
                  </tr>
                  {/* Fila de filtros por columna (una casilla por columna) */}
                  <tr>
                    <th style={thFil}>
                      <select value={filChulo} onChange={e => setFilChulo(e.target.value as 'todos' | 'verde' | 'rojo')}
                        title="Filtrar por el chulo: todos, solo confirmados (verde) o solo pendientes (rojo)"
                        style={{ ...inpFil, cursor: 'pointer', textAlign: 'center', fontWeight: 800 }}>
                        <option value="todos">Todos</option>
                        <option value="verde">🟢 Confirmados</option>
                        <option value="rojo">🔴 Pendientes</option>
                      </select>
                    </th>
                    <th style={thFil}></th>
                    {esTodas && <th style={thFil}><input value={fil.banco} onChange={e => setFil(f => ({ ...f, banco: e.target.value }))} placeholder="613…" style={inpFil} /></th>}
                    <th style={thFil}><input value={fil.fecha} onChange={e => setFil(f => ({ ...f, fecha: e.target.value }))} placeholder="2026-08…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.desc} onChange={e => setFil(f => ({ ...f, desc: e.target.value }))} placeholder="buscar…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.debito} onChange={e => setFil(f => ({ ...f, debito: e.target.value }))} placeholder="débito…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.credito} onChange={e => setFil(f => ({ ...f, credito: e.target.value }))} placeholder="crédito…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.saldo} onChange={e => setFil(f => ({ ...f, saldo: e.target.value }))} placeholder="saldo…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.concepto} onChange={e => setFil(f => ({ ...f, concepto: e.target.value }))} placeholder="concepto…" style={inpFil} /></th>
                    <th style={thFil}><input list="codigos-libro" value={fil.codigo} onChange={e => setFil(f => ({ ...f, codigo: e.target.value }))} placeholder="exacto: 25450" style={{ ...inpFil, fontWeight: 800 }} /></th>
                    <th style={thFil}><input value={fil.deportista} onChange={e => setFil(f => ({ ...f, deportista: e.target.value }))} placeholder="nombre…" style={inpFil} /></th>
                    <th style={thFil}><input value={fil.detalle} onChange={e => setFil(f => ({ ...f, detalle: e.target.value }))} placeholder="detalle…" style={inpFil} /></th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoLibro ? (
                    <tr><td colSpan={esTodas ? 12 : 11} className="text-center py-10 text-gray-400 font-semibold">Cargando…</td></tr>
                  ) : libro.length === 0 ? (
                    <tr><td colSpan={esTodas ? 12 : 11} className="text-center py-10 text-gray-400 font-semibold">Este libro aún no tiene movimientos.</td></tr>
                  ) : libroFiltrado.length === 0 ? (
                    <tr><td colSpan={esTodas ? 12 : 11} className="text-center py-10 text-gray-400 font-semibold">Ningún movimiento coincide con el filtro.</td></tr>
                  ) : visiblesVista.map((m, i) => (
                    <tr key={m.id || i} id={'mov-' + (m.id || '')}
                      title={filasProblema[m.id || ''] || undefined}
                      onMouseEnter={() => setHoverId(m.id || null)}
                      onMouseLeave={() => setHoverId(h => (h === m.id ? null : h))}
                      style={{ background: hoverId === m.id ? '#cfe3ff' : resaltarId === m.id ? '#bbf7d0' : filasProblema[m.id || ''] ? '#fee2e2' : dirtyIds.has(m.id || '') ? '#fef9c3' : (i % 2 ? '#f8fafc' : '#fff'), transition: 'background 0.12s', outline: hoverId === m.id ? '2px solid #3b82f6' : resaltarId === m.id ? '2px solid #16a34a' : filasProblema[m.id || ''] ? '1px solid #ef4444' : undefined }}>
                      <td style={{ ...tdC, padding: '1px' }}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button onClick={() => abrirEditor(m)} title="Editar / dividir" className="text-gray-400 hover:text-green-700 p-0.5 rounded hover:bg-green-50 transition">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {(() => {
                            const yaPub = publicadas.has(String(m.codigo ?? '').trim() + '|' + String(m.detalle ?? '').trim());
                            return (
                              <button onClick={() => actualizarPagoFila(m)}
                                title={yaPub ? 'Confirmado ✓ — ya está en el estado de cuenta (clic para volver a publicar)' : 'Sin confirmar — clic para actualizar este pago en el estado de cuenta'}
                                className={`p-0.5 rounded transition ${yaPub ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-red-500 hover:text-red-700 hover:bg-red-50'}`}>
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                      <td style={{ ...tdC, color: '#94a3b8', fontWeight: 700, background: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>{numFila[m.id || ''] ?? ''}</td>
                      {esTodas && <td style={{ ...tdC, fontWeight: 700, color: '#475569' }}>{String(m.banco || '').replace('Bancolombia ', '')}</td>}
                      <td style={tdC}>{m.fecha}</td>
                      <td style={{ ...tdC, textAlign: 'left' }} title={m.descripcion}>{m.descripcion}</td>
                      <td style={{ ...tdC, textAlign: 'right', color: '#dc2626' }}>{m.debito ? fmt(m.debito) : ''}</td>
                      <td style={{ ...tdC, textAlign: 'right', color: '#16a34a' }}>{m.credito ? fmt(m.credito) : ''}</td>
                      <td style={{ ...tdC, textAlign: 'right', fontWeight: 700 }}>{fmt(m.saldo || 0)}</td>
                      <td style={{ ...tdC, padding: '2px 4px', cursor: 'pointer', textAlign: 'left' }} title={m.concepto}
                        onClick={() => setEditCell({ id: m.id || '', campo: 'concepto' })}>
                        {editCell?.id === m.id && editCell.campo === 'concepto' ? (
                          <select autoFocus value={m.concepto || ''}
                            onChange={e => { cambiarCampoLibro(m, 'concepto', e.target.value); setEditCell(null); }}
                            onBlur={() => setEditCell(null)}
                            style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 2px', fontSize: 11, background: '#fff' }}>
                            <option value="">—</option>
                            {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            {m.concepto && !conceptos.some(c => c.nombre === m.concepto) && <option value={m.concepto}>{m.concepto}</option>}
                          </select>
                        ) : (
                          <span className="block truncate">{m.concepto || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                        )}
                      </td>
                      <td style={{ ...tdC, padding: '2px 3px', cursor: 'pointer', background: m.codigo ? '#16a34a' : undefined, color: m.codigo ? '#fff' : undefined, fontWeight: 900 }}
                        title="Clic para cambiar o borrar el código del deportista"
                        onClick={() => setEditCell({ id: m.id || '', campo: 'codigo' })}>
                        {editCell?.id === m.id && editCell.campo === 'codigo' ? (
                          <input autoFocus list="codigos-libro" defaultValue={m.codigo || ''}
                            onClick={e => e.stopPropagation()}
                            onBlur={e => { cambiarCampoLibro(m, 'codigo', e.target.value.trim()); setEditCell(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditCell(null); }}
                            placeholder="(vacío = quitar)"
                            style={{ width: '100%', border: '1px solid #fff', borderRadius: 4, padding: '1px 3px', fontSize: 11, fontWeight: 800, textAlign: 'center', color: '#111', background: '#fff' }} />
                        ) : (
                          <span>{m.codigo
                            ? m.codigo
                            : (m.referencia
                                ? <span className="block truncate" style={{ color: '#64748b', fontWeight: 700, fontStyle: 'italic', fontSize: 10 }}
                                    title={'Cuenta del extracto (sin asignar): ' + m.referencia + ' — clic para anexarle el código del deportista'}>
                                    {m.referencia}
                                  </span>
                                : <span style={{ color: '#cbd5e1' }}>—</span>)}</span>
                        )}
                      </td>
                      <td style={{ ...tdC, textAlign: 'left' }} title={m.deportista}>
                        {(() => {
                          // id por código; si el código no está en la ficha, se busca por nombre
                          const depId = codToId[m.codigo] || (m.deportista ? nombreToId[normNombre(m.deportista)] : '');
                          return m.deportista && depId ? (
                            <button onClick={() => setEstadoCuentaUrl(`/alumnos/${depId}/estado-cuenta?edit=1`)}
                              className="text-left text-green-700 hover:text-green-900 hover:underline font-semibold w-full truncate"
                              title={`Ver estado de cuenta de ${m.deportista} (se abre en ventana, sin salir del libro)`}>
                              {m.deportista}
                            </button>
                          ) : m.deportista;
                        })()}
                      </td>
                      <td style={{ ...tdC, padding: '2px 4px', cursor: 'pointer', textAlign: 'left' }} title={m.detalle}
                        onClick={() => setEditCell({ id: m.id || '', campo: 'detalle' })}>
                        {editCell?.id === m.id && editCell.campo === 'detalle' ? (
                          <select autoFocus value={m.detalle || ''}
                            onChange={e => { cambiarCampoLibro(m, 'detalle', e.target.value); setEditCell(null); }}
                            onBlur={() => setEditCell(null)}
                            style={{ width: '100%', border: '1px solid #16a34a', borderRadius: 4, padding: '1px 2px', fontSize: 11, background: '#fff' }}>
                            <option value="">—</option>
                            {DETALLE_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                            {m.detalle && !DETALLE_OPCIONES.includes(m.detalle) && <option value={m.detalle}>{m.detalle}</option>}
                          </select>
                        ) : (
                          <span className="block truncate">{m.detalle || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {libroFiltrado.length > 0 && (
                  <tfoot>
                    <tr>
                      <td style={tfootTd}></td>
                      <td style={tfootTd}></td>
                      {esTodas && <td style={tfootTd}></td>}
                      <td style={tfootTd} colSpan={2}>TOTALES ({libroFiltrado.length.toLocaleString('es-CO')})</td>
                      <td style={{ ...tfootTd, textAlign: 'right', color: '#dc2626' }}>{fmt(totDebito)}</td>
                      <td style={{ ...tfootTd, textAlign: 'right', color: '#16a34a' }}>{fmt(totCredito)}</td>
                      <td style={tfootTd} colSpan={5}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {!cargandoLibro && libroFiltrado.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs font-bold text-gray-500">
                  Mostrando {visibles.length.toLocaleString('es-CO')} de {libroFiltrado.length.toLocaleString('es-CO')}
                </span>
                {visibles.length < libroFiltrado.length && (
                  <>
                    <button onClick={() => setLimite(l => l + 100)} className="text-xs font-black text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition">
                      Mostrar 100 más (hacia atrás)
                    </button>
                    <button onClick={() => setLimite(libroFiltrado.length)} className="text-xs font-black text-white bg-[#16a34a] border border-[#16a34a] px-3 py-1.5 rounded-lg hover:bg-[#064e1e] transition">
                      Mostrar todos ({libroFiltrado.length.toLocaleString('es-CO')})
                    </button>
                    <span className="text-[11px] text-gray-400">— o usa los filtros de arriba para acotar (por código, cifra, nombre…)</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Vista POR ASIGNAR (cuentas desconocidas → diccionario) ── */}
        {vista === 'desconocidas' && (
          <DesconocidasEditor deportistas={deportistas} conceptos={conceptos} flash={flash} />
        )}

        {/* ── Vista DICCIONARIO (cuentas/nombres → código) ── */}
        {vista === 'diccionario' && (
          <DiccionarioEditor codMap={codMap} flash={flash} onCount={setMapeoCount} />
        )}

        {/* ── Vista CUENTAS (catálogo editable) ── */}
        {vista === 'cuentas' && (
          <CuentasEditor conceptos={conceptos} onCambio={setConceptos} flash={flash} />
        )}
      </main>

      {/* ── Editor / división de un movimiento ── */}
      {editRow && (() => {
        const sumDeb = editRow.filas.reduce((s, r) => s + (Number(r.debito) || 0), 0);
        const sumCred = editRow.filas.reduce((s, r) => s + (Number(r.credito) || 0), 0);
        const origDeb = Number(editRow.orig.debito) || 0;
        const origCred = Number(editRow.orig.credito) || 0;
        const okDeb = Math.round(sumDeb) === Math.round(origDeb);
        const okCred = Math.round(sumCred) === Math.round(origCred);
        const inp: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none' };
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !guardandoEd && setEditRow(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                <h3 className="font-black text-gray-800">Editar / dividir movimiento</h3>
                <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-700 p-1"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-5 py-2 text-[12px] text-gray-500 bg-gray-50 border-b border-gray-100">
                <b>{editRow.orig.banco}</b> · {editRow.orig.fecha} · <span className="text-gray-600">{editRow.orig.descripcion}</span>
                <br />Valor original: {origDeb ? <span className="text-red-600 font-bold">débito {fmt(origDeb)}</span> : <span className="text-green-700 font-bold">crédito {fmt(origCred)}</span>}
                <span className="text-gray-400"> — La primera fila edita el movimiento original; las que agregues se crean como nuevas.</span>
              </div>
              <div className="p-5 space-y-3">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {['', 'FECHA', 'CONCEPTO', 'CÓDIGO', 'DEPORTISTA', 'DETALLE (mes)', 'DÉBITO', 'CRÉDITO', ''].map((h, hi) => (
                        <th key={h || `e${hi}`} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '5px 6px', fontSize: 10, fontWeight: 900, color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {editRow.filas.map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 800, color: i === 0 ? '#16a34a' : '#64748b', fontSize: 10 }}>{i === 0 ? 'original' : 'nueva'}</td>
                        <td style={{ ...td, padding: 3 }}><input type="date" value={r.fecha || ''} onChange={e => editarSplit(i, 'fecha', e.target.value)} style={{ ...inp, minWidth: 130 }} /></td>
                        <td style={{ ...td, padding: 3 }}>
                          <select value={r.concepto || ''} onChange={e => editarSplit(i, 'concepto', e.target.value)} style={inp}>
                            <option value="">—</option>
                            {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                            {r.concepto && !conceptos.some(c => c.nombre === r.concepto) && <option value={r.concepto}>{r.concepto}</option>}
                          </select>
                        </td>
                        <td style={{ ...td, padding: 3 }}><input value={r.codigo || ''} onChange={e => editarSplit(i, 'codigo', e.target.value)} style={{ ...inp, minWidth: 70, fontWeight: 700 }} /></td>
                        <td style={{ ...td, padding: 3 }}><input value={r.deportista || ''} onChange={e => editarSplit(i, 'deportista', e.target.value)} style={{ ...inp, minWidth: 130 }} /></td>
                        <td style={{ ...td, padding: 3 }}>
                          <select value={r.detalle || ''} onChange={e => editarSplit(i, 'detalle', e.target.value)} style={{ ...inp, minWidth: 120 }}>
                            <option value="">—</option>
                            {DETALLE_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                            {r.detalle && !DETALLE_OPCIONES.includes(r.detalle) && <option value={r.detalle}>{r.detalle}</option>}
                          </select>
                        </td>
                        <td style={{ ...td, padding: 3 }}><input value={r.debito || ''} onChange={e => editarSplit(i, 'debito', numVal(e.target.value))} style={{ ...inp, textAlign: 'right', color: '#dc2626' }} /></td>
                        <td style={{ ...td, padding: 3 }}><input value={r.credito || ''} onChange={e => editarSplit(i, 'credito', numVal(e.target.value))} style={{ ...inp, textAlign: 'right', color: '#16a34a' }} /></td>
                        <td style={{ ...td, padding: 3 }}>
                          {i > 0 && <button onClick={() => quitarSplit(i)} title="Quitar fila" className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#334155' }}>Suma de las filas:</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: okDeb ? '#16a34a' : '#dc2626' }}>{fmt(sumDeb)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: okCred ? '#16a34a' : '#dc2626' }}>{fmt(sumCred)}</td>
                      <td style={td}></td>
                    </tr>
                  </tfoot>
                </table>

                {(!okDeb || !okCred) && (
                  <p className="text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ La suma de las filas no coincide con el valor original. Puedes guardar igual, pero revisa que sea lo que quieres.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button onClick={agregarFila} className="flex items-center gap-1.5 text-sm font-black text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl hover:bg-green-100 transition">
                    <Plus className="w-4 h-4" /> Agregar fila
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setEditRow(null)} disabled={guardandoEd} className="text-sm font-bold text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100 transition disabled:opacity-60">Cancelar</button>
                    <button onClick={guardarEditor} disabled={guardandoEd} className="flex items-center gap-2 bg-[#16a34a] text-white font-black px-5 py-2 rounded-xl hover:bg-[#064e1e] transition disabled:opacity-60">
                      <Save className="w-4 h-4" /> {guardandoEd ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const td: React.CSSProperties = { border: '1px solid #eef2f7', padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' };
// Celda compacta para el Libro con tableLayout fijo: recorta con "…" y no desborda
const tdC: React.CSSProperties = { border: '1px solid #eef2f7', padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
// Celda y control de la fila de filtros (queda pegada bajo el encabezado)
const thFil: React.CSSProperties = { position: 'sticky', top: 28, zIndex: 2, background: '#ecfdf5', border: '1px solid #fff', padding: '3px 4px' };
const inpFil: React.CSSProperties = { width: '100%', minWidth: 60, border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 6px', fontSize: 11, outline: 'none' };
const tfootTd: React.CSSProperties = { position: 'sticky', bottom: 0, zIndex: 2, background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '7px 8px', fontSize: 11, fontWeight: 900, color: '#334155', textAlign: 'center', whiteSpace: 'nowrap' };

// ── Fila de revisión con buscador de deportista para pendientes ──
function FilaRevision({ r, i, deportistas, conceptos, onAsignar, onEditar }: {
  r: MovCont; i: number; deportistas: Deportista[]; conceptos: Concepto[];
  onAsignar: (i: number, cod: string, nombre: string) => void;
  onEditar: (i: number, campo: keyof MovCont, val: string) => void;
}) {
  const [q, setQ] = useState('');
  const dup = r.id === '__DUP__';
  const sug = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return deportistas.filter(d => {
      const cod = getCod(d);
      return d._nombre.toLowerCase().includes(t) || cod.includes(t);
    }).slice(0, 8);
  }, [q, deportistas]);

  const bg = dup ? '#f3f4f6' : r._pendiente ? '#fff7ed' : '#fff';
  return (
    <tr style={{ background: bg, opacity: dup ? 0.55 : 1 }}>
      <td style={td}>{r.fecha}</td>
      <td style={{ ...td, textAlign: 'left', maxWidth: 220 }} className="truncate" title={r.descripcion}>{r.descripcion}</td>
      <td style={{ ...td, textAlign: 'left', maxWidth: 140 }} className="truncate" title={r.referencia}>{r.referencia}</td>
      <td style={{ ...td, textAlign: 'right', color: '#dc2626' }}>{r.debito ? fmt(r.debito) : ''}</td>
      <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{r.credito ? fmt(r.credito) : ''}</td>
      <td style={{ ...td }}>
        <select value={r.concepto} onChange={e => onEditar(i, 'concepto', e.target.value)}
          className="w-36 border border-gray-200 rounded px-1.5 py-1 text-[11px] font-semibold text-gray-700 bg-white">
          <option value="">—</option>
          {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          {r.concepto && !conceptos.some(c => c.nombre === r.concepto) && (
            <option value={r.concepto}>{r.concepto}</option>
          )}
        </select>
      </td>
      <td style={{ ...td, textAlign: 'left', minWidth: 200 }}>
        {dup ? <span className="text-[10px] font-bold text-gray-400">ya en el libro</span>
          : r.codigo ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{r.codigo}</span>
              <span className="text-[11px] font-semibold text-gray-700 truncate max-w-[150px]">{r.deportista}</span>
            </span>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1 border border-orange-300 rounded px-1.5 py-1 bg-white">
                <Search className="w-3 h-3 text-orange-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar deportista…" className="w-32 text-[11px] focus:outline-none" />
              </div>
              {sug.length > 0 && (
                <div className="absolute z-20 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {sug.map(d => {
                    const cod = getCod(d);
                    return (
                      <button key={d.id} onClick={() => { onAsignar(i, cod, d._nombre); setQ(''); }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-green-50 text-[11px] flex items-center gap-2">
                        <span className="font-black text-green-700">{cod}</span>
                        <span className="text-gray-700 truncate">{d._nombre}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
      </td>
    </tr>
  );
}

// ── Vista "Diccionario": administra los cruces cuenta/nombre → código ──
function DiccionarioEditor({ codMap, flash, onCount }: {
  codMap: Record<string, string>;
  flash: (t: string) => void;
  onCount: (n: number) => void;
}) {
  const [rows, setRows] = useState<{ id: string; tipo: string; clave: string; codigo: string; orig?: string }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [q, setQ] = useState('');
  const [limite, setLimite] = useState(300);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  // Agregar un cruce nuevo a mano (cuenta/nombre → código)
  const [nuevaClave, setNuevaClave] = useState('');
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [agregando, setAgregando] = useState(false);

  async function agregarCruce() {
    const claveRaw = nuevaClave.trim();
    const cod = nuevoCodigo.trim();
    if (!claveRaw || !cod) { flash('⚠ Escribe la cuenta o nombre y el código.'); return; }
    // Si es numérico (≥5 dígitos) → cuenta; si no → nombre (normalizado, igual que al importar)
    const dig = soloDigitos(claveRaw);
    const esCuenta = dig.length >= 5 && /^[0-9\s.\-]+$/.test(claveRaw);
    const tipo = esCuenta ? 'cuenta' : 'nombre';
    const clave = esCuenta ? dig : normNombre(claveRaw);
    if (!clave) { flash('⚠ Cuenta o nombre inválido.'); return; }
    setAgregando(true);
    try { await guardarMapeo([{ tipo, clave, codigo: cod }]); } catch { /* noop */ }
    setAgregando(false);
    setNuevaClave(''); setNuevoCodigo('');
    flash(`✓ Cruce agregado: ${clave} → ${cod}`);
    cargar();
  }

  function cargar() {
    setCargando(true);
    getMapeoRows().then(r => { setRows(r.map(x => ({ ...x, orig: x.clave }))); onCount(r.length); }).catch(() => {}).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { setLimite(300); }, [q]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    const tCta = t.replace(/\D/g, '').replace(/^0+/, ''); // cuenta buscada sin ceros a la izquierda
    return rows.filter(r =>
      String(r.clave || '').toLowerCase().includes(t) ||
      (!!tCta && normCuenta(r.clave).includes(tCta)) ||
      String(r.codigo || '').toLowerCase().includes(t) ||
      String(codMap[r.codigo] || '').toLowerCase().includes(t)
    );
  }, [q, rows, codMap]);
  const vis = filtradas.slice(0, limite);

  function editarLocal(id: string, codigo: string) { setRows(prev => prev.map(r => r.id === id ? { ...r, codigo } : r)); }
  function editarLocalClave(id: string, clave: string) { setRows(prev => prev.map(r => r.id === id ? { ...r, clave } : r)); }
  async function guardar(r: { id: string; tipo: string; clave: string; codigo: string; orig?: string }) {
    const cod = String(r.codigo || '').trim();
    // La cuenta/nombre se normaliza igual que al importar (dígitos si es cuenta, texto normalizado si es nombre)
    const claveNorm = r.tipo === 'cuenta' ? soloDigitos(r.clave) : normNombre(r.clave);
    if (!claveNorm || !cod) { flash('⚠ La cuenta/nombre y el código no pueden quedar vacíos.'); return; }
    setGuardandoId(r.id);
    await guardarMapeo([{ tipo: r.tipo, clave: claveNorm, codigo: cod }]);
    // Si se cambió la cuenta/nombre, el cruce viejo queda huérfano → se elimina
    if (r.orig && r.orig !== claveNorm) { try { await borrarMapeo(r.id); } catch { /* noop */ } }
    setGuardandoId(null);
    flash('Cruce actualizado ✓');
    cargar();
  }
  async function eliminar(r: { id: string; clave: string; codigo: string }) {
    if (!window.confirm(`¿Eliminar el cruce "${r.clave}" → ${r.codigo}? Los movimientos ya guardados no cambian.`)) return;
    const ok = await borrarMapeo(r.id);
    if (ok) { setRows(prev => { const n = prev.filter(x => x.id !== r.id); onCount(n.length); return n; }); flash('Cruce eliminado'); }
    else flash('No se pudo eliminar.');
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
        <p className="font-black text-gray-700 text-sm">Diccionario de cuentas y códigos <span className="text-gray-400 font-semibold">({rows.length.toLocaleString('es-CO')})</span></p>
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cuenta, código o deportista…" className="w-56 text-xs focus:outline-none" />
        </div>
        <button onClick={cargar} disabled={cargando} className="ml-auto text-xs font-black text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition disabled:opacity-60">{cargando ? 'Cargando…' : 'Actualizar'}</button>
      </div>
      {/* Agregar un cruce nuevo a mano */}
      <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-gray-100 bg-green-50/40">
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-gray-500 mb-0.5">CUENTA O NOMBRE</label>
          <input value={nuevaClave} onChange={e => setNuevaClave(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') agregarCruce(); }}
            placeholder="Ej: 10202589777  o  MARIA MEZA 4155"
            className="w-64 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-green-500" />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] font-black text-gray-500 mb-0.5">CÓDIGO</label>
          <input list="codigos-libro" value={nuevoCodigo} onChange={e => setNuevoCodigo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') agregarCruce(); }}
            placeholder="25277"
            className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-center focus:outline-none focus:border-green-500" />
        </div>
        <button onClick={agregarCruce} disabled={agregando}
          className="flex items-center gap-1.5 text-xs font-black text-white bg-[#16a34a] border border-[#16a34a] px-3 py-2 rounded-lg hover:bg-[#064e1e] transition disabled:opacity-60">
          <Plus className="w-3.5 h-3.5" /> {agregando ? 'Agregando…' : 'Agregar al diccionario'}
        </button>
        <span className="text-[11px] text-gray-400">Si es número = cuenta; si es texto = nombre. Se usará para cruzar el próximo extracto.</span>
      </div>
      <p className="px-4 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
        Cada fila es un cruce aprendido: cuando en un extracto llega una cuenta o nombre igual, se le pone este código automáticamente. Puedes corregir un código o eliminar un cruce equivocado.
      </p>
      <div className="overflow-x-auto" style={{ maxHeight: '62vh' }}>
        <table className="w-full border-collapse text-xs" style={{ minWidth: 720 }}>
          <thead><tr>
            {['TIPO', 'CUENTA / NOMBRE', 'CÓDIGO', 'DEPORTISTA', ''].map(h => (
              <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400 font-semibold">Cargando…</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400 font-semibold">No hay cruces que coincidan.</td></tr>
            ) : vis.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                <td style={{ ...td, fontSize: 10, color: '#64748b', fontWeight: 700 }}>{r.tipo === 'cuenta' ? 'CUENTA' : 'NOMBRE'}</td>
                <td style={{ ...td, textAlign: 'left' }} title={r.clave}>
                  <input value={r.clave} onChange={e => editarLocalClave(r.id, e.target.value)}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px] font-semibold" />
                </td>
                <td style={{ ...td, width: 110 }}>
                  <input value={r.codigo} onChange={e => editarLocal(r.id, e.target.value)} className="w-24 border border-gray-200 rounded px-1.5 py-1 text-[11px] text-center font-bold" />
                </td>
                <td style={{ ...td, textAlign: 'left' }} title={codMap[r.codigo] || ''}>{codMap[r.codigo] || <span className="text-gray-300">—</span>}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => guardar(r)} disabled={guardandoId === r.id} className="text-[11px] font-black text-white bg-[#16a34a] px-2.5 py-1 rounded-lg hover:bg-[#064e1e] transition disabled:opacity-60">{guardandoId === r.id ? '…' : 'Guardar'}</button>
                    <button onClick={() => eliminar(r)} title="Eliminar" className="text-gray-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!cargando && filtradas.length > vis.length && (
        <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs font-bold text-gray-500">Mostrando {vis.length.toLocaleString('es-CO')} de {filtradas.length.toLocaleString('es-CO')}</span>
          <button onClick={() => setLimite(l => l + 500)} className="text-xs font-black text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition">Mostrar 500 más</button>
        </div>
      )}
    </div>
  );
}

// ── Vista "Por asignar": agrupa los pagos sin código y permite cruzarlos ──
function DesconocidasEditor({ deportistas, conceptos, flash }: {
  deportistas: Deportista[];
  conceptos: Concepto[];
  flash: (t: string) => void;
}) {
  const [movs, setMovs] = useState<MovCont[]>([]);
  const [cargando, setCargando] = useState(false);
  const [asignando, setAsignando] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    getMovimientos().then(setMovs).catch(() => {}).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); }, []);

  const grupos = useMemo(() => {
    const map: Record<string, { key: string; ref: string; movs: MovCont[]; total: number; ejemplo: string }> = {};
    for (const m of movs) {
      if ((m.codigo || '').trim()) continue;
      if (!(Number(m.credito) > 0)) continue;
      const ref = String(m.referencia || '').trim();
      const key = ref || '(sin referencia)';
      if (!map[key]) map[key] = { key, ref, movs: [], total: 0, ejemplo: m.descripcion || '' };
      map[key].movs.push(m);
      map[key].total += Number(m.credito) || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [movs]);

  const totalMovs = useMemo(() => grupos.reduce((s, g) => s + g.movs.length, 0), [grupos]);

  async function asignar(g: { key: string; ref: string; movs: MovCont[] }, cod: string, nombre: string, concepto: string) {
    setAsignando(g.key);
    // 1) aprender en el diccionario (para que el próximo extracto se cruce solo).
    //    Los PAGO QR y referencias "null" NO se aprenden: su cuenta es del recaudo/QR,
    //    compartida por muchos pagadores, y ensuciaría el diccionario.
    const refDig = soloDigitos(g.ref);
    const refConfiable = !/null/i.test(g.ref || '') && !g.movs.some(m => /PAGO\s*QR/i.test(m.descripcion || ''));
    if (refConfiable && refDig.length >= 5) await guardarMapeo([{ tipo: 'cuenta', clave: refDig, codigo: cod }]);
    else if (refConfiable) { const kn = normNombre(g.ref); if (kn) await guardarMapeo([{ tipo: 'nombre', clave: kn, codigo: cod }]); }
    // 2) corregir los movimientos existentes (agrupados por mes para el Detalle)
    const porMes: Record<string, string[]> = {};
    for (const m of g.movs) { const mes = mesDesdeFecha(m.fecha); (porMes[mes] = porMes[mes] || []).push(m.id || ''); }
    let ok = true;
    for (const mes of Object.keys(porMes)) {
      const r = await asignarCodigoBulk(porMes[mes], { codigo: cod, deportista: nombre, concepto: concepto || 'APORTE FORMACIÓN', detalle: mes });
      if (!r) ok = false;
    }
    // 3) quitar del listado local
    const ids = new Set(g.movs.map(m => m.id));
    setMovs(prev => prev.map(m => (ids.has(m.id) ? { ...m, codigo: cod, deportista: nombre } : m)));
    setAsignando(null);
    flash(ok ? `Asignados ${g.movs.length} movimientos a ${nombre} (${cod}) y guardado en el diccionario ✓` : 'Se guardó el diccionario, pero hubo un error actualizando algunos movimientos.');
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
        <p className="font-black text-gray-700 text-sm">
          Cuentas por asignar <span className="text-gray-400 font-semibold">({grupos.length} · {totalMovs.toLocaleString('es-CO')} movimientos)</span>
        </p>
        <button onClick={cargar} disabled={cargando} className="ml-auto text-xs font-black text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition disabled:opacity-60">
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      <p className="px-4 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
        Son pagos recibidos que el sistema no pudo cruzar con un deportista. Asigna cada cuenta: se corrige en el libro y queda guardado en el diccionario para que el próximo extracto se cruce solo.
      </p>
      <div className="overflow-x-auto" style={{ maxHeight: '64vh' }}>
        <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              {['REFERENCIA / CUENTA', 'MOV.', 'TOTAL $', 'EJEMPLO DESCRIPCIÓN', 'CONCEPTO', 'ASIGNAR DEPORTISTA'].map(h => (
                <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400 font-semibold">Cargando…</td></tr>
            ) : grupos.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-green-600 font-semibold">🎉 No hay cuentas por asignar. Todos los pagos están cruzados.</td></tr>
            ) : grupos.map(g => (
              <FilaDesconocida key={g.key} g={g} deportistas={deportistas} conceptos={conceptos} onAsignar={asignar} busy={asignando === g.key} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaDesconocida({ g, deportistas, conceptos, onAsignar, busy }: {
  g: { key: string; ref: string; movs: MovCont[]; total: number; ejemplo: string };
  deportistas: Deportista[];
  conceptos: Concepto[];
  onAsignar: (g: any, cod: string, nombre: string, concepto: string) => void;
  busy: boolean;
}) {
  const [q, setQ] = useState('');
  const [concepto, setConcepto] = useState('APORTE FORMACIÓN');
  const sug = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return deportistas.filter(d => { const cod = getCod(d); return d._nombre.toLowerCase().includes(t) || cod.includes(t); }).slice(0, 8);
  }, [q, deportistas]);
  return (
    <tr style={{ background: '#fff' }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{g.ref || '(sin referencia)'}</td>
      <td style={td}>{g.movs.length}</td>
      <td style={{ ...td, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{fmt(g.total)}</td>
      <td style={{ ...td, textAlign: 'left', maxWidth: 240 }} className="truncate" title={g.ejemplo}>{g.ejemplo}</td>
      <td style={{ ...td }}>
        <select value={concepto} onChange={e => setConcepto(e.target.value)}
          className="w-36 border border-gray-200 rounded px-1.5 py-1 text-[11px] font-semibold text-gray-700 bg-white">
          <option value="APORTE FORMACIÓN">APORTE FORMACIÓN</option>
          {conceptos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          {concepto && concepto !== 'APORTE FORMACIÓN' && !conceptos.some(c => c.nombre === concepto) && (
            <option value={concepto}>{concepto}</option>
          )}
        </select>
      </td>
      <td style={{ ...td, textAlign: 'left', minWidth: 220 }}>
        {busy ? <span className="text-[11px] font-bold text-gray-400">Asignando…</span> : (
          <div className="relative">
            <div className="flex items-center gap-1 border border-orange-300 rounded px-1.5 py-1 bg-white">
              <Search className="w-3 h-3 text-orange-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar deportista o código…" className="w-44 text-[11px] focus:outline-none" />
            </div>
            {sug.length > 0 && (
              <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {sug.map(d => {
                  const cod = getCod(d);
                  return (
                    <button key={d.id} onClick={() => { onAsignar(g, cod, d._nombre, concepto); setQ(''); }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-green-50 text-[11px] flex items-center gap-2">
                      <span className="font-black text-green-700">{cod}</span>
                      <span className="text-gray-700 truncate">{d._nombre}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Editor del catálogo de cuentas/conceptos (TRANSPORTE, APORTE FORMACIÓN, GASTOS…) ──
const TIPOS = ['ingreso', 'gasto', 'traslado', 'financiero', 'otro'];

function CuentasEditor({ conceptos, onCambio, flash }: {
  conceptos: Concepto[];
  onCambio: (c: Concepto[]) => void;
  flash: (t: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return conceptos;
    return conceptos.filter(c => c.nombre.toLowerCase().includes(t) || (c.codcuenta || '').includes(t));
  }, [busca, conceptos]);

  function editarLocal(id: string, campo: keyof Concepto, val: string) {
    onCambio(conceptos.map(c => c.id === id ? { ...c, [campo]: campo === 'orden' ? (parseInt(val) || 0) as any : val } : c));
  }

  async function guardar(c: Concepto) {
    if (!c.nombre.trim()) { flash('El nombre no puede estar vacío.'); return; }
    setGuardandoId(c.id);
    const r = await guardarConcepto(c);
    setGuardandoId(null);
    if (r.ok) { flash('Cuenta guardada ✓'); getConceptos().then(onCambio); }
    else flash('Error: ' + (r.msg || ''));
  }

  async function eliminar(c: Concepto) {
    if (!window.confirm(`¿Eliminar la cuenta "${c.nombre}"? Los movimientos que ya la usan no se modifican.`)) return;
    const ok = await borrarConcepto(c.id);
    if (ok) { flash('Cuenta eliminada'); getConceptos().then(onCambio); }
    else flash('No se pudo eliminar.');
  }

  function nueva() {
    const maxOrden = conceptos.reduce((m, c) => Math.max(m, c.orden || 0), 0);
    const nuevo: Concepto = { id: 'con_' + Math.random().toString(36).slice(2, 8), nombre: '', tipo: 'gasto', codcuenta: '', orden: maxOrden + 10 };
    onCambio([...conceptos, nuevo]);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
        <p className="font-black text-gray-700 text-sm">Cuentas / conceptos <span className="text-gray-400 font-semibold">({conceptos.length})</span></p>
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cuenta…" className="w-40 text-xs focus:outline-none" />
        </div>
        <button onClick={nueva} className="ml-auto flex items-center gap-1.5 bg-[#16a34a] text-white text-sm font-black px-4 py-2 rounded-xl hover:bg-[#064e1e] transition">
          + Nueva cuenta
        </button>
      </div>
      <p className="px-4 py-2 text-[11px] text-gray-400 bg-gray-50 border-b border-gray-100">
        Estas son las opciones que aparecen en la lista desplegable de <b>CONCEPTO</b> al revisar los movimientos. Edita el nombre, el tipo o el código y pulsa Guardar.
      </p>
      <div className="overflow-x-auto" style={{ maxHeight: '62vh' }}>
        <table className="w-full border-collapse text-xs" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              {['ORDEN', 'NOMBRE DE LA CUENTA', 'TIPO', 'CÓD. CUENTA', ''].map(h => (
                <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#16a34a', color: '#fff', border: '1px solid #fff', padding: '7px 8px', fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400 font-semibold">No hay cuentas. Crea una con “+ Nueva cuenta”.</td></tr>
            ) : lista.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                <td style={{ ...td, width: 70 }}>
                  <input type="number" value={c.orden} onChange={e => editarLocal(c.id, 'orden', e.target.value)}
                    className="w-14 border border-gray-200 rounded px-1 py-1 text-[11px] text-center" />
                </td>
                <td style={{ ...td, textAlign: 'left' }}>
                  <input value={c.nombre} onChange={e => editarLocal(c.id, 'nombre', e.target.value)}
                    className="w-full min-w-[200px] border border-gray-200 rounded px-2 py-1 text-[11px] font-bold text-gray-700 uppercase" placeholder="Nombre de la cuenta" />
                </td>
                <td style={{ ...td }}>
                  <select value={c.tipo} onChange={e => editarLocal(c.id, 'tipo', e.target.value)}
                    className="border border-gray-200 rounded px-1.5 py-1 text-[11px] font-semibold text-gray-700 bg-white">
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    {c.tipo && !TIPOS.includes(c.tipo) && <option value={c.tipo}>{c.tipo}</option>}
                  </select>
                </td>
                <td style={{ ...td }}>
                  <input value={c.codcuenta} onChange={e => editarLocal(c.id, 'codcuenta', e.target.value)}
                    className="w-24 border border-gray-200 rounded px-1.5 py-1 text-[11px] text-center" placeholder="—" />
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => guardar(c)} disabled={guardandoId === c.id}
                      className="text-[11px] font-black text-white bg-[#16a34a] px-2.5 py-1 rounded-lg hover:bg-[#064e1e] transition disabled:opacity-60">
                      {guardandoId === c.id ? '…' : 'Guardar'}
                    </button>
                    <button onClick={() => eliminar(c)} title="Eliminar"
                      className="text-gray-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
