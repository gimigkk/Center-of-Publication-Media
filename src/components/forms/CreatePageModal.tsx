'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Page, Profile } from '@/types';

interface CreatePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile;
  onCreatePage: (name: string, description?: string) => Promise<{ success: boolean; page?: Page; error?: string }>;
}

export function CreatePageModal({
  isOpen,
  onClose,
  currentUser,
  onCreatePage,
}: CreatePageModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await onCreatePage(name.trim(), description.trim() || undefined);
      if (res.success) {
        setName('');
        setDescription('');
        onClose();
      } else {
        setError(res.error || 'Gagal membuat halaman');
      }
    } catch {
      setError('Terjadi kesalahan yang tidak terduga.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Buat Halaman Ruang Kerja Baru"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </button>
          <button
            type="submit"
            form="create-page-form"
            className="btn-primary"
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? 'Sedang Membuat...' : 'Buat Halaman'}
          </button>
        </>
      }
    >
      <form id="create-page-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--accent-red-light)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">
            Nama Halaman <span className="required-star">*</span>
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="cth. Tech Summit 2026, Rebranding Visual"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Deskripsi (Opsional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="Tujuan atau cakupan tim untuk papan ini..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
