'use server';

import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Job, JobStatus, Profile } from '@/types';
import { jobFormSchema } from '@/lib/validations';
import { sendJobStatusEmail } from '@/lib/email';
import { fetchGoogleDocTitle } from '@/lib/gdocs';
import { getAllUsersAction } from '../auth';
import { getDivisionsAction } from '../divisions';
import { createNotificationAction } from '../notifications';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { formatDate } from '@/lib/utils';

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

    // 1. Dispatch Email to Admins (non-blocking background task)
    const adminEmails = users.filter((u) => u.role === 'admin').map((u) => u.email);
    if (adminEmails.length > 0) {
      sendJobStatusEmail({
        jobTitle: newJob.title,
        briefLink: newJob.briefLink,
        fromStatus: null,
        toStatus: 'in_queue',
        actorName: requestor.fullName,
        actorEmail: requestor.email,
        recipients: adminEmails,
        note: newJob.description || undefined,
      }).catch((err) => console.error('Failed to send new job email:', err));
    }

    // 2. Dispatch In-App Notification to Admins in parallel
    const adminUsers = users.filter((u) => u.role === 'admin');
    Promise.all(
      adminUsers.map((admin) =>
        createNotificationAction({
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
        })
      )
    ).catch((err) => console.error('Failed to dispatch admin notifications:', err));

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

  // Dispatch email in background (non-blocking)
  sendJobStatusEmail({
    jobTitle: currentRecord.title,
    briefLink: currentRecord.briefLink,
    fromStatus,
    toStatus,
    actorName: actor.fullName,
    actorEmail: actor.email,
    recipients,
    note,
  }).catch((err) => console.error('Failed to send status email:', err));

  // Dispatch in-app notifications asynchronously in background
  if (toStatus === 'revisions' && requestor && requestor.id !== actor.id) {
    createNotificationAction({
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
    }).catch((err) => console.error('Failed to dispatch notification:', err));
  } else if (toStatus === 'wip' && designer && designer.id !== actor.id) {
    createNotificationAction({
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
    }).catch((err) => console.error('Failed to dispatch notification:', err));
  } else if (toStatus === 'done') {
    const notifyUserIds = new Set<string>();
    if (requestor && requestor.id !== actor.id) notifyUserIds.add(requestor.id);
    if (designer && designer.id !== actor.id) notifyUserIds.add(designer.id);
    users.filter((u) => u.role === 'admin' && u.id !== actor.id).forEach((a) => notifyUserIds.add(a.id));

    Promise.all(
      Array.from(notifyUserIds).map((uid) =>
        createNotificationAction({
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
        })
      )
    ).catch((err) => console.error('Failed to dispatch done notifications:', err));
  }

  revalidatePath('/');
  return { success: true };
}

export async function updateJobDeadlineAction(
  jobId: string,
  deadline: string,
  actor: Profile
): Promise<{ success: boolean; error?: string }> {
  if (actor.role !== 'admin') {
    return { success: false, error: 'Hanya admin yang dapat mengubah deadline' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.jobs.find((j) => j.id === jobId);
    if (target) {
      target.deadline = new Date(deadline).toISOString();
      target.updatedAt = new Date().toISOString();
      return { success: true };
    }
    return { success: false, error: 'Job tidak ditemukan' };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const [currentJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    if (!currentJob) return { success: false, error: 'Job tidak ditemukan' };

    const newDeadlineDate = new Date(deadline);
    if (isNaN(newDeadlineDate.getTime())) {
      return { success: false, error: 'Format tanggal deadline tidak valid' };
    }

    await db
      .update(schema.jobs)
      .set({
        deadline: newDeadlineDate,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));

    await db.insert(schema.jobActivity).values({
      jobId,
      actorId: actor.id,
      fromStatus: currentJob.status,
      toStatus: currentJob.status,
      note: `Deadline diubah ke ${formatDate(newDeadlineDate)}`,
    });

    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Gagal memperbarui deadline job',
    };
  }
}

