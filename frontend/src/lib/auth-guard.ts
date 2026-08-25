// ─────────────────────────────────────────────────────────────────────────────
//  auth-guard.ts  ·  SÓLO SERVIDOR — utilidades para que las rutas de /api
//  sepan quién hace la solicitud, leyendo la cookie firmada de la Fase 1.
// ─────────────────────────────────────────────────────────────────────────────
import type { NextRequest } from 'next/server';
import { validarFirma, validarSesion, COOKIE_FIRMA } from './session';

/** Devuelve el rol validado ('1' | 'contabilidad' | 'profesor' | 'deportista') o null. */
export async function rolDeSolicitud(req: NextRequest): Promise<string | null> {
  return validarFirma(req.cookies.get(COOKIE_FIRMA)?.value);
}

/** Devuelve rol + sujeto ('sub'). Para un calidoso, `sub` es el id de su
 *  deportista; es null en sesiones antiguas, anteriores al blindaje. */
export async function sesionDeSolicitud(req: NextRequest): Promise<{ rol: string; sub: string | null } | null> {
  return validarSesion(req.cookies.get(COOKIE_FIRMA)?.value);
}

/** Administración o contabilidad (quienes gestionan pagos). */
export function esAdminContable(rol: string | null): boolean {
  return rol === '1' || rol === 'total' || rol === 'contabilidad';
}

/** Cualquier sesión válida (incluye padres y profes).
 *
 *  ⚠ 25/08/2026: faltaba 'deportivo'. Por eso a un administrador deportivo la
 *  ruta /api/deportistas le respondía "no autorizado" y la lista de deportistas
 *  le cargaba por el camino lento de respaldo. Se agrega junto con 'total'. */
export function estaAutenticado(rol: string | null): boolean {
  return rol === '1' || rol === 'total' || rol === 'contabilidad'
      || rol === 'deportivo' || rol === 'profesor' || rol === 'deportista';
}
