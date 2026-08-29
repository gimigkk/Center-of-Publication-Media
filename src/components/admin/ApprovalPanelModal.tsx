'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Profile, UserRole } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { Check, X, ShieldCheck, Info } from 'lucide-react';
import { getRelativeTime } from '@/lib/utils';

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
    if (!confirm('Tolak dan hapus pendaftaran akun ini?')) return;
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
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span>Persetujuan Akun Pengguna</span>
          {pendingUsers.length > 0 && (
            <span className="approval-header-badge">{pendingUsers.length}</span>
          )}
        </div>
      }
      maxWidth={680}
      footer={
        <div className="approval-footer-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Tutup
          </button>
        </div>
      }
    >
      <div className="approval-modal-body">
        {/* Info Banner */}
        <div className="approval-info-banner">
          <Info size={16} className="approval-info-icon" />
          <span>
            Semua akun yang baru terdaftar memerlukan otorisasi manual administrator sebelum dapat mengakses ruang kerja COPM.
          </span>
        </div>

        {/* Pending Users List or Empty State */}
        {pendingUsers.length === 0 ? (
          <div className="approval-empty-state">
            <div className="approval-empty-icon-wrap">
              <ShieldCheck size={24} strokeWidth={2} />
            </div>
            <div className="approval-empty-title">Semua Permintaan Telah Ditinjau</div>
            <div className="approval-empty-desc">
              Tidak ada persetujuan akun yang tertunda saat ini. Akun baru yang mendaftar akan otomatis muncul di sini.
            </div>
          </div>
        ) : (
          <div className="approval-list-wrapper">
            {pendingUsers.map((user) => {
              const currentRole = selectedRoles[user.id] || user.role;
              const isProcessing = processingId === user.id;

              return (
                <div key={user.id} className="approval-user-row">
                  {/* Left: Avatar & User Identity */}
                  <div className="approval-user-main">
                    <Avatar
                      src={user.avatarUrl}
                      name={user.fullName}
                      size={36}
                      className="approval-user-avatar"
                    />
                    <div className="approval-user-details">
                      <span className="approval-user-name">{user.fullName}</span>
                      <div className="approval-user-meta">
                        <span className="approval-user-email">{user.email}</span>
                        {user.createdAt && (
                          <>
                            <span className="approval-user-dot">•</span>
                            <span className="approval-user-time">
                              {getRelativeTime(user.createdAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Role Picker & Action Buttons */}
                  <div className="approval-actions-container">
                    <div className="approval-role-select-wrap">
                      <span className="approval-role-label">Peran:</span>
                      <select
                        className="approval-role-select"
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
                      type="button"
                      className="approval-btn-approve"
                      onClick={() => handleApprove(user)}
                      disabled={isProcessing}
                      title="Setujui pendaftaran ini"
                    >
                      <Check size={14} strokeWidth={2.5} />
                      <span>{isProcessing ? 'Memproses...' : 'Setujui'}</span>
                    </button>

                    <button
                      type="button"
                      className="approval-btn-reject"
                      onClick={() => handleReject(user.id)}
                      disabled={isProcessing}
                      title="Tolak pendaftaran ini"
                    >
                      <X size={15} strokeWidth={2} />
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
