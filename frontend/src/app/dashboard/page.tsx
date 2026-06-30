'use client';

/**
 * Dashboard Principal — Futuro Antioquia
 * Vista adaptativa por rol:
 *   - admin_academia / super_admin → KPIs generales
 *   - entrenador / coordinador    → categorías asignadas
 *   - padre                       → resumen de sus hijos
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, TrendingUp, DollarSign, Calendar,
  Star, MessageCircle, Clipboard, Activity, ClipboardList, UserPlus, LayoutList,
  Link2, Copy, Check, QrCode, BarChart3, Trophy, Upload, FolderKanban,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn, formatearMoneda } from '@/lib/utils';

// ── COMPONENTES ──────────────────────────────────────────────

function KpiCard({
  titulo, valor, subtitulo, icono: Icono, color,
}: {
  titulo: string;
  valor:  string | number;
  subtitulo?: string;
  icono: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icono className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{valor}</p>
        {subtitulo && <p className="text-xs text-gray-400 mt-0.5">{subtitulo}</p>}
      </div>
    </div>
  );
}

function AccesoRapido({ titulo, icono: Icono, href, descripcion }: {
  titulo: string; icono: React.ElementType; href: string; descripcion: string;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left hover:border-[#22c55e] hover:shadow-md transition-all group"
    >
      <div className="w-10 h-10 bg-[#f0fdf4] rounded-xl flex items-center justify-center mb-3 group-hover:bg-[#16a34a] transition-colors">
        <Icono className="w-5 h-5 text-[#16a34a] group-hover:text-white transition-colors" />
      </div>
      <p className="font-semibold text-gray-900 text-sm">{titulo}</p>
      <p className="text-xs text-gray-400 mt-1">{descripcion}</p>
    </button>
  );
}

// ── LINK DE INSCRIPCIÓN ──────────────────────────────────────
function LinkInscripcionCard() {
  const [url,     setUrl]     = useState('');
  const [copiado, setCopiado] = useState(false);
  const [verQr,   setVerQr]   = useState(false);

  useEffect(() => {
    setUrl(window.location.origin + '/afiliacion');
  }, []);

  function copiar() {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const qrSrc = url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    : '';

  return (
    <div className="bg-gradient-to-r from-[#064e1e] to-[#16a34a] rounded-2xl p-5 text-white shadow-md">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Link2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-black text-sm">Link de Inscripción 2026</p>
          <p className="text-white/60 text-xs">Comparte este enlace con los deportistas</p>
        </div>
      </div>

      {/* URL */}
      <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5 mb-3">
        <p className="flex-1 text-xs font-mono text-white/90 truncate">{url}</p>
        <button
          onClick={copiar}
          className="flex items-center gap-1.5 bg-white text-[#16a34a] font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-blue-50 transition flex-shrink-0">
          {copiado ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copiado ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>

      {/* QR toggle */}
      <button
        onClick={() => setVerQr(v => !v)}
        className="flex items-center gap-2 text-white/70 hover:text-white text-xs font-semibold transition">
        <QrCode className="w-4 h-4" />
        {verQr ? 'Ocultar código QR' : 'Ver código QR para imprimir / compartir'}
      </button>

      {verQr && qrSrc && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="bg-white p-3 rounded-2xl shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR Inscripción" width={180} height={180} />
          </div>
          <p className="text-white/60 text-[11px] text-center">
            Escanea con la cámara del celular para abrir el formulario
          </p>
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD POR ROL ────────────────────────────────────────

// ── DASHBOARD ADMINISTRACIÓN ─────────────────────────────────
function DashboardAdmin() {
  const accesos = [
    { titulo: 'Consolidado Afiliados',           icono: LayoutList,    href: '/general',                descripcion: 'Todos los deportistas'      },
    { titulo: 'Programas y Proyectos',          icono: Users,         href: '/alumnos',                descripcion: 'Ver y editar fichas'        },
    { titulo: 'Formulario De Afiliación',       icono: ClipboardList, href: '/afiliacion',             descripcion: 'Registro deportistas'       },
    { titulo: 'Asignación De Proyectos',        icono: UserPlus,      href: '/asignacion',             descripcion: 'Asignar nuevos deportistas' },
    { titulo: 'Disponibilidad, Sedes y Horarios', icono: ClipboardList, href: '/proyectos',            descripcion: 'Proyectos · Profe · Sede'   },
    { titulo: 'Valoración Deportiva',           icono: Star,          href: '/evaluaciones',           descripcion: 'Registrar evaluaciones'     },
    { titulo: 'Control de pagos',               icono: DollarSign,    href: '/pagos',                  descripcion: 'Cobros y cartera morosa'    },
    { titulo: 'Consolidado Valores',            icono: DollarSign,    href: '/vista-contable',         descripcion: 'Valores por deportista'     },
    { titulo: 'Subir Valores',                  icono: Upload,        href: '/pagos/importar-valores', descripcion: 'Cargar tarifas masivas'     },
    { titulo: 'Subir Bancos',                   icono: Upload,        href: '/subir-bancos',           descripcion: 'Cargar extracto y pagar'    },
    { titulo: 'Consolidado Bancos',             icono: DollarSign,    href: '/consolidado-bancos',     descripcion: 'Historial de pagos recibidos'},
    { titulo: 'Control De Asistencia',          icono: Clipboard,     href: '/asistencia',             descripcion: 'Registro por proyecto'      },
    { titulo: 'Consolidado asistencia',         icono: BarChart3,     href: '/consolidado',            descripcion: 'Feb–Dic por deportista'     },

    { titulo: 'Torneos y Estadísticas',         icono: Trophy,        href: '/torneos',                descripcion: 'Deportistas por competencia'},
    { titulo: 'Pagos por Proyecto',            icono: FolderKanban,  href: '/pagos-proyecto',         descripcion: 'Estado de cuenta por grupo' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-700 mb-3">Acceso rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {accesos.map((a) => <AccesoRapido key={a.titulo} {...a} />)}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD CONTABLE ───────────────────────────────────────
function DashboardContable() {
  const accesos = [
    { titulo: 'Subir Valores',        icono: Upload,        href: '/pagos/importar-valores', descripcion: 'Cargar tarifas masivas'     },
    { titulo: 'Registrar pago',      icono: DollarSign,    href: '/pagos/nuevo',   descripcion: 'Registrar pago manual'      },
    { titulo: 'Cartera morosa',      icono: TrendingUp,    href: '/pagos/mora',    descripcion: 'Ver alumnos en mora'        },
    { titulo: 'Reporte mensual',     icono: Activity,      href: '/reportes',      descripcion: 'Exportar informe financiero' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-700 mb-3">Módulo financiero</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {accesos.map((a) => <AccesoRapido key={a.titulo} {...a} />)}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD PROFESOR ───────────────────────────────────────
function DashboardProfesor() {
  const accesos = [
    { titulo: 'Pasar asistencia',   icono: Clipboard,     href: '/asistencia',   descripcion: 'Registrar asistencia hoy'   },
    { titulo: 'Evaluar alumnos',    icono: Star,           href: '/evaluaciones', descripcion: 'Técnico y formativo'        },
    { titulo: 'Mis alumnos',        icono: Users,          href: '/alumnos',      descripcion: 'Fichas y seguimiento'       },
    { titulo: 'Chat con padres',    icono: MessageCircle,  href: '/mensajes',     descripcion: 'Comunicación directa'       },

    { titulo: 'Calendario',         icono: Calendar,       href: '/calendario',   descripcion: 'Mis entrenamientos'         },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-700 mb-3">Mi panel</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {accesos.map((a) => <AccesoRapido key={a.titulo} {...a} />)}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD PADRE ──────────────────────────────────────────
function DashboardPadre() {
  return (
    <div className="space-y-4">
      <div className="relative bg-gradient-to-r from-[#064e1e] to-[#22c55e] rounded-2xl p-5 text-white overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          <svg className="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="sp-dp" x="0" y="0" width="72" height="72" patternUnits="userSpaceOnUse">
                <circle cx="36" cy="36" r="18" fill="none" stroke="white" strokeWidth="1.2"/>
                <polygon points="36,28 43,33 41,42 31,42 29,33" fill="none" stroke="white" strokeWidth="1.2"/>
                <line x1="36" y1="28" x2="36" y2="18" stroke="white" strokeWidth="0.8"/>
                <line x1="43" y1="33" x2="52" y2="30" stroke="white" strokeWidth="0.8"/>
                <line x1="41" y1="42" x2="47" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="31" y1="42" x2="25" y2="50" stroke="white" strokeWidth="0.8"/>
                <line x1="29" y1="33" x2="20" y2="30" stroke="white" strokeWidth="0.8"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sp-dp)"/>
          </svg>
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-20 h-20 opacity-[0.1]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="3"/>
            <polygon points="50,24 70,38 62,62 38,62 30,38" fill="none" stroke="white" strokeWidth="3"/>
          </svg>
        </div>
        <p className="relative text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">Mi deportista</p>
        <p className="relative text-xl font-bold">Pendiente de registro</p>
        <p className="relative text-white/80 text-sm">Los datos aparecerán una vez se importe la lista</p>
        <div className="relative grid grid-cols-3 gap-3 mt-4">
          {[
            { v: '—', l: 'Asistencia' },
            { v: '—', l: 'Nota técnica' },
            { v: '—', l: 'Evaluaciones' },
          ].map((s) => (
            <div key={s.l} className="bg-white/15 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{s.v}</p>
              <p className="text-white/70 text-[10px] mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AccesoRapido titulo="Formulario afiliación" icono={ClipboardList} href="/afiliacion"    descripcion="Actualiza tu ficha"          />
        <AccesoRapido titulo="Ver evaluaciones"      icono={Star}          href="/evaluaciones"  descripcion="Progreso técnico y formativo" />
        <AccesoRapido titulo="Mis pagos"             icono={DollarSign}    href="/pagos"         descripcion="Estado de mensualidades"     />
        <AccesoRapido titulo="Calendario"            icono={Calendar}      href="/calendario"    descripcion="Próximos entrenamientos"     />
        <AccesoRapido titulo="Chat profesor"         icono={MessageCircle} href="/mensajes"      descripcion="Comunícate directamente"     />
      </div>
    </div>
  );
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { usuario, cargando, cargarPerfil } = useAuthStore();

  useEffect(() => {
    // Si no hay usuario, cargar demo por defecto (modo sin login)
    if (!usuario && !cargando) {
      useAuthStore.setState({
        usuario: {
          id:       'demo-admin',
          email:    'admin@futuroantioquia.com',
          nombre:   'Hernán',
          apellido: 'Marulanda',
          rol:      'administracion',
          activo:   true,
          academia: { id: '1', nombre: 'Futuro Antioquia' },
        },
        cargando: false,
      });
    }
  }, []);

  if (cargando || !usuario) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  const vistaPorRol: Record<string, JSX.Element> = {
    administracion: <DashboardAdmin />,
    contable:       <DashboardContable />,
    profesor:       <DashboardProfesor />,
    padre:          <DashboardPadre />,
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-gradient-to-r from-[#064e1e] to-[#22c55e] px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">FA</span>
          </div>
          <span className="font-bold text-white">Futuro Antioquia</span>
          {usuario.academia && (
            <span className="hidden sm:inline text-white/70 text-sm">
              · {usuario.academia.nombre}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight hidden sm:block border-r border-gray-200 pr-4">
            <p className="font-black text-white text-sm tracking-widest">MAX 10 SPORT</p>
            <p className="text-white/60 text-[11px]">Conecta, Gestiona, Gana</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-white">
              {usuario.nombre} {usuario.apellido}
            </p>
            <p className="text-xs text-white/60 capitalize">{usuario.rol.replace('_', ' ')}</p>
          </div>
          <button
            onClick={() => useAuthStore.getState().logout().then(() => router.push('/login'))}
            className="text-xs text-white/70 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-white/20"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Buenos días, {usuario.nombre} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('es-CO', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        {vistaPorRol[usuario.rol] ?? <DashboardAdmin />}
      </main>
    </div>
  );
}
