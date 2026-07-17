/**
 * /api/profes — proxy server-side hacia Supabase.
 * El servidor de Vercel SÍ alcanza Supabase aunque el móvil no pueda.
 */
import { NextResponse } from 'next/server';

// Hardcodeado — no usar process.env (pueden apuntar al proyecto Supabase viejo).
const SB_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

export async function GET() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/profes?select=*&order=usuario`, {
      headers: {
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type':  'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
