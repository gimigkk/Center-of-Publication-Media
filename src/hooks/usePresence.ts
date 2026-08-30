'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OnlineUser, Profile, Page } from '@/types';
import { getAvatarColor } from '@/lib/utils';

export function usePresence(currentPage: Page | null, currentUser: Profile | null) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const localBcPresencesRef = useRef<Map<string, { user: OnlineUser; lastSeen: number }>>(new Map());
  const supabasePresencesRef = useRef<Map<string, OnlineUser>>(new Map());
  const currentPageRef = useRef<Page | null>(currentPage);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Recalculate merged online users list
  const recomputeOnlineUsers = useCallback(() => {
    if (!currentUser) return;
    const combined = new Map<string, OnlineUser>();

    // 1. Myself is always online
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
    combined.set(currentUser.id, myUser);

    // 2. Add all users from Supabase presence state
    for (const [id, u] of supabasePresencesRef.current.entries()) {
      if (id && id !== currentUser.id) {
        combined.set(id, u);
      }
    }

    // 3. Add users from local BroadcastChannel (if active within 20s)
    const now = Date.now();
    for (const [id, item] of localBcPresencesRef.current.entries()) {
      if (now - item.lastSeen < 20000 && id !== currentUser.id) {
        combined.set(id, item.user);
      }
    }

    setOnlineUsers(Array.from(combined.values()));
  }, [currentUser]);

  // Clean up stale BroadcastChannel items every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, item] of localBcPresencesRef.current.entries()) {
        if (now - item.lastSeen >= 20000) {
          localBcPresencesRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) {
        recomputeOnlineUsers();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [recomputeOnlineUsers]);

  // Update currentPageRef and re-track presence
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

    if (bcRef.current) {
      bcRef.current.postMessage({ type: 'presence-heartbeat', user: myUser });
    }
    if (channelRef.current) {
      channelRef.current.track(myUser);
    }
    recomputeOnlineUsers();
  }, [currentPage, currentUser, recomputeOnlineUsers]);

  // Workspace-wide hybrid Realtime presence
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

    // 1. Browser BroadcastChannel
    let heartbeatTimer: NodeJS.Timeout | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('copm-presence-workspace');
        bc.onmessage = (event) => {
          if (event.data?.type === 'presence-heartbeat' && event.data.user) {
            const incoming: OnlineUser = event.data.user;
            localBcPresencesRef.current.set(incoming.userId, { user: incoming, lastSeen: Date.now() });
            recomputeOnlineUsers();
          } else if (event.data?.type === 'presence-leave' && event.data.userId) {
            localBcPresencesRef.current.delete(event.data.userId);
            recomputeOnlineUsers();
          }
        };
        bcRef.current = bc;
        bc.postMessage({ type: 'presence-heartbeat', user: myUser });

        heartbeatTimer = setInterval(() => {
          const presence: OnlineUser = {
            userId: currentUser.id,
            userName: currentUser.fullName,
            userAvatar: currentUser.avatarUrl,
            role: currentUser.role,
            color: getAvatarColor(currentUser.id || currentUser.fullName),
            pageId: currentPageRef.current?.id,
            pageName: currentPageRef.current?.name,
            onlineAt: new Date().toISOString(),
          };
          bc.postMessage({ type: 'presence-heartbeat', user: presence });
        }, 5000);
      } catch (e) {
        console.warn('BroadcastChannel presence error:', e);
      }
    }

    // 2. Supabase Realtime Presence
    const supabase = createClient();
    const channelName = 'copm-presence-workspace';

    const syncSupabaseState = (state: Record<string, OnlineUser[]>) => {
      const nextMap = new Map<string, OnlineUser>();
      for (const key in state) {
        const presences = state[key];
        if (presences && presences.length > 0) {
          const u = presences[0];
          if (u && u.userId) {
            nextMap.set(u.userId, u);
          }
        }
      }
      supabasePresencesRef.current = nextMap;
      recomputeOnlineUsers();
    };

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
          syncSupabaseState(channel.presenceState<OnlineUser>());
        })
        .on('presence', { event: 'join' }, () => {
          syncSupabaseState(channel.presenceState<OnlineUser>());
        })
        .on('presence', { event: 'leave' }, () => {
          syncSupabaseState(channel.presenceState<OnlineUser>());
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            channelRef.current = channel;
            await channel.track(myUser);
            syncSupabaseState(channel.presenceState<OnlineUser>());
          }
        });
    } catch (e) {
      console.warn('Supabase Presence error:', e);
    }

    // Periodic Supabase presence heartbeat (every 10s) to keep track fresh
    const supabaseHeartbeat = setInterval(() => {
      if (channelRef.current) {
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
        channelRef.current.track(currentPresence);
      }
    }, 10000);

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
        bcRef.current?.postMessage({ type: 'presence-heartbeat', user: currentPresence });
        channelRef.current?.track(currentPresence);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (supabaseHeartbeat) clearInterval(supabaseHeartbeat);
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
  }, [currentUser, recomputeOnlineUsers]);

  return { onlineUsers };
}
