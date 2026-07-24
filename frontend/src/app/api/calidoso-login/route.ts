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

  // ── Intento 1: RPC buscar_calidoso (1 query, rápida) ──
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/buscar_calidoso`, {
      method:  'POST',
      headers: HDRS,
      body:    JSON.stringify({ p_codigo: codigo }),
      cache:   'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data);
      }
    } else {
      console.error('[calidoso-login] RPC error:', res.status);
    }
  } catch (e: any) {
    console.error('[calidoso-login] RPC fetch error:', e?.message);
  }

  // ── Intento 2: Query REST directa filtrando por columnas JSONB ──
  // Prueba los dos formatos más comunes del campo código
  const intentos = [
    `columnas->>CÓDIGO=eq.${encodeURIComponent(codigo)}`,
    `columnas->>CODIGO=eq.${encodeURIComponent(codigo)}`,
    `columnas->>C%C3%93DIGO=eq.${encodeURIComponent(codigo)}`,
  ];
  for (const filtro of intentos) {
    try {
      const url = `${SB_URL}/rest/v1/deportistas?select=id,nombre,columnas&${filtro}&limit=5`;
      const res = await fetch(url, { headers: HDRS, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return NextResponse.json(data);
        }
      }
    } catch { /* continuar */ }
  }

  // ── Intento 3: Búsqueda por texto en columnas serializado ──
  try {
    // ilike sobre el JSON serializado: busca el código entre comillas
    const url = `${SB_URL}/rest/v1/deportistas?select=id,nombre,columnas&columnas=phfts.${encodeURIComponent(codigo)}&limit=10`;
    const res = await fetch(url, { headers: HDRS, cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Filtrar del lado servidor: verificar que el código realmente coincide
        const RX_COD = /^c[oó]d/i;
        const filtrados = data.filter((r: any) => {
          const cols = r.columnas ?? {};
          const codKey = Object.keys(cols).find((k: string) => RX_COD.test(k.trim()));
          return codKey && String(cols[codKey]).trim().toUpperCase() === codigo;
        });
        if (filtrados.length > 0) return NextResponse.json(filtrados);
      }
    }
  } catch { /* ignorar */ }

  return NextResponse.json([]);
}
