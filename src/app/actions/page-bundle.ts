'use server';

import { db, schema } from '@/lib/db';
import { eq, inArray, sql, asc } from 'drizzle-orm';
import { Job, Division, Profile } from '@/types';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { getJobsAction } from './jobs/queries';
import { getDivisionsAction } from './divisions';
import { getPageDesignerSuggestionsAction } from './page-editors';

export interface PageBoardBundle {
  jobs: Job[];
  divisions: Division[];
  designerSuggestions: { designer: Profile; activeWipCount: number }[];
}

export async function getPageBundleAction(pageId: string): Promise<PageBoardBundle> {
  if (isMockEnabled()) {
    const [jobs, divisions, designerSuggestions] = await Promise.all([
      getJobsAction(pageId),
      getDivisionsAction(pageId),
      getPageDesignerSuggestionsAction(pageId),
    ]);
    return { jobs, divisions, designerSuggestions };
  }

  if (!db) {
    return { jobs: [], divisions: [], designerSuggestions: [] };
  }

  try {
    // Run ALL page queries in a single consolidated parallel database trip
    const [
      allUsersRecords,
      divisionsRecords,
      jobRecords,
      editorRows,
      workloadRows,
    ] = await Promise.all([
      db
        .select({
          id: schema.profiles.id,
          email: schema.profiles.email,
          fullName: schema.profiles.fullName,
          phoneNumber: schema.profiles.phoneNumber,
          avatarUrl: schema.profiles.avatarUrl,
          role: schema.profiles.role,
          divisionId: schema.profiles.divisionId,
          isApproved: schema.profiles.isApproved,
          createdAt: schema.profiles.createdAt,
          updatedAt: schema.profiles.updatedAt,
        })
        .from(schema.profiles),

      db
        .select()
        .from(schema.divisions)
        .where(eq(schema.divisions.pageId, pageId))
        .orderBy(asc(schema.divisions.name)),

      db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.pageId, pageId))
        .orderBy(schema.jobs.kanbanOrder, schema.jobs.id),

      db
        .select({ editorId: schema.pageEditors.editorId })
        .from(schema.pageEditors)
        .where(eq(schema.pageEditors.pageId, pageId)),

      db.execute(sql`
        SELECT designer_id, count(*)::int AS active_wip_count
        FROM (
          SELECT designer_id FROM jobs
          WHERE status IN ('wip', 'revisions') AND is_archived = false AND designer_id IS NOT NULL
          UNION ALL
          SELECT jd.designer_id FROM job_designers jd
          JOIN jobs j ON j.id = jd.job_id
          WHERE j.status IN ('wip', 'revisions') AND j.is_archived = false
        ) combined_designers
        GROUP BY designer_id;
      `),
    ]);

    // 1. Process Users Map
    const userMap = new Map<string, Profile>();
    allUsersRecords.forEach((r) => {
      userMap.set(r.id, {
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber || undefined,
        avatarUrl: r.avatarUrl || undefined,
        role: r.role as Profile['role'],
        divisionId: r.divisionId ?? null,
        isApproved: r.isApproved ?? true,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      });
    });

    // 2. Process Divisions
    const divisions: Division[] = divisionsRecords.map((r) => ({
      id: r.id,
      pageId: r.pageId,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    const divMap = new Map(divisions.map((d) => [d.id, d.name]));

    // 3. Process Multi-designer assignments for jobs
    const jobIds = jobRecords.map((j) => j.id);
    let jobDesignersMap = new Map<string, string[]>();

    if (jobIds.length > 0) {
      const designerAssignments = await db
        .select()
        .from(schema.jobDesigners)
        .where(inArray(schema.jobDesigners.jobId, jobIds));

      designerAssignments.forEach((da) => {
        const existing = jobDesignersMap.get(da.jobId) || [];
        existing.push(da.designerId);
        jobDesignersMap.set(da.jobId, existing);
      });
    }

    const jobs: Job[] = jobRecords.map((r) => {
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

    // 4. Process Designer suggestions
    const assignedIds = new Set(editorRows.map((r) => r.editorId));
    const workloadMap = new Map<string, number>();
    const workloadResult = (workloadRows as unknown as { designer_id: string; active_wip_count: number }[]) || [];
    workloadResult.forEach((row) => {
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

    const designerSuggestions = eligibleDesigners.map((designer) => ({
      designer,
      activeWipCount: workloadMap.get(designer.id) || 0,
    }));

    return {
      jobs,
      divisions,
      designerSuggestions,
    };
  } catch (error) {
    console.error('Failed to get page bundle:', error);
    return { jobs: [], divisions: [], designerSuggestions: [] };
  }
}
