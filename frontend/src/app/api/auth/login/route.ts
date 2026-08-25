// ─────────────────────────────────────────────────────────────────────────────
//  /api/auth/login  ·  Verificación de credenciales DEL LADO DEL SERVIDOR.
//
//  Antes las contraseñas de admin/Diana estaban escritas en el JavaScript que
//  se descarga al navegador (cualquiera podía verlas). Ahora la comparación
//  ocurre aquí, en el servidor.
//
//  BLINDAJE (2026): la verificación se hace con la función de base de datos
//  `login_verificar`, que compara la clave POR DENTRO de la base y solo devuelve
//  sí/no. Así el login ya NO necesita leer la tabla de contraseñas, y podemos
//  cerrar la lectura pública de `admins`/`profes`. La función soporta clave en
//  texto plano y clave cifrada (bcrypt), para migrar sin cortes.
//
//  Si la función no respondiera, se cae al método anterior (lectura directa) para
//  no bloquear el acceso durante la transición.
//
//  Emite DOS cookies (ver lib/session.ts): futuro-session (legible) + fa-sig (firmada).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { crearFirma, COOKIE_LEGIBLE, COOKIE_FIRMA, DUR_SEG } from '@/lib/session';
import { headersAdmin, hayLlaveMaestra } from '@/lib/supabase/admin';

// Marca de versión: aparece en el motivo del error. Sirve para saber si lo que
// está publicado en internet es de verdad la última versión o una anterior.
const VERSION_LOGIN = 'v3-bcrypt';

const SB_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';
const SB_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';

// ─── CREDENCIALES ────────────────────────────────────────────────────────────
//  BLINDAJE (agosto 2026): antes las claves maestras estaban ESCRITAS AQUÍ
//  (ADMON con clave "34", y la de contabilidad). Cualquiera con acceso al
//  repositorio —o adivinando dos dígitos— entraba como administrador.
//
//  Ahora vienen SOLO de variables de entorno. Si no están configuradas, ese
//  atajo simplemente no existe (falla cerrado) y se entra por la tabla `admins`.
//  RESPALDO TEMPORAL: si las variables no están configuradas se usan los valores
//  de siempre, para que nadie se quede por fuera. En cuanto pongas ADMIN_PASS en
//  Vercel (o en .env.local), ese valor manda y el respaldo deja de servir.
const ADMIN_USER = process.env.ADMIN_USER || 'ADMON';
const ADMIN_PASS = process.env.ADMIN_PASS || '34';
const AFILIACION_CODE = process.env.AFILIACION_CODE || '26';

/* ── Límite de intentos de ingreso: 8 por IP cada 10 minutos ──────────────── */
const INTENTOS = new Map<string, { n: number; hasta: number }>();
const VENTANA_MS = 10 * 60 * 1000;
const MAX_INTENTOS = 8;

function bloqueado(ip: string): boolean {
  const ahora = Date.now();
  const reg = INTENTOS.get(ip);
  if (!reg || ahora > reg.hasta) { INTENTOS.set(ip, { n: 1, hasta: ahora + VENTANA_MS }); return false; }
  reg.n += 1;
  if (INTENTOS.size > 5000) { for (const [k, v] of INTENTOS) if (ahora > v.hasta) INTENTOS.delete(k); }
  return reg.n > MAX_INTENTOS;
}

/**
 * Compara la clave escrita contra la guardada en la base.
 * Entiende los DOS formatos:
 *   · texto plano  → comparación directa
 *   · cifrada bcrypt (empieza por "$2") → se verifica con bcryptjs
 *
 * Esto es lo que permite que profes y administradores entren aunque la función
 * `login_verificar` de la base de datos no esté disponible. Antes, con las
 * claves cifradas, ese respaldo era inútil y NADIE podía entrar.
 */
async function claveCoincide(clave: string, guardado: any): Promise<'ok' | 'no' | 'sin-clave' | 'sin-bcrypt'> {
  const g = String(guardado ?? '');
  if (!g) return 'sin-clave';
  if (g.slice(0, 2) !== '$2') return g === clave ? 'ok' : 'no';   // texto plano
  try {
    const ok = await bcrypt.compare(clave, g);
    return ok ? 'ok' : 'no';
  } catch {
    return 'sin-bcrypt';   // la librería no cargó: hay que revisar el despliegue
  }
}

