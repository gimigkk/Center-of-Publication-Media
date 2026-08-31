import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Job, JobStatus, Page, Profile, Division, UserRole, AppNotification } from '@/types';
import {
  getJobsAction,
  createJobAction,
  moveJobAction,
  updateJobDeadlineAction,
  assignDesignerAction,
  getDesignerSuggestionsAction,
  archiveJobAction,
  unarchiveJobAction,
  archiveAllDoneJobsAction,
} from '@/app/actions/jobs';
import {
  createPageAction,
  updatePageAction,
  deletePageAction,
} from '@/app/actions/pages';
import {
  createDivisionAction,
  updateDivisionAction,
  deleteDivisionAction,
} from '@/app/actions/divisions';
import {
  getAllUsersAction,
  approveUserAction,
  rejectUserAction,
  signOutAction,
  updateProfileAction,
} from '@/app/actions/auth';
import {
  markAsReadAction,
  markAllAsReadAction,
  clearNotificationsAction,
} from '@/app/actions/notifications';

import { CardDropEvent } from '@/hooks/useRealtimeBoard';

interface UseBoardOperationsParams {
  currentUser: Profile | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<Profile | null>>;
  currentPage: Page | null;
  setCurrentPage: React.Dispatch<React.SetStateAction<Page | null>>;
  setPages: React.Dispatch<React.SetStateAction<Page[]>>;
  setInitialJobs: (jobs: Job[]) => void;
  jobs: Job[];
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  broadcastBoardChange: (dropEvent?: CardDropEvent) => void;
  setDivisions: React.Dispatch<React.SetStateAction<Division[]>>;
  setAllUsers: React.Dispatch<React.SetStateAction<Profile[]>>;
  setPendingUsers: React.Dispatch<React.SetStateAction<Profile[]>>;
  setDesignerSuggestions: React.Dispatch<
    React.SetStateAction<{ designer: Profile; activeWipCount: number }[]>
  >;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setSelectedJobForDetail: (job: Job | null) => void;
  setIsDetailOpen: (open: boolean) => void;
}

