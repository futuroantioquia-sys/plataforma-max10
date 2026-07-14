'use client';
/**
 * useDeportistas — hook que carga y sincroniza deportistas desde Supabase
 * Con fallback a localStorage si Supabase no está disponible.
 */
import { useState, useEffect, useCallback } from 'react';
import { getDeportistas, saveDeportistas } from '@/lib/db';
import type { Deportista } from '@/lib/db';

export { type Deportista };

export function useDeportistas() {
  const [lista,    setLista]    = useState<Deportista[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getDeportistas()
      .then(setLista)
      .finally(() => setCargando(false));
  }, []);

  const guardar = useCallback(async (nueva: Deportista[]) => {
    setLista(nueva);
    await saveDeportistas(nueva);
  }, []);

  return { lista, cargando, guardar, setLista };
}
