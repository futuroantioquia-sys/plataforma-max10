'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Shield, AlertCircle, Loader2, Users, Star, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
// Blindaje: el ingreso de calidosos ya no consulta la base desde el navegador.

type Tab = 'admin' | 'profe' | 'calidoso' | 'nuevo';

export default function LoginPage() {
  const router  = useRouter();
  const { cargando } = useAuthStore();

  const [tab,         setTab]         = useState<Tab | null>(null);
  const [usuario,     setUsuario]     = useState('');
  const [clave,       setClave]       = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [errLocal,    setErrLocal]    = useState('');
  const [enviando,    setEnviando]    = useState(false);

  function cambiarTab(t: Tab | null) {
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
      /* ── ADMINISTRADOR / CONTABILIDAD ─── */
      if (tab === 'admin') {
        // La contraseña se verifica EN EL SERVIDOR; el navegador sólo recibe una cookie firmada.
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: 'admin', usuario: u, clave: c }),
        });
        const data = await r.json().catch(() => ({} as any));
        if (r.ok && data?.ok) {
          /* ERROR CORREGIDO (26/08/2026): faltaba 'total'.
             El servidor ya devolvía rol 'total' para el administrador de ACCESO
             TOTAL, pero aquí cualquier cosa que no fuera contabilidad o
             deportivo se convertía en 'administracion' —el super-administrador—.
             Resultado: la cookie decía 'total' y la pantalla creía que era
             ADMON. Quedaban peleando, y al que le pusieran acceso total le
             empezaba a fallar el ingreso. */
          const rolSrv = data.rol === 'contabilidad' ? 'contabilidad'
                       : data.rol === 'deportivo'    ? 'deportivo'
                       : data.rol === 'total'        ? 'total'
                       : 'administracion';
          try {
            localStorage.removeItem('futuro-profe-proyectos');
            localStorage.removeItem('futuro-profe-nombre');
          } catch {}
          const nombreSrv = data.nombre
            || (rolSrv === 'contabilidad' ? 'Diana'
              : rolSrv === 'deportivo'    ? 'Administrador Deportivo'
              : rolSrv === 'total'        ? 'Administrador'
              : 'Administrador');
          useAuthStore.setState({
            usuario: {
              id:       rolSrv === 'contabilidad' ? 'contab-diana'
                      : rolSrv === 'deportivo'    ? 'admin-dep'
                      : rolSrv === 'total'        ? 'admin-total'
                      : 'admin-1',
              email:    rolSrv === 'contabilidad' ? 'diana@futuroantioquia.com' : 'admin@futuroantioquia.com',
              nombre:   nombreSrv,
              apellido: '',
              rol:      rolSrv as any,
              activo:   true,
              academia: { id: '1', nombre: 'Futuro Antioquia' },
            },
            cargando: false, error: null,
          });
          try { localStorage.setItem('futuro-rol', rolSrv); } catch {}
          router.push('/dashboard');
        } else {
          setErrLocal('Usuario o contraseña incorrectos');
        }
        return;
      }

      /* ── PROFE ─── */
      if (tab === 'profe') {
        // Verificación de la cédula EN EL SERVIDOR (ya no se descarga la lista de claves al navegador).
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: 'profe', usuario: u, clave: c }),
        });
        const data = await r.json().catch(() => ({} as any));
        const profe = (r.ok && data?.ok) ? data.profe : null;
        if (profe) {
          useAuthStore.setState({
            usuario: {
              id: 'profe-' + profe.usuario,
              email: String(profe.usuario).toLowerCase() + '@futuroantioquia.com',
              nombre: profe.usuario, apellido: '',
              rol: 'profesor' as any, activo: true,
              academia: { id: '1', nombre: 'Futuro Antioquia' },
            },
            cargando: false, error: null,
          });
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
          // Se muestra el motivo técnico en pequeñito: si la falla no es la clave
          // sino la base de datos, hay que verlo para poder arreglarlo.
          const motivo = data?.motivo ? ` (${data.motivo})` : '';
          setErrLocal('Usuario o contraseña incorrectos' + motivo);
        }
        return;
      }

      /* ── CALIDOSO ───────────────────────────────────────────────────────
         BLINDAJE (agosto 2026): la comprobación del código y el documento ya
         NO se hace en el navegador. Se envía al servidor (/api/auth/calidoso),
         que verifica contra la base de datos y solo entonces entrega la sesión.
         Así el navegador nunca descarga datos de otros deportistas para
         compararlos, y nadie puede saltarse el ingreso desde la consola.       */
      if (tab === 'calidoso') {
        const r = await fetch('/api/auth/calidoso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: u, documento: c }),
        });
        const data = await r.json().catch(() => ({}));

        if (!r.ok || !data?.ok) {
          setErrLocal(data?.error || 'Código o documento incorrecto');
          return;
        }

        try {
          if (data.id)     localStorage.setItem('futuro-calidoso-id',     data.id);
          if (data.nombre) localStorage.setItem('futuro-calidoso-nombre', data.nombre);
          localStorage.setItem('futuro-calidoso-codigo', u);
          // Ya NO se guarda el número de documento del menor en el navegador.
          localStorage.removeItem('futuro_calidoso_credenciales');
        } catch {}

        useAuthStore.setState({
          usuario: {
            id:       data.id || 'calidoso-' + u,
            email:    u.toLowerCase() + '@calidoso.com',
            nombre:   data.nombre || u,
            apellido: '',
            rol:      'padre' as any,
            activo:   true,
            academia: { id: '1', nombre: 'Futuro Antioquia' },
          },
          cargando: false, error: null,
        });
        router.push(data.id ? `/alumnos/${data.id}` : '/alumnos');
        return;
      }

      /* ── NUEVO DEPORTISTA ─── */
      if (tab === 'nuevo') {
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab: 'nuevo', clave: c }),
        });
        const data = await r.json().catch(() => ({} as any));
        if (r.ok && data?.ok) {
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

  /* La plataforma es una sola: el color NO cambia según el perfil.
     Gris oscuro de fondo y el verde institucional como único acento. */
  const LIENZO = '#333F50';
  const PANEL  = '#3C4759';
  const CAMPO  = '#2B3547';
  const BORDE  = '#4A5568';
  const VERDE  = '#00B050';

  const ANILLO = 'focus:border-[#00B050]';

  const config = {
    admin: {
      titulo:       'Administrador',
      labelUser:    'Usuario',
      placeholderU: 'ADMON',
      labelClave:   'Contraseña',
      placeholderC: '••••',
      ring:         ANILLO,
    },
    profe: {
      titulo:       'Profesor',
      labelUser:    'Usuario',
      placeholderU: 'Ej: CASTRO',
      labelClave:   'Contraseña (cédula)',
      placeholderC: 'Tu número de cédula',
      ring:         ANILLO,
    },
    calidoso: {
      titulo:       'Calidoso',
      labelUser:    'Código',
      placeholderU: 'Tu código de deportista',
      labelClave:   'Documento de identidad',
      placeholderC: 'Tu número de documento',
      ring:         ANILLO,
    },
    nuevo: {
      titulo:       'Nuevo Deportista',
      labelUser:    '',
      placeholderU: '',
      labelClave:   'Código de Acceso',
      placeholderC: 'Ingresa el código',
      ring:         ANILLO,
    },
  };

  const cfg     = tab ? config[tab] : null;
  const ocupado = enviando || cargando;

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: LIENZO }}
    >
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

        {/* Escudo grande, suelto — sin recuadro */}
        <div className="text-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ESCUDO%20F.A%202020.png"
            alt="Futuro Antioquia"
            className="w-36 h-36 object-contain mx-auto mb-4 drop-shadow-2xl"
          />
          <h1 className="text-2xl font-black text-white tracking-tight">Futuro Antioquia</h1>
          <p className="text-white text-xs font-bold uppercase tracking-widest mt-1">
            Plataforma Deportiva · 2026
          </p>

          {/* Marca MAX 10 SPORT */}
          <div className="flex flex-col items-center gap-1 mt-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MAX%2010.png" alt="MAX 10 SPORT" className="h-9 w-auto object-contain" />
            <p className="text-[10px] font-bold tracking-[.2em] uppercase" style={{ color: VERDE }}>
              Conecta · Gestiona · Gana
            </p>
          </div>
        </div>

        {/* Selector de rol (dropdown) */}
        <div className="relative mb-5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none select-none z-10">
            {tab === 'admin' ? '🛡️' : tab === 'profe' ? '👥' : tab === 'calidoso' ? '⭐' : tab === 'nuevo' ? '➕' : '👤'}
          </span>
          <select
            value={tab ?? ''}
            onChange={e => cambiarTab((e.target.value as Tab) || null)}
            className="w-full appearance-none rounded-xl pl-8 pr-7 py-2.5 text-white font-black text-xs
                       border focus:outline-none transition-all cursor-pointer"
            style={{ WebkitAppearance: 'none', background: CAMPO, borderColor: BORDE }}
          >
            <option value="" className="bg-[#2B3547] text-white">— Selecciona tu perfil —</option>
            <option value="admin"    className="bg-[#2B3547] text-white font-bold">Admin</option>
            <option value="profe"    className="bg-[#2B3547] text-white font-bold">Profe</option>
            <option value="calidoso" className="bg-[#2B3547] text-white font-bold">Calidoso</option>
            <option value="nuevo"    className="bg-[#2B3547] text-white font-bold">Nuevo deportista</option>
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white pointer-events-none text-[10px]">▼</span>
        </div>

        {/* Tarjeta — solo visible cuando hay rol seleccionado */}
        {tab && cfg && (
        <div className="rounded-3xl shadow-2xl overflow-hidden animate-scale-in border"
             style={{ background: PANEL, borderColor: BORDE }}>

          {/* Franja superior — igual para todos los perfiles */}
          <div className="h-1.5 w-full" style={{ background: VERDE }} />

          <div className="p-7">
            <h2 className="text-xl font-black text-white mb-0.5">{cfg.titulo}</h2>
            <p className="text-sm text-white mb-6">Ingresa tus datos para continuar</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo usuario (oculto para nuevos) */}
              {tab !== 'nuevo' && (
              <div>
                <label className="block text-xs font-bold text-white uppercase tracking-wider mb-1.5">
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
                    'w-full px-4 py-3 border-2 rounded-xl text-sm text-white uppercase',
                    'placeholder:text-[#8C94A0] focus:outline-none transition-all duration-200',
                    cfg.ring,
                  )}
                  style={{ background: CAMPO, borderColor: BORDE }}
                />
              </div>
              )}

              {/* Campo clave */}
              <div>
                <label className="block text-xs font-bold text-white uppercase tracking-wider mb-1.5">
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
                      'w-full px-4 py-3 pr-12 border-2 rounded-xl text-sm text-white',
                      'placeholder:text-[#8C94A0] focus:outline-none transition-all duration-200',
                      cfg.ring,
                    )}
                    style={{ background: CAMPO, borderColor: BORDE }}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPass(!mostrarPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white hover:opacity-70 transition-opacity"
                  >
                    {mostrarPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {errLocal && (
                <div className="flex items-center gap-2 rounded-xl p-3 animate-fade-in border"
                     style={{ background: 'rgba(192,80,77,.18)', borderColor: '#C0504D' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#FF9B98' }} />
                  <p className="text-sm text-white font-medium">{errLocal}</p>
                </div>
              )}

              {/* Botón */}
              <button
                type="submit"
                disabled={ocupado}
                style={{ background: VERDE }}
                className={cn(
                  'w-full py-3.5 rounded-xl font-black text-white text-sm',
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
        )}

        <p className="text-center text-white text-xs mt-6 font-medium">
          © 2026 Futuro Antioquia · Medellín, Colombia
        </p>
      </div>
    </div>
  );
}
