import { headers } from 'next/headers';
import { db, schema } from '@/lib/db';

export type LoginAttemptStage =
  | 'validation'
  | 'supabase_auth'
  | 'profile_lookup'
  | 'approval_check'
  | 'complete'
  | 'signup_validation'
  | 'signup_auth_create'
  | 'signup_auth_session'
  | 'signup_existing_account'
  | 'signup_profile_upsert'
  | 'signup_avatar_upload'
  | 'signup_complete'
  | 'signup_client'
  | 'signup_auto_login'
  | 'unexpected_error';

export type LoginAttemptStatus = 'success' | 'failed';

export interface LoginDiagnostic {
  correlationId: string;
  stage: LoginAttemptStage;
  status: LoginAttemptStatus;
  code: string;
  message: string;
  providerStatus?: number;
}

interface LoginAttemptInput {
  correlationId: string;
  email: string;
  stage: LoginAttemptStage;
  status: LoginAttemptStatus;
  errorCode?: string;
  errorMessage?: string;
  providerStatus?: number;
}

const MAX_EMAIL_LENGTH = 320;
const MAX_ERROR_LENGTH = 240;
const MAX_USER_AGENT_LENGTH = 500;

function trimTo(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.trim().slice(0, maxLength) || null;
}

export function isCorrelationId(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function getCorrelationId(value?: string): string {
  return isCorrelationId(value) ? value : crypto.randomUUID();
}

export async function recordLoginAttempt(input: LoginAttemptInput): Promise<void> {
  if (!db) {
    console.warn('Login attempt could not be recorded: database is unavailable', {
      correlationId: input.correlationId,
      stage: input.stage,
    });
    return;
  }

  try {
    const requestHeaders = await headers();
    const userAgent = trimTo(requestHeaders.get('user-agent') || undefined, MAX_USER_AGENT_LENGTH);
    const email = input.email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);

    await db.insert(schema.loginAttempts).values({
      correlationId: input.correlationId,
      email,
      stage: input.stage,
      status: input.status,
      errorCode: trimTo(input.errorCode, 100),
      errorMessage: trimTo(input.errorMessage, MAX_ERROR_LENGTH),
      providerStatus: input.providerStatus,
      userAgent,
    });
  } catch (error) {
    // Observability must never turn an authentication result into a failure.
    console.error('Failed to record login attempt:', {
      correlationId: input.correlationId,
      stage: input.stage,
      error: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
}

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

function toErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== 'object') return {};
  return error as ErrorLike;
}

export function classifyLoginError(error: unknown): {
  code: string;
  message: string;
  providerStatus?: number;
} {
  const details = toErrorLike(error);
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : '';
  const name = typeof details.name === 'string' ? details.name.toLowerCase() : '';
  const providerMessage = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  const providerStatus = typeof details.status === 'number' ? details.status : undefined;
  const combined = `${code} ${name} ${providerMessage}`;

  if (combined.includes('email not confirmed') || combined.includes('email_not_confirmed')) {
    return {
      code: 'EMAIL_NOT_CONFIRMED',
      message: 'Email akun belum dikonfirmasi di Supabase.',
      providerStatus,
    };
  }

  if (
    combined.includes('rate limit') ||
    combined.includes('too many requests') ||
    code.includes('over_request_rate_limit')
  ) {
    return {
      code: 'RATE_LIMITED',
      message: 'Terlalu banyak percobaan login. Coba lagi beberapa saat.',
      providerStatus,
    };
  }

  if (combined.includes('banned') || combined.includes('disabled')) {
    return {
      code: 'ACCOUNT_DISABLED',
      message: 'Akun ini sedang dinonaktifkan.',
      providerStatus,
    };
  }

  if (
    combined.includes('invalid login credentials') ||
    code === 'invalid_credentials' ||
    (providerStatus === 400 && combined.includes('credentials'))
  ) {
    return {
      code: 'INVALID_CREDENTIALS',
      message: 'Email atau kata sandi tidak cocok.',
      providerStatus,
    };
  }

  if (
    combined.includes('fetch failed') ||
    combined.includes('network') ||
    combined.includes('failed to fetch') ||
    name.includes('network')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Layanan login tidak dapat dijangkau. Periksa koneksi internet.',
      providerStatus,
    };
  }

  if (combined.includes('timeout')) {
    return {
      code: 'TIMEOUT',
      message: 'Layanan login terlalu lama merespons. Coba lagi.',
      providerStatus,
    };
  }

  return {
    code: 'AUTH_ERROR',
    message: 'Login gagal karena kesalahan autentikasi. Coba lagi atau hubungi administrator.',
    providerStatus,
  };
}
