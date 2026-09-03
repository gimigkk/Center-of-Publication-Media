'use server';

import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { signupSchema } from '@/lib/validations';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCorrelationId, recordLoginAttempt, type LoginDiagnostic } from '@/lib/login-attempts';
import { classifyAuthError } from '@/lib/auth-errors';
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

const stageResult = (
  correlationId: string,
  stage: LoginDiagnostic['stage'],
  code: string,
  message: string,
  providerStatus?: number
): LoginDiagnostic => ({
  correlationId,
  stage,
  status: 'failed',
  code,
  message,
  providerStatus,
});

async function recordSignup(email: string, diagnostic: LoginDiagnostic) {
  await recordLoginAttempt({
    correlationId: diagnostic.correlationId,
    email,
    stage: diagnostic.stage,
    status: diagnostic.status,
    errorCode: diagnostic.code,
    errorMessage: diagnostic.message,
    providerStatus: diagnostic.providerStatus,
  });
}

function toProfile(record: typeof schema.profiles.$inferSelect): Profile {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    phoneNumber: record.phoneNumber,
    avatarUrl: record.avatarUrl,
    role: record.role,
    divisionId: record.divisionId,
    isApproved: record.isApproved,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function providerStatus(error: unknown): number | undefined {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;
}

export async function createSignupAction(input: SignupInput): Promise<SignupResult> {
  const correlationId = getCorrelationId();
  const email = input.email.trim().toLowerCase();

  // 1. Validate inputs
  const validation = signupSchema.safeParse({
    fullName: input.fullName,
    email,
    phoneNumber: input.phoneNumber,
    role: input.role || 'designer',
    divisionId: input.divisionId,
  });

  if (!validation.success || input.password.length < 6) {
    const diagnostic = stageResult(
      correlationId,
      'signup_validation',
      'INVALID_INPUT',
      validation.success
        ? 'Kata sandi minimal harus 6 karakter.'
        : validation.error.issues[0]?.message || 'Data pendaftaran tidak valid'
    );
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }

  // 2. Ensure database is available
  if (!db) {
    const diagnostic = stageResult(
      correlationId,
      'signup_profile_upsert',
      'DATABASE_UNAVAILABLE',
      'Layanan pendaftaran sedang tidak tersedia.'
    );
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }

  // 3. Ensure Supabase admin client is available
  const admin = createAdminClient();
  if (!admin) {
    const diagnostic = stageResult(
      correlationId,
      'signup_auth_create',
      'AUTH_SERVER_UNAVAILABLE',
      'Layanan autentikasi server belum dikonfigurasi.'
    );
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }

  // 4. Quick check if an active profile already exists in PostgreSQL
  const [existingProfile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.email, email));

  if (existingProfile && existingProfile.avatarUrl) {
    const diagnostic = stageResult(
      correlationId,
      'signup_existing_account',
      'EXISTING_ACCOUNT',
      'Email ini sudah terdaftar. Silakan login menggunakan akun Anda.'
    );
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }

  // 5. Create or verify Supabase Auth user
  let authUser: { id: string; email?: string } | null = null;
  let newlyCreatedAuthId: string | null = null;

  const createResult = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName.trim(),
      phone_number: input.phoneNumber?.trim() || null,
    },
  });

  if (createResult.error || !createResult.data.user) {
    const errorMsg = (createResult.error?.message || '').toLowerCase();
    const isAlreadyExists =
      errorMsg.includes('already') ||
      errorMsg.includes('exists') ||
      (createResult.error && 'code' in createResult.error && (createResult.error as { code?: string }).code === 'email_exists');

    if (isAlreadyExists) {
      // If user exists in Auth, attempt password verification so they can resume / complete registration
      const verifyClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const verified = await verifyClient.auth.signInWithPassword({
        email,
        password: input.password,
      });

      if (verified.error || !verified.data.user) {
        const diagnostic = stageResult(
          correlationId,
          'signup_existing_account',
          'EXISTING_ACCOUNT',
          'Email ini sudah terdaftar. Gunakan kata sandi akun tersebut untuk melanjutkan.',
          providerStatus(verified.error)
        );
        await recordSignup(email, diagnostic);
        return { success: false, diagnostic };
      }
      authUser = verified.data.user;
    } else {
      const diagnostic = stageResult(
        correlationId,
        'signup_auth_create',
        'AUTH_CREATE_FAILED',
        classifyAuthError(createResult.error, 'signup').message,
        providerStatus(createResult.error)
      );
      await recordSignup(email, diagnostic);
      return { success: false, diagnostic };
    }
  } else {
    authUser = createResult.data.user;
    newlyCreatedAuthId = authUser.id;
  }

  // 6. Atomic Profile creation & avatar upload with rollback on failure
  try {
    const [existing] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, authUser.id));

    let divisionId = input.divisionId?.trim() || existing?.divisionId || null;
    if (!divisionId) {
      const [creative] = await db
        .select()
        .from(schema.divisions)
        .where(eq(schema.divisions.name, 'Creative & Marketing'));
      divisionId = creative?.id || null;
    }

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

    if (!profile) throw new Error('Profil gagal disimpan ke database.');

    // 7. Resilient Avatar Upload (Non-fatal to protect account creation)
    let avatarUrl = profile.avatarUrl;
    if (input.avatarDataUrl) {
      try {
        const match = input.avatarDataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
        if (match) {
          const rawFormat = match[1].toLowerCase();
          const extension = rawFormat === 'jpeg' || rawFormat === 'jpg' ? 'jpg' : rawFormat;
          const contentType = rawFormat === 'jpeg' || rawFormat === 'jpg' ? 'image/jpeg' : `image/${rawFormat}`;
          const objectPath = `${authUser.id}/avatar.${extension}`;

          const upload = await admin.storage.from('avatars').upload(
            objectPath,
            Buffer.from(match[2], 'base64'),
            { contentType, cacheControl: '3600', upsert: true }
          );

          if (upload.error) {
            console.error('Storage avatar upload error (non-fatal):', upload.error);
          } else {
            avatarUrl = admin.storage.from('avatars').getPublicUrl(objectPath).data.publicUrl;
            const [updated] = await db
              .update(schema.profiles)
              .set({ avatarUrl, updatedAt: new Date() })
              .where(eq(schema.profiles.id, authUser.id))
              .returning();
            if (updated) Object.assign(profile, updated);
          }
        }
      } catch (avatarError) {
        console.error('Failed to process avatar during signup (non-fatal):', avatarError);
      }
    }

    // 8. Update Supabase Auth user metadata
    await admin.auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        full_name: profile.fullName,
        phone_number: profile.phoneNumber,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      },
      email_confirm: true,
    }).catch((metaErr) => {
      console.warn('Failed to sync auth user metadata (non-fatal):', metaErr);
    });

    // 9. Server-side session establishment
    try {
      const serverClient = await createServerSupabaseClient();
      await serverClient.auth.signInWithPassword({ email, password: input.password });
    } catch (sessionErr) {
      console.warn('Could not establish SSR session on server during signup:', sessionErr);
    }

    const diagnostic: LoginDiagnostic = {
      correlationId,
      stage: 'signup_complete',
      status: 'success',
      code: 'SIGNUP_COMPLETE',
      message: 'Pendaftaran akun berhasil.',
    };
    await recordSignup(email, diagnostic);
    return { success: true, profile: toProfile(profile), diagnostic };
  } catch (error: unknown) {
    // ROLLBACK: If a new Auth user was created but DB insertion crashed,
    // delete the orphaned auth user to prevent zombie account state.
    if (newlyCreatedAuthId) {
      console.warn('Rolling back orphaned auth user:', newlyCreatedAuthId);
      await admin.auth.admin.deleteUser(newlyCreatedAuthId).catch((rollbackErr) => {
        console.error('Rollback failed:', rollbackErr);
      });
    }

    const classified = classifyAuthError(error, 'signup');
    const diagnostic = stageResult(
      correlationId,
      'signup_profile_upsert',
      'SIGNUP_FAILED',
      classified.message,
      providerStatus(error)
    );
    await recordSignup(email, diagnostic);
    return { success: false, diagnostic };
  }
}
