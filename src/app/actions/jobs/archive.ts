'use server';

import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { Profile } from '@/types';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';

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
