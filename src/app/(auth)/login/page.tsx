'use client';

import { useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkLoginRateLimitAction, completeLoginAction, recordLoginFailureAction } from '@/app/actions/login';
import { classifyLoginError } from '@/lib/auth-errors';
import { useSearchParams } from 'next/navigation';
import type { LoginDiagnostic } from '@/lib/login-attempts';
import Link from 'next/link';
import { requestPasswordReset } from '@/app/actions/password-reset';
import { AlertCircle } from 'lucide-react';
import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';
import '@/styles/auth.css';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [diagnostic, setDiagnostic] = useState<LoginDiagnostic | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setResetMessage('Masukkan alamat email terlebih dahulu.');
      return;
    }
    setIsResetting(true);
    setResetMessage(null);
    const result = await requestPasswordReset(email);
    setResetMessage(result.diagnostic.message);
    setIsResetting(false);
  };

  const handleLogin = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDiagnostic(null);
    setIsSubmitting(true);

    try {
      const correlationId = crypto.randomUUID();
      const supabase = createClient();
      const rateLimit = await checkLoginRateLimitAction(email, correlationId);
      if (rateLimit.limited) {
        setDiagnostic(rateLimit.diagnostic || {
          correlationId,
          stage: 'supabase_auth',
          status: 'failed',
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak percobaan login. Coba lagi nanti.',
        });
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user) {
        const mapped = classifyLoginError(error || new Error('No user returned'));
        const result = await recordLoginFailureAction(email, correlationId, mapped.code, mapped.message, mapped.providerStatus);
        setDiagnostic(result.diagnostic);
        return;
      }

      setIsVerifying(true);
      const result = await completeLoginAction(email, correlationId);
      setIsVerifying(false);
      if (result.success) {
        window.location.replace('/');
      } else {
        setDiagnostic(result.diagnostic);
      }
    } catch (error: unknown) {
      setIsVerifying(false);
      setDiagnostic({
        correlationId: crypto.randomUUID(),
        stage: 'unexpected_error',
        status: 'failed',
        code: 'CLIENT_ERROR',
        message: error instanceof Error ? error.message : 'Terjadi kesalahan saat masuk.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}>
            <FullLogoIEEE height={36} fill="#1E1E1E" />
          </div>
          <p className="auth-subtitle">Masuk ke ruang kerja operasional kreatif Anda</p>
        </div>

        {diagnostic && (
          <div className="auth-error-panel" role="alert" aria-live="assertive">
            <AlertCircle size={15} />
            <div className="auth-error-content">
              <strong>{diagnostic.message}</strong>
              <span>
                Tahap: {diagnostic.stage} · Kode: {diagnostic.code}
                {diagnostic.providerStatus ? ` · Status: ${diagnostic.providerStatus}` : ''}
              </span>
              <small>Referensi: {diagnostic.correlationId}</small>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="auth-form">
          <div className="form-group">
            <label className="form-label">Alamat Email</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-input"
                placeholder="nama@perusahaan.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Kata Sandi</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
            style={{ width: '100%', padding: '10px', marginTop: '4px' }}
          >
            {isSubmitting ? (isVerifying ? 'Memverifikasi sesi...' : 'Sedang Masuk...') : 'Masuk ke Board'}
          </button>
        </form>

        <button type="button" className="auth-link auth-reset-link" onClick={handlePasswordReset} disabled={isResetting}>
          {isResetting ? 'Mengirim tautan...' : 'Lupa kata sandi?'}
        </button>
        {resetMessage && <span className="auth-reset-message" role="status">{resetMessage}</span>}

        <div className="auth-footer-links">
          <span>Belum punya akun?</span>
          <Link href="/signup" className="auth-link">
            Daftar Sekarang
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

