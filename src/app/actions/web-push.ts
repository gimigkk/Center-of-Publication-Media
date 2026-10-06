'use server';

import { db, schema } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { eq } from 'drizzle-orm';

export async function savePushSubscriptionAction(subscription: {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: 'Akses ditolak' };
    if (!db) return { success: false, error: 'Database belum terhubung' };

    await db
      .insert(schema.pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          createdAt: new Date(),
        },
      });

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal menyimpan langganan push',
    };
  }
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ success: boolean }> {
  try {
    if (!db) return { success: true };
    await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
    return { success: true };
  } catch {
    return { success: true };
  }
}
