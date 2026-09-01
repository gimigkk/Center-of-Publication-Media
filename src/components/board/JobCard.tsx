import React, { useLayoutEffect, useRef, memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Job, Profile } from '@/types';
import { getDeadlineStatus } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { Clock, UserPlus, Archive } from 'lucide-react';
import { CardDropEvent } from '@/hooks/useRealtimeBoard';

interface JobCardProps {
  job: Job;
  currentUser: Profile;
  onCardClick: (job: Job) => void;
  onAssignClick: (job: Job) => void;
  onArchiveJob?: (jobId: string) => Promise<void>;
  isDraggable?: boolean;
  isRemotelyDragged?: boolean;
  dropEvent?: CardDropEvent | null;
}

export const JobCard = memo(function JobCard({
  job,
  currentUser,
  onCardClick,
  onAssignClick,
  onArchiveJob,
  isDraggable = true,
  isRemotelyDragged = false,
  dropEvent,
}: JobCardProps) {
  const cardElementRef = useRef<HTMLDivElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: job.id,
    disabled: !isDraggable,
    data: {
      type: 'Job',
      job,
    },
  });

  // Handle drop glide animation (FLIP lerp with guaranteed rotation return to 0deg)
  useLayoutEffect(() => {
    if (dropEvent && dropEvent.jobId === job.id && dropEvent.releaseWorldX !== undefined) {
      const cardEl = cardElementRef.current;
      const boardEl = document.querySelector('.kanban-board');
      if (cardEl && boardEl) {
        const cRect = cardEl.getBoundingClientRect();
        const bRect = boardEl.getBoundingClientRect();
        const slotWorldX = cRect.left - bRect.left;
        const slotWorldY = cRect.top - bRect.top;

        const cardHalfWidth = cRect.width > 0 ? cRect.width / 2 : 132;
        const deltaX = (dropEvent.releaseWorldX - cardHalfWidth) - slotWorldX;
        const deltaY = ((dropEvent.releaseWorldY ?? slotWorldY) - 10) - slotWorldY;

        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
          const initialRot = dropEvent.releaseTilt !== undefined && Math.abs(dropEvent.releaseTilt) > 0.1
            ? dropEvent.releaseTilt
            : (deltaX > 0 ? 3 : -3);

          // 1. Invert: instantly position at drop release location with rotation
          cardEl.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.02) rotate(${initialRot}deg)`;
          cardEl.style.boxShadow = '0 14px 28px rgba(0, 0, 0, 0.16), 0 4px 10px rgba(0, 0, 0, 0.06)';
          cardEl.style.zIndex = '60';
          cardEl.style.transition = 'none';

          // 2. Play: animate smoothly into target slot in next frame
          const rafId = requestAnimationFrame(() => {
            cardEl.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease';
            cardEl.style.transform = 'translate3d(0, 0, 0) scale(1) rotate(0deg)';
            cardEl.style.boxShadow = '';
          });

          // 3. Clean up
          let isCleaned = false;
          const cleanup = () => {
            if (isCleaned) return;
            isCleaned = true;
            cardEl.style.transform = '';
            cardEl.style.transition = '';
            cardEl.style.zIndex = '';
            cardEl.style.boxShadow = '';
          };

          const onEnd = (e: TransitionEvent) => {
            if (e.propertyName === 'transform') {
              cleanup();
              cardEl.removeEventListener('transitionend', onEnd);
            }
          };

          cardEl.addEventListener('transitionend', onEnd);
          const fallbackTimer = setTimeout(cleanup, 260);

          return () => {
            cancelAnimationFrame(rafId);
            clearTimeout(fallbackTimer);
            cardEl.removeEventListener('transitionend', onEnd);
            cleanup();
          };
        }
      }
    }
  }, [dropEvent, job.id]);

  const handleCombinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    cardElementRef.current = node;
  };

  const deadlineStatus = getDeadlineStatus(job.deadline);
  const isDraggingEffective = isDragging || isRemotelyDragged;
  const assignedDesigners: Profile[] = job.designers && job.designers.length > 0
    ? job.designers
    : (job.designer ? [job.designer] : []);

  return (
    <div
      ref={handleCombinedRef}
      id={`job-card-${job.id}`}
      data-job-id={job.id}
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
      className={`job-card ${isDraggingEffective ? 'is-dragging is-remotely-dragged' : ''}`}
      onClick={() => onCardClick(job)}
    >
      {/* 1. Title */}
      <h4 className="job-card-title">{job.title}</h4>

      {/* Short Description */}
      {job.description && <p className="job-card-desc">{job.description}</p>}

      <div className="job-card-footer">
        <div className="job-card-meta">
          {/* 2. Brief Link */}
          <a
            href={job.briefLink}
            target="_blank"
            rel="noopener noreferrer"
            className="job-brief-link"
            onClick={(e) => e.stopPropagation()}
            title="Buka Brief Google Docs"
          >
            <GoogleDocsIcon size={12} />
            <span>Brief</span>
          </a>

          {/* 3. Deadline */}
          <div
            className={`deadline-badge ${deadlineStatus.urgency}`}
            title={`Deadline: ${new Date(job.deadline).toLocaleDateString('id-ID')}`}
          >
            <Clock size={9} />
            <span>{deadlineStatus.label}</span>
          </div>

          {/* Quick Archive button for completed jobs */}
          {job.status === 'done' && onArchiveJob && (
            <button
              type="button"
              className="job-card-archive-btn"
              onClick={(e) => {
                e.stopPropagation();
                onArchiveJob(job.id);
              }}
              title="Arsipkan job ini ke tabel di bawah"
            >
              <Archive size={11} />
            </button>
          )}
        </div>

        {/* 4. Requestor & 5. Editor / Designers */}
        {/* Only Assigned Editors Avatars or Assign Button */}
        <div className="job-card-people">
          {assignedDesigners.length > 0 ? (
            <div
              className="editors-avatar-group"
              title={`Editor: ${assignedDesigners.map((d) => d.fullName).join(', ')}`}
            >
              {assignedDesigners.slice(0, 3).map((designer, idx) => (
                <div
                  key={designer.id}
                  className="person-avatar-slot"
                  title={`Editor: ${designer.fullName}`}
                  style={{ zIndex: idx + 1 }}
                >
                  <Avatar
                    src={designer.avatarUrl}
                    name={designer.fullName}
                    size={20}
                  />
                </div>
              ))}
              {assignedDesigners.length > 3 && (
                <div
                  className="avatar-overflow-badge"
                  style={{ zIndex: 10 }}
                >
                  +{assignedDesigners.length - 3}
                </div>
              )}
            </div>
          ) : currentUser.role === 'admin' ? (
            <button
              className="unassigned-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCardClick(job);
              }}
              title="Tugaskan Editor"
            >
              <UserPlus size={10} />
            </button>
          ) : (
            <div className="unassigned-text" title="Belum ada editor ditugaskan">
              —
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

