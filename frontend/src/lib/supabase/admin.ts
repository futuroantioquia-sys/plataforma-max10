// ─────────────────────────────────────────────────────────────────────────────
//  admin.ts  ·  SÓLO SERVIDOR — no importar jamás desde componentes de cliente.
//
//  Provee la "llave maestra" (service_role) para que las rutas de servidor puedan
//  operar en la base de datos AUNQUE los candados (RLS) estén puestos. Esta llave
//  vive únicamente en variables de entorno del servidor (Vercel / .env.local),
//  nunca en el navegador ni en el repositorio.
//
//  Si la llave aún no está configurada, hayLlaveMaestra() devuelve false y las
//  rutas pueden degradar con elegancia (la app sigue funcionando por el camino
//  anterior hasta que activemos el blindaje).
// ─────────────────────────────────────────────────────────────────────────────

export const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';

const SERVICE_KEY =
  (typeof process !== 'undefined' && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || '';

/** ¿Está cargada la llave maestra en el servidor? */
export function hayLlaveMaestra(): boolean {
  return typeof SERVICE_KEY === 'string' && SERVICE_KEY.length > 20;
}

/** Cabeceras HTTP para hablar con Supabase REST usando la llave maestra. */
export function headersAdmin(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}
