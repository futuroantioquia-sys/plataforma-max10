// /api/test — endpoint de diagnóstico DESHABILITADO por seguridad.
// Antes exponía datos de deportistas sin autenticación y con CORS abierto (*).
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
}
