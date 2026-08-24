'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, Download } from 'lucide-react';
import { rutaAnterior } from '@/components/RastreoRuta';
import { getDeportistas, getFoto, getProfes } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { getCategoriasValoracion } from '@/lib/valoracion-textos';
import { esSuperAdmin, esDeportivo, esContabilidad } from '@/lib/permisos';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/* ── Niveles ── */
// Escala de frecuencia usada en Comportamiento (SIEMPRE=5 … NUNCA=1)
const FREQ_MAP: Record<string, number> = {
  'SIEMPRE': 5, 'CASI SIEMPRE': 4, 'ALGUNAS VECES': 3, 'CASI NUNCA': 2, 'NUNCA': 1,
};
function nivelNum(s: string): number {
  const t = (s ?? '').trim();
  const m = t.match(/nivel\s*(\d)/i);
  if (m) return parseInt(m[1]);
  const f = FREQ_MAP[t.toUpperCase()];
  if (f) return f;
  const n = parseInt(t);
  return isNaN(n) ? 0 : Math.max(0, Math.min(5, n));
}
// "No Aplica": el profe no alcanzó a evaluar. Cuenta como 5 SOLO para el promedio; en la barra va sin color.
function esNoAplica(s: string): boolean {
  const t = (s ?? '').trim().toUpperCase();
  return t === 'NO APLICA' || t === 'N/A' || t === 'NO APLICA.';
}
// Valor para el promedio: No Aplica = 5; evaluado = su nivel; vacío = null (se omite)
function valorPromedio(raw: string): number | null {
  if (esNoAplica(raw)) return 5;
  const n = nivelNum(raw);
  return n > 0 ? n : null;
}
function nivelPct(n: number): number { return [0, 20, 40, 60, 80, 100][n] ?? 0; }
function nivelLabel(n: number): string {
  return ['Por evaluar', 'Iniciación', 'En Desarrollo', 'Competente', 'Avanzado', 'Dominante'][n] ?? 'Por evaluar';
}
function nivelColor(n: number): string {
  // Rampa: gris → rojo → naranja → amarillo → verde claro → verde (verde = mejor)
  return ['#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'][n] ?? '#6b7280';
}
function codigoDe(dep: Deportista): string {
  const k = Object.keys(dep._columnas ?? {}).find(c => /^c[oó]d/i.test(c.trim()));
  return k ? (dep._columnas[k] ?? '').trim() : '';
}
function programaDe(dep: Deportista | null): string {
  if (!dep) return '';
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => /^program/i.test(c.trim()))
        ?? Object.keys(cols).find(c => /^categ/i.test(c.trim()))
        ?? Object.keys(cols).find(c => /^sub/i.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}
function proyectoDe(dep: Deportista | null): string {
  if (!dep) return '';
  const cols = dep._columnas ?? {};
  const k = Object.keys(cols).find(c => /^proy/i.test(c.trim()));
  return k ? (cols[k] ?? '').trim() : '';
}

/* ── Estructura EXACTA del formato de Valoración Deportiva (fundamento por fundamento) ── */
type Fund = { label: string; nivelCol: string; descCol?: string };
type Cat  = { titulo: string; emoji: string; color: string; funds: Fund[] };

