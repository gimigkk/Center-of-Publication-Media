'use server';

import { db, schema } from '@/lib/db';
import { eq, inArray, and } from 'drizzle-orm';
import { Profile, Page, Division, Job, AppNotification, NotificationType } from '@/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export interface InitialBoardData {
  currentUser: Profile | null;
  allUsers: Profile[];
  pages: Page[];
  currentPage: Page | null;
  divisions: Division[];
  initialJobs: Job[];
  pendingUsers: Profile[];
  designerSuggestions: { designer: Profile; activeWipCount: number }[];
  notifications: AppNotification[];
}

export async function getInitialBoardDataAction(): Promise<InitialBoardData | null> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const currentPage = store.pages[0] || null;
    const initialJobs = currentPage ? store.jobs.filter((j) => j.pageId === currentPage.id) : store.jobs;
    const pendingUsers = store.users.filter((u) => !u.isApproved);
    const designers = store.users.filter((u) => u.isApproved && (u.role === 'designer' || u.role === 'admin'));
    const designerSuggestions = designers
      .map((d) => ({
        designer: d,
        activeWipCount: store.jobs.filter(
          (j) =>
            !j.isArchived &&
            (j.status === 'wip' || j.status === 'revisions') &&
            (j.designerIds?.includes(d.id) || j.designerId === d.id)
        ).length,
      }))
      .sort((a, b) => a.activeWipCount - b.activeWipCount);

    return {
      currentUser: store.currentUser,
      allUsers: store.users,
      pages: store.pages,
      currentPage,
      divisions: store.divisions,
      initialJobs,
      pendingUsers,
      designerSuggestions,
      notifications: store.notifications,
    };
  }

  if (!db) return null;


  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;


    // Run ALL queries in parallel in a SINGLE database roundtrip
    const [
      profilesRecords,
      divisionsRecords,
      pagesRecords,
      notificationsRecords,
      allJobsRecords,
      allJobDesignersRecords,
    ] = await Promise.all([
      db.select().from(schema.profiles),
      db.select().from(schema.divisions),
      db.select().from(schema.pages),
      db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)),
      db.select().from(schema.jobs),
      db.select().from(schema.jobDesigners),
    ]);

    const divMap = new Map(divisionsRecords.map((d) => [d.id, d.name]));

    const allUsers: Profile[] = profilesRecords.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName,
      phoneNumber: r.phoneNumber,
      avatarUrl: r.avatarUrl,
      role: r.role,
      divisionId: r.divisionId,
      divisionName: r.divisionId ? divMap.get(r.divisionId) : undefined,
      isApproved: r.isApproved,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const currentUser = userMap.get(user.id) || null;
    if (!currentUser) return null;

    const pages: Page[] = pagesRecords.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const divisions: Division[] = divisionsRecords
      .map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

    const currentPage = pages[0] || null;

    // Build map of job designer assignments from allJobDesignersRecords in memory
    const jobDesignersMap = new Map<string, string[]>();
    const wipCountMap = new Map<string, number>();
    allJobDesignersRecords.forEach((da) => {
      const existing = jobDesignersMap.get(da.jobId) || [];
      existing.push(da.designerId);
      jobDesignersMap.set(da.jobId, existing);
    });

    // Map jobs for the current active page
    const pageJobsRecords = currentPage
      ? allJobsRecords.filter((j) => j.pageId === currentPage.id)
      : allJobsRecords;

    const initialJobs: Job[] = pageJobsRecords.map((r) => {
      let rawIds = jobDesignersMap.get(r.id) || [];
      if (rawIds.length === 0 && r.designerId) {
        rawIds = [r.designerId];
      }
      const designersList = rawIds.map((id) => userMap.get(id)).filter(Boolean) as Profile[];

      return {
        id: r.id,
        pageId: r.pageId,
        title: r.title,
        description: r.description,
        briefLink: r.briefLink,
        briefTitle: r.briefTitle || null,
        divisionId: r.divisionId,
        divisionName: divMap.get(r.divisionId) || 'Umum',
        publicationMedia: r.publicationMedia,
        deadline: r.deadline.toISOString(),
        status: r.status,
        kanbanOrder: r.kanbanOrder,
        requestorId: r.requestorId,
        requestor: userMap.get(r.requestorId),
        designerId: rawIds[0] || r.designerId || null,
        designer: designersList[0] || (r.designerId ? userMap.get(r.designerId) : null) || null,
        designerIds: rawIds,
        designers: designersList,
        isArchived: r.isArchived || false,
        archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    // Pending users computed in memory from profiles
    const pendingUsers = allUsers.filter((u) => !u.isApproved);

    // Compute active WIP counts across all active jobs in memory
    const activeJobs = allJobsRecords.filter(
      (j) => !j.isArchived && (j.status === 'wip' || j.status === 'revisions')
    );

    const designers = allUsers.filter(
      (u) => u.isApproved && (u.role === 'designer' || u.role === 'admin')
    );
    designers.forEach((d) => wipCountMap.set(d.id, 0));

    activeJobs.forEach((job) => {
      const assignedIds = jobDesignersMap.get(job.id) || (job.designerId ? [job.designerId] : []);
      assignedIds.forEach((dId) => {
        wipCountMap.set(dId, (wipCountMap.get(dId) || 0) + 1);
      });
    });

    const designerSuggestions = designers.map((d) => ({
      designer: d,
      activeWipCount: wipCountMap.get(d.id) || 0,
    }));
    designerSuggestions.sort((a, b) => a.activeWipCount - b.activeWipCount);

    const notifications: AppNotification[] = notificationsRecords.map((r) => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      message: r.message,
      type: r.type as NotificationType,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      actorId: r.actorId,
      actorName: r.actorName,
      actorAvatar: r.actorAvatar,
      note: r.note,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      currentUser,
      allUsers,
      pages,
      currentPage,
      divisions,
      initialJobs,
      pendingUsers,
      designerSuggestions,
      notifications,
    };
  } catch (e) {
    console.error('Failed to get initial board data:', e);
    return null;
  }
}
