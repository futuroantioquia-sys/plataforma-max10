// ── Autorización: PADRES (calidosos) ven el módulo de Valoración ──────────────
// Mientras esté en `false`, el botón VALORACIÓN de los padres va a "mantenimiento"
// y el servidor (middleware) bloquea el acceso por URL.
// Cuando se decida AUTORIZAR a los padres, cambia esto a `true`: automáticamente
// verán el módulo nuevo (Valoración Dinámica) y se habilita el acceso.
export const PADRES_VEN_VALORACION = false;

// Ruta del módulo que verán los padres al autorizar.
export const RUTA_VALORACION_PADRES = '/valoracion-dinamica';

// ── AVISO DE MANTENIMIENTO ────────────────────────────────────────────────────
// Cuando esté en `true`, TODA la plataforma muestra un aviso de mantenimiento a
// profes y papás. Para volver a la normalidad, cámbialo a `false` y vuelve a
// desplegar (VERCEL-DIRECTO).
// Puerta trasera para el ADMIN: agrega ?admin al final de la dirección
//   (ej: plataforma-max10.vercel.app/dashboard?admin) y el aviso NO te aparece,
//   para que puedas seguir revisando mientras dure el mantenimiento.
export const MANTENIMIENTO = false;
export const MANTENIMIENTO_TITULO  = 'Estamos en mantenimiento';
export const MANTENIMIENTO_MENSAJE = 'Estamos haciendo mejoras en la plataforma. Volveremos muy pronto. Gracias por tu paciencia. 💚';
