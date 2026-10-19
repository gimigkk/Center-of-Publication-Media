'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  abortDeliverableUploadAction,
  completeDeliverableUploadAction,
  deleteDeliverableAction,
  getDeliverableDownloadUrlAction,
  getDeliverablePdfDataAction,
  getDeliverablesAction,
  initiateDeliverableUploadAction,
  saveDeliverablePreviewAction,
} from '@/app/actions/deliverables';
import { Deliverable, Job, Profile } from '@/types';
import { compressImageToJpeg, formatDateTime } from '@/lib/utils';
import { createPdfFallbackDataUrl, renderPdfToJpegBlob } from '@/lib/pdf-thumbnail';

const MAX_DELIVERABLE_SIZE = 15 * 1024 * 1024;
type LoadMode = 'initial' | 'silent' | 'manual';

type UploadFileResult = {
  fileName: string;
  success: boolean;
  error?: string;
};

// 12-hour client cache matching 24-hour presigned URL lifetime
const DELIVERABLES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const deliverablesCache = new Map<string, Deliverable[]>();
const deliverableMetaCache = new Map<string, { ratio: number; resolution: string }>();

function readCachedDeliverables(jobId: string): Deliverable[] | undefined {
  const memory = deliverablesCache.get(jobId);
  if (memory) return memory;
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.sessionStorage.getItem(`deliverables:${jobId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      cachedAt: number;
      data: Deliverable[];
      meta?: Record<string, { ratio: number; resolution: string }>;
    };
    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > DELIVERABLES_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(`deliverables:${jobId}`);
      return undefined;
    }
    if (parsed.meta) {
      Object.entries(parsed.meta).forEach(([id, meta]) => {
        deliverableMetaCache.set(id, meta);
      });
    }
    deliverablesCache.set(jobId, parsed.data);
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeCachedDeliverables(jobId: string, data: Deliverable[]) {
  deliverablesCache.set(jobId, data);
  if (typeof window === 'undefined') return;
  try {
    const meta: Record<string, { ratio: number; resolution: string }> = {};
    data.forEach((d) => {
      const m = deliverableMetaCache.get(d.id);
      if (m) meta[d.id] = m;
    });
    window.sessionStorage.setItem(
      `deliverables:${jobId}`,
      JSON.stringify({ cachedAt: Date.now(), data, meta })
    );
  } catch {}
}

export function seedDeliverablesCache(deliverablesMap?: Record<string, Deliverable[]>) {
  if (!deliverablesMap) return;
  Object.entries(deliverablesMap).forEach(([jobId, items]) => {
    writeCachedDeliverables(jobId, items);
  });
}

export function prefetchDeliverables(jobId: string) {
  if (!jobId || readCachedDeliverables(jobId)) return;
  void getDeliverablesAction(jobId).then((result) => {
    if (result.success && result.data) {
      writeCachedDeliverables(jobId, result.data);
    }
  });
}

interface JobDeliverablesPanelProps {
  job: Job;
  currentUser: Profile;
  isOpen: boolean;
}

export function JobDeliverablesPanel({ job, currentUser, isOpen }: JobDeliverablesPanelProps) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>(() => readCachedDeliverables(job.id) || []);
  const [isLoading, setIsLoading] = useState(() => !readCachedDeliverables(job.id));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const isUploadingRef = useRef(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [imageResolutions, setImageResolutions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const cached = readCachedDeliverables(job.id) || [];
    cached.forEach((d) => {
      const meta = deliverableMetaCache.get(d.id);
      if (meta) initial[d.id] = meta.resolution;
    });
    return initial;
  });
  const [imageRatios, setImageRatios] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    const cached = readCachedDeliverables(job.id) || [];
    cached.forEach((d) => {
      const meta = deliverableMetaCache.get(d.id);
      if (meta) initial[d.id] = meta.ratio;
    });
    return initial;
  });
  const [loadedPreviewIds, setLoadedPreviewIds] = useState<Record<string, boolean>>({});
  const [pdfThumbnails, setPdfThumbnails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [hasGalleryOverflow, setHasGalleryOverflow] = useState(false);
  const requestIdRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const loadingThumbnailsRef = useRef<Set<string>>(new Set());
  const hasRetriedRef = useRef<Set<string>>(new Set());

  const assignedDesigner =
    job.designerId === currentUser.id ||
    job.designerIds?.includes(currentUser.id) ||
    job.designers?.some((designer) => designer.id === currentUser.id);
  const canUpload =
    !job.isArchived &&
    (job.status === 'wip' || job.status === 'revisions') &&
    (currentUser.role === 'admin' || (currentUser.role === 'designer' && assignedDesigner));
  const canDelete = currentUser.role === 'admin' || currentUser.role === 'designer';

  const formatFileSize = (sizeBytes: number) => {
    if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const loadDeliverables = useCallback(async (mode: LoadMode = 'initial') => {
    const cached = readCachedDeliverables(job.id);
    if (mode === 'silent' || mode === 'manual' || cached) {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      if (mode === 'manual') setIsRefreshing(true);
      if (cached) {
        setDeliverables((current) => (current.length > 0 ? current : cached));
        setIsLoading(false);
      }
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
        const nextDeliverables = result.data || [];
        setDeliverables((current) => {
          const isSameList =
            current.length === nextDeliverables.length &&
            current.every((item, i) =>
              item.id === nextDeliverables[i]?.id &&
              item.blurDataUrl === nextDeliverables[i]?.blurDataUrl &&
              item.width === nextDeliverables[i]?.width);

          if (isSameList) {
            // Keep existing previewUrls so <img> doesn't reload and flicker!
            return current;
          }

          const currentUrlMap = new Map(current.map((item) => [item.id, item.previewUrl]));
          const merged = nextDeliverables.map((item) => ({
            ...item,
            previewUrl: currentUrlMap.get(item.id) || item.previewUrl,
          }));
          writeCachedDeliverables(job.id, merged);
          return merged;
        });
      } else {
        console.error('[deliverables] load failed:', result.error);
        setError(result.error || 'Gagal memuat deliverable');
      }
    } catch (err) {
      console.error('[deliverables] load exception:', err);
      if (requestId === requestIdRef.current) setError('Gagal memuat deliverable');
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === 'initial') setIsLoading(false);
        else if (mode === 'manual') setIsRefreshing(false);
      }
      isRefreshingRef.current = false;
    }
  }, [job.id]);

  useEffect(() => {
    if (!isOpen) return;
    const cached = readCachedDeliverables(job.id);
    const timer = window.setTimeout(() => void loadDeliverables(cached ? 'silent' : 'initial'), 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      isRefreshingRef.current = false;
    };
  }, [isOpen, job.id, loadDeliverables]);

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

  useEffect(() => {
    deliverables.forEach((deliverable) => {
      const isPdf = deliverable.mimeType === 'application/pdf' || /\.pdf$/i.test(deliverable.originalFilename);
      const isPdfUrl = /\.pdf(\?|$)/i.test(deliverable.previewUrl);
      if (isPdf && isPdfUrl && !pdfThumbnails[deliverable.id] && !loadingThumbnailsRef.current.has(deliverable.id)) {
        loadingThumbnailsRef.current.add(deliverable.id);
        void getDeliverablePdfDataAction(deliverable.id)
          .then(async (res) => {
            if (!res.success || !res.data) throw new Error(res.error || 'Gagal memuat file PDF');
            const binaryString = atob(res.data.base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const rendered = await renderPdfToJpegBlob(bytes);
            const ratio = rendered.width / rendered.height;
            const resolution = `${rendered.width} × ${rendered.height}px`;
            deliverableMetaCache.set(deliverable.id, { ratio, resolution });
            setPdfThumbnails((prev) => ({ ...prev, [deliverable.id]: rendered.dataUrl }));
            setImageRatios((prev) => ({ ...prev, [deliverable.id]: ratio }));
            setImageResolutions((prev) => ({ ...prev, [deliverable.id]: resolution }));
            setLoadedPreviewIds((prev) => ({ ...prev, [deliverable.id]: true }));
            void saveDeliverablePreviewAction(deliverable.id, rendered.dataUrl);
          })
          .catch((err) => {
            console.error('Failed to generate PDF thumbnail for', deliverable.originalFilename, err);
            setPdfThumbnails((prev) => ({
              ...prev,
              [deliverable.id]: createPdfFallbackDataUrl(deliverable.originalFilename),
            }));
          });
      }
    });
  }, [deliverables, pdfThumbnails]);

  const isImageFile = (file: File) => /\.(jpe?g|png)$/i.test(file.name) || file.type === 'image/jpeg' || file.type === 'image/png';
  const isPdfFile = (file: File) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';

  const uploadFile = async (file: File): Promise<UploadFileResult> => {
    const isImage = isImageFile(file);
    const isPdf = isPdfFile(file);

    if (!isImage && !isPdf) {
      return { fileName: file.name, success: false, error: 'Pilih file JPG, PNG, atau PDF yang valid.' };
    }
    if (file.size <= 0 || file.size > MAX_DELIVERABLE_SIZE) {
      return { fileName: file.name, success: false, error: 'Ukuran file maksimal 15 MB.' };
    }

    let uploadId: string | undefined;
    try {
      let previewBlob: Blob | null = null;
      if (isPdf) {
        try {
          const rendered = await renderPdfToJpegBlob(file);
          previewBlob = rendered.blob;
        } catch (pdfErr) {
          console.warn('Could not generate PDF preview during upload:', pdfErr);
        }
      } else {
        previewBlob = await compressImageToJpeg(file);
      }

      const effectiveMimeType = isPdf
        ? 'application/pdf'
        : (/\.png$/i.test(file.name) || file.type === 'image/png')
          ? 'image/png'
          : 'image/jpeg';

      const prepared = await initiateDeliverableUploadAction(job.id, {
        filename: file.name,
        mimeType: effectiveMimeType,
        sizeBytes: file.size,
      });
      if (!prepared.success || !prepared.data) {
        return { fileName: file.name, success: false, error: prepared.error || 'Gagal menyiapkan upload.' };
      }
      uploadId = prepared.data.uploadId;

      const uploadPromises: Promise<Response>[] = [
        fetch(prepared.data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': effectiveMimeType },
          body: file,
        }),
      ];

      if (previewBlob && prepared.data.previewUploadUrl) {
        uploadPromises.push(
          fetch(prepared.data.previewUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: previewBlob,
          })
        );
      }

      const responses = await Promise.all(uploadPromises);
      const failedResponse = responses.find((res) => !res.ok);
      if (failedResponse) {
        throw new Error(`Upload ke penyimpanan gagal (HTTP ${failedResponse.status}).`);
      }

      const completed = await completeDeliverableUploadAction(uploadId);
      if (!completed.success) throw new Error(completed.error || 'Gagal mendaftarkan hasil desain.');
      return { fileName: file.name, success: true };
    } catch (uploadError) {
      if (uploadId) void abortDeliverableUploadAction(uploadId);
      return {
        fileName: file.name,
        success: false,
        error: uploadError instanceof Error ? uploadError.message : 'Gagal mengunggah hasil desain.',
      };
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!canUpload || isUploadingRef.current || files.length === 0) return;
    isUploadingRef.current = true;
    dragDepthRef.current = 0;
    setIsDragActive(false);
    setIsUploading(true);
    setError(null);
    setUploadProgress({ completed: 0, total: files.length });

    try {
      const results = await Promise.all(files.map(async (file) => {
        const result = await uploadFile(file);
        setUploadProgress((current) => ({ ...current, completed: current.completed + 1 }));
        return result;
      }));
      const successful = results.filter((result) => result.success).length;
      const failed = results.length - successful;
      if (successful > 0) await loadDeliverables('silent');
      if (failed > 0) {
        const failures = results.filter((result) => !result.success).map((result) => `${result.fileName}: ${result.error}`).join(' ');
        setError(`${successful} berhasil diunggah, ${failed} gagal. ${failures}`);
      }
    } catch {
      setError('Gagal memproses batch upload.');
    } finally {
      isUploadingRef.current = false;
      setIsUploading(false);
    }
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void handleUploadFiles(files);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canUpload || isUploadingRef.current || !Array.from(event.dataTransfer.types).includes('Files')) return;
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (canUpload && !isUploadingRef.current && Array.from(event.dataTransfer.types).includes('Files')) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canUpload || isUploadingRef.current || !Array.from(event.dataTransfer.types).includes('Files')) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (!canUpload || isUploadingRef.current) return;

    const files = Array.from(event.dataTransfer.files || []);
    void handleUploadFiles(files);
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

      const JSZip = (await import('jszip')).default;
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

    setDeletingIds((current) => new Set(current).add(deliverable.id));
    setError(null);
    try {
      const result = await deleteDeliverableAction(deliverable.id);
      if (!result.success) {
        setError(result.error || 'Gagal menghapus hasil desain.');
        return;
      }
      setDeliverables((current) => {
        const next = current.filter((item) => item.id !== deliverable.id);
        writeCachedDeliverables(job.id, next);
        return next;
      });
      void loadDeliverables('silent');
    } catch {
      setError('Gagal menghapus hasil desain.');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(deliverable.id);
        return next;
      });
    }
  };

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const updateEdges = () => {
      // pony: real scroll check. No scroll room or single item -> never overflow
      if (deliverables.length <= 1) {
        setHasGalleryOverflow(false);
        return;
      }
      const scrollableDistance = gallery.scrollHeight - gallery.clientHeight;
      if (scrollableDistance <= 16) {
        setHasGalleryOverflow(false);
        return;
      }
      const remainingScroll = scrollableDistance - gallery.scrollTop;
      setHasGalleryOverflow(remainingScroll > 8);
    };

    updateEdges();
    gallery.addEventListener('scroll', updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(gallery);
    Array.from(gallery.children).forEach((child) => observer.observe(child));
    return () => {
      gallery.removeEventListener('scroll', updateEdges);
      observer.disconnect();
    };
  }, [deliverables.length, loadedPreviewIds, pdfThumbnails]);

  const isDeliverableWide = (deliverable: Deliverable) => {
    if (deliverables.length === 1) return true;
    const ratio = deliverable.width && deliverable.height
      ? deliverable.width / deliverable.height
      : imageRatios[deliverable.id];
    if (ratio !== undefined) return ratio > 1.25;
    return false;
  };

  const wideDeliverables: Array<{ deliverable: Deliverable; index: number }> = [];
  const columnDeliverables: Array<{ deliverable: Deliverable; index: number }> = [];

  deliverables.forEach((deliverable, index) => {
    if (isDeliverableWide(deliverable)) {
      wideDeliverables.push({ deliverable, index });
    } else {
      columnDeliverables.push({ deliverable, index });
    }
  });

  const galleryColumns: Array<Array<{ deliverable: Deliverable; index: number }>> = [[], []];
  columnDeliverables.forEach(({ deliverable, index }) => {
    galleryColumns[index % 2].push({ deliverable, index });
  });

  const renderDeliverable = (deliverable: Deliverable, index: number) => {
    const isPdf = deliverable.mimeType === 'application/pdf' || /\.pdf$/i.test(deliverable.originalFilename);
    const uploadDescription = `Hasil desain ${deliverable.originalFilename}, diunggah ${formatDateTime(deliverable.registeredAt)} oleh ${deliverable.uploaderName || 'editor'}`;
    const isDeleting = deletingIds.has(deliverable.id);
    const displaySrc = pdfThumbnails[deliverable.id] || deliverable.previewUrl;
    const isLoaded = Boolean(loadedPreviewIds[deliverable.id]);
    const serverRatio = deliverable.width && deliverable.height ? deliverable.width / deliverable.height : undefined;
    const ratio = serverRatio || imageRatios[deliverable.id] || (isPdf ? 0.75 : undefined);

    const targetUrl = `/api/deliverables/${deliverable.id}/view`;

    return (
      <article
        className={`job-deliverable-item float-up-entry ${index === 0 ? 'is-latest' : ''} ${isDeleting ? 'is-deleting' : ''}`}
        style={{
          '--float-up-duration': '900ms',
          '--float-up-delay': `${Math.min(index, 7) * 140}ms`,
        } as React.CSSProperties}
        key={deliverable.id}
        title={uploadDescription}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          if (!(e.target as HTMLElement).closest('a')) {
            if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
        }}
      >
        <a
          className={`job-deliverable-preview-link ${isLoaded ? 'is-image-loaded' : 'is-loading-preview'}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Buka preview ${uploadDescription}`}
          style={ratio ? { aspectRatio: `${ratio}` } : undefined}
        >
          {deliverable.blurDataUrl && (
            <img
              className="job-deliverable-blur"
              src={deliverable.blurDataUrl}
              alt=""
              aria-hidden="true"
            />
          )}
          <span className="deliverables-loading-dots preview-loading-dots" aria-label="Loading preview">
            <i /><i /><i />
          </span>
          <img
            className="job-deliverable-preview"
            src={displaySrc}
            alt={`Preview ${uploadDescription}`}
            loading="eager"
            decoding="async"
            fetchPriority={index === 0 ? 'high' : 'auto'}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                const imgRatio = image.naturalWidth / image.naturalHeight;
                const imgResolution = `${image.naturalWidth} × ${image.naturalHeight}px`;
                deliverableMetaCache.set(deliverable.id, { ratio: imgRatio, resolution: imgResolution });
                setImageResolutions((current) => ({ ...current, [deliverable.id]: imgResolution }));
                setImageRatios((current) => ({ ...current, [deliverable.id]: imgRatio }));
              }
              // Delay loaded flag by one frame so aspect-ratio settles before fade-in
              requestAnimationFrame(() => {
                setLoadedPreviewIds((current) => ({ ...current, [deliverable.id]: true }));
              });
            }}
            onError={() => {
              if (!hasRetriedRef.current.has(deliverable.id)) {
                hasRetriedRef.current.add(deliverable.id);
                void loadDeliverables('silent');
              } else {
                setLoadedPreviewIds((current) => ({ ...current, [deliverable.id]: true }));
              }
            }}
          />
        </a>
        <div className="job-deliverable-details job-deliverable-overlay">
          <div className="job-deliverable-info">
            <strong className="job-deliverable-filename" title={deliverable.originalFilename}>{deliverable.originalFilename}</strong>
            <div className="job-deliverable-meta">
              <time dateTime={deliverable.registeredAt}>{formatDateTime(deliverable.registeredAt)}</time>
              <span className="job-deliverable-resolution">
                {imageResolutions[deliverable.id] || (isPdf ? 'Dokumen PDF' : isLoaded ? '' : 'Memuat...')}
              </span>
            </div>
          </div>
          <div className="job-deliverable-buttons">
            <button
              type="button"
              className="job-deliverable-download-button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(deliverable);
              }}
              title={`Unduh ${deliverable.originalFilename}`}
              aria-label={`Unduh ${deliverable.originalFilename}, ${formatFileSize(deliverable.sizeBytes)}`}
            >
              <Download size={15} />
              <span>{formatFileSize(deliverable.sizeBytes)}</span>
            </button>
            {canDelete && (
              <button
                type="button"
                className="job-deliverable-icon-button is-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(deliverable);
                }}
                disabled={isDeleting}
                title={`Hapus ${deliverable.originalFilename}`}
                aria-label={`Hapus ${deliverable.originalFilename}`}
              >
                {isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
              </button>
            )}
          </div>
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
              onClick={() => void loadDeliverables('manual')}
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
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={handleUpload}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  className="job-deliverables-upload-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Upload one or more JPG, PNG, or PDF designs"
                >
                  {isUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  <span>{isUploading ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}...` : 'Upload'}</span>
                </button>
              </>
            )}
            {deliverables.length > 0 && (
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
              <strong>Drop files to upload</strong>
              <span>Release to add JPG, PNG, or PDF designs</span>
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
            <span>{canUpload ? 'Unggah satu atau beberapa file JPG, PNG, atau PDF untuk requestor.' : 'Hasil desain akan muncul di sini setelah dikirim.'}</span>
          </div>
        ) : (
          <div className={`job-deliverables-gallery ${hasGalleryOverflow ? 'has-bottom-overflow' : ''}`} ref={galleryRef} aria-label="Submitted design previews">
            {wideDeliverables.length > 0 && (
              <div className="job-deliverables-wide-list">
                {wideDeliverables.map(({ deliverable, index }) => renderDeliverable(deliverable, index))}
              </div>
            )}
            {columnDeliverables.length > 0 && (
              <div className="job-deliverables-masonry">
                {galleryColumns.map((column, columnIndex) => (
                  <div className="job-deliverables-list" key={columnIndex}>
                    {column.map(({ deliverable, index }) => renderDeliverable(deliverable, index))}
                  </div>
                ))}
              </div>
            )}
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
