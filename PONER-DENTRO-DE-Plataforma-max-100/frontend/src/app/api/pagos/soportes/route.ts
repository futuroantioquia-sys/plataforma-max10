// ─────────────────────────────────────────────────────────────────────────────
//  /api/pagos/soportes  ·  "Portería" de servidor para los soportes de pago.
//
//  Usa la llave maestra (service_role) y valida el rol con la cookie firmada de
//  la Fase 1. Reemplaza el acceso directo del navegador a la tabla soportes_pago.
//
//  Mientras la llave maestra no esté configurada, responde 503 con {sinLlave:true}
//  para que db.ts use su camino anterior (la app no se rompe durante la transición).
//
//    GET  ?solo=count                 → cantidad de pendientes            [admin/contable]
//    GET  ?deportistaIds=a,b          → soportes pendientes (CON imagen) de esos deportistas [sesión válida]
//    GET                              → lista de pendientes SIN imagen    [admin/contable]
//    POST {deportistaId,nombre,datos,fecha,meses} → subir soporte         [sesión válida]
//    PATCH {id}                       → confirmar                         [admin/contable]
//    DELETE ?id=…                     → rechazar/eliminar por id          [admin/contable]
//    DELETE ?deportistaIds=a,b&nombre=… → borrar propio(s) no confirmado(s) [sesión válida]
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { SB_URL, headersAdmin, hayLlaveMaestra } from '@/lib/supabase/admin';
import { rolDeSolicitud, sesionDeSolicitud, esAdminContable, estaAutenticado } from '@/lib/auth-guard';

/* ── BLINDAJE (22/08/2026) ────────────────────────────────────────────────────
   Antes, CUALQUIER sesión válida —incluida la de un padre— podía pedir los
   comprobantes de pago (con la foto de la transferencia bancaria) de cualquier
   deportista, con solo enviar su id. Ahora, si quien pregunta es un calidoso,
   el servidor ignora los ids que manda el navegador y usa ÚNICAMENTE el
   deportista al que pertenece su sesión.

   Devuelve la lista de ids que esta sesión puede consultar, o null si no puede. */
async function idsPermitidos(request: any, rol: string | null, pedidos: string): Promise<string | null> {
  if (esAdminContable(rol) || rol === 'profesor') return pedidos;   // gestión: sin cambio
  if (rol !== 'deportista') return null;
  const ses = await sesionDeSolicitud(request);
  // Sesión antigua (emitida antes del blindaje): no sabemos de quién es.
  if (!ses?.sub) return null;
  return ses.sub;
}

const SIN_LLAVE = () => NextResponse.json({ ok: false, sinLlave: true }, { status: 503 });
const NO_AUT = () => NextResponse.json({ ok: false, error: 'no-autorizado' }, { status: 403 });

const COLS_LISTA = 'id,deportista_id,nombre,fecha,meses,confirmado,fecha_confirmacion,created_at';
const COLS_FULL  = 'id,deportista_id,nombre,datos,fecha,meses,confirmado,fecha_confirmacion,created_at';

/** Construye el filtro in.("a","b") de PostgREST a partir de una lista separada por comas. */
function inList(csv: string): string {
  const ids = csv.split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return '';
  return ids.map(v => `"${v.replace(/"/g, '')}"`).join(',');
}

