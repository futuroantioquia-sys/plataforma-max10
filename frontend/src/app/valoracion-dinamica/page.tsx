'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { getDeportistas, getFoto } from '@/lib/db';
import type { Deportista } from '@/lib/db';
import { getCategoriasValoracion } from '@/lib/valoracion-textos';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
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

/** Ícono dinámico del componente Táctico: pizarra de fútbol con un lápiz que dibuja una jugada. */
function PizarraTactica() {
  const JUGADA = 'M6 24 Q 12 9 20 16 T 27 8';
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
      {/* Tablero */}
      <rect x="2" y="4" width="28" height="24" rx="3" fill="#0b5d2a" stroke="#083f1d" strokeWidth="1" />
      {/* Marcas de cancha */}
      <line x1="16" y1="4" x2="16" y2="28" stroke="#ffffff" strokeWidth="0.7" opacity="0.65" />
      <circle cx="16" cy="16" r="3.4" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.65" />
      {/* Jugada que se va dibujando */}
      <path d="M6 24 Q 12 9 20 16 T 27 8" fill="none" stroke="#ffe14d" strokeWidth="1.7" strokeLinecap="round"
        strokeDasharray="44" strokeDashoffset="44">
        <animate attributeName="stroke-dashoffset" from="44" to="0" dur="2.2s" repeatCount="indefinite" />
      </path>
      {/* Lápiz que se desplaza sobre la jugada */}
      <g>
        <animateMotion dur="2.2s" repeatCount="indefinite" path={JUGADA} />
        <g transform="translate(-0.4,-9)">
          <rect x="-1.2" y="0" width="2.4" height="6.4" rx="0.4" fill="#fbbf24" stroke="#b45309" strokeWidth="0.3" />
          <rect x="-1.2" y="0" width="2.4" height="1.3" fill="#ef4444" />
          <polygon points="-1.2,6.4 1.2,6.4 0,9" fill="#e5c07b" />
          <polygon points="-0.45,8.2 0.45,8.2 0,9" fill="#1f2937" />
        </g>
      </g>
    </svg>
  );
}

/** Físico: balón de fútbol que rebota. */
function IconoFisico() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
      <ellipse cx="16" cy="28" rx="7" ry="1.6" fill="#000" opacity="0.25">
        <animate attributeName="rx" values="7;4;7" dur="0.9s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0.12;0.25" dur="0.9s" repeatCount="indefinite" />
      </ellipse>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -10; 0 0" keyTimes="0;0.5;1"
          dur="0.9s" repeatCount="indefinite" calcMode="spline" keySplines="0.3 0 0.2 1; 0.7 0 0.6 1" />
        <circle cx="16" cy="18" r="7" fill="#fff" stroke="#111" strokeWidth="0.8" />
        <polygon points="16,14 18.5,15.8 17.6,18.8 14.4,18.8 13.5,15.8" fill="#111" />
        <path d="M9.5 16 l1.8 1.3 M22.5 16 l-1.8 1.3 M16 25 v-2.4" stroke="#111" strokeWidth="0.7" fill="none" />
      </g>
    </svg>
  );
}

/** Técnico: diana con una flecha que da al centro. */
function IconoTecnico() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="16" r="10" fill="#fff" stroke="#111" strokeWidth="0.8" />
      <circle cx="18" cy="16" r="6.6" fill="#ef4444" />
      <circle cx="18" cy="16" r="3.4" fill="#fff" />
      <circle cx="18" cy="16" r="1.5" fill="#ef4444" />
      <g>
        <animateTransform attributeName="transform" type="translate" values="-18 0; 0 0" keyTimes="0;1"
          dur="1.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.35 0 0.15 1" />
        <line x1="3" y1="16" x2="16" y2="16" stroke="#6d28d9" strokeWidth="1.5" />
        <polygon points="17,16 13.5,14.2 13.5,17.8" fill="#6d28d9" />
        <polygon points="3,16 5.4,14.6 5.4,17.4" fill="#6d28d9" opacity="0.85" />
      </g>
    </svg>
  );
}

/** Mental: corazón que late. */
function IconoMental() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g transform="translate(16,16)">
        <g>
          <animateTransform attributeName="transform" type="scale" values="1;1.22;1;1.1;1" keyTimes="0;0.15;0.32;0.5;1"
            dur="1.1s" repeatCount="indefinite" />
          <path d="M0 9 C -9 2 -9 -6 -4 -7 C -1 -7.6 0 -5 0 -4.2 C 0 -5 1 -7.6 4 -7 C 9 -6 9 2 0 9 Z" fill="#f43f5e" />
        </g>
      </g>
    </svg>
  );
}

