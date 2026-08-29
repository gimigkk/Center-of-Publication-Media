'use server';

import { db, schema } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Job, JobStatus, Profile } from '@/types';
import { jobFormSchema } from '@/lib/validations';
import { sendJobStatusEmail } from '@/lib/email';
import { fetchGoogleDocTitle } from '@/lib/gdocs';
import { getAllUsersAction } from './auth';
import { getDivisionsAction } from './divisions';
import { createNotificationAction } from './notifications';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

export async function fetchGoogleDocTitleAction(url: string): Promise<string | null> {
  return await fetchGoogleDocTitle(url);
}

export async function getJobsAction(pageId: string): Promise<Job[]> {
  if (isMockEnabled()) {
    return getMockStore().jobs.filter((j) => j.pageId === pageId);
  }

  if (!db) return [];

  const users = await getAllUsersAction();
  const divisions = await getDivisionsAction();

  const userMap = new Map(users.map((u) => [u.id, u]));
  const divMap = new Map(divisions.map((d) => [d.id, d.name]));

  try {
    const records = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.pageId, pageId));

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

export async function createJobAction(formData: {
  pageId: string;
  title: string;
  description?: string;
  briefLink: string;
  briefTitle?: string;
  divisionId: string;
  publicationMedia: string;
  deadline: string;
  requestorId: string;
}): Promise<{ success: boolean; job?: Job; error?: string }> {
  const validation = jobFormSchema.safeParse(formData);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0]?.message || 'Input formulir tidak valid' };
  }

  const { pageId, title, description, briefLink, divisionId, publicationMedia, deadline } =
    validation.data;

  // Try auto-fetching Google Doc title if not explicitly provided
  let fetchedTitle = formData.briefTitle;
  if (!fetchedTitle) {
    fetchedTitle = (await fetchGoogleDocTitle(briefLink)) || `${title.trim()} - Brief Kreatif`;
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const div = store.divisions.find((d) => d.id === divisionId);
    const req = store.users.find((u) => u.id === formData.requestorId) || store.currentUser;
    const newJob: Job = {
      id: `mock-job-${Date.now()}`,
      pageId,
      title: title.trim(),
      description: description?.trim() || null,
      briefLink: briefLink.trim(),
      briefTitle: fetchedTitle,
      divisionId,
      divisionName: div?.name || 'Umum',
      publicationMedia: publicationMedia.trim(),
      deadline: new Date(deadline).toISOString(),
      status: 'in_queue',
      kanbanOrder: 0,
      requestorId: req.id,
      requestor: req,
      designerId: null,
      designer: null,
      designerIds: [],
      designers: [],
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.jobs.unshift(newJob);
    return { success: true, job: newJob };
  }

  if (!db) {
    return { success: false, error: 'Database belum terhubung' };
  }

  const users = await getAllUsersAction();
  const divisions = await getDivisionsAction();
  const userMap = new Map(users.map((u) => [u.id, u]));
  const divMap = new Map(divisions.map((d) => [d.id, d.name]));

  const requestor = userMap.get(formData.requestorId) || users[0];
  if (!requestor) {
    return { success: false, error: 'User requestor tidak valid' };
  }

  const newJobId = crypto.randomUUID();

  try {
    const [inserted] = await db
      .insert(schema.jobs)
      .values({
        id: newJobId,
        pageId,
        title: title.trim(),
        description: description?.trim() || null,
        briefLink: briefLink.trim(),
        briefTitle: fetchedTitle,
        divisionId,
        publicationMedia: publicationMedia.trim(),
        deadline: new Date(deadline),
        status: 'in_queue',
        kanbanOrder: 0,
        requestorId: requestor.id,
        isArchived: false,
      })
      .returning();

    await db.insert(schema.jobActivity).values({
      jobId: inserted.id,
      actorId: requestor.id,
      toStatus: 'in_queue',
      note: description?.trim() || 'Request job baru dibuat',
    });

    const newJob: Job = {
      id: inserted.id,
      pageId: inserted.pageId,
      title: inserted.title,
      description: inserted.description,
      briefLink: inserted.briefLink,
      briefTitle: inserted.briefTitle,
      divisionId: inserted.divisionId,
      divisionName: divMap.get(inserted.divisionId) || 'Umum',
      publicationMedia: inserted.publicationMedia,
      deadline: inserted.deadline.toISOString(),
      status: inserted.status,
      kanbanOrder: inserted.kanbanOrder,
      requestorId: inserted.requestorId,
      requestor,
      designerId: null,
      designer: null,
      designerIds: [],
      designers: [],
      isArchived: false,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };

    // 1. Dispatch Email to Admins
    const adminEmails = users.filter((u) => u.role === 'admin').map((u) => u.email);
    if (adminEmails.length > 0) {
      await sendJobStatusEmail({
        jobTitle: newJob.title,
        briefLink: newJob.briefLink,
        fromStatus: null,
        toStatus: 'in_queue',
        actorName: requestor.fullName,
        actorEmail: requestor.email,
        recipients: adminEmails,
        note: newJob.description || undefined,
      });
    }

    // 2. Dispatch In-App Notification to Admins
    const adminUsers = users.filter((u) => u.role === 'admin');
    for (const admin of adminUsers) {
      await createNotificationAction({
        userId: admin.id,
        title: 'Request Job Baru',
        message: `${requestor.fullName} mengajukan job: "${newJob.title}"`,
        type: 'job_created',
        jobId: newJob.id,

        jobTitle: newJob.title,
        actorId: requestor.id,
        actorName: requestor.fullName,
        actorAvatar: requestor.avatarUrl,
        note: newJob.description || undefined,
      });
    }

    revalidatePath('/');
    return { success: true, job: newJob };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Kesalahan database';
    return { success: false, error: msg };
  }
}

