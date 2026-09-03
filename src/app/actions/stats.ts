'use server';

import { db, schema } from '@/lib/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { getAllUsersAction } from './auth';
import { getDivisionsAction } from './divisions';
import { getAvatarColor } from '@/lib/utils';
import { Profile } from '@/types';

export interface JobCompletionStatItem {
  id: string;
  jobId: string;
  jobTitle: string;
  pageId: string;
  divisionName: string;
  completedAt: string; // ISO 8601 string
  personId: string;
  personName: string;
  personAvatar?: string | null;
  personRole: string;
  personColor: string;
}

export async function getJobCompletionStatsAction(
  pageId?: string
): Promise<JobCompletionStatItem[]> {
  // 1. Mock Mode Handler
  if (isMockEnabled()) {
    const store = getMockStore();
    const doneJobs = store.jobs.filter((j) => {
      if (j.status !== 'done') return false;
      if (pageId && pageId !== 'all' && j.pageId !== pageId) return false;
      return true;
    });

    const items: JobCompletionStatItem[] = [];

    doneJobs.forEach((job) => {
      // Completed date timestamp
      const completedAt = job.archivedAt || job.updatedAt || job.createdAt || new Date().toISOString();

      // Contributors: prefer assigned designers; fallback to requestor if no designer
      const contributors: Profile[] =
        job.designers && job.designers.length > 0
          ? job.designers
          : job.designer
          ? [job.designer]
          : job.requestor
          ? [job.requestor]
          : [];

      if (contributors.length === 0) {
        items.push({
          id: `${job.id}-unassigned`,
          jobId: job.id,
          jobTitle: job.title,
          pageId: job.pageId,
          divisionName: job.divisionName || 'Umum',
          completedAt,
          personId: 'unassigned',
          personName: 'Tanpa Desainer',
          personAvatar: null,
          personRole: 'designer',
          personColor: '#757575',
        });
      } else {
        contributors.forEach((contributor) => {
          items.push({
            id: `${job.id}-${contributor.id}`,
            jobId: job.id,
            jobTitle: job.title,
            pageId: job.pageId,
            divisionName: job.divisionName || 'Umum',
            completedAt,
            personId: contributor.id,
            personName: contributor.fullName,
            personAvatar: contributor.avatarUrl || null,
            personRole: contributor.role,
            personColor: getAvatarColor(contributor.id || contributor.fullName),
          });
        });
      }
    });

    return items.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  }

  // 2. Real Database Handler
  if (!db) return [];

  try {
    const [users, divisions] = await Promise.all([getAllUsersAction(), getDivisionsAction()]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const divMap = new Map(divisions.map((d) => [d.id, d.name]));

    // Query jobs that are either currently 'done' or have been completed
    const jobCondition = pageId && pageId !== 'all'
      ? and(eq(schema.jobs.pageId, pageId), eq(schema.jobs.status, 'done'))
      : eq(schema.jobs.status, 'done');

    const doneJobRecords = await db
      .select()
      .from(schema.jobs)
      .where(jobCondition);

    if (doneJobRecords.length === 0) return [];

    const jobIds = doneJobRecords.map((j) => j.id);

    // Multi-designer joins
    const designerRows = await db
      .select()
      .from(schema.jobDesigners)
      .where(inArray(schema.jobDesigners.jobId, jobIds));

    const jobDesignersMap = new Map<string, string[]>();
    designerRows.forEach((row) => {
      const list = jobDesignersMap.get(row.jobId) || [];
      list.push(row.designerId);
      jobDesignersMap.set(row.jobId, list);
    });

    // Query job_activity for toStatus = 'done' to get precise completion timestamps
    const activityRows = await db
      .select()
      .from(schema.jobActivity)
      .where(
        and(
          inArray(schema.jobActivity.jobId, jobIds),
          eq(schema.jobActivity.toStatus, 'done')
        )
      )
      .orderBy(desc(schema.jobActivity.createdAt));

    // Map latest activity timestamp per job
    const latestDoneActivityMap = new Map<string, { createdAt: Date; actorId: string }>();
    activityRows.forEach((act) => {
      if (!latestDoneActivityMap.has(act.jobId)) {
        latestDoneActivityMap.set(act.jobId, { createdAt: act.createdAt, actorId: act.actorId });
      }
    });

    const items: JobCompletionStatItem[] = [];

    doneJobRecords.forEach((job) => {
      const activity = latestDoneActivityMap.get(job.id);

      // Determine real-world delivery / completion time:
      // For historical archives and imported jobs in Supabase, their delivery time is their deadline.
      // For real-time moved jobs with genuine activity, use activity timestamp.
      let completionDate: Date = job.deadline;
      if (activity?.createdAt) {
        const isImport =
          activity.note?.includes('Diimpor') ||
          activity.note?.includes('Historical') ||
          job.briefTitle?.includes('Historical');

        if (!isImport && activity.createdAt.getTime() > job.createdAt.getTime() + 60000) {
          completionDate = activity.createdAt;
        } else if (job.deadline) {
          completionDate = job.deadline;
        } else {
          completionDate = activity.createdAt;
        }
      } else if (job.deadline) {
        completionDate = job.deadline;
      } else {
        completionDate = job.archivedAt || job.updatedAt || job.createdAt;
      }

      const completedAt = completionDate.toISOString();

      let assignedDesignerIds = jobDesignersMap.get(job.id) || [];
      if (assignedDesignerIds.length === 0 && job.designerId) {
        assignedDesignerIds = [job.designerId];
      }

      // Contributors resolution
      let contributors = assignedDesignerIds
        .map((id) => userMap.get(id))
        .filter(Boolean) as Profile[];

      if (contributors.length === 0) {
        const req = userMap.get(job.requestorId);
        if (req) contributors = [req];
      }

      if (contributors.length === 0) {
        items.push({
          id: `${job.id}-unassigned`,
          jobId: job.id,
          jobTitle: job.title,
          pageId: job.pageId,
          divisionName: divMap.get(job.divisionId) || 'Umum',
          completedAt,
          personId: 'unassigned',
          personName: 'Tanpa Desainer',
          personAvatar: null,
          personRole: 'designer',
          personColor: '#757575',
        });
      } else {
        contributors.forEach((person) => {
          items.push({
            id: `${job.id}-${person.id}`,
            jobId: job.id,
            jobTitle: job.title,
            pageId: job.pageId,
            divisionName: divMap.get(job.divisionId) || 'Umum',
            completedAt,
            personId: person.id,
            personName: person.fullName,
            personAvatar: person.avatarUrl || null,
            personRole: person.role,
            personColor: getAvatarColor(person.id || person.fullName),
          });
        });
      }
    });

    return items.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  } catch (err) {
    console.error('Failed to get job completion stats:', err);
    return [];
  }
}