/** Grupal: apretón de manos con un ligero movimiento. */
function IconoGrupal() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g transform="translate(16,16)">
        <g>
          <animateTransform attributeName="transform" type="translate" values="0 -0.9; 0 0.9; 0 -0.9" dur="0.5s" repeatCount="indefinite" />
          <g transform="rotate(-25)">
            <rect x="-12.5" y="-2.4" width="11.5" height="4.8" rx="2.4" fill="#eab892" />
            <rect x="1" y="-2.4" width="11.5" height="4.8" rx="2.4" fill="#b9764a" />
            <rect x="-3.2" y="-3.2" width="6.4" height="6.4" rx="2.1" fill="#8a5a34" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Comportamental: estrella que brilla. */
function IconoComportamental() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g transform="translate(16,16)">
        <polygon points="0,-9 2.6,-2.8 9,-2.8 3.8,1.4 5.6,8 0,4 -5.6,8 -3.8,1.4 -9,-2.8 -2.6,-2.8" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5">
          <animateTransform attributeName="transform" type="scale" values="1;1.12;1" dur="1.6s" repeatCount="indefinite" />
        </polygon>
        <g>
          <animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite" />
          <path d="M7 -8 l0.7 1.9 1.9 0.7 -1.9 0.7 -0.7 1.9 -0.7 -1.9 -1.9 -0.7 1.9 -0.7 z" fill="#fff" />
        </g>
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

  const [deps, setDeps]   = useState<Deportista[]>([]);
  const [q, setQ]         = useState('');
  const [sel, setSel]     = useState<Deportista | null>(null);
  const [row, setRow]     = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [buscada, setBuscada] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const [fotoCalidoso, setFotoCalidoso] = useState('');   // foto que subió el calidoso
  const [catNombres, setCatNombres] = useState<Record<string, string>>({});   // nombres de componentes editados en Gestión

  useEffect(() => { getCategoriasValoracion().then(setCatNombres).catch(() => {}); }, []);
  const nombreComp = (titulo: string) => catNombres[titulo] || titulo;

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

  async function elegir(dep: Deportista) {
    setSel(dep); setQ(''); setRow(null); setBuscada(false); setLoading(true);
    const cod = codigoDe(dep).toUpperCase();
    try {
      const res = await fetch(`${SB_URL}/rest/v1/evaluaciones?codigo=eq.${encodeURIComponent(cod)}&order=created_at.desc&limit=1`, { headers: SB_HDR });
      const data = await res.json();
      setRow(Array.isArray(data) && data[0] ? data[0] : null);
    } catch { setRow(null); }
    finally { setLoading(false); setBuscada(true); }
  }

  // Auto-seleccionar por ?cod= desde la ficha
  useEffect(() => {
    if (!codParam || sel || deps.length === 0) return;
    const t = codParam.trim().toLowerCase();
    const target = deps.find(d => codigoDe(d).toLowerCase() === t) ?? deps.find(d => codigoDe(d).toLowerCase().includes(t));
    if (target) elegir(target);
  }, [codParam, deps, sel]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => { if (sel?.id) router.push(`/alumnos/${sel.id}`); else router.back(); }} className="text-white/70 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
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
        <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
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
                    <span className="text-white font-black text-sm uppercase tracking-wide flex-1">{nombreComp(cat.titulo)}</span>
                    <span className="text-white text-xs font-black px-3 py-1 rounded-full shadow-sm" style={{ background: '#f97316' }}>{prom5 > 0 ? prom5.toFixed(1) + ' / 5' : '—'}</span>
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
                        <span style={{ position: 'relative', marginLeft: 'auto', marginRight: 10, background: 'rgba(0,0,0,0.30)', border: '2px solid #eafff0', color: '#fff', fontWeight: 900, fontSize: 15, borderRadius: 8, padding: '3px 12px', minWidth: 48, textAlign: 'center' }}>{mostrar ? fmt(prom) : '—'}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 4px 16px' }}>
                    <span style={{ color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>VALORACIÓN INTEGRAL</span>
                    <span style={{ marginLeft: 'auto', background: '#f97316', color: '#fff', fontWeight: 900, fontSize: 16, borderRadius: 8, padding: '4px 16px', minWidth: 52, textAlign: 'center' }}>{mostrar ? fmt(promedio5) : '—'}</span>
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
