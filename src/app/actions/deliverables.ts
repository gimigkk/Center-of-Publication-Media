'use server';

import { randomUUID } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { db, schema } from '@/lib/db';
import {
  createDeliverableDownloadUrl,
  createDeliverableKey,
  createDeliverablePreviewKey,
  createDeliverablePreviewUploadUrl,
  createDeliverablePreviewUrl,
  createDeliverableUploadUrl,
  deleteDeliverableObject,
  inspectDeliverable,
  isDeliverableKeyForJob,
} from '@/lib/r2';
import { Deliverable } from '@/types';
import { isMockEnabled } from '@/lib/mock-store';

const MAX_DELIVERABLE_SIZE = 15 * 1024 * 1024;
const uploadInputSchema = z.object({
  filename: z.string().trim().min(1).max(255).regex(/\.(jpe?g)$/i, 'File harus berformat JPG atau JPEG'),
  mimeType: z.literal('image/jpeg'),
  sizeBytes: z.number().int().positive().max(MAX_DELIVERABLE_SIZE),
});

type ActionResult<T = undefined> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Reuse the same signed URL so repeat opens do not spend time signing every preview again.
const getCachedDeliverablePreviewUrl = unstable_cache(
  async (storageKey: string) => createDeliverablePreviewUrl(storageKey),
  ['deliverable-preview-url'],
  { revalidate: 240 }
);

type DeliverableReadTimings = {
  authenticationMs?: number;
  authorizationMs?: number;
  deliverablesQueryMs?: number;
  previewUrlsMs?: number;
};

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function logDeliverableReadTimings(timings: DeliverableReadTimings, startedAt: number, count?: number) {
  console.info('[deliverables] read timings', {
    ...timings,
    totalMs: elapsedMs(startedAt),
    ...(count === undefined ? {} : { count }),
  });
}

function unavailableInMock<T>(): ActionResult<T> {
  return { success: false, error: 'Upload deliverable tersedia setelah koneksi penyimpanan aktif' };
}

