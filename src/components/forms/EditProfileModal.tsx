'use client';

import { useState, useRef } from 'react';
import { Profile } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Camera, Check, Loader2, AlertCircle } from 'lucide-react';
import { compressImageToAvatarDataUrl } from '@/lib/utils';
import { uploadAvatarDataUrlToStorage } from '@/lib/storage';

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

  // Reset form fields when the modal opens or the profile updates.
  // (Render-phase state adjustment — https://react.dev/learn/you-might-not-need-an-effect)
  const [prevFormState, setPrevFormState] = useState({ isOpen, user: currentUser });
  if (prevFormState.isOpen !== isOpen || prevFormState.user !== currentUser) {
    setPrevFormState({ isOpen, user: currentUser });
    if (isOpen) {
      setFullName(currentUser.fullName);
      setAvatarPreview(currentUser.avatarUrl);
      setPhoneNumber(currentUser.phoneNumber || '');
      setError(null);
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Harap pilih file gambar (JPG, PNG, WebP)');
      return;
    }

    try {
      const compressed = await compressImageToAvatarDataUrl(file, 256, 0.85);
      setAvatarPreview(compressed);
      setError(null);
    } catch {
      setError('Gagal memproses gambar');
    }
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
      let finalAvatarUrl = avatarPreview;
      if (avatarPreview && avatarPreview.startsWith('data:image')) {
        const uploadedUrl = await uploadAvatarDataUrlToStorage(avatarPreview, currentUser.id);
        if (uploadedUrl) {
          finalAvatarUrl = uploadedUrl;
        }
      }

      const res = await onUpdateProfile({
        fullName: fullName.trim(),
        avatarUrl: finalAvatarUrl,
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
      subtitle="Perbarui foto profil, nama lengkap, dan nomor kontak Anda"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Simpan Perubahan</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div className="modal-alert-error">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Avatar Photo Editor */}
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrap">
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
              className="profile-avatar-camera-btn"
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

