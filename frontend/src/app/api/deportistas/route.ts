/**
 * /api/deportistas — proxy server-side hacia Supabase.
 * Acepta ?proyecto= para filtrar por proyecto (mucho más liviano para mobile).
 * Sin ?proyecto= devuelve todos (para admin en desktop).
 */
import { NextRequest, NextResponse } from 'next/server';

// Hardcodeado — no usar process.env (pueden apuntar al proyecto Supabase viejo).
const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const proyecto = searchParams.get('proyecto');

    // Si viene ?proyecto=, filtramos solo ese proyecto (liviano para mobile)
    // columnas->>'PROY' = 'SUB 8A'
    let url = `${SB_URL}/rest/v1/deportistas?select=id,nombre,columnas&order=nombre`;
    if (proyecto) {
      url += `&columnas->>PROY=eq.${encodeURIComponent(proyecto)}`;
    }

    const res = await fetch(url, {
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
