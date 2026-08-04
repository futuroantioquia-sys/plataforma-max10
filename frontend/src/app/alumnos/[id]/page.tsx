'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Edit3, Save, X, Camera, Clipboard, DollarSign, MessageCircle, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeportistas, saveDeportistas, getFoto, saveFoto, getDocumentos, saveDocumento, deleteDocumento, getCalificacionesEscolares } from '@/lib/db';
import type { Deportista, CalificacionEscolar } from '@/lib/db';
import { useAuthStore } from '@/store/auth.store';
import { BalonCargando } from '@/components/BalonCargando';

const FOTOS_KEY = 'futuro_fotos_deportistas';

/** Lee un archivo como dataURL (base64). */
function leerArchivoComoDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Comprime una imagen: la reduce a `maxLado` px por el lado mayor y la re-codifica
 *  como JPEG. Devuelve un base64 pequeño (~100 KB) que SÍ se guarda en Supabase
 *  y se ve desde cualquier dispositivo (calidoso, profe, admin). */
function comprimirImagen(file: File, maxLado = 800, calidad = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    leerArchivoComoDataURL(file).then(dataUrl => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w >= h && w > maxLado)      { h = Math.round(h * maxLado / w); w = maxLado; }
        else if (h > w && h > maxLado)  { w = Math.round(w * maxLado / h); h = maxLado; }
        else if (w === h && w > maxLado){ w = maxLado; h = maxLado; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('sin contexto de canvas')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('no se pudo cargar la imagen'));
      img.src = dataUrl;
    }).catch(reject);
  });
}

const MESES: Record<string, string> = {
  '1':'Enero','2':'Febrero','3':'Marzo','4':'Abril','5':'Mayo','6':'Junio',
  '7':'Julio','8':'Agosto','9':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
  'enero':'Enero','febrero':'Febrero','marzo':'Marzo','abril':'Abril','mayo':'Mayo','junio':'Junio',
  'julio':'Julio','agosto':'Agosto','septiembre':'Septiembre','octubre':'Octubre','noviembre':'Noviembre','diciembre':'Diciembre',
};

function construirFechaNac(cols: Record<string, string>): string | null {
  const entries = Object.entries(cols);
  const keyAnio = entries.find(([k]) => /^a[ñn]o$/i.test(k.trim()))?.[0];
  const keyMes  = entries.find(([k]) => /^mes$/i.test(k.trim()))?.[0];
  const keyDia  = entries.find(([k]) => /^d[ií]a$/i.test(k.trim()))?.[0];
  if (!keyAnio && !keyMes && !keyDia) return null;
  const anio = keyAnio ? cols[keyAnio] : '';
  const mesRaw = keyMes  ? cols[keyMes].trim()  : '';
  const dia  = keyDia  ? cols[keyDia]  : '';
  const mes  = MESES[mesRaw] ?? MESES[mesRaw.toLowerCase()] ?? mesRaw;
  const partes = [dia && `${dia}`, mes, anio].filter(Boolean);
  return partes.length ? `📅 ${partes.join(' de ')}` : null;
}

function calcularEdad(cols: Record<string, string>): string | null {
  const entries = Object.entries(cols);
  const keyAnio = entries.find(([k]) => /^a[ñn]o$/i.test(k.trim()))?.[0];
  if (!keyAnio) return null;
  const anio = parseInt(cols[keyAnio]);
  if (isNaN(anio)) return null;
  return `${new Date().getFullYear() - anio} años`;
}

// Agrupa columnas en secciones según palabras clave del encabezado
function agruparColumnas(columnas: [string, string][]) {
  const grupos: Record<string, [string, string][]> = {
    'Identificación':  [],
    'Categoría':       [],
    'Familia':         [],
    'Financiero':      [],
    'Otros':           [],
  };
  columnas.forEach(([k, v]) => {
    const kl = k.toLowerCase();
    if (/nombre|apellido|codigo|documento|numero de doc|deportista|cedula|id\b/i.test(k))
      grupos['Identificación'].push([k, v]);
    else if (/program|categor|proy|grupo|division|sub|edad|año|mes|dia|fecha|nac|estado|posic/i.test(k))
      grupos['Categoría'].push([k, v]);
    else if (/padre|madre|acudiente|adulto|representac|tutor|familiar|telefono|celular|movil|correo|email|direc/i.test(k))
      grupos['Familia'].push([k, v]);
    else if (/pago|valor|cuota|monto|tarifa|mensual|cobro|\$|precio|\d{5,}/i.test(k))
      grupos['Financiero'].push([k, v]);
    else
      grupos['Otros'].push([k, v]);
  });
  // Eliminar grupos vacíos
  return Object.entries(grupos).filter(([, items]) => items.length > 0);
}

function gradientePrograma(val: string) {
  const v = val.toLowerCase();
  if (v.includes('selecc') || v.includes('elite'))                        return 'from-emerald-700 to-green-600';
  if (v.includes('formac'))                                                return 'from-blue-700 to-blue-500';
  if (v.includes('estimul') || v.includes('baby'))                        return 'from-[#0f1e4a] to-[#1e3a8a]';
  if (v.includes('sub-17') || v.includes('sub 17'))                       return 'from-[#0f1e4a] to-[#2563eb]';
  if (v.includes('sub-15') || v.includes('sub 15'))                       return 'from-[#0a0c14] to-[#334155]';
  return 'from-[#064e1e] to-[#22c55e]';
}

