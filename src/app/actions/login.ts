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

const LOGIN_TIMEOUT_MS = 10000;

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

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), LOGIN_TIMEOUT_MS);
    }),
  ]);
}

export async function loginAction(
  email: string,
  password: string,
  requestedCorrelationId?: string
): Promise<LoginResult> {
  const correlationId = getCorrelationId(requestedCorrelationId);
  const cleanEmail = email.trim().toLowerCase();

  const validation = loginSchema.safeParse({ email: cleanEmail, password });
  if (!validation.success) {
    const result = diagnostic(
      correlationId,
      'validation',
      'failed',
      'INVALID_INPUT',
      validation.error.issues[0]?.message || 'Periksa kembali email dan kata sandi.'
    );
    await recordLoginAttempt({ ...result, email: cleanEmail });
    return { success: false, diagnostic: result };
  }

  const rateLimit = await checkLoginRateLimit(cleanEmail);
  if (rateLimit.limited) {
    const result = diagnostic(
      correlationId,
      'supabase_auth',
      'failed',
      'RATE_LIMITED',
      `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(rateLimit.retryAfterSeconds / 60)} menit.`
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
    // Authenticate on the server so @supabase/ssr can persist the session cookies
    // in the same Server Action response before the browser navigates to '/'.
    const supabase = await createServerSupabaseClient();
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email: cleanEmail, password })
    );

    if (error || !data.user) {
      const mapped = classifyLoginError(error || new Error('No user returned'));
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

    const [profile] = await withTimeout(
      db.select().from(schema.profiles).where(eq(schema.profiles.id, data.user.id))
    );

    if (!profile) {
      const result = diagnostic(
        correlationId,
        'profile_lookup',
        'failed',
        'PROFILE_NOT_FOUND',
        'Login berhasil, tetapi profil akun tidak ditemukan. Hubungi administrator.'
      );
      await recordLoginAttempt({ ...result, email: cleanEmail });
      await supabase.auth.signOut();
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
      await supabase.auth.signOut();
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
      mapped.code === 'TIMEOUT' || mapped.code === 'NETWORK_ERROR' ? 'supabase_auth' : 'unexpected_error',
      'failed',
      mapped.code,
      mapped.message,
      mapped.providerStatus
    );
    await recordLoginAttempt({ ...result, email: cleanEmail });
    return { success: false, diagnostic: result };
  }
}

// Compatibility helpers for callers that need to check an already-established session.
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
  const mapped = classifyLoginError({ code: providerCode, message: providerMessage, status: providerStatus });
  const result = diagnostic(correlationId, 'supabase_auth', 'failed', mapped.code, mapped.message, mapped.providerStatus);
  await recordLoginAttempt({ ...result, email: cleanEmail });
  return { success: false, diagnostic: result };
}
