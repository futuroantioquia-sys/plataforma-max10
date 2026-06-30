import { NextResponse, type NextRequest } from 'next/server';

// Rutas que no requieren autenticación
const RUTAS_PUBLICAS = ['/login', '/afiliacion'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas
  if (RUTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    return NextResponse.next();
  }

  // Verificar cookie de sesión (establecida por login page)
  const sesion = request.cookies.get('futuro-session');
  if (!sesion?.value) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
