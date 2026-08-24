'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/* ─────────────────────────────────────────────────────────────────────────────
   RASTREO DE RUTA

   Guarda en la sesión del navegador cuál es la pantalla actual y cuál era la
   anterior. Sirve para que el botón "← Volver" de cualquier ficha devuelva al
   usuario EXACTAMENTE a la pantalla de la que vino (Control de Informes,
   Cumpleaños, el listado de su proyecto…) en vez de adivinar un destino.

   Se monta una sola vez, dentro del layout raíz.
   ───────────────────────────────────────────────────────────────────────────── */

export const RUTA_ACTUAL   = 'fa_ruta_actual';
export const RUTA_ANTERIOR = 'fa_ruta_anterior';

export function RastreoRuta() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const ruta = window.location.pathname + window.location.search;
      const actual = sessionStorage.getItem(RUTA_ACTUAL) || '';
      if (actual === ruta) return;
      if (actual) sessionStorage.setItem(RUTA_ANTERIOR, actual);
      sessionStorage.setItem(RUTA_ACTUAL, ruta);
    } catch { /* noop */ }
  }, [pathname]);

  return null;
}

/**
 * Devuelve la pantalla de la que viene el usuario, sin importar el orden en que
 * React ejecute los efectos. `rutaAqui` es el pathname de la pantalla actual.
 * Devuelve '' si no hay una pantalla anterior utilizable.
 */
export function rutaAnterior(rutaAqui: string): string {
  try {
    const actual   = sessionStorage.getItem(RUTA_ACTUAL)   || '';
    const anterior = sessionStorage.getItem(RUTA_ANTERIOR) || '';
    const prev = (actual && !actual.startsWith(rutaAqui)) ? actual : anterior;
    return prev.startsWith('/') ? prev : '';
  } catch {
    return '';
  }
}
