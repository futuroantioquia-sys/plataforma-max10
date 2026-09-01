import { NextResponse, type NextRequest } from 'next/server';
import { validarFirma } from '@/lib/session';
import { PADRES_VEN_VALORACION } from '@/lib/config';

// Rutas que no requieren autenticación
const RUTAS_PUBLICAS = ['/login', '/afiliacion', '/api'];

// Rutas permitidas para el rol profesor — asistencia + portal propio + vista alumnos + valoración dinámica
// '/sesiones' salió el 22/08/2026: lo reemplaza el microciclo.
const RUTAS_PROFESOR = ['/asistencia', '/consolidado', '/evaluaciones', '/microciclo', '/postpartido', '/mis-proyectos', '/alumnos', '/valoracion-dinamica'];

// Rutas permitidas para deportista (calidoso) — SOLO su perfil y secciones propias.
// IMPORTANTE: NO incluye /evaluaciones ni /valoracion-dinamica → las valoraciones
// quedan bloqueadas EN EL SERVIDOR para los calidosos (requisito fundamental).
// '/retiro' (26/08/2026) es el módulo donde el padre pide el retiro de SU hijo.
// OJO: '/retirados' es OTRA ruta —la de administración— y NO entra aquí: la
// comparación es exacta o con barra ('/retiro/'), así que '/retirados' no cuela.
const RUTAS_DEPORTISTA = ['/dashboard', '/alumnos', '/afiliacion', '/calendario', '/mantenimiento', '/mis-pagos', '/retiro'];

// TOTAL RETIRADOS — solo administración. Ni formadores ni padres.
const RUTAS_SOLO_ADMIN = ['/retirados'];
const ROLES_ADMIN = ['1', 'total', 'deportivo', 'contabilidad'];

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
    // Módulo de valoración (seguimiento + valoración dinámica):
    // bloqueado hasta que se AUTORICE a los padres (PADRES_VEN_VALORACION).
    const esValoracion =
      /^\/alumnos\/[^/]+\/seguimiento/.test(pathname) ||
      pathname === '/valoracion-dinamica' || pathname.startsWith('/valoracion-dinamica/');
    if (esValoracion) {
      if (!PADRES_VEN_VALORACION) {
        return NextResponse.redirect(new URL('/alumnos', request.url));
      }
      return NextResponse.next(); // autorizado: ve el módulo nuevo
    }
    const permitida = RUTAS_DEPORTISTA.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (!permitida) {
      return NextResponse.redirect(new URL('/alumnos', request.url));
    }
  }

  // Administrador DEPORTIVO: acceso total EXCEPTO Finanzas
  if (rol === 'deportivo') {
    const finanzas = ['/pagos', '/pagos-pendientes', '/productos', '/contabilidad', '/facturas', '/nomina', '/proveedores'];
    const esFinanzas = finanzas.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (esFinanzas) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // TOTAL RETIRADOS: solo administración (26/08/2026).
  // Los formadores y los padres ya quedaron desviados arriba; esto cierra la
  // puerta también para cualquier rol nuevo que se agregue mañana.
  if (RUTAS_SOLO_ADMIN.some(r => pathname === r || pathname.startsWith(r + '/'))) {
    if (!ROLES_ADMIN.includes(rol)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // MIS PROYECTOS es la puerta del FORMADOR y de nadie más (01/09/2026).
  // Un administrador que caiga ahí no ve nada suyo: ve la tarjeta del profe en
  // blanco y un «Sin proyectos asignados» que asusta sin motivo. Se le devuelve
  // a su tablero. (En la pantalla hay el mismo cuidado, para el botón de atrás.)
  if (pathname === '/mis-proyectos' || pathname.startsWith('/mis-proyectos/')) {
    if (rol !== 'profesor') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Gestión de administradores: SOLO el super-administrador (ADMON, rol '1')
  if (pathname === '/administradores' || pathname.startsWith('/administradores/')) {
    if (rol !== '1') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
