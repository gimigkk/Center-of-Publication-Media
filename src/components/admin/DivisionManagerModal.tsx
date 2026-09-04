'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Division } from '@/types';
import { Plus, Trash2, Edit2, Check, X, FolderTree, AlertCircle } from 'lucide-react';

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
      subtitle="Konfigurasi daftar divisi Requester yang tersedia untuk formulir request COPM"
      large
      footer={
        <button className="btn-secondary" onClick={onClose}>
          Tutup
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div className="modal-alert-error">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
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
          >
            <Plus size={14} />
            <span>Tambah Divisi</span>
          </button>
        </form>

        {/* List of existing divisions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {divisions.map((div) => {
            const isEditing = editingId === div.id;
            return (
              <div key={div.id} className="modal-row-item">
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
                      type="button"
                      className="modal-row-action-btn success"
                      onClick={() => handleSaveEdit(div.id)}
                      title="Simpan"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      className="modal-row-action-btn"
                      onClick={() => setEditingId(null)}
                      title="Batal"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FolderTree size={15} color="var(--text-secondary)" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{div.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="modal-row-action-btn"
                        onClick={() => handleStartEdit(div)}
                        title="Ubah nama"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="modal-row-action-btn danger"
                        onClick={() => handleDelete(div.id)}
                        title="Hapus"
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
