/**
 * /api/profes — listado de profesores.
 *
 * BLINDAJE (agosto 2026): ANTES esta ruta hacía `select=*` SIN pedir sesión,
 * es decir devolvía a cualquier visitante de internet la columna `clave` con
 * las contraseñas cifradas de los 24 profesores (listas para descifrar sin
 * prisa en un computador propio).
 *
 * AHORA:
 *   · Exige una sesión válida (administración, contabilidad o profesor).
 *   · Nunca devuelve la columna `clave`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rolDeSolicitud, estaAutenticado } from '@/lib/auth-guard';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';

// Columnas que SÍ pueden salir. `clave` queda fuera a propósito.
const COLUMNAS = 'id,usuario,nombre,proyectos,foto,telefono,correo,activo';

export async function GET(request: NextRequest) {
  const rol = await rolDeSolicitud(request);
  if (!estaAutenticado(rol) || rol === 'deportista') {
    return NextResponse.json({ error: 'no-autorizado' }, { status: 403 });
  }

  try {
    const res = await fetch(`${SB_URL}/rest/v1/profes?select=${COLUMNAS}&order=usuario`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      // Si alguna columna opcional no existe, se reintenta con las básicas.
      const res2 = await fetch(`${SB_URL}/rest/v1/profes?select=id,usuario,nombre,proyectos,foto&order=usuario`, {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (!res2.ok) throw new Error(`Supabase ${res2.status}`);
      return NextResponse.json(await res2.json());
    }
    return NextResponse.json(await res.json());
  } catch {
    // Sin detalles internos en la respuesta.
    return NextResponse.json({ error: 'no-disponible' }, { status: 502 });
  }
}
