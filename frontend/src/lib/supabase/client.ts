import { createBrowserClient } from '@supabase/ssr';

// Valores hardcodeados — proyecto Supabase ACTIVO: fykdyalpuydkwfjqguip
// (organización futuroantioquia-sys, plan Pro).
// Migrado desde gsovtgtrsqzoruvgmhed el 18/08/2026: ese proyecto estaba en
// plan gratis y quedó bloqueado por exceder el cupo de 500 MB.
// La clave publicable es pública por diseño (solo permite acceso con RLS).
// NO usar process.env aquí: las env vars en Vercel pueden apuntar al proyecto viejo.
export const SUPABASE_URL = 'https://fykdyalpuydkwfjqguip.supabase.co';

export const SUPABASE_ANON_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0';

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
