import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { Profile } from '@/types';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

/**
 * Validates the caller's session from request cookies and returns the active approved Profile.
 * Returns null if unauthenticated or not approved.
 */
export async function getAuthenticatedUser(): Promise<Profile | null> {
  if (isMockEnabled()) {
    return getMockStore().currentUser;
  }

  if (!db) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id));

    if (!profile || !profile.isApproved) return null;

    const divs = await db.select().from(schema.divisions);
    const div = divs.find((d) => d.id === profile.divisionId);

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber,
      avatarUrl: profile.avatarUrl,
      role: profile.role,
      divisionId: profile.divisionId,
      divisionName: div?.name,
      isApproved: profile.isApproved,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
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
