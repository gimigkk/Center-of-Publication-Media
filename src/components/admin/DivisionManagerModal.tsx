'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Division } from '@/types';
import { Plus, Trash2, Edit2, Check, X, FolderTree } from 'lucide-react';

interface DivisionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  divisions: Division[];
  onCreateDivision: (name: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateDivision: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
  onDeleteDivision: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export function DivisionManagerModal({
  isOpen,
  onClose,
  divisions,
  onCreateDivision,
  onUpdateDivision,
  onDeleteDivision,
}: DivisionManagerModalProps) {
  const [newDivName, setNewDivName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDivName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await onCreateDivision(newDivName.trim());
      if (res.success) {
        setNewDivName('');
      } else {
        setError(res.error || 'Gagal menambahkan divisi');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (d: Division) => {
    setEditingId(d.id);
    setEditingName(d.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await onUpdateDivision(id, editingName.trim());
      if (res.success) {
        setEditingId(null);
      } else {
        setError(res.error || 'Gagal memperbarui divisi');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus divisi ini?')) return;
    setIsSubmitting(true);
    try {
      const res = await onDeleteDivision(id);
      if (!res.success) {
        setError(res.error || 'Gagal menghapus divisi');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kelola Divisi Requester"
      large
      footer={
        <button className="btn-secondary" onClick={onClose}>
          Tutup
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Divisi mengonfigurasi daftar tim Requester yang tersedia saat pengisian form request COPM.
        </p>

        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--accent-red-light)', color: 'var(--accent-red)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
            {error}
          </div>
        )}

        {/* Add new division inline */}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Nama divisi baru (cth. Talent & Culture, Growth Marketing)..."
            value={newDivName}
            onChange={(e) => setNewDivName(e.target.value)}
            required
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!newDivName.trim() || isSubmitting}
            style={{ whiteSpace: 'nowrap' }}
          >
            <Plus size={14} style={{ marginRight: '4px' }} />
            <span>Tambah Divisi</span>
          </button>
        </form>

        {/* List of existing divisions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {divisions.map((div) => {
            const isEditing = editingId === div.id;
            return (
              <div
                key={div.id}
                style={{
                  padding: '10px 14px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-surface)',
                }}
              >
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                    />
                    <button
                      className="btn-primary"
                      style={{ padding: '6px 10px' }}
                      onClick={() => handleSaveEdit(div.id)}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      onClick={() => setEditingId(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FolderTree size={15} color="var(--text-secondary)" />
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{div.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        className="modal-close-btn"
                        onClick={() => handleStartEdit(div)}
                        title="Ubah nama"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="modal-close-btn"
                        onClick={() => handleDelete(div.id)}
                        title="Hapus"
                        style={{ color: 'var(--accent-red)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
