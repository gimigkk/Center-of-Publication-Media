'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Job, Page, Profile, Division, AppNotification } from '@/types';
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

  if (isLoading || !currentUser || !currentPage) {
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
        onlineUsers={onlineUsers}
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
