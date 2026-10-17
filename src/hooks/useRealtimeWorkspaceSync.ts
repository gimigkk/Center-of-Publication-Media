'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Page, Profile, Job, Division, AppNotification } from '@/types';
import { getAllUsersAction } from '@/app/actions/auth';
import { getPageDesignerSuggestionsAction } from '@/app/actions/page-editors';
import { getJobsAction } from '@/app/actions/jobs';
import { getDivisionsAction } from '@/app/actions/divisions';
import { getPagesAction } from '@/app/actions/pages';
import { getNotificationsAction } from '@/app/actions/notifications';
import type { BoardRefreshReason } from './useRealtimeBoard';

interface UseRealtimeWorkspaceSyncProps {
  activePageId: string;
  currentUser: Profile | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<Profile | null>>;
  setAllUsers: React.Dispatch<React.SetStateAction<Profile[]>>;
  setPendingUsers: React.Dispatch<React.SetStateAction<Profile[]>>;
  setDesignerSuggestions: React.Dispatch<React.SetStateAction<{ designer: Profile; activeWipCount: number }[]>>;
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  setDivisions: React.Dispatch<React.SetStateAction<Division[]>>;
  setPages: React.Dispatch<React.SetStateAction<Page[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  requestBoardRefresh?: (reason: BoardRefreshReason, immediate?: boolean) => void;
}

export function useRealtimeWorkspaceSync({
  activePageId,
  currentUser,
  setCurrentUser,
  setAllUsers,
  setPendingUsers,
  setDesignerSuggestions,
  setJobs,
  setDivisions,
  setPages,
  setNotifications,
  requestBoardRefresh,
}: UseRealtimeWorkspaceSyncProps) {
  const bcRef = useRef<BroadcastChannel | null>(null);
  const activePageIdRef = useRef(activePageId);
  const currentUserIdRef = useRef(currentUser?.id);
  const setDesignerSuggestionsRef = useRef(setDesignerSuggestions);

  useEffect(() => {
    setDesignerSuggestionsRef.current = setDesignerSuggestions;
  }, [setDesignerSuggestions]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  // Sync jobs
  const syncJobs = useCallback(async () => {
    if (requestBoardRefresh) {
      requestBoardRefresh('realtime');
      if (activePageIdRef.current) {
        try {
          const suggestions = await getPageDesignerSuggestionsAction(activePageIdRef.current);
          setDesignerSuggestions(suggestions);
        } catch (err) {
          console.error('Failed to sync designer suggestions:', err);
        }
      }
      return;
    }
    if (!activePageIdRef.current) return;
    try {
      const freshJobs = await getJobsAction(activePageIdRef.current);
      setJobs(freshJobs);
      const suggestions = await getPageDesignerSuggestionsAction(activePageIdRef.current);
      setDesignerSuggestions(suggestions);
    } catch (err) {
      console.error('Failed to sync jobs:', err);
    }
  }, [requestBoardRefresh, setJobs, setDesignerSuggestions]);

  const syncUsers = useCallback(async () => {
    try {
      const users = await getAllUsersAction();
      setAllUsers(users);
      setPendingUsers(users.filter((u) => !u.isApproved));

      if (currentUserIdRef.current) {
        const me = users.find((u) => u.id === currentUserIdRef.current);
        if (me) setCurrentUser(me);
      }

      if (activePageIdRef.current) {
        const suggestions = await getPageDesignerSuggestionsAction(activePageIdRef.current);
        setDesignerSuggestions(suggestions);
      }
      if (requestBoardRefresh) requestBoardRefresh('realtime');
    } catch (err) {
      console.error('Failed to sync users:', err);
    }
  }, [requestBoardRefresh, setAllUsers, setPendingUsers, setCurrentUser, setDesignerSuggestions]);

  // Sync divisions
  const syncDivisions = useCallback(async () => {
    try {
      const divs = await getDivisionsAction(activePageIdRef.current);
      setDivisions(divs);
    } catch (err) {
      console.error('Failed to sync divisions:', err);
    }
  }, [setDivisions]);

  // Sync pages
  const syncPages = useCallback(async () => {
    try {
      const pgs = await getPagesAction();
      setPages(pgs);
    } catch (err) {
      console.error('Failed to sync pages:', err);
    }
  }, [setPages]);

  // Sync notifications
  const syncNotifications = useCallback(async () => {
    if (!currentUserIdRef.current) return;
    try {
      const notifs = await getNotificationsAction(currentUserIdRef.current);
      setNotifications(notifs);
    } catch (err) {
      console.error('Failed to sync notifications:', err);
    }
  }, [setNotifications]);

  const syncJobsRef = useRef(syncJobs);
  const syncUsersRef = useRef(syncUsers);
  const syncDivisionsRef = useRef(syncDivisions);
  const syncPagesRef = useRef(syncPages);
  const syncNotificationsRef = useRef(syncNotifications);

  useEffect(() => {
    syncJobsRef.current = syncJobs;
    syncUsersRef.current = syncUsers;
    syncDivisionsRef.current = syncDivisions;
    syncPagesRef.current = syncPages;
    syncNotificationsRef.current = syncNotifications;
  });

  useEffect(() => {
    // 1. BroadcastChannel for instant local tab sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('copm-workspace-sync');
        bc.onmessage = (event) => {
          const type = event.data?.type;
          if (type === 'sync-users') syncUsersRef.current();
          else if (type === 'sync-jobs') syncJobsRef.current();
          else if (type === 'sync-divisions') syncDivisionsRef.current();
          else if (type === 'sync-pages') syncPagesRef.current();
          else if (type === 'sync-notifications') syncNotificationsRef.current();
          else if (type === 'sync-page-editors') {
            if (activePageIdRef.current) {
              void getPageDesignerSuggestionsAction(activePageIdRef.current).then((suggs) => {
                setDesignerSuggestionsRef.current(suggs);
              });
            }
          }
        };
        bcRef.current = bc;
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Supabase Postgres Changes Multi-Table Listener
    const supabase = createClient();
    const channelName = 'copm-workspace-realtime-sync';

    const existing = supabase.getChannels().find((c: { topic: string }) => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase.channel(channelName);

    // A. Profiles table (new signup, avatar update, approval, role change)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      () => {
        syncUsersRef.current();
      }
    );

    // Job assignments change board data, so route them to the same
    // page-scoped coordinator rather than fetching independently.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'job_designers' },
      () => {
        syncJobsRef.current();
      }
    );

    // Page Editors table
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'page_editors' },
      () => {
        if (activePageIdRef.current) {
          void getPageDesignerSuggestionsAction(activePageIdRef.current).then((suggs) => {
            setDesignerSuggestionsRef.current(suggs);
          });
        }
      }
    );

    // Jobs changes are owned by useRealtimeBoard, which has the active-page
    // filter and coalesced refresh coordinator. Keeping a second global jobs
    // listener here would duplicate every board refresh.

    // C. Divisions table
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'divisions' },
      () => {
        syncDivisionsRef.current();
      }
    );

    // E. Pages table
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pages' },
      () => {
        syncPagesRef.current();
      }
    );

    // F. Notifications table (for current user)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
        const row = (payload.new || payload.old) as { user_id?: string } | undefined;
        if (!row?.user_id || row.user_id === currentUserIdRef.current) {
          syncNotificationsRef.current();
        }
      }
    );

    channel.subscribe();

    return () => {
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, []); // Only register global sync listeners once on mount

  const broadcastSync = useCallback((type: 'sync-users' | 'sync-jobs' | 'sync-divisions' | 'sync-pages' | 'sync-notifications') => {
    if (bcRef.current) {
      bcRef.current.postMessage({ type });
    }
  }, []);

  return { broadcastSync };
}
