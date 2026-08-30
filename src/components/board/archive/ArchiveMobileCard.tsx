import React from 'react';
import { Job, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { formatDate } from '@/lib/utils';
import { Calendar } from 'lucide-react';

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

  return (
    <div
      className="job-card archive-mobile-card"
      onClick={() => onCardClick(job)}
    >
      {/* 1. Header: Title + Division Badge */}
      <div className="archive-mobile-card-header">
        <h4 className="job-card-title">{job.title}</h4>
        <span className="archive-division-badge">
          {job.divisionName || 'Umum'}
        </span>
      </div>

      {/* 2. Short Description Snippet */}
      {job.description && (
        <p className="job-card-desc">{job.description}</p>
      )}

      {/* 3. Footer Row */}
      <div className="job-card-footer">
        <div className="job-card-meta">
          {/* Brief Link */}
          {job.briefLink && (
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
          )}

          {/* Date Badge */}
          <div
            className="deadline-badge normal"
            title={`Deadline: ${formatDate(job.deadline)}`}
          >
            <Calendar size={10} />
            <span>{job.deadline ? formatDate(job.deadline) : '-'}</span>
          </div>
        </div>

        {/* Assigned Editors Avatars (Kanban style overlapping stack) */}
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