export async function GET(request: NextRequest) {
  if (!hayLlaveMaestra()) return SIN_LLAVE();
  const rol = await rolDeSolicitud(request);
  const { searchParams } = new URL(request.url);

  // Soportes (CON imagen) de deportistas específicos → vista del calidoso
  const depIds = searchParams.get('deportistaIds');
  if (depIds) {
    if (!estaAutenticado(rol)) return NO_AUT();
    const permitidos = await idsPermitidos(request, rol, depIds);
    if (!permitidos) return NO_AUT();
    const inl = inList(permitidos);
    if (!inl) return NextResponse.json({ ok: true, soportes: [] });
    const res = await fetch(
      `${SB_URL}/rest/v1/soportes_pago?select=${COLS_FULL}&deportista_id=in.(${encodeURIComponent(inl)})&confirmado=eq.false&order=created_at.desc`,
      { headers: headersAdmin(), cache: 'no-store' },
    );
    if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
    const data = await res.json();
    return NextResponse.json({ ok: true, soportes: Array.isArray(data) ? data : [] });
  }

  // Cantidad de pendientes (indicador del panel)
  if (searchParams.get('solo') === 'count') {
    if (!esAdminContable(rol)) return NO_AUT();
    const res = await fetch(
      `${SB_URL}/rest/v1/soportes_pago?select=id&confirmado=eq.false`,
      { headers: headersAdmin({ Prefer: 'count=exact', Range: '0-0' }), cache: 'no-store' },
    );
    if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
    const cr = res.headers.get('content-range');
    let count = 0;
    if (cr) { const m = cr.match(/\/(\d+)/); if (m) count = parseInt(m[1]); }
    return NextResponse.json({ ok: true, count });
  }

  // Lista de pendientes SIN imagen (liviana) → panel admin
  if (!esAdminContable(rol)) return NO_AUT();
  const res = await fetch(
    `${SB_URL}/rest/v1/soportes_pago?select=${COLS_LISTA}&confirmado=eq.false&order=created_at.desc`,
    { headers: headersAdmin(), cache: 'no-store' },
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
  const data = await res.json();
  return NextResponse.json({ ok: true, soportes: Array.isArray(data) ? data : [] });
}

export async function POST(request: NextRequest) {
  if (!hayLlaveMaestra()) return SIN_LLAVE();
  const rol = await rolDeSolicitud(request);
  if (!estaAutenticado(rol)) return NO_AUT();

  let body: any = {};
  try { body = await request.json(); } catch { /* body inválido */ }
  const deportistaId = String(body?.deportistaId ?? '').trim();
  const nombre = String(body?.nombre ?? '').trim();
  const datos  = String(body?.datos ?? '');
  const fecha  = String(body?.fecha ?? '');
  const meses  = Array.isArray(body?.meses) ? body.meses : [];
  if (!deportistaId || !datos) return NextResponse.json({ ok: false, error: 'faltan-datos' }, { status: 400 });

  // Un calidoso solo puede subir comprobantes de SU propio deportista.
  const permitidoPost = await idsPermitidos(request, rol, deportistaId);
  if (!permitidoPost || (rol === 'deportista' && permitidoPost !== deportistaId)) return NO_AUT();

  const res = await fetch(`${SB_URL}/rest/v1/soportes_pago`, {
    method: 'POST',
    headers: headersAdmin({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ deportista_id: deportistaId, nombre, datos, fecha, meses, confirmado: false }),
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  if (!hayLlaveMaestra()) return SIN_LLAVE();
  const rol = await rolDeSolicitud(request);
  if (!esAdminContable(rol)) return NO_AUT();

  let body: any = {};
  try { body = await request.json(); } catch { /* body inválido */ }
  const id = String(body?.id ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'falta-id' }, { status: 400 });

  const fechaConf = new Date().toLocaleDateString('es-CO');
  const res = await fetch(
    `${SB_URL}/rest/v1/soportes_pago?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: headersAdmin({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ confirmado: true, fecha_confirmacion: fechaConf }),
      cache: 'no-store',
    },
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!hayLlaveMaestra()) return SIN_LLAVE();
  const rol = await rolDeSolicitud(request);
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') ?? '').trim();
  const nombre = (searchParams.get('nombre') ?? '').trim();
  const depIds = (searchParams.get('deportistaIds') ?? searchParams.get('deportistaId') ?? '').trim();

  let url = '';
  if (id) {
    // Rechazar/eliminar por id → sólo administración/contabilidad
    if (!esAdminContable(rol)) return NO_AUT();
    url = `${SB_URL}/rest/v1/soportes_pago?id=eq.${encodeURIComponent(id)}`;
  } else if (depIds && nombre) {
    // Borrar el propio soporte no confirmado (uno o varios ids) → cualquier sesión válida
    if (!estaAutenticado(rol)) return NO_AUT();
    const permitidos = await idsPermitidos(request, rol, depIds);
    if (!permitidos) return NO_AUT();
    const inl = inList(permitidos);
    if (!inl) return NextResponse.json({ ok: false, error: 'faltan-parametros' }, { status: 400 });
    url = `${SB_URL}/rest/v1/soportes_pago?deportista_id=in.(${encodeURIComponent(inl)})&nombre=eq.${encodeURIComponent(nombre)}&confirmado=eq.false`;
  } else {
    return NextResponse.json({ ok: false, error: 'faltan-parametros' }, { status: 400 });
  }

  const res = await fetch(url, {
    method: 'DELETE',
    headers: headersAdmin({ Prefer: 'return=minimal' }),
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: `sb-${res.status}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
