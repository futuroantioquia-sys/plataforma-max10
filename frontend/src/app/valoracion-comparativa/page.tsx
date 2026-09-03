'use client';

/**
 * COMPARATIVA DE INFORMES — categoría SEGUIMIENTO
 * (dirección, 03/09/2026 — «si se le da click en vista dinámica, que aparezca
 *  una opción para ver una comparativa de los informes que tenga realizados.
 *  Que muestre de manera dinámica si en algún aspecto subió o bajó o quedó
 *  igual»)
 *
 * Se escogen DOS informes del mismo deportista y la pantalla dice, aspecto por
 * aspecto, si subió, si bajó o si quedó igual. Los aspectos son los mismos 34
 * de la Valoración Deportiva, en sus seis categorías.
 *
 * QUIÉN LA VE. El formador y administración. El calidoso NO: a él ni le
 * aparece el botón en la ficha, y si llegara aquí escribiendo la dirección a
 * mano, se le devuelve. Es la misma puerta que ya tiene la vista dinámica.
 *
 * NO ESCRIBE NADA. Solo lee la tabla `evaluaciones`. Es una pantalla de
 * lectura: no toca ni un informe.
 */

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

/* ── La paleta de la plataforma ── */
const LIENZO = '#333F50', PANEL = '#3C4759', CAMPO = '#2B3547', HONDO = '#2A3342';
const BORDE = '#4A5568', VERDE = '#00B050', VERDECL = '#5BE39B';
const AMBAR = '#E0A33A', GRIS = '#7C879A';

/* ── Los niveles, leídos igual que en la vista dinámica ──────────────────
   El informe guarda "Nivel 3 (Competente)" en unos campos y la palabra
   "CASI SIEMPRE" en los de Comportamiento. Las dos cosas son lo mismo: una
   escala de 1 a 5. */
