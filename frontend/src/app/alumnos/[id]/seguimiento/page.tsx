'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, ChevronDown, ChevronUp, Zap, Shield, Brain, Heart,
  Star, Trophy, Clock, AlertTriangle, Target, TrendingUp, Calendar,
} from 'lucide-react';
import { getDeportistas, getEvaluaciones } from '@/lib/db';
import type { Deportista, Evaluacion } from '@/lib/db';
import LoadingBall from '@/components/LoadingBall';

/* ── Utilidades de nivel ─────────────────────────────────────── */
function nivelNum(s: string): number {
  const m = (s ?? '').match(/nivel\s*(\d)/i);
  return m ? parseInt(m[1]) : 0;
}
function nivelCorto(n: number): string {
  return ['—', 'Iniciación', 'En Desarrollo', 'Competente', 'Avanzado', 'Dominante'][n] ?? '—';
}
function nivelColor(n: number): string {
  return ['#d1d5db', '#ef4444', '#f97316', '#eab308', '#3b82f6', '#16a34a'][n] ?? '#d1d5db';
}
function nivelPct(n: number): number {
  return [0, 20, 40, 60, 80, 100][n] ?? 0;
}

/* ── Columna código del deportista ──────────────────────────── */
function getCodigo(dep: Deportista): string {
  const k = Object.keys(dep._columnas ?? {}).find(c => /^c[oó]d/i.test(c.trim()));
  return k ? (dep._columnas[k] ?? '').trim().toUpperCase() : '';
}

/* ── Componente barra de habilidad ──────────────────────────── */
function SkillBar({
  label, nivelStr, desc, expanded, onToggle,
}: {
  label: string; nivelStr: string; desc: string;
  expanded: boolean; onToggle: () => void;
}) {
  const n    = nivelNum(nivelStr);
  const pct  = nivelPct(n);
  const col  = nivelColor(n);
  const text = nivelCorto(n);

  if (!nivelStr) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
      >
        {/* Estrellas */}
        <div className="flex gap-0.5 flex-shrink-0">
          {[1,2,3,4,5].map(i => (
            <span key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: i <= n ? col : '#e5e7eb' }}
            />
          ))}
        </div>

        {/* Nombre + nivel */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-[#111827] text-sm leading-tight">{label}</p>
          <p className="text-[10px] font-semibold" style={{ color: col }}>{text}</p>
        </div>

        {/* Número y chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="w-7 h-7 rounded-full flex items-center justify-center font-black text-sm text-white"
            style={{ background: col }}>
            {n || '—'}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Barra de progreso */}
      <div className="mx-4 mb-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: col }}
        />
      </div>

      {/* Descripción expandible */}
      {expanded && desc && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-50 pt-2">{desc}</p>
        </div>
      )}
    </div>
  );
}

