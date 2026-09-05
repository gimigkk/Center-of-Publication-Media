'use server';

import { db, schema } from '@/lib/db';
import { eq, inArray } from 'drizzle-orm';
import { Job, Profile } from '@/types';
import { fetchGoogleDocTitle } from '@/lib/gdocs';
import { getAllUsersAction } from '../auth';
import { getDivisionsAction } from '../divisions';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export async function fetchGoogleDocTitleAction(url: string): Promise<string | null> {
  return await fetchGoogleDocTitle(url);
}

export async function getJobsAction(pageId: string): Promise<Job[]> {
  if (isMockEnabled()) {
    return getMockStore().jobs.filter((j) => j.pageId === pageId);
  }

  if (!db) return [];

  const [users, divisions] = await Promise.all([getAllUsersAction(), getDivisionsAction(pageId)]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const divMap = new Map(divisions.map((d) => [d.id, d.name]));

  try {
    const records = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.pageId, pageId))
      .orderBy(schema.jobs.kanbanOrder, schema.jobs.id);

    if (!records || records.length === 0) return [];

    const jobIds = records.map((r) => r.id);

    // Fetch multi-designer join records
    const designerAssignments = await db
      .select()
      .from(schema.jobDesigners)
      .where(inArray(schema.jobDesigners.jobId, jobIds));

    const jobDesignersMap = new Map<string, string[]>();
    designerAssignments.forEach((da) => {
      const existing = jobDesignersMap.get(da.jobId) || [];
      existing.push(da.designerId);
      jobDesignersMap.set(da.jobId, existing);
    });

    return records.map((r) => {
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
  } catch (e) {
    console.error('Failed to get jobs from database:', e);
    return [];
  }
}
