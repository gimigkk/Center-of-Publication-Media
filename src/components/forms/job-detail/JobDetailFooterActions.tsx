import React from 'react';
import { Job, JobStatus, Profile } from '@/types';
import { formatDate } from '@/lib/utils';
import { RotateCcw, Archive, ArrowRight, Send, CheckCircle2 } from 'lucide-react';

interface JobDetailFooterActionsProps {
  job: Job;
  currentUser: Profile;
  isAssignedDesigner: boolean;
  isSubmitting: boolean;
  showRevisionInput: boolean;
  revisionNote: string;
  onSetShowRevisionInput: (show: boolean) => void;
  onSetRevisionNote: (note: string) => void;
  onAction: (toStatus: JobStatus, note?: string) => Promise<void>;
  onArchive?: (jobId: string) => Promise<void>;
  onUnarchive?: (jobId: string) => Promise<void>;
  onClose: () => void;
}

export const JobDetailFooterActions = React.memo(function JobDetailFooterActions({
  job,
  currentUser,
  isAssignedDesigner,
  isSubmitting,
  showRevisionInput,
  revisionNote,
  onSetShowRevisionInput,
  onSetRevisionNote,
  onAction,
  onArchive,
  onUnarchive,
  onClose,
}: JobDetailFooterActionsProps) {
  return (
    <div className="simple-modal-footer">
      <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
        Dibuat pada {formatDate(job.createdAt)}
      </span>

      {/* Action buttons on bottom right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'nowrap',
          justifyContent: 'flex-end',
        }}
      >
        {/* Admin quick stage switcher */}
        {currentUser.role === 'admin' && !job.isArchived && (
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
        {job.isArchived && onUnarchive && (
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

        {job.status === 'done' && !job.isArchived && onArchive && (
          <button
            className="btn-secondary"
            disabled={isSubmitting}
            onClick={async () => {
              await onArchive(job.id);
              onClose();
            }}
            title="Arsipkan job ini ke tabel di bawah"
          >
            <Archive size={13} />
            <span>Arsipkan Job</span>
          </button>
        )}

        {/* In Queue -> Start Working (WIP) */}
        {job.status === 'in_queue' &&
          (currentUser.role === 'admin' || currentUser.role === 'designer') && (
            <button
              className="btn-primary"
              disabled={isSubmitting}
              onClick={() => onAction('wip', 'Mulai dikerjakan')}
              title="Pindahkan ke Sedang Dikerjakan"
            >
              <ArrowRight size={13} />
              <span>Mulai Kerjakan</span>
            </button>
          )}

        {/* WIP -> Submit for review */}
        {(isAssignedDesigner || currentUser.role === 'admin') && job.status === 'wip' && (
          <button
            className="btn-primary"
            disabled={isSubmitting}
            onClick={() => onAction('revisions', 'Draf siap untuk ditinjau Requester')}
            title="Kirim draf untuk ditinjau"
          >
            <Send size={13} />
            <span>Kirim untuk Ditinjau</span>
          </button>
        )}

        {/* Requestor / Admin review actions */}
        {(currentUser.role === 'requestor' || currentUser.role === 'admin') &&
          job.status === 'revisions' && (
            <>
              {!showRevisionInput ? (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => onSetShowRevisionInput(true)}
                    title="Minta perbaikan atau revisi"
                  >
                    <RotateCcw size={13} />
                    <span>Minta Revisi</span>
                  </button>
                  <button
                    className="btn-success"
                    disabled={isSubmitting}
                    onClick={() => onAction('done', 'Diterima sebagai final')}
                    title="Setujui dan tandai selesai"
                  >
                    <CheckCircle2 size={13} />
                    <span>Terima sebagai Final</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      onSetShowRevisionInput(false);
                      onSetRevisionNote('');
                    }}
                  >
                    Batal
                  </button>
                  <button
                    className="btn-primary"
                    disabled={!revisionNote.trim() || isSubmitting}
                    onClick={() => onAction('wip', revisionNote.trim())}
                  >
                    Kirim Revisi
                  </button>
                </>
              )}
            </>
          )}
      </div>
    </div>
  );
});
