'use server';

import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPasswordResetEmail } from '@/lib/email';
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const targetRedirect = `${appUrl.replace(/\/$/, '')}/reset-password`;

  // 1. Primary: Generate recovery link via Admin Client and send via Gmail SMTP
  // This bypasses Supabase free tier rate limits (3 emails/hour) and uses configured SMTP
  const adminClient = createAdminClient();
  if (adminClient) {
    try {
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: cleanEmail,
        options: { redirectTo: targetRedirect },
      });

      if (error) {
        // Obscure non-existent user for security (OWASP anti-enumeration)
        if (error.status === 404 || error.code === 'user_not_found') {
          const response = result(correlationId, 'success', 'RESET_REQUEST_ACCEPTED', 'Jika alamat email terdaftar, tautan reset kata sandi telah dikirim. Periksa inbox dan spam.');
          await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'success', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
          return response;
        }
      } else if (data?.properties?.action_link) {
        const emailResult = await sendPasswordResetEmail({
          userEmail: cleanEmail,
          resetLink: data.properties.action_link,
        });

        if (emailResult.success) {
          const response = result(correlationId, 'success', 'RESET_REQUEST_ACCEPTED', 'Tautan reset kata sandi telah dikirim ke email Anda. Periksa inbox dan folder spam.');
          await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'success', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
          return response;
        }
      }
    } catch (err: unknown) {
      console.error('Admin generateLink error, falling back to public auth:', err);
    }
  }

  // 2. Fallback: Supabase client resetPasswordForEmail
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    const response = result(correlationId, 'failed', 'RESET_UNAVAILABLE', 'Layanan reset kata sandi belum tersedia. Hubungi administrator.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
    return response;
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: targetRedirect });
    const response = error
      ? result(correlationId, 'failed', 'RESET_REQUEST_FAILED', error.status === 429 ? 'Terlalu banyak permintaan reset. Silakan tunggu beberapa saat lagi.' : 'Permintaan reset kata sandi tidak dapat diproses. Coba lagi nanti.')
      : result(correlationId, 'success', 'RESET_REQUEST_ACCEPTED', 'Tautan reset kata sandi telah dikirim ke email Anda. Periksa inbox dan folder spam.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: response.success ? 'success' : 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message, providerStatus: error?.status });
    return response;
  } catch {
    const response = result(correlationId, 'failed', 'RESET_REQUEST_FAILED', 'Permintaan reset kata sandi tidak dapat diproses. Coba lagi nanti.');
    await recordLoginAttempt({ correlationId, email: cleanEmail, stage: response.diagnostic.stage, status: 'failed', errorCode: response.diagnostic.code, errorMessage: response.diagnostic.message });
    return response;
  }
}
