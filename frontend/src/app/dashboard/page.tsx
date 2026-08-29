'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, DollarSign, Calendar,
  Star, MessageCircle, Clipboard, ClipboardList, UserPlus, LayoutList,
  Link2, Copy, Check, QrCode, BarChart3, Trophy, Upload, FolderKanban,
  LogOut, Zap, Shield, Dumbbell, HardHat, Clock, UserCog, Calculator, Cake, CalendarDays,
  UserMinus, FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { esSuperAdmin, esDeportivo, getSesion } from '@/lib/permisos';
import { cn } from '@/lib/utils';
import LoadingBall from '@/components/LoadingBall';
import { getDeportistas, countSoportesPendientes, countSolicitudesFacturaPendientes, countLibroPagos, getResumenVisitas, getVisitasPorDia } from '@/lib/db';
import { contarSolicitudesEnEstudio } from '@/lib/retiro';

// ── PALETA ───────────────────────────────────────────────────────
//  La misma del consolidado de asistencias (arte aprobado 22/08/2026),
//  para que el tablero de inicio y los módulos se sientan una sola cosa.
const LIENZO     = '#2B3547';   // fondo del tablero: el mismo gris oscuro de los
                                // módulos. Quien resalta es la caja de sección,
                                // que va más clara encima (22/08/2026)
const SECCION    = '#3C4759';   // caja grande que agrupa cada categoría
const PANEL      = '#2B3547';   // los módulos, más oscuros que su caja
const CAMPO      = '#232B39';   // superficies internas: cifras
const BORDE      = '#3E4859';   // borde suave, apenas insinuado
const VERDE      = '#00B050';   // acento y todo lo que está al día
const ROJO       = '#C0504D';   // avisos pendientes
const GRIS_VACIO = '#717985';   // apagado / sin datos

// ── CARD DE ACCESO RÁPIDO ────────────────────────────────────────
function AccesoCard({
  titulo, icono: Icono, href, descripcion, color = 'verde', badge, disabled,
}: {
  titulo: string; icono: React.ElementType; href: string; descripcion: string; color?: string; badge?: number; disabled?: boolean;
}) {
  const router = useRouter();
  const [encima, setEncima] = useState(false);

  /* Sobre el lienzo oscuro los tonos pastel desaparecen: cada color es un tinte
     translúcido que al pasar el mouse se enciende a color pleno.
     22/08/2026 — TODAS las categorías usan 'verde'. Los demás tonos se dejan
     definidos por si algún día se quiere volver a diferenciar por color. */
  const colorMap: Record<string, { tinte: string; solido: string }> = {
    verde:  { tinte: 'rgba(0,176,80,.16)',    solido: VERDE     },
    azul:   { tinte: 'rgba(96,165,250,.16)',  solido: '#4E8FD6' },
    dorado: { tinte: 'rgba(245,190,90,.16)',  solido: '#D9A441' },
    purple: { tinte: 'rgba(167,139,250,.16)', solido: '#8B72D9' },
    teal:   { tinte: 'rgba(45,212,191,.16)',  solido: '#2FA8A0' },
  };

  const c = colorMap[color] ?? colorMap.verde;

  if (disabled) {
    return (
      <div className="group relative rounded-xl border p-2.5 sm:p-3 text-left opacity-50 cursor-not-allowed"
        style={{ background: CAMPO, borderColor: BORDE }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
          style={{ background: 'rgba(255,255,255,.07)', color: GRIS_VACIO }}>
          <Icono className="w-4 h-4" />
        </div>
        <p className="font-bold text-white/60 text-[13px] leading-[1.2]">{titulo}</p>
        <p className="text-[10px] text-white/35 mt-0.5 leading-[1.25] font-semibold uppercase tracking-wide">{descripcion}</p>
      </div>
    );
  }

  return (
    <button
      onClick={() => router.push(href)}
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      className={cn(
        'group relative rounded-xl border p-2.5 sm:p-3 text-left',
        'transition-all duration-200 hover:-translate-y-1 hover:shadow-lg',
      )}
      style={{ background: PANEL, borderColor: encima ? c.solido : BORDE }}
    >
      {badge != null && badge > 0 && (
        <span className="absolute -top-2.5 -right-2.5 text-white text-[11px] font-black rounded-full min-w-[24px] h-6 flex items-center justify-center px-1.5 shadow-md z-10"
          style={{ background: ROJO }}>
          {badge}
        </span>
      )}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-all duration-200"
        style={{ background: encima ? c.solido : c.tinte, color: encima ? '#fff' : c.solido }}>
        <Icono className="w-4 h-4" />
      </div>
      <p className="font-bold text-[13px] leading-[1.2] transition-colors"
        style={{ color: encima ? c.solido : '#ffffff' }}>
        {titulo}
      </p>
      <p className="text-[10px] text-white/45 mt-0.5 leading-[1.25]">{descripcion}</p>
    </button>
  );
}

// ── SECCIÓN DE CATEGORÍA ─────────────────────────────────────────
function CategoriaSection({
  emoji, titulo, color, children, delay = 0,
}: {
  emoji: string; titulo: string; color: string; children: React.ReactNode; delay?: number;
}) {
  /* Sobre el oscuro el título va en blanco: quien da el color es la barrita
     de la izquierda, igual que los títulos de grupo del consolidado. */
  const barra: Record<string, string> = {
    verde: VERDE, azul: '#4E8FD6', dorado: '#D9A441', purple: '#8B72D9', teal: '#2FA8A0',
  };

  return (
    <div
      className="animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Misma forma que "Visitantes de la plataforma": caja gris con franja de
          título arriba y el contenido adentro. La barrita de color al borde
          izquierdo es lo único que distingue una categoría de otra. */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ background: SECCION, borderColor: BORDE, borderLeft: `4px solid ${barra[color] ?? GRIS_VACIO}` }}>
        <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: BORDE }}>
          <span className="text-base">{emoji}</span>
          <h2 className="font-bold text-[13px] uppercase tracking-wide text-white">
            {titulo}
          </h2>
        </div>
        <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2 sm:gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── LINK DE INSCRIPCIÓN ──────────────────────────────────────────
