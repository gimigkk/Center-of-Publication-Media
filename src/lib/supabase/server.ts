import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Outside of request context (e.g. background job, CLI, tests)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const memoryCookies = new Map<string, string>();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        if (cookieStore) {
          try {
            return cookieStore.get(name)?.value;
          } catch {
            return memoryCookies.get(name);
          }
        }
        return memoryCookies.get(name);
      },
      set(name: string, value: string, options: CookieOptions) {
        if (cookieStore) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Handled if called from a Server Component or outside request
            memoryCookies.set(name, value);
          }
        } else {
          memoryCookies.set(name, value);
        }
      },
      remove(name: string, options: CookieOptions) {
        if (cookieStore) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            memoryCookies.delete(name);
          }
        } else {
          memoryCookies.delete(name);
        }
      },
    },
  });
}
