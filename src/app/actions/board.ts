'use server';

import { db, schema, sqlClient } from '@/lib/db';
import { Profile, Page, Division, Job, AppNotification, NotificationType, Deliverable } from '@/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDeliverablePreviewUrl } from '@/lib/r2';

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
  initialPageEditors?: Record<string, string[]>;
  initialDeliverables?: Record<string, Deliverable[]>;
}

interface DbProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string | null;
  avatar_url?: string | null;
  role: Profile['role'];
  division_id?: string | null;
  is_approved: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DbDivisionRow {
  id: string;
  page_id: string;
  name: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DbPageRow {
  id: string;
  name: string;
  description?: string | null;
  created_by?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DbNotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  job_id?: string | null;
  job_title?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  note?: string | null;
  is_read: boolean;
  created_at: string | Date;
}

interface DbJobRow {
  id: string;
  page_id: string;
  title: string;
  description?: string | null;
  brief_link?: string | null;
  brief_title?: string | null;
  division_id: string;
  publication_media?: string | null;
  deadline: string | Date;
  status: Job['status'];
  kanban_order: number;
  requestor_id: string;
  designer_id?: string | null;
  is_archived?: boolean | null;
  archived_at?: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DbJobDesignerRow {
  job_id: string;
  designer_id: string;
}

interface DbPageEditorRow {
  page_id: string;
  editor_id: string;
}

interface DbWorkloadRow {
  designer_id: string;
  active_wip_count: number;
}

interface DbDeliverableRow {
  id: string;
  job_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploader_name?: string | null;
  storage_key: string;
  preview_storage_key?: string | null;
  registered_at?: string | Date | null;
  created_at: string | Date;
}

export async function getInitialBoardDataAction(): Promise<InitialBoardData | null> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const currentPage = store.pages[0] || null;
    const initialJobs = currentPage ? store.jobs.filter((j) => j.pageId === currentPage.id) : store.jobs;
    const initialDivisions = currentPage ? store.divisions.filter((d) => d.pageId === currentPage.id) : store.divisions;
    const pendingUsers = store.users.filter((u) => !u.isApproved);
    const mockStorePe = (store as unknown as { pageEditors?: { pageId: string; editorId: string }[] }).pageEditors;
    const initialPageEditors: Record<string, string[]> = {};
    if (mockStorePe) {
      for (const pe of mockStorePe) {
        if (!initialPageEditors[pe.pageId]) initialPageEditors[pe.pageId] = [];
        initialPageEditors[pe.pageId].push(pe.editorId);
      }
    }
    const assignedEditorIds = new Set(
      currentPage ? (initialPageEditors[currentPage.id] || []) : []
    );
    const designers = store.users.filter(
      (u) =>
        u.isApproved &&
        (u.role === 'designer' || u.role === 'admin') &&
        (assignedEditorIds.size === 0 || assignedEditorIds.has(u.id))
    );
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
      initialPageEditors,
    };
  }

  if (!db) return null;


  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;


    // Single unified SQL round-trip for ALL initial board metadata
    const [row] = await sqlClient!`
      WITH first_page AS (
        SELECT id, name, description, created_by, created_at, updated_at
        FROM pages
        ORDER BY created_at ASC
        LIMIT 1
      )
      SELECT
        (SELECT json_agg(p.*) FROM profiles p) as profiles,
        (SELECT json_agg(d.*) FROM divisions d) as all_divisions,
        (SELECT json_agg(pg.* ORDER BY pg.created_at ASC) FROM pages pg) as pages,
        (SELECT json_agg(n.*) FROM (
          SELECT * FROM notifications WHERE user_id = ${user.id}::uuid ORDER BY created_at DESC LIMIT 50
        ) n) as notifications,
        (SELECT json_agg(j.* ORDER BY j.kanban_order, j.id) FROM jobs j WHERE j.page_id = (SELECT id FROM first_page)) as jobs,
        (SELECT json_agg(jd.*) FROM job_designers jd) as job_designers,
        (SELECT json_agg(pe.*) FROM page_editors pe) as page_editors,
        (
          WITH active_jobs AS (
            SELECT id, designer_id FROM jobs
            WHERE is_archived = false AND status IN ('wip', 'revisions')
          ), normalized_assignments AS (
            SELECT ajd.designer_id FROM active_jobs aj
            INNER JOIN job_designers ajd ON ajd.job_id = aj.id
            UNION ALL
            SELECT aj.designer_id FROM active_jobs aj
            WHERE aj.designer_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM job_designers legacy_check
              WHERE legacy_check.job_id = aj.id AND legacy_check.designer_id = aj.designer_id
            )
          )
          SELECT json_agg(w.*) FROM (
            SELECT designer_id, count(*)::int as active_wip_count
            FROM normalized_assignments
            WHERE designer_id IS NOT NULL
            GROUP BY designer_id
          ) w
        ) as workload,
        (
          SELECT json_agg(deliv.*) FROM (
            SELECT d.*, p.full_name as uploader_name
            FROM deliverables d
            LEFT JOIN profiles p ON p.id = d.uploaded_by
            INNER JOIN jobs j ON j.id = d.job_id
            WHERE j.page_id = (SELECT id FROM first_page) AND d.status = 'ready'
            ORDER BY d.registered_at DESC NULLS LAST, d.created_at DESC
          ) deliv
        ) as deliverables
    `;

    const profilesRecords = (row?.profiles || []) as DbProfileRow[];
    const allDivisionsRecords = (row?.all_divisions || []) as DbDivisionRow[];
    const pagesRecords = (row?.pages || []) as DbPageRow[];
    const notificationsRecords = (row?.notifications || []) as DbNotificationRow[];
    const pageJobsRecords = (row?.jobs || []) as DbJobRow[];
    const allJobDesignersRecords = (row?.job_designers || []) as DbJobDesignerRow[];
    const allPageEditorRecords = (row?.page_editors || []) as DbPageEditorRow[];
    const workloadRows = (row?.workload || []) as DbWorkloadRow[];
    const rawDeliverables = (row?.deliverables || []) as DbDeliverableRow[];

    const divMap = new Map(allDivisionsRecords.map((d) => [d.id, d.name]));

    const allUsers: Profile[] = profilesRecords.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      phoneNumber: r.phone_number || undefined,
      avatarUrl: r.avatar_url || undefined,
      role: r.role,
      divisionId: r.division_id ?? null,
      divisionName: r.division_id ? divMap.get(r.division_id) : undefined,
      isApproved: r.is_approved,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
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
      const creativeDiv = allDivisionsRecords.find((d) => d.name === 'Creative & Marketing');
      const defaultDiv = creativeDiv?.id || allDivisionsRecords[0]?.id || null;

      try {
        const [newProfile] = await db
          .insert(schema.profiles)
          .values({
            id: user.id,
            email: user.email || '',
            fullName: fallbackName,
            phoneNumber: fallbackPhone,
            avatarUrl: fallbackAvatar,
            role: 'requestor',
            divisionId: defaultDiv,
            isApproved: false,
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

    if (!currentUser || !currentUser.isApproved) return null;

    const pages: Page[] = pagesRecords.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      createdBy: r.created_by || '',
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));

    const currentPage = pages[0] || null;

    const divisions: Division[] = allDivisionsRecords
      .filter((d) => (currentPage ? d.page_id === currentPage.id : true))
      .map((d) => ({
        id: d.id,
        pageId: d.page_id,
        name: d.name,
        createdAt: new Date(d.created_at).toISOString(),
        updatedAt: new Date(d.updated_at).toISOString(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

    // Build pageEditors map for instant client access
    const initialPageEditors: Record<string, string[]> = {};
    for (const r of allPageEditorRecords) {
      if (!initialPageEditors[r.page_id]) initialPageEditors[r.page_id] = [];
      initialPageEditors[r.page_id].push(r.editor_id);
    }

    // Build map of job designer assignments in memory.
    const jobDesignersMap = new Map<string, string[]>();
    allJobDesignersRecords.forEach((da) => {
      const existing = jobDesignersMap.get(da.job_id) || [];
      existing.push(da.designer_id);
      jobDesignersMap.set(da.job_id, existing);
    });

    const initialJobs: Job[] = pageJobsRecords.map((r) => {
      let rawIds = jobDesignersMap.get(r.id) || [];
      if (rawIds.length === 0 && r.designer_id) {
        rawIds = [r.designer_id];
      }
      const designersList = rawIds.map((id) => userMap.get(id)).filter(Boolean) as Profile[];

      return {
        id: r.id,
        pageId: r.page_id,
        title: r.title,
        description: r.description ?? null,
        briefLink: r.brief_link || '',
        briefTitle: r.brief_title || null,
        divisionId: r.division_id,
        divisionName: divMap.get(r.division_id) || 'Umum',
        publicationMedia: r.publication_media || 'Instagram',
        deadline: new Date(r.deadline).toISOString(),
        status: r.status,
        kanbanOrder: r.kanban_order,
        requestorId: r.requestor_id,
        requestor: userMap.get(r.requestor_id),
        designerId: rawIds[0] || r.designer_id || null,
        designer: designersList[0] || (r.designer_id ? userMap.get(r.designer_id) : null) || null,
        designerIds: rawIds,
        designers: designersList,
        isArchived: r.is_archived || false,
        archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    });

    // Pending users computed in memory from profiles
    const pendingUsers = allUsers.filter((u) => !u.isApproved);

    const wipCountMap = new Map<string, number>();
    for (const row of workloadRows) {
      wipCountMap.set(String(row.designer_id), Number(row.active_wip_count));
    }

    const assignedEditorIds = new Set(
      currentPage ? (initialPageEditors[currentPage.id] || []) : []
    );

    const designers = allUsers.filter(
      (u) =>
        u.isApproved &&
        (u.role === 'designer' || u.role === 'admin') &&
        (assignedEditorIds.size === 0 || assignedEditorIds.has(u.id))
    );
    designers.forEach((d) => {
      if (!wipCountMap.has(d.id)) wipCountMap.set(d.id, 0);
    });

    const designerSuggestions = designers.map((d) => ({
      designer: d,
      activeWipCount: wipCountMap.get(d.id) || 0,
    }));
    designerSuggestions.sort((a, b) => a.activeWipCount - b.activeWipCount);

    const notifications: AppNotification[] = notificationsRecords.map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      message: r.message,
      type: r.type as NotificationType,
      jobId: r.job_id,
      jobTitle: r.job_title,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorAvatar: r.actor_avatar,
      note: r.note,
      isRead: r.is_read,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    // Pre-seed deliverables for all active page jobs so modals open with 0ms delay
    const initialDeliverables: Record<string, Deliverable[]> = {};
    if (rawDeliverables.length > 0) {
      await Promise.all(
        rawDeliverables.map(async (d) => {
          const previewKey = d.preview_storage_key || d.storage_key;
          const previewUrl = await createDeliverablePreviewUrl(previewKey);
          const item: Deliverable = {
            id: d.id,
            jobId: d.job_id,
            originalFilename: d.original_filename,
            mimeType: d.mime_type,
            sizeBytes: d.size_bytes,
            uploadedBy: d.uploaded_by,
            uploaderName: d.uploader_name || undefined,
            createdAt: new Date(d.created_at).toISOString(),
            registeredAt: d.registered_at ? new Date(d.registered_at).toISOString() : new Date(d.created_at).toISOString(),
            previewUrl,
            fileUrl: `/api/deliverables/${d.id}/view`,
          };
          if (!initialDeliverables[d.job_id]) {
            initialDeliverables[d.job_id] = [];
          }
          initialDeliverables[d.job_id].push(item);
        })
      );
    }

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
      initialPageEditors,
      initialDeliverables,
    };
  } catch (e) {
    console.error('Failed to get initial board data:', e);
    return null;
  }
}
