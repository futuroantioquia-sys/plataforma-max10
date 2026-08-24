// ─────────────────────────────────────────────────────────────────────────────
//  /api/pagos/soportes/datos  ·  Devuelve la imagen (base64) de UN soporte.
//  Se separa de la lista para que la lista sea liviana y la imagen se cargue
//  solo cuando el administrador la abre.                       [admin/contable]
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { SB_URL, headersAdmin, hayLlaveMaestra } from '@/lib/supabase/admin';
import { rolDeSolicitud, esAdminContable } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  if (!hayLlaveMaestra()) return NextResponse.json({ ok: false, sinLlave: true }, { status: 503 });
  const rol = await rolDeSolicitud(request);
  if (!esAdminContable(rol)) return NextResponse.json({ ok: false, error: 'no-autorizado' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'falta-id' }, { status: 400 });

  const res = await fetch(
    `${SB_URL}/rest/v1/soportes_pago?select=datos&id=eq.${encodeURIComponent(id)}`,
    { headers: headersAdmin(), cache: 'no-store' },
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
  const data = await res.json();
  const datos = Array.isArray(data) && data[0] ? (data[0].datos ?? '') : '';
  return NextResponse.json({ ok: true, datos });
}
