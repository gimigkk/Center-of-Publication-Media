import React from 'react';
import { Job, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { formatDate } from '@/lib/utils';

interface ArchiveTableRowProps {
  job: Job;
  index: number;
  onCardClick: (job: Job) => void;
}

export const ArchiveTableRow = React.memo(function ArchiveTableRow({
  job,
  index,
  onCardClick,
}: ArchiveTableRowProps) {
  const assignedDesigners: Profile[] =
    job.designers && job.designers.length > 0
      ? job.designers
      : job.designer
        ? [job.designer]
        : [];

  return (
    <tr className="archive-tr" onClick={() => onCardClick(job)}>
      {/* Index */}
      <td
        className="archive-td"
        style={{
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: '11px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {index + 1}
      </td>

      {/* Task Title + Snippet */}
      <td className="archive-td">
        <div className="archive-task-title-group">
          <span className="archive-task-title">{job.title}</span>
          {job.description && (
            <span className="archive-task-desc">{job.description}</span>
          )}
        </div>
      </td>

      {/* Person In Charge (Editors) */}
      <td className="archive-td">
        <div className="archive-people-group">
          {assignedDesigners.length > 0 ? (
            assignedDesigners.map((designer) => (
              <div
                key={designer.id}
                className="archive-person-chip"
                title={`Editor: ${designer.fullName} (${designer.email})`}
              >
                <Avatar
                  src={designer.avatarUrl}
                  name={designer.fullName}
                  size={16}
                />
                <span>{designer.fullName.split(' ')[0]}</span>
              </div>
            ))
          ) : (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              Belum Ditugaskan
            </span>
          )}
        </div>
      </td>

      {/* Requestor */}
      <td className="archive-td">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title={`Requester: ${job.requestor?.fullName || 'Anonim'}`}
        >
          <Avatar
            src={job.requestor?.avatarUrl}
            name={job.requestor?.fullName || 'Requester'}
            size={18}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            {job.requestor?.fullName.split(' ')[0] || 'Anonim'}
          </span>
        </div>
      </td>

      {/* Division / From */}
      <td className="archive-td">
        <span className="archive-division-badge">
          {job.divisionName || 'Umum'}
        </span>
      </td>

      {/* Due Date */}
      <td className="archive-td">
        <div className="archive-due-group">
          <span className="archive-due-date">{formatDate(job.deadline)}</span>
        </div>
      </td>

      {/* Brief Link */}
      <td className="archive-td" onClick={(e) => e.stopPropagation()}>
        <a
          href={job.briefLink}
          target="_blank"
          rel="noopener noreferrer"
          className="archive-brief-btn"
          title="Buka Brief Google Docs"
        >
          <GoogleDocsIcon size={12} />
          <span>Brief</span>
        </a>
      </td>
    </tr>
  );
});
