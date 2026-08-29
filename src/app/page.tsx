'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Job,
  JobStatus,
  Page,
  Profile,
  Division,
  UserRole,
  AppNotification,
} from '@/types';
import {
  getJobsAction,
  createJobAction,
  moveJobAction,
  assignDesignerAction,
  getDesignerSuggestionsAction,
  archiveJobAction,
  unarchiveJobAction,
  archiveAllDoneJobsAction,
} from '@/app/actions/jobs';
import {
  getPagesAction,
  createPageAction,
  updatePageAction,
  deletePageAction,
} from '@/app/actions/pages';
import {
  getDivisionsAction,
  createDivisionAction,
  updateDivisionAction,
  deleteDivisionAction,
} from '@/app/actions/divisions';
import {
  getCurrentUserAction,
  getAllUsersAction,
  getPendingUsersAction,
  approveUserAction,
  rejectUserAction,
  signOutAction,
  updateProfileAction,
} from '@/app/actions/auth';
import { getInitialBoardDataAction } from '@/app/actions/board';
import {
  getNotificationsAction,
  markAsReadAction,
  markAllAsReadAction,
  clearNotificationsAction,
} from '@/app/actions/notifications';
import { useCursors } from '@/hooks/useCursors';

import { usePresence } from '@/hooks/usePresence';
import { useRealtimeBoard } from '@/hooks/useRealtimeBoard';

import { Header } from '@/components/header/Header';
import { Board } from '@/components/board/Board';
import { FloatingToolbar } from '@/components/toolbar/FloatingToolbar';
import { CursorOverlay } from '@/components/cursors/CursorOverlay';
import { JobFormModal } from '@/components/forms/JobFormModal';
import { JobDetailModal } from '@/components/forms/JobDetailModal';
import { CreatePageModal } from '@/components/forms/CreatePageModal';
import { DivisionManagerModal } from '@/components/admin/DivisionManagerModal';
import { ApprovalPanelModal } from '@/components/admin/ApprovalPanelModal';
import { EditProfileModal } from '@/components/forms/EditProfileModal';


