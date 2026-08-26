// ─────────────────────────────────────────────────────────────────────────────
//  /api/admins  ·  Gestión de administradores DEL LADO DEL SERVIDOR.
//
//  Antes el navegador creaba, editaba y borraba administradores hablando
//  directamente con la base con la clave publicable —la misma que va dentro de
//  la página de cualquier visitante—. Con eso, quien conociera esa clave podía
//  crearse a sí mismo un administrador sin pasar por ninguna pantalla.
//
//  Ahora toda operación pasa por aquí:
//    1. Se comprueba la cookie firmada: SOLO el super-administrador (rol '1').
//    2. Se habla con la base con la llave maestra, que vive solo en el servidor.
//    3. Las contraseñas se guardan CIFRADAS (bcrypt). Nunca en texto plano y
//       nunca se devuelven al navegador.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { rolDeSolicitud } from '@/lib/auth-guard';
import { SB_URL, hayLlaveMaestra, headersAdmin } from '@/lib/supabase/admin';

const TABLA = `${SB_URL}/rest/v1/admins`;

/** Solo el super-administrador (ADMON) gestiona administradores. */
async function permitido(req: NextRequest): Promise<NextResponse | null> {
  const rol = await rolDeSolicitud(req);
  if (rol !== '1') {
    return NextResponse.json({ ok: false, msg: 'No autorizado.' }, { status: 403 });
  }
  if (!hayLlaveMaestra()) {
    return NextResponse.json(
      { ok: false, msg: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' },
      { status: 503 },
    );
  }
  return null;
}

const limpiar = (v: any) => String(v ?? '').trim();

/** Los TRES tipos de administrador que existen hoy.
 *
 *  ERROR CORREGIDO (26/08/2026): esta ruta solo conocía dos —contabilidad y
 *  deportivo— y cualquier otro valor lo volvía 'deportivo'. Como el 25/08 se
 *  agregó ACCESO TOTAL a la pantalla, pasaba esto:
 *    · al GUARDAR, el acceso total quedaba guardado como deportivo, sin avisar;
 *    · al LISTAR, un administrador total se veía como deportivo, y con solo
 *      volver a guardarlo se le quitaba el acceso sin que nadie lo pidiera.
 *  Ahora los tres viajan completos, de ida y de vuelta. */
function tipoValido(v: any): 'total' | 'contabilidad' | 'deportivo' {
  const t = String(v ?? '').trim().toLowerCase();
  if (t === 'total' || t === 'contabilidad') return t;
  return 'deportivo';
}

/** Lista de administradores. Nunca incluye la contraseña. */
export async function GET(req: NextRequest) {
  const no = await permitido(req);
  if (no) return no;
  try {
    const res = await fetch(`${TABLA}?select=id,usuario,nombre,tipo&order=usuario`, {
      headers: headersAdmin(), cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ ok: false, msg: `Base de datos ${res.status}` }, { status: 502 });
    const lista: any[] = await res.json();
    return NextResponse.json((lista ?? []).map(r => ({
      id:      r.id ?? '',
      usuario: limpiar(r.usuario).toUpperCase(),
      clave:   '',                       // jamás sale del servidor
      nombre:  r.nombre ?? '',
      tipo:    tipoValido(r.tipo),
    })));
  } catch (e: any) {
    return NextResponse.json({ ok: false, msg: String(e?.message ?? e) }, { status: 500 });
  }
}

/** Crear o actualizar un administrador. Clave vacía = no cambiar la que ya tiene. */
export async function POST(req: NextRequest) {
  const no = await permitido(req);
  if (no) return no;

  let body: any = {};
  try { body = await req.json(); } catch { /* cuerpo inválido */ }

  const id      = limpiar(body?.id);
  const usuario = limpiar(body?.usuario).toUpperCase();
  const nombre  = limpiar(body?.nombre);
  const tipo    = tipoValido(body?.tipo);
  const clave   = limpiar(body?.clave);

  if (!id)      return NextResponse.json({ ok: false, msg: 'Falta el identificador.' }, { status: 400 });
  if (!usuario) return NextResponse.json({ ok: false, msg: 'El usuario no puede quedar vacío.' }, { status: 400 });
  if (clave && clave.length < 8) {
    return NextResponse.json({ ok: false, msg: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  try {
    // ¿Ya existe? Sirve para saber si la clave es obligatoria y para conservarla.
    const prev = await fetch(`${TABLA}?id=eq.${encodeURIComponent(id)}&select=id,clave`, {
      headers: headersAdmin(), cache: 'no-store',
    });
    const existentes: any[] = prev.ok ? await prev.json() : [];
    const existe = Array.isArray(existentes) && existentes.length > 0;

    if (!existe && !clave) {
      return NextResponse.json({ ok: false, msg: 'Un administrador nuevo necesita contraseña.' }, { status: 400 });
    }

    // Contraseña siempre cifrada. Si viene vacía en una edición, se deja la anterior.
    const claveGuardar = clave ? await bcrypt.hash(clave, 10) : String(existentes[0]?.clave ?? '');

    const res = await fetch(TABLA, {
      method: 'POST',
      headers: headersAdmin({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id, usuario, nombre, tipo, clave: claveGuardar }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return NextResponse.json({ ok: false, msg: t.slice(0, 200) || `Base de datos ${res.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, msg: String(e?.message ?? e) }, { status: 500 });
  }
}

/** Borrar un administrador. */
export async function DELETE(req: NextRequest) {
  const no = await permitido(req);
  if (no) return no;

  const id = limpiar(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ ok: false, msg: 'Falta el identificador.' }, { status: 400 });

  try {
    const res = await fetch(`${TABLA}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headersAdmin({ Prefer: 'return=minimal' }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return NextResponse.json({ ok: false, msg: t.slice(0, 200) || `Base de datos ${res.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, msg: String(e?.message ?? e) }, { status: 500 });
  }
}