const CATS: Cat[] = [
  { titulo: 'Físico', emoji: '💪', color: '#dc2626', funds: [
    { label: 'Fuerza — Potencia y Duelo',            nivelCol: 'fuerza_nivel',      descCol: 'fuerza_desc' },
    { label: 'Velocidad — Reacción y Desplazamiento', nivelCol: 'velocidad_nivel',   descCol: 'velocidad_desc' },
    { label: 'Resistencia — Capacidad Aeróbica',      nivelCol: 'resistencia_nivel', descCol: 'resistencia_desc' },
  ] },
  { titulo: 'Técnica', emoji: '⚽', color: '#2563eb', funds: [
    { label: 'Control',              nivelCol: 'control_nivel',    descCol: 'control_desc' },
    { label: 'Pase',                 nivelCol: 'pase_nivel',       descCol: 'pase_desc' },
    { label: 'Conducción',           nivelCol: 'conducta_nivel',   descCol: 'conducta_desc' },
    { label: 'Dribling',             nivelCol: 'dribling_nivel',   descCol: 'dribling_desc' },
    { label: 'Remate',               nivelCol: 'remata_nivel',     descCol: 'remata_desc' },
    { label: 'Cabeceo',              nivelCol: 'cabeceo_nivel',    descCol: 'cabeceo_desc' },
    { label: 'Quite del Balón',      nivelCol: 'quite_nivel',      descCol: 'quite_desc' },
    { label: 'Protección del Balón', nivelCol: 'proteccion_nivel', descCol: 'proteccion_desc' },
  ] },
  { titulo: 'Táctica', emoji: '🧠', color: '#7c3aed', funds: [
    { label: 'Ubicación Espacial',        nivelCol: 'posicion_nivel',     descCol: 'posicion_desc' },
    { label: 'Velocidad de Procesamiento', nivelCol: 'vision_nivel',       descCol: 'vision_desc' },
    { label: 'Lectura de Alturas y Espacios', nivelCol: 'defensa_nivel',   descCol: 'defensa_desc' },
    { label: 'Amplitud y Profundidad',    nivelCol: 'amplitud_nivel',     descCol: 'amplitud_desc' },
    { label: 'Transiciones (Ataque-Defensa)', nivelCol: 'transicion_nivel', descCol: 'transicion_desc' },
    { label: 'Superioridad Numérica 2vs1', nivelCol: 'superioridad_nivel', descCol: 'superioridad_desc' },
    { label: 'Basculación y Coberturas',  nivelCol: 'basculacion_nivel',  descCol: 'basculacion_desc' },
  ] },
  { titulo: 'Mental y Actitudinal', emoji: '❤️', color: '#0891b2', funds: [
    { label: 'Trabajo en Equipo',        nivelCol: 'trabajo_nivel',      descCol: 'trabajo_desc' },
    { label: 'Gestión de la Frustración', nivelCol: 'disciplina_nivel',   descCol: 'disciplina_desc' },
    { label: 'Comunicación Asertiva',    nivelCol: 'actitud_nivel',      descCol: 'actitud_desc' },
  ] },
  { titulo: 'Trabajo en Equipo', emoji: '🤝', color: '#0891b2', funds: [
    { label: 'Identidad y Estilo de Juego', nivelCol: 'identidad_nivel', descCol: 'identidad_desc' },
    { label: 'Bloque y Cohesión Táctica', nivelCol: 'bloque_nivel',      descCol: 'bloque_desc' },
    { label: 'Clima Interno y Comunicación', nivelCol: 'clima_nivel',    descCol: 'clima_desc' },
    { label: 'Gestión de la Competición', nivelCol: 'gestion_comp_nivel', descCol: 'gestion_comp_desc' },
  ] },
  { titulo: 'Comportamiento', emoji: '⭐', color: '#16a34a', funds: [
    { label: 'Responsabilidad',      nivelCol: 'responsabilidad' },
    { label: 'Puntualidad',          nivelCol: 'puntualidad' },
    { label: 'Disciplina',           nivelCol: 'disciplina_comp' },
    { label: 'Respeto',              nivelCol: 'respeto' },
    { label: 'Tolerancia',           nivelCol: 'tolerancia' },
    { label: 'Compañerismo',         nivelCol: 'companerismo' },
    { label: 'Liderazgo',            nivelCol: 'liderazgo' },
    { label: 'Trabajo en Equipo',    nivelCol: 'trabajo_equipo_comp' },
    { label: 'Sentido de Pertenencia', nivelCol: 'sentido_pertenencia' },
  ] },
];

// ── Íconos animados: símbolos deportivos grandes y dinámicos (blanco/verde) ──
const ICO = { w: 56 as number, h: 56 as number };

/** Físico: mancuerna que se levanta. */
function IconoFisico() {
  return (
    <svg viewBox="0 0 48 48" width={ICO.w} height={ICO.h} aria-hidden="true" style={{ flexShrink: 0 }}>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 5;0 -5;0 5" keyTimes="0;0.5;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        <rect x="15" y="22" width="18" height="4.5" rx="2" fill="#fff" />
        <rect x="11" y="16" width="4.5" height="16" rx="2" fill="#fff" />
        <rect x="32.5" y="16" width="4.5" height="16" rx="2" fill="#fff" />
        <rect x="7" y="18.5" width="4" height="11" rx="1.8" fill="#fff" />
        <rect x="37" y="18.5" width="4" height="11" rx="1.8" fill="#fff" />
      </g>
    </svg>
  );
}

/** Técnica: balón de fútbol girando. */
function IconoTecnico() {
  return (
    <svg viewBox="0 0 48 48" width={ICO.w} height={ICO.h} aria-hidden="true" style={{ flexShrink: 0 }}>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="3s" repeatCount="indefinite" />
        <circle cx="24" cy="24" r="16" fill="#fff" stroke="#0b3d1e" strokeWidth="1.6" />
        <polygon points="24,14 32,20 29,29.5 19,29.5 16,20" fill="#0b3d1e" />
        <path d="M24 8 L24 14 M40 20 L32 20 M34 34 L29 29.5 M14 34 L19 29.5 M8 20 L16 20" stroke="#0b3d1e" strokeWidth="1.5" fill="none" />
        <path d="M18 10 L24 14 M30 10 L24 14 M38 27 L29 29.5 M10 27 L19 29.5 M40 20 L32 20" stroke="#0b3d1e" strokeWidth="1.1" fill="none" opacity="0.7" />
      </g>
    </svg>
  );
}

