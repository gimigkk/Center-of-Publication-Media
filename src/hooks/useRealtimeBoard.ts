'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Job, JobStatus } from '@/types';
import { getJobsAction } from '@/app/actions/jobs';

export interface CardDropEvent {
  jobId: string;
  toStatus: JobStatus;
  releaseWorldX?: number;
  releaseWorldY?: number;
  releaseTilt?: number;
}

export function useRealtimeBoard(pageId: string, initialJobs: Job[]) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [lastDropEvent, setLastDropEvent] = useState<CardDropEvent | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  const refreshBoard = useCallback(async () => {
    if (!pageId) return;
    try {
      const updatedJobs = await getJobsAction(pageId);
      setJobs(updatedJobs);
    } catch (e) {
      console.error('Failed to sync board updates:', e);
    }
  }, [pageId]);

  useEffect(() => {
    if (!pageId) return;

    // 1. Local BroadcastChannel for instant multi-window board sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(`copm-board-${pageId}`);
        bc.onmessage = (event) => {
          if (event.data?.type === 'board-refresh') {
            const dropDetails: CardDropEvent | undefined = event.data?.dropEvent;
            if (dropDetails) {
              setJobs((prev) =>
                prev.map((j) =>
                  j.id === dropDetails.jobId ? { ...j, status: dropDetails.toStatus } : j
                )
              );
              setLastDropEvent(dropDetails);
            }
            refreshBoard();
          }
        };
        bcRef.current = bc;
      } catch (e) {
        console.warn('BroadcastChannel board error:', e);
      }
    }

    // 2. Supabase Postgres changes for remote sync
    const supabase = createClient();
    const channelName = `realtime-board-${pageId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `page_id=eq.${pageId}`,
        },
        async () => {
          refreshBoard();
        }
      )
      .subscribe();

    return () => {
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [pageId, refreshBoard]);

  const broadcastBoardChange = useCallback((dropEvent?: CardDropEvent) => {
    if (bcRef.current) {
      bcRef.current.postMessage({ type: 'board-refresh', dropEvent });
    }
  }, []);

  return {
    jobs,
    setJobs,
    broadcastBoardChange,
    lastDropEvent,
  };
}
