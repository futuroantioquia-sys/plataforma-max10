import { NextResponse, type NextRequest } from 'next/server';
import { validarFirma } from '@/lib/session';

// Rutas que no requieren autenticación
const RUTAS_PUBLICAS = ['/login', '/afiliacion', '/api'];

// Rutas permitidas para el rol profesor — asistencia + portal propio + vista alumnos
const RUTAS_PROFESOR = ['/asistencia', '/consolidado', '/evaluaciones', '/sesiones', '/postpartido', '/mis-proyectos', '/alumnos'];

// Rutas permitidas para deportista (calidoso) — SOLO su perfil y secciones propias.
// IMPORTANTE: NO incluye /evaluaciones ni /valoracion-dinamica → las valoraciones
// quedan bloqueadas EN EL SERVIDOR para los calidosos (requisito fundamental).
const RUTAS_DEPORTISTA = ['/dashboard', '/alumnos', '/afiliacion', '/calendario', '/mantenimiento', '/mis-pagos'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas
  if (RUTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    return NextResponse.next();
  }

  // Verificar la PRUEBA FIRMADA (fa-sig). La cookie legible 'futuro-session' ya
  // no basta: sin una firma válida (que sólo el servidor puede generar) el acceso
  // se rechaza. Esto anula el truco de "document.cookie = 'futuro-session=1'".
  const firma = request.cookies.get('fa-sig')?.value;
  const rol = await validarFirma(firma);
  if (!rol) {
    const res = NextResponse.redirect(new URL('/login', request.url));
    // Limpia una posible cookie legible forjada para evitar estados inconsistentes.
    res.cookies.set('futuro-session', '', { path: '/', maxAge: 0 });
    return res;
  }

  // Restricción de rutas para profes
  if (rol === 'profesor') {
    const permitida = RUTAS_PROFESOR.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (!permitida) {
      return NextResponse.redirect(new URL('/asistencia', request.url));
    }
  }

  // Restricción de rutas para deportista (calidoso)
  if (rol === 'deportista') {
    const permitida = RUTAS_DEPORTISTA.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (!permitida) {
      return NextResponse.redirect(new URL('/alumnos', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
