'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Shield, AlertCircle, Loader2, Users, Star, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { getProfes, getVistaContable, buscarPorCodigo } from '@/lib/db';

type Tab = 'admin' | 'profe' | 'calidoso' | 'nuevo';

export default function LoginPage() {
  const router  = useRouter();
  const { cargando } = useAuthStore();

  const [tab,         setTab]         = useState<Tab>('admin');
  const [usuario,     setUsuario]     = useState('');
  const [clave,       setClave]       = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [errLocal,    setErrLocal]    = useState('');
  const [enviando,    setEnviando]    = useState(false);

  function cambiarTab(t: Tab) {
    setTab(t);
    setUsuario('');
    setClave('');
    setErrLocal('');
    setMostrarPass(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrLocal('');
    setEnviando(true);

    const u = usuario.trim().toUpperCase();
    const c = clave.trim();

    try {
      /* ── ADMINISTRADOR ─── */
      if (tab === 'admin') {
        if (u === 'ADMON' && c === '34') {
          try {
            localStorage.removeItem('futuro-profe-proyectos');
            localStorage.removeItem('futuro-profe-nombre');
          } catch {}
          useAuthStore.setState({
            usuario: {
              id: 'admin-1', email: 'admin@futuroantioquia.com',
              nombre: 'Administrador', apellido: '',
              rol: 'administracion' as any, activo: true,
              academia: { id: '1', nombre: 'Futuro Antioquia' },
            },
            cargando: false, error: null,
          });
          document.cookie = 'futuro-session=1; path=/; max-age=86400; SameSite=Lax';
          router.push('/dashboard');
        } else {
          setErrLocal('Usuario o contraseña incorrectos');
        }
        return;
      }

      /* ── PROFE ─── */
      if (tab === 'profe') {
        const listaProfes = await getProfes();
        const profe = listaProfes.find(p => p.usuario.toUpperCase() === u && p.clave === c);
        if (profe) {
          useAuthStore.setState({
            usuario: {
              id: 'profe-' + profe.usuario,
              email: profe.usuario.toLowerCase() + '@futuroantioquia.com',
              nombre: profe.usuario, apellido: '',
              rol: 'profesor' as any, activo: true,
              academia: { id: '1', nombre: 'Futuro Antioquia' },
            },
            cargando: false, error: null,
          });
          document.cookie = 'futuro-session=profesor; path=/; max-age=86400; SameSite=Lax';
          try {
            localStorage.setItem('futuro-profe-proyectos', JSON.stringify(profe.proyectos));
            localStorage.setItem('futuro-profe-nombre',    JSON.stringify(profe.usuario));
            // Foto: primero desde Supabase, luego desde localStorage del dispositivo
            const fotoNube  = profe.foto ?? '';
            const fotoLocal = localStorage.getItem(`futuro-foto-profe-${profe.usuario.toUpperCase()}`) ?? '';
            const foto = fotoNube || fotoLocal;
            if (foto) {
              localStorage.setItem('futuro-profe-foto', foto);
              localStorage.setItem(`futuro-foto-profe-${profe.usuario.toUpperCase()}`, foto);
            } else {
              localStorage.removeItem('futuro-profe-foto');
            }
          } catch {}
          router.push('/mis-proyectos');
        } else {
          setErrLocal('Usuario o contraseña incorrectos');
        }
        return;
      }

      /* ── CALIDOSO ─── */
      if (tab === 'calidoso') {
        // FIX Bug E: normDoc ahora también:
        //   • elimina NBSP ( ) que Excel introduce en algunos campos
        //   • convierte a MAYÚSCULAS → comparación case-insensitive
        const normDoc = (v: string) =>
          v.replace(/[\s .,\-]/g, '').toUpperCase();

        const cNorm  = normDoc(c);
        const RX_DOC = /num.*doc|^doc|doc|c[eé]dul|c\.c|identif|nit|no.*doc|cc\b/i;

        function sesionDeportista(dep: { id: string; _nombre?: string } | undefined) {
          document.cookie = 'futuro-session=deportista; path=/; max-age=86400; SameSite=Lax';
          try {
            if (dep?.id)      localStorage.setItem('futuro-calidoso-id',     dep.id);
            if (dep?._nombre) localStorage.setItem('futuro-calidoso-nombre', dep._nombre);
            // Guardar credenciales → próximos ingresos son instantáneos sin red
            const credsRaw = localStorage.getItem('futuro_calidoso_credenciales');
            const creds: Record<string, string> = credsRaw ? JSON.parse(credsRaw) : {};
            creds[u] = c.trim();
            localStorage.setItem('futuro_calidoso_credenciales', JSON.stringify(creds));
          } catch {}
          useAuthStore.setState({
            usuario: {
              id:       dep?.id ?? 'calidoso-' + u,
              email:    u.toLowerCase() + '@calidoso.com',
              nombre:   dep?._nombre ?? u,
              apellido: '',
              rol:      'padre' as any,
              activo:   true,
              academia: { id: '1', nombre: 'Futuro Antioquia' },
            },
            cargando: false, error: null,
          });
          router.push(dep?.id ? `/alumnos/${dep.id}` : '/alumnos');
        }

        // ── 1. Caché de credenciales — acceso instantáneo sin red ──
        try {
          const rawCred = localStorage.getItem('futuro_calidoso_credenciales');
          if (rawCred) {
            const creds: Record<string, string> = JSON.parse(rawCred);
            const docGuardado = creds[u] ?? '';
            if (docGuardado && normDoc(docGuardado) === cNorm) {
              // Buscamos solo este deportista (1 fila en Supabase)
              const candidatos = await buscarPorCodigo(u);
              const dep = candidatos[0];
              sesionDeportista(dep);
              return;
            }
          }
        } catch {}

        // ── 2. Búsqueda rápida por código (1 query, no 1.139 filas) ──
        const candidatos = await buscarPorCodigo(u);

        // Logging de diagnóstico — visible en DevTools → Console del navegador
        console.log('[login:calidoso] código:', u, '| candidatos encontrados:', candidatos.length);
        if (candidatos.length > 0) {
          const colKeys = Object.keys(candidatos[0]._columnas ?? {});
          console.log('[login:calidoso] columnas keys:', colKeys.join(' | '));
        } else {
          console.warn('[login:calidoso] buscarPorCodigo devolvió 0 resultados — RPC o SDK fallaron');
        }

        // Helper: encontrar la clave de número de documento del deportista.
        // Excluye: "TIPO DE DOCUMENTO" (es RC/CC/TI, no el número)
        //          claves con "ACUD" (son del acudiente/padre, no del deportista)
        function findDocKey(cols: Record<string, string>): string | undefined {
          return Object.keys(cols).find(k => {
            const kn = k.trim().normalize('NFC');
            if (/tipo/i.test(kn) || /acud/i.test(kn)) return false;
            return RX_DOC.test(kn) &&
              cols[k] != null &&
              String(cols[k]).trim() !== '';
          });
        }

        const dep = candidatos.find(d => {
          const cols   = d._columnas ?? {};
          const docKey = findDocKey(cols);
          // FIX Bug E: normDoc aplica a AMBOS lados → case-insensitive + sin separadores
          const docAlmacenado = docKey ? normDoc(String(cols[docKey])) : '';
          return docAlmacenado === cNorm;
        });

        // Log post-find sin PII — solo indica si hubo coincidencia y cuál clave usó
        const logDocKey = candidatos[0] ? (findDocKey(candidatos[0]._columnas ?? {}) ?? 'ninguna') : 'N/A';
        console.log('[login:calidoso] resultado:', dep ? 'OK ✓' : 'sin coincidencia',
          '| docKey usado:', logDocKey);

        if (dep) {
          sesionDeportista(dep);
          return;
        }

        // ── 3. Fallback: vista contable ──
        let vcData: Record<string, string>[] = [];
        try {
          const raw = localStorage.getItem('futuro_vista_contable');
          if (raw) vcData = JSON.parse(raw);
        } catch {}
        if (!vcData.length) vcData = await getVistaContable();

        const vcRow = vcData.find(fila => {
          const cod = String(fila.codigo ?? '').trim().toUpperCase();
          const doc = normDoc(String(fila.documento ?? '').trim());
          return cod === u && doc === cNorm;
        });

        if (vcRow) {
          // Usar candidatos ya cargados (sin re-fetch)
          const depVC = candidatos[0];
          sesionDeportista(depVC ?? { id: '', _nombre: vcRow.nombre ?? u });
          return;
        }

        // Log final para diagnóstico (visible en DevTools)
        console.error('[login:calidoso] Login fallido. Código:', u,
          '| candidatos:', candidatos.length,
          '| vcData filas:', vcData.length,
          '| cNorm:', cNorm);

        setErrLocal('Código o documento incorrecto');
        return;
      }

      /* ── NUEVO DEPORTISTA ─── */
      if (tab === 'nuevo') {
        if (c === '26') {
          try { sessionStorage.setItem('afiliacion_modo', 'nuevo'); } catch {}
          router.push('/afiliacion');
        } else {
          setErrLocal('Código incorrecto. Solicita el código al administrador.');
        }
        return;
      }
    } finally {
      setEnviando(false);
    }
  }

  const config = {
    admin: {
      titulo:       'Administrador',
      labelUser:    'Usuario',
      placeholderU: 'ADMON',
      labelClave:   'Contraseña',
      placeholderC: '••••',
      grad:         'from-[#064e1e] to-[#22c55e]',
      ring:         'focus:border-green-400',
      tabActive:    'text-[#064e1e]',
    },
    profe: {
      titulo:       'Profesor',
      labelUser:    'Usuario',
      placeholderU: 'Ej: CASTRO',
      labelClave:   'Contraseña (cédula)',
      placeholderC: 'Tu número de cédula',
      grad:         'from-[#1e3a8a] to-[#3b82f6]',
      ring:         'focus:border-blue-400',
      tabActive:    'text-[#1e3a8a]',
    },
    calidoso: {
      titulo:       'Calidoso',
      labelUser:    'Código',
      placeholderU: 'Tu código de deportista',
      labelClave:   'Documento de identidad',
      placeholderC: 'Tu número de documento',
      grad:         'from-[#92400e] to-[#f97316]',
      ring:         'focus:border-orange-400',
      tabActive:    'text-[#9a3412]',
    },
    nuevo: {
      titulo:       'Nuevo Deportista',
      labelUser:    '',
      placeholderU: '',
      labelClave:   'Código de Acceso',
      placeholderC: 'Ingresa el código',
      grad:         'from-[#7c3aed] to-[#a855f7]',
      ring:         'focus:border-purple-400',
      tabActive:    'text-[#7c3aed]',
    },
  };

  const cfg     = config[tab];
  const ocupado = enviando || cargando;

  /* Gradiente de fondo según tab */
  const fondoMap: Record<Tab, string> = {
    admin:    'from-[#064e1e] via-[#0a6628] to-[#22c55e]',
    profe:    'from-[#0f172a] via-[#1e3a8a] to-[#3b82f6]',
    calidoso: 'from-[#431407] via-[#92400e] to-[#f97316]',
    nuevo:    'from-[#2e1065] via-[#7c3aed] to-[#a855f7]',
  };

  return (
    <div className={cn(
      'relative min-h-screen bg-gradient-to-br flex items-center justify-center p-4 overflow-hidden transition-all duration-500',
      fondoMap[tab],
    )}>
      {/* Patrón de balones */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sp-login" x="0" y="0" width="90" height="90" patternUnits="userSpaceOnUse">
              <circle cx="45" cy="45" r="22" fill="none" stroke="white" strokeWidth="1.2"/>
              <polygon points="45,35 54,41 51,52 39,52 36,41" fill="none" stroke="white" strokeWidth="1.2"/>
              <line x1="45" y1="35" x2="45" y2="23" stroke="white" strokeWidth="0.7"/>
              <line x1="54" y1="41" x2="66" y2="37" stroke="white" strokeWidth="0.7"/>
              <line x1="51" y1="52" x2="58" y2="63" stroke="white" strokeWidth="0.7"/>
              <line x1="39" y1="52" x2="32" y2="63" stroke="white" strokeWidth="0.7"/>
              <line x1="36" y1="41" x2="24" y2="37" stroke="white" strokeWidth="0.7"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-login)"/>
        </svg>
        {/* Balón grande decorativo */}
        <svg className="absolute -bottom-16 -right-16 w-72 h-72 opacity-[0.06]" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="2"/>
          <polygon points="50,22 72,38 63,64 37,64 28,38" fill="none" stroke="white" strokeWidth="2"/>
          <line x1="50" y1="22" x2="50" y2="4"   stroke="white" strokeWidth="1.5"/>
          <line x1="72" y1="38" x2="89" y2="29"  stroke="white" strokeWidth="1.5"/>
          <line x1="63" y1="64" x2="77" y2="81"  stroke="white" strokeWidth="1.5"/>
          <line x1="37" y1="64" x2="23" y2="81"  stroke="white" strokeWidth="1.5"/>
          <line x1="28" y1="38" x2="11" y2="29"  stroke="white" strokeWidth="1.5"/>
        </svg>
        {/* Balón pequeño izquierda */}
        <svg className="absolute top-10 -left-10 w-40 h-40 opacity-[0.05]" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="2"/>
          <polygon points="50,28 68,40 61,60 39,60 32,40" fill="none" stroke="white" strokeWidth="2"/>
        </svg>
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/15 backdrop-blur rounded-2xl shadow-2xl border border-white/30 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ESCUDO%20F.A%202020.png" alt="Futuro Antioquia" className="w-14 h-14 object-contain drop-shadow-lg" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Futuro Antioquia</h1>
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mt-1">Plataforma Deportiva · 2026</p>
        </div>

        {/* Selector de rol (dropdown) */}
        <div className="relative mb-5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none select-none z-10">
            {tab === 'admin' ? '🛡️' : tab === 'profe' ? '👥' : tab === 'calidoso' ? '⭐' : '➕'}
          </span>
          <select
            value={tab}
            onChange={e => cambiarTab(e.target.value as Tab)}
            className="w-full appearance-none bg-white/15 backdrop-blur-sm border border-white/30 rounded-xl pl-8 pr-7 py-2 text-white font-black text-xs focus:outline-none focus:border-white/60 focus:bg-white/22 transition-all cursor-pointer"
            style={{ WebkitAppearance: 'none' }}
          >
            <option value="admin"    className="bg-gray-900 text-white font-bold">Admin</option>
            <option value="profe"    className="bg-gray-900 text-white font-bold">Profe</option>
            <option value="calidoso" className="bg-gray-900 text-white font-bold">Calidoso</option>
            <option value="nuevo"    className="bg-gray-900 text-white font-bold">Nuevo deportista</option>
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none text-[10px]">▼</span>
        </div>

        {/* Tarjeta */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in">

          {/* Franja superior de color */}
          <div className={cn('h-1.5 w-full bg-gradient-to-r', cfg.grad)} />

          <div className="p-7">
            <h2 className="text-xl font-black text-gray-900 mb-0.5">{cfg.titulo}</h2>
            <p className="text-sm text-gray-400 mb-6">Ingresa tus datos para continuar</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo usuario (oculto para nuevos) */}
              {tab !== 'nuevo' && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  {cfg.labelUser}
                </label>
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder={cfg.placeholderU}
                  className={cn(
                    'w-full px-4 py-3 border-2 border-gray-100 rounded-xl text-sm bg-gray-50',
                    'focus:outline-none focus:bg-white transition-all duration-200 uppercase',
                    cfg.ring,
                  )}
                />
              </div>
              )}

              {/* Campo clave */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  {cfg.labelClave}
                </label>
                <div className="relative">
                  <input
                    type={mostrarPass ? 'text' : 'password'}
                    value={clave}
                    onChange={e => setClave(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder={mostrarPass ? cfg.placeholderC : '••••••••'}
                    className={cn(
                      'w-full px-4 py-3 pr-12 border-2 border-gray-100 rounded-xl text-sm bg-gray-50',
                      'focus:outline-none focus:bg-white transition-all duration-200',
                      cfg.ring,
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPass(!mostrarPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {mostrarPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {errLocal && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 font-medium">{errLocal}</p>
                </div>
              )}

              {/* Botón */}
              <button
                type="submit"
                disabled={ocupado}
                className={cn(
                  'w-full py-3.5 rounded-xl font-black text-white text-sm',
                  'bg-gradient-to-r', cfg.grad,
                  'shadow-lg transition-all duration-200',
                  'hover:opacity-95 hover:-translate-y-0.5 hover:shadow-xl',
                  'active:translate-y-0',
                  'disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none',
                  'flex items-center justify-center gap-2',
                )}
              >
                {ocupado
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Ingresando…</>
                  : 'Ingresar a la plataforma'
                }
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6 font-medium">
          © 2026 Futuro Antioquia · Medellín, Colombia
        </p>
      </div>
    </div>
  );
}
