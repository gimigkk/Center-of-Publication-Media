'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SimpleSelect } from '@/components/ui/Select';
import { Page, Profile, UserRole } from '@/types';
import {
  getPageEditorsAction,
  updatePageEditorsAction,
  getPageDesignerSuggestionsAction,
} from '@/app/actions/page-editors';
import { Avatar } from '@/components/ui/Avatar';
import { getRelativeTime } from '@/lib/utils';
import {
  Search,
  Check,
  X,
  AlertCircle,
  Loader2,
  UserCheck,
} from 'lucide-react';

interface PageEditorManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  pages: Page[];
  allUsers: Profile[];
  pendingUsers?: Profile[];
  initialPageEditors?: Record<string, string[]>;
  onApproveUser?: (userId: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  onRejectUser?: (userId: string) => Promise<{ success: boolean; error?: string }>;
  onAssignmentsUpdated?: (
    pageId: string,
    suggestions: { designer: Profile; activeWipCount: number }[],
    editorIds: string[]
  ) => void;
}

export function PageEditorManagerModal({
  isOpen,
  onClose,
  currentPage,
  pages,
  allUsers,
  pendingUsers = [],
  initialPageEditors = {},
  onApproveUser,
  onRejectUser,
  onAssignmentsUpdated,
}: PageEditorManagerModalProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(currentPage.id);
  const [assignedEditorIds, setAssignedEditorIds] = useState<string[]>(() => {
    return initialPageEditors[currentPage.id] || [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Approval panel state
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);

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
      if (initialPageEditors[currentPage.id]) {
        setAssignedEditorIds(initialPageEditors[currentPage.id]);
      }
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, currentPage.id, initialPageEditors]);

  // Load assignments whenever selectedPageId changes
  useEffect(() => {
    if (!isOpen || !selectedPageId) return;

    // Fast-path: use cached assignments instantly if available
    if (initialPageEditors[selectedPageId]) {
      setAssignedEditorIds(initialPageEditors[selectedPageId]);
      setIsLoading(false);
      return;
    }

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
  }, [isOpen, selectedPageId, initialPageEditors]);

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

      const freshSuggestions = await getPageDesignerSuggestionsAction(selectedPageId);
      if (onAssignmentsUpdated) {
        onAssignmentsUpdated(selectedPageId, freshSuggestions, assignedEditorIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan jaringan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (user: Profile) => {
    if (!onApproveUser) return;
    setProcessingApprovalId(user.id);
    const assignedRole = selectedRoles[user.id] || user.role || 'designer';
    try {
      const res = await onApproveUser(user.id, assignedRole);
      if (res.success) {
        setSuccessMsg(`Akun ${user.fullName} disetujui`);
      } else {
        setError(res.error || 'Gagal menyetujui akun');
      }
    } finally {
      setProcessingApprovalId(null);
    }
  };

  const handleReject = async (user: Profile) => {
    if (!onRejectUser) return;
    if (!confirm(`Tolak dan hapus pendaftaran akun ${user.fullName}?`)) return;
    setProcessingApprovalId(user.id);
    try {
      const res = await onRejectUser(user.id);
      if (res.success) {
        setSuccessMsg(`Pendaftaran ${user.fullName} ditolak`);
      } else {
        setError(res.error || 'Gagal menolak akun');
      }
    } finally {
      setProcessingApprovalId(null);
    }
  };

  const selectedPage = pages.find((p) => p.id === selectedPageId) || currentPage;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kelola Editor & Penugasan Halaman"
      subtitle={`Tentukan editor yang bertugas pada halaman dan otorisasi persetujuan akun`}
      maxWidth={720}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>
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
              size={13}
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
              style={{ paddingLeft: '30px', height: '32px', fontSize: '12px' }}
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
              style={{ padding: '4px 8px', fontSize: '11px', height: '32px' }}
              onClick={handleSelectAll}
              disabled={isLoading}
            >
              Pilih Semua
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11px', height: '32px' }}
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
            fontSize: '11.5px',
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
            <span style={{ color: '#d97706', fontSize: '11px' }}>
              (Jika kosong, semua editor dapat dipilih)
            </span>
          )}
        </div>

        {/* Editor Checklist - 3 Columns with Profile Pic, No Outer Container Box */}
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '30px',
              gap: '8px',
              color: '#64748b',
              fontSize: '12px',
            }}
          >
            <Loader2 size={14} className="spin" />
            <span>Memuat daftar editor...</span>
          </div>
        ) : filteredEditors.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '12px',
            }}
          >
            Tidak ada editor ditemukan.
          </div>
        ) : (
          <div
            style={{
              maxHeight: pendingUsers.length > 0 ? '240px' : '360px',
              overflowY: 'auto',
              paddingTop: '6px',
              paddingBottom: '6px',
              paddingRight: '4px',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '8px',
              }}
            >
              {filteredEditors.map((editor) => {
                const isChecked = assignedEditorIds.includes(editor.id);
                return (
                  <label
                    key={editor.id}
                    className={`editor-3d-card-wrapper ${isChecked ? 'active' : 'inactive'}`}
                  >
                    <div className="editor-3d-card-surface">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEditor(editor.id)}
                        style={{ cursor: 'pointer', width: '13px', height: '13px', flexShrink: 0 }}
                      />
                      <Avatar
                        src={editor.avatarUrl}
                        name={editor.fullName}
                        size={22}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: isChecked ? 600 : 500,
                            color: isChecked ? '#0f172a' : '#475569',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.25,
                          }}
                          title={editor.fullName}
                        >
                          {editor.fullName}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: isChecked ? '#64748b' : '#94a3b8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.2,
                          }}
                          title={editor.email}
                        >
                          {editor.role === 'admin' ? 'Admin' : 'Editor'}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Panel: Persetujuan Akun Pending (only shown if there are pending users) */}
        {pendingUsers.length > 0 && (
          <div
            style={{
              marginTop: '4px',
              borderTop: '1px solid rgba(0, 0, 0, 0.08)',
              paddingTop: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={14} style={{ color: '#0284c7' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                  Persetujuan Akun Pendaftar
                </span>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 7px',
                  borderRadius: '10px',
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  fontWeight: 600,
                }}
              >
                {pendingUsers.length} menunggu
              </span>
            </div>

            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {pendingUsers.map((user) => {
                const isProcessing = processingApprovalId === user.id;
                const currentRole = selectedRoles[user.id] || user.role || 'designer';

                return (
                  <div
                    key={user.id}
                    className="modal-row-item"
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <Avatar src={user.avatarUrl} name={user.fullName} size={24} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {user.fullName}
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                          {user.email} {user.createdAt ? `• ${getRelativeTime(user.createdAt)}` : ''}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <div style={{ width: '105px' }}>
                        <SimpleSelect
                          value={currentRole}
                          size="sm"
                          onChange={(newRole) =>
                            setSelectedRoles((prev) => ({ ...prev, [user.id]: newRole as UserRole }))
                          }
                          disabled={isProcessing}
                          options={[
                            { value: 'designer', label: 'Designer' },
                            { value: 'requestor', label: 'Requestor' },
                            { value: 'admin', label: 'Admin' },
                          ]}
                        />
                      </div>

                      <button
                        type="button"
                        className="modal-row-action-btn"
                        style={{
                          color: '#16a34a',
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          padding: '4px',
                          borderRadius: '4px',
                        }}
                        onClick={() => handleApprove(user)}
                        disabled={isProcessing}
                        title="Setujui Akun"
                      >
                        {isProcessing ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                      </button>

                      <button
                        type="button"
                        className="modal-row-action-btn"
                        style={{
                          color: '#dc2626',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          padding: '4px',
                          borderRadius: '4px',
                        }}
                        onClick={() => handleReject(user)}
                        disabled={isProcessing}
                        title="Tolak & Hapus"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
