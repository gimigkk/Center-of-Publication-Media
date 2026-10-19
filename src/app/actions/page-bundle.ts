'use server';

import { db, sqlClient } from '@/lib/db';
import { Job, Division, Profile, Deliverable } from '@/types';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { createDeliverablePreviewUrl } from '@/lib/r2';
import { getJobsAction } from './jobs/queries';
import { getDivisionsAction } from './divisions';
import { getPageDesignerSuggestionsAction } from './page-editors';

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
  blur_data_url?: string | null;
  width?: number | null;
  height?: number | null;
  registered_at?: string | Date | null;
  created_at: string | Date;
}

export interface PageBoardBundle {
  jobs: Job[];
  divisions: Division[];
  designerSuggestions: { designer: Profile; activeWipCount: number }[];
  editorIds: string[];
  deliverablesByJobId?: Record<string, Deliverable[]>;
}

export async function getPageBundleAction(
  pageId: string,
  cachedUsers?: Profile[]
): Promise<PageBoardBundle> {
  const currentUser = await getAuthenticatedUser(false);
  if (!currentUser) {
    return { jobs: [], divisions: [], designerSuggestions: [], editorIds: [] };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const mockStorePe = (store as unknown as { pageEditors?: { pageId: string; editorId: string }[] }).pageEditors;
    const editorIds = mockStorePe?.filter((pe) => pe.pageId === pageId).map((pe) => pe.editorId) || [];
    const [jobs, divisions, designerSuggestions] = await Promise.all([
      getJobsAction(pageId),
      getDivisionsAction(pageId),
      getPageDesignerSuggestionsAction(pageId),
    ]);
    return { jobs, divisions, designerSuggestions, editorIds };
  }

  if (!db) {
    return { jobs: [], divisions: [], designerSuggestions: [], editorIds: [] };
  }

  try {
    const shouldFetchUsers = !cachedUsers || cachedUsers.length === 0;

    // Single unified SQL round-trip for page bundle
    const [row] = await sqlClient!`
      SELECT
        ${shouldFetchUsers ? sqlClient!`(SELECT json_agg(p.*) FROM profiles p)` : sqlClient!`NULL`} as profiles,
        (SELECT json_agg(d.* ORDER BY d.name ASC) FROM divisions d WHERE d.page_id = ${pageId}::uuid) as divisions,
        (SELECT json_agg(j.* ORDER BY j.kanban_order, j.id) FROM jobs j WHERE j.page_id = ${pageId}::uuid) as jobs,
        (SELECT json_agg(pe.*) FROM page_editors pe WHERE pe.page_id = ${pageId}::uuid) as page_editors,
        (
          SELECT json_agg(jd.*)
          FROM job_designers jd
          INNER JOIN jobs j ON j.id = jd.job_id
          WHERE j.page_id = ${pageId}::uuid
        ) as job_designers,
        (
          WITH active_jobs AS (
            SELECT id, designer_id
            FROM jobs
            WHERE is_archived = false
              AND status IN ('wip', 'revisions')
          ), normalized_assignments AS (
            SELECT ajd.designer_id
            FROM active_jobs aj
            INNER JOIN job_designers ajd ON ajd.job_id = aj.id
            UNION ALL
            SELECT aj.designer_id
            FROM active_jobs aj
            WHERE aj.designer_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM job_designers legacy_check
                WHERE legacy_check.job_id = aj.id
                  AND legacy_check.designer_id = aj.designer_id
              )
          )
          SELECT json_agg(w.*)
          FROM (
            SELECT designer_id, COUNT(*)::int AS active_wip_count
            FROM normalized_assignments
            GROUP BY designer_id
          ) w
        ) as workload,
        (
          SELECT json_agg(deliv.*)
          FROM (
            SELECT d.*, p.full_name as uploader_name
            FROM deliverables d
            LEFT JOIN profiles p ON p.id = d.uploaded_by
            INNER JOIN jobs j ON j.id = d.job_id
            WHERE j.page_id = ${pageId}::uuid AND d.status = 'ready'
            ORDER BY d.registered_at DESC NULLS LAST, d.created_at DESC
          ) deliv
        ) as deliverables
    `;

    const fetchedUsersRecords = (row?.profiles || null) as DbProfileRow[] | null;
    const divisionsRecords = (row?.divisions || []) as DbDivisionRow[];
    const jobRecords = (row?.jobs || []) as DbJobRow[];
    const editorRows = (row?.page_editors || []) as DbPageEditorRow[];
    const allJobDesignersRecords = (row?.job_designers || []) as DbJobDesignerRow[];
    const workloadRows = (row?.workload || []) as DbWorkloadRow[];
    const rawDeliverables = (row?.deliverables || []) as DbDeliverableRow[];

    // 1. Process Users Map
    const userMap = new Map<string, Profile>();
    if (cachedUsers && cachedUsers.length > 0) {
      cachedUsers.forEach((u) => userMap.set(u.id, u));
    } else if (fetchedUsersRecords) {
      fetchedUsersRecords.forEach((r) => {
        userMap.set(r.id, {
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          phoneNumber: r.phone_number || undefined,
          avatarUrl: r.avatar_url || undefined,
          role: r.role,
          divisionId: r.division_id ?? null,
          isApproved: r.is_approved ?? true,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        });
      });
    }

    // 2. Process Divisions
    const divisions: Division[] = divisionsRecords.map((r) => ({
      id: r.id,
      pageId: r.page_id,
      name: r.name,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
    const divMap = new Map(divisions.map((d) => [d.id, d.name]));

    // 3. Process Multi-designer assignments for jobs
    const jobDesignersMap = new Map<string, string[]>();
    allJobDesignersRecords.forEach((da) => {
      const existing = jobDesignersMap.get(da.job_id) || [];
      existing.push(da.designer_id);
      jobDesignersMap.set(da.job_id, existing);
    });

    const jobs: Job[] = jobRecords.map((r) => {
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

    // 4. Process Designer suggestions
    const assignedIds = new Set(editorRows.map((r) => r.editor_id));
    const workloadMap = new Map<string, number>();
    workloadRows.forEach((row) => {
      if (row.designer_id) {
        workloadMap.set(row.designer_id, Number(row.active_wip_count) || 0);
      }
    });

    const eligibleDesigners = Array.from(userMap.values()).filter(
      (u) =>
        u.isApproved &&
        (u.role === 'designer' || u.role === 'admin') &&
        (assignedIds.size === 0 || assignedIds.has(u.id))
    );

    const editorIds = editorRows.map((r) => r.editor_id);
    const designerSuggestions = eligibleDesigners.map((designer) => ({
      designer,
      activeWipCount: workloadMap.get(designer.id) || 0,
    }));
    designerSuggestions.sort((a, b) => a.activeWipCount - b.activeWipCount);

    const deliverablesByJobId: Record<string, Deliverable[]> = {};
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
            blurDataUrl: d.blur_data_url,
            width: d.width,
            height: d.height,
            createdAt: new Date(d.created_at).toISOString(),
            registeredAt: d.registered_at ? new Date(d.registered_at).toISOString() : new Date(d.created_at).toISOString(),
            previewUrl,
            fileUrl: `/api/deliverables/${d.id}/view`,
          };
          if (!deliverablesByJobId[d.job_id]) {
            deliverablesByJobId[d.job_id] = [];
          }
          deliverablesByJobId[d.job_id].push(item);
        })
      );
    }

    return {
      jobs,
      divisions,
      designerSuggestions,
      editorIds,
      deliverablesByJobId,
    };
  } catch (error) {
    console.error('Failed to get page bundle:', error);
    return { jobs: [], divisions: [], designerSuggestions: [], editorIds: [] };
  }
}
