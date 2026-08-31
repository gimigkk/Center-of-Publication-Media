'use server';

import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { signupSchema } from '@/lib/validations';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyLoginError, getCorrelationId, recordLoginAttempt, type LoginDiagnostic } from '@/lib/login-attempts';
import type { Profile, UserRole } from '@/types';

interface SignupInput {
  fullName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  avatarDataUrl?: string | null;
  role?: UserRole;
  divisionId?: string | null;
}

export interface SignupResult {
  success: boolean;
  profile?: Profile;
  diagnostic: LoginDiagnostic;
}

const stageResult = (correlationId: string, stage: LoginDiagnostic['stage'], code: string, message: string, providerStatus?: number): LoginDiagnostic => ({ correlationId, stage, status: 'failed', code, message, providerStatus });

async function recordSignup(email: string, diagnostic: LoginDiagnostic) {
  await recordLoginAttempt({ correlationId: diagnostic.correlationId, email, stage: diagnostic.stage, status: diagnostic.status, errorCode: diagnostic.code, errorMessage: diagnostic.message, providerStatus: diagnostic.providerStatus });
}

function toProfile(record: typeof schema.profiles.$inferSelect): Profile {
  return { id: record.id, email: record.email, fullName: record.fullName, phoneNumber: record.phoneNumber, avatarUrl: record.avatarUrl, role: record.role, divisionId: record.divisionId, isApproved: record.isApproved, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}

function providerStatus(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

export async function createSignupAction(input: SignupInput): Promise<SignupResult> {
  const correlationId = getCorrelationId();
  const email = input.email.trim().toLowerCase();
  const validation = signupSchema.safeParse({ fullName: input.fullName, email, phoneNumber: input.phoneNumber, role: input.role || 'designer', divisionId: input.divisionId });
  if (!validation.success || input.password.length < 6) {
    const diagnostic = stageResult(correlationId, 'signup_validation', 'INVALID_INPUT', validation.success ? 'Kata sandi minimal harus 6 karakter.' : (validation.error.issues[0]?.message || 'Data pendaftaran tidak valid'));
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }
  if (!db) {
    const diagnostic = stageResult(correlationId, 'signup_profile_upsert', 'DATABASE_UNAVAILABLE', 'Layanan pendaftaran sedang tidak tersedia.');
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }
  const admin = createAdminClient();
  if (!admin) {
    const diagnostic = stageResult(correlationId, 'signup_auth_create', 'AUTH_SERVER_UNAVAILABLE', 'Layanan autentikasi server belum dikonfigurasi.');
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }
  try {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw listed.error;
    let authUser = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    const verifyClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', { auth: { persistSession: false, autoRefreshToken: false } });
    if (authUser) {
      const verified = await verifyClient.auth.signInWithPassword({ email, password: input.password });
      if (verified.error || !verified.data.user || verified.data.user.id !== authUser.id) {
        const diagnostic = stageResult(correlationId, 'signup_existing_account', 'EXISTING_ACCOUNT', 'Email ini sudah terdaftar. Gunakan kata sandi akun tersebut untuk melanjutkan.', providerStatus(verified.error));
        await recordSignup(email, diagnostic);
        return { success: false, diagnostic };
      }
      authUser = verified.data.user;
    } else {
      const created = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName.trim(), phone_number: input.phoneNumber?.trim() || null } });
      if (created.error || !created.data.user) {
        const diagnostic = stageResult(correlationId, 'signup_auth_create', 'AUTH_CREATE_FAILED', classifyLoginError(created.error).message, providerStatus(created.error));
        await recordSignup(email, diagnostic);
        return { success: false, diagnostic };
      }
      authUser = created.data.user;
    }
    const [existing] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, authUser.id));
    if (existing?.avatarUrl) {
      const diagnostic = stageResult(correlationId, 'signup_existing_account', 'EXISTING_ACCOUNT', 'Email ini sudah terdaftar. Gunakan halaman login atau Edit Profil untuk mengubah data akun.');
      await recordSignup(email, diagnostic);
      return { success: false, diagnostic };
    }

    let divisionId = input.divisionId?.trim() || existing?.divisionId || null;
    if (!divisionId) {
      const [creative] = await db.select().from(schema.divisions).where(eq(schema.divisions.name, 'Creative & Marketing'));
      divisionId = creative?.id || null;
    }

    // A retry may complete a profile created before an avatar upload failed.
    // Preserve existing account fields instead of allowing signup to edit them.
    const values = {
      email: existing?.email || email,
      fullName: existing?.fullName || input.fullName.trim(),
      phoneNumber: existing?.phoneNumber || input.phoneNumber?.trim() || null,
      avatarUrl: existing?.avatarUrl || null,
      role: existing?.role || input.role || 'designer',
      divisionId,
      isApproved: existing?.isApproved ?? true,
      updatedAt: new Date(),
    };
    const [profile] = existing
      ? await db.update(schema.profiles).set(values).where(eq(schema.profiles.id, authUser.id)).returning()
      : await db.insert(schema.profiles).values({ id: authUser.id, ...values }).returning();

    if (!profile) throw new Error('Profile was not returned after upsert');
    let avatarUrl = profile.avatarUrl;
    if (input.avatarDataUrl) {
      const match = input.avatarDataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
      if (!match) throw new Error('Invalid avatar format');
      const extension = match[1].toLowerCase().replace('jpeg', 'jpg');
      const objectPath = `${authUser.id}/avatar.${extension}`;
      const upload = await admin.storage.from('avatars').upload(objectPath, Buffer.from(match[2], 'base64'), { contentType: `image/${extension}`, cacheControl: '3600', upsert: true });
      if (upload.error) throw upload.error;
      avatarUrl = admin.storage.from('avatars').getPublicUrl(objectPath).data.publicUrl;
      const [updated] = await db.update(schema.profiles).set({ avatarUrl, updatedAt: new Date() }).where(eq(schema.profiles.id, authUser.id)).returning();
      if (updated) Object.assign(profile, updated);
    }
    const metadata = await admin.auth.admin.updateUserById(authUser.id, { user_metadata: { full_name: profile.fullName, phone_number: profile.phoneNumber, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }, email_confirm: true });
    if (metadata.error) throw metadata.error;
    const diagnostic: LoginDiagnostic = { correlationId, stage: 'signup_complete', status: 'success', code: 'SIGNUP_COMPLETE', message: 'Pendaftaran akun berhasil.' };
    await recordSignup(email, diagnostic);
    return { success: true, profile: toProfile(profile), diagnostic };
  } catch (error: unknown) {
    const diagnostic = stageResult(correlationId, 'signup_profile_upsert', 'SIGNUP_FAILED', classifyLoginError(error).message, providerStatus(error));
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }
}
