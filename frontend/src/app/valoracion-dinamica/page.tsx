'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { getDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/* ── Niveles ── */
function nivelNum(s: string): number {
  const m = (s ?? '').match(/nivel\s*(\d)/i);
  if (m) return parseInt(m[1]);
  const n = parseInt(s ?? '');
  return isNaN(n) ? 0 : Math.max(0, Math.min(5, n));
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

  useEffect(() => { getDeportistas().then(setDeps).catch(() => {}); }, []);

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

  const sinEval = !!sel && buscada && !row;

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-gradient-to-r from-[#064e1e] via-[#052a10] to-black px-4 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => router.push('/dashboard')} className="text-white/70 hover:text-white transition"><ArrowLeft className="w-5 h-5" /></button>
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
            {/* Tarjeta jugador */}
            <div className="rounded-3xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(160deg,#0b1220 0%,#111c33 55%,#0a2e1a 100%)' }}>
              <div className="px-5 py-5 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {row.foto ? <img src={row.foto} alt="" className="w-full h-full object-cover" /> : <span className="text-white font-black text-xl">{(sel?._nombre ?? '').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-lg leading-tight truncate">{row.nombre || sel?._nombre}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {row.proyecto && <span className="bg-white/15 text-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full">{row.proyecto}</span>}
                    {row.posicion && <span className="bg-white/15 text-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full">{row.posicion}</span>}
                    {row.fecha && <span className="text-white/40 text-[10px] font-semibold self-center">{row.fecha}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-center">
                  <div className="text-4xl leading-none">🏅</div>
                  <p className="text-white font-black text-2xl leading-none mt-1">{mostrar ? promedio : 0}%</p>
                  <p className="text-white/50 text-[9px] font-bold tracking-wider">GENERAL</p>
                </div>
              </div>
            </div>

            {/* Categorías: TODOS los fundamentos, uno por uno, con explicación */}
            {CATS.map(cat => {
              const nums = cat.funds.map(f => nivelPct(nivelNum(val(f.nivelCol)))).filter(p => p > 0);
              const prom = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
              return (
                <div key={cat.titulo} className="rounded-2xl overflow-hidden shadow-sm border border-white/10 bg-[#0f172a]">
                  <div className="flex items-center gap-2 px-4 py-3" style={{ background: cat.color }}>
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="text-white font-black text-sm uppercase tracking-wide flex-1">{cat.titulo}</span>
                    <span className="bg-white/25 text-white text-xs font-black px-2.5 py-0.5 rounded-full">{prom > 0 ? prom + '%' : '—'}</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {cat.funds.map((f, i) => {
                      const n = nivelNum(val(f.nivelCol));
                      const pct = nivelPct(n);
                      const desc = f.descCol ? val(f.descCol) : '';
                      const col = nivelColor(n);
                      return (
                        <div key={f.label} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-black text-white text-[13px]">{f.label}</span>
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${col}33`, color: col }}>
                              {n > 0 ? nivelLabel(n) : 'Por evaluar'}
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${mostrar ? pct : 0}%`,
                              background: 'linear-gradient(90deg,#ef4444 0%,#f97316 33%,#eab308 66%,#16a34a 100%)',
                              backgroundSize: `${pct > 0 ? Math.round(10000 / pct) : 100}% 100%`,
                              backgroundPosition: 'left center',
                              transition: `width 0.8s ease-out ${i * 0.05}s`,
                            }} />
                          </div>
                          {desc && <p className="text-[12px] text-gray-400 leading-snug mt-1.5">{desc}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Logros / Objetivos / Observaciones */}
            {val('logros_trimestre') && (
              <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
                <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#16a34a' }}>🏆 Logros del Trimestre</p>
                <p className="text-sm text-gray-300 leading-relaxed">{val('logros_trimestre')}</p>
              </div>
            )}
            {val('objetivos_trimestre') && (
              <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
                <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#60a5fa' }}>🎯 Objetivos Próximo Trimestre</p>
                <p className="text-sm text-gray-300 leading-relaxed">{val('objetivos_trimestre')}</p>
              </div>
            )}
            {val('observaciones') && (
              <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-4">
                <p className="text-[11px] font-black uppercase tracking-widest mb-1.5 text-gray-400">📋 Observaciones del Entrenador</p>
                <p className="text-sm text-gray-300 leading-relaxed">{val('observaciones')}</p>
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