export function useBoardOperations({
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
  setSelectedJobForDetail,
  setIsDetailOpen,
}: UseBoardOperationsParams) {
  const router = useRouter();
  const activePageId = currentPage?.id || 'default-page';

  // Load jobs when switching page
  const handleSelectPage = useCallback(async (page: Page) => {
    setCurrentPage(page);
    try {
      const pageJobs = await getJobsAction(page.id);
      setInitialJobs(pageJobs);
    } catch (e) {
      console.error('Failed to switch page:', e);
    }
  }, [setCurrentPage, setInitialJobs]);

  // Move Job Action Handler
  const handleMoveJob = useCallback(
    async (
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
    },
    [currentUser, activePageId, broadcastBoardChange, setJobs]
  );

  // Submit Job Handler
  const handleSubmitJob = useCallback(
    async (formData: {
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
    },
    [broadcastBoardChange, setJobs]
  );

  // Assign Designer Handler
  const handleAssignDesigner = useCallback(
    async (jobId: string, designerId: string) => {
      if (!currentUser) return { success: false, error: 'Tidak terautentikasi' };

      const res = await assignDesignerAction(jobId, designerId, currentUser);
      if (res.success) {
        // The assignment is already persisted. Do not keep the checklist locked
        // while waiting for unrelated board/workload reads to finish.
        broadcastBoardChange();

        void Promise.all([
          getJobsAction(activePageId),
          getDesignerSuggestionsAction(),
        ])
          .then(([fresh, suggestions]) => {
            setJobs(fresh);
            setDesignerSuggestions(suggestions);
            const updatedJob = fresh.find((j) => j.id === jobId);
            if (updatedJob) {
              setSelectedJobForDetail(updatedJob);
            }
          })
          .catch((error) => {
            console.error('Failed to refresh assignment data:', error);
          });
      }
      return res;
    },
    [currentUser, activePageId, broadcastBoardChange, setJobs, setDesignerSuggestions, setSelectedJobForDetail]
  );

  // Update Job Deadline Handler
  const handleUpdateDeadline = useCallback(
    async (jobId: string, deadline: string) => {
      if (!currentUser) return { success: false, error: 'Tidak terautentikasi' };

      const deadlineIso = new Date(deadline).toISOString();

      // Optimistic UI update
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, deadline: deadlineIso, updatedAt: new Date().toISOString() }
            : j
        )
      );

      const res = await updateJobDeadlineAction(jobId, deadlineIso, currentUser);
      if (res.success) {
        broadcastBoardChange();
        const fresh = await getJobsAction(activePageId);
        setJobs(fresh);
        const updatedJob = fresh.find((j) => j.id === jobId);
        if (updatedJob) {
          setSelectedJobForDetail(updatedJob);
        }
      } else {
        const fresh = await getJobsAction(activePageId);
        setJobs(fresh);
        alert(res.error || 'Gagal memperbarui deadline');
      }
      return res;
    },
    [currentUser, activePageId, broadcastBoardChange, setJobs, setSelectedJobForDetail]
  );

  // Archive Job Handler
  const handleArchiveJob = useCallback(
    async (jobId: string) => {
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
    },
    [currentUser, activePageId, broadcastBoardChange, setJobs]
  );

  // Unarchive / Restore Job Handler
  const handleUnarchiveJob = useCallback(
    async (jobId: string) => {
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
    },
    [currentUser, activePageId, broadcastBoardChange, setJobs]
  );

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

  // Page Handlers
  const handleCreatePage = useCallback(
    async (name: string, description?: string) => {
      const res = await createPageAction(name, description, currentUser?.id);
      if (res.success && res.page) {
        setPages((prev) => [...prev, res.page!]);
        setCurrentPage(res.page!);
        const pageJobs = await getJobsAction(res.page!.id);
        setInitialJobs(pageJobs);
      }
      return res;
    },
    [currentUser?.id, setPages, setCurrentPage, setInitialJobs]
  );

  const handleRenamePage = useCallback(
    async (pageId: string, name: string) => {
      const res = await updatePageAction(pageId, name);
      if (res.success) {
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, name } : p))
        );
        if (currentPage?.id === pageId) {
          setCurrentPage((prev) => (prev ? { ...prev, name } : null));
        }
      }
    },
    [currentPage?.id, setPages, setCurrentPage]
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
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
    },
    [currentPage?.id, handleSelectPage, setPages]
  );

  // Division Handlers
  const handleCreateDivision = useCallback(
    async (name: string) => {
      const res = await createDivisionAction(name);
      if (res.success && res.division) {
        setDivisions((prev) => [...prev, res.division!]);
      }
      return res;
    },
    [setDivisions]
  );

  const handleUpdateDivision = useCallback(
    async (id: string, name: string) => {
      const res = await updateDivisionAction(id, name);
      if (res.success) {
        setDivisions((prev) =>
          prev.map((d) => (d.id === id ? { ...d, name } : d))
        );
      }
      return res;
    },
    [setDivisions]
  );

  const handleDeleteDivision = useCallback(
    async (id: string) => {
      const res = await deleteDivisionAction(id);
      if (res.success) {
        setDivisions((prev) => prev.filter((d) => d.id !== id));
      }
      return res;
    },
    [setDivisions]
  );

  // Approval Handlers
  const handleApproveUser = useCallback(
    async (userId: string, role?: UserRole) => {
      const res = await approveUserAction(userId, role);
      if (res.success) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        const users = await getAllUsersAction();
        setAllUsers(users);
        const suggestions = await getDesignerSuggestionsAction();
        setDesignerSuggestions(suggestions);
      }
      return res;
    },
    [setPendingUsers, setAllUsers, setDesignerSuggestions]
  );

  const handleRejectUser = useCallback(
    async (userId: string) => {
      const res = await rejectUserAction(userId);
      if (res.success) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
        const users = await getAllUsersAction();
        setAllUsers(users);
      }
      return res;
    },
    [setPendingUsers, setAllUsers]
  );

  // Notification Handlers
  const handleMarkAsRead = useCallback(async (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
    );
    await markAsReadAction(notifId);
  }, [setNotifications]);

  const handleMarkAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllAsReadAction(currentUser?.id);
  }, [currentUser?.id, setNotifications]);

  const handleClearAllNotifications = useCallback(async () => {
    setNotifications([]);
    await clearNotificationsAction(currentUser?.id);
  }, [currentUser?.id, setNotifications]);

  const handleSelectJobFromNotification = useCallback(
    async (jobId: string) => {
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
    },
    [jobs, activePageId, setSelectedJobForDetail, setIsDetailOpen]
  );

  // Profile update handler
  const handleUpdateProfile = useCallback(
    async (data: { fullName: string; avatarUrl?: string | null; phoneNumber?: string | null }) => {
      if (!currentUser) return { success: false, error: 'Pengguna tidak ditemukan' };
      const res = await updateProfileAction(currentUser.id, data);
      if (res.success && res.profile) {
        setCurrentUser(res.profile);
        setAllUsers((prev) => prev.map((u) => (u.id === res.profile!.id ? res.profile! : u)));
        return { success: true };
      }
      return { success: false, error: res.error || 'Gagal menyimpan profil' };
    },
    [currentUser, setCurrentUser, setAllUsers]
  );

  const handleSignOut = useCallback(async () => {
    await signOutAction();
    router.push('/login');
  }, [router]);

  return {
    handleSelectPage,
    handleMoveJob,
    handleSubmitJob,
    handleAssignDesigner,
    handleUpdateDeadline,
    handleArchiveJob,
    handleUnarchiveJob,
    handleArchiveAllDone,
    handleCreatePage,
    handleRenamePage,
    handleDeletePage,
    handleCreateDivision,
    handleUpdateDivision,
    handleDeleteDivision,
    handleApproveUser,
    handleRejectUser,
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleClearAllNotifications,
    handleSelectJobFromNotification,
    handleUpdateProfile,
    handleSignOut,
  };
}
