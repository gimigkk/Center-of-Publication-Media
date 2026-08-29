import { useState, useEffect } from 'react';
import { Job, JobStatus, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { getDeadlineStatus, formatDate } from '@/lib/utils';
import { AssignDesignerDropdown } from '@/components/forms/AssignDesignerDropdown';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';
import { fetchGoogleDocTitleAction } from '@/app/actions/jobs';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  RotateCcw,
  Send,
  Archive,
} from 'lucide-react';

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  currentUser: Profile;
  designersWithWorkload?: { designer: Profile; activeWipCount: number }[];
  onAssign?: (jobId: string, designerId: string) => Promise<{ success: boolean; error?: string }>;
  onMoveStatus: (jobId: string, toStatus: JobStatus, note?: string) => Promise<{ success: boolean; error?: string }>;
  onArchive?: (jobId: string) => Promise<void>;
  onUnarchive?: (jobId: string) => Promise<void>;
  onDropdownChange?: (state: string | null) => void;
}

const STAGES: { status: JobStatus; label: string }[] = [
  { status: 'in_queue', label: 'Antrian' },
  { status: 'wip', label: 'Sedang Dikerjakan' },
  { status: 'revisions', label: 'Revisi' },
  { status: 'done', label: 'Selesai' },
];

export function JobDetailModal({
  isOpen,
  onClose,
  job,
  currentUser,
  designersWithWorkload = [],
  onAssign,
  onMoveStatus,
  onArchive,
  onUnarchive,
  onDropdownChange,
}: JobDetailModalProps) {
  const [revisionNote, setRevisionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [dynamicBriefTitle, setDynamicBriefTitle] = useState<string | null>(null);

  // Cache last active job so exit animation has data even when parent resets job state
  const [cachedJob, setCachedJob] = useState<Job | null>(job);
  if (job && job !== cachedJob) {
    setCachedJob(job);
  }

  const { shouldRender, isClosing } = useAnimatePresence(isOpen, 140);
  const activeJob = job || cachedJob;

  useEffect(() => {
    if (activeJob) {
      setDynamicBriefTitle(activeJob.briefTitle || null);
      if (!activeJob.briefTitle && activeJob.briefLink) {
        fetchGoogleDocTitleAction(activeJob.briefLink).then((t) => {
          if (t) setDynamicBriefTitle(t);
        });
      }
    }
  }, [activeJob?.id, activeJob?.briefLink, activeJob?.briefTitle]);

  if (!shouldRender || !activeJob) return null;

  const deadlineStatus = getDeadlineStatus(activeJob.deadline);
  const displayBriefTitle =
    dynamicBriefTitle ||
    activeJob.briefTitle ||
    (activeJob.title ? `${activeJob.title} - Brief Kreatif` : 'Brief Kreatif Google Docs');

  const assignedDesigners: Profile[] = activeJob.designers && activeJob.designers.length > 0
    ? activeJob.designers
    : (activeJob.designer ? [activeJob.designer] : []);

  const isAssignedDesigner =
    currentUser.role === 'designer' &&
    (activeJob.designerId === currentUser.id ||
      activeJob.designerIds?.includes(currentUser.id) ||
      assignedDesigners.some((d) => d.id === currentUser.id));

  const handleAction = async (toStatus: JobStatus, note?: string) => {
    setIsSubmitting(true);
    try {
      const res = await onMoveStatus(activeJob.id, toStatus, note);
      if (res.success) {
        setRevisionNote('');
        setShowRevisionInput(false);
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeJob?.briefLink) {
      try {
        await navigator.clipboard.writeText(activeJob.briefLink);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy link:', err);
      }
    }
  };

  const handleModalClose = () => {
    setShowRevisionInput(false);
    setIsCopied(false);
    onClose();
  };

  return (
    <div className={`modal-backdrop ${isClosing ? 'is-closing' : ''}`} onClick={handleModalClose}>
      <div
        className={`modal-dual-container ${isClosing ? 'is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="figma-detail-card">

          {/* 1. Header: Status Pill + Close */}
          <div className="simple-modal-header">
            {activeJob.isArchived ? (
              <div className="simple-status-badge done" style={{ backgroundColor: 'var(--accent-purple-light)', color: 'var(--accent-purple-text)' }}>
                <span className="status-dot" style={{ backgroundColor: 'var(--accent-purple-text)' }} />
                <span>Request Diarsipkan</span>
              </div>
            ) : (
              <div className={`simple-status-badge ${activeJob.status}`}>
                <span className="status-dot" />
                <span>{STAGES.find((s) => s.status === activeJob.status)?.label || activeJob.status}</span>
              </div>
            )}

            <button className="modal-close-btn" onClick={handleModalClose} title="Tutup">
              <X size={15} />
            </button>
          </div>

          {/* 2. Body */}
          <div className="simple-modal-body">
            {/* Title & Description */}
            <h2 className="simple-modal-title">{activeJob.title}</h2>
            {activeJob.description && (
              <p className="simple-modal-desc">{activeJob.description}</p>
            )}

            {/* Simple Properties List (Clean rows, no heavy table/box borders) */}
            <div className="simple-props-list">
              {/* Requestor */}
              <div className="simple-prop-row">
                <span className="simple-prop-label">Requester</span>
                <div className="simple-prop-value">
                  <Avatar
                    src={activeJob.requestor?.avatarUrl}
                    name={activeJob.requestor?.fullName || 'Requester'}
                    size={18}
                  />
                  <span title={activeJob.requestor?.email}>
                    {activeJob.requestor?.fullName || 'Anonim'}
                  </span>
                </div>
              </div>

              {/* Editor(s) */}
              <div
                className="simple-prop-row"
                style={{
                  alignItems: assignedDesigners.length > 1 ? 'flex-start' : 'center',
                }}
              >
                <span
                  className="simple-prop-label"
                  style={{ paddingTop: assignedDesigners.length > 1 ? '2px' : '0' }}
                >
                  {assignedDesigners.length > 1 ? 'Daftar Editor' : 'Editor'}
                </span>
                <div
                  className="simple-prop-value"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}
                >
                  {assignedDesigners.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px', width: '100%' }}>
                      {assignedDesigners.map((designer) => (
                        <div
                          key={designer.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            minHeight: '20px',
                          }}
                        >
                          <Avatar
                            src={designer.avatarUrl}
                            name={designer.fullName}
                            size={18}
                          />
                          <span style={{ fontSize: '12px', color: '#0f172a' }} title={designer.email}>
                            {designer.fullName}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Belum Ditugaskan</span>
                  )}
                </div>
              </div>

              {/* Division */}
              <div className="simple-prop-row">
                <span className="simple-prop-label">Divisi</span>
                <div className="simple-prop-value">
                  <span>{activeJob.divisionName || 'Umum'}</span>
                </div>
              </div>

              {/* Deadline */}
              <div className="simple-prop-row">
                <span className="simple-prop-label">Deadline Waktu</span>
                <div className="simple-prop-value">
                  <span>{formatDate(activeJob.deadline)}</span>
                  <span className={`simple-deadline-tag ${deadlineStatus.urgency}`}>
                    {deadlineStatus.label}
                  </span>
                </div>
              </div>

              {/* Publication Media */}
              <div className="simple-prop-row">
                <span className="simple-prop-label">Media</span>
                <div className="simple-prop-value">
                  <span>{activeJob.publicationMedia}</span>
                </div>
              </div>
            </div>

            {/* 3. Google Docs Brief Row with Official Logo, Copy Link, and Open Link */}
            <div className="simple-brief-box">
              <a
                href={activeJob.briefLink}
                target="_blank"
                rel="noopener noreferrer"
                className="simple-brief-main-link"
                title={`Buka "${displayBriefTitle}"`}
              >
                <GoogleDocsIcon size={18} />
                <span className="simple-brief-text" title={displayBriefTitle}>
                  {displayBriefTitle}
                </span>
              </a>

              <div className="simple-brief-actions">
                <button
                  type="button"
                  className={`simple-brief-action-btn ${isCopied ? 'copied' : ''}`}
                  onClick={handleCopyLink}
                  title={isCopied ? 'Tautan berhasil disalin!' : 'Salin tautan brief'}
                >
                  {isCopied ? (
                    <>
                      <Check size={12} strokeWidth={2.5} />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Salin</span>
                    </>
                  )}
                </button>

                <a
                  href={activeJob.briefLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="simple-brief-action-btn"
                  title="Buka di tab baru"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>

            {/* 4. Revision Feedback Box if open */}
            {showRevisionInput && (
              <div className="detail-revision-section">
                <span className="revision-section-title">Tentukan Catatan / Masukan Revisi</span>
                <textarea
                  className="form-textarea"
                  placeholder="Jelaskan perbaikan atau penyesuaian yang diperlukan desainer..."
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  rows={3}
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* 3. Footer Actions */}
          <div className="simple-modal-footer">
            <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
              Dibuat pada {formatDate(activeJob.createdAt)}
            </span>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Archive / Restore actions */}
              {activeJob.isArchived && onUnarchive && (
                <button
                  className="btn-secondary"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      await onUnarchive(activeJob.id);
                      onClose();
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  title="Pulihkan kartu job ini kembali ke papan Kanban aktif"
                >
                  <RotateCcw size={13} />
                  <span>Pulihkan ke Board</span>
                </button>
              )}

              {activeJob.status === 'done' && !activeJob.isArchived && onArchive && (
                <button
                  className="btn-secondary"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      await onArchive(activeJob.id);
                      onClose();
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  title="Arsipkan job ini ke tabel di bawah"
                >
                  <Archive size={13} />
                  <span>Arsipkan Job</span>
                </button>
              )}

              {/* Designer submit for review */}
              {isAssignedDesigner && activeJob.status === 'wip' && (
                <button
                  className="btn-primary"
                  disabled={isSubmitting}
                  onClick={() => handleAction('revisions', 'Draf siap untuk ditinjau Requester')}
                >
                  <Send size={13} />
                  <span>Kirim untuk Ditinjau</span>
                </button>
              )}

              {/* Requestor / Admin review actions */}
              {(currentUser.role === 'requestor' || currentUser.role === 'admin') && activeJob.status === 'revisions' && (
                <>
                  {!showRevisionInput ? (
                    <>
                      <button
                        className="btn-secondary"
                        onClick={() => setShowRevisionInput(true)}
                      >
                        <RotateCcw size={13} />
                        <span>Minta Revisi</span>
                      </button>
                      <button
                        className="btn-success"
                        disabled={isSubmitting}
                        onClick={() => handleAction('done', 'Diterima sebagai final')}
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
                          setShowRevisionInput(false);
                          setRevisionNote('');
                        }}
                      >
                        Batal
                      </button>
                      <button
                        className="btn-primary"
                        disabled={!revisionNote.trim() || isSubmitting}
                        onClick={() => handleAction('wip', revisionNote.trim())}
                      >
                        Kirim Revisi
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Permanent Editor panel: placed below the main modal panel for admins */}
        {currentUser.role === 'admin' && onAssign && (
          <AssignDesignerDropdown
            job={activeJob}
            isOpen={true}
            onClose={() => { }}
            designersWithWorkload={designersWithWorkload}
            onAssign={onAssign}
            position="modal-left"
          />
        )}
      </div>
    </div>
  );
}

