import React from 'react';
import { Job, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { getDeadlineStatus, formatDate } from '@/lib/utils';

interface JobDetailPropertiesProps {
  job: Job;
  assignedDesigners: Profile[];
}

export const JobDetailProperties = React.memo(function JobDetailProperties({
  job,
  assignedDesigners,
}: JobDetailPropertiesProps) {
  const deadlineStatus = getDeadlineStatus(job.deadline);

  return (
    <div className="simple-props-list">
      {/* Requestor */}
      <div className="simple-prop-row">
        <span className="simple-prop-label">Requester</span>
        <div className="simple-prop-value">
          <Avatar
            src={job.requestor?.avatarUrl}
            name={job.requestor?.fullName || 'Requester'}
            size={18}
          />
          <span title={job.requestor?.email}>
            {job.requestor?.fullName || 'Anonim'}
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '5px',
                width: '100%',
              }}
            >
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
          <span>{job.divisionName || 'Umum'}</span>
        </div>
      </div>

      {/* Deadline */}
      <div className="simple-prop-row">
        <span className="simple-prop-label">Deadline Waktu</span>
        <div className="simple-prop-value">
          <span>{formatDate(job.deadline)}</span>
          <span className={`simple-deadline-tag ${deadlineStatus.urgency}`}>
            {deadlineStatus.label}
          </span>
        </div>
      </div>

      {/* Publication Media */}
      <div className="simple-prop-row">
        <span className="simple-prop-label">Media</span>
        <div className="simple-prop-value">
          <span>{job.publicationMedia}</span>
        </div>
      </div>
    </div>
  );
});
