import { create } from 'zustand';
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

export const useAuthStore = create<AuthState>((set) => ({
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
    set({ cargando: false });
  },

  logout: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
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
}));
