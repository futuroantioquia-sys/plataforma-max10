import { NextResponse } from 'next/server';

/**
 * (Sin uso actual) Los mensajes del calidoso se guardan en la plataforma
 * (historial + "mensajes por leer"), no por correo. Esta ruta queda como
 * stub inofensivo por compatibilidad. Responde ok sin hacer nada.
 */
export async function POST() {
  return NextResponse.json({ ok: true, emailed: false });
}
