// ─────────────────────────────────────────────────────────────────────────────
//  /api/auth/calidoso  ·  Emite la cookie de sesión firmada para un calidoso (padre).
//
//  La verificación del documento sigue haciéndose en el cliente (flujo actual);
//  aquí sólo se emite el token firmado de rol 'deportista' — el rol de MENOR
//  privilegio. Aunque alguien pida este token, el middleware sólo le permite las
//  rutas de deportista (NO valoraciones, NO administración, NO pagos globales).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { crearFirma, COOKIE_LEGIBLE, COOKIE_FIRMA, DUR_SEG } from '@/lib/session';

export async function POST(request: NextRequest) {
  let body: any = {};
  try { body = await request.json(); } catch { /* body inválido */ }
  const codigo = String(body?.codigo ?? '').trim();
  if (!codigo) return NextResponse.json({ ok: false }, { status: 400 });

  const firma = await crearFirma('deportista');
  const res = NextResponse.json({ ok: true });
  const base = { path: '/', maxAge: DUR_SEG, sameSite: 'lax' as const };
  res.cookies.set(COOKIE_LEGIBLE, 'deportista', base);
  res.cookies.set(COOKIE_FIRMA,   firma, { ...base, httpOnly: true });
  return res;
}