/** Táctica: flecha con una línea en movimiento. */
function PizarraTactica() {
  return (
    <svg viewBox="0 0 48 48" width={ICO.w} height={ICO.h} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M7 40 Q18 36 24 26" fill="none" stroke="#ffe14d" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="3 4.5">
        <animate attributeName="stroke-dashoffset" values="15;0" dur="0.6s" repeatCount="indefinite" />
      </path>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;3.5 -3.5;0 0" keyTimes="0;0.5;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
        <path d="M20 30 L36 12" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M36 12 L27 13.5 M36 12 L34.5 21" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/** Mental: cabeza con un bombillo encendido en el cerebro. */
function IconoMental() {
  return (
    <svg viewBox="0 0 48 48" width={ICO.w} height={ICO.h} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M15 42 L15 34 Q9 30 9 22 Q9 10 22 9 Q35 9 35 21 Q35 27 31 30 L31 42" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <g stroke="#ffe14d" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <animate attributeName="opacity" values="0.35;1;0.35" dur="1.3s" repeatCount="indefinite" />
        <path d="M21 4 L21 1 M11 8 L8.5 6 M31 8 L33.5 6 M9 16 L6 15.5 M33 16 L36 15.5" />
      </g>
      <g transform="translate(21,17)">
        <animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.14;1" keyTimes="0;0.5;1" dur="1.3s" repeatCount="indefinite" />
        <circle r="6.5" fill="#fde047" />
        <rect x="-3" y="5.5" width="6" height="3.4" rx="1" fill="#fff" />
        <rect x="-2.3" y="8.6" width="4.6" height="2" rx="1" fill="#fff" />
        <path d="M0 -3.5 L0 3 M-2.4 -2 L0 0 M2.4 -2 L0 0" stroke="#f59e0b" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
}

/** Trabajo en Equipo: dos puños chocando. */
function IconoGrupal() {
  return (
    <svg viewBox="0 0 48 48" width={ICO.w} height={ICO.h} aria-hidden="true" style={{ flexShrink: 0 }}>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;2.5 0;0 0" keyTimes="0;0.5;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.5 0 0.5 1;0.4 0 0.6 1" />
        <rect x="4" y="18" width="15" height="13" rx="4.5" fill="#fff" />
        <circle cx="19" cy="20.5" r="2.2" fill="#fff" />
        <circle cx="19" cy="24.5" r="2.3" fill="#fff" />
        <circle cx="19" cy="28.5" r="2.2" fill="#fff" />
        <path d="M13 17 q4 -2 7 1" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <rect x="1" y="20.5" width="5" height="8" rx="2" fill="#fff" />
      </g>
      <g transform="translate(48,0) scale(-1,1)">
        <animateTransform attributeName="transform" type="translate" values="0 0;-2.5 0;0 0" keyTimes="0;0.5;1" dur="1.1s" repeatCount="indefinite" calcMode="spline" keySplines="0.5 0 0.5 1;0.4 0 0.6 1" additive="sum" />
        <rect x="4" y="18" width="15" height="13" rx="4.5" fill="#fff" />
        <circle cx="19" cy="20.5" r="2.2" fill="#fff" />
        <circle cx="19" cy="24.5" r="2.3" fill="#fff" />
        <circle cx="19" cy="28.5" r="2.2" fill="#fff" />
        <path d="M13 17 q4 -2 7 1" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <rect x="1" y="20.5" width="5" height="8" rx="2" fill="#fff" />
      </g>
      <g stroke="#ffe14d" strokeWidth="1.8" strokeLinecap="round">
        <animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.45;0.5;0.65" dur="1.1s" repeatCount="indefinite" />
        <path d="M24 14 L24 9 M24 34 L24 39 M17 12 L14 8 M31 12 L34 8 M17 36 L14 40 M31 36 L34 40" />
      </g>
    </svg>
  );
}

/** Comportamiento: estrella que brilla. */
function IconoComportamental() {
  return (
    <svg viewBox="0 0 48 48" width={ICO.w} height={ICO.h} aria-hidden="true" style={{ flexShrink: 0 }}>
      <g transform="translate(24,24)">
        <animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.16;1" keyTimes="0;0.5;1" dur="1.2s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="rotate" additive="sum" values="-7;7;-7" keyTimes="0;0.5;1" dur="2.6s" repeatCount="indefinite" />
        <polygon points="0,-16 4.6,-5.2 16,-5.2 6.8,2.4 10.4,14 0,7 -10.4,14 -6.8,2.4 -16,-5.2 -4.6,-5.2" fill="#fde047" stroke="#f59e0b" strokeWidth="1.5" />
      </g>
      <g fill="#fff">
        <circle cx="9" cy="10" r="1.5"><animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" /></circle>
        <circle cx="39" cy="15" r="1.7"><animate attributeName="opacity" values="1;0;1" dur="1.5s" repeatCount="indefinite" /></circle>
        <circle cx="36" cy="39" r="1.3"><animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" /></circle>
      </g>
    </svg>
  );
}

/** Devuelve el ícono animado según el título de la categoría (o null para usar el emoji). */
function iconoDeCategoria(titulo: string): React.ReactNode {
  switch (titulo) {
    case 'Físico':               return <IconoFisico />;
    case 'Técnica':              return <IconoTecnico />;
    case 'Táctica':              return <PizarraTactica />;
    case 'Mental y Actitudinal': return <IconoMental />;
    case 'Trabajo en Equipo':    return <IconoGrupal />;
    case 'Comportamiento':       return <IconoComportamental />;
    default:                     return null;
  }
}

function ValoracionDinamicaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codParam = searchParams.get('cod');
  const evParam  = searchParams.get('ev');   // informe concreto a mostrar (id)
  // ?volver=/ruta → de dónde llegó el usuario, para devolverlo allí (ej: Control de Informes)
  const [volverA, setVolverA] = useState('');
  useEffect(() => {
    try {
      const param = searchParams.get('volver') || '';
      if (param.startsWith('/')) { setVolverA(param); return; }
      const prev = rutaAnterior(window.location.pathname);
      if (prev && !prev.startsWith('/valoracion-dinamica')) setVolverA(prev);
    } catch { /* noop */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo administradores ven el botón de descargar PDF (para probar)
  const [esAdminUI, setEsAdminUI] = useState(false);
  useEffect(() => { setEsAdminUI(esSuperAdmin() || esDeportivo() || esContabilidad()); }, []);

  const [deps, setDeps]   = useState<Deportista[]>([]);
  const [q, setQ]         = useState('');
  const [sel, setSel]     = useState<Deportista | null>(null);
  const [row, setRow]     = useState<Record<string, any> | null>(null);
  const [informes, setInformes] = useState<Record<string, any>[]>([]);   // todos los informes del deportista
  const [loading, setLoading] = useState(false);
  const [buscada, setBuscada] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const [fotoCalidoso, setFotoCalidoso] = useState('');   // foto que subió el calidoso
  const [catNombres, setCatNombres] = useState<Record<string, string>>({});   // nombres de componentes editados en Gestión

  useEffect(() => { getCategoriasValoracion().then(setCatNombres).catch(() => {}); }, []);
  const nombreComp = (titulo: string) => catNombres[titulo] || titulo;

  // Nombre completo del formador por proyecto (desde Proyectos y Formadores)
  const [profeNombrePorProy, setProfeNombrePorProy] = useState<Record<string, string>>({});
  useEffect(() => {
    getProfes().then(lista => {
      const map: Record<string, string> = {};
      lista.forEach(p => (p.proyectos ?? []).forEach(proy => {
        const k = (proy ?? '').trim().toUpperCase();
        if (k) map[k] = (p.nombre && p.nombre.trim()) ? p.nombre.trim() : p.usuario;
      }));
      setProfeNombrePorProy(map);
    }).catch(() => {});
  }, []);

  // Los calidosos (padres) aún NO tienen acceso a valoraciones
  useEffect(() => {
    if (typeof document !== 'undefined' && /futuro-session=deportista/.test(document.cookie)) {
      router.replace('/alumnos');
    }
  }, [router]);

  useEffect(() => { getDeportistas().then(setDeps).catch(() => {}); }, []);

  // Cargar la foto que subió el calidoso (tabla fotos_deportistas) para el deportista seleccionado
  useEffect(() => {
    setFotoCalidoso('');
    if (!sel?.id) return;
    getFoto(sel.id).then(f => { if (f) setFotoCalidoso(f); }).catch(() => {});
  }, [sel]);

  useEffect(() => {
    setMostrar(false);
    const t = setTimeout(() => setMostrar(true), 150);
    return () => clearTimeout(t);
  }, [row, sel]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return deps.filter(d =>
      codigoDe(d).toLowerCase().includes(term) || (d._nombre ?? '').toLowerCase().includes(term)
    ).slice(0, 8);
  }, [q, deps]);

  async function elegir(dep: Deportista, evId?: string | null) {
    setSel(dep); setQ(''); setRow(null); setInformes([]); setBuscada(false); setLoading(true);
    const cod = codigoDe(dep).toUpperCase();
    try {
      const res = await fetch(`${SB_URL}/rest/v1/evaluaciones?codigo=eq.${encodeURIComponent(cod)}&order=created_at.desc`, { headers: SB_HDR });
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setInformes(arr);
      const elegido = (evId && arr.find(r => String(r.id) === String(evId))) || arr[0] || null;
      setRow(elegido);
    } catch { setRow(null); setInformes([]); }
    finally { setLoading(false); setBuscada(true); }
  }

  // Auto-seleccionar por ?cod= desde la ficha (y ?ev= para un informe concreto)
  useEffect(() => {
    if (!codParam || sel || deps.length === 0) return;
    const t = codParam.trim().toLowerCase();
    const target = deps.find(d => codigoDe(d).toLowerCase() === t) ?? deps.find(d => codigoDe(d).toLowerCase().includes(t));
    if (target) elegir(target, evParam);
  }, [codParam, evParam, deps, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const val = (col: string) => String(row?.[col] ?? '');

  // Promedio general (0-100) sobre todos los fundamentos con dato
  const todosPct = CATS.flatMap(c => c.funds.map(f => nivelPct(nivelNum(val(f.nivelCol)))));
  const conDato = todosPct.filter(p => p > 0);
  const calNum = nivelNum(val('calificacion'));
  const promedio = calNum > 0 ? nivelPct(calNum)
    : conDato.length ? Math.round(conDato.reduce((a, b) => a + b, 0) / conDato.length) : 0;

  // Calificación final del deportista en escala 1-5 (promedio PLANO de TODOS los fundamentos con dato; No Aplica = 5)
  const todosNiveles = CATS.flatMap(c => c.funds.map(f => valorPromedio(val(f.nivelCol)))).filter((n): n is number => n != null);
  const promedio5 = todosNiveles.length ? (todosNiveles.reduce((a, b) => a + b, 0) / todosNiveles.length) : 0;

  // Logros y Retos del Equipo: usa el texto guardado o lo genera desde los 4 fundamentos colectivos.
  const textoEquipo = (() => {
    const stored = String(row?.equipo_trimestre ?? '').trim();
    if (stored) return stored;
    const items = [
      { label: 'la identidad de juego',        n: nivelNum(String(row?.identidad_nivel ?? '')) },
      { label: 'la cohesión del bloque',       n: nivelNum(String(row?.bloque_nivel ?? '')) },
      { label: 'el clima interno del grupo',   n: nivelNum(String(row?.clima_nivel ?? '')) },
      { label: 'la gestión de la competición', n: nivelNum(String(row?.gestion_comp_nivel ?? '')) },
    ];
    if (!items.some(i => i.n > 0)) return '';
    const listar = (a: string[]) => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
    const fuertes = items.filter(i => i.n >= 4).map(i => i.label);
    const debiles = items.filter(i => i.n >= 1 && i.n <= 2).map(i => i.label);
    const lo = fuertes.length ? `Como equipo, se destaca en ${listar(fuertes)}.` : 'El equipo avanza en su consolidación colectiva.';
    const re = debiles.length ? `El reto grupal es fortalecer ${listar(debiles)}.` : 'El reto grupal es sostener el buen funcionamiento colectivo.';
    return `${lo} ${re}`;
  })();

  const sinEval = !!sel && buscada && !row;

  // Datos para el hero (foto grande estilo vista padres)
  const heroNombre    = (row?.nombre as string) || sel?._nombre || '';
  const heroPosRaw    = row ? String(row.posicion ?? '') : '';
  // Posición completa: "Portero" o "Jugador de Campo" (en vez de solo "De Campo")
  const heroPosicion  = /portero|arquer|golero|guardameta/i.test(heroPosRaw) ? 'Portero'
    : /de\s*campo/i.test(heroPosRaw) ? 'Jugador de Campo'
    : heroPosRaw;
  const heroPerfil    = row ? String(row.perfil ?? '').trim() : '';   // derecho / izquierdo / ambidiestro
  const heroPrograma  = (row?.programa ? String(row.programa) : '') || programaDe(sel);
  const heroProyecto  = (row?.proyecto ? String(row.proyecto) : '') || proyectoDe(sel);
  const heroFormador  = profeNombrePorProy[(heroProyecto || '').trim().toUpperCase()] || '';
  const heroIniciales = (sel?._nombre || heroNombre).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const heroCodigo    = (sel ? codigoDe(sel) : '') || (codParam ?? '').trim();
  // Nombre arriba / dos apellidos abajo
  const heroPartes    = heroNombre.trim().split(/\s+/).filter(Boolean);
  const heroApellidos = heroPartes.length >= 3 ? heroPartes.slice(-2).join(' ') : (heroPartes.length === 2 ? heroPartes[1] : '');
  const heroNombres   = heroPartes.length >= 3 ? heroPartes.slice(0, -2).join(' ') : (heroPartes.length === 2 ? heroPartes[0] : heroNombre);
  // Informe y periodo (los edita el profe en la valoración sencilla)
  const heroInforme   = row ? (String(row.numero_informe ?? '').trim() || '1') : '';
  const pDesde        = row ? String(row.periodo_desde ?? '').trim() : '';
  const pHasta        = row ? String(row.periodo_hasta ?? '').trim() : '';
  const heroAnio      = (String(row?.fecha ?? '').match(/(\d{4})/) || [])[1] || '';
  const heroPeriodo   = (pDesde && pHasta) ? `${pDesde} a ${pHasta}${heroAnio ? ' de ' + heroAnio : ''}`
                       : (pDesde || pHasta || '');

  function descargarPDF() {
    const cod = (codParam || '').trim();
    const nombre = (sel?._nombre || '').trim().replace(/\s+/g, '-');
    const prev = document.title;
    document.title = [cod, nombre, 'Valoracion-Dinamica'].filter(Boolean).join('_') || 'Valoracion-Dinamica';
    window.print();
    setTimeout(() => { document.title = prev; }, 1000);
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Impresión/PDF: conservar fondo negro y TODOS los colores tal cual se ven */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { margin: 6mm; }
          html, body { background: #000 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
        }
      ` }} />
      <header className="print:hidden bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button
          title={volverA.startsWith('/control-informes') ? 'Volver a Control de Informes' : 'Volver'}
          onClick={() => {
            if (volverA.startsWith('/')) router.push(volverA);
            else if (sel?.id) router.push(`/alumnos/${sel.id}`);
            else router.back();
          }}
          className="text-white/70 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight">Valoración Dinámica</h1>
          <p className="text-white/60 text-xs">La valoración deportiva con mejor diseño</p>
        </div>
        <div className="text-right leading-tight flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-4 space-y-4">
        {/* Buscador */}
        <div className="print:hidden bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Buscar deportista</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Código o nombre (ej: 23106 o Cristóbal)"
              className="w-full pl-9 pr-4 py-2.5 border border-white/15 bg-black/40 text-white placeholder-gray-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]" />
          </div>
          {matches.length > 0 && (
            <div className="mt-2 border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
              {matches.map(d => (
                <button key={d.id} onClick={() => elegir(d)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition">
                  <span className="bg-[#16a34a] text-white text-[11px] font-black px-2 py-0.5 rounded-md flex-shrink-0">{codigoDe(d) || '—'}</span>
                  <span className="text-sm font-bold text-gray-200 truncate">{d._nombre}</span>
                </button>
              ))}
            </div>
          )}
          {sel && <p className="mt-2 text-xs text-gray-500">Mostrando: <b className="text-[#16a34a]">{sel._nombre}</b> · Código {codigoDe(sel) || '—'}{loading && ' · cargando…'}</p>}
        </div>

        {/* Selector de informe cuando el deportista tiene más de uno */}
        {sel && informes.length >= 2 && (
          <div className="print:hidden bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-3">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Informe a mostrar</label>
            <div className="flex flex-wrap gap-2">
              {informes.map(inf => {
                const activo = row && String(row.id) === String(inf.id);
                const num = String(inf.numero_informe ?? '').trim();
                const fch = String(inf.fecha ?? '').trim();
                return (
                  <button key={inf.id} onClick={() => setRow(inf)}
                    className={`text-[12px] font-black px-3 py-1.5 rounded-full border transition ${activo ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'bg-black/40 text-gray-300 border-white/15 hover:bg-white/5'}`}>
                    {num ? `Informe ${num}` : 'Informe'}{fch ? ` · ${fch}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!sel && (
          <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-3 text-2xl">⚡</div>
            <p className="font-black text-white text-base mb-1">Busca un deportista</p>
            <p className="text-gray-400 text-sm">Escribe su código o nombre arriba para ver su valoración con el diseño dinámico.</p>
          </div>
        )}

        {sinEval && (
          <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3 text-2xl">📝</div>
            <p className="font-black text-white text-base mb-1">Aún sin valoración</p>
            <p className="text-gray-400 text-sm">Este deportista todavía no tiene una Valoración Deportiva registrada.</p>
          </div>
        )}

        {row && (
          <>
            {/* ── HERO — foto grande, nombre grande, programa y posición (estilo vista padres) ── */}
            <div className="rounded-3xl overflow-hidden shadow-xl border border-white/10" style={{ background: 'linear-gradient(150deg,#0b1220 0%,#0d2b1a 55%,#052a10 100%)' }}>
              <div className="p-5 flex gap-5 items-center">
                {/* Foto grande */}
                <div className="flex-shrink-0">
                  <div className="w-32 h-40 sm:w-40 sm:h-52 rounded-2xl overflow-hidden border-2 border-[#16a34a]/50 bg-white/10 flex items-center justify-center shadow-[0_0_28px_rgba(22,163,74,0.3)]">
                    {(row.foto || fotoCalidoso)
                      ? <img src={row.foto || fotoCalidoso} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'top' }} />
                      : <span className="text-white font-black text-4xl">{heroIniciales}</span>}
                  </div>
                  {heroCodigo && (
                    <div className="mt-2 text-center bg-[#16a34a] rounded-lg py-1 px-1">
                      <span className="text-white text-[11px] font-black tracking-widest">{heroCodigo}</span>
                    </div>
                  )}
                </div>
                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  {/* Nombre arriba, dos apellidos abajo */}
                  <p className="text-white font-black text-2xl sm:text-3xl leading-tight break-words uppercase">{heroNombres}</p>
                  {heroApellidos && <p className="text-white font-black text-2xl sm:text-3xl leading-tight break-words uppercase">{heroApellidos}</p>}
                  <div className="mt-3 flex flex-col gap-2 items-start">
                    <div className="flex flex-wrap gap-2">
                      {heroPrograma && <span className="bg-[#16a34a] text-white text-[11px] font-black px-3 py-1 rounded-full">{heroPrograma}</span>}
                      {heroProyecto && <span className="bg-white/15 text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/10">{heroProyecto}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {heroPosicion && <span className="bg-white/15 text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/10 uppercase">{heroPosicion}</span>}
                      {heroPerfil && <span className="bg-white/15 text-white text-[11px] font-bold px-3 py-1 rounded-full border border-white/10 uppercase">Perfil {heroPerfil}</span>}
                    </div>
                  </div>
                  {/* Título + informe + periodo (sin calificación arriba — la nota va en el consolidado) */}
                  <p className="text-white font-black text-xl leading-tight tracking-wide uppercase mt-4">Valoración Integral<br/>del Deportista</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {heroInforme && <span className="bg-[#16a34a] text-white text-[11px] font-black px-3 py-1 rounded-full uppercase">Informe {heroInforme}</span>}
                    {heroPeriodo && <span className="text-white/70 text-[11px] font-bold uppercase">{heroPeriodo}</span>}
                  </div>
                  {heroFormador && (
                    <p className="text-white/80 text-[12px] font-bold mt-2">
                      <span className="text-white/50 font-black uppercase tracking-wide text-[10px]">Formador: </span>{heroFormador}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Categorías: TODOS los fundamentos, uno por uno, con explicación */}
            {CATS.map(cat => {
              const nivelesCat = cat.funds.map(f => valorPromedio(val(f.nivelCol))).filter((n): n is number => n != null);
              const prom5 = nivelesCat.length ? (nivelesCat.reduce((a, b) => a + b, 0) / nivelesCat.length) : 0;
              return (
                <div key={cat.titulo} className="rounded-2xl overflow-hidden shadow-sm border border-white/10 bg-[#0f172a]">
                  <div className="flex items-center gap-2 px-4 py-3" style={{ background: '#16a34a' }}>
                    {iconoDeCategoria(cat.titulo) ?? <span className="text-lg">{cat.emoji}</span>}
                    <span className="text-white font-black text-[17px] uppercase tracking-wide flex-1">{nombreComp(cat.titulo)}</span>
                    <span className="text-white font-black flex-shrink-0" style={{ border: '2px solid #ffffff', borderRadius: 8, padding: '1px 12px', fontSize: 19, minWidth: 52, textAlign: 'center' }}>{prom5 > 0 ? prom5.toFixed(1).replace('.', ',') : '—'}</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {cat.funds.map((f, i) => {
                      const raw = val(f.nivelCol);
                      const noAplica = esNoAplica(raw);
                      const n = noAplica ? 0 : nivelNum(raw);   // No Aplica → sin nivel visible (barra vacía)
                      // Etiqueta: No Aplica; Comportamiento muestra la palabra (SIEMPRE…); si no, el nivel
                      const etiqueta = noAplica ? 'No aplica'
                        : FREQ_MAP[raw.trim().toUpperCase()] ? raw.trim() : nivelLabel(n);
                      // La barra se alinea al CENTRO de la casilla del nivel alcanzado
                      // (1→10%, 2→30%, 3→50%, 4→70%, 5→90%) para que apunte al nivel correcto.
                      const pctBarra = n > 0 ? ((n - 0.5) / 5) * 100 : 0;
                      const desc = f.descCol ? val(f.descCol) : '';
                      const col = nivelColor(n);
                      return (
                        <div key={f.label} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-black text-white text-[13px]">{f.label}</span>
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-full flex-shrink-0 text-white" style={{ background: 'rgba(255,255,255,0.14)' }}>
                              {noAplica ? 'No aplica' : n > 0 ? `Nivel ${n} · ${etiqueta}` : 'Por evaluar'}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${mostrar ? pctBarra : 0}%`,
                              background: 'linear-gradient(90deg,#ef4444 0%,#f97316 33%,#eab308 66%,#16a34a 100%)',
                              backgroundSize: `${pctBarra > 0 ? Math.round(10000 / pctBarra) : 100}% 100%`,
                              backgroundPosition: 'left center',
                              transition: `width 0.8s ease-out ${i * 0.05}s`,
                            }} />
                          </div>
                          {/* Escala de niveles (Nivel 1 … Nivel 5), resalta el alcanzado */}
                          <div className="flex gap-1 mt-1.5">
                            {[1, 2, 3, 4, 5].map(lvl => {
                              const activo = lvl === n;
                              return (
                                <span key={lvl}
                                  className="flex-1 text-center text-[8px] rounded py-0.5 leading-none text-white"
                                  style={activo
                                    ? { background: 'rgba(255,255,255,0.16)', fontWeight: 900, border: '1px solid rgba(255,255,255,0.35)' }
                                    : { color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                  Nivel {lvl}
                                </span>
                              );
                            })}
                            <span
                              className="flex-1 text-center text-[8px] rounded py-0.5 leading-none text-white"
                              style={noAplica
                                ? { background: 'rgba(255,255,255,0.16)', fontWeight: 900, border: '1px solid rgba(255,255,255,0.35)' }
                                : { color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                              No aplica
                            </span>
                          </div>
                          {desc && <p className="text-[12px] text-white/80 leading-snug mt-1.5">{desc}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* CONSOLIDADO POR COMPONENTE — barras con degradado (rojo→verde) y nota al lado */}
            {(() => {
              const fmt = (n: number) => n > 0 ? n.toFixed(1).replace('.', ',') : '—';
              const promDe = (titulo: string) => {
                const cat = CATS.find(c => c.titulo === titulo);
                if (!cat) return 0;
                const ns = cat.funds.map(f => valorPromedio(val(f.nivelCol))).filter((n): n is number => n != null);
                return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
              };
              const COMP_TITULOS = ['Físico', 'Técnica', 'Táctica', 'Mental y Actitudinal', 'Comportamiento', 'Trabajo en Equipo'];
              return (
                <div style={{ background: '#000', border: '2px solid #16324a', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {COMP_TITULOS.map(titulo => {
                    const prom = promDe(titulo);
                    return (
                      <div key={titulo} style={{ position: 'relative', height: 46, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#e5342b 0%,#f5811f 30%,#f4c11e 52%,#a8d33f 76%,#33b44a 100%)' }} />
                        <span style={{ position: 'relative', color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: 0.4, paddingLeft: 16, textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}>{nombreComp(titulo).toUpperCase()}</span>
                        <span style={{ position: 'relative', marginLeft: 'auto', marginRight: 10, border: '2px solid #ffffff', color: '#fff', fontWeight: 900, fontSize: 19, borderRadius: 8, padding: '1px 12px', minWidth: 52, textAlign: 'center' }}>{mostrar ? fmt(prom) : '—'}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 4px 16px' }}>
                    <span style={{ color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>VALORACIÓN INTEGRAL</span>
                    <span style={{ marginLeft: 'auto', border: '2px solid #ffffff', color: '#fff', fontWeight: 900, fontSize: 19, borderRadius: 8, padding: '2px 14px', minWidth: 52, textAlign: 'center' }}>{mostrar ? fmt(promedio5) : '—'}</span>
                  </div>
                </div>
              );
            })()}

            {/* Logros y Retos de tu Proyecto Deportivo — un solo cuadro (solo lectura) */}
            {(val('logros_trimestre') || val('objetivos_trimestre')) && (
              <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
                <p className="text-[11px] font-black uppercase tracking-widest mb-2 text-white">🏆 Logros y Retos Personales</p>
                {val('logros_trimestre') && (
                  <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap mb-2">
                    <span className="font-black text-[#4ade80]">Logros: </span>{val('logros_trimestre')}
                  </p>
                )}
                {val('objetivos_trimestre') && (
                  <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
                    <span className="font-black text-[#4ade80]">Retos: </span>{val('objetivos_trimestre')}
                  </p>
                )}
              </div>
            )}
            {/* Logros y Retos del Equipo (desde Identidad, Bloque, Clima y Gestión de la Competición) */}
            {textoEquipo && (
              <div className="rounded-2xl border border-white/10 shadow-sm p-4" style={{ background: 'linear-gradient(135deg,#1e1b3a 0%,#0f172a 100%)' }}>
                <p className="text-[11px] font-black uppercase tracking-widest mb-1.5 text-white">🤝 Logros y Retos del Equipo</p>
                <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{textoEquipo}</p>
              </div>
            )}
            {val('observaciones') && (
              <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
                <p className="text-[11px] font-black uppercase tracking-widest mb-1.5 text-white">📋 Observaciones del Entrenador</p>
                <p className="text-sm text-white/85 leading-relaxed">{val('observaciones')}</p>
              </div>
            )}

            {/* Firmas: Formador y Coordinador */}
            <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  {(() => {
                    const parts = (heroFormador || '').trim().split(/\s+/).filter(Boolean);
                    const ape = parts.length >= 3 ? parts.slice(-2).join(' ') : (parts.length === 2 ? parts[1] : '');
                    const nom = parts.length >= 3 ? parts.slice(0, -2).join(' ') : (parts.length === 2 ? parts[0] : (parts[0] || '—'));
                    return (
                      <>
                        <p className="text-white font-black text-[13px] uppercase tracking-wide leading-tight min-h-[16px]">{nom || '—'}</p>
                        {ape && <p className="text-white font-black text-[13px] uppercase tracking-wide leading-tight">{ape}</p>}
                      </>
                    );
                  })()}
                  <div className="border-t border-white/25 mt-2 pt-1.5">
                    <p className="text-white/50 text-[10px] font-bold uppercase tracking-wide">Nombre del Formador</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white font-black text-[13px] uppercase tracking-wide leading-tight min-h-[16px]">HERNÁN DARÍO</p>
                  <p className="text-white font-black text-[13px] uppercase tracking-wide leading-tight">MARULANDA MORENO</p>
                  <div className="border-t border-white/25 mt-2 pt-1.5">
                    <p className="text-white/50 text-[10px] font-bold uppercase tracking-wide">Director General</p>
                  </div>
                </div>
              </div>
              <div className="text-center mt-4 pt-3 border-t border-white/10">
                <p className="text-white font-black text-[12px] uppercase tracking-wide">Academia de Fútbol Futuro Antioquia</p>
                <p className="text-white/60 text-[10px] font-semibold mt-1">34 Años Acompañando Sueños</p>
              </div>
            </div>

            {/* Botón Descargar PDF — solo administradores (para probar) */}
            {esAdminUI && (
              <button onClick={descargarPDF}
                className="print:hidden w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#16a34a] to-[#064e1e] hover:opacity-90 active:opacity-80 transition rounded-2xl py-3.5 text-white font-black text-sm tracking-wide">
                <Download className="w-4 h-4" /> Descargar PDF
              </button>
            )}
          </>
        )}

        <div className="h-4" />
      </main>
    </div>
  );
}

export default function ValoracionDinamicaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <ValoracionDinamicaInner />
    </Suspense>
  );
}
