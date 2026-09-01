import React from 'react';
import { Job, JobStatus, Profile } from '@/types';
import { RotateCcw } from 'lucide-react';
import { formatDate } from '@/lib/utils';

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
    <div className="simple-modal-footer" style={{ justifyContent: 'flex-end' }}>
      {/* Action buttons on bottom right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'nowrap',
          justifyContent: 'flex-end',
          width: '100%',
        }}
      >

        {/* Admin quick stage switcher */}
        {hasAdminStageSwitcher && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <select
              className="modal-stage-select"
              value={job.status}
              disabled={isSubmitting}
              onChange={(e) =>
                onAction(
                  e.target.value as JobStatus,
                  `Dipindahkan manual ke status ${e.target.value}`
                )
              }
              title="Pindahkan status kartu ini"
            >
              <option value="in_queue">Status: Antrian</option>
              <option value="wip">Status: Sedang Dikerjakan</option>
              <option value="revisions">Status: Revisi</option>
              <option value="done">Status: Selesai</option>
            </select>
          </div>
        )}

        {/* Archive / Restore actions */}
        {hasUnarchiveAction && onUnarchive && (
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
        )}
      </div>
    </div>
  );
});