// Campos fijos para la pestaña Deportista (en el orden exacto solicitado)
const CAMPOS_DEP_ORDEN: { label: string; rx: RegExp }[] = [
  { label: 'Tipo de Afiliación',    rx: /tipo.*afil|afil.*tipo/i },
  { label: 'Programa',              rx: /^program/i },
  { label: 'Estado',                rx: /^estado/i },
  { label: 'Código del Deportista', rx: /^c[oó]d/i },
  { label: 'Nombre del Deportista', rx: /^nombre(?!.*(padre|madre|acudiente|familiar|tutor))/i },
  { label: 'Año',                   rx: /^a[ñn]o$/i },
  { label: 'Mes',                   rx: /^mes$/i },
  { label: 'Día',                   rx: /^d[ií]a$/i },
  { label: 'Sede de Entrenamiento', rx: /sede/i },
  { label: 'Proyecto',              rx: /^proy/i },
  { label: 'Posición en el Campo',  rx: /posic/i },
  { label: 'Pie Dominante',         rx: /pie.*dom|dom.*pie|dominante/i },
  { label: 'Talla (cm)',            rx: /^(estatura|altura)$|^talla(\s*(cm|\(cm\)))?$/i },
  { label: 'Peso (kg)',             rx: /peso/i },
];

type CampoD = { key: string; label: string; val: string; readonly?: boolean };

function buildPestanaDeportista(cols: Record<string, string>): CampoD[] {
  const res: CampoD[] = [];
  // Detectar si programa es Desarrollo Selección para aplicar sede por defecto
  const keyPrograma = Object.keys(cols).find(k => /^program/i.test(k.trim()));
  const esSelecc    = keyPrograma ? /^(desarrollo|selecci[oó]n)$|desarrollo.*selecc|selecc.*desarrollo/i.test(cols[keyPrograma] ?? '') : false;

  for (const campo of CAMPOS_DEP_ORDEN) {
    const key = Object.keys(cols).find(k => campo.rx.test(k.trim()));
    if (!key) continue;
    let val = cols[key] ?? '';
    // Regla: Sede vacía en Desarrollo Selección → INSTITUCIONAL
    if (campo.label === 'Sede de Entrenamiento' && esSelecc && val.trim() !== 'INSTITUCIONAL') val = 'INSTITUCIONAL';
    res.push({ key, label: campo.label, val });
  }
  // IMC: mostrar columna si existe en el Excel; cuando haya datos de talla y peso se calculará aquí
  const keyIMC = Object.keys(cols).find(k => /^imc$/i.test(k.trim()));
  if (keyIMC) res.push({ key: keyIMC, label: 'IMC', val: cols[keyIMC] ?? '' });
  return res;
}

