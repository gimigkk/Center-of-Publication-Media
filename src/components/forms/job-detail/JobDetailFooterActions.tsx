import React from 'react';
import { Job, JobStatus, Profile } from '@/types';
import { RotateCcw } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSeparator,
} from '@/components/ui/Select';

interface JobDetailFooterActionsProps {
  job: Job;
  currentUser: Profile;
  isAssignedDesigner: boolean;
  isSubmitting: boolean;
  onAction: (toStatus: JobStatus, note?: string) => Promise<void>;
  onArchive?: (jobId: string) => Promise<void>;
  onUnarchive?: (jobId: string) => Promise<void>;
  onDelete?: (jobId: string) => Promise<void>;
  onClose: () => void;
}

export const JobDetailFooterActions = React.memo(function JobDetailFooterActions({
  job,
  currentUser,
  isSubmitting,
  onAction,
  onUnarchive,
  onDelete,
  onClose,
}: JobDetailFooterActionsProps) {
  // Check if any actions are visible
  const hasAdminStageSwitcher = currentUser.role === 'admin' && !job.isArchived;
  const hasUnarchiveAction = job.isArchived && Boolean(onUnarchive);

  const hasAnyActions = hasAdminStageSwitcher || hasUnarchiveAction;

  if (!hasAnyActions) {
    return null;
  }

  const handleSelectChange = async (val: string) => {
    if (val === '__delete__') {
      if (confirm(`Yakin ingin menghapus job "${job.title}"? Tindakan ini tidak dapat dibatalkan.`)) {
        if (onDelete) {
          await onDelete(job.id);
          onClose();
        }
      }
      return;
    }

    await onAction(
      val as JobStatus,
      `Dipindahkan manual ke status ${val}`
    );
  };

  return (
    <div className="simple-modal-footer simple-modal-footer-actions">
      {/* Action buttons on bottom right */}
      <div className="simple-modal-action-group">
        {/* Admin quick stage switcher */}
        {hasAdminStageSwitcher && (
          <div className="simple-modal-action-item">
            <Select
              value={job.status}
              disabled={isSubmitting}
              onValueChange={handleSelectChange}
            >
              <SelectTrigger
                size="sm"
                className="modal-stage-select"
                title="Pindahkan status kartu ini"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_queue">Antrian</SelectItem>
                <SelectItem value="wip">Sedang Dikerjakan</SelectItem>
                <SelectItem value="revisions">Revisi</SelectItem>
                <SelectItem value="done">Selesai</SelectItem>
                {currentUser.role === 'admin' && (
                  <>
                    <SelectSeparator />
                    <SelectItem value="__delete__" className="is-danger">
                      Hapus
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Archive / Restore actions */}
        {hasUnarchiveAction && onUnarchive && (
          <div className="simple-modal-action-item">
            <button
              className="btn-secondary"
              disabled={isSubmitting}
              onClick={async () => {
                await onUnarchive(job.id);
                onClose();
              }}
              title="Pulihkan kartu job ini kembali ke papan Kanban aktif"
            >
              <RotateCcw size={13} />
              <span>Pulihkan ke Board</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
