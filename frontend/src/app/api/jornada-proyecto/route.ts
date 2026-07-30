/**
 * /api/jornada-proyecto — Lee y guarda los días de entrenamiento de un proyecto.
 * GET ?proyecto=NAME  → { dias: number[] }
 * POST { proyecto, dias } → { ok: true }
 */
import { NextRequest, NextResponse } from 'next/server';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

const HEADERS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
};

export async function GET(request: NextRequest) {
  try {
    const proyecto = new URL(request.url).searchParams.get('proyecto') ?? '';
    if (!proyecto) return NextResponse.json({ dias: [] });

    const res = await fetch(
      `${SB_URL}/rest/v1/jornadas_proyecto?select=dias&proyecto=eq.${encodeURIComponent(proyecto)}&limit=1`,
      { headers: HEADERS, cache: 'no-store' }
    );
    if (!res.ok) return NextResponse.json({ dias: [] });

    const data = await res.json();
    const dias = Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.dias)
      ? data[0].dias as number[]
      : [];
    return NextResponse.json({ dias });
  } catch (e: any) {
    return NextResponse.json({ dias: [], error: String(e?.message ?? e) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { proyecto, dias, sede, nombre_formador, edades } = body;
    if (!proyecto) return NextResponse.json({ ok: false, error: 'falta proyecto' }, { status: 400 });

    const payload: Record<string, unknown> = {
      proyecto,
      dias: dias ?? [],
      updated_at: new Date().toISOString(),
    };
    if (sede !== undefined)            payload.sede            = sede;
    if (nombre_formador !== undefined) payload.nombre_formador = nombre_formador;
    if (edades !== undefined)          payload.edades          = edades;

    const res = await fetch(
      `${SB_URL}/rest/v1/jornadas_proyecto`,
      {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return NextResponse.json({ ok: false, error: txt }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
