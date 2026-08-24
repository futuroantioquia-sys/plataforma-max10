import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';

export type Rol = 'administracion' | 'contable' | 'profesor' | 'padre' | 'deportista' | 'visitante';

export interface Usuario {
  id:       string;
  email:    string;
  nombre:   string;
  apellido: string;
  rol:      Rol;
  activo:   boolean;
  fotoUrl?: string | null;
  academia?: { id: string; nombre: string } | null;
}

interface AuthState {
  usuario:      Usuario | null;
  cargando:     boolean;
  error:        string | null;
  login:        (email: string, password: string) => Promise<void>;
  logout:       () => Promise<void>;
  cargarPerfil: () => Promise<void>;
  limpiarError: () => void;
}

/* ─────────────────────────────────────────────────────────────
   Almacenamiento a prueba de "memoria llena".
   El navegador solo deja guardar unos 5 MB por sitio. Las cachés de
   deportistas y fotos lo llenaban, y al iniciar sesión el guardado
   fallaba con QuotaExceededError — el ingreso se caía sin avisar.
   Ahora, si no cabe, se borran primero las cachés pesadas y se
   reintenta; la sesión siempre gana.
   ───────────────────────────────────────────────────────────── */
const CACHES_PESADAS = [
  'futuro_fotos_deportistas',
  'futuro_deportistas',
  'futuro_libro_pagos',
  'futuro_vista_contable',
  'futuro_pagos_estado',
];

const almacenamientoSeguro = {
  getItem: (nombre: string): string | null => {
    try { return localStorage.getItem(nombre); } catch { return null; }
  },
  setItem: (nombre: string, valor: string): void => {
    try { localStorage.setItem(nombre, valor); return; } catch { /* lleno */ }
    for (const k of CACHES_PESADAS) {
      try {
        localStorage.removeItem(k);
        localStorage.setItem(nombre, valor);
        console.warn('[auth] almacenamiento lleno: se liberó la caché', k);
        return;
      } catch { /* sigue faltando espacio */ }
    }
    try {
      localStorage.clear();
      localStorage.setItem(nombre, valor);
      console.warn('[auth] almacenamiento lleno: se limpió todo para poder entrar');
    } catch (e) {
      console.error('[auth] no se pudo guardar la sesión:', e);
    }
  },
  removeItem: (nombre: string): void => {
    try { localStorage.removeItem(nombre); } catch { /* noop */ }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
  usuario:  null,
  cargando: false,
  error:    null,

  login: async (email, password) => {
    set({ cargando: true, error: null });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: 'Correo o contraseña incorrectos', cargando: false });
      throw error;
    }
    await useAuthStore.getState().cargarPerfil();
    if (typeof document !== 'undefined') {
      document.cookie = 'futuro-session=1; path=/; max-age=86400; SameSite=Lax';
    }
    set({ cargando: false });
  },

  logout: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Borra la cookie firmada (HttpOnly) desde el servidor + la cookie legible.
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    if (typeof document !== 'undefined') {
      document.cookie = 'futuro-session=; path=/; max-age=0';
    }
    set({ usuario: null });
  },

  cargarPerfil: async () => {
    set({ cargando: true });
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { set({ usuario: null, cargando: false }); return; }

    const { data } = await supabase
      .from('usuarios')
      .select('id, email, nombre, apellido, rol, foto_url, activo, academias(id, nombre)')
      .eq('id', user.id)
      .single();

    if (data) {
      set({
        usuario: {
          id:       data.id,
          email:    data.email,
          nombre:   data.nombre,
          apellido: data.apellido,
          rol:      data.rol as Rol,
          activo:   data.activo,
          fotoUrl:  data.foto_url,
          academia: (data as any).academias ?? null,
        },
        cargando: false,
      });
    } else {
      set({ cargando: false });
    }
  },

  limpiarError: () => set({ error: null }),
    }),
    {
      name: 'futuro-antioquia-auth',
      storage: createJSONStorage(() => almacenamientoSeguro),
      partialize: (state) => ({ usuario: state.usuario }),
    }
  )
);
