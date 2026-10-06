import webpush from 'web-push';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

// Default VAPID keys for COPM notifications
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BP5wOj9BecHre-ZJvflww2WU8Z3gjE0rrBgjSLV4pur2iUaTtd8P3SCyOy5pQsVeNb1q3APuu1Z7O9CDhDRUtGk';

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'ZaXiXUv4g0rM4CbSQsnh0Ms4qj1MdEAMF0insz-kDzo';

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:notifications@copm.app';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('Failed to initialize web-push VAPID:', e);
}

export async function sendWebPushNotificationToUser({
  userId,
  title,
  message,
  url = '/',
  jobId,
}: {
  userId: string;
  title: string;
  message: string;
  url?: string;
  jobId?: string;
}) {
  if (!db) return;

  try {
    const subscriptions = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, userId));

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title,
      message,
      url,
      jobId,
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );
        } catch (err: unknown) {
          // If subscription has expired (HTTP 410 or 404), purge it from database
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await db
              ?.delete(schema.pushSubscriptions)
              .where(eq(schema.pushSubscriptions.id, sub.id))
              .catch(() => undefined);
          }
        }
      })
    );
  } catch (error) {
    console.error('Failed to send web push notifications:', error);
  }
}