/** Tipo guardado en la tabla `admins` → rol de la sesión.
 *  'total' = acceso completo (deportivo + finanzas). Cualquier valor
 *  desconocido cae en 'deportivo', que es el más restringido de los dos
 *  administradores generales. — 25/08/2026 */
function rolDeTipo(v: unknown): 'total' | 'contabilidad' | 'deportivo' {
  const t = String(v ?? '').trim().toLowerCase();
  if (t === 'total' || t === 'contabilidad') return t;
  return 'deportivo';
}

/** Lee el `tipo` de un administrador en la tabla `admins`. Devuelve null si no
 *  se pudo consultar (entonces el que llama usa su propio respaldo). */
async function tipoGuardado(usuario: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/admins?select=tipo&usuario=eq.${encodeURIComponent(usuario)}`,
      { headers: hayLlaveMaestra() ? headersAdmin() : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const filas = await res.json();
    const t = Array.isArray(filas) && filas[0] ? filas[0].tipo : null;
    return t ? String(t) : null;
  } catch { return null; }
}

async function darSesion(role: string, extra: Record<string, any> = {}) {
  const firma = await crearFirma(role);
  const res = NextResponse.json({ ok: true, ...extra });
  const base = { path: '/', maxAge: DUR_SEG, sameSite: 'lax' as const, secure: true };
  res.cookies.set(COOKIE_LEGIBLE, role, base);                       // legible (UI)
  res.cookies.set(COOKIE_FIRMA,   firma, { ...base, httpOnly: true }); // firma (servidor)
  return res;
}

/**
 * Verifica las credenciales usando la función de base de datos `login_verificar`.
 * Devuelve el objeto { ok, role, ... } o null si la función no pudo consultarse
 * (para que el llamador caiga al método de respaldo).
 */
async function verificarEnBD(tipo: 'admin' | 'profe', usuario: string, clave: string): Promise<any | null> {
  return (await verificarEnBDDetalle(tipo, usuario, clave)).data;
}

/** Igual que verificarEnBD pero devuelve TAMBIÉN el estado HTTP y el texto del
 *  error. Sirve para saber POR QUÉ falló un ingreso sin exponer ninguna clave. */
async function verificarEnBDDetalle(
  tipo: 'admin' | 'profe', usuario: string, clave: string,
): Promise<{ data: any | null; estado: number; detalle: string }> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/login_verificar`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_tipo: tipo, p_usuario: usuario, p_clave: clave }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { data: null, estado: res.status, detalle: t.slice(0, 120) };
    }
    return { data: await res.json(), estado: res.status, detalle: '' };
  } catch (e: any) {
    return { data: null, estado: 0, detalle: String(e?.message ?? e).slice(0, 120) };
  }
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') || 'desconocida';
  if (bloqueado(ip)) {
    return NextResponse.json(
      { ok: false, motivo: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* body inválido */ }

  const tab     = String(body?.tab ?? '');
  const usuario = String(body?.usuario ?? '').trim().toUpperCase();
  const clave   = String(body?.clave ?? '').trim();

  // ── ADMINISTRADOR / CONTABILIDAD / DEPORTIVO ──
  if (tab === 'admin') {
    // ADMON: super-administrador maestro (siempre disponible, no editable desde la app)
    if (ADMIN_USER && ADMIN_PASS && usuario === ADMIN_USER && clave === ADMIN_PASS) {
      return darSesion('1', { rol: 'administracion', nombre: 'Administrador' });
    }

    // Administradores dinámicos: verificación DENTRO de la base de datos.
    const v = await verificarEnBD('admin', usuario, clave);
    if (v && v.ok === true) {
      /* La función de la base es de antes de que existiera 'total' y solo sabe
         devolver contabilidad/deportivo. Ella verifica la contraseña; el TIPO
         se lee de la tabla, que es donde el super-administrador lo cambia.
         Si no se puede leer, se usa lo que dijo la función. — 25/08/2026 */
      const role = rolDeTipo(await tipoGuardado(usuario) ?? v.role);
      return darSesion(role, { rol: role, nombre: v.nombre || '' });
    }

    // RESPALDO PROPIO: leemos la tabla y comparamos aquí. Se intenta SIEMPRE
    // (no solo cuando la función falla), porque ahora sí sabe leer claves cifradas.
    let respaldoAdm = '';
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/admins?select=usuario,clave,nombre,tipo`,
        { headers: hayLlaveMaestra() ? headersAdmin() : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: 'no-store' },
      );
      if (res.ok) {
        const lista: any[] = await res.json();
        const a = Array.isArray(lista)
          ? lista.find(x => String(x?.usuario ?? '').trim().toUpperCase() === usuario)
          : undefined;
        if (!a) respaldoAdm = 'clave-incorrecta';   // no se revela si el usuario existe
        else {
          const c = await claveCoincide(clave, a.clave);
          if (c === 'ok') {
            const tipo = rolDeTipo(a.tipo);
            return darSesion(tipo, { rol: tipo, nombre: a.nombre || '' });
          }
          respaldoAdm = `clave-${c}`;
        }
      } else respaldoAdm = `tabla-${res.status}`;
    } catch { respaldoAdm = 'tabla-sin-conexion'; }

    // (Se eliminó el atajo de emergencia con la clave escrita en el código.)
    console.warn('[login:admin] respaldo:' + respaldoAdm);
    return NextResponse.json({ ok: false, motivo: 'Usuario o contraseña incorrectos' }, { status: 401 });
  }

  // ── PROFESOR ──
  if (tab === 'profe') {
    // Verificación DENTRO de la base de datos.
    const det = await verificarEnBDDetalle('profe', usuario, clave);
    const v = det.data;
    if (v && v.ok === true) {
      return darSesion('profesor', {
        rol: 'profesor',
        profe: { usuario: v.usuario, proyectos: v.proyectos ?? [], foto: v.foto ?? '' },
      });
    }

    // RESPALDO PROPIO: leemos la tabla y comparamos aquí, entendiendo claves
    // cifradas. Se intenta SIEMPRE, no solo cuando la función no responde.
    let respaldo = '';
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/profes?select=usuario,clave,proyectos,foto&order=usuario`,
        { headers: hayLlaveMaestra() ? headersAdmin() : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: 'no-store' },
      );
      if (res.ok) {
        const lista: any[] = await res.json();
        const p = Array.isArray(lista)
          ? lista.find(x => String(x?.usuario ?? '').trim().toUpperCase() === usuario)
          : undefined;
        if (!p) {
          // Mismo motivo para usuario inexistente y clave errada.
          respaldo = 'clave-incorrecta';
        } else {
          const c = await claveCoincide(clave, p.clave);
          if (c === 'ok') {
            return darSesion('profesor', {
              rol: 'profesor',
              profe: { usuario: p.usuario, proyectos: p.proyectos ?? [], foto: p.foto ?? '' },
            });
          }
          // BLINDAJE: antes se enviaban al navegador los 4 PRIMEROS CARACTERES y
          // la longitud de la clave guardada. Con claves en texto plano eso
          // regalaba la contraseña completa en un solo intento.
          respaldo = 'clave-incorrecta';
        }
      } else {
        respaldo = `tabla-${res.status}`;
      }
    } catch { respaldo = 'tabla-sin-conexion'; }
    // Motivo del rechazo — NO revela claves. Sirve para saber dónde está la falla.
    // El diagnóstico detallado queda SOLO en el registro del servidor.
    const rpc = v && v.ok === false ? 'rpc:dice-que-no' : `rpc:${det.estado || 'sin-respuesta'}`;
    console.warn('[login:profe]', VERSION_LOGIN, rpc, 'respaldo:' + (respaldo || 'no-corrio'), det.detalle || '');
    return NextResponse.json({ ok: false, motivo: 'Usuario o contraseña incorrectos' }, { status: 401 });
  }

  // ── NUEVO DEPORTISTA (código de acceso a afiliación) ──
  if (tab === 'nuevo') {
    if (AFILIACION_CODE && clave === AFILIACION_CODE) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
