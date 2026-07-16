import { NextResponse, type NextRequest } from 'next/server';

// Rutas que no requieren autenticación
const RUTAS_PUBLICAS = ['/login', '/afiliacion'];

// Rutas permitidas para el rol profesor — asistencia + portal propio
const RUTAS_PROFESOR = ['/asistencia', '/consolidado', '/evaluaciones', '/sesiones', '/postpartido', '/mis-proyectos'];

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

  // Restricción de rutas para profes — solo asistencia y consolidado de asistencia
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
