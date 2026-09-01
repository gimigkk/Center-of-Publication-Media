import React, { useState, useEffect } from 'react';
import { Job, JobStatus, Profile } from '@/types';
import { AssignDesignerDropdown } from '@/components/forms/AssignDesignerDropdown';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';
import { fetchGoogleDocTitleAction } from '@/app/actions/jobs';
import { formatDate } from '@/lib/utils';
import { JobDetailProperties } from './job-detail/JobDetailProperties';
import { JobDetailBriefBox } from './job-detail/JobDetailBriefBox';
import { JobDetailFooterActions } from './job-detail/JobDetailFooterActions';
import { JobDeliverablesPanel } from './job-detail/JobDeliverablesPanel';
import { X } from 'lucide-react';

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  currentUser: Profile;
  designersWithWorkload?: { designer: Profile; activeWipCount: number }[];
  onAssign?: (jobId: string, designerId: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateDeadline?: (jobId: string, deadline: string) => Promise<{ success: boolean; error?: string }>;
  onMoveStatus: (jobId: string, toStatus: JobStatus, note?: string) => Promise<{ success: boolean; error?: string }>;
  onArchive?: (jobId: string) => Promise<void>;
  onUnarchive?: (jobId: string) => Promise<void>;
  onDropdownChange?: (state: string | null) => void;
}

export const JobDetailModal = React.memo(function JobDetailModal({
  isOpen,
  onClose,
  job,
  currentUser,
  designersWithWorkload = [],
  onAssign,
  onUpdateDeadline,
  onMoveStatus,
  onArchive,
  onUnarchive,
}: JobDetailModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const displayBriefTitle =
    dynamicBriefTitle ||
    activeJob.briefTitle ||
    (activeJob.title ? `${activeJob.title} - Brief Kreatif` : 'Brief Kreatif Google Docs');

  const assignedDesigners: Profile[] =
    activeJob.designers && activeJob.designers.length > 0
      ? activeJob.designers
      : activeJob.designer
        ? [activeJob.designer]
        : [];

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
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`modal-backdrop ${isClosing ? 'is-closing' : ''}`} onClick={onClose}>
      <div
        className={`modal-dual-container ${isClosing ? 'is-closing' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="figma-detail-card" onClick={(e) => e.stopPropagation()}>
          {/* 1. Header */}
          <div className="simple-modal-header">
            {/* Title Group with Created At timestamp above Title & tight gap with Description */}
            <div className="simple-modal-title-group">
              <span className="simple-modal-created-at">
                Dibuat pada {formatDate(activeJob.createdAt)}
              </span>
              <h2 className="simple-modal-title">{activeJob.title}</h2>
              {activeJob.description && (
                <p className="simple-modal-desc">{activeJob.description}</p>
              )}
            </div>

            <button className="modal-close-btn" onClick={onClose} title="Tutup">
              <X size={15} />
            </button>
          </div>

          {/* 2. Body */}
          <div className="simple-modal-body">
            

            {/* Properties List */}
            <JobDetailProperties
              job={activeJob}
              assignedDesigners={assignedDesigners}
              isAdmin={currentUser.role === 'admin'}
              onUpdateDeadline={onUpdateDeadline}
            />

            {/* Google Docs Brief Box */}
            <JobDetailBriefBox
              briefLink={activeJob.briefLink}
              displayTitle={displayBriefTitle}
            />
          </div>

          {/* 3. Footer Actions */}
          <JobDetailFooterActions
            job={activeJob}
            currentUser={currentUser}
            isAssignedDesigner={isAssignedDesigner}
            isSubmitting={isSubmitting}
            onAction={handleAction}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onClose={onClose}
          />
        </div>

        <JobDeliverablesPanel
          job={activeJob}
          currentUser={currentUser}
          isOpen={isOpen}
        />

        {/* Permanent Editor panel: placed next to the modal panel for admins */}
        {currentUser.role === 'admin' && onAssign && (
          <AssignDesignerDropdown
            job={activeJob}
            isOpen={true}
            onClose={() => {}}
            designersWithWorkload={designersWithWorkload}
            onAssign={onAssign}
            position="modal-left"
          />
        )}
      </div>
    </div>
  );
});
