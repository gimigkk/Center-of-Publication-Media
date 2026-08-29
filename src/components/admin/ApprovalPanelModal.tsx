'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Profile, UserRole } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { Check, X, ShieldAlert, UserCheck } from 'lucide-react';

interface ApprovalPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingUsers: Profile[];
  onApprove: (userId: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  onReject: (userId: string) => Promise<{ success: boolean; error?: string }>;
}

export function ApprovalPanelModal({
  isOpen,
  onClose,
  pendingUsers,
  onApprove,
  onReject,
}: ApprovalPanelModalProps) {
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleRoleChange = (userId: string, role: UserRole) => {
    setSelectedRoles((prev) => ({ ...prev, [userId]: role }));
  };

  const handleApprove = async (user: Profile) => {
    setProcessingId(user.id);
    const assignedRole = selectedRoles[user.id] || user.role;
    try {
      await onApprove(user.id, assignedRole);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm('Tolak dan hapus pendaftaran ini?')) return;
    setProcessingId(userId);
    try {
      await onReject(userId);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Persetujuan Akun Pengguna (${pendingUsers.length})`}
      large
      footer={
        <button className="btn-secondary" onClick={onClose}>
          Tutup
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Semua akun yang baru terdaftar memerlukan otorisasi manual administrator sebelum dapat mengakses ruang kerja.
        </p>

        {pendingUsers.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)' }}>
            <UserCheck size={28} style={{ margin: '0 auto 8px auto', display: 'block', color: 'var(--accent-green)' }} />
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Semua sudah diperiksa!</div>
            <div style={{ fontSize: '12px' }}>Tidak ada persetujuan akun yang tertunda saat ini.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pendingUsers.map((user) => {
              const currentRole = selectedRoles[user.id] || user.role;
              const isProcessing = processingId === user.id;

              return (
                <div
                  key={user.id}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Avatar src={user.avatarUrl} name={user.fullName} size={36} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {user.fullName}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Peran:</span>
                      <select
                        className="form-select"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        value={currentRole}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        disabled={isProcessing}
                      >
                        <option value="requestor">Requester</option>
                        <option value="designer">Desainer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <button
                      className="btn-primary"
                      style={{ padding: '6px 12px', backgroundColor: 'var(--accent-green)' }}
                      onClick={() => handleApprove(user)}
                      disabled={isProcessing}
                    >
                      <Check size={14} style={{ marginRight: '4px' }} />
                      <span>Setujui</span>
                    </button>

                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px', color: 'var(--accent-red)' }}
                      onClick={() => handleReject(user.id)}
                      disabled={isProcessing}
                      title="Tolak"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
