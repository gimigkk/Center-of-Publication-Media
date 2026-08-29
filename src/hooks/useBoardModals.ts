import { useState, useMemo, useCallback } from 'react';
import { Job } from '@/types';

export function useBoardModals() {
  const [isJobFormOpen, setIsJobFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedJobForDetail, setSelectedJobForDetail] = useState<Job | null>(null);
  const [isCreatePageOpen, setIsCreatePageOpen] = useState(false);
  const [isDivisionsOpen, setIsDivisionsOpen] = useState(false);
  const [isApprovalsOpen, setIsApprovalsOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [activeDropdownState, setActiveDropdownState] = useState<string | null>(null);
  const [detailDropdownState, setDetailDropdownState] = useState<string | null>(null);

  const handleCardClick = useCallback((job: Job) => {
    setSelectedJobForDetail(job);
    setIsDetailOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedJobForDetail(null);
  }, []);

  const handleOpenNewJob = useCallback(() => setIsJobFormOpen(true), []);
  const handleOpenDivisions = useCallback(() => setIsDivisionsOpen(true), []);
  const handleOpenApprovals = useCallback(() => setIsApprovalsOpen(true), []);
  const handleOpenCreatePage = useCallback(() => setIsCreatePageOpen(true), []);
  const handleOpenEditProfile = useCallback(() => setIsEditProfileOpen(true), []);

  // Derive current user activity state for cursor badge (modals & dropdown panels)
  const currentUserState = useMemo(() => {
    if (isJobFormOpen) return 'Membuka Form COPM';
    if (isDetailOpen && selectedJobForDetail) {
      if (detailDropdownState) return `${detailDropdownState} "${selectedJobForDetail.title}"`;
      return `Membuka Job "${selectedJobForDetail.title}"`;
    }
    if (isCreatePageOpen) return 'Membuat Halaman Baru';
    if (isDivisionsOpen) return 'Mengelola Divisi';
    if (isApprovalsOpen) return 'Meninjau Persetujuan Akun';
    if (activeDropdownState) return activeDropdownState;
    return null;
  }, [
    isJobFormOpen,
    isDetailOpen,
    selectedJobForDetail,
    detailDropdownState,
    isCreatePageOpen,
    isDivisionsOpen,
    isApprovalsOpen,
    activeDropdownState,
  ]);

  return {
    isJobFormOpen,
    setIsJobFormOpen,
    isDetailOpen,
    setIsDetailOpen,
    selectedJobForDetail,
    setSelectedJobForDetail,
    isCreatePageOpen,
    setIsCreatePageOpen,
    isDivisionsOpen,
    setIsDivisionsOpen,
    isApprovalsOpen,
    setIsApprovalsOpen,
    isEditProfileOpen,
    setIsEditProfileOpen,
    activeDropdownState,
    setActiveDropdownState,
    detailDropdownState,
    setDetailDropdownState,
    currentUserState,
    handleCardClick,
    handleCloseDetail,
    handleOpenNewJob,
    handleOpenDivisions,
    handleOpenApprovals,
    handleOpenCreatePage,
    handleOpenEditProfile,
  };
}