/* ── Componente categoría ────────────────────────────────────── */
function Categoria({
  icon: Icon, titulo, color, skills, openSet, onToggle,
}: {
  icon: React.ElementType; titulo: string; color: string;
  skills: { label: string; nivelStr: string; desc: string }[];
  openSet: Set<string>; onToggle: (k: string) => void;
}) {
  const hasData = skills.some(s => s.nivelStr);
  if (!hasData) return null;

  const promedio = (() => {
    const nums = skills.map(s => nivelNum(s.nivelStr)).filter(n => n > 0);
    if (!nums.length) return 0;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  })();

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
      {/* Encabezado */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: color }}>
        <Icon className="w-5 h-5 text-white flex-shrink-0" />
        <p className="text-white font-black text-sm flex-1 uppercase tracking-wider">{titulo}</p>
        <div className="bg-white/20 rounded-full px-2.5 py-0.5">
          <span className="text-white font-black text-xs">{promedio > 0 ? promedio.toFixed(1) : '—'}/5</span>
        </div>
      </div>

      {/* Skills */}
      <div className="bg-gray-50 p-3 space-y-2">
        {skills.map(s => (
          <SkillBar
            key={s.label}
            label={s.label}
            nivelStr={s.nivelStr}
            desc={s.desc}
            expanded={openSet.has(s.label)}
            onToggle={() => onToggle(s.label)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Radar hexagonal (SVG) ───────────────────────────────────── */
function RadarChart({ eval: ev }: { eval: Evaluacion }) {
  const skills = [
    { label: 'Fuerza',    n: nivelNum(ev.fuerzaNivel)     },
    { label: 'Velocidad', n: nivelNum(ev.velocidadNivel)  },
    { label: 'Control',   n: nivelNum(ev.controlNivel)    },
    { label: 'Pase',      n: nivelNum(ev.paseNivel)       },
    { label: 'Remate',    n: nivelNum(ev.remataNivel)     },
    { label: 'Actitud',   n: nivelNum(ev.actitudNivel)    },
  ];

  const cx = 110, cy = 110, r = 80;
  const angles = skills.map((_, i) => (Math.PI * 2 * i) / skills.length - Math.PI / 2);

  const points = (pct: number) =>
    skills.map((s, i) => {
      const frac = (s.n / 5) * pct;
      const x = cx + r * frac * Math.cos(angles[i]);
      const y = cy + r * frac * Math.sin(angles[i]);
      return `${x},${y}`;
    }).join(' ');

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <p className="font-black text-[#111827] text-xs uppercase tracking-widest mb-3 text-center">Perfil Global</p>
      <svg viewBox="0 0 220 220" className="w-full max-w-[240px] mx-auto block">
        {/* Grid */}
        {gridLevels.map(pct => (
          <polygon
            key={pct}
            points={skills.map((_, i) => {
              const x = cx + r * pct * Math.cos(angles[i]);
              const y = cy + r * pct * Math.sin(angles[i]);
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}
        {/* Ejes */}
        {skills.map((_, i) => (
          <line key={i}
            x1={cx} y1={cy}
            x2={cx + r * Math.cos(angles[i])}
            y2={cy + r * Math.sin(angles[i])}
            stroke="#e5e7eb" strokeWidth="1"
          />
        ))}
        {/* Relleno */}
        <polygon
          points={points(1)}
          fill="#16a34a"
          fillOpacity="0.25"
          stroke="#16a34a"
          strokeWidth="2"
        />
        {/* Puntos */}
        {skills.map((s, i) => {
          const frac = s.n / 5;
          const x = cx + r * frac * Math.cos(angles[i]);
          const y = cy + r * frac * Math.sin(angles[i]);
          return <circle key={i} cx={x} cy={y} r="4" fill="#16a34a" />;
        })}
        {/* Labels */}
        {skills.map((s, i) => {
          const lx = cx + (r + 18) * Math.cos(angles[i]);
          const ly = cy + (r + 18) * Math.sin(angles[i]);
          return (
            <text key={i} x={lx} y={ly + 4}
              textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#374151">
              {s.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── VALORACIÓN DINÁMICA (versión colorida para el padre/familia) ─ */
function fraseNivel(p: number): string {
  if (p >= 90) return '¡Crack! 🌟';
  if (p >= 75) return '¡Muy bien! 🔥';
  if (p >= 60) return 'En buen camino 👏';
  if (p >= 40) return 'Progresando 💪';
  if (p > 0)   return 'Empezando 🌱';
  return 'Por evaluar';
}

function ValoracionDinamica({ ev }: { ev: Evaluacion | null }) {
  const [mostrar, setMostrar]   = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  useEffect(() => { const t = setTimeout(() => setMostrar(true), 150); return () => clearTimeout(t); }, [ev]);
  const esDemo = !ev;
  const toggle = (k: string) => setAbiertos(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  type Sk = { label: string; emoji: string; nivel: string; desc: string; demo: number };
  const CATS: { titulo: string; emoji: string; color: string; skills: Sk[] }[] = [
    { titulo: 'Físico', emoji: '💪', color: '#dc2626', skills: [
      { label: 'Fuerza',      emoji: '💪', nivel: ev?.fuerzaNivel ?? '',      desc: ev?.fuerzaDesc ?? '',      demo: 90 },
      { label: 'Velocidad',   emoji: '🏃', nivel: ev?.velocidadNivel ?? '',   desc: ev?.velocidadDesc ?? '',   demo: 85 },
      { label: 'Resistencia', emoji: '🔋', nivel: ev?.resistenciaNivel ?? '', desc: ev?.resistenciaDesc ?? '', demo: 80 },
    ] },
    { titulo: 'Técnico', emoji: '🎯', color: '#2563eb', skills: [
      { label: 'Control de Balón', emoji: '⚽', nivel: ev?.controlNivel ?? '',  desc: ev?.controlDesc ?? '',  demo: 75 },
      { label: 'Pase',             emoji: '👟', nivel: ev?.paseNivel ?? '',     desc: ev?.paseDesc ?? '',     demo: 82 },
      { label: 'Remate',           emoji: '🥅', nivel: ev?.remataNivel ?? '',   desc: ev?.remataDesc ?? '',   demo: 70 },
      { label: 'Conducción',       emoji: '🧭', nivel: ev?.conductaNivel ?? '', desc: ev?.conductaDesc ?? '', demo: 78 },
    ] },
    { titulo: 'Táctico', emoji: '🧠', color: '#7c3aed', skills: [
      { label: 'Posicionamiento', emoji: '📍', nivel: ev?.posicionNivel ?? '', desc: ev?.posicionDesc ?? '', demo: 72 },
      { label: 'Visión de Juego', emoji: '👁️', nivel: ev?.visionNivel ?? '',   desc: ev?.visionDesc ?? '',   demo: 88 },
      { label: 'Defensa',         emoji: '🛡️', nivel: ev?.defensaNivel ?? '',  desc: ev?.defensaDesc ?? '',  demo: 76 },
    ] },
    { titulo: 'Actitudinal', emoji: '❤️', color: '#0891b2', skills: [
      { label: 'Actitud',           emoji: '🔥', nivel: ev?.actitudNivel ?? '',    desc: ev?.actitudDesc ?? '',    demo: 95 },
      { label: 'Disciplina',        emoji: '🎖️', nivel: ev?.disciplinaNivel ?? '', desc: ev?.disciplinaDesc ?? '', demo: 90 },
      { label: 'Trabajo en Equipo', emoji: '🤝', nivel: ev?.trabajoNivel ?? '',    desc: ev?.trabajoDesc ?? '',    demo: 92 },
    ] },
  ];

  const pctSkill = (sk: Sk) => esDemo ? sk.demo : nivelPct(nivelNum(sk.nivel));
  const todas    = CATS.flatMap(c => c.skills.map(pctSkill));
  const conDato  = todas.filter(p => p > 0);
  const calPct   = nivelPct(nivelNum(ev?.calificacion ?? ''));
  const promedio = esDemo
    ? Math.round(todas.reduce((a, b) => a + b, 0) / todas.length)
    : calPct > 0
      ? calPct
      : conDato.length ? Math.round(conDato.reduce((a, b) => a + b, 0) / conDato.length) : 0;

  const CIRC = 2 * Math.PI * 52;

  return (
    <div className="rounded-3xl overflow-hidden shadow-lg border border-white/10"
      style={{ background: 'linear-gradient(160deg,#0b1220 0%,#111c33 55%,#0a2e1a 100%)' }}>

      {/* Encabezado */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-lg leading-none tracking-wide">Valoración Dinámica</p>
            <p className="text-white/50 text-[11px] mt-1">El progreso de tu deportista, en vivo</p>
          </div>
          {esDemo && (
            <span className="bg-amber-400 text-black text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wide flex-shrink-0">Ejemplo</span>
          )}
        </div>

        {/* Hero puntaje global */}
        <div className="mt-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-24 h-24 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12"/>
              <circle cx="60" cy="60" r="52" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - (mostrar ? promedio : 0) / 100)}
                style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-white font-black text-2xl leading-none">{mostrar ? promedio : 0}%</span>
              <span className="text-white/50 text-[8px] font-bold tracking-wider">GENERAL</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-3xl leading-none">🏅</p>
            <p className="text-white font-black text-lg leading-tight mt-1">{fraseNivel(promedio)}</p>
            <p className="text-white/50 text-[11px] mt-1 leading-snug">
              {esDemo
                ? 'Vista de ejemplo. Cuando el entrenador registre la valoración, aquí verás los datos reales.'
                : 'Según la valoración deportiva del entrenador. Toca cada habilidad para ver el detalle.'}
            </p>
          </div>
        </div>
      </div>

      {/* Categorías con todas las habilidades del formato */}
      <div className="bg-black/20 px-4 py-4 space-y-5">
        {CATS.map(cat => {
          const nums = cat.skills.map(pctSkill).filter(p => p > 0);
          const prom = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
          return (
            <div key={cat.titulo}>
              {/* Encabezado de categoría */}
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: `${cat.color}33`, border: `1.5px solid ${cat.color}` }}>{cat.emoji}</div>
                <span className="text-white font-black text-sm uppercase tracking-wide flex-1">{cat.titulo}</span>
                <span className="text-[11px] font-black text-white px-2 py-0.5 rounded-full"
                  style={{ background: `${cat.color}44` }}>{prom > 0 ? prom + '%' : '—'}</span>
              </div>

              {/* Habilidades */}
              <div className="space-y-2.5">
                {cat.skills.map((sk, i) => {
                  const pct  = pctSkill(sk);
                  const k    = cat.titulo + '-' + sk.label;
                  const open = abiertos.has(k);
                  return (
                    <div key={sk.label}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                          style={{ background: `${cat.color}22`, border: `1.5px solid ${cat.color}55` }}>{sk.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <button onClick={() => sk.desc && toggle(k)} className="text-white font-bold text-[13px] text-left flex items-center gap-1">
                              {sk.label}
                              {sk.desc ? <span className="text-white/30 text-[9px]">{open ? '▲' : '▼'}</span> : null}
                            </button>
                            <span className="font-black text-[13px] flex-shrink-0" style={{ color: cat.color }}>
                              {pct > 0 ? `${mostrar ? pct : 0}%` : 'Por evaluar'}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{
                                width: `${mostrar ? pct : 0}%`,
                                background: `linear-gradient(90deg, ${cat.color}, ${cat.color}bb)`,
                                transition: `width 0.9s ease-out ${i * 0.08}s`,
                              }}/>
                          </div>
                          <p className="text-white/40 text-[10px] font-semibold mt-0.5">{fraseNivel(pct)}</p>
                          {open && sk.desc && (
                            <p className="text-white/55 text-[11px] leading-snug mt-1.5 border-t border-white/10 pt-1.5">{sk.desc}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Página principal ────────────────────────────────────────── */
export default function SeguimientoPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [dep,     setDep]     = useState<Deportista | null>(null);
  const [evals,   setEvals]   = useState<Evaluacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [idxEval, setIdxEval] = useState(0);       // índice de evaluación seleccionada
  const [openSkills, setOpenSkills] = useState<Set<string>>(new Set());

  useEffect(() => {
    getDeportistas().then(lista => {
      let found = lista.find(d => d.id === id);

      // Para IDs temporales (dep-xxxxx): buscar por nombre para obtener el dep con código real
      if (!found) {
        try {
          const nombre = (localStorage.getItem('futuro-calidoso-nombre') ?? '').trim().toLowerCase();
          if (nombre) found = lista.find(d => (d._nombre ?? '').trim().toLowerCase() === nombre);
        } catch {}
        if (found) {
          try { localStorage.setItem('futuro-calidoso-id', found.id); } catch {}
        }
      }

      if (found) {
        setDep(found);
        const cod = getCodigo(found);
        if (cod) {
          getEvaluaciones(cod).then(data => { setEvals(data); setLoading(false); });
        } else {
          setLoading(false);
        }
      } else {
        try {
          const nombre = localStorage.getItem('futuro-calidoso-nombre') ?? '';
          setDep({ id, _nombre: nombre || id, _columnas: {} });
        } catch {
          setDep({ id, _nombre: id, _columnas: {} });
        }
        setLoading(false);
      }
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ev = evals[idxEval] ?? null;

  function toggleSkill(k: string) {
    setOpenSkills(prev => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k); else s.add(k);
      return s;
    });
  }

  /* ── Estadísticas de partido ── */
  const stats = ev ? [
    { label: 'Torneos',    val: ev.torneos,          icon: Trophy,        col: '#16a34a' },
    { label: 'Partidos',   val: ev.partJugados,      icon: Target,        col: '#2563eb' },
    { label: 'Titulares',  val: ev.partTitular,      icon: Star,          col: '#7c3aed' },
    { label: 'Goles',      val: ev.goles,            icon: TrendingUp,    col: '#059669' },
    { label: 'Minutos',    val: ev.minutosJugados,   icon: Clock,         col: '#0891b2' },
    { label: 'Amarillas',  val: ev.tarjAmarillas,    icon: AlertTriangle, col: '#d97706' },
  ].filter(s => s.val?.trim()) : [];

  /* ── Calificación general ── */
  const calNum = ev ? nivelNum(ev.calificacion) : 0;

  if (loading) return <LoadingBall />;

  const nombre  = dep?._nombre ?? '';
  const initials = nombre.split(' ').filter(Boolean).slice(0,2).map(w => w[0]).join('').toUpperCase();

  return (
    <div data-hoja="clara" className="min-h-screen bg-[#f1f5f9]">

      {/* HEADER */}
      <header className="relative bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none opacity-[0.08]" aria-hidden>
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-seg" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="15" fill="none" stroke="white" strokeWidth="1"/>
                <polygon points="30,22 37,27 34,36 26,36 23,27" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-seg)"/>
          </svg>
        </div>
        <button onClick={() => router.back()} className="relative text-white/70 hover:text-white transition">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-lg leading-tight truncate">{nombre}</h1>
          <p className="text-white/60 text-xs">Seguimiento · Valoración Deportiva</p>
        </div>
        <div className="relative text-right leading-tight flex-shrink-0">
          <p className="text-white font-black text-sm tracking-widest">MAX 10 SPORT</p>
          <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-3 py-4 space-y-4">

        {/* ── VALORACIÓN DINÁMICA (vista colorida para el padre) ── */}
        <ValoracionDinamica ev={ev} />

        {ev && (
          <>
            {/* ── Tarjeta atleta ── */}
            <div className="rounded-2xl bg-gradient-to-br from-[#064e1e] via-[#0a3b1a] to-black p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl ring-4 ring-white/20 bg-white/20 flex items-center justify-center flex-shrink-0">
                {ev.foto
                  ? <img src={ev.foto} alt="" className="w-full h-full object-cover rounded-xl"/>
                  : <span className="text-white font-black text-xl">{initials}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-black text-base leading-tight truncate">{ev.nombre || nombre}</p>
                {ev.perfil && <span className="inline-block bg-white/20 text-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5">{ev.perfil}</span>}
                {ev.posicion && <p className="text-white/70 text-xs mt-0.5">{ev.posicion}</p>}
                {ev.proyecto && <p className="text-white/50 text-[10px]">{ev.proyecto}</p>}
              </div>
              {calNum > 0 && (
                <div className="flex-shrink-0 text-center bg-white/15 rounded-xl px-3 py-2">
                  <p className="text-white font-black text-2xl leading-none">{calNum}</p>
                  <p className="text-white/70 text-[9px] font-bold">/ 5</p>
                  <p className="text-white/60 text-[8px] font-semibold mt-0.5">CAL. GLOBAL</p>
                </div>
              )}
            </div>

            {/* ── Selector de evaluación (si hay más de 1) ── */}
            {evals.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Historial de evaluaciones</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {evals.map((e, i) => (
                    <button
                      key={e.id}
                      onClick={() => { setIdxEval(i); setOpenSkills(new Set()); }}
                      className="flex-shrink-0 rounded-xl px-3 py-2 text-center transition"
                      style={{
                        background: i === idxEval ? '#064e1e' : '#f1f5f9',
                        color:      i === idxEval ? '#fff'    : '#374151',
                      }}>
                      <p className="text-[10px] font-black">{e.fecha}</p>
                      {e.calificacion && (
                        <p className="text-[9px] font-semibold" style={{ color: i === idxEval ? '#86efac' : '#6b7280' }}>
                          {nivelCorto(nivelNum(e.calificacion))}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Fecha evaluación ── */}
            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-4 py-2.5 shadow-sm">
              <Calendar className="w-4 h-4 text-[#16a34a]"/>
              <p className="text-sm font-bold text-[#111827]">Evaluación: <span className="text-[#16a34a]">{ev.fecha}</span></p>
            </div>

            {/* ── Estadísticas ── */}
            {stats.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <p className="font-black text-[#111827] text-xs uppercase tracking-widest mb-3">Estadísticas</p>
                <div className="grid grid-cols-3 gap-2">
                  {stats.map(s => (
                    <div key={s.label}
                      className="rounded-xl p-3 text-center"
                      style={{ background: `${s.col}15` }}>
                      <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.col }}/>
                      <p className="font-black text-[#111827] text-lg leading-none">{s.val}</p>
                      <p className="text-[10px] font-semibold text-gray-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Radar chart ── */}
            <RadarChart eval={ev}/>

            {/* ── Observaciones ── */}
            {ev.observaciones?.trim() && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-[#16a34a]"/>
                  <p className="font-black text-[#111827] text-xs uppercase tracking-widest">Observaciones del Entrenador</p>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{ev.observaciones}</p>
              </div>
            )}

            {/* ── Escala de referencia ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <p className="font-black text-[#111827] text-xs uppercase tracking-widest mb-3">Escala de Niveles</p>
              <div className="space-y-1.5">
                {[
                  { n:1, label:'Iniciación',    desc:'Aprendiendo los fundamentos básicos.' },
                  { n:2, label:'En Desarrollo', desc:'Mejora progresiva con práctica.' },
                  { n:3, label:'Competente',    desc:'Desempeño sólido en situaciones estándar.' },
                  { n:4, label:'Avanzado',      desc:'Alto rendimiento y versatilidad.' },
                  { n:5, label:'Dominante',     desc:'Élite — marca diferencia en el juego.' },
                ].map(({ n, label, desc }) => (
                  <div key={n} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs text-white flex-shrink-0"
                      style={{ background: nivelColor(n) }}>{n}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-[#111827] leading-none">{label}</p>
                      <p className="text-[10px] text-gray-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-4"/>
          </>
        )}
      </main>
    </div>
  );
}
