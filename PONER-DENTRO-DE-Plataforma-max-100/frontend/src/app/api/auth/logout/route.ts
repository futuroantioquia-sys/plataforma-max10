// /api/auth/logout · Borra ambas cookies de sesión (la firmada es HttpOnly y
// sólo puede borrarse desde el servidor).
import { NextResponse } from 'next/server';
import { COOKIE_LEGIBLE, COOKIE_FIRMA } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_LEGIBLE, '', { path: '/', maxAge: 0, secure: true });
  res.cookies.set(COOKIE_FIRMA,   '', { path: '/', maxAge: 0, httpOnly: true, secure: true });
  return res;
}
