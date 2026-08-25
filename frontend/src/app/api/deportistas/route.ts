/**
 * /api/deportistas — proxy server-side hacia Supabase con paginación automática.
 * Acepta ?proyecto= para filtrar por proyecto.
 * Sin ?proyecto= devuelve TODOS los deportistas paginando de 1000 en 1000.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rolDeSolicitud, estaAutenticado } from '@/lib/auth-guard';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const PAGE = 1000;

export async function GET(request: NextRequest) {
  // BLINDAJE: antes cualquiera podía descargar los 1.165 deportistas sin entrar.
  const rol = await rolDeSolicitud(request);
  if (!estaAutenticado(rol)) {
    return NextResponse.json({ error: 'no-autorizado' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const proyecto = searchParams.get('proyecto');
    const offsetParam = searchParams.get('offset');

    /* ── SOLO EL CONTEO ──────────────────────────────────────────────────
       ?conteo=SUB 8A|SUB 8B  →  {"SUB 8A":24,"SUB 8B":21}

       "Mis Proyectos" solo necesita el número que va debajo de cada
       proyecto. Antes bajaba las más de mil fichas de la academia para
       contarlas en el teléfono. Esto lo cuenta el servidor de Vercel, que
       está al lado del de la base de datos, y devuelve dos numeritos.
       Va aquí (y no directo desde el navegador) porque el número viene en
       una cabecera de la respuesta que el navegador no siempre deja leer.
       — 25/08/2026 */
    const conteoParam = searchParams.get('conteo');
    if (conteoParam !== null) {
      const proyectos = Array.from(new Set(
        conteoParam.split('|').map(s => s.trim()).filter(Boolean)
      )).slice(0, 40);
      const out: Record<string, number> = {};
      await Promise.all(proyectos.map(async p => {
        try {
          const res = await fetch(
            `${SB_URL}/rest/v1/deportistas?select=id&columnas->>PROY=eq.${encodeURIComponent(p)}`,
            {
              headers: {
                'apikey':        SB_KEY,
                'Authorization': `Bearer ${SB_KEY}`,
                'Prefer':        'count=exact',
                'Range':         '0-0',
              },
              cache: 'no-store',
            }
          );
          const cr = res.headers.get('content-range');          // "0-0/24"
          const n  = cr && cr.includes('/') ? parseInt(cr.split('/')[1], 10) : NaN;
          out[p] = Number.isNaN(n) ? 0 : n;
        } catch { out[p] = 0; }
      }));
      return NextResponse.json(out);
    }

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
