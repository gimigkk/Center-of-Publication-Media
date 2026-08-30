'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Job, Page, Profile, Division, AppNotification, OnlineUser } from '@/types';
import { getJobsAction, moveJobAction } from '@/app/actions/jobs';
import { getInitialBoardDataAction } from '@/app/actions/board';

import { useCursors } from '@/hooks/useCursors';
import { usePresence } from '@/hooks/usePresence';
import { useRealtimeBoard } from '@/hooks/useRealtimeBoard';
import { useBoardModals } from '@/hooks/useBoardModals';
import { useBoardOperations } from '@/hooks/useBoardOperations';

import { Header } from '@/components/header/Header';
import { Board } from '@/components/board/Board';
import { FloatingToolbar } from '@/components/toolbar/FloatingToolbar';
import { CursorOverlay } from '@/components/cursors/CursorOverlay';
import { BoardModals } from '@/components/board/BoardModals';

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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeDraggedJob, setActiveDraggedJob] = useState<Job | null>(null);

  // Filtering state
  const [filterDivision, setFilterDivision] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Modals & cursor activity state
  const modals = useBoardModals();
  const activePageId = currentPage?.id || 'default-page';

  // Realtime hooks
  const { jobs, setJobs, broadcastBoardChange, lastDropEvent } = useRealtimeBoard(activePageId, initialJobs);
  const { cursors, remotelyDraggedJobIds } = useCursors(currentPage, currentUser, activeDraggedJob, modals.currentUserState);
  const { onlineUsers } = usePresence(currentPage, currentUser);

  // Harmonize presence state with active collaborator cursors so avatar stack never drops active users
  const activeOnlineUsers = useMemo(() => {
    const map = new Map<string, OnlineUser>();
    for (const u of onlineUsers) {
      if (u.userId) map.set(u.userId, u);
    }
    for (const c of cursors) {
      if (c.userId && !map.has(c.userId)) {
        map.set(c.userId, {
          userId: c.userId,
          userName: c.userName,
          userAvatar: c.userAvatar,
          role: 'requestor',
          color: c.color,
          pageId: c.pageId,
          pageName: c.pageName,
          onlineAt: new Date().toISOString(),
        });
      }
    }
    return Array.from(map.values());
  }, [onlineUsers, cursors]);

  // Operations and business logic encapsulation
  const operations = useBoardOperations({
    currentUser,
    setCurrentUser,
    currentPage,
    setCurrentPage,
    setPages,
    setInitialJobs,
    jobs,
    setJobs,
    broadcastBoardChange,
    setDivisions,
    setAllUsers,
    setPendingUsers,
    setDesignerSuggestions,
    setNotifications,
    setSelectedJobForDetail: modals.setSelectedJobForDetail,
    setIsDetailOpen: modals.setIsDetailOpen,
  });

  // Load initial dataset in 1 single fast roundtrip with safety timeout
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Koneksi timeout. Gagal memuat data dari server.')), 10000)
    );

    try {
      const data = await Promise.race([
        getInitialBoardDataAction(),
        timeoutPromise,
      ]);

      if (!data || !data.currentUser) {
        window.location.replace('/login');
        return;
      }

      const activePage = data.currentPage || (data.pages && data.pages[0]) || {
        id: 'default-page',
        name: 'Creative & Marketing',
        description: 'Papan kerja utama COPM',
        createdBy: data.currentUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const activePages = data.pages && data.pages.length > 0 ? data.pages : [activePage];

      setCurrentUser(data.currentUser);
      setAllUsers(data.allUsers || [data.currentUser]);
      setPages(activePages);
      setCurrentPage(activePage);
      setDivisions(data.divisions || []);
      setInitialJobs(data.initialJobs || []);
      setPendingUsers(data.pendingUsers || []);
      setDesignerSuggestions(data.designerSuggestions || []);
      setNotifications(data.notifications || []);
    } catch (error: any) {
      console.error('Failed to load board data:', error);
      setLoadError(error?.message || 'Terjadi kesalahan saat memuat papan kerja.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loadError) {
    return (
      <div className="figjam-loading-screen">
        <div className="figjam-loader-container" style={{ flexDirection: 'column', gap: '12px', textAlign: 'center' }}>
          <span className="figjam-loader-text" style={{ color: 'var(--accent-red)', maxWidth: '320px' }}>
            {loadError}
          </span>
          <button
            onClick={() => loadData()}
            className="toolbar-btn primary"
            style={{ padding: '6px 16px', height: '32px' }}
          >
            Coba Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="figjam-loading-screen">
        <div className="figjam-loader-container">
          <div className="figjam-loader-icon-wrapper">
            <svg
              className="figjam-spinner-svg"
              viewBox="0 0 50 50"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle className="spinner-track" cx="25" cy="25" r="20" strokeWidth="3.5" />
              <circle className="spinner-head" cx="25" cy="25" r="20" strokeWidth="3.5" />
            </svg>
          </div>
          <span className="figjam-loader-text">Memuat papan kerja...</span>
        </div>
      </div>
    );
  }

  if (!currentUser || !currentPage) {
    return null;
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
        allUsers={allUsers}
        onlineUsers={activeOnlineUsers}
        notifications={notifications}
        onMarkAsRead={operations.handleMarkAsRead}
        onMarkAllAsRead={operations.handleMarkAllAsRead}
        onClearAllNotifications={operations.handleClearAllNotifications}
        onSelectJob={operations.handleSelectJobFromNotification}
        onSelectPage={operations.handleSelectPage}
        onOpenCreatePage={modals.handleOpenCreatePage}
        onDeletePage={operations.handleDeletePage}
        onRenamePage={operations.handleRenamePage}
        onSignOut={operations.handleSignOut}
        onOpenEditProfile={modals.handleOpenEditProfile}
        onDropdownChange={modals.setActiveDropdownState}
      />

      {/* Kanban Board Container */}
      <Board
        jobs={jobs}
        currentUser={currentUser}
        divisions={divisions}
        onMoveJob={operations.handleMoveJob}
        onCardClick={modals.handleCardClick}
        onAssignClick={modals.handleCardClick}
        onArchiveJob={operations.handleArchiveJob}
        onUnarchiveJob={operations.handleUnarchiveJob}
        onArchiveAllDone={operations.handleArchiveAllDone}
        filterDivision={filterDivision}
        filterSearch={filterSearch}
        remotelyDraggedJobIds={remotelyDraggedJobIds}
        onDragStateChange={setActiveDraggedJob}
        lastDropEvent={lastDropEvent}
      />

      {/* Floating Bottom Toolbar */}
      <FloatingToolbar
        currentUser={currentUser}
        pendingCount={pendingUsers.length}
        divisions={divisions}
        filterDivision={filterDivision}
        setFilterDivision={setFilterDivision}
        filterSearch={filterSearch}
        setFilterSearch={setFilterSearch}
        onOpenNewJob={modals.handleOpenNewJob}
        onOpenDivisions={modals.handleOpenDivisions}
        onOpenApprovals={modals.handleOpenApprovals}
        onDropdownChange={modals.setActiveDropdownState}
      />

      {/* Modals Container */}
      <BoardModals
        currentUser={currentUser}
        currentPage={currentPage}
        divisions={divisions}
        pendingUsers={pendingUsers}
        designerSuggestions={designerSuggestions}
        isJobFormOpen={modals.isJobFormOpen}
        onCloseJobForm={() => modals.setIsJobFormOpen(false)}
        isDetailOpen={modals.isDetailOpen}
        onCloseDetail={modals.handleCloseDetail}
        selectedJobForDetail={modals.selectedJobForDetail}
        isCreatePageOpen={modals.isCreatePageOpen}
        onCloseCreatePage={() => modals.setIsCreatePageOpen(false)}
        isDivisionsOpen={modals.isDivisionsOpen}
        onCloseDivisions={() => modals.setIsDivisionsOpen(false)}
        isApprovalsOpen={modals.isApprovalsOpen}
        onCloseApprovals={() => modals.setIsApprovalsOpen(false)}
        isEditProfileOpen={modals.isEditProfileOpen}
        onCloseEditProfile={() => modals.setIsEditProfileOpen(false)}
        onDetailDropdownChange={modals.setDetailDropdownState}
        onSubmitJob={operations.handleSubmitJob}
        onAssignDesigner={operations.handleAssignDesigner}
        onUpdateDeadline={operations.handleUpdateDeadline}
        onArchiveJob={operations.handleArchiveJob}
        onUnarchiveJob={operations.handleUnarchiveJob}
        onMoveJobStatus={async (jobId, toStatus, note) => {
          const res = await moveJobAction(jobId, toStatus, currentUser, note);
          if (res.success) {
            const fresh = await getJobsAction(activePageId);
            setJobs(fresh);
            broadcastBoardChange();
            const updatedJob = fresh.find((j) => j.id === jobId);
            if (updatedJob) {
              modals.setSelectedJobForDetail(updatedJob);
            }
          }
          return res;
        }}
        onCreatePage={operations.handleCreatePage}
        onCreateDivision={operations.handleCreateDivision}
        onUpdateDivision={operations.handleUpdateDivision}
        onDeleteDivision={operations.handleDeleteDivision}
        onApproveUser={operations.handleApproveUser}
        onRejectUser={operations.handleRejectUser}
        onUpdateProfile={operations.handleUpdateProfile}
      />
    </div>
  );
}
