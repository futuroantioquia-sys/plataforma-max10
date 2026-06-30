'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Edit3, Save, X, Camera, Star, Clipboard, DollarSign, MessageCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deportista } from '@/app/alumnos/importar/page';
import { DEPORTISTAS_KEY } from '@/app/alumnos/importar/page';

const FOTOS_KEY = 'futuro_fotos_deportistas';

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

  const [dep,      setDep]      = useState<Deportista | null>(null);
  const [foto,     setFoto]     = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [edits,    setEdits]    = useState<Record<string, string>>({});
  const [tab,      setTab]      = useState(0);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const lista: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
      const d = lista.find(x => x.id === id);
      if (d) { setDep(d); setEdits({ ...d._columnas }); }
      const fotos = JSON.parse(localStorage.getItem(FOTOS_KEY) ?? '{}');
      if (fotos[id]) setFoto(fotos[id]);
    } catch {}
  }, [id]);

  function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setFoto(b64);
      try {
        const fotos = JSON.parse(localStorage.getItem(FOTOS_KEY) ?? '{}');
        fotos[id] = b64;
        localStorage.setItem(FOTOS_KEY, JSON.stringify(fotos));
      } catch {}
    };
    reader.readAsDataURL(file);
  }

  function guardar() {
    if (!dep) return;
    try {
      const lista: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
      const nueva = lista.map(d => d.id === id ? { ...d, _columnas: edits } : d);
      localStorage.setItem(DEPORTISTAS_KEY, JSON.stringify(nueva));
      setDep(prev => prev ? { ...prev, _columnas: edits } : prev);
      setEditando(false);
    } catch {}
  }

  function eliminar() {
    if (!dep) return;
    if (!confirm(`¿Eliminar a ${dep._nombre} de la lista? Esta acción no se puede deshacer.`)) return;
    try {
      const lista: Deportista[] = JSON.parse(localStorage.getItem(DEPORTISTAS_KEY) ?? '[]');
      localStorage.setItem(DEPORTISTAS_KEY, JSON.stringify(lista.filter(d => d.id !== id)));
    } catch {}
    router.push('/alumnos');
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
  const columnas  = Object.entries(dep._columnas).filter(([k]) => {
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
  const getC = (rx: RegExp) => { const k = Object.keys(dep._columnas).find(k => rx.test(k)); return k ? dep._columnas[k] : ''; };
  const programaVal  = getC(/^program/i);
  const proyectoVal  = getC(/^proy/i);
  const codigoVal    = getC(/^c[oó]d/i);
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

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/alumnos')} className="text-white/80 hover:text-white text-sm font-bold">
            ← Deportistas
          </button>
        </div>
        <div className="flex items-center gap-2">
          {editando && (
            <button onClick={() => { setEditando(false); setEdits({ ...dep._columnas }); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-black text-white hover:bg-gray-900 border border-white/20 transition">
              <X className="w-4 h-4" /> Cancelar
            </button>
          )}
          {!editando && (
            <button onClick={eliminar}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-black text-white hover:bg-gray-900 border border-white/20 transition">
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
          )}
          <button onClick={() => editando ? guardar() : setEditando(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-black text-white hover:bg-gray-900 border border-white/20 transition">
            {editando ? <><Save className="w-4 h-4" /> Guardar</> : <><Edit3 className="w-4 h-4" /> Editar</>}
          </button>
          <div className="text-right leading-tight border-l border-white/30 pl-3">
            <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
            <p className="text-white/50 text-[11px]">Conecta, Gestiona, Gana</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-5 space-y-4">

        {/* ── TARJETA HERO ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#064e1e] via-[#052a10] to-black p-4 shadow-lg">

          {/* Fila superior: avatar + info + código */}
          <div className="flex items-start gap-3">

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl ring-4 ring-white/30 overflow-hidden bg-white/20 flex items-center justify-center">
                {foto
                  ? <img src={foto} alt="" className="w-full h-full object-cover"/>
                  : <span className="text-white font-black text-3xl">{initials}</span>
                }
              </div>
              <button onClick={() => inputFotoRef.current?.click()}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white/90 hover:bg-white rounded-full px-2 py-0.5 flex items-center gap-1 shadow transition">
                <Camera className="w-3 h-3 text-gray-600"/>
              </button>
              <input ref={inputFotoRef} type="file" accept="image/*" className="hidden" onChange={subirFoto}/>
            </div>

            {/* Nombre + etiquetas */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <h1 className="text-white font-black text-lg leading-tight uppercase tracking-wide">
                {dep._nombre}
              </h1>

              {programaVal && (
                <div className="flex items-center gap-2">
                  <span className="text-white/60 text-[10px] font-black tracking-widest uppercase w-24 flex-shrink-0">PROGRAMA</span>
                  <span className="bg-[#16a34a] text-white text-[11px] font-black px-3 py-0.5 rounded-full">
                    {programaVal.toUpperCase()}
                  </span>
                </div>
              )}

              {proyectoVal && (
                <div className="flex items-center gap-2">
                  <span className="text-white/60 text-[10px] font-black tracking-widest uppercase w-24 flex-shrink-0">PROYECTO</span>
                  <span className="bg-[#16a34a] text-white text-[11px] font-black px-3 py-0.5 rounded-full">
                    {proyectoVal.toUpperCase()}
                  </span>
                </div>
              )}

              {fechaAfilVal && (
                <div className="flex items-center gap-2">
                  <span className="text-white/60 text-[10px] font-black tracking-widest uppercase w-24 flex-shrink-0 leading-tight">FECHA DE AFILIACIÓN</span>
                  <span className="bg-[#16a34a] text-white text-[11px] font-black px-3 py-0.5 rounded-full">
                    {fechaAfilVal}
                  </span>
                </div>
              )}
            </div>

            {/* CÓDIGO — esquina superior derecha */}
            {codigoVal && (
              <div className="flex-shrink-0 text-center ml-1">
                <p className="text-white/70 text-[9px] font-black tracking-widest uppercase mb-1">CÓDIGO</p>
                <div className="bg-[#16a34a] text-white font-black text-xl px-3 py-1.5 rounded-xl min-w-[64px] text-center shadow-sm">
                  {codigoVal}
                </div>
              </div>
            )}
          </div>

          {/* Botones de acceso */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[
              { label: 'ASISTENCIA', href: `/alumnos/${id}/asistencia` },
              { label: 'PAGOS',      href: `/alumnos/${id}/estado-cuenta` },
              { label: 'INFORMES',   href: '/evaluaciones' },
              { label: 'MENSAJES',   href: '/mensajes' },
            ].map(({ label, href }) => (
              <button key={label} onClick={() => router.push(href)}
                className="bg-white hover:bg-gray-100 active:bg-gray-200 transition rounded-xl py-2.5 text-black font-black text-[11px] tracking-wide">
                {label}
              </button>
            ))}
          </div>
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

      </main>
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
