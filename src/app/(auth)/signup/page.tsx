'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signUpUserAction } from '@/app/actions/auth';
import { createSignupAction } from '@/app/actions/signup';
import type { LoginDiagnostic } from '@/lib/login-attempts';
import { getDivisionsAction } from '@/app/actions/divisions';
import { Division } from '@/types';
import { Camera, AlertCircle, Clock, Check } from 'lucide-react';
import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';
import { compressImageToAvatarDataUrl } from '@/lib/utils';
import '@/styles/auth.css';

export default function SignupPage() {
  const router = useRouter();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'requestor' | 'designer'>('designer');
  const [divisionId, setDivisionId] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<LoginDiagnostic | null>(null);
  const [isSubmittedPending, setIsSubmittedPending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setSignupError = (message: string, stage: LoginDiagnostic['stage'], code = 'SIGNUP_ERROR') => {
    setError({ correlationId: crypto.randomUUID(), stage, status: 'failed', code, message });
  };

  const handleExistingAccount = () => {
    window.location.href = `/login?email=${encodeURIComponent(email.trim().toLowerCase())}`;
  };

  useEffect(() => {
    getDivisionsAction().then((divs) => {
      const sorted = [...divs].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
      setDivisions(sorted);
      if (sorted.length > 0) setDivisionId(sorted[0].id);
    });
  }, []);


  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSignupError('Harap pilih file gambar yang valid (JPG, PNG, WebP)', 'signup_avatar_upload', 'INVALID_AVATAR');
      return;
    }

    try {
      const compressed = await compressImageToAvatarDataUrl(file, 256, 0.85);
      setAvatarPreview(compressed);
      setError(null);
    } catch {
      setSignupError('Gagal memproses gambar', 'signup_avatar_upload', 'AVATAR_PROCESSING_FAILED');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setSignupError('Harap masukkan nama lengkap Anda', 'signup_validation', 'INVALID_NAME');
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setSignupError('Harap masukkan alamat email Anda', 'signup_validation', 'INVALID_EMAIL');
      return;
    }
    const cleanPhoneNumber = phoneNumber.trim();
    if (!cleanPhoneNumber) {
      setSignupError('Nomor WhatsApp / HP wajib diisi', 'signup_validation', 'INVALID_PHONE');
      return;
    }
    if (!password || password.length < 6) {
      setSignupError('Kata sandi minimal harus 6 karakter', 'signup_validation', 'INVALID_PASSWORD');
      return;
    }
    if (!avatarPreview) {
      setSignupError('Foto profil wajib diunggah untuk avatar kartu & kursor kolaborator.', 'signup_avatar_upload', 'AVATAR_REQUIRED');
      return;
    }
    if (role === 'requestor' && divisions.length > 0 && (!divisionId || divisionId.trim() === '')) {
      setSignupError('Harap pilih divisi Requester Anda', 'signup_validation', 'DIVISION_REQUIRED');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createSignupAction({
        fullName: fullName.trim(),
        email: cleanEmail,
        password,
        phoneNumber: cleanPhoneNumber,
        role,
        divisionId: role === 'requestor' ? (divisionId || divisions[0]?.id) : undefined,
        avatarDataUrl: avatarPreview,
      });
      if (!result.success) {
        setError(result.diagnostic);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) {
        setSignupError('Akun dibuat, tetapi login otomatis gagal. Silakan login manual.', 'signup_auto_login', 'AUTO_LOGIN_FAILED');
        return;
      }
      router.push('/');
      router.refresh();
    } catch (error: unknown) {
      setSignupError(error instanceof Error ? error.message : 'Terjadi kesalahan saat mendaftar', 'signup_client', 'CLIENT_ERROR');
    } finally {
      setIsSubmitting(false);
    }
  };


  if (isSubmittedPending) {
    return (
      <div className="auth-page-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
              <FullLogoIEEE height={36} fill="#1E1E1E" />
            </div>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-amber-light)',
                color: 'var(--accent-amber-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '6px auto 2px auto',
              }}
            >
              <Clock size={22} />
            </div>
            <h2 className="auth-title" style={{ fontSize: '15px' }}>Akun Menunggu Persetujuan</h2>
            <p className="auth-subtitle">
              Akun untuk <strong>{email}</strong> telah berhasil didaftarkan. Administrator akan meninjau dan mengotorisasi akun Anda sebelum akses ruang kerja dibuka penuh.
            </p>
          </div>

          <div style={{ marginTop: '8px' }}>
            <Link
              href="/login"
              className="btn-secondary"
              style={{
                width: '100%',
                textAlign: 'center',
                display: 'block',
                padding: '9px 16px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              Kembali ke Halaman Masuk
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}>
            <FullLogoIEEE height={36} fill="#1E1E1E" />
          </div>
          <p className="auth-subtitle">Buat akun untuk bergabung ke alur kerja kreatif</p>
        </div>

        {error && (
          <div className="auth-error-panel" role="alert" aria-live="assertive">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <div className="auth-error-content">
              <strong>{error.message}</strong>
              <span>Tahap: {error.stage} · Kode: {error.code}</span>
              <small>Referensi: {error.correlationId}</small>
              {error.code === 'EXISTING_ACCOUNT' && (
                <button type="button" className="auth-error-action" onClick={handleExistingAccount}>
                  Lanjut ke login
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Circular Avatar Uploader */}
          <div className="form-group">
            <label className="form-label">
              Foto Profil <span className="required-star">*</span>
            </label>
            <div className="auth-avatar-uploader">
              <div className="auth-avatar-circle">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Pratinjau Avatar" className="auth-avatar-img" />
                ) : (
                  <Camera size={22} color="var(--text-tertiary)" />
                )}
              </div>
              <div className="auth-avatar-info">
                <input
                  type="file"
                  id="avatar-input"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                />
                <label htmlFor="avatar-input" className="auth-avatar-label-btn">
                  <Camera size={13} />
                  <span>{avatarPreview ? 'Ubah Foto' : 'Unggah Foto'}</span>
                </label>
                <span className="auth-avatar-hint">
                  {avatarPreview ? (
                    <span style={{ color: 'var(--accent-green)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={12} strokeWidth={2.5} /> Foto siap
                    </span>
                  ) : (
                    'Foto persegi untuk avatar kartu & kursor langsung'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Name & Password row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">
                Nama Lengkap <span className="required-star">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="cth. Sarah Connor"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Kata Sandi <span className="required-star">*</span>
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Min. 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Email & Phone row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">
                Alamat Email <span className="required-star">*</span>
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="nama@perusahaan.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Nomor WhatsApp / HP <span className="required-star">*</span>
              </label>
              <input
                type="tel"
                className="form-input"
                placeholder="cth. 08123456789"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            </div>
          </div>


          {/* Segmented Role Selector */}
          <div className="form-group">
            <label className="form-label">
              Peran Akun <span className="required-star">*</span>
            </label>
            <div className="role-segmented-control">
              <button
                type="button"
                className={`role-segment-btn ${role === 'requestor' ? 'active' : ''}`}
                onClick={() => setRole('requestor')}
              >
                <span className="role-segment-title">Requester</span>
                <span className="role-segment-desc">Ajukan brief & tinjau</span>
              </button>
              <button
                type="button"
                className={`role-segment-btn ${role === 'designer' ? 'active' : ''}`}
                onClick={() => setRole('designer')}
              >
                <span className="role-segment-title">Desainer</span>
                <span className="role-segment-desc">Kerjakan & desain tugas</span>
              </button>
            </div>
          </div>

          {/* Division (if Requestor) */}
          {role === 'requestor' && divisions.length > 0 && (
            <div className="form-group">
              <label className="form-label">
                Divisi Requester <span className="required-star">*</span>
              </label>
              <select
                className="form-select"
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                required
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting}
            style={{ width: '100%', padding: '10px', marginTop: '2px' }}
          >
            {isSubmitting ? 'Sedang Membuat Akun...' : 'Buat Akun'}
          </button>
        </form>

        <div className="auth-footer-links">
          <span>Sudah punya akun?</span>
          <Link href="/login" className="auth-link">
            Masuk
          </Link>
        </div>
      </div>
    </div>
  );
}
