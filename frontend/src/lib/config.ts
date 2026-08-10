// ── Autorización: PADRES (calidosos) ven el módulo de Valoración ──────────────
// Mientras esté en `false`, el botón VALORACIÓN de los padres va a "mantenimiento"
// y el servidor (middleware) bloquea el acceso por URL.
// Cuando se decida AUTORIZAR a los padres, cambia esto a `true`: automáticamente
// verán el módulo nuevo (Valoración Dinámica) y se habilita el acceso.
export const PADRES_VEN_VALORACION = false;

// Ruta del módulo que verán los padres al autorizar.
export const RUTA_VALORACION_PADRES = '/valoracion-dinamica';
