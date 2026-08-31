'use server';

import { eq } from 'drizzle-orm';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db';
import {
  checkLoginRateLimit,
  getCorrelationId,
  recordLoginAttempt,
  type LoginDiagnostic,
} from '@/lib/login-attempts';
import { classifyLoginError } from '@/lib/auth-errors';
import { loginSchema } from '@/lib/validations';

export interface LoginResult {
  success: boolean;
  diagnostic: LoginDiagnostic;
}

function diagnostic(
  correlationId: string,
  stage: LoginDiagnostic['stage'],
  status: LoginDiagnostic['status'],
  code: string,
  message: string,
  providerStatus?: number
): LoginDiagnostic {
  return { correlationId, stage, status, code, message, providerStatus };
}

export async function checkLoginRateLimitAction(
  email: string,
  requestedCorrelationId?: string
): Promise<{ limited: boolean; retryAfterSeconds: number; diagnostic?: LoginDiagnostic }> {
  const correlationId = getCorrelationId(requestedCorrelationId);
  const cleanEmail = email.trim().toLowerCase();
  const rateLimit = await checkLoginRateLimit(cleanEmail);

  if (!rateLimit.limited) return rateLimit;

  const result = diagnostic(
    correlationId,
    'supabase_auth',
    'failed',
    'RATE_LIMITED',
    `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(rateLimit.retryAfterSeconds / 60)} menit.`
  );
  await recordLoginAttempt({ ...result, email: cleanEmail });
  return { ...rateLimit, diagnostic: result };
}

export async function recordLoginFailureAction(
  email: string,
  requestedCorrelationId: string,
  providerCode?: string,
  providerMessage?: string,
  providerStatus?: number
): Promise<LoginResult> {
  const correlationId = getCorrelationId(requestedCorrelationId);
  const cleanEmail = email.trim().toLowerCase();
  const mapped = classifyLoginError({
    code: providerCode,
    message: providerMessage,
    status: providerStatus,
  });
  const result = diagnostic(
    correlationId,
    'supabase_auth',
    'failed',
    mapped.code,
    mapped.message,
    mapped.providerStatus
  );
  await recordLoginAttempt({ ...result, email: cleanEmail });
  return { success: false, diagnostic: result };
}

export async function completeLoginAction(
  email: string,
  requestedCorrelationId: string
): Promise<LoginResult> {
  const correlationId = getCorrelationId(requestedCorrelationId);
  const cleanEmail = email.trim().toLowerCase();
  const validation = loginSchema.shape.email.safeParse(cleanEmail);

  if (!validation.success) {
    const result = diagnostic(
      correlationId,
      'validation',
      'failed',
      'INVALID_EMAIL',
      'Periksa kembali alamat email Anda.'
    );
    await recordLoginAttempt({ ...result, email: cleanEmail });
    return { success: false, diagnostic: result };
  }

  if (!db) {
    const result = diagnostic(
      correlationId,
      'unexpected_error',
      'failed',
      'DATABASE_UNAVAILABLE',
      'Layanan login sedang tidak tersedia. Coba lagi nanti.'
    );
    await recordLoginAttempt({ ...result, email: cleanEmail });
    return { success: false, diagnostic: result };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user || user.email?.toLowerCase() !== cleanEmail) {
      const result = diagnostic(
        correlationId,
        'session_check',
        'failed',
        'SESSION_NOT_FOUND',
        'Login berhasil di perangkat, tetapi sesi belum dapat diverifikasi. Muat ulang halaman dan coba lagi.'
      );
      await recordLoginAttempt({ ...result, email: cleanEmail });
      return { success: false, diagnostic: result };
    }

    const [profile] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id));

    if (!profile) {
      const result = diagnostic(
        correlationId,
        'profile_lookup',
        'failed',
        'PROFILE_NOT_FOUND',
        'Login berhasil, tetapi profil akun tidak ditemukan. Hubungi administrator.'
      );
      await recordLoginAttempt({ ...result, email: cleanEmail });
      return { success: false, diagnostic: result };
    }

    if (!profile.isApproved) {
      const result = diagnostic(
        correlationId,
        'approval_check',
        'failed',
        'ACCOUNT_NOT_APPROVED',
        'Akun Anda sedang menunggu persetujuan administrator.'
      );
      await recordLoginAttempt({ ...result, email: cleanEmail });
      return { success: false, diagnostic: result };
    }

    const result = diagnostic(
      correlationId,
      'complete',
      'success',
      'LOGIN_SUCCESS',
      'Login berhasil.'
    );
    await recordLoginAttempt({ ...result, email: cleanEmail });
    return { success: true, diagnostic: result };
  } catch (error: unknown) {
    const mapped = classifyLoginError(error);
    const result = diagnostic(
      correlationId,
      'session_check',
      'failed',
      mapped.code,
      mapped.message,
      mapped.providerStatus
    );
    await recordLoginAttempt({ ...result, email: cleanEmail });
    return { success: false, diagnostic: result };
  }
}

// Kept as a compatibility alias for callers that used the former action name.
export const loginAction = completeLoginAction;
