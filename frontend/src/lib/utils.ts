import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatearMoneda(valor: number, moneda = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 0,
  }).format(valor);
}

export function formatearFecha(fecha: string | Date) {
  return new Intl.DateTimeFormat('es-CO', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
  }).format(new Date(fecha));
}

export function calcularEdad(fechaNacimiento: string | Date): number {
  const hoy   = new Date();
  const nac   = new Date(fechaNacimiento);
  let edad    = hoy.getFullYear() - nac.getFullYear();
  const mes   = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) {
    edad--;
  }
  return edad;
}

export function iniciales(nombre: string, apellido: string) {
  return `${nombre[0] ?? ''}${apellido[0] ?? ''}`.toUpperCase();
}

/* ─────────────────────────────────────────────────────────────────────────────
   SOPORTES DE PAGO EN PDF

   Los navegadores (Chrome, Edge, Firefox, Safari) BLOQUEAN abrir directamente
   un enlace "data:application/pdf;base64,…". Por eso los soportes en PDF no
   abrían: se hacía clic y no pasaba absolutamente nada.

   La salida es convertir ese dato en un archivo temporal del navegador
   (una URL "blob:"), que sí se puede abrir y descargar.
   ───────────────────────────────────────────────────────────────────────────── */

/** ¿El dato guardado es un PDF (y no una imagen)? */
export function esPdfDato(dataUrl: string): boolean {
  return /^data:application\/pdf/i.test(String(dataUrl || ''));
}

/** Convierte un data URL (base64) en una URL blob: que el navegador sí abre. */
export function dataUrlABlobUrl(dataUrl: string): string {
  const d = String(dataUrl || '');
  if (!d.startsWith('data:') || typeof window === 'undefined') return d;
  try {
    const coma = d.indexOf(',');
    if (coma < 0) return d;
    const cabecera = d.slice(5, coma);
    const tipo = (cabecera.split(';')[0] || 'application/octet-stream').trim();
    const cuerpo = d.slice(coma + 1);
    if (!/;base64/i.test(cabecera)) {
      return URL.createObjectURL(new Blob([decodeURIComponent(cuerpo)], { type: tipo }));
    }
    const bin = atob(cuerpo.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: tipo }));
  } catch {
    return d;   // ante cualquier falla se devuelve el dato original
  }
}

/** Abre un soporte (PDF o imagen) en una pestaña nueva. Si el navegador bloquea
 *  la ventana emergente, lo descarga en vez de dejar al usuario sin nada. */
export function abrirSoporte(dataUrl: string, nombre = 'soporte'): void {
  const d = String(dataUrl || '');
  if (!d || typeof window === 'undefined') return;
  const url = dataUrlABlobUrl(d);
  let v: Window | null = null;
  try { v = window.open(url, '_blank', 'noopener,noreferrer'); } catch { v = null; }
  if (!v) {
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre.replace(/\.[^.]+$/, '') + (esPdfDato(d) ? '.pdf' : '');
    document.body.appendChild(a); a.click(); a.remove();
  }
  if (url !== d) window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
