'use server';

import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Profile, UserRole } from '@/types';
import { signupSchema } from '@/lib/validations';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendUserSignupEmail, sendUserApprovalEmail } from '@/lib/email';
import { createNotificationAction } from './notifications';
import { getAuthenticatedUser, requireAdmin } from '@/lib/auth-guard';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export async function getCurrentUserAction(): Promise<Profile | null> {
  if (isMockEnabled()) {
    return getMockStore().currentUser;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !db) return null;

    let [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id));

    if (!profile) {
      const meta = (user.user_metadata || {}) as Record<string, any>;
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
        console.error('Failed to auto-heal profile in getCurrentUserAction:', err);
      }
    }

    if (!profile) return null;

    let divisionName: string | undefined;
    if (profile.divisionId) {
      const [div] = await db
        .select()
        .from(schema.divisions)
        .where(eq(schema.divisions.id, profile.divisionId));
      divisionName = div?.name;
    }

    return {
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
  } catch (e) {
    console.error('Failed to get current user:', e);
    return null;
  }
}

export async function signOutAction(): Promise<{ success: boolean }> {
  if (isMockEnabled()) {
    return { success: true };
  }

  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function updateProfileAction(
  userId: string,
  data: {
    fullName?: string;
    avatarUrl?: string | null;
    phoneNumber?: string | null;
  }
): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    if (data.fullName !== undefined) store.currentUser.fullName = data.fullName.trim();
    if (data.avatarUrl !== undefined) store.currentUser.avatarUrl = data.avatarUrl ? data.avatarUrl.trim() : null;
    if (data.phoneNumber !== undefined) store.currentUser.phoneNumber = data.phoneNumber?.trim() || null;
    store.currentUser.updatedAt = new Date().toISOString();

    const uIdx = store.users.findIndex((u) => u.id === userId || u.id === store.currentUser.id);
    if (uIdx !== -1) {
      store.users[uIdx] = { ...store.currentUser };
    }
    return { success: true, profile: store.currentUser };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  const sessionUser = await getAuthenticatedUser();
  if (!sessionUser) return { success: false, error: 'Sesi tidak valid' };

  if (sessionUser.id !== userId && sessionUser.role !== 'admin') {
    return { success: false, error: 'Akses ditolak: Anda hanya dapat memperbarui profil sendiri.' };
  }

  try {
    const updateData: Partial<typeof schema.profiles.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.fullName !== undefined) updateData.fullName = data.fullName.trim();
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl ? data.avatarUrl.trim() : null;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber?.trim() || null;

    const [updated] = await db
      .update(schema.profiles)
      .set(updateData)
      .where(eq(schema.profiles.id, userId))
      .returning();

    if (!updated) return { success: false, error: 'Profil tidak ditemukan' };

    const divs = await db.select().from(schema.divisions);
    const div = divs.find((d) => d.id === updated.divisionId);

    revalidatePath('/');
    return {
      success: true,
      profile: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phoneNumber: updated.phoneNumber,
        avatarUrl: updated.avatarUrl,
        role: updated.role,
        divisionId: updated.divisionId,
        divisionName: div?.name,
        isApproved: updated.isApproved,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal memperbarui profil' };
  }
}

export async function getAllUsersAction(): Promise<Profile[]> {
  if (isMockEnabled()) {
    return getMockStore().users;
  }

  if (!db) return [];
  try {
    const records = await db.select().from(schema.profiles);
    const divs = await db.select().from(schema.divisions);
    const divMap = new Map(divs.map((d) => [d.id, d.name]));

    return records.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName,
      phoneNumber: r.phoneNumber,
      avatarUrl: r.avatarUrl,
      role: r.role,
      divisionId: r.divisionId,
      divisionName: r.divisionId ? divMap.get(r.divisionId) : undefined,
      isApproved: r.isApproved,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (e) {
    console.error('Failed to get all users:', e);
    return [];
  }
}

export async function getPendingUsersAction(): Promise<Profile[]> {
  const users = await getAllUsersAction();
  return users.filter((u) => !u.isApproved);
}

export async function getDesignersAction(): Promise<Profile[]> {
  const users = await getAllUsersAction();
  return users.filter((u) => u.isApproved && (u.role === 'designer' || u.role === 'admin'));
}

import { createAdminClient } from '@/lib/supabase/admin';

export async function approveUserAction(
  userId: string,
  newRole?: UserRole
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.users.find((u) => u.id === userId);
    if (target) {
      target.isApproved = true;
      if (newRole) target.role = newRole;
      return { success: true };
    }
    return { success: false, error: 'User tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  const users = await getAllUsersAction();
  const targetUser = users.find((u) => u.id === userId);

  try {
    const updateData: Partial<typeof schema.profiles.$inferInsert> = {
      isApproved: true,
      updatedAt: new Date(),
    };
    if (newRole) updateData.role = newRole;

    await db
      .update(schema.profiles)
      .set(updateData)
      .where(eq(schema.profiles.id, userId));

    // Also auto-confirm email in Supabase Auth if service role is available
    const supabaseAdmin = createAdminClient();
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email_confirm: true,
        });
      } catch (adminErr) {
        console.warn('Supabase Admin auto-confirm note:', adminErr);
      }
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }

  if (targetUser) {
    const finalRole = newRole || targetUser.role;
    await sendUserApprovalEmail({
      userEmail: targetUser.email,
      userFullName: targetUser.fullName,
      isApproved: true,
      role: finalRole,
    });

    await createNotificationAction({
      userId: targetUser.id,
      title: 'Akun Anda Telah Disetujui! 🎉',
      message: `Selamat datang! Akun Anda telah disetujui sebagai ${finalRole}.`,
      type: 'user_approved',
    });
  }

  revalidatePath('/');
  return { success: true };
}

