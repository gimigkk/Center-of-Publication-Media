'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import JSZip from 'jszip';
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
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [imageResolutions, setImageResolutions] = useState<Record<string, string>>({});
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [hasGalleryOverflow, setHasGalleryOverflow] = useState(false);
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
  const canDelete = currentUser.role === 'admin' || currentUser.role === 'designer';
  const canManageFiles = currentUser.role === 'admin' || currentUser.role === 'designer';

  const formatFileSize = (sizeBytes: number) => {
    if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

  const uploadFile = async (file: File) => {
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

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void uploadFile(file);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canUpload || isUploading || !Array.from(event.dataTransfer.types).includes('Files')) return;
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (canUpload && !isUploading && Array.from(event.dataTransfer.types).includes('Files')) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canUpload || isUploading || !Array.from(event.dataTransfer.types).includes('Files')) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (!canUpload || isUploading) return;

    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
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

  const handleDownloadAll = async () => {
    if (isDownloadingAll) return;
    setIsDownloadingAll(true);
    setError(null);
    try {
      const results = await Promise.all(deliverables.map((deliverable) => getDeliverableDownloadUrlAction(deliverable.id)));
      const failed = results.find((result) => !result.success || !result.data);
      if (failed || results.length !== deliverables.length) {
        setError(failed?.error || 'Gagal menyiapkan semua download.');
        return;
      }

      const zip = new JSZip();
      await Promise.all(results.map(async (result, index) => {
        const response = await fetch(result.data!.url);
        if (!response.ok) throw new Error('Gagal mengambil salah satu file.');
        zip.file(deliverables[index].originalFilename, await response.blob());
      }));
      const archive = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archive);
      link.download = `${job.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'deliverables'}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError('Gagal menyiapkan semua download.');
    } finally {
      setIsDownloadingAll(false);
    }
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

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const updateEdges = () => {
      const maxScrollTop = gallery.scrollHeight - gallery.clientHeight;
      setHasGalleryOverflow(maxScrollTop - gallery.scrollTop > 2);
    };

    updateEdges();
    gallery.addEventListener('scroll', updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(gallery);
    return () => {
      gallery.removeEventListener('scroll', updateEdges);
      observer.disconnect();
    };
  }, [deliverables.length]);

  const galleryColumns: Array<Array<{ deliverable: Deliverable; index: number }>> = [[], []];
  const galleryHeights = [0, 0];
  const areAllImageRatiosKnown = deliverables.every((deliverable) => imageRatios[deliverable.id] !== undefined);

  deliverables.forEach((deliverable, index) => {
    const ratio = imageRatios[deliverable.id] || 1;
    const estimatedHeight = 1 / Math.max(ratio, 0.1);
    const columnIndex = areAllImageRatiosKnown
      ? (galleryHeights[0] <= galleryHeights[1] ? 0 : 1)
      : index % 2;

    galleryColumns[columnIndex].push({ deliverable, index });
    galleryHeights[columnIndex] += estimatedHeight;
  });

  const renderDeliverable = (deliverable: Deliverable, index: number) => {
    const uploadDescription = `Hasil desain versi ${deliverable.version}, diunggah ${formatDateTime(deliverable.registeredAt)} oleh ${deliverable.uploaderName || 'editor'}`;
    const isDeleting = deletingId === deliverable.id;
    return (
      <article className={`job-deliverable-item ${index === 0 ? 'is-latest' : ''} ${isDeleting ? 'is-deleting' : ''}`} key={deliverable.id} title={uploadDescription}>
        <a className="job-deliverable-preview-link" href={deliverable.previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buka preview ${uploadDescription}`}>
          <img className="job-deliverable-preview" src={deliverable.previewUrl} alt={`Preview ${uploadDescription}`} onLoad={(event) => {
            const image = event.currentTarget;
            setImageResolutions((current) => ({ ...current, [deliverable.id]: `${image.naturalWidth} × ${image.naturalHeight}px` }));
            setImageRatios((current) => ({ ...current, [deliverable.id]: image.naturalWidth / image.naturalHeight }));
          }} />
        </a>
        <div className="job-deliverable-details job-deliverable-overlay">
          <div className="job-deliverable-info">
            <strong className="job-deliverable-filename" title={deliverable.originalFilename}>{deliverable.originalFilename}</strong>
            <div className="job-deliverable-meta"><time dateTime={deliverable.registeredAt}>{formatDateTime(deliverable.registeredAt)}</time><span className="job-deliverable-resolution">{imageResolutions[deliverable.id] || 'Loading resolution...'}</span></div>
          </div>
          {canManageFiles && <div className="job-deliverable-buttons">
            <button type="button" className="job-deliverable-download-button" onClick={() => void handleDownload(deliverable)} title={`Unduh hasil desain versi ${deliverable.version}`} aria-label={`Unduh hasil desain versi ${deliverable.version}, ${formatFileSize(deliverable.sizeBytes)}`}><Download size={15} /><span>{formatFileSize(deliverable.sizeBytes)}</span></button>
            {canDelete && <button type="button" className="job-deliverable-icon-button is-danger" onClick={() => void handleDelete(deliverable)} disabled={isDeleting || deletingId !== null} title={`Hapus hasil desain versi ${deliverable.version}`} aria-label={`Hapus hasil desain versi ${deliverable.version}`}>{isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}</button>}
          </div>}
        </div>
      </article>
    );
  };

  return (
    <div
      className="job-deliverables-column"
      onClick={(event) => event.stopPropagation()}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <aside className={`job-deliverables-panel ${isDragActive ? 'is-drag-active' : ''}`} aria-label="Submitted Design">
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
            {canManageFiles && deliverables.length > 0 && (
              <button
                type="button"
                className="job-deliverables-download-all-button"
                onClick={() => void handleDownloadAll()}
                disabled={isDownloadingAll}
                title="Download all submitted designs"
                aria-label="Download all submitted designs"
              >
                {isDownloadingAll ? (
                  <span className="download-all-loading" aria-label="Preparing download">
                    <i /><i /><i />
                  </span>
                ) : (
                  <><Download size={13} /><span>All</span></>
                )}
              </button>
            )}
          </div>
        </div>

        {isDragActive && (
          <div className="job-deliverables-drop-overlay" role="status" aria-live="polite">
            <div className="job-deliverables-drop-message">
              <strong>Drop file to upload</strong>
              <span>Release to add this JPG or JPEG</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="job-deliverables-state" aria-live="polite">
            <span className="deliverables-loading-dots" aria-hidden="true"><i /><i /><i /></span>
            <span>Memuat hasil desain...</span>
          </div>
        ) : deliverables.length === 0 ? (
          <div className="job-deliverables-state">
            <strong>Belum ada hasil desain</strong>
            <span>{canUpload ? 'Unggah JPG pertama untuk requestor.' : 'Hasil desain akan muncul di sini setelah dikirim.'}</span>
          </div>
        ) : (
          <div className={`job-deliverables-gallery ${hasGalleryOverflow ? 'has-bottom-overflow' : ''}`} ref={galleryRef}>
            <div className="job-deliverables-masonry">
              {galleryColumns.map((column, columnIndex) => (
                <div className="job-deliverables-list" key={columnIndex}>
                  {column.map(({ deliverable, index }) => renderDeliverable(deliverable, index))}
                </div>
              ))}
            </div>
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
