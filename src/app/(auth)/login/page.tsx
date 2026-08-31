'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LoginDiagnostic } from '@/lib/login-attempts';
import Link from 'next/link';
import { loginAction } from '@/app/actions/login';
import { AlertCircle } from 'lucide-react';
import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';
import '@/styles/auth.css';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [diagnostic, setDiagnostic] = useState<LoginDiagnostic | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDiagnostic(null);
    setIsSubmitting(true);

    try {
      const result = await loginAction(email, password);
      setDiagnostic(result.diagnostic);

      if (result.success) {
        window.location.href = '/';
      }
    } catch (error: unknown) {
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
            {isSubmitting ? 'Sedang Masuk...' : 'Masuk ke Board'}
          </button>
        </form>

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

