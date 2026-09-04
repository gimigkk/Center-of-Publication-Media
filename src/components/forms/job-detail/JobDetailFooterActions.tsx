import React from 'react';
import { Job, JobStatus, Profile } from '@/types';
import { RotateCcw } from 'lucide-react';
import { SimpleSelect } from '@/components/ui/Select';

interface JobDetailFooterActionsProps {
  job: Job;
  currentUser: Profile;
  isAssignedDesigner: boolean;
  isSubmitting: boolean;
  onAction: (toStatus: JobStatus, note?: string) => Promise<void>;
  onArchive?: (jobId: string) => Promise<void>;
  onUnarchive?: (jobId: string) => Promise<void>;
  onClose: () => void;
}

export const JobDetailFooterActions = React.memo(function JobDetailFooterActions({
  job,
  currentUser,
  isSubmitting,
  onAction,
  onUnarchive,
  onClose,
}: JobDetailFooterActionsProps) {
  // Check if any actions are visible
  const hasAdminStageSwitcher = currentUser.role === 'admin' && !job.isArchived;
  const hasUnarchiveAction = job.isArchived && Boolean(onUnarchive);

  const hasAnyActions = hasAdminStageSwitcher || hasUnarchiveAction;

  if (!hasAnyActions) {
    return null;
  }

  return (
    <div className="simple-modal-footer simple-modal-footer-actions">
      {/* Action buttons on bottom right */}
      <div className="simple-modal-action-group">
        {/* Admin quick stage switcher */}
        {hasAdminStageSwitcher && (
          <div className="simple-modal-action-item">
            <SimpleSelect
              size="sm"
              className="modal-stage-select"
              value={job.status}
              disabled={isSubmitting}
              onChange={(val) =>
                onAction(
                  val as JobStatus,
                  `Dipindahkan manual ke status ${val}`
                )
              }
              title="Pindahkan status kartu ini"
              options={[
                { value: 'in_queue', label: 'Antrian' },
                { value: 'wip', label: 'Sedang Dikerjakan' },
                { value: 'revisions', label: 'Revisi' },
                { value: 'done', label: 'Selesai' },
              ]}
            />
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
