import { headers } from 'next/headers';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const RATE_LIMIT_WINDOW_MINUTES = 15;
export const RATE_LIMIT_MAX_FAILURES = 5;

export type LoginAttemptStage =
  | 'validation'
  | 'supabase_auth'
  | 'session_check'
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
  | 'password_reset_request'
  | 'password_reset_update'
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

export async function checkLoginRateLimit(email: string): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  if (!db) return { limited: false, retryAfterSeconds: 0 };

  try {
    const [result] = await db.execute<{ failures: number; oldest_at: string | null }>(
      sql`SELECT count(*)::int AS failures, min(created_at)::text AS oldest_at
          FROM login_attempts
          WHERE email = ${email.trim().toLowerCase()}
            AND stage = 'supabase_auth'
            AND status = 'failed'
            AND created_at > now() - interval '15 minutes'`
    );
    const failures = Number(result?.failures || 0);
    if (failures < RATE_LIMIT_MAX_FAILURES) return { limited: false, retryAfterSeconds: 0 };
    const oldest = result?.oldest_at ? new Date(result.oldest_at).getTime() : Date.now();
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MINUTES * 60_000 - Date.now()) / 1000));
    return { limited: true, retryAfterSeconds };
  } catch (error) {
    console.error('Failed to check login rate limit:', error instanceof Error ? error.message : 'Unknown database error');
    return { limited: false, retryAfterSeconds: 0 };
  }
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
    let userAgent: string | null = null;
    try {
      const requestHeaders = await headers();
      userAgent = trimTo(requestHeaders.get('user-agent') || undefined, MAX_USER_AGENT_LENGTH);
    } catch {
      // Allowed when called outside HTTP request context (e.g. background tasks or test scripts)
    }
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

export { classifyAuthError, classifyLoginError } from '@/lib/auth-errors';