async function getAuthorizedJob(jobId: string, mode: 'read' | 'upload', timings?: DeliverableReadTimings) {
  const authenticationStartedAt = performance.now();
  const user = await getAuthenticatedUser(false);
  if (timings) timings.authenticationMs = elapsedMs(authenticationStartedAt);
  if (!user) return { error: 'Sesi pengguna tidak valid' } as const;
  if (!db) return { error: 'Database belum terhubung' } as const;
  const database = db;

  const authorizationStartedAt = performance.now();
  const [jobs, assignments] = await Promise.all([
    database
      .select({
        id: schema.jobs.id,
        requestorId: schema.jobs.requestorId,
        designerId: schema.jobs.designerId,
        status: schema.jobs.status,
        isArchived: schema.jobs.isArchived,
        title: schema.jobs.title,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId)),
    user.role === 'designer'
      ? database
          .select({ id: schema.jobDesigners.id })
          .from(schema.jobDesigners)
          .where(and(eq(schema.jobDesigners.jobId, jobId), eq(schema.jobDesigners.designerId, user.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (timings) timings.authorizationMs = elapsedMs(authorizationStartedAt);

  const [job] = jobs;
  if (!job) return { error: 'Job tidak ditemukan' } as const;

  const isAssignedDesigner =
    user.role === 'designer' &&
    (job.designerId === user.id || assignments.length > 0);
  const canRead = user.role === 'admin' || user.id === job.requestorId || isAssignedDesigner;
  const canUpload =
    (user.role === 'admin' || isAssignedDesigner) &&
    !job.isArchived &&
    (job.status === 'wip' || job.status === 'revisions');

  if (mode === 'read' && !canRead) return { error: 'Anda tidak memiliki akses ke deliverable ini' } as const;
  if (mode === 'upload' && !canUpload) {
    return { error: 'Hanya editor yang ditugaskan atau admin yang dapat mengunggah JPG saat job aktif' } as const;
  }

  return { user, job } as const;
}

function toDeliverable(record: typeof schema.deliverables.$inferSelect, uploaderName: string | null, previewUrl: string): Deliverable {
  return {
    id: record.id,
    jobId: record.jobId,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    uploadedBy: record.uploadedBy,
    uploaderName,
    createdAt: record.createdAt.toISOString(),
    registeredAt: (record.registeredAt || record.createdAt).toISOString(),
    previewUrl,
  };
}

export async function getDeliverablesAction(jobId: string): Promise<ActionResult<Deliverable[]>> {
  if (isMockEnabled()) {
    return {
      success: true,
      data: [
        {
          id: 'mock-deliv-1',
          jobId,
          originalFilename: 'desain-kucing-gemoy-final.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 2450000,
          uploadedBy: 'mock-user-admin-1',
          uploaderName: 'Gimigkk',
          createdAt: '2026-08-29T11:00:00.000Z',
          registeredAt: '2026-08-29T11:00:00.000Z',
          previewUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=900&auto=format&fit=crop&q=80',
        },
        {
          id: 'mock-deliv-2',
          jobId,
          originalFilename: 'cat-creative-artwork-v2.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 4120000,
          uploadedBy: 'mock-user-des-1',
          uploaderName: 'Sarah Amanda',
          createdAt: '2026-08-29T12:30:00.000Z',
          registeredAt: '2026-08-29T12:30:00.000Z',
          previewUrl: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=900&auto=format&fit=crop&q=80',
        },
      ],
    };
  }

  const startedAt = performance.now();
  const timings: DeliverableReadTimings = {};
  const auth = await getAuthorizedJob(jobId, 'read', timings);
  if ('error' in auth) return { success: false, error: auth.error };
  const database = db;
  if (!database) return { success: false, error: 'Database belum terhubung' };

  try {
    const queryStartedAt = performance.now();
    const records = await database
      .select({ deliverable: schema.deliverables, uploaderName: schema.profiles.fullName })
      .from(schema.deliverables)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.deliverables.uploadedBy))
      .where(and(eq(schema.deliverables.jobId, jobId), eq(schema.deliverables.status, 'ready')))
      .orderBy(desc(schema.deliverables.registeredAt), desc(schema.deliverables.createdAt));
    timings.deliverablesQueryMs = elapsedMs(queryStartedAt);

    const previewStartedAt = performance.now();
    const data = await Promise.all(
      records.map(async ({ deliverable, uploaderName }) =>
        toDeliverable(
          deliverable,
          uploaderName,
          await getCachedDeliverablePreviewUrl(deliverable.previewStorageKey || deliverable.storageKey)
        )
      )
    );
    timings.previewUrlsMs = elapsedMs(previewStartedAt);
    logDeliverableReadTimings(timings, startedAt, data.length);
    return { success: true, data };
  } catch (error) {
    logDeliverableReadTimings(timings, startedAt);
    console.error('Failed to get deliverables:', error);
    return { success: false, error: 'Gagal memuat deliverable' };
  }
}

export async function initiateDeliverableUploadAction(
  jobId: string,
  input: { filename: string; mimeType: string; sizeBytes: number }
): Promise<ActionResult<{ uploadId: string; uploadUrl: string; previewUploadUrl: string; expiresAt: string }>> {
  if (isMockEnabled()) return unavailableInMock();

  const parsed = uploadInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Pilih file JPG maksimal 15 MB' };

  const auth = await getAuthorizedJob(jobId, 'upload');
  if ('error' in auth) return { success: false, error: auth.error };
  const database = db;
  if (!database) return { success: false, error: 'Database belum terhubung' };

  const uploadId = randomUUID();
  const storageKey = createDeliverableKey(jobId, uploadId);
  try {
    await database.insert(schema.deliverables).values({
      id: uploadId,
      jobId,
      storageKey,
      previewStorageKey: createDeliverablePreviewKey(storageKey),
      originalFilename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      uploadedBy: auth.user.id,
      status: 'pending',
    });
    const [uploadUrl, previewUploadUrl] = await Promise.all([
      createDeliverableUploadUrl(storageKey),
      createDeliverablePreviewUploadUrl(storageKey),
    ]);
    return {
      success: true,
      data: {
        uploadId,
        uploadUrl,
        previewUploadUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    };
  } catch (error) {
    console.error('Failed to initiate deliverable upload:', error);
    try {
      await database.delete(schema.deliverables).where(eq(schema.deliverables.id, uploadId));
    } catch (cleanupError) {
      console.error('Failed to clean up initiated deliverable:', cleanupError);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Gagal menyiapkan upload' };
  }
}

export async function completeDeliverableUploadAction(uploadId: string): Promise<ActionResult<Deliverable>> {
  if (isMockEnabled()) return unavailableInMock();
  if (!db) return { success: false, error: 'Database belum terhubung' };

  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: 'Sesi pengguna tidak valid' };

  try {
    const [record] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, uploadId));
    if (!record) return { success: false, error: 'Upload tidak ditemukan' };
    if (record.status === 'ready') {
      const auth = await getAuthorizedJob(record.jobId, 'read');
      if ('error' in auth) return { success: false, error: auth.error };
      const [uploader] = await db.select({ fullName: schema.profiles.fullName }).from(schema.profiles).where(eq(schema.profiles.id, record.uploadedBy));
      return {
        success: true,
        data: toDeliverable(
          record,
          uploader?.fullName || null,
          await getCachedDeliverablePreviewUrl(record.previewStorageKey || record.storageKey)
        ),
      };
    }

    const auth = await getAuthorizedJob(record.jobId, 'upload');
    if ('error' in auth || record.uploadedBy !== user.id) {
      return { success: false, error: 'Upload ini tidak dapat diselesaikan oleh pengguna ini' };
    }
    if (!isDeliverableKeyForJob(record.storageKey, record.jobId)) {
      return { success: false, error: 'Kunci penyimpanan tidak valid' };
    }

    const inspected = await inspectDeliverable(record.storageKey);
    if (inspected.sizeBytes <= 0 || inspected.sizeBytes > MAX_DELIVERABLE_SIZE || inspected.contentType !== 'image/jpeg' || !inspected.isJpeg) {
      return { success: false, error: 'Objek R2 bukan JPG valid atau melebihi batas 15 MB' };
    }

    const registeredAt = new Date();
    const updated = await db.transaction(async (tx) => {
      const [readyRecord] = await tx
        .update(schema.deliverables)
        .set({
          status: 'ready',
          sizeBytes: inspected.sizeBytes,
          mimeType: 'image/jpeg',
          previewStorageKey: createDeliverablePreviewKey(record.storageKey),
          registeredAt,
        })
        .where(and(eq(schema.deliverables.id, uploadId), eq(schema.deliverables.status, 'pending')))
        .returning();
      if (!readyRecord) return null;

      await tx.insert(schema.jobActivity).values({
        jobId: record.jobId,
        actorId: user.id,
        fromStatus: auth.job.status,
        toStatus: auth.job.status,
        note: `Hasil desain ${record.originalFilename} diunggah`,
      });

      await tx.insert(schema.notifications).values({
        userId: auth.job.requestorId,
        title: 'Hasil Desain Baru',
        message: `${user.fullName} mengunggah hasil desain "${record.originalFilename}" untuk "${auth.job.title}"`,
        type: 'deliverable_uploaded',
        jobId: auth.job.id,
        jobTitle: auth.job.title,
        actorId: user.id,
        actorName: user.fullName,
        actorAvatar: user.avatarUrl,
        note: `Deliverable ${record.originalFilename} siap ditinjau`,
        isRead: false,
      });
      return readyRecord;
    });

    if (!updated) {
      const [readyRecord] = await db
        .select()
        .from(schema.deliverables)
        .where(and(eq(schema.deliverables.id, uploadId), eq(schema.deliverables.status, 'ready')));
      if (!readyRecord) return { success: false, error: 'Upload sedang diproses, silakan coba lagi' };
      const [uploader] = await db
        .select({ fullName: schema.profiles.fullName })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, readyRecord.uploadedBy));
      return {
        success: true,
        data: toDeliverable(
          readyRecord,
          uploader?.fullName || null,
          await getCachedDeliverablePreviewUrl(readyRecord.previewStorageKey || readyRecord.storageKey)
        ),
      };
    }

    revalidatePath('/');
    return {
      success: true,
      data: toDeliverable(
        updated,
        user.fullName,
        await getCachedDeliverablePreviewUrl(updated.previewStorageKey || updated.storageKey)
      ),
    };
  } catch (error) {
    console.error('Failed to complete deliverable upload:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Gagal menyelesaikan upload' };
  }
}

