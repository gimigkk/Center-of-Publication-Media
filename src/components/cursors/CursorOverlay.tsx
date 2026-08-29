'use client';

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { RemoteCursor, Profile } from '@/types';
import { Cursor } from './Cursor';

interface CursorOverlayProps {
  cursors: RemoteCursor[];
  currentUser?: Profile | null;
  currentPageId?: string;
}

export const CursorOverlay = memo(function CursorOverlay({
  cursors,
  currentUser,
  currentPageId,
}: CursorOverlayProps) {
  const [boardOrigin, setBoardOrigin] = useState<{ left: number; top: number }>(() => {
    if (typeof document !== 'undefined') {
      const boardEl = document.querySelector('.kanban-board');
      if (boardEl) {
        const rect = boardEl.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top) };
      }
    }
    return { left: 0, top: 0 };
  });
  const [zoomScale, setZoomScale] = useState<number>(1);
  const prevOriginRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const scrollRafRef = useRef<number | null>(null);

  const updateBoardOrigin = useCallback(() => {
    const boardEl = document.querySelector('.kanban-board');
    if (boardEl) {
      const rect = boardEl.getBoundingClientRect();
      const roundedLeft = Math.round(rect.left);
      const roundedTop = Math.round(rect.top);

      if (
        Math.abs(prevOriginRef.current.left - roundedLeft) >= 1 ||
        Math.abs(prevOriginRef.current.top - roundedTop) >= 1
      ) {
        prevOriginRef.current = { left: roundedLeft, top: roundedTop };
        setBoardOrigin({ left: roundedLeft, top: roundedTop });
      }
    }
  }, []);

  const handleScrollThrottled = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateBoardOrigin();
    });
  }, [updateBoardOrigin]);

  useEffect(() => {
    updateBoardOrigin();

    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateBoardOrigin();
        setZoomScale(window.devicePixelRatio || 1);
      }, 60);
    };

    const boardContainer = document.querySelector('.board-container');

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScrollThrottled, { passive: true, capture: true });
    boardContainer?.addEventListener('scroll', handleScrollThrottled, { passive: true });

    let ro: ResizeObserver | null = null;
    const boardEl = document.querySelector('.kanban-board');
    if (boardEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        handleScrollThrottled();
      });
      ro.observe(boardEl);
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScrollThrottled, { capture: true });
      boardContainer?.removeEventListener('scroll', handleScrollThrottled);
      ro?.disconnect();
    };
  }, [updateBoardOrigin, handleScrollThrottled]);

  if (!cursors || cursors.length === 0) return null;

  return (
    <div className="cursor-overlay-container">
      {cursors.map((cursor) => (
        <Cursor
          key={cursor.userId}
          cursor={cursor}
          boardOrigin={boardOrigin}
          currentUser={currentUser}
          currentPageId={currentPageId}
          zoomScale={zoomScale}
        />
      ))}
    </div>
  );
});


