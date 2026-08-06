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

const SECRET =
  (typeof process !== 'undefined' && process.env && process.env.SESSION_SECRET) ||
  'FA-2026-mx100-firma-servidor-4b8c1e7a9d2f6034b5e8c1a7d9f2038e';

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
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** Crea el token firmado para la cookie fa-sig. `role` usa los mismos valores que la cookie legible. */
export async function crearFirma(role: string): Promise<string> {
  const exp = Date.now() + DUR_MS;
  const payload = `${role}.${exp}`;
  const sig = await firmar(payload);
  return `${b64url(enc.encode(payload))}.${sig}`;
}

/** Valida el token firmado. Devuelve el rol si la firma es correcta y no expiró; si no, null. */
export async function validarFirma(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
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

  const sep = payload.lastIndexOf('.');
  if (sep < 0) return null;
  const role = payload.slice(0, sep);
  const exp  = Number(payload.slice(sep + 1));
  if (!exp || Date.now() > exp) return null;
  if (!ROLES_VALIDOS.includes(role)) return null;
  return role;
}
