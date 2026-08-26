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
  // BLINDAJE: el rol se lee SOLO de la cookie emitida por el servidor.
  // Antes bastaba con escribir localStorage.setItem('futuro-rol','contabilidad')
  // en la consola del navegador para desbloquear botones de otro rol.
  return getSesion() === 'contabilidad';
}

/** Administrador deportivo: acceso total EXCEPTO finanzas. */
export function esDeportivo(): boolean {
  return getSesion() === 'deportivo';
}

/** Administrador de ACCESO TOTAL (deportivo + finanzas). — 25/08/2026 */
export function esAccesoTotal(): boolean {
  return getSesion() === 'total';
}

/** Super-administrador (ADMON) — único que gestiona administradores. */
export function esSuperAdmin(): boolean {
  const s = getSesion();
  return s === '1' || s === 'administracion';
}

/** Formador (profe). */
export function esProfesor(): boolean {
  return getSesion() === 'profesor';
}

/** Cualquiera del equipo de trabajo: administración o formador.
 *  (NO incluye a los padres ni a los deportistas.) */
export function esDelEquipo(): boolean {
  const s = getSesion();
  return s === '1' || s === 'administracion' || s === 'total'
      || s === 'deportivo' || s === 'contabilidad' || s === 'profesor';
}

/** ¿Este rol maneja FINANZAS? — recibe el rol tal cual lo guarda la sesión.
 *
 *  ERROR CORREGIDO (26/08/2026): varias pantallas de Finanzas comprobaban a
 *  mano `rol === 'administracion' || rol === 'contable'`. Dos problemas:
 *    · 'contable' no existe — el rol de Diana es 'contabilidad';
 *    · faltaba 'total', el acceso completo que se creó el 25/08.
 *  Resultado: a Diana la sacaban de Productos y no le aparecía el botón de
 *  eliminar en el Estado de Cuenta. Solo entraba ADMON.
 *  De aquí en adelante se pregunta con esta función, en un solo lugar. */
export function rolManejaFinanzas(rol: any): boolean {
  const r = String(rol ?? '').trim().toLowerCase();
  return r === '1' || r === 'administracion' || r === 'total'
      || r === 'contabilidad' || r === 'contable';
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
