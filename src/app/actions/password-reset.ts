'use server';

import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { loginSchema } from '@/lib/validations';
import { getCorrelationId, recordLoginAttempt, type LoginDiagnostic } from '@/lib/login-attempts';

interface PasswordResetResult {
  success: boolean;
  diagnostic: LoginDiagnostic;
}

function result(correlationId: string, status: 'success' | 'failed', code: string, message: string): PasswordResetResult {
  return {
    success: status === 'success',
    diagnostic: { correlationId, stage: 'password_reset_request', status, code, message },
  };
}

export async function requestPasswordReset(email: string): Promise<PasswordResetResult> {
  const correlationId = getCorrelationId();
  const cleanEmail = email.trim().toLowerCase();
  const validation = loginSchema.shape.email.safeParse(cleanEmail);

  if (!validation.success) {
    const response = result(correlationId, 'failed', 'INVALID_EMAIL', 'Masukkan alamat email yang valid.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!supabaseUrl || !anonKey || !appUrl) {
    const response = result(correlationId, 'failed', 'RESET_UNAVAILABLE', 'Layanan reset kata sandi belum tersedia. Hubungi administrator.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
    return response;
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${appUrl.replace(/\/$/, '')}/reset-password` });
    const response = error
      ? result(correlationId, 'failed', 'RESET_REQUEST_FAILED', 'Permintaan reset kata sandi tidak dapat diproses. Coba lagi nanti.')
      : result(correlationId, 'success', 'RESET_REQUEST_ACCEPTED', 'Tautan reset kata sandi telah dikirim ke email Anda. Periksa inbox dan folder spam.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: response.success ? 'success' : 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message, providerStatus: error?.status });
    return response;
  } catch {
    const response = result(correlationId, 'failed', 'RESET_REQUEST_FAILED', 'Permintaan reset kata sandi tidak dapat diproses. Coba lagi nanti.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
    return response;
  }
}
