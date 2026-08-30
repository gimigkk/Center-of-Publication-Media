'use client';

import { useState, useRef, useEffect } from 'react';
import { Profile } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Camera, Check, Loader2 } from 'lucide-react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  onUpdateProfile: (data: {
    fullName: string;
    avatarUrl?: string | null;
    phoneNumber?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;
}

export function EditProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile,
}: EditProfileModalProps) {
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatarUrl);
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFullName(currentUser.fullName);
      setAvatarPreview(currentUser.avatarUrl);
      setPhoneNumber(currentUser.phoneNumber || '');
      setError(null);
    }
  }, [isOpen, currentUser]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Harap pilih file gambar (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError('Ukuran gambar maksimal 4MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Nama lengkap tidak boleh kosong');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await onUpdateProfile({
        fullName: fullName.trim(),
        avatarUrl: avatarPreview,
        phoneNumber: phoneNumber.trim() || null,
      });

      if (res.success) {
        onClose();
      } else {
        setError(res.error || 'Gagal menyimpan profil');
      }
    } catch {
      setError('Terjadi kesalahan saat menyimpan profil');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Profil Akun"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary"
            disabled={isSubmitting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Check size={14} />
                Simpan Perubahan
              </>
            )}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        {/* Avatar Photo Editor */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 0',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Avatar
              src={avatarPreview}
              name={fullName || currentUser.fullName}
              size={72}
              style={{
                border: '2px solid rgba(0,0,0,0.08)',
                boxShadow: 'var(--shadow-sm)',
                objectFit: 'cover',
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                border: '2px solid #fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)',
              }}
              title="Ganti Foto"
            >
              <Camera size={13} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
            style={{ fontSize: '11.5px', padding: '4px 10px', height: '28px' }}
          >
            Ganti Foto Profil
          </button>
        </div>

        {/* Full Name */}
        <div className="form-group">
          <label className="form-label">
            Nama Lengkap <span className="required-star">*</span>
          </label>
          <input
            type="text"
            className="form-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama lengkap Anda"
            required
          />
        </div>

        {/* Email (Readonly) */}
        <div className="form-group">
          <label className="form-label">Alamat Email</label>
          <input
            type="email"
            className="form-input"
            value={currentUser.email}
            disabled
            style={{ opacity: 0.7, backgroundColor: '#f8fafc', cursor: 'not-allowed' }}
          />
        </div>

        {/* Phone Number */}
        <div className="form-group">
          <label className="form-label">Nomor WhatsApp / HP</label>
          <input
            type="tel"
            className="form-input"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="cth. 081234567890"
          />
        </div>
      </form>
    </Modal>
  );
}