export async function rejectUserAction(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Akses ditolak' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    store.users = store.users.filter((u) => u.id !== userId);
    return { success: true };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  const users = await getAllUsersAction();
  const targetUser = users.find((u) => u.id === userId);

  try {
    await db.delete(schema.profiles).where(eq(schema.profiles.id, userId));
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }

  if (targetUser) {
    await sendUserApprovalEmail({
      userEmail: targetUser.email,
      userFullName: targetUser.fullName,
      isApproved: false,
    });
  }

  revalidatePath('/');
  return { success: true };
}

export async function signUpUserAction(formData: {
  id?: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  avatarUrl?: string;
  role?: UserRole;
  divisionId?: string;
}): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  const validation = signupSchema.safeParse(formData);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Data pendaftaran tidak valid' };
  }

  const userRole: UserRole = formData.role || 'designer';
  const isAutoApproved = true;

  if (isMockEnabled()) {
    const store = getMockStore();
    const creativeDiv = store.divisions.find((d) => d.name === 'Creative & Marketing');
    const resolvedDivision = formData.divisionId || creativeDiv?.id || store.divisions[0]?.id || null;

    const newUser: Profile = {
      id: formData.id || `mock-user-${Date.now()}`,
      email: formData.email.toLowerCase().trim(),
      fullName: formData.fullName.trim(),
      phoneNumber: formData.phoneNumber?.trim() || null,
      avatarUrl: formData.avatarUrl || null,
      role: userRole,
      divisionId: resolvedDivision,
      isApproved: isAutoApproved,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.users.push(newUser);
    return { success: true, profile: newUser };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  const { id: clientProvidedId, fullName, email, phoneNumber, avatarUrl, divisionId } = formData;

  try {
    const avatar = avatarUrl || null;
    const profileId = clientProvidedId || crypto.randomUUID();

    // Resolve division ID (if not provided, default to Creative & Marketing)
    let resolvedDivisionId = divisionId && divisionId.trim() ? divisionId.trim() : null;
    if (!resolvedDivisionId) {
      const divs = await db.select().from(schema.divisions);
      const creativeDiv = divs.find((d) => d.name === 'Creative & Marketing');
      resolvedDivisionId = creativeDiv ? creativeDiv.id : (divs[0]?.id || null);
    }

    const [existing] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.email, email.toLowerCase().trim()));

    let inserted;
    if (existing) {
      [inserted] = await db
        .update(schema.profiles)
        .set({
          fullName: fullName.trim(),
          phoneNumber: phoneNumber?.trim() || existing.phoneNumber,
          avatarUrl: avatar,
          role: userRole,
          divisionId: resolvedDivisionId || existing.divisionId,
          isApproved: isAutoApproved || existing.isApproved,
          updatedAt: new Date(),
        })
        .where(eq(schema.profiles.id, existing.id))
        .returning();
    } else {
      [inserted] = await db
        .insert(schema.profiles)
        .values({
          id: profileId,
          email: email.toLowerCase().trim(),
          fullName: fullName.trim(),
          phoneNumber: phoneNumber?.trim() || null,
          avatarUrl: avatar,
          role: userRole,
          divisionId: resolvedDivisionId,
          isApproved: isAutoApproved,
        })
        .returning();
    }

    if (!inserted) {
      return { success: false, error: 'Gagal menyimpan profil pengguna' };
    }

    // Auto-confirm user in Supabase Auth if requestor (instant access)
    if (isAutoApproved) {
      const supabaseAdmin = createAdminClient();
      if (supabaseAdmin) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(profileId, {
            email_confirm: true,
          });
        } catch (adminErr) {
          console.warn('Supabase Admin auto-confirm note for requestor:', adminErr);
        }
      }
    }

    // Only notify admins for approval if account is NOT auto-approved (e.g. Designers)
    if (!isAutoApproved) {
      const allUsers = await getAllUsersAction();
      const adminUsers = allUsers.filter((u) => u.role === 'admin' && u.isApproved);
      const adminEmails = adminUsers.map((u) => u.email);

      if (adminEmails.length > 0) {
        await sendUserSignupEmail({
          newUserFullName: inserted.fullName,
          newUserEmail: inserted.email,
          newUserRole: inserted.role,
          adminEmails,
        });
      }

      for (const admin of adminUsers) {
        await createNotificationAction({
          userId: admin.id,
          title: 'Pendaftaran Akun Baru',
          message: `${inserted.fullName} (${inserted.email}) telah mendaftar sebagai ${inserted.role}.`,
          type: 'user_signup_pending',
        });
      }
    }

    revalidatePath('/');
    return {
      success: true,
      profile: {
        id: inserted.id,
        email: inserted.email,
        fullName: inserted.fullName,
        phoneNumber: inserted.phoneNumber,
        avatarUrl: inserted.avatarUrl,
        role: inserted.role,
        divisionId: inserted.divisionId,
        isApproved: inserted.isApproved,
        createdAt: inserted.createdAt.toISOString(),
        updatedAt: inserted.updatedAt.toISOString(),
      },
    };
  } catch (e: unknown) {
    console.error('Sign up user profile error:', e);
    const msg = e instanceof Error ? e.message : 'Kesalahan database';
    return { success: false, error: msg };
  }
}
