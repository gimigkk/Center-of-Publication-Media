'use server';

import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppNotification, NotificationType } from '@/types';

export async function getNotificationsAction(userId?: string): Promise<AppNotification[]> {
  if (!db) return [];

  try {
    const query = userId
      ? db
          .select()
          .from(schema.notifications)
          .where(eq(schema.notifications.userId, userId))
          .orderBy(desc(schema.notifications.createdAt))
      : db
          .select()
          .from(schema.notifications)
          .orderBy(desc(schema.notifications.createdAt));

    const records = await query;
    return records.map((r) => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      message: r.message,
      type: r.type as NotificationType,
      jobId: r.jobId,
      jobTitle: r.jobTitle,
      actorId: r.actorId,
      actorName: r.actorName,
      actorAvatar: r.actorAvatar,
      note: r.note,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (e) {
    console.error('Failed to get notifications:', e);
    return [];
  }
}

export async function createNotificationAction({
  userId,
  title,
  message,
  type,
  jobId,
  jobTitle,
  actorId,
  actorName,
  actorAvatar,
  note,
}: {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  jobId?: string | null;
  jobTitle?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorAvatar?: string | null;
  note?: string | null;
}): Promise<{ success: boolean; notification?: AppNotification; error?: string }> {
  if (!db) {
    return { success: false, error: 'Database belum terhubung' };
  }

  try {
    const [inserted] = await db
      .insert(schema.notifications)
      .values({
        userId,
        title,
        message,
        type,
        jobId: jobId || undefined,
        jobTitle: jobTitle || undefined,
        actorId: actorId || undefined,
        actorName: actorName || undefined,
        actorAvatar: actorAvatar || undefined,
        note: note || undefined,
        isRead: false,
      })
      .returning();

    const notif: AppNotification = {
      id: inserted.id,
      userId: inserted.userId,
      title: inserted.title,
      message: inserted.message,
      type: inserted.type as NotificationType,
      jobId: inserted.jobId,
      jobTitle: inserted.jobTitle,
      actorId: inserted.actorId,
      actorName: inserted.actorName,
      actorAvatar: inserted.actorAvatar,
      note: inserted.note,
      isRead: inserted.isRead,
      createdAt: inserted.createdAt.toISOString(),
    };

    revalidatePath('/');
    return { success: true, notification: notif };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal membuat notifikasi' };
  }
}

export async function markAsReadAction(notificationId: string): Promise<{ success: boolean }> {
  if (!db) return { success: false };

  try {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, notificationId));

    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function markAllAsReadAction(userId?: string): Promise<{ success: boolean }> {
  if (!db || !userId) return { success: false };

  try {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.userId, userId));

    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function clearNotificationsAction(userId?: string): Promise<{ success: boolean }> {
  if (!db || !userId) return { success: false };

  try {
    await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

