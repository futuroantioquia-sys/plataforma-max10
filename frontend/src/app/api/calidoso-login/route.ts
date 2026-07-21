/**
 * /api/calidoso-login — Búsqueda rápida de UN deportista por CÓDIGO.
 *
 * Llama a la función PostgreSQL `buscar_calidoso` via Supabase RPC.
 * El código se pasa como JSON en el body → sin problemas de URL encoding
 * con caracteres acentuados (CÓDIGO).
 *
 * Recibe: ?codigo=21187
 * Devuelve: array [ { id, nombre, columnas } ] o []
 */
import { NextRequest, NextResponse } from 'next/server';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

const HDRS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codigo = (searchParams.get('codigo') ?? '').trim().toUpperCase();
  if (!codigo) return NextResponse.json([]);

  try {
    // Llamada al RPC — el parámetro va en el body como JSON, sin encoding de URL
    const res = await fetch(`${SB_URL}/rest/v1/rpc/buscar_calidoso`, {
      method:  'POST',
      headers: HDRS,
      body:    JSON.stringify({ p_codigo: codigo }),
      cache:   'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[calidoso-login] RPC error:', res.status, err);
      return NextResponse.json([]);
    }

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    console.error('[calidoso-login] fetch error:', e?.message);
    return NextResponse.json([]);
  }
}
