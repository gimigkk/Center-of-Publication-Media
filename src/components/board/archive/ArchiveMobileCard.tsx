import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Job, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { formatDate } from '@/lib/utils';
import { Calendar, User, Palette } from 'lucide-react';

interface ArchiveMobileCardProps {
  job: Job;
  onCardClick: (job: Job) => void;
}

export const ArchiveMobileCard = React.memo(function ArchiveMobileCard({
  job,
  onCardClick,
}: ArchiveMobileCardProps) {
  const assignedDesigners: Profile[] =
    job.designers && job.designers.length > 0
      ? job.designers
      : job.designer
        ? [job.designer]
        : [];

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { type: 'ArchivedJob', job },
  });

  return (
    <div
      ref={setNodeRef}
      className={`archive-mobile-card ${isDragging ? 'archive-tr--dragging' : ''}`}
      onClick={() => !isDragging && onCardClick(job)}
      {...listeners}
      {...attributes}
    >
      {/* Header Row: Title + Division Badge */}
      <div className="archive-mobile-card-header">
        <span className="archive-mobile-card-title">{job.title}</span>
        <span className="archive-division-badge">
          {job.divisionName || 'Umum'}
        </span>
      </div>

      {job.description && (
        <p className="archive-mobile-card-desc">{job.description}</p>
      )}

      {/* Middle Info Row: Requester & Editor */}
      <div className="archive-mobile-card-people">
        <div className="archive-mobile-person-item" title="Requester">
          <User size={12} color="var(--text-tertiary)" />
          <Avatar
            src={job.requestor?.avatarUrl}
            name={job.requestor?.fullName || 'Requester'}
            size={16}
          />
          <span className="archive-mobile-person-name">
            {job.requestor?.fullName || 'Anonim'}
          </span>
        </div>

        <div className="archive-mobile-person-item" title="Editor">
          <Palette size={12} color="var(--text-tertiary)" />
          {assignedDesigners.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Avatar
                src={assignedDesigners[0].avatarUrl}
                name={assignedDesigners[0].fullName}
                size={16}
              />
              <span className="archive-mobile-person-name">
                {assignedDesigners.map((d) => d.fullName.split(' ')[0]).join(', ')}
              </span>
            </div>
          ) : (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              Belum Ditugaskan
            </span>
          )}
        </div>
      </div>

      {/* Footer Row: Deadline + Brief Button */}
      <div className="archive-mobile-card-footer">
        <div className="archive-mobile-deadline">
          <Calendar size={12} color="var(--text-tertiary)" />
          <span>{formatDate(job.deadline)}</span>
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <a
            href={job.briefLink}
            target="_blank"
            rel="noopener noreferrer"
            className="archive-brief-btn"
            title="Buka Brief Google Docs"
          >
            <GoogleDocsIcon size={12} />
            <span>Brief Google Docs</span>
          </a>
        </div>
      </div>
    </div>
  );
});
