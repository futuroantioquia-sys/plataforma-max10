// ─────────────────────────────────────────────────────────────────────────────
//  auth-guard.ts  ·  SÓLO SERVIDOR — utilidades para que las rutas de /api
//  sepan quién hace la solicitud, leyendo la cookie firmada de la Fase 1.
// ─────────────────────────────────────────────────────────────────────────────
import type { NextRequest } from 'next/server';
import { validarFirma, COOKIE_FIRMA } from './session';

/** Devuelve el rol validado ('1' | 'contabilidad' | 'profesor' | 'deportista') o null. */
export async function rolDeSolicitud(req: NextRequest): Promise<string | null> {
  return validarFirma(req.cookies.get(COOKIE_FIRMA)?.value);
}

/** Administración o contabilidad (quienes gestionan pagos). */
export function esAdminContable(rol: string | null): boolean {
  return rol === '1' || rol === 'contabilidad';
}

/** Cualquier sesión válida (incluye padres y profes). */
export function estaAutenticado(rol: string | null): boolean {
  return rol === '1' || rol === 'contabilidad' || rol === 'profesor' || rol === 'deportista';
}
