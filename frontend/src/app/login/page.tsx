'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ── Usuarios demo (sin Supabase) ────────────────────────────
const DEMO_USERS = [
  { email: 'admin@futuroantioquia.com',       password: 'demo1234', rol: 'administracion', nombre: 'Hernán',   apellido: 'Marulanda' },
  { email: 'profesor@futuroantioquia.com',    password: 'demo1234', rol: 'profesor',       nombre: 'Andrés',   apellido: 'Tobón'    },
  { email: 'deportista@futuroantioquia.com',  password: 'demo1234', rol: 'deportista',     nombre: 'Carlos',   apellido: 'Pérez'    },
  { email: 'visitante@futuroantioquia.com',   password: 'demo1234', rol: 'visitante',      nombre: 'María',    apellido: 'Gómez'    },
  { email: 'contable@futuroantioquia.com',    password: 'demo1234', rol: 'contable',       nombre: 'Lucía',    apellido: 'García'   },
  { email: 'padre@futuroantioquia.com',       password: 'demo1234', rol: 'padre',          nombre: 'Jorge',    apellido: 'López'    },
] as const;

const ROL_COLOR: Record<string, string> = {
  administracion: 'bg-[#dbeafe] text-[#1e3a8a]',
  profesor:       'bg-blue-100  text-blue-700',
  deportista:     'bg-green-100 text-green-700',
  visitante:      'bg-gray-100  text-gray-700',
  contable:       'bg-[#dbeafe] text-[#1e3a8a]',
  padre:          'bg-yellow-100 text-yellow-700',
};

export default function LoginPage() {
  const router = useRouter();
  const { login, cargando, error, limpiarError } = useAuthStore();

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    limpiarError();

    // ── Acceso demo sin Supabase ──────────────────────────────
    const demoUser = DEMO_USERS.find(
      (u) => u.email === email.trim() && u.password === password
    );
    if (demoUser) {
      useAuthStore.setState({
        usuario: {
          id:       'demo-' + demoUser.rol,
          email:    demoUser.email,
          nombre:   demoUser.nombre,
          apellido: demoUser.apellido,
          rol:      demoUser.rol as any,
          activo:   true,
          academia: { id: '1', nombre: 'Futuro Antioquia' },
        },
        cargando: false,
        error:    null,
      });
      // Establecer cookie de sesión para el middleware
      document.cookie = 'futuro-session=1; path=/; max-age=86400; SameSite=Lax';
      router.push('/dashboard');
      return;
    }

    // ── Login real con Supabase ───────────────────────────────
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {}
  }

  function entrarDemo(u: typeof DEMO_USERS[number]) {
    setEmail(u.email);
    setPassword(u.password);
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#064e1e] to-[#22c55e] flex items-center justify-center p-4 overflow-hidden">
      {/* Patrón de balones */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sp-login" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <circle cx="50" cy="50" r="26" fill="none" stroke="white" strokeWidth="1.5"/>
              <polygon points="50,40 60,47 56,58 44,58 40,47" fill="none" stroke="white" strokeWidth="1.5"/>
              <line x1="50" y1="40" x2="50" y2="24" stroke="white" strokeWidth="1"/>
              <line x1="60" y1="47" x2="73" y2="43" stroke="white" strokeWidth="1"/>
              <line x1="56" y1="58" x2="64" y2="69" stroke="white" strokeWidth="1"/>
              <line x1="44" y1="58" x2="36" y2="69" stroke="white" strokeWidth="1"/>
              <line x1="40" y1="47" x2="27" y2="43" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-login)"/>
        </svg>
        {/* Balón grande esquina inferior derecha */}
        <svg className="absolute -bottom-24 -right-24 w-80 h-80 opacity-[0.07]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="2"/>
          <polygon points="50,22 72,38 63,64 37,64 28,38" fill="none" stroke="white" strokeWidth="2"/>
          <line x1="50" y1="22" x2="50" y2="2" stroke="white" strokeWidth="1.5"/>
          <line x1="72" y1="38" x2="90" y2="30" stroke="white" strokeWidth="1.5"/>
          <line x1="63" y1="64" x2="78" y2="82" stroke="white" strokeWidth="1.5"/>
          <line x1="37" y1="64" x2="22" y2="82" stroke="white" strokeWidth="1.5"/>
          <line x1="28" y1="38" x2="10" y2="30" stroke="white" strokeWidth="1.5"/>
        </svg>
        {/* Arco de cancha superior izquierda */}
        <svg className="absolute -top-10 -left-10 w-56 h-56 opacity-[0.07]" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="0" cy="0" r="80" fill="none" stroke="white" strokeWidth="2"/>
          <circle cx="0" cy="0" r="40" fill="none" stroke="white" strokeWidth="1.5"/>
        </svg>
      </div>
      <div className="relative w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-xl mb-4">
            <Shield className="w-8 h-8 text-[#16a34a]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Futuro Antioquia</h1>
          <p className="text-white/70 text-sm mt-1">Plataforma de Gestión Deportiva</p>
        </div>

        {/* Tarjeta */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Inicia sesión</h2>
          <p className="text-sm text-gray-400 mb-6">Ingresa con tu correo y contraseña</p>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="tu@email.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-[#22c55e] focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={mostrarPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-[#22c55e] focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPass(!mostrarPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrarPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className={cn(
                'w-full py-3.5 rounded-xl font-bold text-white text-sm transition',
                'bg-gradient-to-r from-[#064e1e] to-[#22c55e]',
                'shadow-lg shadow-green-900/30',
                'hover:from-[#0a2e14] hover:to-[#16a34a]',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {cargando ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Iniciando sesión...</>
              ) : 'Entrar'}
            </button>

          </form>

          {/* Acceso rápido demo */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-xs font-semibold text-gray-400 mb-3">Acceso rápido — modo demo</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.rol}
                  type="button"
                  onClick={() => entrarDemo(u)}
                  className={cn(
                    'text-[11px] px-3 py-2 rounded-xl font-semibold text-left transition hover:opacity-80',
                    ROL_COLOR[u.rol]
                  )}
                >
                  <span className="block capitalize">{u.rol}</span>
                  <span className="block font-normal opacity-70">{u.nombre} {u.apellido}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              Contraseña: <span className="font-mono font-bold">demo1234</span>
            </p>
          </div>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          © 2026 Futuro Antioquia · Medellín, Colombia
        </p>
      </div>
    </div>
  );
}
