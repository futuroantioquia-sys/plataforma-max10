// ─────────────────────────────────────────────────────────────────────────────
//  /api/auth/login  ·  Verificación de credenciales DEL LADO DEL SERVIDOR.
//
//  Antes las contraseñas de admin/Diana estaban escritas en el JavaScript que
//  se descarga al navegador (cualquiera podía verlas). Ahora la comparación
//  ocurre aquí, en el servidor, y el navegador sólo recibe una cookie firmada.
//
//  Emite DOS cookies (ver lib/session.ts): futuro-session (legible) + fa-sig (firmada).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { crearFirma, COOKIE_LEGIBLE, COOKIE_FIRMA, DUR_SEG } from '@/lib/session';

const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

// Credenciales por variable de entorno (con respaldo a los valores actuales para
// que nada se rompa si aún no se configuran en Vercel).
const ADMIN_USER = process.env.ADMIN_USER || 'ADMON';
const ADMIN_PASS = process.env.ADMIN_PASS || '34';
const DIANA_USER = process.env.DIANA_USER || 'DIANA';
const DIANA_PASS = process.env.DIANA_PASS || '32183658';
const AFILIACION_CODE = process.env.AFILIACION_CODE || '26';

async function darSesion(role: string, extra: Record<string, any> = {}) {
  const firma = await crearFirma(role);
  const res = NextResponse.json({ ok: true, ...extra });
  const base = { path: '/', maxAge: DUR_SEG, sameSite: 'lax' as const };
  res.cookies.set(COOKIE_LEGIBLE, role, base);                       // legible (UI)
  res.cookies.set(COOKIE_FIRMA,   firma, { ...base, httpOnly: true }); // firma (servidor)
  return res;
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try { body = await request.json(); } catch { /* body inválido */ }

  const tab     = String(body?.tab ?? '');
  const usuario = String(body?.usuario ?? '').trim().toUpperCase();
  const clave   = String(body?.clave ?? '').trim();

  // ── ADMINISTRADOR / CONTABILIDAD (Diana) ──
  if (tab === 'admin') {
    if (usuario === ADMIN_USER && clave === ADMIN_PASS) {
      return darSesion('1', { rol: 'administracion' });
    }
    if (usuario === DIANA_USER && clave === DIANA_PASS) {
      return darSesion('contabilidad', { rol: 'contabilidad' });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // ── PROFESOR (verificación contra Supabase, la clave nunca llega a otros navegadores) ──
  if (tab === 'profe') {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/profes?select=usuario,clave,proyectos,foto&order=usuario`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: 'no-store' },
      );
      if (res.ok) {
        const lista: any[] = await res.json();
        const p = Array.isArray(lista)
          ? lista.find(x => String(x?.usuario ?? '').toUpperCase() === usuario && String(x?.clave ?? '') === clave)
          : undefined;
        if (p) {
          return darSesion('profesor', {
            rol: 'profesor',
            profe: { usuario: p.usuario, proyectos: p.proyectos ?? [], foto: p.foto ?? '' },
          });
        }
      }
    } catch { /* cae a 401 */ }
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // ── NUEVO DEPORTISTA (código de acceso a afiliación) ──
  if (tab === 'nuevo') {
    if (clave === AFILIACION_CODE) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
