'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SimpleSelect } from '@/components/ui/Select';
import { Page, Profile } from '@/types';
import {
  getPageEditorsAction,
  updatePageEditorsAction,
  getPageDesignerSuggestionsAction,
} from '@/app/actions/page-editors';
import {
  Users,
  Search,
  Check,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';

interface PageEditorManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  pages: Page[];
  allUsers: Profile[];
  onAssignmentsUpdated?: (
    pageId: string,
    suggestions: { designer: Profile; activeWipCount: number }[]
  ) => void;
}

export function PageEditorManagerModal({
  isOpen,
  onClose,
  currentPage,
  pages,
  allUsers,
  onAssignmentsUpdated,
}: PageEditorManagerModalProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(currentPage.id);
  const [assignedEditorIds, setAssignedEditorIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter candidate editors: approved users with designer or admin role
  const candidateEditors = useMemo(() => {
    return allUsers
      .filter((u) => u.isApproved && (u.role === 'designer' || u.role === 'admin'))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id', { sensitivity: 'base' }));
  }, [allUsers]);

  // Sync selected page when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPageId(currentPage.id);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, currentPage.id]);

  // Load assignments whenever selectedPageId changes
  useEffect(() => {
    if (!isOpen || !selectedPageId) return;

    let isCancelled = false;
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    getPageEditorsAction(selectedPageId)
      .then((editorIds) => {
        if (!isCancelled) {
          setAssignedEditorIds(editorIds);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Gagal memuat editor halaman');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, selectedPageId]);

  const filteredEditors = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return candidateEditors;
    return candidateEditors.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
    );
  }, [candidateEditors, searchQuery]);

  const toggleEditor = (editorId: string) => {
    setAssignedEditorIds((prev) =>
      prev.includes(editorId) ? prev.filter((id) => id !== editorId) : [...prev, editorId]
    );
  };

  const handleSelectAll = () => {
    setAssignedEditorIds(candidateEditors.map((e) => e.id));
  };

  const handleClearAll = () => {
    setAssignedEditorIds([]);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await updatePageEditorsAction(selectedPageId, assignedEditorIds);
      if (!res.success) {
        setError(res.error || 'Gagal menyimpan konfigurasi editor');
        return;
      }

      setSuccessMsg('Penugasan editor berhasil disimpan!');

      // Notify parent to refresh designer suggestions for active page
      const freshSuggestions = await getPageDesignerSuggestionsAction(selectedPageId);
      if (onAssignmentsUpdated) {
        onAssignmentsUpdated(selectedPageId, freshSuggestions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan jaringan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPage = pages.find((p) => p.id === selectedPageId) || currentPage;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kelola Editor Halaman"
      subtitle={`Tentukan editor yang bertugas dan dapat ditugaskan pada halaman ini`}
      maxWidth={640}
      footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Tutup
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={isLoading || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Simpan Perubahan</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {error && (
          <div className="modal-alert-error">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="modal-alert-success">
            <Check size={14} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Page Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
            Pilih Halaman Target
          </label>
          <SimpleSelect
            value={selectedPageId}
            onChange={(val) => setSelectedPageId(val)}
            disabled={isLoading || isSubmitting}
            options={pages.map((p) => ({
              value: p.id,
              label: `${p.name}${p.id === currentPage.id ? ' (Halaman Aktif)' : ''}`,
            }))}
          />
        </div>

        {/* Search & Bulk Select Toolbar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '32px' }}
              placeholder="Cari nama atau email editor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              onClick={handleSelectAll}
              disabled={isLoading}
            >
              Pilih Semua
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              onClick={handleClearAll}
              disabled={isLoading}
            >
              Kosongkan
            </button>
          </div>
        </div>

        {/* Summary note */}
        <div
          style={{
            fontSize: '12px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            {assignedEditorIds.length} dari {candidateEditors.length} editor ditugaskan ke{' '}
            <strong>{selectedPage.name}</strong>
          </span>
          {assignedEditorIds.length === 0 && (
            <span style={{ color: '#d97706' }}>
              (Jika kosong, semua editor otomatis dapat dipilih)
            </span>
          )}
        </div>

        {/* Editor Checklist */}
        <div
          style={{
            maxHeight: '340px',
            overflowY: 'auto',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px',
            backgroundColor: '#fafafa',
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '30px',
                gap: '8px',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              <Loader2 size={16} className="spin" />
              <span>Memuat daftar editor...</span>
            </div>
          ) : filteredEditors.length === 0 ? (
            <div
              style={{
                padding: '30px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              Tidak ada editor ditemukan.
            </div>
          ) : (
            <div className="division-manager-grid">
              {filteredEditors.map((editor) => {
                const isChecked = assignedEditorIds.includes(editor.id);
                return (
                  <label
                    key={editor.id}
                    className="modal-row-item"
                    style={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: isChecked ? '#f0fdf4' : '#ffffff',
                      borderColor: isChecked ? '#86efac' : 'rgba(0, 0, 0, 0.08)',
                      padding: '8px 10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEditor(editor.id)}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 500,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={editor.fullName}
                        >
                          {editor.fullName}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={editor.email}
                        >
                          {editor.role === 'admin' ? 'Admin' : 'Designer'} • {editor.email}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
