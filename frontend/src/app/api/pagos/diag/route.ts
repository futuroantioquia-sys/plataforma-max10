// /api/pagos/diag — Diagnóstico temporal de la portería. NO expone la llave.
// Sirve para confirmar si la llave maestra quedó bien cargada y si el servidor
// puede leer los soportes. Devuelve solo indicadores, ningún dato personal.
import { NextRequest, NextResponse } from 'next/server';
import { rolDeSolicitud, esAdminContable } from '@/lib/auth-guard';
import { SB_URL, headersAdmin, hayLlaveMaestra } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const rol = await rolDeSolicitud(request);
  if (!esAdminContable(rol)) return NextResponse.json({ error: 'no-autorizado' }, { status: 403 });
  const hayLlave = hayLlaveMaestra();
  const longitudLlave = ((typeof process !== 'undefined' && process.env?.SUPABASE_SERVICE_ROLE_KEY) || '').length;
  let sbStatus = 0;
  let pendientes: number | null = null;
  if (hayLlave) {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/soportes_pago?select=id&confirmado=eq.false`,
        { headers: headersAdmin({ Prefer: 'count=exact', Range: '0-0' }), cache: 'no-store' },
      );
      sbStatus = res.status;
      const cr = res.headers.get('content-range');
      if (cr) { const m = cr.match(/\/(\d+)/); if (m) pendientes = parseInt(m[1]); }
    } catch (e: any) {
      sbStatus = -1;
    }
  }
  return NextResponse.json({
    hayLlaveMaestra: hayLlave,
    longitudLlave,          // longitud del texto de la llave (no la llave)
    supabaseStatus: sbStatus, // 200 = la llave funciona; 401 = llave incorrecta
    pendientes,             // cuántos soportes pendientes ve el servidor
  });
}