function LinkInscripcionCard() {
  const [url,     setUrl]     = useState('');
  const [copiado, setCopiado] = useState(false);
  const [verQr,   setVerQr]   = useState(false);

  useEffect(() => { setUrl(window.location.origin + '/afiliacion'); }, []);

  function copiar() {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }).catch(() => {});
  }

  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    : '';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#064e1e] via-[#0f7b35] to-[#16a34a] p-5 text-white shadow-lg animate-fade-up delay-500">
      {/* Patrón decorativo */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sp-dash" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/>
              <polygon points="30,22 37,27 34,35 26,35 23,27" fill="none" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-dash)"/>
        </svg>
      </div>
      {/* Balón decorativo grande */}
      <svg className="absolute -right-8 -top-8 w-32 h-32 opacity-[0.06]" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="2"/>
        <polygon points="50,24 70,38 62,62 38,62 30,38" fill="none" stroke="white" strokeWidth="2"/>
      </svg>

      <div className="relative flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Link2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-black text-sm">Link de Inscripción 2026</p>
          <p className="text-white/60 text-xs mt-0.5">Comparte con los deportistas y familias</p>
        </div>
      </div>

      <div className="relative flex items-center gap-2 bg-white/10 backdrop-blur rounded-xl px-3 py-2.5 mb-3">
        <p className="flex-1 text-xs font-mono text-white/90 truncate">{url || 'Cargando…'}</p>
        <button
          onClick={copiar}
          className="flex items-center gap-1.5 bg-white text-[#16a34a] font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-green-50 transition-all flex-shrink-0"
        >
          {copiado
            ? <><Check className="w-3.5 h-3.5 text-green-600" />¡Copiado!</>
            : <><Copy className="w-3.5 h-3.5" />Copiar</>
          }
        </button>
      </div>

      <button
        onClick={() => setVerQr(v => !v)}
        className="relative flex items-center gap-2 text-white/70 hover:text-white text-xs font-semibold transition"
      >
        <QrCode className="w-4 h-4" />
        {verQr ? 'Ocultar código QR' : 'Ver código QR para compartir'}
      </button>

      {verQr && qrSrc && (
        <div className="relative mt-4 flex flex-col items-center gap-2 animate-scale-in">
          <div className="bg-white p-3 rounded-2xl shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR Inscripción" width={160} height={160} />
          </div>
          <p className="text-white/60 text-[10px] text-center">Escanea con la cámara del celular</p>
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD ADMINISTRADOR ──────────────────────────────────────
/** Panel de analíticas: cuántos entran a la app y accesos por día. */
function AnaliticasVisitantes() {
  const [resumen, setResumen] = useState<{ total: number; unicos: number }>({ total: 0, unicos: 0 });
  const [dias,    setDias]    = useState<{ dia: string; visitas: number; visitantes: number }[]>([]);
  useEffect(() => {
    getResumenVisitas().then(setResumen).catch(() => {});
    getVisitasPorDia(30).then(setDias).catch(() => {});
  }, []);
  const maxV = Math.max(1, ...dias.map(d => d.visitas));
  const fmtDia = (s: string) => { const p = (s || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : s; };
  return (
    <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: SECCION, borderColor: BORDE }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: BORDE }}>
        <span className="text-lg">📈</span>
        <span className="text-white font-bold text-[13px] uppercase tracking-wide flex-1">Visitantes de la plataforma</span>
      </div>
      <div className="p-4">
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-xl border p-3 text-center"
            style={{ background: PANEL, borderColor: BORDE }}>
            <p className="text-2xl font-black" style={{ color: VERDE }}>{resumen.total}</p>
            <p className="text-[11px] font-bold text-white/55 uppercase tracking-wide">Accesos totales</p>
          </div>
          <div className="flex-1 rounded-xl border p-3 text-center"
            style={{ background: PANEL, borderColor: BORDE }}>
            <p className="text-2xl font-black" style={{ color: VERDE }}>{resumen.unicos}</p>
            <p className="text-[11px] font-bold text-white/55 uppercase tracking-wide">Deportistas únicos</p>
          </div>
        </div>
        {/* La gráfica "Accesos por día" se retiró el 22/08/2026: los dos
            contadores de arriba son lo que de verdad se consulta. */}
      </div>
    </div>
  );
}

