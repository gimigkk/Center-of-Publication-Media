'use client';

import { useState, useEffect, useMemo } from 'react';


import { Division, Page, Profile } from '@/types';
import { GOOGLE_DOCS_REGEX } from '@/lib/validations';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { fetchGoogleDocTitleAction } from '@/app/actions/jobs';
import { AlertCircle, CheckCircle2, BookOpen, X, MessageCircle } from 'lucide-react';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface JobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  divisions: Division[];
  currentUser: Profile;
  onSubmitJob: (formData: {
    pageId: string;
    title: string;
    description?: string;
    briefLink: string;
    briefTitle?: string;
    divisionId: string;
    publicationMedia: string;
    deadline: string;
    requestorId: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export function JobFormModal({
  isOpen,
  onClose,
  currentPage,
  divisions,
  currentUser,
  onSubmitJob,
}: JobFormModalProps) {
  const { shouldRender, isClosing } = useAnimatePresence(isOpen, 110);

  // Default deadline set to 7 days in the future (H-7 minimum rule)
  const defaultDeadlineDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const minDeadlineDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const minDateStr = minDeadlineDate.toISOString().split('T')[0];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [briefLink, setBriefLink] = useState('');
  const [briefTitle, setBriefTitle] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState(
    currentUser.divisionId || (divisions[0]?.id ?? '')
  );
  const [publicationMedia, setPublicationMedia] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadlineDate.toISOString().split('T')[0]);
  const sortedDivisions = useMemo(() => {
    return [...divisions].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
  }, [divisions]);

  const [hasAgreedToRules, setHasAgreedToRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Validate Google Docs link
  const isGoogleDoc = GOOGLE_DOCS_REGEX.test(briefLink.trim());

  useEffect(() => {
    if (isGoogleDoc) {
      const timer = setTimeout(() => {
        fetchGoogleDocTitleAction(briefLink.trim()).then((docTitle) => {
          if (docTitle) {
            setBriefTitle(docTitle);
            if (!title) {
              setTitle(docTitle);
            }
          }
        });
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setBriefTitle(null);
    }
  }, [briefLink, isGoogleDoc, title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hasAgreedToRules) {
      setError('Wajib mencentang persetujuan aturan COPM sebelum membuat request.');
      return;
    }

    if (!title.trim()) {
      setError('Harap masukkan judul job');
      return;
    }

    if (!isGoogleDoc) {
      setError('Hanya link Google Docs yang diterima (contoh: https://docs.google.com/document/d/...)');
      return;
    }

    if (!divisionId) {
      setError('Silakan pilih divisi Requester Anda');
      return;
    }

    if (!publicationMedia.trim()) {
      setError('Harap masukkan format media publikasi');
      return;
    }

    const selectedDate = new Date(deadline);
    if (selectedDate < minDeadlineDate) {
      setError('Deadline paling minimal seminggu (H-7) dari pengiriman request COPM.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmitJob({
        pageId: currentPage.id,
        title: title.trim(),
        description: description.trim() || undefined,
        briefLink: briefLink.trim(),
        briefTitle: briefTitle || undefined,
        divisionId,
        publicationMedia: publicationMedia.trim(),
        deadline: new Date(deadline).toISOString(),
        requestorId: currentUser.id,
      });

      if (res.success) {
        setTitle('');
        setDescription('');
        setBriefLink('');
        setBriefTitle(null);
        setPublicationMedia('');
        setHasAgreedToRules(false);
        onClose();
      } else {
        setError(res.error || 'Gagal mengirim request');
      }
    } catch {
      setError('Terjadi kesalahan yang tidak terduga.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div className={`modal-backdrop ${isClosing ? 'is-closing' : ''}`} onClick={onClose}>
      <div
        className={`modal-dual-container ${isClosing ? 'is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rules of COPM 2026 Side Panel */}
        <div className="copm-rules-sidebar-panel">
          <div className="copm-rules-sidebar-header">
            <span className="copm-rules-sidebar-title">Rules of COPM 2026</span>
            <span className="copm-rules-policy-tag">Panduan</span>
          </div>

          <div className="copm-rules-sidebar-body">
            <div className="copm-rule-row">
              <span className="copm-rule-index">01</span>
              <div className="copm-rule-content">
                Deadline paling minimal <strong>seminggu (H-7)</strong> dari pengiriman request COPM.
              </div>
            </div>

            <div className="copm-rule-row">
              <span className="copm-rule-index">02</span>
              <div className="copm-rule-content">
                Pihak <strong>Creative and Marketing</strong> berhak untuk mengundur deadline berdasarkan kepadatan antrian COPM.
              </div>
            </div>

            <div className="copm-rule-row">
              <span className="copm-rule-index">03</span>
              <div className="copm-rule-content">
                Setelah mengirim request COPM, <strong>wajib</strong> untuk mengirimkan pesan ke Director of Creative and Marketing dikarenakan sistem tidak memiliki notifikasi otomatis:
                <div style={{ marginTop: '4px' }}>
                  <a
                    href="https://wa.me/6281932062070"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="copm-rule-wa-link"
                  >
                    wa.me/+6281932062070
                  </a>
                </div>
              </div>
            </div>

            <div className="copm-rule-row">
              <span className="copm-rule-index">04</span>
              <div className="copm-rule-content">
                Keputusan <strong>art direction final</strong> ada di tangan Creative and Marketing agar konsistensi visual branding tetap terjaga. Request hanya memberikan rekomendasi atau referensi terkait gambaran besarnya.
              </div>
            </div>

            <div className="copm-rule-row">
              <span className="copm-rule-index">05</span>
              <div className="copm-rule-content">
                Pengisian COPM request hanya untuk <strong>satu job design</strong>. Jika ingin request design silahkan mengisi form kembali.
              </div>
            </div>
          </div>
        </div>

        {/* Main Request Form Panel Card */}
        <div className="figma-detail-card" style={{ width: '480px', maxWidth: '480px' }}>
          <div className="modal-header">
            <h3 className="modal-title">Ajukan Request Kreatif Baru</h3>
            <button className="modal-close-btn" onClick={onClose} title="Tutup">
              <X size={15} />
            </button>
          </div>

          <div className="modal-body" style={{ maxHeight: 'calc(90vh - 125px)', overflowY: 'auto' }}>
            <form id="job-submission-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
              {error && (
                <div style={{ padding: '8px 12px', background: 'var(--accent-red-light)', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', color: 'var(--accent-red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Judul Job <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="cth. Key Visual & Banner Peluncuran Q4"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Link Brief (Hanya Google Docs) <span className="required-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <GoogleDocsIcon size={16} />
                  </div>
                  <input
                    type="url"
                    className="form-input"
                    style={{ paddingLeft: '32px', paddingRight: briefLink ? '32px' : '10px' }}
                    placeholder="https://docs.google.com/document/d/..."
                    value={briefLink}
                    onChange={(e) => setBriefLink(e.target.value)}
                    required
                  />
                  {briefLink && (
                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                      {isGoogleDoc ? (
                        <CheckCircle2 size={16} color="var(--accent-green)" />
                      ) : (
                        <AlertCircle size={16} color="var(--accent-red)" />
                      )}
                    </div>
                  )}
                </div>
                {briefTitle && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#0284c7', marginTop: '3px' }}>
                    <GoogleDocsIcon size={14} />
                    <span>Judul Dokumen: <strong>{briefTitle}</strong></span>
                  </div>
                )}
                <span className="form-help">
                  Hanya URL Google Docs yang diterima sesuai standar organisasi.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">
                    Divisi Requester <span className="required-star">*</span>
                  </label>
                  <select
                    className="form-select"
                    value={divisionId}
                    onChange={(e) => setDivisionId(e.target.value)}
                    required
                  >
                    {sortedDivisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                </div>

                <div className="form-group">
                  <label className="form-label">
                    Format Media Publikasi <span className="required-star">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="cth. Carousel Instagram, Cetak, Baliho"
                    value={publicationMedia}
                    onChange={(e) => setPublicationMedia(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Deadline Waktu / Deadline (Minimal Seminggu / H-7) <span className="required-star">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  min={minDateStr}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  required
                />
                <span className="form-help">
                  Minimal 7 hari dari sekarang (paling awal: {new Date(minDeadlineDate).toLocaleDateString('id-ID')}).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Deskripsi / Konteks (Opsional)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Hasil utama yang diharapkan, dimensi, atau instruksi khusus..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Mandatory Rules Agreement Checkbox */}
              <label className={`copm-rules-checkbox-container ${hasAgreedToRules ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={hasAgreedToRules}
                  onChange={(e) => setHasAgreedToRules(e.target.checked)}
                  style={{ accentColor: 'var(--accent-blue)', cursor: 'pointer', width: '15px', height: '15px' }}
                  required
                />
                <span className="copm-rules-checkbox-label">
                  Saya sudah membaca aturan, dan mengerti semua isinya. <span className="required-star">*</span>
                </span>
              </label>
            </form>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Batal
            </button>
            <button
              type="submit"
              form="job-submission-form"
              className="btn-primary"
              disabled={isSubmitting || !hasAgreedToRules}
            >
              {isSubmitting ? 'Sedang Mengirim...' : 'Bikin Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
