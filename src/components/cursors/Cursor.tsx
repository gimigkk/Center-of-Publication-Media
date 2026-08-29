'use client';

import React, { useState, useEffect, useRef, memo } from 'react';
import { RemoteCursor, Profile, Job } from '@/types';
import { JobCard } from '@/components/board/JobCard';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface CursorProps {
  cursor: RemoteCursor;
  boardOrigin?: { left: number; top: number };
  currentUser?: Profile | null;
  currentPageId?: string;
  zoomScale?: number;
}

export const Cursor = memo(function Cursor({
  cursor,
  boardOrigin,
  currentUser,
  currentPageId,
  zoomScale = 1,
}: CursorProps) {
  const originLeft = boardOrigin?.left ?? 0;
  const originTop = boardOrigin?.top ?? 0;

  const isDifferentPage = !!(cursor.pageId && currentPageId && cursor.pageId !== currentPageId);

  let displayState: string | null = cursor.userState || null;
  if (isDifferentPage) {
    if (cursor.userState) {
      displayState = `${cursor.userState} (${cursor.pageName || 'Halaman lain'})`;
    } else {
      displayState = `Di Halaman "${cursor.pageName || 'Halaman lain'}"`;
    }
  }

  const hasState = Boolean(displayState);
  const { shouldRender: shouldRenderState, isClosing: isStateClosing } = useAnimatePresence(hasState, 190);

  const cachedStateRef = useRef<string | null>(displayState);
  if (displayState) {
    cachedStateRef.current = displayState;
  }
  const renderedStateText = displayState || cachedStateRef.current;

  const nameRef = useRef<HTMLSpanElement>(null);
  const stateTextRef = useRef<HTMLSpanElement>(null);
  const [badgeWidth, setBadgeWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    let animFrame: number | null = null;
    animFrame = requestAnimationFrame(() => {
      const nameW = nameRef.current ? nameRef.current.scrollWidth : 0;
      if (hasState && !isStateClosing) {
        const stateW = stateTextRef.current ? stateTextRef.current.scrollWidth : 0;
        const contentW = Math.max(nameW, stateW);
        if (contentW > 0) {
          setBadgeWidth(Math.min(350, contentW + 15));
        }
      } else if (nameW > 0) {
        setBadgeWidth(nameW + 15);
      }
    });

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [hasState, isStateClosing, renderedStateText, cursor.userName, shouldRenderState]);

  const hasOrigin = Boolean(boardOrigin && (boardOrigin.left !== 0 || boardOrigin.top !== 0));
  const targetX = cursor.worldX !== undefined && hasOrigin ? originLeft + cursor.worldX : cursor.x;
  const targetY = cursor.worldY !== undefined && hasOrigin ? originTop + cursor.worldY : cursor.y;

  const isDragging = !!cursor.draggedJob && !isDifferentPage;
  const { shouldRender, isClosing } = useAnimatePresence(isDragging, 200);

  const cursorRootRef = useRef<HTMLDivElement | null>(null);
  const targetPosRef = useRef({ x: targetX, y: targetY });
  const posRef = useRef({ x: targetX, y: targetY });
  const velRef = useRef({ x: 0, y: 0 });
  const tiltRef = useRef<number>(0);
  const tiltVelRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isLoopRunningRef = useRef<boolean>(false);
  const animIdRef = useRef<number | null>(null);

  const startAnimationLoop = () => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05); // seconds, clamped
      lastTimeRef.current = now;

      // Spring-Damper parameters: critically damped for zero-lag, butter-smooth tracking
      const stiffness = 300;
      const damping = 32;

      // Position physics along X and Y
      const fx = -stiffness * (posRef.current.x - targetPosRef.current.x) - damping * velRef.current.x;
      velRef.current.x += fx * dt;
      posRef.current.x += velRef.current.x * dt;

      const fy = -stiffness * (posRef.current.y - targetPosRef.current.y) - damping * velRef.current.y;
      velRef.current.y += fy * dt;
      posRef.current.y += velRef.current.y * dt;

      // Smooth card velocity swing / tilt
      const targetTilt = Math.max(-8.5, Math.min(8.5, velRef.current.x * 0.007));
      const fTilt = -220 * (tiltRef.current - targetTilt) - 26 * tiltVelRef.current;
      tiltVelRef.current += fTilt * dt;
      tiltRef.current += tiltVelRef.current * dt;

      if (cursorRootRef.current) {
        cursorRootRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
        cursorRootRef.current.style.setProperty('--remote-tilt', `${tiltRef.current}deg`);
      }

      const distSq =
        Math.pow(posRef.current.x - targetPosRef.current.x, 2) +
        Math.pow(posRef.current.y - targetPosRef.current.y, 2);
      const velSq = Math.pow(velRef.current.x, 2) + Math.pow(velRef.current.y, 2);

      // Settle condition
      if (distSq < 0.04 && velSq < 0.2 && Math.abs(tiltRef.current) < 0.04) {
        posRef.current.x = targetPosRef.current.x;
        posRef.current.y = targetPosRef.current.y;
        velRef.current.x = 0;
        velRef.current.y = 0;
        tiltRef.current = 0;
        tiltVelRef.current = 0;
        if (cursorRootRef.current) {
          cursorRootRef.current.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
          cursorRootRef.current.style.setProperty('--remote-tilt', '0deg');
        }
        isLoopRunningRef.current = false;
        animIdRef.current = null;
        return;
      }

      animIdRef.current = requestAnimationFrame(loop);
    };

    animIdRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    targetPosRef.current = { x: targetX, y: targetY };
    startAnimationLoop();
  }, [targetX, targetY]);

  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (animIdRef.current) {
        cancelAnimationFrame(animIdRef.current);
        animIdRef.current = null;
      }
    };
  }, []);

  // Preserve the job during the 200ms exit animation
  const cachedJobRef = useRef<Job | null>(cursor.draggedJob ?? null);
  useEffect(() => {
    if (cursor.draggedJob) {
      cachedJobRef.current = cursor.draggedJob;
    }
  }, [cursor.draggedJob]);

  const activeJob = cursor.draggedJob || cachedJobRef.current;

  // On mount, set initial transform directly
  useEffect(() => {
    if (cursorRootRef.current) {
      cursorRootRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    }
  }, []);

  return (
    <div
      ref={cursorRootRef}
      className="remote-cursor"
    >
      {/* Zoom-invariant cursor pointer group */}
      <div
        className="cursor-pointer-group"
        style={{
          transform: `scale(${1 / (zoomScale || 1)})`,
          transformOrigin: '0 0',
        }}
      >
        <svg
          className="cursor-pointer-svg"
          width="26"
          height="26"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="m3.93 2.75a.9.9 0 0 0 -.362.072.93.93 0 0 0 -.568.73l.002 16.497a1 1 0 0 0 1.299.865l3.076-1.273 1.697 2.27a2.265 2.265 0 0 0 4.092-1.696l-.402-2.805 3.074-1.275q.135-.068.248-.18a1 1 0 0 0 .059-1.35l-11.663-11.665a.92.92 0 0 0 -.552-.189"
            fill="#FFFFFF"
          />
          <path
            d="m4 3.873-.004 15.977 3.352-1.766 2.271 2.73a1.402 1.402 0 0 0 2.389-.988l-.326-3.539 3.619-1.119z"
            fill={cursor.color}
          />
        </svg>
        <div
          className={`cursor-name-badge ${hasState ? 'has-state' : ''}`}
          style={{
            backgroundColor: cursor.color,
            width: badgeWidth !== undefined ? `${badgeWidth}px` : 'max-content',
          }}
        >
          <span className="cursor-name-text" ref={nameRef}>
            {cursor.userName}
          </span>
          {shouldRenderState && renderedStateText && (
            <div className={`cursor-state-wrapper ${isStateClosing ? 'is-collapsing' : ''}`}>
              <div className="cursor-state-inner">
                <span
                  className="cursor-state-text"
                  ref={stateTextRef}
                  title={renderedStateText}
                  key={renderedStateText}
                >
                  ⤷ {renderedStateText}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Real-time remote dragged card preview (ghost) */}
      {shouldRender && activeJob && (
        <div
          className={`remote-dragged-card-preview ${isClosing ? 'is-dropping' : ''}`}
          style={{
            '--remote-snap-from-x':
              cursor.initialCardWorldX !== undefined && cursor.worldX !== undefined
                ? `${cursor.initialCardWorldX + 133 - cursor.worldX}px`
                : '0px',
            '--remote-snap-from-y':
              cursor.initialCardWorldY !== undefined && cursor.worldY !== undefined
                ? `${cursor.initialCardWorldY - cursor.worldY}px`
                : '0px',
            '--remote-tilt': '0deg',
          } as React.CSSProperties}
        >
          <JobCard
            job={activeJob}
            currentUser={currentUser || ({} as Profile)}
            onCardClick={() => {}}
            onAssignClick={() => {}}
            isDraggable={false}
          />
        </div>
      )}
    </div>
  );
});
