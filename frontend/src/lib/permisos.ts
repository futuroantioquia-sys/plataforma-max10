'use client';

/**
 * Permisos por rol.
 *
 * DIANA (rol "contabilidad") tiene acceso TOTAL solo a las secciones de Finanzas
 * y solo-lectura en el resto de la plataforma.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Rutas donde contabilidad SÍ puede editar (categoría Finanzas del dashboard). */
export const RUTAS_FINANZAS = ['/pagos', '/pagos-pendientes', '/productos'];

/** Lee el valor de la cookie de sesión: '1' | 'profesor' | 'contabilidad' | 'deportista'. */
export function getSesion(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('futuro-session='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : '';
}

export function esContabilidad(): boolean {
  if (getSesion() === 'contabilidad') return true;
  try { return localStorage.getItem('futuro-rol') === 'contabilidad'; } catch { return false; }
}

/** Administrador deportivo: acceso total EXCEPTO finanzas. */
export function esDeportivo(): boolean {
  if (getSesion() === 'deportivo') return true;
  try { return localStorage.getItem('futuro-rol') === 'deportivo'; } catch { return false; }
}

/** Super-administrador (ADMON) — único que gestiona administradores. */
export function esSuperAdmin(): boolean {
  const s = getSesion();
  if (s === '1' || s === 'administracion') return true;
  try { return localStorage.getItem('futuro-rol') === 'administracion'; } catch { return false; }
}

/** ¿La ruta actual pertenece a Finanzas? (incluye subrutas como /pagos/importar-valores) */
export function rutaEsFinanzas(pathname: string): boolean {
  return RUTAS_FINANZAS.some(r => pathname === r || pathname.startsWith(r + '/'));
}

/**
 * Hook: devuelve `true` cuando el usuario es contabilidad y está en una sección
 * que NO es de finanzas → la vista debe ser solo-lectura (ocultar/bloquear edición).
 * Empieza en `false` para evitar desajustes de hidratación y se resuelve en el cliente.
 */
export function useSoloLectura(): boolean {
  const pathname = usePathname() || '';
  const [solo, setSolo] = useState(false);
  useEffect(() => {
    setSolo(esContabilidad() && !rutaEsFinanzas(pathname));
  }, [pathname]);
  return solo;
}
