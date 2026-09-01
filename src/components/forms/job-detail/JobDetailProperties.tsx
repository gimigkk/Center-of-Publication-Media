'use client';

import React, { useState, useEffect } from 'react';
import { Job, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { getDeadlineStatus, formatDate, getWhatsAppUrl } from '@/lib/utils';
import { Pencil, Check, X, Loader2 } from 'lucide-react';

interface JobDetailPropertiesProps {
  job: Job;
  assignedDesigners: Profile[];
  isAdmin?: boolean;
  onUpdateDeadline?: (jobId: string, deadline: string) => Promise<{ success: boolean; error?: string }>;
}

export const JobDetailProperties = React.memo(function JobDetailProperties({
  job,
  assignedDesigners,
  isAdmin = false,
  onUpdateDeadline,
}: JobDetailPropertiesProps) {
  const deadlineStatus = getDeadlineStatus(job.deadline);

  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [editDeadline, setEditDeadline] = useState(
    job.deadline ? new Date(job.deadline).toISOString().split('T')[0] : ''
  );
  const [isSubmittingDeadline, setIsSubmittingDeadline] = useState(false);

  // Sync state when job or deadline changes
  useEffect(() => {
    setEditDeadline(job.deadline ? new Date(job.deadline).toISOString().split('T')[0] : '');
    setIsEditingDeadline(false);
  }, [job.id, job.deadline]);

  const handleDeadlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDeadline || isSubmittingDeadline) return;

    setIsSubmittingDeadline(true);
    try {
      if (onUpdateDeadline) {
        const res = await onUpdateDeadline(job.id, editDeadline);
        if (res?.success) {
          setIsEditingDeadline(false);
        }
      }
    } finally {
      setIsSubmittingDeadline(false);
    }
  };

  return (
    <div className="simple-props-list">
      {/* Requestor */}
      <div className="simple-prop-row">
        <span className="simple-prop-label">Requester</span>
        <div className="simple-prop-value">
          <div className="simple-profile-chip" title={job.requestor?.email}>
            <Avatar
              src={job.requestor?.avatarUrl}
              name={job.requestor?.fullName || 'Requester'}
              size={18}
            />
            <span>{job.requestor?.fullName || 'Anonim'}</span>
          </div>
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
          style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}
        >
          {assignedDesigners.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '5px',
                width: '100%',
              }}
            >
              {assignedDesigners.map((designer) => {
                const whatsappUrl = getWhatsAppUrl(designer.phoneNumber);
                const designerContent = (
                  <>
                    <Avatar
                      src={designer.avatarUrl}
                      name={designer.fullName}
                      size={18}
                    />
                    <span style={{ fontSize: '12px', color: '#0f172a' }} title={designer.email}>
                      {designer.fullName}
                    </span>
                  </>
                );

                if (!whatsappUrl) {
                  return (
                    <div
                      key={designer.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        minHeight: '20px',
                      }}
                    >
                      {designerContent}
                    </div>
                  );
                }

                return (
                  <a
                    key={designer.id}
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Chat WhatsApp dengan ${designer.fullName}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                      minHeight: '20px',
                      color: 'inherit',
                      textDecoration: 'none',
                      background: '#ededed',
                      borderRadius: '999px',
                      padding: '2px 8px 2px 2px'
                    }}
                  >
                    {designerContent}
                  </a>
                );
              })}

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
          {isEditingDeadline ? (
            <form onSubmit={handleDeadlineSubmit} className="simple-prop-edit-form">
              <input
                type="date"
                className="simple-prop-date-input"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
                disabled={isSubmittingDeadline}
                autoFocus
                required
              />
              <button
                type="submit"
                className="simple-prop-save-btn"
                disabled={isSubmittingDeadline || !editDeadline}
                title="Simpan deadline"
              >
                {isSubmittingDeadline ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
              </button>
              <button
                type="button"
                className="simple-prop-cancel-btn"
                disabled={isSubmittingDeadline}
                onClick={() => {
                  setEditDeadline(
                    job.deadline ? new Date(job.deadline).toISOString().split('T')[0] : ''
                  );
                  setIsEditingDeadline(false);
                }}
                title="Batal"
              >
                <X size={12} />
              </button>
            </form>
          ) : (
            <>
              {isAdmin && onUpdateDeadline && (
                <button
                  type="button"
                  className="simple-prop-edit-btn"
                  onClick={() => {
                    setEditDeadline(
                      job.deadline ? new Date(job.deadline).toISOString().split('T')[0] : ''
                    );
                    setIsEditingDeadline(true);
                  }}
                  title="Ubah deadline"
                >
                  <Pencil size={11} />
                </button>
              )}
              <span>{formatDate(job.deadline)}</span>
              <span className={`simple-deadline-tag ${deadlineStatus.urgency}`}>
                {deadlineStatus.label}
              </span>
            </>
          )}
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