export default function Home() {
  const router = useRouter();

  // Primary Workspace state
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [initialJobs, setInitialJobs] = useState<Job[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([]);
  const [designerSuggestions, setDesignerSuggestions] = useState<
    { designer: Profile; activeWipCount: number }[]
  >([]);

  // Filtering state
  const [filterDivision, setFilterDivision] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Modals state
  const [isJobFormOpen, setIsJobFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedJobForDetail, setSelectedJobForDetail] = useState<Job | null>(null);
  const [isCreatePageOpen, setIsCreatePageOpen] = useState(false);
  const [isDivisionsOpen, setIsDivisionsOpen] = useState(false);
  const [isApprovalsOpen, setIsApprovalsOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [activeDropdownState, setActiveDropdownState] = useState<string | null>(null);
  const [detailDropdownState, setDetailDropdownState] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDraggedJob, setActiveDraggedJob] = useState<Job | null>(null);


  // Load initial dataset in 1 single fast roundtrip
  const loadData = useCallback(async () => {
    try {
      const data = await getInitialBoardDataAction();
      if (!data || !data.currentUser) {
        router.push('/login');
        return;
      }

      setCurrentUser(data.currentUser);
      setAllUsers(data.allUsers);
      setPages(data.pages);
      setCurrentPage(data.currentPage);
      setDivisions(data.divisions);
      setInitialJobs(data.initialJobs);
      setPendingUsers(data.pendingUsers);
      setDesignerSuggestions(data.designerSuggestions);
      setNotifications(data.notifications);
    } catch (error) {
      console.error('Failed to load board data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [router]);



  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load jobs when switching page
  const handleSelectPage = useCallback(async (page: Page) => {
    setCurrentPage(page);
    try {
      const pageJobs = await getJobsAction(page.id);
      setInitialJobs(pageJobs);
    } catch (e) {
      console.error('Failed to switch page:', e);
    }
  }, []);

  const activePageId = currentPage?.id || 'default-page';

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

  // Realtime hooks (Board sync is page-scoped; Cursors & Presence are workspace-wide with active page tracking)
  const { jobs, setJobs, broadcastBoardChange, lastDropEvent } = useRealtimeBoard(activePageId, initialJobs);
  const { cursors, remotelyDraggedJobIds } = useCursors(currentPage, currentUser, activeDraggedJob, currentUserState);
  const { onlineUsers } = usePresence(currentPage, currentUser);

  // Move Job Action Handler
  const handleMoveJob = useCallback(async (
    jobId: string,
    toStatus: JobStatus,
    releasePos?: { worldX?: number; worldY?: number }
  ) => {
    if (!currentUser) return;

    // Optimistic UI update
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: toStatus } : j))
    );

    const res = await moveJobAction(jobId, toStatus, currentUser);
    if (res.success) {
      broadcastBoardChange({
        jobId,
        toStatus,
        releaseWorldX: releasePos?.worldX,
        releaseWorldY: releasePos?.worldY,
      });
    } else {
      // Revert if error
      const fresh = await getJobsAction(activePageId);
      setJobs(fresh);
      alert(res.error || 'Gagal memindahkan kartu job');
    }
  }, [currentUser, activePageId, broadcastBoardChange, setJobs]);

  // Submit Job Handler
  const handleSubmitJob = useCallback(async (formData: {
    pageId: string;
    title: string;
    description?: string;
    briefLink: string;
    divisionId: string;
    publicationMedia: string;
    deadline: string;
    requestorId: string;
  }) => {
    const res = await createJobAction(formData);
    if (res.success && res.job) {
      setJobs((prev) => [res.job!, ...prev]);
      broadcastBoardChange();
    }
    return res;
  }, [broadcastBoardChange, setJobs]);

  // Assign Designer Handler
  const handleAssignDesigner = useCallback(async (jobId: string, designerId: string) => {
    if (!currentUser) return { success: false, error: 'Tidak terautentikasi' };

    const res = await assignDesignerAction(jobId, designerId, currentUser);
    if (res.success) {
      const fresh = await getJobsAction(activePageId);
      setJobs(fresh);
      broadcastBoardChange();
      const suggestions = await getDesignerSuggestionsAction();
      setDesignerSuggestions(suggestions);
      const updatedJob = fresh.find((j) => j.id === jobId);
      if (updatedJob) {
        setSelectedJobForDetail(updatedJob);
      }
    }
    return res;
  }, [currentUser, activePageId, broadcastBoardChange, setJobs]);

  // Archive Job Handler
  const handleArchiveJob = useCallback(async (jobId: string) => {
    if (!currentUser) return;
    const nowIso = new Date().toISOString();

    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, isArchived: true, archivedAt: nowIso } : j
      )
    );

    const res = await archiveJobAction(jobId, currentUser);
    if (res.success) {
      broadcastBoardChange();
    } else {
      const fresh = await getJobsAction(activePageId);
      setJobs(fresh);
    }
  }, [currentUser, activePageId, broadcastBoardChange, setJobs]);

  // Unarchive / Restore Job Handler
  const handleUnarchiveJob = useCallback(async (jobId: string) => {
    if (!currentUser) return;

    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, isArchived: false, archivedAt: null } : j
      )
    );

    const res = await unarchiveJobAction(jobId, currentUser);
    if (res.success) {
      broadcastBoardChange();
    } else {
      const fresh = await getJobsAction(activePageId);
      setJobs(fresh);
    }
  }, [currentUser, activePageId, broadcastBoardChange, setJobs]);

  // Archive All Done Jobs Handler
  const handleArchiveAllDone = useCallback(async () => {
    if (!currentUser) return;
    const nowIso = new Date().toISOString();

    setJobs((prev) =>
      prev.map((j) =>
        j.status === 'done' && !j.isArchived
          ? { ...j, isArchived: true, archivedAt: nowIso }
          : j
      )
    );

    const res = await archiveAllDoneJobsAction(activePageId, currentUser);
    if (res.success) {
      broadcastBoardChange();
    } else {
      const fresh = await getJobsAction(activePageId);
      setJobs(fresh);
    }
  }, [currentUser, activePageId, broadcastBoardChange, setJobs]);

  // Create Page Handler
  const handleCreatePage = useCallback(async (name: string, description?: string) => {
    const res = await createPageAction(name, description, currentUser?.id);
    if (res.success && res.page) {
      setPages((prev) => [...prev, res.page!]);
      setCurrentPage(res.page!);
      const pageJobs = await getJobsAction(res.page!.id);
      setInitialJobs(pageJobs);
    }
    return res;
  }, [currentUser?.id]);

  const handleRenamePage = useCallback(async (pageId: string, name: string) => {
    const res = await updatePageAction(pageId, name);
    if (res.success) {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, name } : p))
      );
      if (currentPage?.id === pageId) {
        setCurrentPage((prev) => (prev ? { ...prev, name } : null));
      }
    }
  }, [currentPage?.id]);

  const handleDeletePage = useCallback(async (pageId: string) => {
    const res = await deletePageAction(pageId);
    if (res.success) {
      setPages((prev) => {
        const remaining = prev.filter((p) => p.id !== pageId);
        if (currentPage?.id === pageId && remaining.length > 0) {
          handleSelectPage(remaining[0]);
        }
        return remaining;
      });
    }
  }, [currentPage?.id, handleSelectPage]);

  // Division Handlers
  const handleCreateDivision = useCallback(async (name: string) => {
    const res = await createDivisionAction(name);
    if (res.success && res.division) {
      setDivisions((prev) => [...prev, res.division!]);
    }
    return res;
  }, []);

  const handleUpdateDivision = useCallback(async (id: string, name: string) => {
    const res = await updateDivisionAction(id, name);
    if (res.success) {
      setDivisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, name } : d))
      );
    }
    return res;
  }, []);

  const handleDeleteDivision = useCallback(async (id: string) => {
    const res = await deleteDivisionAction(id);
    if (res.success) {
      setDivisions((prev) => prev.filter((d) => d.id !== id));
    }
    return res;
  }, []);

  // Approval Handlers
  const handleApproveUser = useCallback(async (userId: string, role?: UserRole) => {
    const res = await approveUserAction(userId, role);
    if (res.success) {
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      const users = await getAllUsersAction();
      setAllUsers(users);
      const suggestions = await getDesignerSuggestionsAction();
      setDesignerSuggestions(suggestions);
    }
    return res;
  }, []);

  const handleRejectUser = useCallback(async (userId: string) => {
    const res = await rejectUserAction(userId);
    if (res.success) {
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      const users = await getAllUsersAction();
      setAllUsers(users);
    }
    return res;
  }, []);

  const handleCardClick = useCallback((job: Job) => {
    setSelectedJobForDetail(job);
    setIsDetailOpen(true);
  }, []);

  const handleOpenNewJob = useCallback(() => setIsJobFormOpen(true), []);
  const handleOpenDivisions = useCallback(() => setIsDivisionsOpen(true), []);
  const handleOpenApprovals = useCallback(() => setIsApprovalsOpen(true), []);
  const handleOpenCreatePage = useCallback(() => setIsCreatePageOpen(true), []);

  const handleMarkAsRead = useCallback(async (notifId: string) => {

    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
    );
    await markAsReadAction(notifId);
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllAsReadAction(currentUser?.id);
  }, [currentUser?.id]);

  const handleClearAllNotifications = useCallback(async () => {
    setNotifications([]);
    await clearNotificationsAction(currentUser?.id);
  }, [currentUser?.id]);

  const handleSelectJobFromNotification = useCallback(async (jobId: string) => {
    const found = jobs.find((j) => j.id === jobId);
    if (found) {
      setSelectedJobForDetail(found);
      setIsDetailOpen(true);
    } else {
      try {
        const allJobs = await getJobsAction(activePageId);
        const target = allJobs.find((j) => j.id === jobId);
        if (target) {
          setSelectedJobForDetail(target);
          setIsDetailOpen(true);
        }
      } catch (err) {
        console.error('Failed to open job from notification:', err);
      }
    }
  }, [jobs, activePageId]);

  const handleUpdateProfile = useCallback(
    async (data: { fullName: string; avatarUrl: string; phoneNumber?: string | null }) => {
      if (!currentUser) return { success: false, error: 'Pengguna tidak ditemukan' };
      const res = await updateProfileAction(currentUser.id, data);
      if (res.success && res.profile) {
        setCurrentUser(res.profile);
        setAllUsers((prev) => prev.map((u) => (u.id === res.profile!.id ? res.profile! : u)));
        return { success: true };
      }
      return { success: false, error: res.error || 'Gagal menyimpan profil' };
    },
    [currentUser]
  );

  const handleSignOut = useCallback(async () => {
    await signOutAction();
    router.push('/login');
  }, [router]);

  if (isLoading || !currentUser || !currentPage) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-card">
          <div className="app-loading-spinner spin" />
          <span className="app-loading-text">Memuat Ruang Kerja...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="figjam-canvas">
      {/* Real-time remote collaborative cursors */}
      <CursorOverlay cursors={cursors} currentUser={currentUser} currentPageId={currentPage.id} />

      {/* Top Floating App Header with Page Switcher & User Profile */}
      <Header
        pages={pages}
        currentPage={currentPage}
        currentUser={currentUser}
        onlineUsers={onlineUsers}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onClearAllNotifications={handleClearAllNotifications}
        onSelectJob={handleSelectJobFromNotification}
        onSelectPage={handleSelectPage}
        onOpenCreatePage={handleOpenCreatePage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
        onSignOut={handleSignOut}
        onOpenEditProfile={() => setIsEditProfileOpen(true)}
        onDropdownChange={setActiveDropdownState}
      />




      {/* Kanban Board Container (with 1:1 World Space Remote Cursors & Archive Table below) */}
      <Board
        jobs={jobs}
        currentUser={currentUser}
        divisions={divisions}
        onMoveJob={handleMoveJob}
        onCardClick={handleCardClick}
        onAssignClick={handleCardClick}
        onArchiveJob={handleArchiveJob}
        onUnarchiveJob={handleUnarchiveJob}
        onArchiveAllDone={handleArchiveAllDone}
        filterDivision={filterDivision}
        filterSearch={filterSearch}
        remotelyDraggedJobIds={remotelyDraggedJobIds}
        onDragStateChange={setActiveDraggedJob}
        lastDropEvent={lastDropEvent}
      />

      {/* Floating Bottom Toolbar with Upward Filter Popover */}
      <FloatingToolbar
        currentUser={currentUser}
        pendingCount={pendingUsers.length}
        divisions={divisions}
        filterDivision={filterDivision}
        setFilterDivision={setFilterDivision}
        filterSearch={filterSearch}
        setFilterSearch={setFilterSearch}
        onOpenNewJob={handleOpenNewJob}
        onOpenDivisions={handleOpenDivisions}
        onOpenApprovals={handleOpenApprovals}
        onDropdownChange={setActiveDropdownState}
      />

      {/* Modals */}
      <JobFormModal
        isOpen={isJobFormOpen}
        onClose={() => setIsJobFormOpen(false)}
        currentPage={currentPage}
        divisions={divisions}
        currentUser={currentUser}
        onSubmitJob={handleSubmitJob}
      />

      <JobDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedJobForDetail(null);
        }}
        job={selectedJobForDetail}
        currentUser={currentUser}
        designersWithWorkload={designerSuggestions}
        onAssign={handleAssignDesigner}
        onArchive={handleArchiveJob}
        onUnarchive={handleUnarchiveJob}
        onMoveStatus={async (jobId, toStatus, note) => {
          const res = await moveJobAction(jobId, toStatus, currentUser, note);
          if (res.success) {
            const fresh = await getJobsAction(activePageId);
            setJobs(fresh);
            broadcastBoardChange();
            const updatedJob = fresh.find((j) => j.id === jobId);
            if (updatedJob) {
              setSelectedJobForDetail(updatedJob);
            }
          }
          return res;
        }}
        onDropdownChange={setDetailDropdownState}
      />

      <CreatePageModal
        isOpen={isCreatePageOpen}
        onClose={() => setIsCreatePageOpen(false)}
        currentUser={currentUser}
        onCreatePage={handleCreatePage}
      />

      <DivisionManagerModal
        isOpen={isDivisionsOpen}
        onClose={() => setIsDivisionsOpen(false)}
        divisions={divisions}
        onCreateDivision={handleCreateDivision}
        onUpdateDivision={handleUpdateDivision}
        onDeleteDivision={handleDeleteDivision}
      />

      <ApprovalPanelModal
        isOpen={isApprovalsOpen}
        onClose={() => setIsApprovalsOpen(false)}
        pendingUsers={pendingUsers}
        onApprove={handleApproveUser}
        onReject={handleRejectUser}
      />

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        currentUser={currentUser}
        onUpdateProfile={handleUpdateProfile}
      />
    </div>
  );
}


