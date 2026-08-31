'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';
import '@/styles/auth.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setReady(Boolean(data.session));
        if (!data.session) setMessage('Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.');
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && (event === 'PASSWORD_RECOVERY' || session)) setReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

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
      setMessage('Sesi reset tidak ditemukan. Minta tautan reset baru.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSubmitting(false);
    if (error) {
      setMessage('Kata sandi gagal diperbarui. Tautan mungkin sudah kedaluwarsa.');
      return;
    }
    setIsSuccess(true);
    await supabase.auth.signOut();
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <FullLogoIEEE height={36} fill="#1E1E1E" />
          <h1 className="auth-title">Buat Kata Sandi Baru</h1>
          <p className="auth-subtitle">Perbarui kata sandi akun COPM Anda.</p>
        </div>
        {message && (
          <div className={`auth-error-panel ${isSuccess ? 'auth-success-panel' : ''}`} role="alert">
            {isSuccess ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <div className="auth-error-content"><strong>{message}</strong></div>
          </div>
        )}
        {!isSuccess ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">Kata Sandi Baru</label>
              <input id="new-password" className="form-input" type="password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">Konfirmasi Kata Sandi</label>
              <input id="confirm-password" className="form-input" type="password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !ready}>
              {isSubmitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
            </button>
          </form>
        ) : (
          <button type="button" className="btn-primary" onClick={() => router.push('/login')}>Kembali ke Login</button>
        )}
      </div>
    </div>
  );
}
