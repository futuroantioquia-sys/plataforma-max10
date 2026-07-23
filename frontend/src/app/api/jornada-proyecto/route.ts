/**
 * /api/jornada-proyecto — Guarda o lee la meta completa de un proyecto.
 *
 * POST { proyecto, dias, sede?, nombre_formador?, edades? }
 *   → upsert en tabla jornadas_proyecto (fuente de verdad cross-device)
 *
 * GET ?proyecto=X  → devuelve { dias, sede, nombre_formador, edades }
 * GET (sin params) → devuelve TODOS los proyectos (para carga inicial en /usuarios)
 */
import { NextRequest, NextResponse } from 'next/server';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

const HDRS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
};

/** POST: upsert meta completa de un proyecto */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { proyecto, dias, sede, nombre_formador, edades } = body;

    if (!proyecto) {
      return NextResponse.json({ error: 'proyecto es requerido' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      proyecto,
      updated_at: new Date().toISOString(),
    };
    if (Array.isArray(dias))            payload.dias            = dias;
    if (typeof sede === 'string')        payload.sede            = sede;
    if (typeof nombre_formador === 'string') payload.nombre_formador = nombre_formador;
    if (Array.isArray(edades))           payload.edades          = edades;

    const res = await fetch(`${SB_URL}/rest/v1/jornadas_proyecto`, {
      method:  'POST',
      headers: { ...HDRS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify(payload),
      cache:   'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[jornada-proyecto] upsert error:', res.status, err);
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[jornada-proyecto] POST error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/** GET ?proyecto=X  → meta de ese proyecto
 *  GET (sin params) → todos los proyectos con meta */
export async function GET(request: NextRequest) {
  try {
    const proyecto = new URL(request.url).searchParams.get('proyecto') ?? '';

    const select = 'proyecto,dias,sede,nombre_formador,edades';

    if (proyecto) {
      // Un solo proyecto
      const url = `${SB_URL}/rest/v1/jornadas_proyecto?select=${select}&proyecto=eq.${encodeURIComponent(proyecto)}&limit=1`;
      const res = await fetch(url, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
        cache: 'no-store',
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          // Si no tiene días, intentar fallback legacy en deportistas.columnas.JORNADA
          if (!r.dias?.length) {
            const fallback = await legacyDias(proyecto);
            r.dias = fallback;
          }
          return NextResponse.json(r);
        }
      }

      // Fallback: sólo días legacy
      const dias = await legacyDias(proyecto);
      return NextResponse.json({ proyecto, dias, sede: '', nombre_formador: '', edades: [] });
    }

    // Todos los proyectos
    const url = `${SB_URL}/rest/v1/jornadas_proyecto?select=${select}&order=proyecto`;
    const res = await fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      cache: 'no-store',
    });

    if (res.ok) {
      const rows = await res.json();
      return NextResponse.json(Array.isArray(rows) ? rows : []);
    }

    return NextResponse.json([]);
  } catch (e: any) {
    console.error('[jornada-proyecto] GET error:', e?.message);
    return NextResponse.json({ dias: [] });
  }
}

/** Fallback: lee JORNADA desde deportistas.columnas (datos legacy) */
async function legacyDias(proyecto: string): Promise<number[]> {
  try {
    const url = `${SB_URL}/rest/v1/deportistas?select=columnas&columnas->>PROY=eq.${encodeURIComponent(proyecto)}&limit=1`;
    const res = await fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return [];
    const cols = rows[0].columnas ?? {};
    const jk = Object.keys(cols).find(k => /^jornada/i.test(k.trim()));
    if (!jk) return [];
    const parsed = JSON.parse(cols[jk]);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
