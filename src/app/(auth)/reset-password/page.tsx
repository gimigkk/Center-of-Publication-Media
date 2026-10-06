'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';
import '@/styles/auth.css';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function verifyRecoverySession() {
      try {
        // 1. Check for error parameters in query or hash
        const hash = typeof window !== 'undefined' ? window.location.hash.substring(1) : '';
        const hashParams = new URLSearchParams(hash);
        const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
        if (errorDesc) {
          if (mounted) {
            setMessage(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
            setReady(false);
            setChecking(false);
          }
          return;
        }

        // 2. PKCE verification (code query parameter)
        const code = searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (mounted) {
            if (!error) {
              setReady(true);
              setMessage(null);
              setChecking(false);
              return;
            } else {
              setMessage('Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.');
              setReady(false);
              setChecking(false);
              return;
            }
          }
        }

        // 3. Implicit tokens in URL hash (#access_token=...&refresh_token=...)
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (mounted && !error) {
            setReady(true);
            setMessage(null);
            setChecking(false);
            return;
          }
        }

        // 4. Check if an active session already exists
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          if (data.session) {
            setReady(true);
            setMessage(null);
            setChecking(false);
            return;
          }

          // Allow a brief buffer for supabase listener to pick up hash fragments
          setTimeout(async () => {
            if (!mounted) return;
            const { data: retryData } = await supabase.auth.getSession();
            if (retryData.session) {
              setReady(true);
              setMessage(null);
            } else {
              setReady(false);
              setMessage('Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.');
            }
            setChecking(false);
          }, 400);
        }
      } catch {
        if (mounted) {
          setReady(false);
          setMessage('Terjadi kendala saat memverifikasi tautan reset kata sandi.');
          setChecking(false);
        }
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && (event === 'PASSWORD_RECOVERY' || (session && !ready))) {
        setReady(true);
        setMessage(null);
        setChecking(false);
      }
    });

    verifyRecoverySession();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, searchParams, ready]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage('Kata sandi minimal harus 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    if (!ready) {
      setMessage('Sesi reset tidak ditemukan atau sudah kedaluwarsa. Silakan minta tautan baru.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message || 'Kata sandi gagal diperbarui. Tautan mungkin sudah kedaluwarsa.');
      return;
    }

    setIsSuccess(true);
    setMessage('Kata sandi berhasil diperbarui! Silakan masuk kembali dengan kata sandi baru Anda.');
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign out error
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <FullLogoIEEE height={36} fill="#1E1E1E" />
          <h1 className="auth-title">Buat Kata Sandi Baru</h1>
          <p className="auth-subtitle">Perbarui kata sandi akun COPM Anda.</p>
        </div>

        {checking ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '32px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Loader2 size={16} className="animate-spin" />
            <span>Memverifikasi tautan reset kata sandi...</span>
          </div>
        ) : isSuccess ? (
          <div>
            <div className="auth-error-panel auth-success-panel" role="alert">
              <CheckCircle2 size={16} />
              <div className="auth-error-content">
                <strong>Kata Sandi Berhasil Diperbarui</strong>
                <span>Silakan masuk kembali dengan kata sandi baru Anda.</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push('/login')}
              style={{ width: '100%', marginTop: '16px', padding: '10px' }}
            >
              Kembali ke Login
            </button>
          </div>
        ) : !ready ? (
          <div>
            <div className="auth-error-panel" role="alert">
              <AlertCircle size={16} />
              <div className="auth-error-content">
                <strong>{message || 'Tautan reset tidak valid atau sudah kedaluwarsa.'}</strong>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push('/login')}
              style={{ width: '100%', marginTop: '16px', padding: '10px' }}
            >
              Kembali ke Halaman Login
            </button>
          </div>
        ) : (
          <div>
            {message && (
              <div className="auth-error-panel" role="alert" style={{ marginBottom: '16px' }}>
                <AlertCircle size={15} />
                <div className="auth-error-content">
                  <strong>{message}</strong>
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">Kata Sandi Baru</label>
                <input
                  id="new-password"
                  className="form-input"
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimal 6 karakter"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Konfirmasi Kata Sandi</label>
                <input
                  id="confirm-password"
                  className="form-input"
                  type="password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ width: '100%', padding: '10px', marginTop: '6px' }}>
                {isSubmitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
