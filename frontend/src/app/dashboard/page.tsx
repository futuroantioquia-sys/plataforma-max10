'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, DollarSign, Calendar,
  Star, MessageCircle, Clipboard, Activity, ClipboardList, UserPlus, LayoutList,
  Link2, Copy, Check, QrCode, BarChart3, Trophy, Upload, FolderKanban,
  LogOut, Zap, Shield, Dumbbell,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import LoadingBall from '@/components/LoadingBall';
import { getDeportistas } from '@/lib/db';

// ── CARD DE ACCESO RÁPIDO ────────────────────────────────────────
function AccesoCard({
  titulo, icono: Icono, href, descripcion, color = 'verde', badge,
}: {
  titulo: string; icono: React.ElementType; href: string; descripcion: string; color?: string; badge?: number;
}) {
  const router = useRouter();

  const colorMap: Record<string, { icon: string; border: string; text: string }> = {
    verde:  { icon: 'bg-green-100 text-green-700 group-hover:bg-[#16a34a] group-hover:text-white', border: 'hover:border-green-300',  text: 'group-hover:text-[#16a34a]' },
    azul:   { icon: 'bg-blue-100  text-blue-700  group-hover:bg-blue-600   group-hover:text-white', border: 'hover:border-blue-300',   text: 'group-hover:text-blue-600'  },
    dorado: { icon: 'bg-amber-100 text-amber-700 group-hover:bg-amber-500  group-hover:text-white', border: 'hover:border-amber-300', text: 'group-hover:text-amber-600' },
    purple: { icon: 'bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white', border: 'hover:border-purple-300', text: 'group-hover:text-purple-600' },
    teal:   { icon: 'bg-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white', border: 'hover:border-teal-300', text: 'group-hover:text-teal-600' },
  };

  const c = colorMap[color] ?? colorMap.verde;

  return (
    <button
      onClick={() => router.push(href)}
      className={cn(
        'group relative bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-3 sm:p-4 text-left',
        'transition-all duration-200',
        'hover:-translate-y-1 hover:shadow-lg',
        c.border,
      )}
    >
      {badge != null && badge > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow-md z-10">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <div className={cn(
        'w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3 transition-all duration-200',
        c.icon,
      )}>
        <Icono className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <p className={cn('font-bold text-gray-800 text-xs sm:text-sm leading-tight transition-colors', c.text)}>
        {titulo}
      </p>
      <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 sm:mt-1 leading-tight">{descripcion}</p>
    </button>
  );
}

