'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getAllUsersAction } from '@/app/actions/auth';
import { AlertCircle } from 'lucide-react';
import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';
import '@/styles/auth.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError || !data.user) {
        if (authError?.message?.toLowerCase().includes('email not confirmed')) {
          setError('Email belum dikonfirmasi atau administrator belum menyetujui akun.');
        } else if (authError?.message?.toLowerCase().includes('invalid login credentials')) {
          setError('Email atau kata sandi tidak cocok.');
        } else {
          setError(authError?.message || 'Email atau kata sandi tidak valid.');
        }
        setIsSubmitting(false);
        return;
      }

      // Check profile approval status
      const users = await getAllUsersAction();
      const userProfile = users.find((u) => u.id === data.user.id || u.email.toLowerCase() === cleanEmail);

      if (userProfile && !userProfile.isApproved) {
        await supabase.auth.signOut();
        setError('Akun Anda sedang menunggu persetujuan administrator.');
        setIsSubmitting(false);
        return;
      }

      // Successful login
      window.location.href = '/';
    } catch {
      setError('Terjadi kesalahan saat masuk.');
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

        {error && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--accent-red-light)',
              border: '1px solid #fca5a5',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-red)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertCircle size={15} />
            <span>{error}</span>
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