export async function moveJobAction(
  jobId: string,
  toStatus: JobStatus,
  actor: Profile,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.jobs.find((j) => j.id === jobId);
    if (target) {
      target.status = toStatus;
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Job tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  const [currentRecord] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (!currentRecord) {
    return { success: false, error: 'Job tidak ditemukan' };
  }

  const fromStatus = currentRecord.status;

  // Strict role check for status transitions
  if (actor.role !== 'admin') {
    if (actor.role === 'designer') {
      if (currentRecord.designerId !== actor.id) {
        return { success: false, error: 'Hanya desainer yang ditugaskan yang dapat memperbarui status job ini.' };
      }
      if (fromStatus === 'in_queue' && toStatus !== 'wip') {
        return { success: false, error: 'Desainer hanya dapat memindahkan job dari Antrian ke Sedang Dikerjakan.' };
      }
      if (fromStatus === 'wip' && toStatus !== 'revisions') {
        return { success: false, error: 'Desainer hanya dapat mengirim job ke Revisi untuk ditinjau Requester.' };
      }
    } else if (actor.role === 'requestor') {
      if (currentRecord.requestorId !== actor.id) {
        return { success: false, error: 'Anda hanya dapat meninjau request job Anda sendiri.' };
      }
      if (fromStatus !== 'revisions' || (toStatus !== 'wip' && toStatus !== 'done')) {
        return { success: false, error: 'Requester hanya dapat menerima pekerjaan final atau meminta revisi.' };
      }
    }
  }

  try {
    await db
      .update(schema.jobs)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));

    await db.insert(schema.jobActivity).values({
      jobId,
      actorId: actor.id,
      fromStatus,
      toStatus,
      note: note || null,
    });
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal memperbarui status job' };
  }

  const users = await getAllUsersAction();
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Compile recipients for email notification
  const recipients: string[] = [];
  const requestor = userMap.get(currentRecord.requestorId);
  const designer = currentRecord.designerId ? userMap.get(currentRecord.designerId) : null;
  const adminEmails = users.filter((u) => u.role === 'admin').map((u) => u.email);

  if (toStatus === 'revisions' && requestor) {
    recipients.push(requestor.email);
  } else if (toStatus === 'wip' && designer) {
    recipients.push(designer.email);
  } else if (toStatus === 'done') {
    if (requestor) recipients.push(requestor.email);
    if (designer) recipients.push(designer.email);
    recipients.push(...adminEmails);
  }

  await sendJobStatusEmail({
    jobTitle: currentRecord.title,
    briefLink: currentRecord.briefLink,
    fromStatus,
    toStatus,
    actorName: actor.fullName,
    actorEmail: actor.email,
    recipients,
    note,
  });

  // Dispatch in-app notifications
  if (toStatus === 'revisions' && requestor && requestor.id !== actor.id) {
    await createNotificationAction({
      userId: requestor.id,
      title: 'Draft Siap Ditinjau',
      message: `${actor.fullName} telah mengunggah draft untuk "${currentRecord.title}"`,
      type: 'job_status_changed',
      jobId: currentRecord.id,
      jobTitle: currentRecord.title,
      actorId: actor.id,
      actorName: actor.fullName,
      actorAvatar: actor.avatarUrl,
      note: note || undefined,
    });
  } else if (toStatus === 'wip' && designer && designer.id !== actor.id) {
    await createNotificationAction({
      userId: designer.id,
      title: 'Revisi Diminta',
      message: `${actor.fullName} meminta revisi untuk "${currentRecord.title}"`,
      type: 'job_revisions',
      jobId: currentRecord.id,
      jobTitle: currentRecord.title,
      actorId: actor.id,
      actorName: actor.fullName,
      actorAvatar: actor.avatarUrl,
      note: note || undefined,
    });
  } else if (toStatus === 'done') {
    const notifyUserIds = new Set<string>();
    if (requestor && requestor.id !== actor.id) notifyUserIds.add(requestor.id);
    if (designer && designer.id !== actor.id) notifyUserIds.add(designer.id);
    users.filter((u) => u.role === 'admin' && u.id !== actor.id).forEach((a) => notifyUserIds.add(a.id));

    for (const uid of notifyUserIds) {
      await createNotificationAction({
        userId: uid,
        title: 'Job Selesai (Done)',
        message: `${actor.fullName} menandai "${currentRecord.title}" sebagai selesai`,
        type: 'job_completed',
        jobId: currentRecord.id,
        jobTitle: currentRecord.title,
        actorId: actor.id,
        actorName: actor.fullName,
        actorAvatar: actor.avatarUrl,
        note: note || undefined,
      });
    }
  }

  revalidatePath('/');
  return { success: true };
}

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

  const users = await getAllUsersAction();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const primaryDesignerId = designerIds[0] || null;
  const designersList = designerIds.map((id) => userMap.get(id)).filter(Boolean) as Profile[];
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

  const requestor = userMap.get(currentJob.requestorId);
  const recipients: string[] = designersList.map((d) => d.email);
  if (requestor) recipients.push(requestor.email);

  if (designersList.length > 0) {
    const designerNames = designersList.map((d) => d.fullName).join(', ');
    await sendJobStatusEmail({
      jobTitle: currentJob.title,
      briefLink: currentJob.briefLink,
      fromStatus: currentJob.status,
      toStatus: newStatus,
      actorName: actor.fullName,
      actorEmail: actor.email,
      recipients,
      note: `Ditugaskan kepada editor: ${designerNames}`,
    });

    for (const d of designersList) {
      if (d.id !== actor.id) {
        await createNotificationAction({
          userId: d.id,
          title: 'Penugasan Job Baru',
          message: `${actor.fullName} menugaskan Anda ke job: "${currentJob.title}"`,
          type: 'job_assigned',
          jobId: currentJob.id,
          jobTitle: currentJob.title,
          actorId: actor.id,
          actorName: actor.fullName,
          actorAvatar: actor.avatarUrl,
        });
      }
    }
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

export async function archiveJobAction(
  jobId: string,
  actor: Profile
): Promise<{ success: boolean; error?: string }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.jobs.find((j) => j.id === jobId);
    if (target) {
      target.isArchived = true;
      target.archivedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Job tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const [currentJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (!currentJob) return { success: false, error: 'Job tidak ditemukan' };

    await db
      .update(schema.jobs)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));

    await db.insert(schema.jobActivity).values({
      jobId,
      actorId: actor.id,
      fromStatus: currentJob.status,
      toStatus: currentJob.status,
      note: 'Diarsipkan ke tabel arsip platform',
    });

    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal mengarsipkan job' };
  }
}

