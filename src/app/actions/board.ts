'use server';

import { db, schema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
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
    const initialDivisions = currentPage ? store.divisions.filter((d) => d.pageId === currentPage.id) : store.divisions;
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
      divisions: initialDivisions,
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


    // Load workspace metadata first; jobs are scoped after the active page is known.
    const [profilesRecords, divisionsRecords, pagesRecords, notificationsRecords] = await Promise.all([
      db.select().from(schema.profiles),
      db.select().from(schema.divisions),
      db.select().from(schema.pages),
      db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, user.id))
        .orderBy(schema.notifications.createdAt)
        .limit(50),
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
    let currentUser = userMap.get(user.id) || null;

    if (!currentUser) {
      // Auto-heal missing profile row for valid authenticated user
      const meta = (user.user_metadata || {}) as {
        full_name?: string;
        name?: string;
        avatar_url?: string;
        phone_number?: string;
      };
      const fallbackName = meta.full_name || meta.name || user.email?.split('@')[0] || 'User';
      const fallbackAvatar = meta.avatar_url || null;
      const fallbackPhone = meta.phone_number || user.phone || null;
      const creativeDiv = divisionsRecords.find((d) => d.name === 'Creative & Marketing');
      const defaultDiv = creativeDiv?.id || divisionsRecords[0]?.id || null;

      try {
        const [newProfile] = await db
          .insert(schema.profiles)
          .values({
            id: user.id,
            email: user.email || '',
            fullName: fallbackName,
            phoneNumber: fallbackPhone,
            avatarUrl: fallbackAvatar,
            role: 'designer',
            divisionId: defaultDiv,
            isApproved: true,
          })
          .onConflictDoUpdate({
            target: schema.profiles.id,
            set: { updatedAt: new Date() },
          })
          .returning();

        if (newProfile) {
          currentUser = {
            id: newProfile.id,
            email: newProfile.email,
            fullName: newProfile.fullName,
            phoneNumber: newProfile.phoneNumber,
            avatarUrl: newProfile.avatarUrl,
            role: newProfile.role,
            divisionId: newProfile.divisionId,
            divisionName: newProfile.divisionId ? divMap.get(newProfile.divisionId) : undefined,
            isApproved: newProfile.isApproved,
            createdAt: newProfile.createdAt.toISOString(),
            updatedAt: newProfile.updatedAt.toISOString(),
          };
          allUsers.push(currentUser);
        }
      } catch (err) {
        console.error('Failed to auto-heal profile:', err);
      }
    }

    if (!currentUser) return null;

    const pages: Page[] = pagesRecords.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const currentPage = pages[0] || null;

    const divisions: Division[] = divisionsRecords
      .filter((d) => (currentPage ? d.pageId === currentPage.id : true))
      .map((d) => ({
        id: d.id,
        pageId: d.pageId,
        name: d.name,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

    const [pageJobsRecords, workloadRows, allJobDesignersRecords] = await Promise.all([
      currentPage
        ? db.select().from(schema.jobs).where(eq(schema.jobs.pageId, currentPage.id)).orderBy(schema.jobs.kanbanOrder, schema.jobs.id)
        : Promise.resolve([]),
      db.execute(sql`
        WITH active_jobs AS (
          SELECT id, designer_id
          FROM ${schema.jobs}
          WHERE is_archived = false AND status IN ('wip', 'revisions')
        ), normalized_assignments AS (
          SELECT ajd.designer_id FROM active_jobs aj
          INNER JOIN ${schema.jobDesigners} ajd ON ajd.job_id = aj.id
          UNION ALL
          SELECT aj.designer_id FROM active_jobs aj
          WHERE aj.designer_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM ${schema.jobDesigners} legacy_check
            WHERE legacy_check.job_id = aj.id AND legacy_check.designer_id = aj.designer_id
          )
        )
        SELECT designer_id, COUNT(*)::int AS active_wip_count
        FROM normalized_assignments GROUP BY designer_id
      `),
      db.select().from(schema.jobDesigners),
    ]);

    // Build map of job designer assignments in memory.
    const jobDesignersMap = new Map<string, string[]>();
    allJobDesignersRecords.forEach((da) => {
      const existing = jobDesignersMap.get(da.jobId) || [];
      existing.push(da.designerId);
      jobDesignersMap.set(da.jobId, existing);
    });

    // Jobs are already scoped to the current active page above.

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

    const wipCountMap = new Map<string, number>();
    for (const row of workloadRows) {
      wipCountMap.set(String(row.designer_id), Number(row.active_wip_count));
    }

    const designers = allUsers.filter(
      (u) => u.isApproved && (u.role === 'designer' || u.role === 'admin')
    );
    designers.forEach((d) => {
      if (!wipCountMap.has(d.id)) wipCountMap.set(d.id, 0);
    });

    // Counts are computed by the database; assignment rows above remain needed
    // to hydrate the initial job DTOs.

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
