'use client';

import { useState, useRef, useEffect } from 'react';
import { Job, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { Check, X, Loader2 } from 'lucide-react';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

export interface AssignDesignerDropdownProps {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  designersWithWorkload: { designer: Profile; activeWipCount: number }[];
  onAssign: (jobId: string, designerId: string) => Promise<{ success: boolean; error?: string }>;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'modal-left';
}

export function AssignDesignerDropdown({
  job,
  isOpen,
  onClose,
  designersWithWorkload,
  onAssign,
  position = 'top-right',
}: AssignDesignerDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [submittingDesignerId, setSubmittingDesignerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { shouldRender, isClosing } = useAnimatePresence(isOpen, 110);

  // Derive current list of assigned designer IDs
  const initialAssignedIds = job.designerIds && job.designerIds.length > 0
    ? job.designerIds
    : (job.designerId ? [job.designerId] : []);

  const [assignedIds, setAssignedIds] = useState<string[]>(initialAssignedIds);

  useEffect(() => {
    const freshIds = job.designerIds && job.designerIds.length > 0
      ? job.designerIds
      : (job.designerId ? [job.designerId] : []);
    setAssignedIds(freshIds);
  }, [job.designerIds, job.designerId]);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const handleToggleDesigner = async (designerId: string) => {
    if (submittingDesignerId) return;

    // Optimistic toggle
    const isCurrentlyAssigned = assignedIds.includes(designerId);
    const nextAssignedIds = isCurrentlyAssigned
      ? assignedIds.filter((id) => id !== designerId)
      : [...assignedIds, designerId];
    const previousAssignedIds = assignedIds;

    setAssignedIds(nextAssignedIds);
    setSubmittingDesignerId(designerId);
    setError(null);

    try {
      const res = await onAssign(job.id, nextAssignedIds.join(','));
      if (!res.success) {
        // Revert on error
        setAssignedIds(previousAssignedIds);
        setError(res.error || 'Gagal memperbarui penugasan');
      }
    } catch {
      setAssignedIds(previousAssignedIds);
      setError('Terjadi kesalahan saat penugasan');
    } finally {
      setSubmittingDesignerId(null);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`assign-dropdown-popover position-${position} ${isClosing ? 'is-closing' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Dropdown Header */}
      <div className="assign-dropdown-header">
        <div className="assign-dropdown-title-group">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="assign-dropdown-title">Tugaskan Editor</span>
            {assignedIds.length > 0 && (
              <span className="assign-count-badge">
                {assignedIds.length}
              </span>
            )}
          </div>
          <span className="assign-dropdown-subtitle">
            Pilih satu atau lebih editor
          </span>
        </div>
        {position !== 'modal-left' && (
          <button
            className="assign-dropdown-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Selesai"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '6px 8px',
          background: 'var(--accent-red-light)',
          color: 'var(--accent-red-text)',
          borderRadius: 'var(--radius-xs)',
          fontSize: '11px',
          fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Designers Checklist */}
      <div className="assign-dropdown-list">
        {designersWithWorkload.length === 0 ? (
          <div style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
            Tidak ada editor yang tersedia
          </div>
        ) : (
          designersWithWorkload.map((item) => {
            const isSelected = assignedIds.includes(item.designer.id);
            const isSubmitting = submittingDesignerId === item.designer.id;

            return (
              <div
                key={item.designer.id}
                className={`assign-dropdown-item ${isSelected ? 'assigned' : ''} ${isSubmitting ? 'submitting' : ''}`}
                onClick={() => handleToggleDesigner(item.designer.id)}
                title={isSelected ? `Hapus penugasan ${item.designer.fullName}` : `Tugaskan ${item.designer.fullName}`}
              >
                <div className="assign-dropdown-item-left">
                  {/* Custom Checkbox */}
                  <div className={`assign-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={11} strokeWidth={3} />}
                  </div>

                  <Avatar
                    src={item.designer.avatarUrl}
                    name={item.designer.fullName}
                    size={22}
                  />
                  <div className="assign-dropdown-item-info">
                    <span className="assign-dropdown-item-name">
                      {item.designer.fullName}
                    </span>
                    <span className="assign-dropdown-item-email">
                      {item.designer.email}
                    </span>
                  </div>
                </div>

                <div className="assign-dropdown-item-right">
                  <span className={`workload-pill ${item.activeWipCount > 3 ? 'busy' : ''}`}>
                    {item.activeWipCount} WIP
                  </span>
                  {isSubmitting && (
                    <Loader2 size={13} className="spin" color="var(--accent-blue)" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
