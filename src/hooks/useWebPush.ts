'use client';

import { useEffect, useState, useCallback } from 'react';
import { savePushSubscriptionAction } from '@/app/actions/web-push';

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BP5wOj9BecHre-ZJvflww2WU8Z3gjE0rrBgjSLV4pur2iUaTtd8P3SCyOy5pQsVeNb1q3APuu1Z7O9CDhDRUtGk';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush(userId?: string) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);

      navigator.serviceWorker.register('/sw.js').then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(Boolean(sub));
        });
      }).catch((err) => {
        console.warn('SW registration failed:', err);
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return false;
    setLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const rawKey = subscription.getKey('p256dh');
      const rawAuth = subscription.getKey('auth');
      if (!rawKey || !rawAuth) {
        throw new Error('Push keys missing');
      }

      const p256dh = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)));

      await savePushSubscriptionAction({
        endpoint: subscription.endpoint,
        keys: { p256dh, auth },
      });

      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error('Failed to subscribe to Web Push:', e);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, userId]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
  };
}