function DashboardAdmin() {
  const [pendientesAsign,    setPendientesAsign]    = useState(0);
  const [pendientesSoportes, setPendientesSoportes] = useState(0);
  const [pagosCargados,      setPagosCargados]      = useState(0);
  const [pendientesFacturas, setPendientesFacturas] = useState(0);
  // Solicitudes de retiro SIN RESOLVER (26/08/2026). Se cuentan de la tabla
  // de solicitudes, no del estado de las fichas: ver contarSolicitudesEnEstudio.
  const [retirosEnEstudio,   setRetirosEnEstudio]   = useState(0);
  // Rol (se resuelve en cliente para evitar desajustes de hidratación)
  const [esSuper, setEsSuper] = useState(false); // ADMON → gestiona administradores
  const [esDep,   setEsDep]   = useState(false); // deportivo → sin finanzas
  useEffect(() => { setEsSuper(esSuperAdmin()); setEsDep(esDeportivo()); }, []);

  useEffect(() => {
    // Refresca los contadores (asignación, soportes por confirmar, pagos cargados).
    const refrescar = () => {
      getDeportistas().then(lista => {
        const count = lista.filter(d => {
          const proy = (Object.entries(d._columnas ?? {}).find(([k]) => /^proy/i.test(k.trim()))?.[1] ?? '').trim().toUpperCase();
          return !proy || proy === 'UBICAR';
        }).length;
        setPendientesAsign(count);
      }).catch(() => {});

      countSoportesPendientes().then(n => setPendientesSoportes(n)).catch(() => {});

      // Solicitudes de factura de los acudientes que siguen sin facturar
      countSolicitudesFacturaPendientes().then(n => setPendientesFacturas(n)).catch(() => {});

      // Pagos subidos: contar desde la base (igual para admin y contable, no del localStorage)
      countLibroPagos().then(n => setPagosCargados(n)).catch(() => {});

      // Solicitudes de retiro que están esperando decisión
      contarSolicitudesEnEstudio().then(n => setRetirosEnEstudio(n)).catch(() => {});
    };

    refrescar();
    // Mantener el contador al día: al volver a la pestaña o enfocar la ventana, y cada 20 s.
    const onFocus = () => refrescar();
    const onVis = () => { if (document.visibilityState === 'visible') refrescar(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(refrescar, 20000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Analíticas de visitantes */}
      <AnaliticasVisitantes />

      {/* Categoría: Deportistas */}
      <CategoriaSection emoji="🏃" titulo="Deportistas" color="verde" delay={100}>
        <AccesoCard titulo="Total Afiliados"   icono={LayoutList}    href="/general"      descripcion="Todos los deportistas"       color="verde" />
        <AccesoCard titulo="Asignación de Proyectos" icono={UserPlus}      href="/asignacion"   descripcion="Asignar nuevos deportistas"  color="verde" badge={pendientesAsign} />
        <AccesoCard titulo="Programas y Proyectos"   icono={Users}         href="/alumnos"      descripcion="Ver y editar fichas"         color="verde" />
        {/* 26/08/2026 — Aquí queda TOTAL RETIRADOS, que es donde se trabaja:
            se estudian los casos y se resuelven. El FORMATO de la solicitud
            —la pantalla que llena el padre— se movió a Gestión, junto con los
            demás formatos y ajustes de la plataforma.
            El número rojo son las solicitudes SIN RESOLVER, contadas de la
            tabla de solicitudes. La primera versión contaba los deportistas
            marcados "SOLICITA RETIRO" en su ficha y se quedaba prendido al
            eliminar o resolver una; así ya no pasa: baja solo. — 26/08/2026 */}
        <AccesoCard titulo="Retiros"                 icono={UserMinus}     href="/retirados"    descripcion="Solicitudes nuevas y retirados" color="verde" badge={retirosEnEstudio} />
      </CategoriaSection>


      {/* Categoría: Seguimiento */}
      <CategoriaSection emoji="📊" titulo="Seguimiento" color="verde" delay={200}>
        <AccesoCard titulo="Control de Asistencia"  icono={Clipboard}  href="/asistencia"   descripcion="Registro por proyecto"       color="verde" />
        <AccesoCard titulo="Valoración Deportiva"   icono={Star}       href="/evaluaciones" descripcion="Registrar evaluaciones"      color="verde" />
        {/* 22/08/2026 — se retiró de Seguimiento "Sesiones de Entrenamiento"
            (/sesiones): la reemplaza Microciclo. El módulo sigue en el código;
            solo dejó de tener acceso aquí.

            25/08/2026 — "Control de Informes" VUELVE al tablero por pedido de la
            dirección: es donde el administrador ve qué informes ya hicieron los
            profes y cuáles faltan. */}
        <AccesoCard titulo="Control de Informes" icono={ClipboardList} href="/control-informes" descripcion="Qué informes hicieron los profes y cuáles faltan" color="verde" />
        <AccesoCard titulo="Microciclo de Entrenamiento" icono={CalendarDays} href="/microciclo" descripcion="Planeación semanal · lunes a domingo" color="verde" />
        {/* PROGRAMACIÓN DE COMPETENCIA (dirección, 28/08/2026): aquí se
            programa qué se juega, cuándo y dónde, y de ahí salen los
            microciclos. Va ANTES del microciclo porque ese es el orden en que
            se trabaja: primero se programa, después se planea la semana. */}
        <AccesoCard titulo="Programación de Competencia" icono={CalendarDays} href="/programacion" descripcion="Qué se juega, cuándo y dónde · de aquí salen los microciclos" color="verde" />
        <AccesoCard titulo="Postpartido"            icono={Trophy}     href="/postpartido"  descripcion="Resultado y desempeño individual" color="verde" />
        <AccesoCard titulo="Torneos y Competencias" icono={Trophy}    href="/torneos"      descripcion="Cuadro de equipos inscritos" color="verde" />
      </CategoriaSection>

      {/* Categoría: Finanzas — oculta para el Administrador Deportivo */}
      {!esDep && (
      <CategoriaSection emoji="💰" titulo="Finanzas" color="verde" delay={300}>
        <AccesoCard titulo="Contabilidad"          icono={Calculator}   href="/contabilidad"            descripcion="Libro dinámico contable"       color="verde" />
        <AccesoCard titulo="Control de Pagos"      icono={DollarSign}   href="/pagos"                   descripcion="Cobros y cartera morosa"       color="verde" />
        {/* 22/08/2026 — "Subir Libro Contable" salió del tablero: el libro se
            arma desde Contabilidad (Libro Dinámico) subiendo el extracto. */}
        <AccesoCard titulo="Confirmar Pagos"      icono={Clock}        href="/pagos-pendientes"         descripcion="Soportes enviados por padres"  color="verde" badge={pendientesSoportes} />
        <AccesoCard titulo="Facturas Pendientes"  icono={ClipboardList} href="/facturas"                descripcion="Solicitudes de factura de acudientes" color="verde" badge={pendientesFacturas} />
        <AccesoCard titulo="Nómina y Proveedores" icono={Users}        href="/nomina"                  descripcion="Documento, cuenta y banco" color="verde" />
      </CategoriaSection>
      )}


      {/* Categoría: Comunicaciones — todo lo que le llega a las familias.
          Creada el 22/08/2026: Mensajes y Cumpleaños estaban sueltos en Gestión,
          que es donde se administra la plataforma, no donde se habla con la gente. */}
      <CategoriaSection emoji="💬" titulo="Comunicaciones" color="verde" delay={400}>
        <AccesoCard titulo="Mensajes"   icono={MessageCircle} href="/mensajes"  descripcion="Comunicación con padres"      color="verde" />
        <AccesoCard titulo="Cumpleaños" icono={Cake}          href="/cumpleanos" descripcion="Ayer, hoy y mañana · tarjeta" color="verde" />
      </CategoriaSection>

      {/* Categoría: Gestión */}
      <CategoriaSection emoji="⚙️" titulo="Gestión" color="verde" delay={500}>
        {esSuper && (
          <AccesoCard titulo="Administradores" icono={UserCog} href="/administradores" descripcion="Crear y editar administradores" color="verde" />
        )}
        <AccesoCard titulo="Info Proyectos y Formadores" icono={Shield} href="/usuarios" descripcion="Profes, sedes y proyectos" color="verde" />
        <AccesoCard titulo="Gestión de Valoración" icono={Star} href="/gestion-valoracion" descripcion="Editar textos de los niveles" color="verde" />
        {/* Botones de Cobro — 25/08/2026. Aquí el administrador cambia el texto,
            el color y el mensaje de WhatsApp de los botones de Control de Pagos,
            sin tener que tocar código. */}
        <AccesoCard titulo="Botones de Cobro" icono={MessageCircle} href="/botones-cobro" descripcion="Texto, color y mensaje del cobro por WhatsApp" color="verde" />
        <AccesoCard titulo="Certificados Asistencia" icono={Clipboard} href="/certificados" descripcion="Quién descargó su certificado" color="verde" />
        <AccesoCard titulo="Formulario de Afiliación" icono={ClipboardList} href="/afiliacion" descripcion="Registro de deportistas" color="verde" />
        {/* FORMATO SOLICITUD DE RETIRO — 26/08/2026. Es la MISMA pantalla que
            llena el padre. Entrando desde aquí sale un buscador para escoger el
            deportista, y se puede radicar por él (cuando llama por teléfono).
            Va junto al Formulario de Afiliación: los dos son formatos que
            diligencia la familia — uno para entrar y el otro para salir. */}
        <AccesoCard titulo="Formato Solicitud de Retiro" icono={FileText} href="/retiro" descripcion="El formato que llena el padre" color="verde" />
        <AccesoCard titulo="Productos" icono={DollarSign} href="/productos" descripcion="Torneos e implementos" color="verde" />
      </CategoriaSection>
    </div>
  );
}

// ── DASHBOARD PROFESOR ───────────────────────────────────────────
function DashboardProfesor() {
  const router = useRouter();
  const [grupos, setGrupos] = useState<string[]>([]);
  const [nombreProfe, setNombreProfe] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('futuro-profe-proyectos');
      if (raw) setGrupos(JSON.parse(raw));
      const nombre = localStorage.getItem('futuro-profe-nombre');
      if (nombre) setNombreProfe(JSON.parse(nombre));
    } catch {}
  }, []);

  const accesos = [
    { titulo: 'Mis Proyectos',   icono: Clipboard,     href: '/mis-proyectos', descripcion: 'Asistencia y calificación',  color: 'verde'  },
    { titulo: 'Evaluar Alumnos',  icono: Star,          href: '/evaluaciones', descripcion: 'Técnico y formativo',        color: 'verde' },
    { titulo: 'Mis Alumnos',     icono: Users,          href: '/alumnos',      descripcion: 'Fichas y seguimiento',       color: 'verde'   },
    { titulo: 'Microciclo',      icono: CalendarDays,   href: '/microciclo',   descripcion: 'Planeación semanal',         color: 'verde' },
  ];

  /* MIENTRAS SE PRUEBA EL POSPARTIDO, solo CASTRO lo ve en su tablero
     (dirección, 29/08/2026). La pantalla del pospartido también lo bloquea,
     por si alguien llega con el enlace pegado. Para abrírselo a todos, se
     deja la lista vacía. */
  const PROFES_CON_POSPARTIDO = ['CASTRO'];
  const sinTildesPP = (x: any) => String(x ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  /* Se usa el nombre que ya trae el estado —se llenó arriba, en el effect—,
     para no leer el aparato mientras se pinta la pantalla. */
  const vePospartido = PROFES_CON_POSPARTIDO.length === 0 || PROFES_CON_POSPARTIDO.some(p => {
    const yo = sinTildesPP(nombreProfe);
    const el = sinTildesPP(p);
    return !!yo && (yo === el || yo.split(' ').includes(el));
  });
  if (vePospartido) {
    accesos.push({ titulo: 'Postpartido', icono: Trophy, href: '/postpartido', descripcion: 'Resultado y desempeño', color: 'verde' });
  }

  return (
    <div className="space-y-6">
      {/* Mis Grupos */}
      {grupos.length > 0 && (
        <div className="animate-fade-up">
          <div className="flex items-center gap-2 mb-3 pl-3 border-l-4 border-l-green-500">
            <span className="text-base">📋</span>
            <h2 className="font-black text-sm uppercase tracking-widest text-white">Mis Proyectos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {grupos.map((g) => (
              <button
                key={g}
                onClick={() => router.push(`/mis-proyectos`)}
                className="group rounded-2xl border p-4 text-left hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                style={{ background: PANEL, borderColor: BORDE }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 flex-shrink-0"
                    style={{ background: 'rgba(0,176,80,.16)', color: VERDE }}>
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm leading-tight truncate">{g}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">Asistencia · Calificación</p>
                  </div>
                  <Clipboard className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: GRIS_VACIO }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {grupos.length === 0 && (
        <div className="animate-fade-up bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-bold text-amber-800 text-sm">Sin grupos asignados</p>
            <p className="text-amber-600 text-xs mt-0.5">Pide al administrador que te asigne tus grupos en la sección de Usuarios.</p>
          </div>
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-2 mb-3 pl-3 border-l-4 border-l-blue-500">
          <span className="text-base">⚡</span>
          <h2 className="font-black text-sm uppercase tracking-widest text-blue-700">Accesos Rápidos</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {accesos.map((a) => <AccesoCard key={a.titulo} {...a} />)}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD PADRE / DEPORTISTA ─────────────────────────────────
function DashboardPadre() {
  const [depNombre, setDepNombre] = useState<string>('');

  useEffect(() => {
    try {
      const nombre = localStorage.getItem('futuro-calidoso-nombre') ?? '';
      setDepNombre(nombre);
    } catch {}
  }, []);

  const accesos = [
    { titulo: 'Formulario Afiliación', icono: ClipboardList, href: '/afiliacion',    descripcion: 'Actualiza tu ficha',          color: 'verde',  disabled: false },
    { titulo: 'Ver Evaluaciones',      icono: Star,          href: '/evaluaciones',  descripcion: 'Progreso técnico y formativo', color: 'verde', disabled: false },
    { titulo: 'Mis Pagos',            icono: DollarSign,    href: '/pagos',         descripcion: 'Estado de mensualidades',     color: 'verde',   disabled: false },
    { titulo: 'Calendario',           icono: Calendar,       href: '/calendario',    descripcion: 'Próximos entrenamientos',     color: 'verde',   disabled: false },
    { titulo: 'Informes',             icono: HardHat,        href: '/mantenimiento', descripcion: 'EN CONSTRUCCIÓN',             color: 'verde', disabled: false },
  ];
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#064e1e] to-[#16a34a] p-5 text-white shadow-lg animate-fade-up">
        <div className="absolute inset-0 pointer-events-none opacity-[0.06]">
          <svg className="w-full h-full"><defs><pattern id="sp-p" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#sp-p)"/></svg>
        </div>
        <p className="relative text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">Mi deportista</p>
        <p className="relative text-xl font-bold">{depNombre || '—'}</p>
        {depNombre && (
          <p className="relative text-white/70 text-sm mt-1">Bienvenido/a a tu espacio deportivo</p>
        )}
        <div className="relative grid grid-cols-3 gap-3 mt-4">
          {[{ v: '—', l: 'Asistencia' }, { v: '—', l: 'Nota técnica' }, { v: '—', l: 'Evaluaciones' }].map((s) => (
            <div key={s.l} className="bg-white/15 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{s.v}</p>
              <p className="text-white/70 text-[10px] mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-fade-up delay-100">
        {accesos.map((a) => <AccesoCard key={a.titulo} {...a} />)}
      </div>
    </div>
  );
}

// ── HEADER DEL DASHBOARD ─────────────────────────────────────────
function DashboardHeader({ usuario }: { usuario: any }) {
  const router = useRouter();

  function cerrarSesion() {
    useAuthStore.getState().logout()
      .then(() => router.push('/login'))
      .catch(() => { router.push('/login'); });
  }

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-[#333F50] to-[#0EA142] shadow-lg">
      {/* Patrón sutil */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.06]">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sp-hdr" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="11" fill="none" stroke="white" strokeWidth="1"/>
              <polygon points="24,18 29,22 27,28 21,28 19,22" fill="none" stroke="white" strokeWidth="0.8"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-hdr)"/>
        </svg>
      </div>

      <div className="relative flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 max-w-7xl mx-auto">
        {/* Logo + Marca */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center border border-white/30 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ESCUDO%20F.A%202020.png" alt="FA" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" />
          </div>
          <div>
            <p className="text-white font-black text-xs sm:text-sm tracking-wide leading-none">FUTURO ANTIOQUIA</p>
            <p className="text-white/50 text-[9px] sm:text-[10px] font-semibold tracking-widest uppercase leading-none mt-0.5">Max 10 Sport</p>
          </div>
        </div>

        {/* Eslogan centro — solo md+ */}
        <div className="hidden md:block text-center">
          <p className="text-white/80 text-xs font-bold tracking-widest uppercase">Conecta · Gestiona · Gana</p>
        </div>

        {/* Usuario + Salir */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-white font-bold text-sm leading-none">
              {usuario.nombre} {usuario.apellido}
            </p>
            <p className="text-white/50 text-[10px] capitalize leading-none mt-0.5">
              {usuario.rol?.replace('_', ' ')}
            </p>
          </div>
          {/* En móvil: mostrar nombre abreviado */}
          <div className="sm:hidden text-right">
            <p className="text-white font-bold text-xs leading-none">{usuario.nombre}</p>
            <p className="text-white/50 text-[9px] capitalize leading-none mt-0.5">{usuario.rol?.replace('_', ' ')}</p>
          </div>
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/20 rounded-lg flex items-center justify-center border border-white/20">
            <span className="text-white font-black text-xs">
              {usuario.nombre?.[0] ?? 'U'}
            </span>
          </div>
          <button
            onClick={cerrarSesion}
            className="flex items-center gap-1 sm:gap-1.5 text-white/70 hover:text-white hover:bg-white/15 transition-all text-xs font-semibold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ── BIENVENIDA ───────────────────────────────────────────────────
function WelcomeBar({ usuario }: { usuario: any }) {
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  let fecha = '';
  try {
    fecha = new Date().toLocaleDateString('es-CO', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    fecha = new Date().toLocaleDateString();
  }

  return (
    <div className="mb-5 animate-fade-up">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-white truncate">
            {saludo}, <span style={{ color: VERDE }}>{usuario.nombre}</span> 👋
          </h1>
          <p className="text-white/45 text-xs sm:text-sm mt-0.5 capitalize">{fecha}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 border rounded-xl px-3 py-1.5 shadow-sm flex-shrink-0"
          style={{ background: PANEL, borderColor: BORDE }}>
          <Zap className="w-3.5 h-3.5" style={{ color: VERDE }} />
          <span className="text-xs font-bold text-white/70 uppercase tracking-wide">Activa</span>
        </div>
      </div>
    </div>
  );
}

// ── ERROR BOUNDARY ────────────────────────────────────────────────
class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DashboardErrorBoundary] crash:', error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: LIENZO }}>
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-black text-red-600 mb-3">⚠️ Error en el Dashboard</h2>
            <pre className="bg-gray-100 rounded-lg p-3 text-xs overflow-auto mb-4 whitespace-pre-wrap break-all" style={{ maxHeight: 240 }}>
              {this.state.error.message}{'\n\n'}{this.state.error.stack}
            </pre>
            <p className="text-xs text-gray-500 mb-4">Toma captura y envíala al desarrollador.</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="w-full bg-green-600 text-white font-black py-3 rounded-xl text-base">
              🔄 Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────────
function DashboardInner() {
  const router = useRouter();
  const { usuario, cargando } = useAuthStore();
  const [montado,  setMontado]  = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* EL ROL MANDA DESDE LA COOKIE DEL SERVIDOR (dirección, 29/08/2026).
     Pasó de verdad: un formador entró y le apareció el tablero completo
     —Total Afiliados, Pagos, Programación—. La razón es que el tablero se
     guiaba por el rol guardado EN EL APARATO (queda pegado del último que
     entró en ese computador). La cookie la firma el servidor al entrar y no
     se puede cambiar desde el navegador: esa es la que vale. */
  const [rolCookie, setRolCookie] = useState<string | null>(null);
  useEffect(() => { setMontado(true); setRolCookie(getSesion() || ''); }, []);

  useEffect(() => {
    if (!montado) return;
    if (!usuario && !cargando) { router.replace('/login'); return; }
    // Calidosos (padre / deportista) NO tienen dashboard de módulos —
    // se redirigen directamente a su página de perfil (foto + botones).
    if (usuario && (usuario.rol === 'padre' || usuario.rol === 'deportista')) {
      try {
        const id = localStorage.getItem('futuro-calidoso-id');
        if (id) { router.replace(`/alumnos/${id}`); return; }
      } catch {}
      // Sin ID en localStorage → volver al login
      router.replace('/login');
    }
  }, [usuario, cargando, router, montado]);

  // Captura promesas rechazadas no manejadas — evita la pantalla de error de Next.js
  useEffect(() => {
    function onUnhandledRejection(ev: PromiseRejectionEvent) {
      const r = ev.reason;
      const msg = r?.message
        ? `${r.message}\n\n${r.stack ?? ''}`
        : String(r ?? 'Error desconocido');
      console.error('[dashboard] unhandledrejection:', r);
      setErrorMsg(msg);
      ev.preventDefault();
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  if (!montado || cargando || !usuario) return <LoadingBall />;

  const vistaPorRol: Record<string, JSX.Element> = {
    administracion: <DashboardAdmin />,
    total:          <DashboardAdmin />,   // acceso completo — 25/08/2026
    contable:       <DashboardAdmin />,
    contabilidad:   <DashboardAdmin />,
    deportivo:      <DashboardAdmin />,
    profesor:       <DashboardProfesor />,
    padre:          <DashboardPadre />,
    deportista:     <DashboardPadre />,
    visitante:      <DashboardPadre />,
  };

  /* La cookie del servidor manda; el rol del aparato solo se usa si la cookie
     no dice nada. Y si ninguno de los dos se entiende, se muestra el tablero
     del FORMADOR —el más pequeño—, nunca el de administración. */
  const rolMandado = (rolCookie === '1' ? 'administracion' : rolCookie) || '';
  const vista = vistaPorRol[rolMandado] ?? vistaPorRol[usuario.rol] ?? <DashboardProfesor />;

  return (
    <div className="min-h-screen" style={{ background: LIENZO }}>
      {/* Panel de error (Promise rejection) */}
      {errorMsg && (
        <div className="fixed inset-0 bg-black/70 z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full">
            <h2 className="text-xl font-black text-red-600 mb-3">⚠️ Error en el Dashboard</h2>
            <pre className="bg-gray-100 rounded-lg p-3 text-xs overflow-auto mb-4 whitespace-pre-wrap break-all" style={{ maxHeight: 220 }}>
              {errorMsg}
            </pre>
            <p className="text-xs text-gray-500 mb-4">Toma captura y envíala al desarrollador.</p>
            <button
              onClick={() => { setErrorMsg(null); window.location.reload(); }}
              className="w-full bg-green-600 text-white font-black py-3 rounded-xl text-base">
              🔄 Recargar
            </button>
          </div>
        </div>
      )}
      <DashboardHeader usuario={usuario} />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-7">
        <WelcomeBar usuario={usuario} />
        {vista}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardInner />
    </DashboardErrorBoundary>
  );
}