export async function abortDeliverableUploadAction(uploadId: string): Promise<ActionResult> {
  if (isMockEnabled()) return { success: true };

  const user = await getAuthenticatedUser();
  if (!user || !db) return { success: false, error: 'Sesi pengguna tidak valid' };

  try {
    const [record] = await db
      .select()
      .from(schema.deliverables)
      .where(eq(schema.deliverables.id, uploadId));
    if (!record || record.status === 'ready') return { success: true };
    if (record.uploadedBy !== user.id) return { success: false, error: 'Upload ini tidak dapat dibatalkan oleh pengguna ini' };

    const auth = await getAuthorizedJob(record.jobId, 'upload');
    if ('error' in auth) return { success: false, error: auth.error };

    const [deleted] = await db
      .delete(schema.deliverables)
      .where(
        and(
          eq(schema.deliverables.id, uploadId),
          eq(schema.deliverables.status, 'pending'),
          eq(schema.deliverables.uploadedBy, user.id)
        )
      )
      .returning({ storageKey: schema.deliverables.storageKey });
    if (!deleted) return { success: true };

    try {
      await deleteDeliverableObject(deleted.storageKey);
    } catch (cleanupError) {
      console.error('Failed to delete aborted deliverable objects:', cleanupError);
    }
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to abort deliverable upload:', error);
    return { success: false, error: 'Gagal membatalkan upload' };
  }
}

