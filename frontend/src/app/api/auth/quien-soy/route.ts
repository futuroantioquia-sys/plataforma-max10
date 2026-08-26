// ─────────────────────────────────────────────────────────────────────────────
//  /api/auth/quien-soy  ·  ¿De quién es esta sesión?
//
//  Devuelve el rol y, para un CALIDOSO, el id de SU deportista — leído de la
//  cookie FIRMADA, que solo el servidor puede fabricar.
//
//  Por qué existe (26/08/2026): las pantallas del padre venían sacando ese id
//  de la memoria del navegador (localStorage). Eso falla en varios casos
//  reales: cuando el ingreso no alcanzó a guardarlo, cuando el papá entra
//  desde otro teléfono, o cuando el navegador limpió los datos del sitio.
//  Pasó de verdad: a un retirado la pantalla del Paz y Salvo le decía "vuelve
//  a ingresar" aunque acababa de ingresar bien.
//  Con esta ruta, la pantalla le pregunta al servidor —que es quien de verdad
//  sabe— en vez de fiarse de lo que quedó guardado en el aparato.
//
//  No expone nada de nadie más: devuelve ÚNICAMENTE el sujeto de la sesión de
//  quien pregunta.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { sesionDeSolicitud } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const s = await sesionDeSolicitud(req);
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, rol: s.rol, id: s.sub ?? '' });
}
