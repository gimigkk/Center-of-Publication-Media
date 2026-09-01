'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Job, Page } from '@/types';

export interface CardDropEvent {
  jobId: string;
  toStatus: Job['status'];
  releaseWorldX?: number;
  releaseWorldY?: number;
  releaseTilt?: number;
}

export type BoardRefreshReason = 'broadcast' | 'realtime' | 'mutation' | 'error';

export function useRealtimeBoard(pageId: string, initialJobs: Job[]) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [lastDropEvent, setLastDropEvent] = useState<CardDropEvent | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const refreshGenerationRef = useRef(0);

  // Sync prop updates into local state during render.
  const [prevInitialJobs, setPrevInitialJobs] = useState<Job[]>(initialJobs);
  if (prevInitialJobs !== initialJobs) {
    setPrevInitialJobs(initialJobs);
    setJobs(initialJobs);
  }

  const runRefreshRef = useRef<() => Promise<void>>(async () => undefined);
  const runRefresh = useCallback(async () => {
    if (!pageId) return;
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    const generation = refreshGenerationRef.current;
    try {
      const { getJobsAction } = await import('@/app/actions/jobs');
      const updatedJobs = await getJobsAction(pageId);
      if (generation === refreshGenerationRef.current) setJobs(updatedJobs);
    } catch (e) {
      console.error('Failed to sync board updates:', e);
    } finally {
      refreshInFlightRef.current = false;
      if (refreshPendingRef.current && generation === refreshGenerationRef.current) {
        refreshPendingRef.current = false;
        void runRefreshRef.current();
      }
    }
  }, [pageId]);

  useEffect(() => {
    runRefreshRef.current = runRefresh;
  }, [runRefresh]);

  const requestBoardRefresh = useCallback((reason: BoardRefreshReason, immediate = false) => {
    if (!pageId) return;
    // Coalesce bursts from local BroadcastChannel and Supabase into one request.
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    if (immediate) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      void runRefreshRef.current();
      return;
    }
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void runRefreshRef.current();
    }, 100);
    if (process.env.NODE_ENV === 'development') {
      performance.mark(`board-refresh-request-${reason}`);
    }
  }, [pageId]);

  useEffect(() => {
    refreshGenerationRef.current += 1;
    refreshPendingRef.current = false;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, [pageId]);

  useEffect(() => {
    if (!pageId) return;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(`copm-board-${pageId}`);
        bc.onmessage = (event) => {
          if (event.data?.type !== 'board-refresh') return;
          const dropDetails: CardDropEvent | undefined = event.data?.dropEvent;
          if (dropDetails) {
            setJobs((prev) => prev.map((j) =>
              j.id === dropDetails.jobId ? { ...j, status: dropDetails.toStatus } : j
            ));
            setLastDropEvent(dropDetails);
          }
          requestBoardRefresh('broadcast');
        };
        bcRef.current = bc;
      } catch (e) {
        console.warn('BroadcastChannel board error:', e);
      }
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-board-${pageId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `page_id=eq.${pageId}` },
        () => requestBoardRefresh('realtime')
      )
      .subscribe();

    return () => {
      refreshGenerationRef.current += 1;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [pageId, requestBoardRefresh]);

  const broadcastBoardChange = useCallback((dropEvent?: CardDropEvent) => {
    if (bcRef.current) {
      bcRef.current.postMessage({ type: 'board-refresh', dropEvent });
    }
  }, []);

  return {
    jobs,
    setJobs,
    broadcastBoardChange,
    requestBoardRefresh,
    lastDropEvent,
  };
}

export type { Page };
