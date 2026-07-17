import { createBrowserClient } from '@supabase/ssr';

// Valores hardcodeados — proyecto Supabase activo gsovtgtrsqzoruvgmhed.
// La anon key es pública por diseño (solo permite acceso con RLS).
// NO usar process.env aquí: las env vars en Vercel pueden apuntar al proyecto viejo.
export const SUPABASE_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
