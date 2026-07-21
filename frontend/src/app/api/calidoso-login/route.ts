/**
 * /api/calidoso-login — Búsqueda rápida de UN deportista por CÓDIGO.
 *
 * Recibe: ?codigo=21187
 * Devuelve: array de candidatos (máx 5) con { id, nombre, columnas }
 *           El cliente verifica el documento para autenticar.
 *
 * Prueba variantes del nombre de columna: CÓDIGO, CODIGO, Código, codigo
 * → una sola fila regresa de Supabase, sin cargar los 1.139 deportistas.
 */
import { NextRequest, NextResponse } from 'next/server';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

// Variantes del nombre de la columna CÓDIGO que pueden existir en el JSON
const COD_KEYS = ['CÓDIGO', 'CODIGO', 'Código', 'codigo', 'Cod', 'COD'];

const HDRS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'count=none',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codigo = (searchParams.get('codigo') ?? '').trim().toUpperCase();
  if (!codigo) return NextResponse.json([]);

  for (const key of COD_KEYS) {
    try {
      const url =
        `${SB_URL}/rest/v1/deportistas`
        + `?select=id,nombre,columnas`
        + `&columnas->>${encodeURIComponent(key)}=eq.${encodeURIComponent(codigo)}`
        + `&limit=5`;

      const res = await fetch(url, { headers: HDRS, cache: 'no-store' });
      if (!res.ok) continue;

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data);
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json([]);
}
