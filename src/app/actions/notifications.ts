'use server';

import { db, schema } from '@/lib/db';
import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { AppNotification, NotificationType } from '@/types';
import { isMockEnabled, getMockStore } from '@/lib/mock-store';
import { sendWebPushNotificationToUser } from '@/lib/web-push';
import { getAuthenticatedUser } from '@/lib/auth-guard';

export async function getNotificationsAction(userId?: string): Promise<AppNotification[]> {
  if (isMockEnabled()) {
    const store = getMockStore();
    return userId ? store.notifications.filter((n) => n.userId === userId) : store.notifications;
  }

  const currentUser = await getAuthenticatedUser();
  if (!currentUser) return [];

  if (!db) return [];

  // Non-admins can strictly only fetch their own notifications
  const targetUserId = currentUser.role === 'admin' && userId ? userId : currentUser.id;

  try {
    const records = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, targetUserId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50);

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
  if (isMockEnabled()) {
    const store = getMockStore();
    const notif: AppNotification = {
      id: `notif-${Date.now()}`,
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
      createdAt: new Date().toISOString(),
    };
    store.notifications.unshift(notif);
    return { success: true, notification: notif };
  }

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

    // Trigger instant Web Push notification directly to the user's OS / browser
    sendWebPushNotificationToUser({
      userId,
      title,
      message,
      jobId: jobId || undefined,
    }).catch((err) => console.error('Failed to trigger web push notification:', err));

    revalidatePath('/');
    return { success: true, notification: notif };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Gagal membuat notifikasi' };
  }
}

export async function markAsReadAction(notificationId: string): Promise<{ success: boolean }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    const target = store.notifications.find((n) => n.id === notificationId);
    if (target) target.isRead = true;
    return { success: true };
  }

  const currentUser = await getAuthenticatedUser();
  if (!currentUser || !db) return { success: false };

  try {
    const condition = currentUser.role === 'admin'
      ? eq(schema.notifications.id, notificationId)
      : and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, currentUser.id));

    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(condition);

    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function markAllAsReadAction(userId?: string): Promise<{ success: boolean }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    store.notifications.forEach((n) => {
      if (!userId || n.userId === userId) n.isRead = true;
    });
    return { success: true };
  }

  const currentUser = await getAuthenticatedUser();
  if (!currentUser || !db) return { success: false };

  const targetUserId = currentUser.role === 'admin' && userId ? userId : currentUser.id;

  try {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.userId, targetUserId));

    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function clearNotificationsAction(userId?: string): Promise<{ success: boolean }> {
  if (isMockEnabled()) {
    const store = getMockStore();
    if (userId) {
      store.notifications = store.notifications.filter((n) => n.userId !== userId);
    } else {
      store.notifications = [];
    }
    return { success: true };
  }

  const currentUser = await getAuthenticatedUser();
  if (!currentUser || !db) return { success: false };

  const targetUserId = currentUser.role === 'admin' && userId ? userId : currentUser.id;

  try {
    await db.delete(schema.notifications).where(eq(schema.notifications.userId, targetUserId));
    revalidatePath('/');
    return { success: true };
  } catch {
    return { success: false };
  }
}
