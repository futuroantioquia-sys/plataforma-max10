// ─────────────────────────────────────────────────────────────────────────────
//  /api/auth/calidoso  ·  Ingreso de un CALIDOSO (padre/acudiente).
//
//  BLINDAJE (agosto 2026) — ANTES esta ruta entregaba una sesión firmada a
//  cualquiera que enviara un código, SIN comprobar nada: bastaba con abrir la
//  consola del navegador y escribir una línea para entrar como calidoso y ver
//  el listado completo de deportistas. Eso era un ingreso libre.
//
//  AHORA la comprobación (código + número de documento) ocurre AQUÍ, en el
//  servidor, y la cookie de sesión solo se emite si los dos datos coinciden.
//  El navegador ya no decide quién entra; solo muestra el resultado.
//
//  Además:
//   · Límite de intentos por IP → frena la prueba masiva de códigos.
//   · La respuesta solo devuelve id y nombre. Ningún otro dato personal.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { crearFirma, COOKIE_LEGIBLE, COOKIE_FIRMA, DUR_SEG } from '@/lib/session';
import { yaRetirado } from '@/lib/retiro';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';
const HDRS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

/* ── Límite de intentos: 10 por IP cada 10 minutos ───────────────────────── */
const INTENTOS = new Map<string, { n: number; hasta: number }>();
const VENTANA_MS = 10 * 60 * 1000;
const MAX_INTENTOS = 10;

function demasiadosIntentos(ip: string): boolean {
  const ahora = Date.now();
  const reg = INTENTOS.get(ip);
  if (!reg || ahora > reg.hasta) {
    INTENTOS.set(ip, { n: 1, hasta: ahora + VENTANA_MS });
    return false;
  }
  reg.n += 1;
  // Limpieza perezosa para que el mapa no crezca sin control.
  if (INTENTOS.size > 5000) {
    for (const [k, v] of INTENTOS) if (ahora > v.hasta) INTENTOS.delete(k);
  }
  return reg.n > MAX_INTENTOS;
}

function exitoso(ip: string) {
  INTENTOS.delete(ip);
}

/* ── Comparación de documentos: sin espacios, puntos, guiones, en mayúsculas ─ */
const normDoc = (v: string) => String(v ?? '').replace(/[\s .,\-]/g, '').toUpperCase();

/** Localiza la columna que guarda el NÚMERO DE DOCUMENTO del deportista.
 *  Excluye "TIPO DE DOCUMENTO" (RC/TI/CC) y las columnas del acudiente. */
const RX_DOC = /num.*doc|^doc|doc|c[eé]dul|c\.c|identif|nit|no.*doc|cc\b/i;
function buscarDocumento(cols: Record<string, any>): string {
  const clave = Object.keys(cols || {}).find(k => {
    const kn = k.trim().normalize('NFC');
    if (/tipo/i.test(kn) || /acud/i.test(kn)) return false;
    return RX_DOC.test(kn) && cols[k] != null && String(cols[k]).trim() !== '';
  });
  return clave ? normDoc(String(cols[clave])) : '';
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'desconocida';

  if (demasiadosIntentos(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
      { status: 429 },
    );
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* cuerpo inválido */ }

  const codigo    = String(body?.codigo ?? '').trim().toUpperCase();
  const documento = normDoc(body?.documento ?? '');

  if (!codigo || !documento) {
    return NextResponse.json({ ok: false, error: 'Código o documento incorrecto' }, { status: 400 });
  }

  let id = '';
  let nombre = '';
  let estadoDep = '';   // el ESTADO de la ficha, para saber si ya se retiró

  /* ── 1. Búsqueda por código en la tabla de deportistas ─────────────────── */
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/buscar_calidoso`, {
      method: 'POST',
      headers: HDRS,
      body: JSON.stringify({ p_codigo: codigo }),
      cache: 'no-store',
    });
    if (res.ok) {
      const filas = await res.json();
      if (Array.isArray(filas)) {
        for (const f of filas) {
          const cols = typeof f?.columnas === 'string'
            ? (() => { try { return JSON.parse(f.columnas); } catch { return {}; } })()
            : (f?.columnas ?? {});
          if (buscarDocumento(cols) === documento) {
            id = String(f?.id ?? '');
            nombre = String(f?.nombre ?? '');
            const kEstado = Object.keys(cols || {}).find(k => /^estado$/i.test(k.trim()));
            estadoDep = kEstado ? String(cols[kEstado] ?? '') : '';
            break;
          }
        }
      }
    }
  } catch { /* se intenta el respaldo */ }

  /* ── 2. Respaldo: vista contable (código + documento) ──────────────────── */
  if (!id) {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/vista_contable?select=codigo,documento,nombre&codigo=eq.${encodeURIComponent(codigo)}&limit=5`,
        { headers: HDRS, cache: 'no-store' },
      );
      if (res.ok) {
        const filas = await res.json();
        const fila = Array.isArray(filas)
          ? filas.find((f: any) => normDoc(f?.documento) === documento)
          : null;
        if (fila) nombre = String(fila?.nombre ?? codigo);
      }
    } catch { /* nada */ }
  }

  if (!id && !nombre) {
    // Mismo mensaje siempre: no revelamos si el código existe o no.
    return NextResponse.json({ ok: false, error: 'Código o documento incorrecto' }, { status: 401 });
  }

  /* ── 3. Sesión firmada de rol 'deportista' (el de menor privilegio) ──────
     AL RETIRADO SÍ SE LE DEJA ENTRAR (26/08/2026). Antes se le cerraba la
     puerta apenas se le autorizaba el Paz y Salvo, y un deportista quedó por
     fuera antes de alcanzar a descargarlo. Ahora entra siempre; lo que cambia
     es a DÓNDE llega: se le avisa aquí que está retirado y la pantalla lo
     lleva derecho a su Paz y Salvo, sin el resto del portal. */
  exitoso(ip);
  const retirado = yaRetirado(estadoDep);
  // El id del deportista viaja DENTRO de la firma: así el servidor sabe de
  // quién es esta sesión y puede negar el acceso a los datos de otros niños.
  const firma = await crearFirma('deportista', id || undefined);
  const res = NextResponse.json({ ok: true, id, nombre, retirado });
  const base = { path: '/', maxAge: DUR_SEG, sameSite: 'lax' as const, secure: true };
  res.cookies.set(COOKIE_LEGIBLE, 'deportista', base);
  res.cookies.set(COOKIE_FIRMA, firma, { ...base, httpOnly: true });
  return res;
}
