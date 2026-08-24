// ─────────────────────────────────────────────────────────────────────────────
//  /api/reparar-claves  ·  DESACTIVADA POR SEGURIDAD (22 de agosto de 2026).
//
//  Esta ruta tenía escritas dentro del código las contraseñas cifradas (bcrypt)
//  de los 24 profesores y de los 3 administradores. Cualquiera con acceso al
//  repositorio se las podía llevar y ponerse a descifrarlas con calma.
//
//  Si alguna vez vuelve a hacer falta restaurar claves, hazlo desde Supabase con
//  un archivo SQL guardado FUERA del repositorio — nunca desde el código.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';

export async function GET()  { return NextResponse.json({ error: 'No encontrado' }, { status: 404 }); }
export async function POST() { return NextResponse.json({ error: 'No encontrado' }, { status: 404 }); }
