'use server';

import { db, schema } from '@/lib/db';
import { eq, and, or, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Job, JobStatus, Profile } from '@/types';
import { jobFormSchema } from '@/lib/validations';
import { sendJobStatusEmail } from '@/lib/email';
import { fetchGoogleDocTitle } from '@/lib/gdocs';
import { createNotificationAction } from '../notifications';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { formatDate } from '@/lib/utils';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { deleteDeliverableObject } from '@/lib/r2';

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

  const authenticatedUser = await getAuthenticatedUser();
  if (!authenticatedUser) {
    return { success: false, error: 'Akses ditolak: Anda harus login terlebih dahulu.' };
  }

  let requestor: Profile = authenticatedUser;
  if (authenticatedUser.role === 'admin' && formData.requestorId && formData.requestorId !== authenticatedUser.id) {
    const [found] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, formData.requestorId));
    if (found) {
      requestor = {
        ...found,
        createdAt: found.createdAt.toISOString(),
        updatedAt: found.updatedAt.toISOString(),
      };
    }
  }

  const [divRow] = await db
    .select({ name: schema.divisions.name })
    .from(schema.divisions)
    .where(eq(schema.divisions.id, divisionId));
  const divisionName = divRow?.name || 'Umum';

  const newJobId = crypto.randomUUID();

  try {
    const inserted = await db.transaction(async (tx) => {
      const [jobRow] = await tx
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

      await tx.insert(schema.jobActivity).values({
        jobId: jobRow.id,
        actorId: requestor.id,
        toStatus: 'in_queue',
        note: description?.trim() || 'Request job baru dibuat',
      });

      return jobRow;
    });

    const newJob: Job = {
      id: inserted.id,
      pageId: inserted.pageId,
      title: inserted.title,
      description: inserted.description,
      briefLink: inserted.briefLink,
      briefTitle: inserted.briefTitle,
      divisionId: inserted.divisionId,
      divisionName,
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

    // Query admins only for notifications
    const adminUsers = await db
      .select({ id: schema.profiles.id, email: schema.profiles.email })
      .from(schema.profiles)
      .where(eq(schema.profiles.role, 'admin'));

    // 1. Dispatch Email to Admins (non-blocking background task)
    const adminEmails = adminUsers.map((u) => u.email);
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
  actor?: Profile | null,
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

  const authenticatedActor = await getAuthenticatedUser();
  if (!authenticatedActor) {
    return { success: false, error: 'Akses ditolak: Anda harus login terlebih dahulu.' };
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
  if (authenticatedActor.role !== 'admin') {
    if (authenticatedActor.role === 'designer') {
      if (currentRecord.designerId !== authenticatedActor.id) {
        return { success: false, error: 'Hanya desainer yang ditugaskan yang dapat memperbarui status job ini.' };
      }
      if (fromStatus === 'in_queue' && toStatus !== 'wip') {
        return { success: false, error: 'Desainer hanya dapat memindahkan job dari Antrian ke Sedang Dikerjakan.' };
      }
      if (fromStatus === 'wip' && toStatus !== 'revisions') {
        return { success: false, error: 'Desainer hanya dapat mengirim job ke Revisi untuk ditinjau Requester.' };
      }
    } else if (authenticatedActor.role === 'requestor') {
      if (currentRecord.requestorId !== authenticatedActor.id) {
        return { success: false, error: 'Anda hanya dapat meninjau request job Anda sendiri.' };
      }
      if (fromStatus !== 'revisions' || (toStatus !== 'wip' && toStatus !== 'done')) {
        return { success: false, error: 'Requester hanya dapat menerima pekerjaan final atau meminta revisi.' };
      }
    }
  }

  try {
    await db.transaction(async (tx) => {
      // Optimistic concurrency check: ensure status has not changed concurrently
      const [updated] = await tx
        .update(schema.jobs)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(
          and(
            eq(schema.jobs.id, jobId),
            eq(schema.jobs.status, fromStatus)
          )
        )
        .returning({ id: schema.jobs.id });

      if (!updated) {
        throw new Error('Status job telah diperbarui oleh pengguna lain. Harap segarkan.');
      }

      await tx.insert(schema.jobActivity).values({
        jobId,
        actorId: authenticatedActor.id,
        fromStatus,
        toStatus,
        note: note || null,
      });
    });
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal memperbarui status job' };
  }

  const relevantIds = [currentRecord.requestorId, currentRecord.designerId].filter(Boolean) as string[];
  const users = await db
    .select({
      id: schema.profiles.id,
      email: schema.profiles.email,
      role: schema.profiles.role,
      fullName: schema.profiles.fullName,
    })
    .from(schema.profiles)
    .where(
      relevantIds.length > 0
        ? or(inArray(schema.profiles.id, relevantIds), eq(schema.profiles.role, 'admin'))
        : eq(schema.profiles.role, 'admin')
    );
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
    actorName: authenticatedActor.fullName,
    actorEmail: authenticatedActor.email,
    recipients,
    note,
  }).catch((err) => console.error('Failed to send status email:', err));

  // Dispatch in-app notifications asynchronously in background
  if (toStatus === 'revisions' && requestor && requestor.id !== authenticatedActor.id) {
    createNotificationAction({
      userId: requestor.id,
      title: 'Draft Siap Ditinjau',
      message: `${authenticatedActor.fullName} telah mengunggah draft untuk "${currentRecord.title}"`,
      type: 'job_status_changed',
      jobId: currentRecord.id,
      jobTitle: currentRecord.title,
      actorId: authenticatedActor.id,
      actorName: authenticatedActor.fullName,
      actorAvatar: authenticatedActor.avatarUrl,
      note: note || undefined,
    }).catch((err) => console.error('Failed to dispatch notification:', err));
  } else if (toStatus === 'wip' && designer && designer.id !== authenticatedActor.id) {
    const isRevision = fromStatus === 'revisions';
    createNotificationAction({
      userId: designer.id,
      title: isRevision ? 'Revisi Diminta' : 'Pekerjaan Dimulai',
      message: isRevision
        ? `${authenticatedActor.fullName} meminta revisi untuk "${currentRecord.title}"`
        : `${authenticatedActor.fullName} memulai pengerjaan untuk "${currentRecord.title}"`,
      type: isRevision ? 'job_revisions' : 'job_status_changed',
      jobId: currentRecord.id,
      jobTitle: currentRecord.title,
      actorId: authenticatedActor.id,
      actorName: authenticatedActor.fullName,
      actorAvatar: authenticatedActor.avatarUrl,
      note: note || undefined,
    }).catch((err) => console.error('Failed to dispatch notification:', err));
  } else if (toStatus === 'done') {
    const notifyUserIds = new Set<string>();
    if (requestor && requestor.id !== authenticatedActor.id) notifyUserIds.add(requestor.id);
    if (designer && designer.id !== authenticatedActor.id) notifyUserIds.add(designer.id);
    users.filter((u) => u.role === 'admin' && u.id !== authenticatedActor.id).forEach((a) => notifyUserIds.add(a.id));

    Promise.all(
      Array.from(notifyUserIds).map((uid) =>
        createNotificationAction({
          userId: uid,
          title: 'Job Selesai (Done)',
          message: `${authenticatedActor.fullName} menandai "${currentRecord.title}" sebagai selesai`,
          type: 'job_completed',
          jobId: currentRecord.id,
          jobTitle: currentRecord.title,
          actorId: authenticatedActor.id,
          actorName: authenticatedActor.fullName,
          actorAvatar: authenticatedActor.avatarUrl,
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
  actor?: Profile | null
): Promise<{ success: boolean; error?: string }> {
  const sessionUser = await getAuthenticatedUser();
  if (!sessionUser || sessionUser.role !== 'admin') {
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
    const newDeadlineDate = new Date(deadline);
    if (isNaN(newDeadlineDate.getTime())) {
      return { success: false, error: 'Format tanggal deadline tidak valid' };
    }

    await db.transaction(async (tx) => {
      const [currentJob] = await tx.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).for('update');
      if (!currentJob) throw new Error('Job tidak ditemukan');

      await tx
        .update(schema.jobs)
        .set({
          deadline: newDeadlineDate,
          updatedAt: new Date(),
        })
        .where(eq(schema.jobs.id, jobId));

      await tx.insert(schema.jobActivity).values({
        jobId,
        actorId: sessionUser.id,
        fromStatus: currentJob.status,
        toStatus: currentJob.status,
        note: `Deadline diubah ke ${formatDate(newDeadlineDate)}`,
      });
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

export async function deleteJobAction(
  jobId: string,
  actor: Profile
): Promise<{ success: boolean; error?: string }> {
  // Session authentication & authorization check
  const authenticatedUser = await getAuthenticatedUser(false);
  if (!authenticatedUser || authenticatedUser.role !== 'admin' || actor.role !== 'admin') {
    return { success: false, error: 'Hanya admin yang berhak menghapus job' };
  }

  if (isMockEnabled()) {
    const store = getMockStore();
    const index = store.jobs.findIndex((j) => j.id === jobId);
    if (index === -1) {
      return { success: false, error: 'Job tidak ditemukan' };
    }
    store.jobs.splice(index, 1);
    return { success: true };
  }

  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    // 1. Ambil deliverable storage keys & preview keys sebelum cascade delete di DB
    const deliverables = await db
      .select({
        storageKey: schema.deliverables.storageKey,
        previewStorageKey: schema.deliverables.previewStorageKey,
      })
      .from(schema.deliverables)
      .where(eq(schema.deliverables.jobId, jobId));

    // 2. ACID Transactional delete
    await db.transaction(async (tx) => {
      const [currentJob] = await tx
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId));

      if (!currentJob) {
        throw new Error('Job tidak ditemukan');
      }

      await tx.delete(schema.jobs).where(eq(schema.jobs.id, jobId));
    });

    // 3. Bersihkan file R2 storage setelah transaksi database committed
    if (deliverables.length > 0) {
      const deletePromises = deliverables.flatMap((d) => [
        deleteDeliverableObject(d.storageKey),
        d.previewStorageKey ? deleteDeliverableObject(d.previewStorageKey) : Promise.resolve(),
      ]);
      await Promise.allSettled(deletePromises);
    }

    revalidatePath('/');
    return { success: true };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Gagal menghapus job',
    };
  }
}