export async function unarchiveJobAction(
  jobId: string,
  actor: Profile
): Promise<{ success: boolean; error?: string }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.jobs.find((j) => j.id === jobId);
    if (target) {
      target.isArchived = false;
      target.archivedAt = null;
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Job tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const [currentJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (!currentJob) return { success: false, error: 'Job tidak ditemukan' };

    await db
      .update(schema.jobs)
      .set({
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));

    await db.insert(schema.jobActivity).values({
      jobId,
      actorId: actor.id,
      fromStatus: currentJob.status,
      toStatus: currentJob.status,
      note: 'Dipulihkan dari arsip kembali ke papan Kanban aktif',
    });

    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal memulihkan job' };
  }
}

export async function archiveAllDoneJobsAction(
  pageId: string,
  actor: Profile
): Promise<{ success: boolean; archivedCount?: number; error?: string }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    let count = 0;
    store.jobs.forEach((j) => {
      if (j.pageId === pageId && j.status === 'done' && !j.isArchived) {
        j.isArchived = true;
        j.archivedAt = new Date().toISOString();
        j.updatedAt = new Date().toISOString();
        count++;
      }
    });
    return { success: true, archivedCount: count };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const doneJobs = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.pageId, pageId),
          eq(schema.jobs.status, 'done'),
          eq(schema.jobs.isArchived, false)
        )
      );

    if (doneJobs.length === 0) {
      return { success: true, archivedCount: 0 };
    }

    await db
      .update(schema.jobs)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.pageId, pageId),
          eq(schema.jobs.status, 'done'),
          eq(schema.jobs.isArchived, false)
        )
      );

    revalidatePath('/');
    return { success: true, archivedCount: doneJobs.length };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal mengarsipkan job selesai' };
  }
}

export const getDesignerSuggestionsAction = getDesignerWorkloadsAction;