// ── SECCIÓN DE CATEGORÍA ─────────────────────────────────────────
function CategoriaSection({
  emoji, titulo, color, children, delay = 0,
}: {
  emoji: string; titulo: string; color: string; children: React.ReactNode; delay?: number;
}) {
  const borderColors: Record<string, string> = {
    verde:  'border-l-green-500',
    azul:   'border-l-blue-500',
    dorado: 'border-l-amber-500',
    purple: 'border-l-purple-500',
    teal:   'border-l-teal-500',
  };
  const textColors: Record<string, string> = {
    verde:  'text-green-700',
    azul:   'text-blue-700',
    dorado: 'text-amber-700',
    purple: 'text-purple-700',
    teal:   'text-teal-700',
  };

  return (
    <div
      className="animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn(
        'flex items-center gap-2 mb-3 pl-3 border-l-4',
        borderColors[color] ?? 'border-l-gray-300',
      )}>
        <span className="text-base">{emoji}</span>
        <h2 className={cn('font-black text-sm uppercase tracking-widest', textColors[color] ?? 'text-gray-600')}>
          {titulo}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2 sm:gap-3">
        {children}
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
    });
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
function DashboardAdmin() {
  const [pendientesAsign, setPendientesAsign] = useState(0);

  useEffect(() => {
    getDeportistas().then(lista => {
      const count = lista.filter(d => {
        const proy = (Object.entries(d._columnas).find(([k]) => /^proy/i.test(k.trim()))?.[1] ?? '').trim().toUpperCase();
        return !proy || proy === 'UBICAR';
      }).length;
      setPendientesAsign(count);
    }).catch(() => {});
  }, []);

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Categoría: Deportistas */}
      <CategoriaSection emoji="🏃" titulo="Deportistas" color="verde" delay={100}>
        <AccesoCard titulo="Consolidado Afiliados"   icono={LayoutList}    href="/general"      descripcion="Todos los deportistas"       color="verde" />
        <AccesoCard titulo="Programas y Proyectos"   icono={Users}         href="/alumnos"      descripcion="Ver y editar fichas"         color="verde" />
        <AccesoCard titulo="Formulario de Afiliación" icono={ClipboardList} href="/afiliacion"  descripcion="Registro de deportistas"     color="verde" />
        <AccesoCard titulo="Asignación de Proyectos" icono={UserPlus}      href="/asignacion"   descripcion="Asignar nuevos deportistas"  color="verde" badge={pendientesAsign} />
      </CategoriaSection>

      <div className="divider-fade" />

      {/* Categoría: Finanzas */}
      <CategoriaSection emoji="💰" titulo="Finanzas" color="azul" delay={200}>
        <AccesoCard titulo="Control de Pagos"      icono={DollarSign}   href="/pagos"                   descripcion="Cobros y cartera morosa"       color="azul" />
        <AccesoCard titulo="Subir Libro Contable"  icono={Upload}       href="/pagos/importar-valores"  descripcion="Importar Libro Contable"       color="azul" />
      </CategoriaSection>

      <div className="divider-fade" />

      {/* Categoría: Seguimiento */}
      <CategoriaSection emoji="📊" titulo="Seguimiento" color="purple" delay={300}>
        <AccesoCard titulo="Control de Asistencia"  icono={Clipboard}  href="/asistencia"   descripcion="Registro por proyecto"       color="purple" />
        <AccesoCard titulo="Consolidado Asistencia" icono={Activity}   href="/consolidado"  descripcion="Feb–Dic por deportista"      color="purple" />
        <AccesoCard titulo="Valoración Deportiva"   icono={Star}       href="/evaluaciones" descripcion="Registrar evaluaciones"      color="purple" />
        <AccesoCard titulo="Sesiones de Entrenamiento" icono={Dumbbell} href="/sesiones"    descripcion="Objetivo y ejercicios por sesión" color="purple" />
        <AccesoCard titulo="Postpartido"            icono={Trophy}     href="/postpartido"  descripcion="Resultado y desempeño individual" color="purple" />
        <AccesoCard titulo="Torneos y Estadísticas" icono={Trophy}     href="/torneos"      descripcion="Deportistas por competencia" color="purple" />
      </CategoriaSection>

      <div className="divider-fade" />

      {/* Categoría: Gestión */}
      <CategoriaSection emoji="⚙️" titulo="Gestión" color="teal" delay={400}>
        <AccesoCard titulo="Info Proyectos y Formadores" icono={Shield} href="/usuarios" descripcion="Profes, sedes y proyectos" color="teal" />
        <AccesoCard titulo="Mensajes"            icono={MessageCircle} href="/mensajes"  descripcion="Comunicación con padres"    color="teal" />
      </CategoriaSection>

      <div className="divider-fade" />

      {/* Link inscripción */}
      <LinkInscripcionCard />
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
    { titulo: 'Evaluar Alumnos',  icono: Star,          href: '/evaluaciones', descripcion: 'Técnico y formativo',        color: 'dorado' },
    { titulo: 'Mis Alumnos',     icono: Users,          href: '/alumnos',      descripcion: 'Fichas y seguimiento',       color: 'azul'   },
    { titulo: 'Sesiones',        icono: Dumbbell,       href: '/sesiones',     descripcion: 'Planes de entrenamiento',    color: 'purple' },
    { titulo: 'Postpartido',     icono: Trophy,         href: '/postpartido',  descripcion: 'Resultado y desempeño',      color: 'teal'   },
  ];

  return (
    <div className="space-y-6">
      {/* Mis Grupos */}
      {grupos.length > 0 && (
        <div className="animate-fade-up">
          <div className="flex items-center gap-2 mb-3 pl-3 border-l-4 border-l-green-500">
            <span className="text-base">📋</span>
            <h2 className="font-black text-sm uppercase tracking-widest text-green-700">Mis Proyectos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {grupos.map((g) => (
              <button
                key={g}
                onClick={() => router.push(`/mis-proyectos`)}
                className="group bg-white rounded-2xl border border-gray-100 p-4 text-left
                           hover:border-green-300 hover:-translate-y-1 hover:shadow-lg
                           transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700
                                  group-hover:bg-[#16a34a] group-hover:text-white
                                  flex items-center justify-center transition-all duration-200 flex-shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 text-sm leading-tight truncate
                                  group-hover:text-[#16a34a] transition-colors">{g}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Asistencia · Calificación</p>
                  </div>
                  <Clipboard className="w-4 h-4 text-gray-300 group-hover:text-green-500 ml-auto flex-shrink-0 transition-colors" />
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
  const accesos = [
    { titulo: 'Formulario Afiliación', icono: ClipboardList,  href: '/afiliacion',   descripcion: 'Actualiza tu ficha',           color: 'verde'  },
    { titulo: 'Ver Evaluaciones',      icono: Star,           href: '/evaluaciones', descripcion: 'Progreso técnico y formativo',  color: 'dorado' },
    { titulo: 'Mis Pagos',            icono: DollarSign,     href: '/pagos',        descripcion: 'Estado de mensualidades',      color: 'azul'   },
    { titulo: 'Calendario',           icono: Calendar,        href: '/calendario',   descripcion: 'Próximos entrenamientos',      color: 'teal'   },
    { titulo: 'Chat Profesor',        icono: MessageCircle,   href: '/mensajes',     descripcion: 'Comunícate directamente',      color: 'purple' },
  ];
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#064e1e] to-[#16a34a] p-5 text-white shadow-lg animate-fade-up">
        <div className="absolute inset-0 pointer-events-none opacity-[0.06]">
          <svg className="w-full h-full"><defs><pattern id="sp-p" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse"><circle cx="30" cy="30" r="14" fill="none" stroke="white" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#sp-p)"/></svg>
        </div>
        <p className="relative text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">Mi deportista</p>
        <p className="relative text-xl font-bold">Pendiente de registro</p>
        <p className="relative text-white/70 text-sm mt-1">Los datos aparecerán una vez se importe la lista</p>
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
    useAuthStore.getState().logout().then(() => router.push('/login'));
  }

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-[#064e1e] via-[#0a6628] to-[#16a34a] shadow-lg">
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
            <span className="text-white font-black text-xs sm:text-sm">FA</span>
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
  const fecha = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="mb-5 animate-fade-up">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 truncate">
            {saludo}, <span className="text-[#16a34a]">{usuario.nombre}</span> 👋
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5 capitalize">{fecha}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-1.5 shadow-sm flex-shrink-0">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Activa</span>
        </div>
      </div>
    </div>
  );
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { usuario, cargando } = useAuthStore();
  const [montado, setMontado] = useState(false);

  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    if (!montado) return;
    if (!usuario && !cargando) router.replace('/login');
  }, [usuario, cargando, router, montado]);

  if (!montado || cargando || !usuario) return <LoadingBall />;

  const vistaPorRol: Record<string, JSX.Element> = {
    administracion: <DashboardAdmin />,
    contable:       <DashboardAdmin />,
    profesor:       <DashboardProfesor />,
    padre:          <DashboardPadre />,
    deportista:     <DashboardPadre />,
    visitante:      <DashboardPadre />,
  };

  return (
    <div className="min-h-screen bg-[#f0f7ff]">
      <DashboardHeader usuario={usuario} />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-7">
        <WelcomeBar usuario={usuario} />
        {vistaPorRol[usuario.rol] ?? <DashboardAdmin />}
      </main>
    </div>
  );
}
