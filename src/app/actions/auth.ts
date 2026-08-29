'use server';

import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Profile, UserRole } from '@/types';
import { signupSchema } from '@/lib/validations';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendUserSignupEmail, sendUserApprovalEmail } from '@/lib/email';
import { createNotificationAction } from './notifications';

export async function getCurrentUserAction(): Promise<Profile | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !db) return null;

    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id));

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
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getAllUsersAction(): Promise<Profile[]> {
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

export async function approveUserAction(
  userId: string,
  newRole?: UserRole
): Promise<{ success: boolean; error?: string }> {
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
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan database' };
  }

  if (targetUser) {
    const finalRole = newRole || targetUser.role;
    // 1. Email notification
    await sendUserApprovalEmail({
      userEmail: targetUser.email,
      userFullName: targetUser.fullName,
      isApproved: true,
      role: finalRole,
    });

    // 2. In-app notification
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
  phoneNumber?: string | null;
  password?: string;
  role: 'requestor' | 'designer';
  divisionId?: string | null;
  avatarUrl: string;
}): Promise<{ success: boolean; profile?: Profile; isApproved?: boolean; error?: string }> {
  const validation = signupSchema.safeParse(formData);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Input formulir tidak valid' };
  }

  if (!db) {
    return { success: false, error: 'Database belum terhubung' };
  }

  const { fullName, email, phoneNumber, role, divisionId, avatarUrl } = validation.data;
  const profileId = formData.id || crypto.randomUUID();

  const newProfile: Profile = {
    id: profileId,
    email: email.toLowerCase().trim(),
    fullName: fullName.trim(),
    phoneNumber: phoneNumber?.trim() || null,
    avatarUrl: avatarUrl.trim(),
    role,
    divisionId: divisionId || null,
    isApproved: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const existing = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.email, newProfile.email));

    if (existing.length > 0) {
      const existingProfile = existing[0];
      await db
        .update(schema.profiles)
        .set({
          id: newProfile.id,
          fullName: newProfile.fullName,
          phoneNumber: newProfile.phoneNumber,
          avatarUrl: newProfile.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(schema.profiles.email, newProfile.email));

      return {
        success: true,
        isApproved: existingProfile.isApproved,
        profile: {
          id: existingProfile.id,
          email: existingProfile.email,
          fullName: newProfile.fullName,
          phoneNumber: newProfile.phoneNumber,
          avatarUrl: newProfile.avatarUrl,
          role: existingProfile.role,
          divisionId: existingProfile.divisionId,
          isApproved: existingProfile.isApproved,
          createdAt: existingProfile.createdAt.toISOString(),
          updatedAt: existingProfile.updatedAt.toISOString(),
        },
      };

    }

    const [inserted] = await db
      .insert(schema.profiles)
      .values({
        id: newProfile.id,
        email: newProfile.email,
        fullName: newProfile.fullName,
        phoneNumber: newProfile.phoneNumber,
        avatarUrl: newProfile.avatarUrl,
        role: newProfile.role,
        divisionId: newProfile.divisionId,
        isApproved: false,
      })
      .returning();

    newProfile.id = inserted.id;
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan saat menyimpan profil' };
  }



  // 1. Notify all Admins via Email
  const allUsers = await getAllUsersAction();
  const adminEmails = allUsers.filter((u) => u.role === 'admin').map((u) => u.email);
  await sendUserSignupEmail({
    newUserFullName: newProfile.fullName,
    newUserEmail: newProfile.email,
    newUserRole: newProfile.role,
    adminEmails,
  });

  // 2. Dispatch In-App Notification to Admins
  const adminUsers = allUsers.filter((u) => u.role === 'admin');
  for (const admin of adminUsers) {
    await createNotificationAction({
      userId: admin.id,
      title: 'Pendaftaran Anggota Baru',
      message: `${newProfile.fullName} (${newProfile.email}) mendaftar sebagai ${newProfile.role}`,
      type: 'user_signup_pending',
      actorId: newProfile.id,
      actorName: newProfile.fullName,
      actorAvatar: newProfile.avatarUrl,
    });
  }

  revalidatePath('/');
  return { success: true, isApproved: false, profile: newProfile };
}


