/**
 * /api/deportistas — proxy server-side hacia Supabase.
 */
import { NextResponse } from 'next/server';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? 'https://gsovtgtrsqzoruvgmhed.supabase.co';
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4';

export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/deportistas?select=id,nombre,columnas&order=nombre`,
      {
        headers: {
          'apikey':        SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type':  'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