export default function PerfilDeportista() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const usuario = useAuthStore(s => s.usuario);
  const esPadre    = usuario?.rol === 'padre';
  const esAdmin    = usuario?.rol === 'administracion';
  const esProfesor = usuario?.rol === 'profesor';

  const [dep,           setDep]          = useState<Deportista | null>(null);
  const [loading,       setLoading]      = useState(true);
  const [foto,          setFoto]          = useState<string | null>(null);
  const [editando,      setEditando]      = useState(false);
  const [edits,         setEdits]         = useState<Record<string, string>>({});
  const [tab,           setTab]           = useState(0);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const inputFotoRef  = useRef<HTMLInputElement>(null);

  type DocFile = { name: string; data: string; date: string } | null;
  const [docTI,  setDocTI]  = useState<DocFile>(null);
  const [docRC,  setDocRC]  = useState<DocFile>(null);
  const [docEPS, setDocEPS] = useState<DocFile>(null);
  const [docPreview, setDocPreview] = useState<{ name: string; data: string } | null>(null);
  const [califs, setCalifs] = useState<CalificacionEscolar[]>([]);
  const inputTIRef  = useRef<HTMLInputElement>(null);
  const inputRCRef  = useRef<HTMLInputElement>(null);
  const inputEPSRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDeportistas().then(lista => {
      let d = lista.find(x => x.id === id);

      // Para calidosos con IDs temporales (dep-xxxxx), buscar por nombre
      // y redirigir al UUID real para que sub-páginas (asistencia, pagos, etc.) funcionen.
      if (!d && esPadre) {
        try {
          const nombre = (localStorage.getItem('futuro-calidoso-nombre') ?? '').trim().toLowerCase();
          if (nombre) d = lista.find(x => (x._nombre ?? '').trim().toLowerCase() === nombre);
        } catch {}
        if (d) {
          // Guardar UUID real y redirigir → todas las sub-páginas quedan correctas
          try { localStorage.setItem('futuro-calidoso-id', d.id); } catch {}
          router.replace(`/alumnos/${d.id}`);
          return;
        }
      }

      if (d) { setDep(d); setEdits({ ...d._columnas }); }
      setLoading(false);
    });
    getFoto(id).then(f => { if (f) setFoto(f); }).catch(() => {
      try { const fotos = JSON.parse(localStorage.getItem(FOTOS_KEY) ?? '{}'); if (fotos[id]) setFoto(fotos[id]); } catch {}
    });
    // Cargar documentos — localStorage primero, luego Supabase
    try {
      const raw = localStorage.getItem(`futuro_docs_${id}`);
      if (raw) {
        const docs = JSON.parse(raw);
        if (docs.ti)  setDocTI(docs.ti);
        if (docs.rc)  setDocRC(docs.rc);
        if (docs.eps) setDocEPS(docs.eps);
      }
    } catch {}
    getDocumentos(id).then(docs => {
      const conv = (d: { nombre: string; datos: string; fecha: string }) => ({ name: d.nombre, data: d.datos, date: d.fecha });
      if (docs.ti)  setDocTI(conv(docs.ti));
      if (docs.rc)  setDocRC(conv(docs.rc));
      if (docs.eps) setDocEPS(conv(docs.eps));
    }).catch(() => {});
    // Calificaciones escolares (boletines) que sube el acudiente
    getCalificacionesEscolares(id).then(setCalifs).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function subirDoc(e: React.ChangeEvent<HTMLInputElement>, tipo: 'ti' | 'rc' | 'eps') {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const doc = { name: file.name.replace(/\.[^.]+$/, ''), data: ev.target?.result as string, date: new Date().toLocaleDateString('es-CO') };
      const setter = tipo === 'ti' ? setDocTI : tipo === 'rc' ? setDocRC : setDocEPS;
      setter(doc);
      try {
        const prev = JSON.parse(localStorage.getItem(`futuro_docs_${id}`) ?? '{}');
        localStorage.setItem(`futuro_docs_${id}`, JSON.stringify({ ...prev, [tipo]: doc }));
      } catch {}
      // Guardar en Supabase para acceso cross-device
      saveDocumento(id, tipo, { nombre: doc.name, datos: doc.data, fecha: doc.date })
        .catch(err => console.error('[perfil] saveDocumento:', err));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function eliminarDoc(tipo: 'ti' | 'rc' | 'eps') {
    const setter = tipo === 'ti' ? setDocTI : tipo === 'rc' ? setDocRC : setDocEPS;
    setter(null);
    try {
      const prev = JSON.parse(localStorage.getItem(`futuro_docs_${id}`) ?? '{}');
      delete prev[tipo];
      localStorage.setItem(`futuro_docs_${id}`, JSON.stringify(prev));
    } catch {}
    deleteDocumento(id, tipo).catch(err => console.error('[perfil] deleteDocumento:', err));
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcesandoFoto(true);
    try {
      // TODO: activar con `npm install @imgly/background-removal`
      // const { removeBackground } = await import('@imgly/background-removal');
      // const blob = await removeBackground(file, { output: { format: 'image/png', quality: 1 } });
      // const img = new Image();
      // img.src = URL.createObjectURL(blob);
      // await new Promise<void>(res => { img.onload = () => res(); });
      // const canvas = document.createElement('canvas');
      // canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      // const ctx = canvas.getContext('2d')!;
      // ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // ctx.drawImage(img, 0, 0); URL.revokeObjectURL(img.src);
      // const b64 = canvas.toDataURL('image/jpeg', 0.92);

      // Comprimir a ~800px/JPEG (pesa ~100 KB) y ESPERAR el guardado para que
      // la foto llegue siempre a Supabase → se ve desde profe y admin también.
      let b64: string;
      try {
        b64 = await comprimirImagen(file, 800, 0.85);
      } catch {
        // Si por algún motivo no se puede comprimir, usar el original.
        b64 = await leerArchivoComoDataURL(file);
      }
      setFoto(b64);
      await saveFoto(id, b64);
    } catch (err) {
      console.error('[perfil] subirFoto:', err);
    } finally {
      setProcesandoFoto(false);
      if (e.target) e.target.value = '';
    }
  }

  async function guardar() {
    if (!dep) return;
    const lista = await getDeportistas();
    const nueva = lista.map(d => d.id === id ? { ...d, _columnas: edits } : d);
    await saveDeportistas(nueva);
    setDep(prev => prev ? { ...prev, _columnas: edits } : prev);
    setEditando(false);
  }

  async function eliminar() {
    if (!dep) return;
    if (!confirm(`¿Eliminar a ${dep._nombre} de la lista? Esta acción no se puede deshacer.`)) return;
    const lista = await getDeportistas();
    await saveDeportistas(lista.filter(d => d.id !== id));
    router.push('/alumnos');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <BalonCargando texto="Cargando perfil…" />
      </div>
    );
  }

  if (!dep) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-gray-400">Deportista no encontrado</p>
          <button onClick={() => router.push('/alumnos')} className="text-[#16a34a] text-sm font-semibold">← Volver</button>
        </div>
      </div>
    );
  }

  // Fecha de nacimiento combinada desde columnas AÑO / MES / DÍA
  const fechaNac  = construirFechaNac(dep._columnas);
  const edad      = calcularEdad(dep._columnas);

  // Columnas a mostrar: sin vacías ni __EMPTY, y ocultar AÑO/MES/DÍA sueltos (ya se muestran combinados)
  const columnas  = Object.entries(dep._columnas ?? {}).filter(([k]) => {
    if (!k.trim()) return false;
    if (/^__EMPTY/i.test(k)) return false;
    if (/^column\s*\d+$/i.test(k)) return false;
    // Si ya construimos la fecha combinada, ocultar las columnas sueltas
    if (fechaNac && /^a[ñn]o$|^mes$|^d[ií]a$/i.test(k.trim())) return false;
    return true;
  });
  const grupos    = agruparColumna(columnas);
  const catVal    = columnas.find(([k]) => /program|categor|proy/i.test(k))?.[1] ?? '';
  const gradiente = gradientePrograma(catVal);
  const initials  = dep._nombre.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  /* Campos para el encabezado */
  const getC = (rx: RegExp) => { const k = Object.keys(dep._columnas ?? {}).find(k => rx.test(k)); return k ? (dep._columnas[k] ?? '') : ''; };
  const programaVal    = getC(/^program/i);
  const proyectoVal    = getC(/^proy/i);
  const codigoVal      = getC(/^c[oó]d/i);
  const mensualidadVal = getC(/mensual|tarifa|cuota|valor/i);
  const fechaAfilVal = (() => {
    const raw = getC(/fecha.*afil|afil.*fecha/i);
    if (!raw) return '';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) return raw;
    const num = Number(raw);
    if (!isNaN(num) && num > 40000 && num < 60000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      return `${date.getUTCDate().toString().padStart(2,'0')}/${(date.getUTCMonth()+1).toString().padStart(2,'0')}/${date.getUTCFullYear()}`;
    }
    const iso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return raw;
  })();
  const camposDeportista = buildPestanaDeportista(dep._columnas);
  const camposDatos      = buildPestanaDatos(dep._columnas);
  const camposContacto   = buildPestanaContacto(dep._columnas);

  const tabActual = grupos[tab];

  /* ══════════════ VISTA PADRE — móvil y PC ══════════════ */
  if (esPadre) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: '#0d0d0d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 14px 24px',
        gap: 12,
        boxSizing: 'border-box',
      }}>

        {/* ── TARJETA SUPERIOR ── */}
        <div style={{
          width: '100%', maxWidth: 500,
          background: 'linear-gradient(150deg, #0c3d1c 0%, #052a10 55%, #071510 100%)',
          borderRadius: 22,
          border: '1.5px solid rgba(22,163,74,0.35)',
          padding: '18px 16px 14px',
          boxSizing: 'border-box',
          boxShadow: '0 4px 28px rgba(0,0,0,0.55)',
        }}>

          {/* Nombre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>⚽</span>
            <h1 style={{
              color: '#fff', fontWeight: 900, fontSize: 19,
              textTransform: 'uppercase', letterSpacing: '0.02em',
              lineHeight: 1.2, margin: 0,
            }}>
              {dep._nombre}
            </h1>
          </div>

          {/* Filas de info + CÓDIGO */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'PROYECTO',            val: proyectoVal  },
                { label: 'PROGRAMA',            val: programaVal  },
                { label: 'FECHA DE AFILIACIÓN', val: fechaAfilVal },
              ].filter(r => r.val).map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: '#16a34a', color: '#fff',
                    fontSize: 9, fontWeight: 900,
                    padding: '4px 8px', borderRadius: 6,
                    letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    minWidth: 108, textAlign: 'center',
                  }}>
                    {label}
                  </span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                    {val!.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            {codigoVal && (
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <p style={{
                  color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 900,
                  letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 5px',
                }}>CÓDIGO</p>
                <div style={{
                  background: '#16a34a', color: '#fff',
                  fontWeight: 900, fontSize: 24,
                  padding: '7px 16px', borderRadius: 14,
                  minWidth: 80, textAlign: 'center',
                  boxShadow: '0 2px 14px rgba(22,163,74,0.45)',
                }}>
                  {codigoVal}
                </div>
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 16 }}>
            {[
              { label: 'PAGOS',       href: `/alumnos/${id}/estado-cuenta`,   mant: false },
              { label: 'ASISTENCIA',  href: `/alumnos/${id}/asistencia`,      mant: false },
              { label: 'VALORACIÓN',  href: '/mantenimiento',                  mant: true  },
              { label: 'MENSAJES',    href: '/mantenimiento',                 mant: true  },
            ].filter(b => !esProfesor || !b.mant).map(({ label, href, mant }) => (
              <button key={label} onClick={() => router.push(href)} style={{
                background: mant ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.11)',
                border: mant ? '1.5px solid rgba(255,255,255,0.12)' : '1.5px solid rgba(255,255,255,0.22)',
                borderRadius: 13, padding: '8px 2px 6px',
                color: mant ? 'rgba(255,255,255,0.45)' : '#fff',
                fontWeight: 900, fontSize: 9.5,
                letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span>{label}</span>
                {mant && <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,200,50,0.8)', letterSpacing: '0.03em' }}>🔧 MANT.</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── INPUTS OCULTOS DOCUMENTOS ── */}
        <input ref={inputTIRef}  type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e => subirDoc(e,'ti')}/>
        <input ref={inputRCRef}  type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e => subirDoc(e,'rc')}/>
        <input ref={inputEPSRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e => subirDoc(e,'eps')}/>

        {/* ── TARJETA FOTO ── */}
        <input ref={inputFotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={subirFoto}/>
        <div style={{
          width: '100%', maxWidth: 500,
          background: '#111814',
          borderRadius: 22,
          border: '1.5px solid rgba(22,163,74,0.15)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          padding: '14px 14px 14px',
          boxSizing: 'border-box',
          boxShadow: '0 4px 28px rgba(0,0,0,0.55)',
        }}>

          {/* ── PROCESANDO ── */}
          {procesandoFoto && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 18, padding: '48px 24px',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: '4px solid rgba(22,163,74,0.2)',
                borderTop: '4px solid #16a34a',
                animation: 'spin 0.9s linear infinite',
              }}/>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{
                color: 'rgba(255,255,255,0.7)', fontWeight: 900, fontSize: 12,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                textAlign: 'center', margin: 0, lineHeight: 1.7,
              }}>
                QUITANDO EL FONDO…{'\n'}UN MOMENTO
              </p>
            </div>
          )}

          {!procesandoFoto && (foto ? (
            <>
              <img
                src={foto}
                alt={dep._nombre}
                onClick={() => inputFotoRef.current?.click()}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  objectFit: 'cover', objectPosition: 'top',
                  cursor: 'pointer',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                  display: 'block',
                  maxHeight: '62vh',
                }}
              />
              {/* Pie de foto — cambiar + eliminar */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <button
                  onClick={() => inputFotoRef.current?.click()}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 0',
                  }}
                >
                  <Camera size={13} color="rgba(255,255,255,0.45)"/>
                  Cambiar foto
                </button>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>|</span>
                <button
                  onClick={() => {
                    if (!confirm('¿Eliminar la foto?')) return;
                    setFoto(null);
                    saveFoto(id, '').catch(console.error);
                    try { const f = JSON.parse(localStorage.getItem(FOTOS_KEY) ?? '{}'); delete f[id]; localStorage.setItem(FOTOS_KEY, JSON.stringify(f)); } catch {}
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    color: 'rgba(220,38,38,0.6)', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 0',
                  }}
                >
                  🗑 Eliminar foto
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => inputFotoRef.current?.click()} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
              padding: '32px 0',  width: '100%',
            }}>
              <div style={{
                width: 150, height: 150, borderRadius: 34,
                border: '4px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" style={{ width: 84, height: 84, fill: 'rgba(255,255,255,0.25)' }}>
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
              <p style={{
                color: 'rgba(255,255,255,0.5)', fontWeight: 900, fontSize: 13,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                textAlign: 'center', margin: 0, lineHeight: 1.6,
              }}>
                SUBE TU FOTO CON UNIFORME Y FONDO BLANCO
              </p>
            </button>
          ))}
        </div>

        {/* ── TARJETA DOCUMENTOS ── */}
        <div style={{
          width: '100%', maxWidth: 500,
          background: 'linear-gradient(150deg, #0c3d1c 0%, #052a10 55%, #071510 100%)',
          borderRadius: 22,
          border: '1.5px solid rgba(22,163,74,0.25)',
          padding: '18px 16px 16px',
          boxSizing: 'border-box',
          boxShadow: '0 4px 28px rgba(0,0,0,0.55)',
        }}>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>
            📋 Documentación requerida
          </p>

          {/* Grupo: Documento de identidad */}
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>
            Documento de identidad
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {([
              { tipo: 'ti'  as const, label: '🪪 Tarjeta de identidad',      ref: inputTIRef,  doc: docTI  },
              { tipo: 'rc'  as const, label: '📄 Folio de Registro Civil',    ref: inputRCRef,  doc: docRC  },
            ]).map(({ tipo, label, ref, doc }) => (
              <div key={tipo} style={{
                background: doc ? 'rgba(22,163,74,0.12)' : 'rgba(255,255,255,0.05)',
                border: doc ? '1.5px solid rgba(22,163,74,0.4)' : '1.5px dashed rgba(255,255,255,0.15)',
                borderRadius: 14, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {doc ? (
                  <>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✅</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#fff', fontWeight: 900, fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, margin: '2px 0 0', fontWeight: 600 }}>{doc.date}</p>
                    </div>
                    <button onClick={() => eliminarDoc(tipo)} style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '4px 8px', color: '#f87171', fontSize: 9, fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}>
                      Eliminar
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, opacity: 0.4 }}>📎</span>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 11, margin: 0, flex: 1 }}>{label}</p>
                    <button onClick={() => ref.current?.click()} style={{ background: '#16a34a', border: 'none', borderRadius: 10, padding: '7px 12px', color: '#fff', fontSize: 10, fontWeight: 900, cursor: 'pointer', flexShrink: 0, letterSpacing: '0.03em' }}>
                      Subir
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Certificado EPS */}
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>
            Certificado de EPS
          </p>
          {(() => {
            const doc = docEPS;
            return (
              <div style={{
                background: doc ? 'rgba(22,163,74,0.12)' : 'rgba(255,255,255,0.05)',
                border: doc ? '1.5px solid rgba(22,163,74,0.4)' : '1.5px dashed rgba(255,255,255,0.15)',
                borderRadius: 14, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {doc ? (
                  <>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✅</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#fff', fontWeight: 900, fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, margin: '2px 0 0', fontWeight: 600 }}>{doc.date}</p>
                    </div>
                    <button onClick={() => eliminarDoc('eps')} style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '4px 8px', color: '#f87171', fontSize: 9, fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}>
                      Eliminar
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, opacity: 0.4 }}>🏥</span>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 11, margin: 0, flex: 1 }}>🏥 Certificado de EPS</p>
                    <button onClick={() => inputEPSRef.current?.click()} style={{ background: '#16a34a', border: 'none', borderRadius: 10, padding: '7px 12px', color: '#fff', fontSize: 10, fontWeight: 900, cursor: 'pointer', flexShrink: 0, letterSpacing: '0.03em' }}>
                      Subir
                    </button>
                  </>
                )}
              </div>
            );
          })()}
        </div>

      </div>
    );
  }

  /* ══════════════ VISTA ADMIN / PROFESOR (igual que antes) ══════════════ */
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/80 hover:text-white text-sm font-bold">
            ← Volver
          </button>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin && editando && (
            <button onClick={() => { setEditando(false); setEdits({ ...dep._columnas }); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-black text-white hover:bg-gray-900 border border-white/20 transition">
              <X className="w-4 h-4" /> Cancelar
            </button>
          )}
          {esAdmin && !editando && (
            <button onClick={eliminar}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-black text-white hover:bg-gray-900 border border-white/20 transition">
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
          )}
          {esAdmin && (
            <button onClick={() => editando ? guardar() : setEditando(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-black text-white hover:bg-gray-900 border border-white/20 transition">
              {editando ? <><Save className="w-4 h-4" /> Guardar</> : <><Edit3 className="w-4 h-4" /> Editar</>}
            </button>
          )}
          <div className="flex flex-col items-center border-l border-white/30 pl-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MAX%2010.png" alt="MAX10" className="h-7 object-contain" />
            <p className="text-white/50 text-[9px] leading-none mt-0.5 tracking-wide">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* ── TARJETA HERO ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#0a2e12] via-[#052a10] to-black p-4 shadow-xl">

          {/* Fila superior: foto + info + código */}
          <div className="flex items-stretch gap-3">

            {/* Foto 3×4 */}
            <div className="relative flex-shrink-0">
              <div className="w-[72px] h-[96px] rounded-xl overflow-hidden bg-[#0d3d1a] border border-white/20 flex items-center justify-center">
                {foto
                  ? <img src={foto} alt="" className="w-full h-full object-cover"/>
                  : <span className="text-white font-black text-3xl select-none">{initials}</span>
                }
              </div>
              <button onClick={() => inputFotoRef.current?.click()}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white/90 hover:bg-white rounded-full p-1 shadow-md transition">
                <Camera className="w-3 h-3 text-gray-700"/>
              </button>
              <input ref={inputFotoRef} type="file" accept="image/*" className="hidden" onChange={subirFoto}/>
            </div>

            {/* Nombre + filas de datos */}
            <div className="flex-1 min-w-0 space-y-[5px]">
              <h1 className="text-white font-black text-base leading-tight uppercase tracking-wide mb-2">
                {dep._nombre}
              </h1>

              {/* Fila: etiqueta verde + valor blanco */}
              {[
                { label: 'PROGRAMA',    val: programaVal },
                { label: 'PROYECTO',    val: proyectoVal },
                { label: 'FECHA AFIL.', val: fechaAfilVal },
                { label: 'MENSUALIDAD', val: mensualidadVal },
              ].filter(r => r.val).map(({ label, val }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="bg-[#16a34a] text-white text-[10px] font-black px-2 py-[3px] rounded-md w-[90px] text-center flex-shrink-0 tracking-wide">
                    {label}
                  </span>
                  <span className="text-white text-[11px] font-semibold truncate">
                    {val!.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            {/* CÓDIGO — esquina superior derecha */}
            {codigoVal && (
              <div className="flex-shrink-0 text-center self-start">
                <p className="text-white/60 text-[9px] font-black tracking-widest uppercase mb-1">CÓDIGO</p>
                <div className="bg-[#16a34a] text-white font-black text-lg px-3 py-2 rounded-xl min-w-[60px] text-center shadow-md leading-none">
                  {codigoVal}
                </div>
              </div>
            )}
          </div>

          {/* Botones de acceso */}
          <div className="grid gap-2 mt-4 grid-cols-4">
            {[
              { label: 'PAGOS',      href: `/alumnos/${id}/estado-cuenta`, profe: true,  padre: true  },
              { label: 'ASISTENCIA', href: `/alumnos/${id}/asistencia`,    profe: true,  padre: true  },
              { label: 'INFORMES',   href: codigoVal ? `/evaluaciones?cod=${encodeURIComponent(codigoVal)}` : '/evaluaciones', profe: true, padre: false },
              { label: 'MENSAJES',   href: '/mensajes',                     profe: true,  padre: true  },
            ].filter(b => esPadre ? b.padre : (!esProfesor || b.profe)).map(({ label, href }) => (
              <button key={label} onClick={() => router.push(href)}
                className="bg-white/10 hover:bg-white/20 border border-white/20 active:bg-white/30 transition rounded-xl py-2.5 text-white font-black text-[10px] tracking-wide">
                {label}
              </button>
            ))}
          </div>

          {/* VISTA PADRES — vista dinámica bonita (admin y profe) */}
          {codigoVal && (esAdmin || esProfesor) && (
            <button
              onClick={() => router.push(`/valoracion-dinamica?cod=${encodeURIComponent(codigoVal)}`)}
              className="w-full mt-2 bg-gradient-to-r from-[#16a34a] to-[#064e1e] hover:opacity-90 border border-white/20 active:opacity-80 transition rounded-xl py-2.5 text-white font-black text-[11px] tracking-wide flex items-center justify-center gap-2">
              👨‍👩‍👦 VISTA PADRES
            </button>
          )}
        </div>

        {/* ── PESTAÑAS DE SECCIONES ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-gray-100 scrollbar-hide">
            {grupos.map(([nombre], i) => (
              <button key={nombre} onClick={() => setTab(i)}
                className={cn(
                  'flex-shrink-0 px-4 py-3 text-xs font-bold transition whitespace-nowrap',
                  tab === i
                    ? 'text-[#16a34a] border-b-2 border-[#16a34a] bg-green-50/50'
                    : 'text-gray-400 hover:text-gray-600'
                )}>
                {nombre}
              </button>
            ))}
          </div>

          {/* Contenido del tab activo */}
          {tabActual && (() => {
            const nombre = tabActual[0];
            const camposFijos =
              nombre === 'Deportista' ? camposDeportista :
              nombre === 'Datos'      ? camposDatos      :
              nombre === 'Contacto'   ? camposContacto   : null;

            if (editando) {
              return (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {camposFijos
                    ? camposFijos.filter(c => !c.readonly).map(c => (
                        <div key={c.key}>
                          <label className="block text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{c.label}</label>
                          <input
                            value={edits[c.key] ?? ''}
                            onChange={e => setEdits(p => ({ ...p, [c.key]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                          />
                        </div>
                      ))
                    : tabActual[1].map(([key]) => (
                        <div key={key}>
                          <label className="block text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{key}</label>
                          <input
                            value={edits[key] ?? ''}
                            onChange={e => setEdits(p => ({ ...p, [key]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#22c55e]"
                          />
                        </div>
                      ))
                  }
                </div>
              );
            }

            if (camposFijos) {
              return (
                <div className="grid grid-cols-2 gap-px bg-gray-50">
                  {camposFijos.map(c => (
                    <div key={c.key} className="bg-white px-4 py-3.5">
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate">{c.label}</p>
                      <p className="text-sm font-bold text-gray-800 mt-1 break-words leading-snug">{c.val || '—'}</p>
                    </div>
                  ))}
                  {camposFijos.length % 2 !== 0 && <div className="bg-white" />}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 gap-px bg-gray-50">
                {tabActual[1].map(([key, val]) => (
                  <div key={key} className="bg-white px-4 py-3.5">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate">{key}</p>
                    <p className="text-sm font-bold text-gray-800 mt-1 break-words leading-snug">{val || '—'}</p>
                  </div>
                ))}
                {tabActual[1].length % 2 !== 0 && <div className="bg-white" />}
              </div>
            );
          })()}
        </div>

        {/* ── SECCIÓN FOTO + DOCUMENTOS (admin/profe) ── */}
        {(foto || docTI || docRC || docEPS || califs.length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest">📋 Foto y Documentos</p>
            </div>
            <div className="p-4 space-y-3">

              {/* Foto */}
              {foto && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <img src={foto} alt={dep._nombre} className="w-14 h-[72px] object-cover object-top rounded-lg border border-gray-200 flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-800 uppercase tracking-wide">Foto del deportista</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Subida por el acudiente</p>
                  </div>
                  <a
                    href={foto}
                    download={`foto_${dep._nombre.replace(/\s+/g,'_')}.jpg`}
                    className="flex items-center gap-1.5 bg-[#16a34a] text-white text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-green-700 transition flex-shrink-0"
                  >
                    ⬇ Descargar
                  </a>
                </div>
              )}

              {/* Documentos */}
              {([
                { tipo: 'ti'  as const, doc: docTI,  label: '🪪 Tarjeta de identidad' },
                { tipo: 'rc'  as const, doc: docRC,  label: '📄 Folio de Registro Civil' },
                { tipo: 'eps' as const, doc: docEPS, label: '🏥 Certificado de EPS' },
              ]).filter(({ doc }) => !!doc).map(({ doc, label }) => {
                const isImage = doc!.data.startsWith('data:image');
                return (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    {isImage
                      ? <img src={doc!.data} alt={label} className="w-14 h-[72px] object-cover rounded-lg border border-gray-200 flex-shrink-0 cursor-pointer" onClick={() => setDocPreview({ name: label, data: doc!.data })}/>
                      : <div className="w-14 h-[72px] rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => setDocPreview({ name: label, data: doc!.data })}>
                          <span className="text-2xl">📄</span>
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-800 uppercase tracking-wide">{label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">{doc!.name}</p>
                      <p className="text-[10px] text-gray-400">{doc!.date}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setDocPreview({ name: label, data: doc!.data })}
                        className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition"
                      >
                        👁 Ver
                      </button>
                      <a
                        href={doc!.data}
                        download={`${label.replace(/[^a-zA-Z0-9]/g,'_')}_${dep._nombre.replace(/\s+/g,'_')}`}
                        className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-[#16a34a] text-white hover:bg-green-700 transition text-center"
                      >
                        ⬇ Bajar
                      </a>
                    </div>
                  </div>
                );
              })}

              {/* Calificaciones escolares (boletines) — el acudiente puede subir varias */}
              {califs.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">📚 Calificaciones escolares ({califs.length})</p>
                  <div className="space-y-2">
                    {califs.map(cal => {
                      const isImage = (cal.datos ?? '').startsWith('data:image');
                      return (
                        <div key={cal.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                          {isImage
                            ? <img src={cal.datos} alt={cal.nombre} className="w-14 h-[72px] object-cover rounded-lg border border-gray-200 flex-shrink-0 cursor-pointer" onClick={() => setDocPreview({ name: cal.nombre || 'Calificación', data: cal.datos })}/>
                            : <div className="w-14 h-[72px] rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={() => setDocPreview({ name: cal.nombre || 'Calificación', data: cal.datos })}>
                                <span className="text-2xl">📄</span>
                              </div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-gray-800 uppercase tracking-wide">📚 Calificación escolar</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{cal.nombre || 'Calificación'}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => setDocPreview({ name: cal.nombre || 'Calificación', data: cal.datos })}
                              className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition"
                            >
                              👁 Ver
                            </button>
                            <a
                              href={cal.datos}
                              download={`Calificacion_${(cal.nombre || 'boletin').replace(/[^a-zA-Z0-9]/g,'_')}_${dep._nombre.replace(/\s+/g,'_')}`}
                              className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-[#16a34a] text-white hover:bg-green-700 transition text-center"
                            >
                              ⬇ Bajar
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(!foto && !docTI && !docRC && !docEPS && califs.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">El acudiente aún no ha subido documentos.</p>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ── MODAL PREVIEW DOCUMENTO ── */}
      {docPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setDocPreview(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-black text-gray-800">{docPreview.name}</p>
              <button onClick={() => setDocPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">✕</button>
            </div>
            <div className="p-4">
              {docPreview.data.startsWith('data:image') ? (
                <img src={docPreview.data} alt={docPreview.name} className="w-full rounded-xl object-contain max-h-[70vh]"/>
              ) : (
                <iframe src={docPreview.data} title={docPreview.name} className="w-full h-[70vh] rounded-xl border border-gray-100"/>
              )}
            </div>
            <div className="px-4 pb-4">
              <a
                href={docPreview.data}
                download={docPreview.name.replace(/[^a-zA-Z0-9]/g,'_')}
                className="block text-center bg-[#16a34a] text-white font-black text-sm py-2.5 rounded-xl hover:bg-green-700 transition"
              >
                ⬇ Descargar documento
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Campos fijos para la pestaña Datos
const CAMPOS_DATOS_ORDEN: { label: string; rx: RegExp }[] = [
  { label: 'Tipo de Documento',      rx: /tipo.*doc|doc.*tipo/i },
  { label: 'Número de Documento',    rx: /n[uú]mero.*doc|num.*doc|^n[uú]m\.?\s*doc|^documento$|^c[eé]dula/i },
  { label: 'EPS / Entidad de Salud', rx: /eps|entidad.*salud|salud/i },
  { label: 'Género',                 rx: /g[eé]nero|sexo/i },
  { label: 'Estrato',                rx: /estrato/i },
  { label: 'Dirección',              rx: /direcci[oó]n|direcc/i },
  { label: 'Barrio',                 rx: /barrio/i },
  { label: 'Municipio',              rx: /municipio|ciudad/i },
];

function buildPestanaDatos(cols: Record<string, string>): CampoD[] {
  const res: CampoD[] = [];
  for (const campo of CAMPOS_DATOS_ORDEN) {
    const key = Object.keys(cols).find(k => campo.rx.test(k.trim()));
    if (key) res.push({ key, label: campo.label, val: cols[key] ?? '' });
  }
  return res;
}

// Campos fijos para la pestaña Contacto
// Usa "usedKeys" para que la misma regex devuelva el 1er y luego el 2do match
function buildPestanaContacto(cols: Record<string, string>): CampoD[] {
  const res: CampoD[] = [];
  const usados = new Set<string>();

  function nextKey(rx: RegExp): string | undefined {
    return Object.keys(cols).find(k => rx.test(k.trim()) && !usados.has(k));
  }

  const campos: { label: string; rx: RegExp }[] = [
    { label: 'Nombre del Acudiente',  rx: /acudiente|representante|tutor|nombre.*familiar/i },
    { label: 'Parentesco',            rx: /parentesco/i },
    { label: 'Celular',               rx: /celular|tel[eé]fono|m[oó]vil/i },
    { label: 'Email',                 rx: /correo|email/i },
    { label: 'Otro Familiar',         rx: /acudiente|representante|tutor|nombre.*familiar/i },
    { label: 'Parentesco (Familiar)', rx: /parentesco/i },
    { label: 'Celular (Familiar)',    rx: /celular|tel[eé]fono|m[oó]vil/i },
  ];

  for (const campo of campos) {
    const key = nextKey(campo.rx);
    if (key) {
      usados.add(key);
      res.push({ key, label: campo.label, val: cols[key] ?? '' });
    }
  }
  return res;
}

// Helper: agrupar columnas
function agruparColumna(columnas: [string, string][]) {
  const grupos: Record<string, [string, string][]> = {
    'Deportista': [],
    'Datos':      [],
    'Contacto':   [],
    'Financiero': [],
    'Otros':      [],
  };

  const esDeFamilia = (k: string) =>
    /padre|madre|acudiente|adulto|representac|tutor|familiar/i.test(k);

  const esTelefono = (k: string) =>
    /telefono|celular|m[oó]vil|phone|numero\s*m[oó]vil/i.test(k);

  columnas.forEach(par => {
    const k = par[0];
    if (/nombre|apellido|codigo|documento|numero de doc|deportista|cedula|\bid\b/i.test(k))
      grupos['Deportista'].push(par);
    else if (/program|categor|proy|grupo|division|sub|edad|año|mes|dia|fecha|nac|estado|posic|sede|jornada|profe|compite/i.test(k))
      grupos['Datos'].push(par);
    else if (esDeFamilia(k) || (esTelefono(k) && esDeFamilia(k)))
      grupos['Contacto'].push(par);
    else if (esTelefono(k))
      grupos['Deportista'].push(par);
    else if (esDeFamilia(k) || /correo|email|direc|autoriza/i.test(k))
      grupos['Contacto'].push(par);
    else if (/pago|valor|cuota|monto|tarifa|mensual|cobro|precio|\d{5,}/i.test(k))
      grupos['Financiero'].push(par);
    else
      grupos['Otros'].push(par);
  });
  return Object.entries(grupos).filter(([, items]) => items.length > 0);
}
