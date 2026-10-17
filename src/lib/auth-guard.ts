import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { Profile } from '@/types';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { cookies } from 'next/headers';

type CachedSession = {
  profile: Profile;
  expiresAt: number;
};

const sessionCache = new Map<string, CachedSession>();
const SESSION_CACHE_TTL_MS = 30 * 1000;

/**
 * Validates the caller's session from request cookies and returns the active approved Profile.
 * Returns null if unauthenticated or not approved.
 */
export async function getAuthenticatedUser(includeDivision = true): Promise<Profile | null> {
  if (isMockEnabled()) {
    return getMockStore().currentUser;
  }

  if (!db) return null;

  let sessionKey = '';
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.getAll().find((c) => c.name.includes('-auth-token'));
    if (tokenCookie) {
      sessionKey = `${tokenCookie.value}:${includeDivision}`;
      const cached = sessionCache.get(sessionKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.profile;
      }
    }
  } catch {
    // Outside of request context
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    let [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id));

    if (!profile) {
      const meta = (user.user_metadata || {}) as {
        full_name?: string;
        name?: string;
        avatar_url?: string;
        phone_number?: string;
      };
      const fallbackName = meta.full_name || meta.name || user.email?.split('@')[0] || 'User';
      const fallbackAvatar = meta.avatar_url || null;
      const fallbackPhone = meta.phone_number || user.phone || null;
      const divs = await db.select().from(schema.divisions);
      const creativeDiv = divs.find((d) => d.name === 'Creative & Marketing');
      const defaultDiv = creativeDiv?.id || divs[0]?.id || null;

      try {
        const [newProfile] = await db
          .insert(schema.profiles)
          .values({
            id: user.id,
            email: user.email || '',
            fullName: fallbackName,
            phoneNumber: fallbackPhone,
            avatarUrl: fallbackAvatar,
            role: 'requestor',
            divisionId: defaultDiv,
            isApproved: false,
          })
          .onConflictDoUpdate({
            target: schema.profiles.id,
            set: { updatedAt: new Date() },
          })
          .returning();
        profile = newProfile;
      } catch (err) {
        console.error('Failed to auto-heal profile in auth-guard:', err);
      }
    }

    if (!profile || !profile.isApproved) return null;

    let divisionName: string | undefined;
    if (includeDivision && profile.divisionId) {
      const [division] = await db
        .select({ name: schema.divisions.name })
        .from(schema.divisions)
        .where(eq(schema.divisions.id, profile.divisionId));
      divisionName = division?.name;
    }

    const resultProfile: Profile = {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber,
      avatarUrl: profile.avatarUrl,
      role: profile.role,
      divisionId: profile.divisionId,
      divisionName,
      isApproved: profile.isApproved,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };

    if (sessionKey) {
      if (sessionCache.size > 200) sessionCache.clear();
      sessionCache.set(sessionKey, {
        profile: resultProfile,
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      });
    }

    return resultProfile;
  } catch {
    return null;
  }
}

/**
 * Strict server-side authorization check: throws error if caller is not an Admin.
 */
export async function requireAdmin(): Promise<Profile> {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Akses ditolak: Hanya Admin yang berhak melakukan tindakan ini.');
  }
  return user;
}
