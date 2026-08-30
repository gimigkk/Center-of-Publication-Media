'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OnlineUser, Profile, Page } from '@/types';
import { getAvatarColor } from '@/lib/utils';

export function usePresence(currentPage: Page | null, currentUser: Profile | null) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const localPresencesRef = useRef<Map<string, { user: OnlineUser; lastSeen: number }>>(new Map());
  const currentPageRef = useRef<Page | null>(currentPage);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Periodically clean up offline users
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const map = localPresencesRef.current;
      let changed = false;
      for (const [id, item] of map.entries()) {
        if (now - item.lastSeen > 6000) {
          map.delete(id);
          changed = true;
        }
      }
      if (changed) {
        setOnlineUsers(Array.from(map.values()).map((v) => v.user));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Update currentPageRef and broadcast new page presence immediately
  useEffect(() => {
    currentPageRef.current = currentPage;
    if (!currentUser) return;

    const myUser: OnlineUser = {
      userId: currentUser.id,
      userName: currentUser.fullName,
      userAvatar: currentUser.avatarUrl,
      role: currentUser.role,
      color: getAvatarColor(currentUser.id || currentUser.fullName),
      pageId: currentPage?.id,
      pageName: currentPage?.name,
      onlineAt: new Date().toISOString(),
    };

    localPresencesRef.current.set(currentUser.id, { user: myUser, lastSeen: Date.now() });
    setOnlineUsers(Array.from(localPresencesRef.current.values()).map((v) => v.user));

    if (bcRef.current) {
      bcRef.current.postMessage({ type: 'presence-heartbeat', user: myUser });
    }
    if (channelRef.current) {
      channelRef.current.track(myUser);
    }
  }, [currentPage, currentUser]);

  // Hybrid Realtime Workspace-wide presence
  useEffect(() => {
    if (!currentUser) return;

    const myUser: OnlineUser = {
      userId: currentUser.id,
      userName: currentUser.fullName,
      userAvatar: currentUser.avatarUrl,
      role: currentUser.role,
      color: getAvatarColor(currentUser.id || currentUser.fullName),
      pageId: currentPageRef.current?.id,
      pageName: currentPageRef.current?.name,
      onlineAt: new Date().toISOString(),
    };

    // Add myself to presence
    localPresencesRef.current.set(currentUser.id, { user: myUser, lastSeen: Date.now() });
    setOnlineUsers(Array.from(localPresencesRef.current.values()).map((v) => v.user));

    // 1. Browser BroadcastChannel for instant local multi-window presence sync
    let heartbeatTimer: NodeJS.Timeout | null = null;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('copm-presence-workspace');
        bc.onmessage = (event) => {
          if (event.data?.type === 'presence-heartbeat' && event.data.user) {
            const incoming: OnlineUser = event.data.user;
            localPresencesRef.current.set(incoming.userId, { user: incoming, lastSeen: Date.now() });
            setOnlineUsers(Array.from(localPresencesRef.current.values()).map((v) => v.user));
          } else if (event.data?.type === 'presence-leave' && event.data.userId) {
            localPresencesRef.current.delete(event.data.userId);
            setOnlineUsers(Array.from(localPresencesRef.current.values()).map((v) => v.user));
          }
        };
        bcRef.current = bc;

        // Broadcast my heartbeat immediately & periodically
        bc.postMessage({ type: 'presence-heartbeat', user: myUser });
        heartbeatTimer = setInterval(() => {
          const currentPresence: OnlineUser = {
            userId: currentUser.id,
            userName: currentUser.fullName,
            userAvatar: currentUser.avatarUrl,
            role: currentUser.role,
            color: getAvatarColor(currentUser.id || currentUser.fullName),
            pageId: currentPageRef.current?.id,
            pageName: currentPageRef.current?.name,
            onlineAt: new Date().toISOString(),
          };
          bc.postMessage({ type: 'presence-heartbeat', user: currentPresence });
        }, 2000);
      } catch (e) {
        console.warn('BroadcastChannel presence error:', e);
      }
    }

    // 2. Supabase Realtime Presence
    const supabase = createClient();
    const channelName = 'copm-presence-workspace';

    try {
      const existingChannel = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
      if (existingChannel) {
        supabase.removeChannel(existingChannel);
      }

      const channel = supabase.channel(channelName, {
        config: {
          presence: {
            key: currentUser.id,
          },
        },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<OnlineUser>();
          for (const key in state) {
            const presences = state[key];
            if (presences && presences.length > 0) {
              const u = presences[0];
              localPresencesRef.current.set(u.userId, { user: u, lastSeen: Date.now() });
            }
          }
          setOnlineUsers(Array.from(localPresencesRef.current.values()).map((v) => v.user));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            channelRef.current = channel;
            await channel.track(myUser);
          }
        });
    } catch (e) {
      console.warn('Supabase Presence error:', e);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentPresence: OnlineUser = {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userAvatar: currentUser.avatarUrl,
          role: currentUser.role,
          color: getAvatarColor(currentUser.id || currentUser.fullName),
          pageId: currentPageRef.current?.id,
          pageName: currentPageRef.current?.name,
          onlineAt: new Date().toISOString(),
        };
        localPresencesRef.current.set(currentUser.id, { user: currentPresence, lastSeen: Date.now() });
        bcRef.current?.postMessage({ type: 'presence-heartbeat', user: currentPresence });
        channelRef.current?.track(currentPresence);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (bcRef.current) {
        bcRef.current.postMessage({ type: 'presence-leave', userId: currentUser.id });
        bcRef.current.close();
        bcRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentUser]);

  return { onlineUsers };
}
