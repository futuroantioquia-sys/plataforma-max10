'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getEvaluaciones } from '@/lib/db';
import type { Evaluacion } from '@/lib/db';

/* ── Constantes ── */
const NIVELES   = ['', 'Nivel 1 (Iniciación)', 'Nivel 2 (En Desarrollo)', 'Nivel 3 (Competente)', 'Nivel 4 (Avanzado)', 'Nivel 5 (Dominante)'];
const LVL_COLOR = ['#555', '#ef4444', '#f97316', '#eab308', '#22c55e', '#00d4ff'];
const DOT_COLOR = ['', '#ef4444', '#f97316', '#d97706', '#eab308', '#22c55e'];
const LVL_NOMBRE = ['', 'INICIAL', 'BÁSICO', 'INTERMEDIO', 'AVANZADO', 'SUPERIOR'];
const LVL_SHORT  = ['', 'INICIAL', 'BÁSICO', 'INTER.', 'AVANZADO', 'SUPERIOR'];
const NIVEL_NUM  = (s: string) => { const i = NIVELES.indexOf(s); return i > 0 ? i : 0; };
const PROM_G     = (ns: number[]) => { const v = ns.filter(n => n > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };

/* ── Radar SVG ── */
function RadarGrafico({ scores, labels }: { scores: number[]; labels: string[] }) {
  const cx = 150, cy = 155, maxR = 100, n = scores.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const gridPoly = (pct: number) =>
    Array.from({ length: n }, (_, i) => { const { x, y } = pt(i, pct * maxR); return `${x},${y}`; }).join(' ');
  const playerPoly = scores.map((s, i) => { const { x, y } = pt(i, (s / 5) * maxR); return `${x},${y}`; }).join(' ');
  return (
    <svg width="300" height="310" viewBox="0 0 300 310" style={{ overflow: 'visible' }}>
      {[0.2, 0.4, 0.6, 0.8, 1.0].map(pct => (
        <polygon key={pct} points={gridPoly(pct)} fill="none" stroke="#1e3a4a" strokeWidth={pct === 1.0 ? 1.5 : 1} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const { x, y } = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1e3a4a" strokeWidth="1" />;
      })}
      <polygon points={playerPoly} fill="rgba(0,212,136,0.2)" stroke="#00d488" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 0 6px rgba(0,212,136,0.4))' }} />
      {scores.map((s, i) => {
        if (!s) return null;
        const { x, y } = pt(i, (s / 5) * maxR);
        return <circle key={i} cx={x} cy={y} r="5" fill="#00d488" style={{ filter: 'drop-shadow(0 0 4px #00d488)' }} />;
      })}
      {labels.map((lbl, i) => {
        const { x, y } = pt(i, maxR + 24);
        return (
          <g key={i}>
            <text x={x} y={y - 7} textAnchor="middle" fill="#9ca3af" fontSize="8.5" fontWeight="800" fontFamily="Arial" letterSpacing="0.5">{lbl}</text>
            <text x={x} y={y + 6} textAnchor="middle" fill={scores[i] > 0 ? '#00d488' : '#555'} fontSize="10" fontWeight="900" fontFamily="Arial">
              {scores[i] > 0 ? scores[i].toFixed(1) : '—'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Barra de habilidad ── */
function BarraHabilidad({ label, nivel }: { label: string; nivel: string }) {
  const nv = NIVEL_NUM(nivel);
  const pct = nv > 0 ? (nv / 5) * 100 : 0;
  const color = LVL_COLOR[nv] || '#555';
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 900, background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 3, padding: '1px 6px' }}>
          {nv > 0 ? LVL_SHORT[nv] : '—'}
        </span>
      </div>
      <div style={{ background: '#0f2235', borderRadius: 4, height: 7, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}66, ${color})`, borderRadius: 4, boxShadow: nv >= 4 ? `0 0 6px ${color}88` : 'none' }} />
      </div>
    </div>
  );
}

/* ── Sección colapsable ── */
function SeccionJuego({ icono, titulo, score, children, defaultOpen = false }: {
  icono: string; titulo: string; score: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [abierto, setAbierto] = useState(defaultOpen);
  const color = score === 0 ? '#555' : score >= 4.5 ? '#00d4ff' : score >= 3.5 ? '#22c55e' : score >= 2.5 ? '#eab308' : '#f97316';
  return (
    <div style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid #1e3a4a', background: '#0d1f2e' }}>
      <button onClick={() => setAbierto(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>{icono}</span>
        <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{titulo}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 60, height: 5, background: '#0f2235', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(score / 5) * 100}%`, height: '100%', background: color, boxShadow: `0 0 5px ${color}` }} />
          </div>
          <span style={{ color, fontWeight: 900, fontSize: 13, minWidth: 28 }}>{score > 0 ? score.toFixed(1) : '—'}</span>
          <span style={{ color: '#475569', fontSize: 12 }}>{abierto ? '▲' : '▼'}</span>
        </div>
      </button>
      {abierto && (
        <div style={{ padding: '4px 16px 16px', borderTop: '1px solid #1e3a4a' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Vista principal de una evaluación ── */
function VistaEvaluacion({ ev }: { ev: Evaluacion }) {
  const fisico   = PROM_G([NIVEL_NUM(ev.fuerzaNivel), NIVEL_NUM(ev.velocidadNivel), NIVEL_NUM(ev.resistenciaNivel)]);
  const tecnico  = PROM_G([NIVEL_NUM(ev.controlNivel), NIVEL_NUM(ev.paseNivel), NIVEL_NUM(ev.remataNivel), NIVEL_NUM(ev.conductaNivel)]);
  const tactico  = PROM_G([NIVEL_NUM(ev.posicionNivel), NIVEL_NUM(ev.visionNivel), NIVEL_NUM(ev.defensaNivel)]);
  const mental   = PROM_G([NIVEL_NUM(ev.actitudNivel), NIVEL_NUM(ev.disciplinaNivel), NIVEL_NUM(ev.trabajoNivel)]);
  const overall  = PROM_G([fisico, tecnico, tactico, mental]);
  const overallNum = Math.round(overall * 20);
  const rankColor  = overallNum >= 85 ? '#a78bfa' : overallNum >= 75 ? '#00d4ff' : overallNum >= 65 ? '#22c55e' : overallNum >= 50 ? '#eab308' : '#f97316';
  const rankLabel  = overallNum >= 85 ? 'DIAMANTE' : overallNum >= 75 ? 'PLATINO' : overallNum >= 65 ? 'ORO' : overallNum >= 50 ? 'PLATA' : 'BRONCE';
  const iniciales  = (ev.nombre || 'FA').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const lvl        = Math.round(overall);
  const dc         = DOT_COLOR[lvl] || '#475569';
  const dn         = LVL_NOMBRE[lvl] || '—';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 50px' }}>

      {/* ── HERO CARD ── */}
      <div style={{ borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, #0d2b1a 0%, #051a2e 55%, #0d1f2e 100%)', border: '1px solid #1e3a4a', marginBottom: 14 }}>
        <div style={{ padding: '20px 20px 18px', display: 'flex', gap: 16 }}>

          {/* Foto */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ width: 90, height: 114, borderRadius: 12, overflow: 'hidden', border: '2px solid #00d48840', background: 'linear-gradient(135deg, #0d4a2b, #051a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,212,136,0.2)' }}>
              {ev.foto
                ? <img src={ev.foto} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                : <span style={{ color: '#00d488', fontSize: 30, fontWeight: 900 }}>{iniciales}</span>}
            </div>
            <div style={{ marginTop: 5, textAlign: 'center', background: '#00d48820', border: '1px solid #00d48840', borderRadius: 5, padding: '2px 4px' }}>
              <span style={{ color: '#00d488', fontSize: 8, fontWeight: 900, letterSpacing: 0.5 }}>{ev.posicion || '—'}</span>
            </div>
          </div>

          {/* Info principal */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, color: '#475569', fontWeight: 700, letterSpacing: 2, marginBottom: 3 }}>
              {ev.fecha} · INFORME
            </div>
            <div style={{ fontSize: 17, color: '#f1f5f9', fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.2, marginBottom: 6, textTransform: 'uppercase' }}>
              {ev.nombre || 'DEPORTISTA'}
            </div>

            {/* Indicador nivel global */}
            {lvl > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: dc, boxShadow: `0 0 10px ${dc}cc`, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ color: dc, fontSize: 12, fontWeight: 900, letterSpacing: 1.5 }}>{dn}</span>
                <span style={{ color: '#334155', fontSize: 9, fontWeight: 700 }}>· Nivel {lvl} de 5</span>
              </div>
            ) : (
              <div style={{ marginBottom: 8, height: 14 }} />
            )}

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 10 }}>
              {ev.proyecto && <span style={{ background: '#16a34a22', border: '1px solid #16a34a44', color: '#4ade80', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}>{ev.proyecto}</span>}
              {ev.perfil   && <span style={{ background: '#8b5cf622', border: '1px solid #8b5cf644', color: '#c4b5fd', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}>{ev.perfil}</span>}
            </div>

            {/* Overall */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 54, height: 54, borderRadius: 10, background: `linear-gradient(135deg, ${rankColor}22, ${rankColor}44)`, border: `2px solid ${rankColor}66`, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 16px ${rankColor}44` }}>
                <span style={{ color: rankColor, fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{overallNum > 0 ? overallNum : '—'}</span>
                <span style={{ color: rankColor, fontSize: 7, fontWeight: 800 }}>OVR</span>
              </div>
              <div>
                <div style={{ color: rankColor, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{rankLabel}</div>
                <div style={{ color: '#475569', fontSize: 9, marginBottom: 3 }}>Valoración global</div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1,2,3,4,5].map(star => <span key={star} style={{ fontSize: 11, color: star <= Math.round(overall) ? '#fbbf24' : '#1e3a4a' }}>★</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* Escudo */}
          <div style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
            <img src="/ESCUDO F.A 2020.png" alt="FA" style={{ width: 46, height: 46, objectFit: 'contain', opacity: 0.85 }} />
          </div>
        </div>
      </div>

      {/* ── RADAR ── */}
      <div style={{ background: '#0d1f2e', borderRadius: 16, border: '1px solid #1e3a4a', padding: '14px', marginBottom: 14, textAlign: 'center' }}>
        <div style={{ color: '#475569', fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 4 }}>
          Radar de Habilidades
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RadarGrafico
            scores={[fisico, tecnico, tactico, mental]}
            labels={['FÍSICO', 'TÉCNICA', 'TÁCTICA', 'MENTAL']}
          />
        </div>
      </div>

      {/* ── ESCALA DE NIVELES ── */}
      <div style={{ background: '#0d1f2e', borderRadius: 14, border: '1px solid #1e3a4a', padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ color: '#475569', fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>Escala de Niveles</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
          {[
            { n: 1, color: '#ef4444', label: 'INICIAL',    desc: 'Comienza el proceso' },
            { n: 2, color: '#f97316', label: 'BÁSICO',     desc: 'En construcción' },
            { n: 3, color: '#d97706', label: 'INTERMEDIO', desc: 'Buen camino' },
            { n: 4, color: '#eab308', label: 'AVANZADO',   desc: 'Sobre la media' },
            { n: 5, color: '#22c55e', label: 'SUPERIOR',   desc: 'Nivel élite' },
          ].map(({ n, color, label, desc }) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#060d18', borderRadius: 8, padding: '6px 10px', border: `1px solid ${color}22` }}>
              <span style={{ color: '#475569', fontSize: 9, fontWeight: 900, width: 8 }}>{n}</span>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 7px ${color}`, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ color, fontSize: 10, fontWeight: 900, letterSpacing: 1, flex: 1 }}>{label}</span>
              <span style={{ color: '#334155', fontSize: 8, fontStyle: 'italic' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── DETALLE POR CATEGORÍAS ── */}
      <div style={{ color: '#475569', fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 8 }}>
        Detalle por Categorías
      </div>

      <SeccionJuego icono="💪" titulo="Físico" score={fisico} defaultOpen={true}>
        <div style={{ paddingTop: 10 }}>
          <BarraHabilidad label="Fuerza — Potencia y Duelo" nivel={ev.fuerzaNivel} />
          <BarraHabilidad label="Velocidad — Reacción y Desplazamiento" nivel={ev.velocidadNivel} />
          <BarraHabilidad label="Resistencia — Capacidad Aeróbica" nivel={ev.resistenciaNivel} />
        </div>
      </SeccionJuego>

      <SeccionJuego icono="⚽" titulo="Técnica" score={tecnico}>
        <div style={{ paddingTop: 10 }}>
          <BarraHabilidad label="Control del Balón" nivel={ev.controlNivel} />
          <BarraHabilidad label="Pase" nivel={ev.paseNivel} />
          <BarraHabilidad label="Remate" nivel={ev.remataNivel} />
          <BarraHabilidad label="Conducción" nivel={ev.conductaNivel} />
        </div>
      </SeccionJuego>

      <SeccionJuego icono="🧠" titulo="Táctica" score={tactico}>
        <div style={{ paddingTop: 10 }}>
          <BarraHabilidad label="Ubicación Espacial" nivel={ev.posicionNivel} />
          <BarraHabilidad label="Velocidad de Procesamiento" nivel={ev.visionNivel} />
          <BarraHabilidad label="Lectura de Alturas y Espacios" nivel={ev.defensaNivel} />
        </div>
      </SeccionJuego>

      <SeccionJuego icono="❤️" titulo="Mental y Actitudinal" score={mental}>
        <div style={{ paddingTop: 10 }}>
          <BarraHabilidad label="Comunicación Asertiva" nivel={ev.actitudNivel} />
          <BarraHabilidad label="Gestión de la Frustración" nivel={ev.disciplinaNivel} />
          <BarraHabilidad label="Trabajo en Equipo" nivel={ev.trabajoNivel} />
        </div>
      </SeccionJuego>

      {/* ── OBSERVACIONES ── */}
      {ev.observaciones && (
        <div style={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, padding: '14px 16px', marginBottom: 10, marginTop: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>📝 OBSERVACIONES DEL ENTRENADOR</div>
          <p style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.7, margin: 0 }}>{ev.observaciones}</p>
        </div>
      )}

      {/* ── PIE ── */}
      <div style={{ background: '#0d1f2e', borderRadius: 12, border: '1px solid #1e3a4a', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <img src="/ESCUDO F.A 2020.png" alt="FA" style={{ width: 34, height: 34, objectFit: 'contain', opacity: 0.8 }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: '#4ade80', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>FUTURO ANTIOQUIA · MAX 10 SPORT</div>
          <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>
            Directivo: STEVEN MARULANDA GRISALES
          </div>
        </div>
        <div style={{ color: '#475569', fontSize: 9, textAlign: 'right' as const }}>{ev.fecha}</div>
      </div>
    </div>
  );
}

/* ── Página principal ── */
export default function ValoracionPadresPage() {
  const router = useRouter();
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [idx, setIdx] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    const cod = (typeof window !== 'undefined' ? localStorage.getItem('futuro-calidoso-codigo') : null) ?? '';
    setCodigo(cod);
    if (!cod) {
      setCargando(false);
      setError('No se encontró el código del deportista. Por favor vuelve a iniciar sesión.');
      return;
    }
    getEvaluaciones(cod)
      .then(lista => {
        setEvaluaciones(lista);
        if (lista.length === 0) {
          setError('Aún no hay valoraciones registradas para este deportista.');
        }
      })
      .catch(() => setError('No se pudo cargar la valoración. Intenta de nuevo más tarde.'))
      .finally(() => setCargando(false));
  }, []);

  const ev = evaluaciones[idx];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#060d18', overflowY: 'auto', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Barra superior ── */}
      <div className="print:hidden" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,13,24,0.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #1e3a4a', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #1e3a4a', background: '#0d1f2e', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
        >
          ← Volver
        </button>
        <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 800, fontSize: 14 }}>
          Valoración Dinámica para Padres
          {ev ? ` · ${ev.nombre || ''}` : ''}
        </span>
        {ev && (
          <button
            onClick={() => window.print()}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}
          >
            🖨️ PDF
          </button>
        )}
      </div>

      {/* ── Selector de informes (si hay más de uno) ── */}
      {evaluaciones.length > 1 && (
        <div className="print:hidden" style={{ background: '#0d1f2e', borderBottom: '1px solid #1e3a4a', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
          <span style={{ color: '#475569', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>INFORMES:</span>
          {evaluaciones.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setIdx(i)}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                background: i === idx ? '#00d48820' : 'transparent',
                border: `1px solid ${i === idx ? '#00d48880' : '#1e3a4a'}`,
                color: i === idx ? '#00d488' : '#475569',
              }}
            >
              {e.fecha || `#${evaluaciones.length - i}`}
            </button>
          ))}
        </div>
      )}

      {/* ── Contenido ── */}
      {cargando ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid #1e3a4a', borderTop: '3px solid #00d488', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>Cargando valoración…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, padding: 24 }}>
          <span style={{ fontSize: 40 }}>📋</span>
          <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 700, textAlign: 'center', maxWidth: 320 }}>{error}</span>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ marginTop: 8, padding: '10px 20px', borderRadius: 10, background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer' }}
          >
            Volver al inicio
          </button>
        </div>
      ) : ev ? (
        <VistaEvaluacion ev={ev} />
      ) : null}

      <style>{`
        @media print {
          body { background: #060d18 !important; }
          .print\\:hidden { display: none !important; }
          @page { margin: 6mm; size: A4; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
