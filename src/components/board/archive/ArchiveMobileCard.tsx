import React from 'react';
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

  return (
    <div
      className="archive-mobile-card"
      onClick={() => onCardClick(job)}
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
      <div className="archive-mobile-card-meta">
        <div className="archive-mobile-meta-item">
          <User size={12} className="archive-mobile-meta-icon" />
          <span className="archive-mobile-meta-label">Req:</span>
          <span className="archive-mobile-meta-val">
            {job.requestor?.fullName || 'Requester'}
          </span>
        </div>

        <div className="archive-mobile-meta-item">
          <Palette size={12} className="archive-mobile-meta-icon" />
          <span className="archive-mobile-meta-label">Desainer:</span>
          <span className="archive-mobile-meta-val">
            {assignedDesigners.length > 0
              ? assignedDesigners.map((d) => d.fullName).join(', ')
              : 'Belum ada'}
          </span>
        </div>
      </div>

      {/* Footer Row: Brief doc & Date */}
      <div className="archive-mobile-card-footer">
        <div className="archive-mobile-brief-slot">
          {job.briefLink ? (
            <a
              href={job.briefLink}
              target="_blank"
              rel="noopener noreferrer"
              className="archive-mobile-doc-link"
              onClick={(e) => e.stopPropagation()}
              title="Buka Google Docs Brief"
            >
              <GoogleDocsIcon size={14} />
              <span>Buka Brief Docs</span>
            </a>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              Tidak ada brief
            </span>
          )}
        </div>

        <div className="archive-mobile-date-slot">
          <Calendar size={11} style={{ opacity: 0.6 }} />
          <span>{job.archivedAt ? formatDate(job.archivedAt) : '-'}</span>
        </div>
      </div>
    </div>
  );
});
