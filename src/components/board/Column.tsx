'use client';

import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Job, JobStatus, Profile } from '@/types';
import { JobCard } from './JobCard';
import { CardDropEvent } from '@/hooks/useRealtimeBoard';
import { Archive } from 'lucide-react';

interface ColumnProps {
  status: JobStatus;
  title: string;
  jobs: Job[];
  currentUser: Profile;
  onCardClick: (job: Job) => void;
  onAssignClick: (job: Job) => void;
  onArchiveJob?: (jobId: string) => Promise<void>;
  onArchiveAllDone?: () => Promise<void>;
  remotelyDraggedJobIds?: Set<string>;
  lastDropEvent?: CardDropEvent | null;
}

export const Column = memo(function Column({
  status,
  title,
  jobs,
  currentUser,
  onCardClick,
  onAssignClick,
  onArchiveJob,
  onArchiveAllDone,
  remotelyDraggedJobIds,
  lastDropEvent,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'Column',
      status,
    },
  });

  // Calculate if the current user has permission to drag this specific card
  const canUserDragCard = (job: Job) => {
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'designer') {
      return job.designerId === currentUser.id && job.status === 'wip';
    }
    if (currentUser.role === 'requestor') {
      return job.requestorId === currentUser.id && job.status === 'revisions';
    }
    return false;
  };

  return (
    <div ref={setNodeRef} className={`kanban-column ${isOver ? 'drag-over' : ''}`}>
      <div className="column-header">
        <div className="column-title-group">
          <h3 className="column-title">{title}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {status === 'done' && jobs.length > 0 && onArchiveAllDone && (
            <button
              type="button"
              className="column-archive-all-btn"
              onClick={(e) => {
                e.stopPropagation();
                onArchiveAllDone();
              }}
              title="Arsipkan semua kartu yang selesai ke tabel di bawah"
            >
              <Archive size={10} />
              <span>Arsipkan</span>
            </button>
          )}
          <span className="column-count">{jobs.length}</span>
        </div>
      </div>

      <div className="column-cards-container">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            currentUser={currentUser}
            onCardClick={onCardClick}
            onAssignClick={onAssignClick}
            onArchiveJob={onArchiveJob}
            isDraggable={canUserDragCard(job)}
            isRemotelyDragged={remotelyDraggedJobIds?.has(job.id)}
            dropEvent={lastDropEvent?.jobId === job.id ? lastDropEvent : null}
          />
        ))}

        {jobs.length === 0 && (
          <div className="empty-column-placeholder">
            <span>Tidak ada job di {title}</span>
          </div>
        )}
      </div>
    </div>
  );
});

