'use server';

import { db, schema } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Profile } from '@/types';
import { sendJobStatusEmail } from '@/lib/email';
import { getAllUsersAction } from '../auth';
import { createNotificationAction } from '../notifications';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export async function assignDesignerAction(
  jobId: string,
  designerId: string,
  actor: Profile
): Promise<{ success: boolean; error?: string }> {
  const ids = designerId ? designerId.split(',').filter(Boolean) : [];
  return await setJobDesignersAction(jobId, ids, actor);
}

export async function setJobDesignersAction(
  jobId: string,
  designerIds: string[],
  actor: Profile
): Promise<{ success: boolean; error?: string }> {
  if (actor.role !== 'admin') {
    return { success: false, error: 'Hanya admin yang dapat menugaskan desainer' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.jobs.find((j) => j.id === jobId);
    if (target) {
      const designersList = designerIds
        .map((id) => store.users.find((u) => u.id === id))
        .filter(Boolean) as Profile[];
      target.designerIds = designerIds;
      target.designerId = designerIds[0] || null;
      target.designers = designersList;
      target.designer = designersList[0] || null;
      if (target.status === 'in_queue' && designerIds.length > 0) {
        target.status = 'wip';
      }
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Job tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  const [currentJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!currentJob) {
    return { success: false, error: 'Job tidak ditemukan' };
  }

  const userIds = Array.from(new Set([currentJob.requestorId, actor.id, ...designerIds]));
  const userRecords = await db
    .select()
    .from(schema.profiles)
    .where(inArray(schema.profiles.id, userIds));
  const profileMap = new Map(
    userRecords.map((user) => [
      user.id,
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        avatarUrl: user.avatarUrl,
        role: user.role,
        divisionId: user.divisionId,
        isApproved: user.isApproved,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      } satisfies Profile,
    ])
  );

  const primaryDesignerId = designerIds[0] || null;
  const designersList = designerIds.map((id) => profileMap.get(id)).filter(Boolean) as Profile[];
  const newStatus = designerIds.length === 0
    ? 'in_queue'
    : (currentJob.status === 'in_queue' ? 'wip' : currentJob.status);

  try {
    await db
      .update(schema.jobs)
      .set({
        designerId: primaryDesignerId,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));

    await db.delete(schema.jobDesigners).where(eq(schema.jobDesigners.jobId, jobId));
    if (designerIds.length > 0) {
      await db.insert(schema.jobDesigners).values(
        designerIds.map((dId) => ({
          jobId,
          designerId: dId,
        }))
      );
    }

    const designerNames = designersList.map((d) => d.fullName).join(', ');
    await db.insert(schema.jobActivity).values({
      jobId,
      actorId: actor.id,
      fromStatus: currentJob.status,
      toStatus: newStatus,
      note: designersList.length > 0 ? `Ditugaskan kepada: ${designerNames}` : 'Menghapus semua editor yang ditugaskan',
    });
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Kesalahan saat menugaskan editor' };
  }

  const requestor = profileMap.get(currentJob.requestorId);
  const recipients: string[] = designersList.map((d) => d.email);
  if (requestor) recipients.push(requestor.email);

  if (designersList.length > 0) {
    const designerNames = designersList.map((d) => d.fullName).join(', ');
    // Dispatch email asynchronously in background so response is instantaneous
    sendJobStatusEmail({
      jobTitle: currentJob.title,
      briefLink: currentJob.briefLink,
      fromStatus: currentJob.status,
      toStatus: newStatus,
      actorName: actor.fullName,
      actorEmail: actor.email,
      recipients,
      note: `Ditugaskan kepada editor: ${designerNames}`,
    }).catch((err) => console.error('Failed to send assignment email:', err));

    // Dispatch in-app notifications in parallel
    Promise.all(
      designersList
        .filter((d) => d.id !== actor.id)
        .map((d) =>
          createNotificationAction({
            userId: d.id,
            title: 'Penugasan Job Baru',
            message: `${actor.fullName} menugaskan Anda ke job: "${currentJob.title}"`,
            type: 'job_assigned',
            jobId: currentJob.id,
            jobTitle: currentJob.title,
            actorId: actor.id,
            actorName: actor.fullName,
            actorAvatar: actor.avatarUrl,
          })
        )
    ).catch((err) => console.error('Failed to create in-app notifications:', err));
  }

  revalidatePath('/');
  return { success: true };
}

export async function getDesignerWorkloadsAction(): Promise<{ designer: Profile; activeWipCount: number }[]> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const designers = store.users.filter((u) => u.isApproved && (u.role === 'designer' || u.role === 'admin'));
    return designers
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
  }

  const users = await getAllUsersAction();
  const designers = users.filter((u) => u.isApproved && (u.role === 'designer' || u.role === 'admin'));

  if (!db) {
    return designers.map((d) => ({ designer: d, activeWipCount: 0 }));
  }

  try {
    const activeJobs = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.isArchived, false),
          inArray(schema.jobs.status, ['wip', 'revisions'])
        )
      );

    const wipCountMap = new Map<string, number>();
    designers.forEach((d) => wipCountMap.set(d.id, 0));

    if (activeJobs.length > 0) {
      const activeJobIds = activeJobs.map((j) => j.id);
      const assignments = await db
        .select()
        .from(schema.jobDesigners)
        .where(inArray(schema.jobDesigners.jobId, activeJobIds));

      assignments.forEach((a) => {
        const count = wipCountMap.get(a.designerId) || 0;
        wipCountMap.set(a.designerId, count + 1);
      });

      activeJobs.forEach((j) => {
        if (j.designerId && !assignments.some((a) => a.jobId === j.id && a.designerId === j.designerId)) {
          const count = wipCountMap.get(j.designerId) || 0;
          wipCountMap.set(j.designerId, count + 1);
        }
      });
    }

    const suggestions = designers.map((d) => ({
      designer: d,
      activeWipCount: wipCountMap.get(d.id) || 0,
    }));

    suggestions.sort((a, b) => a.activeWipCount - b.activeWipCount);
    return suggestions;
  } catch {
    return designers.map((d) => ({ designer: d, activeWipCount: 0 }));
  }
}

export const getDesignerSuggestionsAction = getDesignerWorkloadsAction;
