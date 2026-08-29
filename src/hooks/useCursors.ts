'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RemoteCursor, Profile, Job, Page } from '@/types';
import { getAvatarColor } from '@/lib/utils';

export function useCursors(
  currentPage: Page | null,
  currentUser: Profile | null,
  activeDraggedJob: Job | null = null,
  userState: string | null = null
) {
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [remotelyDraggedJobIds, setRemotelyDraggedJobIds] = useState<Set<string>>(new Set());
  const remotelyDraggedJobIdsRef = useRef<Set<string>>(new Set());

  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const lastBroadcastTime = useRef<number>(0);
  const lastPointerPos = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const draggedJobRef = useRef<Job | null>(activeDraggedJob);
  const userStateRef = useRef<string | null>(userState);
  const currentPageRef = useRef<Page | null>(currentPage);
  const broadcastRef = useRef<((pos?: { clientX: number; clientY: number }, force?: boolean) => void) | null>(null);

  // Helper to update remotelyDraggedJobIds only when the set of IDs actually changes
  const updateDraggedJobIds = (cursorMap: Map<string, RemoteCursor>) => {
    const newSet = new Set<string>();
    for (const c of cursorMap.values()) {
      if (c.draggedJob?.id) {
        newSet.add(c.draggedJob.id);
      }
    }

    const currentSet = remotelyDraggedJobIdsRef.current;
    if (newSet.size !== currentSet.size || Array.from(newSet).some((id) => !currentSet.has(id))) {
      remotelyDraggedJobIdsRef.current = newSet;
      setRemotelyDraggedJobIds(newSet);
    }
  };

  useEffect(() => {
    draggedJobRef.current = activeDraggedJob;
    if (broadcastRef.current && (lastPointerPos.current.clientX !== 0 || lastPointerPos.current.clientY !== 0)) {
      broadcastRef.current(lastPointerPos.current, true);
    }
  }, [activeDraggedJob]);

  useEffect(() => {
    userStateRef.current = userState;
    if (broadcastRef.current && (lastPointerPos.current.clientX !== 0 || lastPointerPos.current.clientY !== 0)) {
      broadcastRef.current(lastPointerPos.current, true);
    }
  }, [userState]);

  useEffect(() => {
    currentPageRef.current = currentPage;
    if (broadcastRef.current && (lastPointerPos.current.clientX !== 0 || lastPointerPos.current.clientY !== 0)) {
      broadcastRef.current(lastPointerPos.current, true);
    }
  }, [currentPage]);

  const cachedBoardRect = useRef<{ left: number; top: number } | null>(null);

  // Update cached board position without layout thrashing
  useEffect(() => {
    let animFrame: number | null = null;
    const updateCachedRect = () => {
      if (animFrame) return;
      animFrame = requestAnimationFrame(() => {
        animFrame = null;
        const boardEl = document.querySelector('.kanban-board');
        if (boardEl) {
          const rect = boardEl.getBoundingClientRect();
          cachedBoardRect.current = { left: rect.left, top: rect.top };
        }
      });
    };

    updateCachedRect();
    window.addEventListener('resize', updateCachedRect, { passive: true });
    window.addEventListener('scroll', updateCachedRect, { passive: true, capture: true });

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', updateCachedRect);
      window.removeEventListener('scroll', updateCachedRect, { capture: true });
    };
  }, []);

  // Hybrid Realtime: BroadcastChannel (local tabs/windows) + Supabase Realtime (network) across all pages (workspace-wide)
  useEffect(() => {
    if (!currentUser) return;

    const channelName = 'copm-cursors-workspace';
    const userColor = getAvatarColor(currentUser.id || currentUser.fullName);

    const handleIncomingCursor = (payload: {
      userId: string;
      userName: string;
      userAvatar?: string;
      color?: string;
      x: number;
      y: number;
      worldX?: number;
      worldY?: number;
      pageId?: string;
      pageName?: string;
      draggedJob?: Job | null;
      initialCardWorldX?: number;
      initialCardWorldY?: number;
      userState?: string | null;
    }) => {
      if (!payload || !payload.userId || payload.userId === currentUser.id) return;

      setCursors((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, {
          userId: payload.userId,
          userName: payload.userName || 'Collaborator',
          userAvatar: payload.userAvatar || '',
          color: payload.color || getAvatarColor(payload.userId),
          x: payload.x,
          y: payload.y,
          worldX: payload.worldX,
          worldY: payload.worldY,
          pageId: payload.pageId,
          pageName: payload.pageName,
          draggedJob: payload.draggedJob,
          initialCardWorldX: payload.initialCardWorldX,
          initialCardWorldY: payload.initialCardWorldY,
          userState: payload.userState || null,
          lastUpdated: Date.now(),
        });
        updateDraggedJobIds(next);
        return next;
      });
    };

    const handleIncomingCursorLeave = (payload: { userId: string }) => {
      if (!payload || !payload.userId || payload.userId === currentUser.id) return;
      setCursors((prev) => {
        if (!prev.has(payload.userId)) return prev;
        const next = new Map(prev);
        next.delete(payload.userId);
        updateDraggedJobIds(next);
        return next;
      });
    };

    // 1. Browser BroadcastChannel for instant local multi-window / multi-tab support
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('copm-cursors-workspace');
        bc.onmessage = (event) => {
          if (event.data?.type === 'cursor-pos') {
            handleIncomingCursor(event.data.payload);
          } else if (event.data?.type === 'cursor-leave') {
            handleIncomingCursorLeave(event.data.payload);
          }
        };
        broadcastChannelRef.current = bc;
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Supabase Realtime Broadcast for remote network collaborators
    const supabase = createClient();
    try {
      const channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel
        .on('broadcast', { event: 'cursor-pos' }, ({ payload }) => {
          handleIncomingCursor(payload);
        })
        .on('broadcast', { event: 'cursor-leave' }, ({ payload }) => {
          handleIncomingCursorLeave(payload);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channelRef.current = channel;
          }
        });
    } catch (e) {
      console.warn('Supabase Realtime channel error:', e);
    }

    // Broadcast cursor position
    const broadcastCursorPosition = (
      pos?: { clientX: number; clientY: number },
      force = false
    ) => {
      const clientX = pos ? pos.clientX : lastPointerPos.current.clientX;
      const clientY = pos ? pos.clientY : lastPointerPos.current.clientY;

      lastPointerPos.current = { clientX, clientY };

      const now = Date.now();
      if (!force && now - lastBroadcastTime.current < 32) return;
      lastBroadcastTime.current = now;

      // Direct board relative position
      const boardEl = document.querySelector('.kanban-board');
      let worldX: number | undefined = undefined;
      let worldY: number | undefined = undefined;

      if (boardEl) {
        const bRect = boardEl.getBoundingClientRect();
        worldX = clientX - bRect.left;
        worldY = clientY - bRect.top;
      }

      const payload = {
        userId: currentUser.id,
        userName: currentUser.fullName,
        userAvatar: currentUser.avatarUrl,
        color: userColor,
        x: clientX,
        y: clientY,
        worldX,
        worldY,
        pageId: currentPageRef.current?.id,
        pageName: currentPageRef.current?.name,
        draggedJob: draggedJobRef.current,
        userState: userStateRef.current,
      };

      // Send to local BroadcastChannel
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'cursor-pos',
          payload,
        });
      }

      // Send to Supabase channel if connected
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'cursor-pos',
          payload,
        });
      }
    };

    broadcastRef.current = broadcastCursorPosition;

    // Broadcast cursor leave when exiting the website viewport
    const broadcastCursorLeave = () => {
      const payload = { userId: currentUser.id };

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: 'cursor-leave',
          payload,
        });
      }

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'cursor-leave',
          payload,
        });
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      broadcastCursorPosition({ clientX: e.clientX, clientY: e.clientY });
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        broadcastCursorLeave();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        broadcastCursorLeave();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('blur', broadcastCursorLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      broadcastCursorLeave();
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('blur', broadcastCursorLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentUser]);

  return {
    cursors: Array.from(cursors.values()),
    remotelyDraggedJobIds,
  };
}
