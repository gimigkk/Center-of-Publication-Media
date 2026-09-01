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
            role: 'designer',
            divisionId: defaultDiv,
            isApproved: true,
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
