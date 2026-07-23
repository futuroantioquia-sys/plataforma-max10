import { NextResponse, type NextRequest } from 'next/server';

// Rutas que no requieren autenticación
const RUTAS_PUBLICAS = ['/login', '/afiliacion', '/api'];

// Rutas permitidas para el rol profesor
const RUTAS_PROFESOR = ['/asistencia', '/consolidado', '/evaluaciones', '/sesiones', '/postpartido', '/mis-proyectos', '/alumnos'];

// Rutas permitidas para calidoso/deportista — SOLO su propio portal
// ⚠️ SEGURIDAD: jamás agregar /pagos, /general, /asignacion, /proyectos, /usuarios, etc.
// /alumnos está permitido SOLO para que vean su propio perfil (esPadre=true en la página limita la vista)
const RUTAS_DEPORTISTA = ['/dashboard', '/afiliacion', '/evaluaciones', '/calendario', '/mensajes', '/alumnos'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas
  if (RUTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    return NextResponse.next();
  }

  // Verificar cookie de sesión (establecida por login page)
  const sesion = request.cookies.get('futuro-session');
  if (!sesion?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // ── CALIDOSO / DEPORTISTA ─────────────────────────────────────────
  // Cookie: futuro-session=deportista
  // Solo puede ver su propio portal. Cualquier intento de acceder a páginas
  // institucionales (pagos, alumnos, general, proyectos, etc.) se bloquea.
  if (sesion.value === 'deportista') {
    const permitida = RUTAS_DEPORTISTA.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (!permitida) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // ── PROFESOR ─────────────────────────────────────────────────────
  if (sesion.value === 'profesor') {
    const permitida = RUTAS_PROFESOR.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (!permitida) {
      return NextResponse.redirect(new URL('/asistencia', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
