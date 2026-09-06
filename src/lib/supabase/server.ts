import { createServerClient } from '@supabase/ssr';
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
      getAll() {
        if (cookieStore) {
          return cookieStore.getAll();
        }
        return Array.from(memoryCookies.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        if (cookieStore) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore!.set(name, value, options);
            });
          } catch {
            // Handled if called from a Server Component (where cookies are read-only)
            cookiesToSet.forEach(({ name, value }) => {
              memoryCookies.set(name, value);
            });
          }
        } else {
          cookiesToSet.forEach(({ name, value }) => {
            memoryCookies.set(name, value);
          });
        }
      },
    },
  });
}