const FREQ: Record<string, number> = {
  'SIEMPRE': 5, 'CASI SIEMPRE': 4, 'ALGUNAS VECES': 3, 'CASI NUNCA': 2, 'NUNCA': 1,
};
function nivelNum(s: string): number {
  const t = String(s ?? '').trim();
  const m = t.match(/nivel\s*(\d)/i);
  if (m) return parseInt(m[1], 10);
  const f = FREQ[t.toUpperCase()];
  if (f) return f;
  const n = parseInt(t, 10);
  return isNaN(n) ? 0 : Math.max(0, Math.min(5, n));
}
const NOMBRE_NIVEL = ['Por evaluar', 'Iniciación', 'En Desarrollo', 'Competente', 'Avanzado', 'Dominante'];
const COLOR_NIVEL  = ['#4A5568', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

/* ── Los 34 aspectos, en las seis categorías del formato ── */
type Fund = { label: string; col: string };
type Cat  = { titulo: string; emoji: string; color: string; funds: Fund[] };

const CATS_CAMPO: Cat[] = [
  { titulo: 'Físico', emoji: '💪', color: '#dc2626', funds: [
    { label: 'Fuerza — Potencia y Duelo',             col: 'fuerza_nivel' },
    { label: 'Velocidad — Reacción y Desplazamiento',  col: 'velocidad_nivel' },
    { label: 'Resistencia — Capacidad Aeróbica',       col: 'resistencia_nivel' },
  ] },
  { titulo: 'Técnica', emoji: '⚽', color: '#2563eb', funds: [
    { label: 'Control',              col: 'control_nivel' },
    { label: 'Pase',                 col: 'pase_nivel' },
    { label: 'Conducción',           col: 'conducta_nivel' },
    { label: 'Dribling',             col: 'dribling_nivel' },
    { label: 'Remate',               col: 'remata_nivel' },
    { label: 'Cabeceo',              col: 'cabeceo_nivel' },
    { label: 'Quite del Balón',      col: 'quite_nivel' },
    { label: 'Protección del Balón', col: 'proteccion_nivel' },
  ] },
  { titulo: 'Táctica', emoji: '🧠', color: '#7c3aed', funds: [
    { label: 'Ubicación Espacial',            col: 'posicion_nivel' },
    { label: 'Velocidad de Procesamiento',    col: 'vision_nivel' },
    { label: 'Lectura de Alturas y Espacios', col: 'defensa_nivel' },
    { label: 'Amplitud y Profundidad',        col: 'amplitud_nivel' },
    { label: 'Transiciones (Ataque-Defensa)', col: 'transicion_nivel' },
    { label: 'Superioridad Numérica 2vs1',    col: 'superioridad_nivel' },
    { label: 'Basculación y Coberturas',      col: 'basculacion_nivel' },
  ] },
  { titulo: 'Mental y Actitudinal', emoji: '❤️', color: '#0891b2', funds: [
    { label: 'Trabajo en Equipo',         col: 'trabajo_nivel' },
    { label: 'Gestión de la Frustración', col: 'disciplina_nivel' },
    { label: 'Comunicación Asertiva',     col: 'actitud_nivel' },
  ] },
  { titulo: 'Trabajo en Equipo', emoji: '🤝', color: '#0891b2', funds: [
    { label: 'Identidad y Estilo de Juego',  col: 'identidad_nivel' },
    { label: 'Bloque y Cohesión Táctica',    col: 'bloque_nivel' },
    { label: 'Clima Interno y Comunicación', col: 'clima_nivel' },
    { label: 'Gestión de la Competición',    col: 'gestion_comp_nivel' },
  ] },
  { titulo: 'Comportamiento', emoji: '⭐', color: '#16a34a', funds: [
    { label: 'Responsabilidad',        col: 'responsabilidad' },
    { label: 'Puntualidad',            col: 'puntualidad' },
    { label: 'Disciplina',             col: 'disciplina_comp' },
    { label: 'Respeto',                col: 'respeto' },
    { label: 'Tolerancia',             col: 'tolerancia' },
    { label: 'Compañerismo',           col: 'companerismo' },
    { label: 'Liderazgo',              col: 'liderazgo' },
    { label: 'Trabajo en Equipo',      col: 'trabajo_equipo_comp' },
    { label: 'Sentido de Pertenencia', col: 'sentido_pertenencia' },
  ] },
];

/* ── EL MISMO CUADRO, PERO PARA PORTEROS ────────────────────────────────
   (dirección, 03/09/2026). Al portero no se le mide el dribling ni el
   cabeceo: se le mide el blocaje, la estirada, el achique y el juego aéreo.
   Cambian los nombres; las casillas de la base son las mismas. */
const CATS_PORTERO: Cat[] = [
  { titulo: 'Físico', emoji: '💪', color: '#dc2626', funds: [
    { label: 'Fuerza Explosiva — Potencia de Salto', col: 'fuerza_nivel' },
    { label: 'Velocidad de Reacción — Reflejos',     col: 'velocidad_nivel' },
    { label: 'Agilidad y Coordinación',              col: 'resistencia_nivel' },
  ] },
  { titulo: 'Técnica', emoji: '🧤', color: '#2563eb', funds: [
    { label: 'Blocaje — Seguridad y Agarre', col: 'control_nivel' },
    { label: 'Desvío — Rechazo y Dirección', col: 'pase_nivel' },
    { label: 'Estirada — Impulso y Alcance', col: 'conducta_nivel' },
    { label: 'Juego de Pies — Distribución', col: 'dribling_nivel' },
    { label: 'Caída y Reincorporación',      col: 'remata_nivel' },
  ] },
  { titulo: 'Táctica', emoji: '🧠', color: '#7c3aed', funds: [
    { label: 'Ubicación Posicional — Macro-colocación', col: 'posicion_nivel' },
    { label: 'Ángulo y Bisectriz — Micro-colocación',   col: 'vision_nivel' },
    { label: 'Transición Ofensiva',                     col: 'defensa_nivel' },
    { label: 'Control del Espacio Defensivo — Líbero',  col: 'amplitud_nivel' },
    { label: 'Gestión del Balón Parado',                col: 'transicion_nivel' },
    { label: 'Juego Aéreo — Salidas',                   col: 'superioridad_nivel' },
    { label: 'Fase de Achique — 1vs1',                  col: 'basculacion_nivel' },
  ] },
  { titulo: 'Mental y Actitudinal', emoji: '❤️', color: '#0891b2', funds: [
    { label: 'Trabajo en Equipo',               col: 'trabajo_nivel' },
    { label: 'Resiliencia — Gestión del Error', col: 'disciplina_nivel' },
    { label: 'Liderazgo y Comunicación',        col: 'actitud_nivel' },
  ] },
  /* Estos dos bloques son iguales para los dos formatos. */
  { titulo: 'Trabajo en Equipo', emoji: '🤝', color: '#0891b2', funds: [
    { label: 'Identidad y Estilo de Juego',  col: 'identidad_nivel' },
    { label: 'Bloque y Cohesión Táctica',    col: 'bloque_nivel' },
    { label: 'Clima Interno y Comunicación', col: 'clima_nivel' },
    { label: 'Gestión de la Competición',    col: 'gestion_comp_nivel' },
  ] },
  { titulo: 'Comportamiento', emoji: '⭐', color: '#16a34a', funds: [
    { label: 'Responsabilidad',        col: 'responsabilidad' },
    { label: 'Puntualidad',            col: 'puntualidad' },
    { label: 'Disciplina',             col: 'disciplina_comp' },
    { label: 'Respeto',                col: 'respeto' },
    { label: 'Tolerancia',             col: 'tolerancia' },
    { label: 'Compañerismo',           col: 'companerismo' },
    { label: 'Liderazgo',              col: 'liderazgo' },
    { label: 'Trabajo en Equipo',      col: 'trabajo_equipo_comp' },
    { label: 'Sentido de Pertenencia', col: 'sentido_pertenencia' },
  ] },
];

/** Para ordenar los informes: primero por número, y si no hay, por fecha. */
function pesoInforme(r: any): number {
  const n = parseInt(String(r?.numero_informe ?? '').replace(/\D/g, ''), 10);
  if (!isNaN(n)) return n;
  const f = String(r?.fecha ?? '');
  const m = f.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  return 0;
}
function rotulo(r: any): string {
  const n = String(r?.numero_informe ?? '').trim();
  const f = String(r?.fecha ?? '').trim();
  return `${n ? `Informe ${n}` : 'Informe'}${f ? ` · ${f}` : ''}`;
}

function ComparativaInner() {
  const router = useRouter();
  const params = useSearchParams();
  const cod = String(params.get('cod') ?? '').trim();

  const [filas,    setFilas]    = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [iA, setIA] = useState(0);
  const [iB, setIB] = useState(1);
  const [ver, setVer] = useState({ sube: true, igual: true, baja: true });

  /* Los calidosos (padres) todavía no entran a valoraciones. La misma puerta
     que tiene la vista dinámica. */
  useEffect(() => {
    if (typeof document !== 'undefined' && /futuro-session=deportista/.test(document.cookie)) {
      router.replace('/alumnos');
    }
  }, [router]);

  useEffect(() => {
    if (!cod) { setCargando(false); return; }
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(
          `${SB_URL}/rest/v1/evaluaciones?codigo=eq.${encodeURIComponent(cod)}&order=created_at.asc`,
          { headers: SB_HDR },
        );
        const d = await res.json();
        const arr = (Array.isArray(d) ? d : []).slice().sort((a, b) => pesoInforme(a) - pesoInforme(b));
        if (!vivo) return;
        setFilas(arr);
        /* Se abre comparando los DOS ÚLTIMOS, que es lo que uno quiere ver:
           cómo viene del informe pasado al de ahora. */
        setIA(Math.max(0, arr.length - 2));
        setIB(Math.max(0, arr.length - 1));
      } catch {
        if (vivo) setFilas([]);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [cod]);

  const A = filas[iA] ?? null;
  const B = filas[iB] ?? null;

  /** Todo el cálculo de una sola vez: por categoría y el resumen de arriba. */
  const cuentas = useMemo(() => {
    /* ¿Es portero? Se mira la POSICIÓN que traen los informes; basta con que
       uno de los dos la tenga. — dirección, 03/09/2026 */
    const esPortero = /portero|arquer|golero|guardameta/i.test(
      `${String(B?.posicion ?? '')} ${String(A?.posicion ?? '')}`);
    const CATS = esPortero ? CATS_PORTERO : CATS_CAMPO;

    let sube = 0, igual = 0, baja = 0;
    const porCat = CATS.map(c => {
      const items = c.funds.map(f => {
        const a = nivelNum(String(A?.[f.col] ?? ''));
        const b = nivelNum(String(B?.[f.col] ?? ''));
        const tipo: 'sube' | 'igual' | 'baja' | 'nuevo' | 'nada' =
          (!a && !b) ? 'nada' : (!a && b) ? 'nuevo'
          : b > a ? 'sube' : b < a ? 'baja' : 'igual';
        if (tipo === 'sube') sube++;
        else if (tipo === 'baja') baja++;
        else if (tipo === 'igual') igual++;
        return { label: f.label, a, b, tipo };
      });
      const conDato = items.filter(x => x.a > 0 && x.b > 0);
      const pa = conDato.length ? conDato.reduce((s, x) => s + x.a, 0) / conDato.length : 0;
      const pb = conDato.length ? conDato.reduce((s, x) => s + x.b, 0) / conDato.length : 0;
      return { cat: c, items, pa, pb };
    });

    /* ── LA CALIFICACIÓN ───────────────────────────────────────────────
       (dirección, 03/09/2026 — «que muestre la calificación»)

       Es el promedio de TODOS los aspectos evaluados, en la misma escala de
       1 a 5 del informe. Se calcula, no se lee de la casilla `calificacion`
       de la base: esa viene vacía en unos informes y con otra escala en
       otros —hay uno que dice "8"—, así que no se puede confiar en ella.
       El promedio, en cambio, siempre cuadra con lo que se ve abajo. */
    const todos = porCat.flatMap(x => x.items);
    const parA = todos.filter(x => x.a > 0);
    const parB = todos.filter(x => x.b > 0);
    const calA = parA.length ? parA.reduce((s, x) => s + x.a, 0) / parA.length : 0;
    const calB = parB.length ? parB.reduce((s, x) => s + x.b, 0) / parB.length : 0;

    return { sube, igual, baja, porCat, calA, calB };
  }, [A, B]);

  const inp = {
    height: 38, background: CAMPO, border: `1px solid ${BORDE}`, borderRadius: 10,
    color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '0 9px',
    outline: 'none', cursor: 'pointer', minWidth: 168, maxWidth: '100%',
  } as const;

  const etq = 'block text-[9px] font-black uppercase tracking-widest mb-1';

  /* ── LA BARRA DE NIVEL ────────────────────────────────────────────────
     (dirección, 03/09/2026 — «esos botones de colores no dicen mucho… los
      cuadros por las barras sí me gusta más»)

     Antes eran cinco casillas de colores y había que descifrarlas. Ahora es
     una barra que se llena según el nivel: A MÁS LARGA, MEJOR, que se
     entiende sin que nadie lo explique. Debajo va escrito el nivel con todas
     sus letras — "Avanzado · 4 de 5" —, así que ni siquiera hay que
     interpretar el color.

     Cuando el aspecto SUBIÓ o BAJÓ, una rayita blanca marca dónde estaba
     antes: el pedazo que se ganó (o el que se perdió) se ve solo. Si quedó
     igual no lleva rayita y el renglón va apagado, para que la vista se vaya
     derecho a lo que sí se movió. */
  function Barra({ antes, ahora }: { antes: number; ahora: number }) {
    const movido = antes > 0 && ahora > 0 && antes !== ahora;
    return (
      <div>
        <div className="relative rounded-lg"
             style={{ height: 15, background: '#242D3B', border: '1px solid #3a475a' }}>
          <div className="absolute left-0 top-0 bottom-0 rounded-lg"
               style={{
                 width: `${ahora * 20}%`,
                 background: `linear-gradient(to right, ${COLOR_NIVEL[Math.max(1, ahora - 1)]}, ${COLOR_NIVEL[ahora]})`,
               }} />
          {movido && (
            <span className="absolute rounded-sm"
                  title={`Antes: ${NOMBRE_NIVEL[antes]}`}
                  style={{ left: `${antes * 20}%`, top: -5, bottom: -5, width: 2,
                           background: 'rgba(255,255,255,.92)' }} />
          )}
        </div>
        <p className="text-[10.5px] font-black mt-1 whitespace-nowrap" style={{ color: '#AFBAC8' }}>
          {ahora ? `${NOMBRE_NIVEL[ahora]} · ${ahora} de 5` : 'Por evaluar'}
        </p>
      </div>
    );
  }

  function Sello({ tipo, dif }: { tipo: string; dif: number }) {
    const base = 'text-[10px] font-black uppercase tracking-wide px-2 py-1.5 rounded-lg text-center whitespace-nowrap border';
    if (tipo === 'nuevo') return <span className={base} style={{ background: 'rgba(224,163,58,.16)', color: AMBAR, borderColor: 'rgba(224,163,58,.5)' }}>Nuevo</span>;
    if (tipo === 'sube')  return <span className={base} style={{ background: 'rgba(34,197,94,.18)',  color: '#7CE49F', borderColor: 'rgba(34,197,94,.55)' }}>▲ Subió {dif}</span>;
    if (tipo === 'baja')  return <span className={base} style={{ background: 'rgba(192,80,77,.18)',  color: '#F0A6A4', borderColor: 'rgba(192,80,77,.6)' }}>▼ Bajó {Math.abs(dif)}</span>;
    return <span className={base} style={{ background: 'rgba(124,135,154,.14)', color: '#A9B3C2', borderColor: 'rgba(124,135,154,.4)' }}>= Igual</span>;
  }

  function Cuadro({ clave, numero, texto, color }: { clave: 'sube' | 'igual' | 'baja'; numero: number; texto: string; color: string }) {
    const on = ver[clave];
    const fondo = clave === 'sube' ? 'rgba(34,197,94,.14)' : clave === 'baja' ? 'rgba(192,80,77,.16)' : 'rgba(124,135,154,.16)';
    const borde = clave === 'sube' ? '#22c55e' : clave === 'baja' ? '#C0504D' : GRIS;
    return (
      <button
        onClick={() => setVer(v => ({ ...v, [clave]: !v[clave] }))}
        title={on ? 'Toque para esconder estos' : 'Toque para volver a mostrarlos'}
        className="rounded-xl py-3 px-2 text-center transition hover:-translate-y-0.5"
        style={{
          background: on ? fondo : CAMPO,
          border: on ? `2px solid ${borde}` : `1px solid ${BORDE}`,
          opacity: on ? 1 : .55,
        }}>
        <p className="text-[28px] font-black leading-none" style={{ color }}>{numero}</p>
        <p className="text-[9.5px] font-black uppercase tracking-widest mt-1.5 text-[#C9D2DE]">{texto}</p>
      </button>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>
      {/* Encabezado */}
      <div className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
           style={{ background: 'linear-gradient(to right,#333F50,#0EA142)' }}>
        <button onClick={() => router.back()} className="text-white hover:opacity-80 flex-shrink-0" title="Volver">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-white font-black text-[17px] leading-tight">Comparativa de informes</p>
          <p className="text-white/85 text-[11px] truncate">
            {(B?.nombre || A?.nombre || '').toString() || 'Deportista'}
            {cod ? ` · Código ${cod}` : ''}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5">
        {cargando ? (
          <p className="text-center text-white/60 text-sm py-16">Trayendo los informes…</p>
        ) : filas.length < 2 ? (
          <div className="rounded-2xl border px-5 py-8 text-center"
               style={{ background: PANEL, borderColor: AMBAR }}>
            <p className="font-black text-[14px]" style={{ color: AMBAR }}>
              Todavía no hay con qué comparar
            </p>
            <p className="text-white/75 text-[12.5px] mt-1.5 leading-relaxed">
              Este deportista tiene {filas.length === 1 ? 'un solo informe' : 'cero informes'}.
              La comparativa necesita <b>dos o más</b>: uno de antes y uno de ahora.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>

            {/* Cuáles dos se comparan */}
            <div className="flex flex-wrap gap-2.5 items-end px-4 py-3.5" style={{ borderBottom: `1px solid ${BORDE}` }}>
              <div>
                <label className={etq} style={{ color: GRIS }}>Informe anterior</label>
                <select value={iA} onChange={e => setIA(Number(e.target.value))} style={inp}>
                  {filas.map((r, i) => (
                    <option key={r.id ?? i} value={i} style={{ color: '#111827', background: '#fff' }}>{rotulo(r)}</option>
                  ))}
                </select>
              </div>
              <span className="text-[18px] font-black pb-2" style={{ color: GRIS }}>→</span>
              <div>
                <label className={etq} style={{ color: GRIS }}>Informe nuevo</label>
                <select value={iB} onChange={e => setIB(Number(e.target.value))} style={inp}>
                  {filas.map((r, i) => (
                    <option key={r.id ?? i} value={i} style={{ color: '#111827', background: '#fff' }}>{rotulo(r)}</option>
                  ))}
                </select>
              </div>
            </div>

            {iA === iB ? (
              <p className="px-5 py-8 text-center text-[12.5px] font-bold" style={{ color: AMBAR }}>
                Escogió el mismo informe dos veces. Cambie uno de los dos para poder comparar.
              </p>
            ) : (
              <>
                {/* ── CALIFICACIÓN GENERAL ── dirección, 03/09/2026 ── */}
                {cuentas.calA > 0 && (
                  <div className="px-4 pt-4 pb-3.5" style={{ background: HONDO }}>
                    <p className="text-[9.5px] font-black uppercase tracking-[.2em] text-center"
                       style={{ color: GRIS }}>
                      Calificación general
                    </p>

                    <div className="flex items-center justify-center gap-6 flex-wrap mt-2">
                      <div className="text-center min-w-[86px]">
                        <p className="text-[28px] font-black leading-none" style={{ color: '#96A2B2' }}>
                          {cuentas.calA.toFixed(1)}
                        </p>
                        <p className="text-[10px] font-black mt-1" style={{ color: GRIS }}>de 5.0</p>
                      </div>
                      <span className="text-[22px] font-black pb-3" style={{ color: '#5C6A7E' }}>→</span>
                      <div className="text-center min-w-[86px]">
                        <p className="text-[46px] font-black leading-none"
                           style={{ color: COLOR_NIVEL[Math.max(1, Math.round(cuentas.calB))] }}>
                          {cuentas.calB.toFixed(1)}
                        </p>
                        <p className="text-[10px] font-black mt-1" style={{ color: VERDECL }}>de 5.0</p>
                      </div>
                    </div>

                    {(() => {
                      const d = cuentas.calB - cuentas.calA;
                      const sube = d > 0.049, baja = d < -0.049;
                      return (
                        <p className="text-center mt-2">
                          <span className="inline-block text-[11.5px] font-black px-3.5 py-1.5 rounded-xl border"
                                style={sube
                                  ? { background: 'rgba(34,197,94,.16)', color: '#7CE49F', borderColor: 'rgba(34,197,94,.5)' }
                                  : baja
                                  ? { background: 'rgba(192,80,77,.18)', color: '#F0A6A4', borderColor: 'rgba(192,80,77,.6)' }
                                  : { background: 'transparent', color: '#A9B3C2', borderColor: BORDE }}>
                            {sube ? `▲ Subió ${d.toFixed(1)}` : baja ? `▼ Bajó ${Math.abs(d).toFixed(1)}` : '= Sin cambio'}
                            {' · '}{NOMBRE_NIVEL[Math.max(1, Math.round(cuentas.calB))]}
                          </span>
                        </p>
                      );
                    })()}

                    {/* El riel: dónde está hoy y, en blanco, dónde estaba */}
                    <div className="relative mx-auto mt-4" style={{ maxWidth: 460 }}>
                      <div className="relative rounded-lg"
                           style={{ height: 12, background: '#232C39', border: '1px solid #3C4859' }}>
                        <div className="absolute left-0 top-0 bottom-0 rounded-lg"
                             style={{ width: `${(cuentas.calB / 5) * 100}%`,
                                      background: 'linear-gradient(to right,#ef4444,#f97316,#eab308,#22c55e)' }} />
                        <span className="absolute rounded-sm" title="Como estaba antes"
                              style={{ left: `${(cuentas.calA / 5) * 100}%`, top: -5, bottom: -5,
                                       width: 2, background: 'rgba(255,255,255,.88)' }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[8.5px] font-black tracking-widest"
                           style={{ color: '#6E7A8C' }}>
                        <span>1 INICIACIÓN</span><span>3 COMPETENTE</span><span>5 DOMINANTE</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* El resumen, que además filtra */}
                <div className="grid grid-cols-3 gap-2.5 px-4 py-3.5"
                     style={{ borderTop: `1px solid ${BORDE}` }}>
                  <Cuadro clave="sube"  numero={cuentas.sube}  texto="Subió" color="#7CE49F" />
                  <Cuadro clave="igual" numero={cuentas.igual} texto="Igual" color="#A9B3C2" />
                  <Cuadro clave="baja"  numero={cuentas.baja}  texto="Bajó"  color="#F0A6A4" />
                </div>

                {cuentas.porCat.map(({ cat, items, pa, pb }) => {
                  const visibles = items.filter(x =>
                    x.tipo !== 'nada' && (x.tipo === 'nuevo' || ver[x.tipo as 'sube' | 'igual' | 'baja']));
                  if (!visibles.length) return null;
                  const dif = pb - pa;
                  const col = dif > 0.001 ? '#7CE49F' : dif < -0.001 ? '#F0A6A4' : '#A9B3C2';
                  const txt = dif > 0.001 ? `▲ +${dif.toFixed(1)}` : dif < -0.001 ? `▼ ${dif.toFixed(1)}` : '= sin cambio';

                  return (
                    <div key={cat.titulo} style={{ borderTop: `1px solid ${BORDE}` }}>
                      <div className="flex items-center gap-2.5 px-4 py-2.5 flex-wrap" style={{ background: HONDO }}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                        <span className="text-[13px] font-black text-white">{cat.emoji} {cat.titulo}</span>
                        {pa > 0 && (
                          <span className="ml-auto flex items-center gap-2 text-[11px] font-black" style={{ color: col }}>
                            <span className="font-bold" style={{ color: GRIS }}>
                              promedio {pa.toFixed(1)} → {pb.toFixed(1)}
                            </span>
                            {txt}
                          </span>
                        )}
                      </div>

                      {visibles.map(x => (
                        <div key={x.label}
                             className="grid gap-3 items-center px-4 py-2.5"
                             style={{ gridTemplateColumns: 'minmax(120px,1fr) minmax(140px,178px) 98px',
                                      borderTop: '1px solid rgba(74,85,104,.55)',
                                      /* Lo que quedó igual se apaga: así la vista se va
                                         derecho a lo que sí se movió. — 03/09/2026 */
                                      opacity: x.tipo === 'igual' ? .55 : 1 }}>
                          <p className="text-[12.5px] font-bold text-white leading-tight min-w-0">{x.label}</p>
                          <Barra antes={x.a} ahora={x.b} />
                          <Sello tipo={x.tipo} dif={x.b - x.a} />
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* Qué es cada cosa */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3 text-[10.5px] text-[#C9D2DE]"
                     style={{ borderTop: `1px solid ${BORDE}`, background: HONDO }}>
                  <span><b className="text-white">La barra</b> se llena según el nivel: a más larga, mejor</span>
                  <span><b className="text-white">La rayita blanca</b> marca dónde estaba antes</span>
                  <span>1 Iniciación · 2 En Desarrollo · 3 Competente · 4 Avanzado · 5 Dominante</span>
                </div>
              </>
            )}
          </div>
        )}
        <div className="h-6" />
      </div>
    </div>
  );
}

export default function ValoracionComparativaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: LIENZO }} />}>
      <ComparativaInner />
    </Suspense>
  );
}
