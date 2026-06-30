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
