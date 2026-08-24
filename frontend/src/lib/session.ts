// ─────────────────────────────────────────────────────────────────────────────
//  session.ts  ·  SÓLO SERVIDOR — no importar desde componentes de cliente.
//
//  Firma y valida la "prueba de sesión" con HMAC-SHA256 usando Web Crypto,
//  que funciona tanto en el runtime Edge (middleware) como en Node (API routes).
//
//  Esquema de dos cookies:
//    • futuro-session : LEGIBLE por el navegador (la usa la interfaz para saber
//                       el rol). Valores: '1' | 'contabilidad' | 'profesor' | 'deportista'.
//    • fa-sig         : HttpOnly + FIRMADA. El middleware SÓLO confía en esta.
//                       Como un atacante no conoce el secreto del servidor, no
//                       puede fabricar una firma válida → ya no puede "hacerse admin"
//                       escribiendo la cookie a mano en la consola del navegador.
// ─────────────────────────────────────────────────────────────────────────────

// ─── EL SECRETO DE FIRMA ─────────────────────────────────────────────────────
//  BLINDAJE (agosto 2026): antes había un secreto ESCRITO EN EL CÓDIGO. Quien
//  viera el repositorio podía fabricarse una cookie firmada con rol '1' y entrar
//  como super-administrador sin contraseña. Ahora el secreto vive SOLO en la
//  variable de entorno SESSION_SECRET (Vercel → Settings → Environment Variables).
//
//  IMPORTANTE: configura SESSION_SECRET en Vercel ANTES de publicar esta versión.
//  Sin ella, nadie podrá iniciar sesión (falla cerrado, que es lo seguro).
//  RESPALDO TEMPORAL: si la variable no está configurada, se usa este valor para
//  que la plataforma NO se caiga. Es un valor NUEVO (el anterior quedó expuesto).
//  En cuanto configures SESSION_SECRET en Vercel, este respaldo deja de usarse.
const RESPALDO_TEMPORAL = 'fa-2026-8Kq3Zt7vNc1PwLxRd9YbHm4JsEgU6TaQ2VnFo0XiCyBr';

const SECRET =
  (typeof process !== 'undefined' && process.env && process.env.SESSION_SECRET) ||
  RESPALDO_TEMPORAL;

/** ¿Está configurado el secreto del servidor? (lo usa /api/estado-seguridad) */
export function haySecreto(): boolean {
  return typeof SECRET === 'string' && SECRET.length >= 24;
}

const DUR_MS = 24 * 60 * 60 * 1000; // 24 horas
export const DUR_SEG = 24 * 60 * 60;

export const COOKIE_LEGIBLE = 'futuro-session';
export const COOKIE_FIRMA   = 'fa-sig';

const ROLES_VALIDOS = ['1', 'contabilidad', 'deportivo', 'profesor', 'deportista'];

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function firmar(data: string): Promise<string> {
  if (!haySecreto()) throw new Error('SESSION_SECRET no está configurado en el servidor');
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** Crea el token firmado para la cookie fa-sig.
 *  `role` usa los mismos valores que la cookie legible.
 *  `sub` (opcional) identifica A QUIÉN pertenece la sesión — para un calidoso es
 *  el id de su deportista. BLINDAJE: sin este dato el servidor no podía
 *  distinguir a un acudiente de otro, y cualquier padre podía pedir la
 *  información de otro niño. Va después de '|' para que las sesiones antiguas
 *  (sin sujeto) sigan siendo válidas y nadie quede fuera al publicar. */
export async function crearFirma(role: string, sub?: string): Promise<string> {
  const exp = Date.now() + DUR_MS;
  const payload = sub ? `${role}.${exp}|${sub}` : `${role}.${exp}`;
  const sig = await firmar(payload);
  return `${b64url(enc.encode(payload))}.${sig}`;
}

/** Valida el token firmado. Devuelve el rol si la firma es correcta y no expiró; si no, null. */
export async function validarFirma(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  if (!haySecreto()) return null;   // sin secreto no se valida nada: falla cerrado
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, sig] = partes;

  let payload: string;
  try { payload = dec.decode(fromB64url(payloadB64)); } catch { return null; }

  const esperado = await firmar(payload);
  // Comparación de tiempo constante
  if (sig.length !== esperado.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ esperado.charCodeAt(i);
  if (diff !== 0) return null;

  const corte = payload.indexOf('|');
  const base  = corte >= 0 ? payload.slice(0, corte) : payload;

  const sep = base.lastIndexOf('.');
  if (sep < 0) return null;
  const role = base.slice(0, sep);
  const exp  = Number(base.slice(sep + 1));
  if (!exp || Date.now() > exp) return null;
  if (!ROLES_VALIDOS.includes(role)) return null;
  return role;
}

/** Igual que validarFirma pero devuelve TAMBIÉN a quién pertenece la sesión.
 *  `sub` es null en las sesiones antiguas (emitidas antes del blindaje). */
export async function validarSesion(
  token: string | undefined | null,
): Promise<{ rol: string; sub: string | null } | null> {
  const rol = await validarFirma(token);
  if (!rol || !token) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  let payload: string;
  try { payload = dec.decode(fromB64url(partes[0])); } catch { return null; }
  const corte = payload.indexOf('|');
  return { rol, sub: corte >= 0 ? payload.slice(corte + 1) : null };
}
