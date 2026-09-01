'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileImage, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  completeDeliverableUploadAction,
  deleteDeliverableAction,
  getDeliverableDownloadUrlAction,
  getDeliverablesAction,
  initiateDeliverableUploadAction,
} from '@/app/actions/deliverables';
import { Deliverable, Job, Profile } from '@/types';
import { formatDateTime } from '@/lib/utils';

const MAX_DELIVERABLE_SIZE = 15 * 1024 * 1024;
type LoadMode = 'initial' | 'silent';

interface JobDeliverablesPanelProps {
  job: Job;
  currentUser: Profile;
  isOpen: boolean;
}

export function JobDeliverablesPanel({ job, currentUser, isOpen }: JobDeliverablesPanelProps) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const isRefreshingRef = useRef(false);

  const assignedDesigner =
    job.designerId === currentUser.id ||
    job.designerIds?.includes(currentUser.id) ||
    job.designers?.some((designer) => designer.id === currentUser.id);
  const canUpload =
    !job.isArchived &&
    (job.status === 'wip' || job.status === 'revisions') &&
    (currentUser.role === 'admin' || (currentUser.role === 'designer' && assignedDesigner));
  const canDelete = currentUser.role === 'admin';

  const loadDeliverables = useCallback(async (mode: LoadMode = 'initial') => {
    if (mode === 'silent') {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setDeliverables([]);
    }

    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const result = await getDeliverablesAction(job.id);
      if (requestId !== requestIdRef.current) return;
      if (result.success) {
        setDeliverables(result.data || []);
      } else {
        setError(result.error || 'Gagal memuat deliverable');
      }
    } catch {
      if (requestId === requestIdRef.current) setError('Gagal memuat deliverable');
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === 'initial') setIsLoading(false);
        else setIsRefreshing(false);
      }
      if (mode === 'silent') isRefreshingRef.current = false;
    }
  }, [job.id]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => void loadDeliverables('initial'), 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      isRefreshingRef.current = false;
    };
  }, [isOpen, loadDeliverables]);

  useEffect(() => {
    if (!isOpen) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`deliverables-${job.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliverables', filter: `job_id=eq.${job.id}` },
        () => void loadDeliverables('silent')
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, job.id, loadDeliverables]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!/\.(jpe?g)$/i.test(file.name) || file.type !== 'image/jpeg') {
      setError('Pilih file JPG atau JPEG dengan format image/jpeg.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_DELIVERABLE_SIZE) {
      setError('Ukuran JPG atau JPEG maksimal 15 MB.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const prepared = await initiateDeliverableUploadAction(job.id, {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!prepared.success || !prepared.data) {
        setError(prepared.error || 'Gagal menyiapkan upload.');
        return;
      }

      const uploadResponse = await fetch(prepared.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(`Upload ke penyimpanan gagal (HTTP ${uploadResponse.status}).`);
      }

      const completed = await completeDeliverableUploadAction(prepared.data.uploadId);
      if (!completed.success) {
        setError(completed.error || 'Gagal mendaftarkan hasil desain.');
        return;
      }
      await loadDeliverables('silent');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Gagal mengunggah hasil desain.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (deliverable: Deliverable) => {
    setError(null);
    const result = await getDeliverableDownloadUrlAction(deliverable.id);
    if (!result.success || !result.data) {
      setError(result.error || 'Gagal menyiapkan download.');
      return;
    }
    const link = document.createElement('a');
    link.href = result.data.url;
    link.download = deliverable.originalFilename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDelete = async (deliverable: Deliverable) => {
    if (!window.confirm('Hapus hasil desain ini secara permanen?')) return;

    setDeletingId(deliverable.id);
    setError(null);
    try {
      const result = await deleteDeliverableAction(deliverable.id);
      if (!result.success) {
        setError(result.error || 'Gagal menghapus hasil desain.');
        return;
      }
      await loadDeliverables('silent');
    } catch {
      setError('Gagal menghapus hasil desain.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="job-deliverables-column"
      onClick={(event) => event.stopPropagation()}
    >
      <aside className="job-deliverables-panel" aria-label="Submitted Design">
        <div className="job-deliverables-header">
          <div className="job-deliverables-heading">
            <div>
              <h3 className="job-deliverables-title">Submitted Design</h3>
              <p className="job-deliverables-subtitle">hasil akan muncul di sini</p>
            </div>
          </div>
          <div className="job-deliverables-actions">
            <button
              type="button"
              className="job-deliverables-refresh-button"
              onClick={() => void loadDeliverables('silent')}
              disabled={isLoading || isRefreshing || isUploading}
              title="Refresh submitted designs"
              aria-label="Refresh submitted designs"
            >
              {isRefreshing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
            </button>
            {canUpload && (
              <>
                <input
                  ref={fileInputRef}
                  className="job-deliverables-file-input"
                  type="file"
                  accept=".jpg,.jpeg,image/jpeg"
                  onChange={handleUpload}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  className="job-deliverables-upload-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Upload a JPG or JPEG design"
                >
                  {isUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="job-deliverables-state" aria-live="polite">
            <Loader2 size={18} className="spin" />
            <span>Memuat hasil desain...</span>
          </div>
        ) : deliverables.length === 0 ? (
          <div className="job-deliverables-state">
            <div className="job-deliverables-empty-icon"><FileImage size={22} /></div>
            <strong>Belum ada hasil desain</strong>
            <span>{canUpload ? 'Unggah JPG pertama untuk requestor.' : 'Hasil desain akan muncul di sini setelah dikirim.'}</span>
          </div>
        ) : (
          <div className="job-deliverables-list">
            {deliverables.map((deliverable, index) => {
              const uploadDescription = `Hasil desain versi ${deliverable.version}, diunggah ${formatDateTime(deliverable.registeredAt)} oleh ${deliverable.uploaderName || 'editor'}`;
              const isDeleting = deletingId === deliverable.id;
              return (
                <article
                  className={`job-deliverable-item ${index === 0 ? 'is-latest' : ''}`}
                  key={deliverable.id}
                  title={uploadDescription}
                >
                  <a
                    className="job-deliverable-preview-link"
                    href={deliverable.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Buka preview ${uploadDescription}`}
                  >
                    <img
                      className="job-deliverable-preview"
                      src={deliverable.previewUrl}
                      alt={`Preview ${uploadDescription}`}
                    />
                  </a>
                  <div className="job-deliverable-action-cluster">
                    <time
                      className="job-deliverable-time-button"
                      dateTime={deliverable.registeredAt}
                      title={uploadDescription}
                    >
                      {formatDateTime(deliverable.registeredAt)}
                    </time>
                    <button
                      type="button"
                      className="job-deliverable-icon-button"
                      onClick={() => void handleDownload(deliverable)}
                      title={`Unduh hasil desain versi ${deliverable.version}`}
                      aria-label={`Unduh hasil desain versi ${deliverable.version}`}
                    >
                      <Download size={14} />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        className="job-deliverable-icon-button is-danger"
                        onClick={() => void handleDelete(deliverable)}
                        disabled={isDeleting || deletingId !== null}
                        title={`Hapus hasil desain versi ${deliverable.version}`}
                        aria-label={`Hapus hasil desain versi ${deliverable.version}`}
                      >
                        {isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </aside>
      {error && (
        <div className="job-deliverables-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}
    </div>
  );
}