export async function getDeliverableDownloadUrlAction(deliverableId: string): Promise<ActionResult<{ url: string }>> {
  if (isMockEnabled()) return { success: false, error: 'Deliverable belum tersedia dalam mode demo' };
  const user = await getAuthenticatedUser();
  if (!user || !db) return { success: false, error: 'Sesi pengguna tidak valid' };

  try {
    const [record] = await db.select().from(schema.deliverables).where(eq(schema.deliverables.id, deliverableId));
    if (!record || record.status !== 'ready') return { success: false, error: 'Deliverable tidak ditemukan' };
    const auth = await getAuthorizedJob(record.jobId, 'read');
    if ('error' in auth) return { success: false, error: auth.error };
    return { success: true, data: { url: await createDeliverableDownloadUrl(record.storageKey, record.originalFilename) } };
  } catch (error) {
    console.error('Failed to create deliverable download URL:', error);
    return { success: false, error: 'Gagal menyiapkan download' };
  }
}

export async function deleteDeliverableAction(deliverableId: string): Promise<ActionResult> {
  if (isMockEnabled()) return { success: false, error: 'Hapus deliverable belum tersedia dalam mode demo' };

  const user = await getAuthenticatedUser();
  if (!user || (user.role !== 'admin' && user.role !== 'designer')) {
    return { success: false, error: 'Hanya editor atau admin yang dapat menghapus deliverable' };
  }
  if (!db) return { success: false, error: 'Database belum terhubung' };

  try {
    const [record] = await db
      .select()
      .from(schema.deliverables)
      .where(eq(schema.deliverables.id, deliverableId));
    if (!record) return { success: true };
    const auth = await getAuthorizedJob(record.jobId, 'read');
    if ('error' in auth || (auth.user.role !== 'admin' && auth.user.role !== 'designer')) {
      return { success: false, error: 'Anda tidak memiliki akses ke deliverable ini' };
    }
    if (!isDeliverableKeyForJob(record.storageKey, record.jobId)) {
      return { success: false, error: 'Kunci penyimpanan tidak valid' };
    }

    await deleteDeliverableObject(record.storageKey);
    await db.delete(schema.deliverables).where(eq(schema.deliverables.id, deliverableId));
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete deliverable:', error);
    return { success: false, error: 'Gagal menghapus deliverable' };
  }
}
