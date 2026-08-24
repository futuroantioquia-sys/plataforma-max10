import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    'https://fykdyalpuydkwfjqguip.supabase.co',
    'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0',
    {
      cookies: {
        getAll()        { return cookieStore.getAll(); },
        setAll(list)    { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
      },
    }
  );
}
