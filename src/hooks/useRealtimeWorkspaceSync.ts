'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Page, Profile, Job, Division, AppNotification } from '@/types';
import { getAllUsersAction } from '@/app/actions/auth';
import { getDesignerSuggestionsAction } from '@/app/actions/jobs/designers';
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
      try {
        const suggestions = await getDesignerSuggestionsAction();
        setDesignerSuggestions(suggestions);
      } catch (err) {
        console.error('Failed to sync designer suggestions:', err);
      }
      return;
    }
    if (!activePageIdRef.current) return;
    try {
      const freshJobs = await getJobsAction(activePageIdRef.current);
      setJobs(freshJobs);
      const suggestions = await getDesignerSuggestionsAction();
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

      const suggestions = await getDesignerSuggestionsAction();
      setDesignerSuggestions(suggestions);
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

  useEffect(() => {
    // 1. BroadcastChannel for instant local tab sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('copm-workspace-sync');
        bc.onmessage = (event) => {
          const type = event.data?.type;
          if (type === 'sync-users') syncUsers();
          else if (type === 'sync-jobs') syncJobs();
          else if (type === 'sync-divisions') syncDivisions();
          else if (type === 'sync-pages') syncPages();
          else if (type === 'sync-notifications') syncNotifications();
        };
        bcRef.current = bc;
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    // 2. Supabase Postgres Changes Multi-Table Listener
    const supabase = createClient();
    const channelName = 'copm-workspace-realtime-sync';

    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase.channel(channelName);

    // A. Profiles table (new signup, avatar update, approval, role change)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      () => {
        syncUsers();
      }
    );

    // Job assignments change board data, so route them to the same
    // page-scoped coordinator rather than fetching independently.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'job_designers' },
      () => {
        if (requestBoardRefresh) requestBoardRefresh('realtime');
        else syncJobs();
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
        syncDivisions();
      }
    );

    // E. Pages table
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pages' },
      () => {
        syncPages();
      }
    );

    // F. Notifications table (for current user)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => {
        syncNotifications();
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
  }, [syncUsers, syncJobs, syncDivisions, syncPages, syncNotifications, requestBoardRefresh]);

  const broadcastSync = useCallback((type: 'sync-users' | 'sync-jobs' | 'sync-divisions' | 'sync-pages' | 'sync-notifications') => {
    if (bcRef.current) {
      bcRef.current.postMessage({ type });
    }
  }, []);

  return { broadcastSync };
}
