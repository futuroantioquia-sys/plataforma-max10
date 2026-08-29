'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, ClipboardList, CalendarDays, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { getProfes, contarDeportistasPorProyecto } from '@/lib/db';

/* El conteo de cada proyecto se guarda en este teléfono. Así, de la segunda
   vez en adelante, el número aparece de una y solo se actualiza por detrás.
   — 25/08/2026 */
const CONTEO_KEY = 'futuro-conteo-proyectos';

export default function MisProyectosPage() {
  const router = useRouter();

  const [nombreProfe, setNombreProfe] = useState('');
  const [fotoProfe,   setFotoProfe]   = useState('');
  const [proyectosProfe, setProyectosProfe] = useState<string[]>([]);
  const [conteoProyecto, setConteoProyecto] = useState<Record<string, number>>({});
  const [conteoFallo, setConteoFallo] = useState(false);
  const [cargando,       setCargando]       = useState(true);
  useEffect(() => {
    // 0. Conteo de la última vez: se pinta de una, sin esperar al servidor.
    try {
      const raw = localStorage.getItem(CONTEO_KEY);
      if (raw) { const c = JSON.parse(raw); if (c && typeof c === 'object') setConteoProyecto(c); }
    } catch {}

    // 1. Nombre y foto desde localStorage (inmediato)
    try {
      const rawNombre = localStorage.getItem('futuro-profe-nombre');
      const nombre = rawNombre ? JSON.parse(rawNombre) : '';
      if (nombre) {
        setNombreProfe(nombre);
        const f1 = localStorage.getItem(`futuro-foto-profe-${nombre.toUpperCase()}`);
        if (f1) { setFotoProfe(f1); }
        else {
          const f2 = localStorage.getItem('futuro-profe-foto');
          if (f2) setFotoProfe(f2);
        }
      }
    } catch {}

    // 2. Proyectos: primero localStorage (rápido), luego Supabase (preciso)
    /* Pide el número de cada proyecto y lo deja guardado en el teléfono.
       Se puede llamar dos veces (con la lista del teléfono y con la del
       servidor); si la lista es la misma no se repite el trabajo. */
    let yaContado = '';
    async function contar(proyectos: string[]) {
      const clave = proyectos.slice().sort().join('|');
      if (!clave || clave === yaContado) return;
      yaContado = clave;
      try {
        const conteos = await contarDeportistasPorProyecto(proyectos);
        if (Object.keys(conteos).length) {
          setConteoProyecto(prev => {
            const mezcla = { ...prev, ...conteos };
            try { localStorage.setItem(CONTEO_KEY, JSON.stringify(mezcla)); } catch {}
            return mezcla;
          });
        } else {
          setConteoFallo(true);
        }
      } catch { setConteoFallo(true); }
    }

    async function cargar() {
      let proyectos: string[] = [];
      try {
        const rawNombre = localStorage.getItem('futuro-profe-nombre');
        const nombre = rawNombre ? JSON.parse(rawNombre) : '';

        // Intentar desde localStorage primero (rápido)
        const rawLS = localStorage.getItem('futuro-profe-proyectos');
        const proyLS: string[] = rawLS ? JSON.parse(rawLS) : [];
        if (proyLS.length) {
          setProyectosProfe(proyLS);
          proyectos = proyLS;
          setCargando(false);
          // El conteo arranca YA, sin esperar a que carguen los formadores.
          contar(proyLS);
        }

        // Luego desde Supabase para garantizar data fresca
        if (nombre) {
          const listaProfes = await getProfes();
          const profe = listaProfes.find(
            p => p.usuario.toUpperCase() === nombre.toUpperCase()
          );
          if (profe) {
            if (profe.proyectos.length > 0) {
              setProyectosProfe(profe.proyectos);
              proyectos = profe.proyectos;
              try {
                localStorage.setItem('futuro-profe-proyectos', JSON.stringify(profe.proyectos));
              } catch {}
            }
            if (profe.foto) {
              setFotoProfe(profe.foto);
              try { localStorage.setItem(`futuro-foto-profe-${nombre.toUpperCase()}`, profe.foto); } catch {}
            }
          }
        }
      } catch {}

      setCargando(false);

      /* 3. El conteo, con la lista ya confirmada por el servidor. Si es la
            misma que la del teléfono, esto no vuelve a pedir nada. */
      await contar(proyectos);
    }
    cargar();
  }, []);

  /* ── LA LISTA DE ARRIBA A LA IZQUIERDA ───────────────────────────────────
     (dirección, 27/08/2026)

     Desde aquí el formador va derecho a lo suyo —asistencia, microciclo,
     pospartido— sin tener que entrar primero a un proyecto y buscar el botón
     adentro. Es la misma lista que ya está dentro del proyecto, pero en la
     puerta.

     UN DETALLE QUE HAY QUE RESOLVER: la asistencia y el microciclo son SIEMPRE
     de un proyecto. El pospartido no —ese va por torneo—. Entonces:
       · Si el formador tiene UN solo proyecto, se entra derecho.
       · Si tiene varios, la lista pregunta a cuál, en un segundo paso.
     Así nunca se entra a un proyecto que no era. */
  const [menu, setMenu] = useState<null | 'raiz' | 'asistencia' | 'microciclo'>(null);
  const cajaMenu = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const porFuera = (e: MouseEvent) => {
      if (cajaMenu.current && !cajaMenu.current.contains(e.target as Node)) setMenu(null);
    };
    const conEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', porFuera);
    document.addEventListener('keydown', conEsc);
    return () => {
      document.removeEventListener('mousedown', porFuera);
      document.removeEventListener('keydown', conEsc);
    };
  }, [menu]);

  function irAsistencia(proy: string) {
    setMenu(null);
    router.push(`/asistencia?proyecto=${encodeURIComponent(proy)}`);
  }
  function irMicrociclo(proy: string) {
    setMenu(null);
    router.push(`/microciclo?proyecto=${encodeURIComponent(proy)}`);
  }
  /** Abre la opción: si hay un solo proyecto entra derecho; si hay varios,
   *  muestra la lista de proyectos para escoger. */
  function escoger(que: 'asistencia' | 'microciclo') {
    if (proyectosProfe.length === 1) {
      que === 'asistencia' ? irAsistencia(proyectosProfe[0]) : irMicrociclo(proyectosProfe[0]);
      return;
    }
    setMenu(que);
  }

  const primerNombre = nombreProfe ? nombreProfe.split(' ')[0] : 'Profe';

  /* MIENTRAS SE PRUEBA EL POSPARTIDO, solo a CASTRO se le muestra el botón
     (dirección, 29/08/2026). A los demás ni les aparece, y si llegan con el
     enlace pegado la pantalla del pospartido tampoco los deja entrar.
     Para abrírselo a todos, se deja la lista vacía. */
  /* CERRADO PARA TODOS LOS FORMADORES (dirección, 29/08/2026): seguimos en
     pruebas, así que por ahora ningún profe ve el pospartido. */
  const PROFES_CON_POSPARTIDO: string[] = [];
  const sinTildes = (x: any) => String(x ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  /* ABIERTO A TODOS (dirección, 29/08/2026, en la tarde): el pospartido le
     aparece a todo formador. Para volver a cerrarlo mientras se prueba algo,
     se pone POSPARTIDO_PARA_TODOS en false y se escriben en
     PROFES_CON_POSPARTIDO los apellidos que sí pueden. */
  const POSPARTIDO_PARA_TODOS = true;
  const vePospartido = POSPARTIDO_PARA_TODOS || PROFES_CON_POSPARTIDO.some(p => {
    const yo = sinTildes(nombreProfe);
    const el = sinTildes(p);
    return !!yo && (yo === el || yo.split(' ').includes(el));
  });
  // Paleta del sistema (la del consolidado de asistencias)
  const G      = '#00B050';   // verde de la plataforma
  const LIENZO = '#2B3547';   // fondo
  const PANEL  = '#3C4759';   // tarjetas
  const BORDE  = '#4A5568';

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>

      {/* ── Header ── */}
      {/* OJO: el encabezado ya NO recorta lo que se sale (antes tenía
          overflow-hidden por el dibujito del fondo). Si lo recortara, la lista
          que se abre quedaría cortada por debajo del encabezado y no se vería.
          El recorte se le pasó al dibujo, que es el único que lo necesitaba.
          — 27/08/2026 */}
      <header className="relative bg-gradient-to-r from-[#333F50] to-[#0EA142] px-4 py-4 flex items-center gap-2.5 sticky top-0 z-20 shadow">
        <div className="absolute inset-0 pointer-events-none opacity-[0.07] overflow-hidden" aria-hidden>
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-mp" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/>
                <polygon points="30,22 37,27 34,35 26,35 23,27" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-mp)"/>
          </svg>
        </div>
        <button onClick={() => router.push('/dashboard')}
          className="relative text-white/70 hover:text-white transition shrink-0">
          <ArrowLeft className="w-5 h-5"/>
        </button>

        {/* ── IR DERECHO A LO SUYO ─────────────────────────────────────────
            Asistencia · Microciclos · Pospartidos, sin entrar antes a un
            proyecto. — dirección, 27/08/2026 */}
        <div ref={cajaMenu} className="relative shrink-0 z-30">
          <button
            onClick={() => setMenu(m => (m ? null : 'raiz'))}
            title="Ir a Asistencia, Microciclos o Pospartidos"
            className="rounded-xl flex items-center gap-1.5 px-2.5 h-9 font-black text-[11px] text-white
              bg-white/15 hover:bg-white/25 transition whitespace-nowrap">
            <ClipboardList className="w-3.5 h-3.5 shrink-0" />
            IR A
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${menu ? 'rotate-180' : ''}`} />
          </button>

          {menu === 'raiz' && (
            <div className="absolute left-0 mt-1.5 rounded-xl overflow-hidden shadow-2xl"
              style={{ background: PANEL, border: `1px solid ${BORDE}`, minWidth: 216 }}>
              {[
                { texto: 'GESTIONAR ASISTENCIA', Icono: ClipboardList, ir: () => escoger('asistencia'), varios: proyectosProfe.length > 1 },
                { texto: 'MICROCICLOS',          Icono: CalendarDays,  ir: () => escoger('microciclo'), varios: proyectosProfe.length > 1 },
                ...(vePospartido
                  ? [{ texto: 'POSPARTIDOS', Icono: Trophy, ir: () => { setMenu(null); router.push('/postpartido'); }, varios: false }]
                  : []),
              ].map(({ texto, Icono, ir, varios }, i) => (
                <button key={texto} onClick={ir}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-white font-black text-[12px]
                    hover:bg-[rgba(0,176,80,.16)] transition"
                  style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDE}` }}>
                  <Icono className="w-4 h-4 shrink-0" style={{ color: G }} />
                  <span className="flex-1">{texto}</span>
                  {varios && <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white/35" />}
                </button>
              ))}
            </div>
          )}

          {(menu === 'asistencia' || menu === 'microciclo') && (
            <div className="absolute left-0 mt-1.5 rounded-xl overflow-hidden shadow-2xl"
              style={{ background: PANEL, border: `1px solid ${BORDE}`, minWidth: 216 }}>
              <p className="px-4 py-2.5 text-[10px] font-black tracking-widest text-white/45"
                style={{ borderBottom: `1px solid ${BORDE}` }}>
                {menu === 'asistencia' ? 'ASISTENCIA · ¿DE CUÁL?' : 'MICROCICLO · ¿DE CUÁL?'}
              </p>
              {proyectosProfe.map((proy, i) => (
                <button key={proy}
                  onClick={() => (menu === 'asistencia' ? irAsistencia(proy) : irMicrociclo(proy))}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-white font-black text-[12px]
                    hover:bg-[rgba(0,176,80,.16)] transition"
                  style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDE}` }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: G }} />
                  {proy}
                </button>
              ))}
              <button onClick={() => setMenu('raiz')}
                style={{ borderTop: `1px solid ${BORDE}` }}
                className="w-full px-4 py-2.5 text-left text-white/45 hover:text-white font-bold text-[11px] transition">
                ← Atrás
              </button>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-w-0">
          <h1 className="text-white font-black text-base leading-tight truncate">Mis Proyectos</h1>
          <p className="text-white/60 text-[11px] truncate">Futuro Antioquia · MAX 10</p>
        </div>
        <div className="relative flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-7 w-auto object-contain" />
          <p className="text-white/75 text-[9px] leading-none mt-0.5 tracking-wide">CONECTA · GESTIONA · GANA</p>
        </div>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">


        {/* ── Tarjeta Bienvenida con foto grande ── */}
        <div className="rounded-3xl shadow-md border overflow-hidden" style={{ background: PANEL, borderColor: BORDE }}>
          {/* Banda verde superior */}
          <div style={{ background: G }} className="h-20 relative flex items-end justify-center pb-0">
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-10">
              {fotoProfe
                ? <img src={fotoProfe} alt={primerNombre}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"/>
                : <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg flex items-center justify-center" style={{ background: LIENZO }}>
                    <span className="text-white font-black text-4xl">{primerNombre[0]}</span>
                  </div>
              }
            </div>
          </div>
          {/* Contenido bajo la foto */}
          <div className="pt-16 pb-6 px-6 text-center">
            <h2 className="text-white font-black text-xl leading-tight">
              ¡Bienvenido, Profe {primerNombre}!
            </h2>
            <p className="font-bold text-sm mt-1" style={{ color: G }}>
              Estos son tus proyectos,{' '}
              <span className="text-white/70">cuida mucho de ellos.</span>
            </p>
          </div>
        </div>

        {/* ── Lista de proyectos ── */}
        {cargando ? (
          <div className="rounded-2xl shadow-sm border p-10 flex flex-col items-center gap-3" style={{ background: PANEL, borderColor: BORDE }}>
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: G, borderTopColor: 'transparent' }}/>
            <p className="text-white/45 text-sm font-semibold">Cargando tus proyectos…</p>
          </div>

        ) : proyectosProfe.length === 0 ? (
          <div className="rounded-2xl shadow-sm border p-10 text-center" style={{ background: PANEL, borderColor: BORDE }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: LIENZO }}>
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-white font-bold text-sm">Sin proyectos asignados</p>
            <p className="text-white/45 text-xs mt-1">
              Pide al administrador que te asigne proyectos en Gestión de Usuarios.
            </p>
          </div>

        ) : (
          <div className="space-y-3">
            {proyectosProfe.map(proy => {
              const alumnos = conteoProyecto[proy] ?? -1;   // -1 = todavía contando
              return (
                <button
                  key={proy}
                  onClick={() => router.push(`/alumnos?proyecto=${encodeURIComponent(proy)}`)}
                  className="w-full rounded-2xl shadow-sm border overflow-hidden text-left active:scale-[.98] transition-transform hover:shadow-md hover:brightness-110 cursor-pointer"
                  style={{ background: PANEL, borderColor: BORDE }}>
                  <div className="flex items-center gap-4 p-4">
                    {/* Ícono proyecto */}
                    <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-inner"
                      style={{ background: G }}>
                      <span className="text-white">
                        <svg viewBox="0 0 40 40" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="18" fill="none" stroke="white" strokeWidth="2"/>
                          <polygon points="20,13 26,17 24,24 16,24 14,17" fill="none" stroke="white" strokeWidth="2"/>
                          <circle cx="20" cy="20" r="3" fill="white"/>
                        </svg>
                      </span>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">{proy}</p>
                      <p className="text-white/45 text-xs mt-0.5 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 inline"/>
                        {alumnos >= 0
                          ? `${alumnos} ${alumnos === 1 ? 'deportista' : 'deportistas'}`
                          : conteoFallo ? 'Ver deportistas' : 'Contando…'}
                      </p>
                    </div>
                    {/* Flecha */}
                    <svg className="w-5 h-5 text-white/35 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}
