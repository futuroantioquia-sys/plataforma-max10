// ─────────────────────────────────────────────────────────────────────────────
//  /api/estado-seguridad  ·  Semáforo de configuración.
//
//  Abre esta dirección en el navegador DESPUÉS de publicar para confirmar que
//  las variables de entorno quedaron bien puestas en Vercel. No muestra ninguna
//  clave ni ningún dato: solo sí/no.
//
//    { "secretoDeSesion": true, "claveMaestraBD": true, "usuarioMaestro": true }
//
//  Si "secretoDeSesion" saliera en false, NADIE podrá iniciar sesión: falta
//  configurar SESSION_SECRET en Vercel → Settings → Environment Variables.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { haySecreto } from '@/lib/session';
import { hayLlaveMaestra } from '@/lib/supabase/admin';

export async function GET() {
  const env = (typeof process !== 'undefined' && process.env) || ({} as any);
  return NextResponse.json({
    secretoDeSesion: haySecreto(),
    claveMaestraBD: hayLlaveMaestra(),
    usuarioMaestro: Boolean(env.ADMIN_USER && env.ADMIN_PASS),
    codigoAfiliacion: Boolean(env.AFILIACION_CODE),
  });
}
