/**
 * /api/calidoso-login — Búsqueda rápida de UN deportista por CÓDIGO.
 *
 * Llama a la función PostgreSQL `buscar_calidoso` via Supabase RPC.
 * El código se pasa como JSON en el body → sin problemas de URL encoding
 * con caracteres acentuados (CÓDIGO).
 *
 * Recibe: ?codigo=21187
 * Devuelve: array [ { id, nombre, columnas } ] o []
 *
 * CABECERA de diagnóstico: X-Calidoso-Error — presente cuando el RPC falla.
 * Permite que db.ts distinga "0 resultados" de "fallo de RPC".
 */
import { NextRequest, NextResponse } from 'next/server';
import { rolDeSolicitud, estaAutenticado } from '@/lib/auth-guard';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';

// FIX Bug F: Removido 'Prefer: return=representation' que no es estándar para llamadas RPC
// y puede causar respuestas inesperadas según la firma de la función PostgreSQL.
const HDRS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
};

export async function GET(request: NextRequest) {
  // BLINDAJE: esta ruta devolvía TODOS los datos personales de un deportista a
  // cualquiera que probara códigos (21185, 21186, 21187...). El ingreso de
  // calidosos ya no la usa: ahora se verifica en /api/auth/calidoso.
  const rol = await rolDeSolicitud(request);
  if (!estaAutenticado(rol)) return NextResponse.json([], { status: 403 });

  const { searchParams } = new URL(request.url);
  const codigo = (searchParams.get('codigo') ?? '').trim().toUpperCase();

  if (!codigo) return NextResponse.json([]);

  // FIX Bug G: Timeout explícito de 9s (deja 1s de margen antes del límite de Vercel ~10s)
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9_000);

  try {
    // Llamada al RPC — el parámetro va en el body como JSON, sin encoding de URL
    const res = await fetch(`${SB_URL}/rest/v1/rpc/buscar_calidoso`, {
      method:  'POST',
      headers: HDRS,
      body:    JSON.stringify({ p_codigo: codigo }),
      cache:   'no-store',
      signal:  ctrl.signal,
    }).finally(() => clearTimeout(timer));

    // FIX Bug B: Ahora el error se expone en cabecera para que db.ts lo detecte
    if (!res.ok) {
      const errText = await res.text().catch(() => '(no body)');
      console.error('[calidoso-login] RPC HTTP error:', res.status, errText);
      return NextResponse.json([], {
        headers: { 'X-Calidoso-Error': `RPC_HTTP_${res.status}: ${errText.slice(0, 200)}` },
      });
    }

    const data = await res.json();

    // Log de diagnóstico detallado (visible en Vercel → Functions → Logs)
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      // FIX Bug C (diagnóstico): detectar si columnas llega como string o como objeto
      const colTipo = typeof first?.columnas;
      const colKeys = colTipo === 'object' && first?.columnas
        ? Object.keys(first.columnas).slice(0, 10).join(' | ')
        : colTipo === 'string'
          ? `[STRING, primeros 80 chars]: ${String(first.columnas).slice(0, 80)}`
          : '(vacío o null)';
      console.log('[calidoso-login] RPC OK →', data.length, 'fila(s) | columnas tipo:', colTipo, '| llaves:', colKeys);
    } else {
      console.log('[calidoso-login] RPC OK → 0 filas para código:', codigo);
    }

    // Registrar el acceso del calidoso (alimenta el indicador verde/rojo y las analíticas).
    // Nunca debe romper el login: si falla, se ignora.
    if (Array.isArray(data) && data.length > 0) {
      try {
        await fetch(`${SB_URL}/rest/v1/visitas`, {
          method:  'POST',
          headers: { ...HDRS, 'Prefer': 'return=minimal' },
          body:    JSON.stringify({ codigo, tipo: 'calidoso' }),
          cache:   'no-store',
        });
      } catch { /* noop */ }
    }

    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    clearTimeout(timer);
    const isTimeout = e?.name === 'AbortError';
    const msg = isTimeout ? 'TIMEOUT_9s' : (e?.message ?? 'unknown');
    console.error('[calidoso-login] fetch error:', msg);
    return NextResponse.json([], {
      headers: { 'X-Calidoso-Error': msg },
    });
  }
}
