/**
 * /api/test — endpoint de diagnóstico (temporal).
 * Muestra si el middleware está bien y si Supabase responde.
 */
import { NextRequest, NextResponse } from 'next/server';

// Hardcodeado — no usar process.env (pueden apuntar al proyecto Supabase viejo).
const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const proyecto = searchParams.get('proyecto') ?? 'SUB 8A';
  const proyEnc  = encodeURIComponent(proyecto);

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    proyecto,
    middleware: 'OK — este endpoint es accesible sin autenticacion',
  };

  // Test filtro por proyecto
  try {
    const url = `${SB_URL}/rest/v1/deportistas?select=id,nombre&columnas->>PROY=eq.${proyEnc}&limit=3`;
    const res = await fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      cache: 'no-store',
    });
    const data = await res.json();
    results.supabase_filtrado = {
      status: res.status,
      ok: res.ok,
      count: Array.isArray(data) ? data.length : 'no es array',
      sample: Array.isArray(data) ? data.slice(0,2).map((d:any) => d.nombre) : data,
    };
  } catch (e: any) {
    results.supabase_filtrado = { error: String(e?.message ?? e) };
  }

  // Test total sin filtro
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/deportistas?select=id&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }, cache: 'no-store' }
    );
    const data = await res.json();
    results.supabase_total = {
      status: res.status,
      ok: res.ok,
      hayDatos: Array.isArray(data) && data.length > 0,
    };
  } catch (e: any) {
    results.supabase_total = { error: String(e?.message ?? e) };
  }

  return NextResponse.json(results, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  });
}
