'use client';

// Esta dirección quedó de cuando la planilla vivía en /postpartido/partido.
// Ahora la planilla ES el módulo, así que aquí solo se redirige para que
// ningún enlace guardado quede roto.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirigirAPospartido() {
  const router = useRouter();
  useEffect(() => { router.replace('/postpartido'); }, [router]);
  return null;
}
