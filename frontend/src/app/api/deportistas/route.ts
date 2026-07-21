/**
 * /api/deportistas — proxy server-side hacia Supabase con paginación automática.
 * Acepta ?proyecto= para filtrar por proyecto.
 * Sin ?proyecto= devuelve TODOS los deportistas paginando de 1000 en 1000.
 */
import { NextRequest, NextResponse } from 'next/server';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';
const PAGE = 1000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const proyecto = searchParams.get('proyecto');
    const offsetParam = searchParams.get('offset');

    // Si el cliente pide una página específica (paginación del cliente)
    if (offsetParam !== null) {
      const offset = parseInt(offsetParam, 10) || 0;
      let url = `${SB_URL}/rest/v1/deportistas?select=id,nombre,columnas&order=nombre&offset=${offset}&limit=${PAGE}`;
      if (proyecto) url += `&columnas->>PROY=eq.${encodeURIComponent(proyecto)}`;

      const res = await fetch(url, {
        headers: {
          'apikey':        SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type':  'application/json',
          'Range':         `${offset}-${offset + PAGE - 1}`,
          'Prefer':        'count=none',
        },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      return NextResponse.json(await res.json());
    }

    // Sin offset: paginar automáticamente y devolver todo
    const all: any[] = [];
    for (let i = 0; i < 20; i++) {
      const offset = i * PAGE;
      let url = `${SB_URL}/rest/v1/deportistas?select=id,nombre,columnas&order=nombre&offset=${offset}&limit=${PAGE}`;
      if (proyecto) url += `&columnas->>PROY=eq.${encodeURIComponent(proyecto)}`;

      const res = await fetch(url, {
        headers: {
          'apikey':        SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type':  'application/json',
          'Range':         `${offset}-${offset + PAGE - 1}`,
          'Prefer':        'count=none',
        },
        cache: 'no-store',
      });
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;   // última página
    }

    return NextResponse.json(all);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
