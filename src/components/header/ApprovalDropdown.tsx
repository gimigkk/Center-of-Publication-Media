'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { UserCheck, Check, X } from 'lucide-react';
import { Profile, UserRole } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';
import { getRelativeTime } from '@/lib/utils';

interface ApprovalDropdownProps {
  pendingUsers: Profile[];
  onApprove: (userId: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  onReject: (userId: string) => Promise<{ success: boolean; error?: string }>;
  onDropdownChange?: (state: string | null) => void;
}

export const ApprovalDropdown = memo(function ApprovalDropdown({
  pendingUsers,
  onApprove,
  onReject,
  onDropdownChange,
}: ApprovalDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { shouldRender, isClosing } = useAnimatePresence(isOpen, 110);

  useEffect(() => {
    onDropdownChange?.(isOpen ? 'Membuka Persetujuan Akun' : null);
  }, [isOpen, onDropdownChange]);

  // Safe-zone cursor tracking: auto-dismiss if cursor leaves safe corridor
  useSafeZone({
    isOpen,
    onClose: () => setIsOpen(false),
    triggerRef: buttonRef,
    panelRef: popoverRef,
    options: {
      safePadding: 70,
      debounceMs: 120,
    },
  });

  const handleRoleChange = (userId: string, role: UserRole) => {
    setSelectedRoles((prev) => ({ ...prev, [userId]: role }));
  };

  const handleApprove = async (user: Profile) => {
    setProcessingId(user.id);
    const assignedRole = selectedRoles[user.id] || user.role || 'designer';
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

  const count = pendingUsers.length;

  return (
    <div className="figjam-inbox-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className={`figjam-inbox-btn ${isOpen ? 'active' : ''} ${count > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={count > 0 ? `${count} Persetujuan Akun Tertunda` : 'Persetujuan Akun'}
      >
        <UserCheck size={16} strokeWidth={2} />
        {count > 0 && <span className="inbox-badge-count approval-badge-count">{count}</span>}
      </button>

      {shouldRender && (
        <div
          ref={popoverRef}
          className={`figma-inbox-popover approval-popover ${isClosing ? 'is-closing' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="approval-popover-header">
            <div className="approval-popover-title-row">
              <span className="approval-popover-title">Persetujuan Akun</span>
              {count > 0 && (
                <span className="approval-popover-count-pill">{count} menunggu</span>
              )}
            </div>
            <div className="approval-popover-subtitle">
              Akun baru yang memerlukan otorisasi administrator
            </div>
          </div>

          {/* Body: List or Empty */}
          <div className="approval-popover-list no-scrollbar">
            {count === 0 ? (
              <div className="approval-popover-empty">
                <span className="approval-popover-empty-desc">
                  Tidak ada persetujuan akun yang tertunda saat ini.
                </span>
              </div>
            ) : (
              pendingUsers.map((user) => {
                const currentRole = selectedRoles[user.id] || user.role || 'designer';
                const isProcessing = processingId === user.id;

                return (
                  <div key={user.id} className="approval-popover-item">
                    <div className="approval-popover-item-top">
                      <Avatar
                        src={user.avatarUrl}
                        name={user.fullName}
                        size={30}
                        className="approval-popover-avatar"
                      />
                      <div className="approval-popover-user-info">
                        <span className="approval-popover-user-name">{user.fullName}</span>
                        <div className="approval-popover-user-meta">
                          <span className="approval-popover-user-email">{user.email}</span>
                          {user.createdAt && (
                            <>
                              <span className="approval-popover-user-dot">•</span>
                              <span className="approval-popover-user-time">
                                {getRelativeTime(user.createdAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="approval-popover-item-bottom">
                      <div className="approval-popover-role-select-wrap">
                        <span className="approval-popover-role-label">Peran:</span>
                        <select
                          className="approval-popover-role-select"
                          value={currentRole}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          disabled={isProcessing}
                        >
                          <option value="requestor">Requester</option>
                          <option value="designer">Desainer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>

                      <div className="approval-popover-actions">
                        <button
                          type="button"
                          className="approval-popover-btn-approve"
                          onClick={() => handleApprove(user)}
                          disabled={isProcessing}
                          title="Setujui pendaftaran ini"
                        >
                          <Check size={12} strokeWidth={2.5} />
                          <span>{isProcessing ? '...' : 'Setujui'}</span>
                        </button>

                        <button
                          type="button"
                          className="approval-popover-btn-reject"
                          onClick={() => handleReject(user.id)}
                          disabled={isProcessing}
                          title="Tolak pendaftaran ini"
                        >
                          <X size={13} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});
