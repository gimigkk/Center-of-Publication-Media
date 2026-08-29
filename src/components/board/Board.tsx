'use client';

import React, { useState, useRef, memo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  DragEndEvent,
  DragCancelEvent,
  Modifier,
  pointerWithin,
  CollisionDetection,
} from '@dnd-kit/core';
import { Job, JobStatus, Profile, Division } from '@/types';
import { Column } from './Column';
import { JobCard } from './JobCard';
import { ArchiveTable } from './ArchiveTable';
import { ChevronRight } from 'lucide-react';
import { CardDropEvent } from '@/hooks/useRealtimeBoard';

interface BoardProps {
  jobs: Job[];
  currentUser: Profile;
  divisions?: Division[];
  onMoveJob: (
    jobId: string,
    toStatus: JobStatus,
    releasePos?: { worldX?: number; worldY?: number }
  ) => Promise<void>;
  onCardClick: (job: Job) => void;
  onAssignClick: (job: Job) => void;
  onArchiveJob?: (jobId: string) => Promise<void>;
  onUnarchiveJob?: (jobId: string) => Promise<void>;
  onArchiveAllDone?: () => Promise<void>;
  filterDivision: string | null;
  filterSearch: string;
  remotelyDraggedJobIds?: Set<string>;
  onDragStateChange?: (job: Job | null) => void;
  lastDropEvent?: CardDropEvent | null;
}

const COLUMNS: { status: JobStatus; title: string }[] = [
  { status: 'in_queue', title: 'Antrian' },
  { status: 'wip', title: 'Sedang Dikerjakan' },
  { status: 'revisions', title: 'Revisi' },
  { status: 'done', title: 'Selesai' },
];

// Smart drop collision detection: partitions the kanban board horizontally into column lanes
// This guarantees 100% drop accuracy regardless of height differences between empty/full columns
const smartColumnCollision: CollisionDetection = (args) => {
  const { droppableContainers, pointerCoordinates, collisionRect } = args;
  if (!droppableContainers || droppableContainers.length === 0) return [];

  // Determine reference X coordinate (cursor pointer X if available, else dragged card center X)
  const refX = pointerCoordinates
    ? pointerCoordinates.x
    : collisionRect
    ? collisionRect.left + collisionRect.width / 2
    : null;

  if (refX !== null) {
    // Collect and sort droppable columns by their horizontal screen position (left to right)
    const columns = droppableContainers
      .map((container) => ({
        container,
        rect: container.rect.current,
      }))
      .filter((item): item is { container: typeof droppableContainers[0]; rect: DOMRect } => !!item.rect)
      .sort((a, b) => a.rect.left - b.rect.left);

    if (columns.length > 0) {
      // Find the column lane where refX falls between the midpoints of adjacent columns
      for (let i = 0; i < columns.length; i++) {
        const curr = columns[i];
        const prev = columns[i - 1];
        const next = columns[i + 1];

        const leftBoundary = prev ? (prev.rect.right + curr.rect.left) / 2 : -Infinity;
        const rightBoundary = next ? (curr.rect.right + next.rect.left) / 2 : Infinity;

        if (refX >= leftBoundary && refX <= rightBoundary) {
          return [{ id: curr.container.id }];
        }
      }

      // Fallback: pick the closest column by horizontal center distance
      let closest = columns[0];
      let minDistance = Infinity;
      for (const col of columns) {
        const centerX = col.rect.left + col.rect.width / 2;
        const dist = Math.abs(refX - centerX);
        if (dist < minDistance) {
          minDistance = dist;
          closest = col;
        }
      }
      return [{ id: closest.container.id }];
    }
  }

  // Fallback if coordinates unavailable
  return pointerWithin(args);
};

// Snaps the dragged card so the mouse cursor is anchored precisely at the top-center
const snapTopCenterToCursor: Modifier = ({ transform, activeNodeRect, activatorEvent }) => {
  if (!activeNodeRect || !activatorEvent) {
    return transform;
  }

  const clientX = 'clientX' in activatorEvent ? (activatorEvent as MouseEvent).clientX : undefined;
  const clientY = 'clientY' in activatorEvent ? (activatorEvent as MouseEvent).clientY : undefined;

  if (clientX === undefined || clientY === undefined) {
    return transform;
  }

  const grabOffsetX = clientX - activeNodeRect.left;
  const grabOffsetY = clientY - activeNodeRect.top;

  // Center horizontally and anchor 10px below cursor pointer
  const deltaX = grabOffsetX - (activeNodeRect.width / 2);
  const deltaY = grabOffsetY - 10;

  return {
    ...transform,
    x: transform.x + deltaX,
    y: transform.y + deltaY,
  };
};

export const Board = memo(function Board({
  jobs,
  currentUser,
  divisions = [],
  onMoveJob,
  onCardClick,
  onAssignClick,
  onArchiveJob,
  onUnarchiveJob,
  onArchiveAllDone,
  filterDivision,
  filterSearch,
  remotelyDraggedJobIds = new Set(),
  onDragStateChange,
  lastDropEvent,
}: BoardProps) {
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [localDropEvent, setLocalDropEvent] = useState<CardDropEvent | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const savedTiltRef = useRef<number>(0);
  const lastPointerXRef = useRef<number | null>(null);
  const tiltDecayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts to allow normal clicks
      },
    })
  );

  // Separate active kanban jobs from archived table jobs
  const activeJobs = jobs.filter((j) => !j.isArchived);
  const archivedJobs = jobs.filter((j) => !!j.isArchived);

  // Filter active jobs by division and search query
  const filteredJobs = activeJobs.filter((job) => {
    if (filterDivision && job.divisionId !== filterDivision) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const matchTitle = job.title.toLowerCase().includes(q);
      const matchDesc = job.description?.toLowerCase().includes(q);
      const matchDiv = job.divisionName?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchDiv) return false;
    }
    return true;
  });

  const getJobsByStatus = (status: JobStatus) => {
    return filteredJobs.filter((job) => job.status === status);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setLocalDropEvent(null);
    savedTiltRef.current = 0;
    const { active } = event;
    const job = jobs.find((j) => j.id === active.id);
    if (job) {
      setActiveJob(job);
      onDragStateChange?.(job);

      const activatorEvent = (event as any).activatorEvent;
      if (activatorEvent) {
        lastPointerXRef.current = 'clientX' in activatorEvent ? activatorEvent.clientX : null;
      } else {
        lastPointerXRef.current = null;
      }
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const actEvent = (event as any).activatorEvent;
    if (actEvent) {
      const actX = 'clientX' in actEvent ? actEvent.clientX : 0;
      const currentX = actX + event.delta.x;

      if (lastPointerXRef.current !== null) {
        const vx = currentX - lastPointerXRef.current;
        if (Math.abs(vx) > 0.2) {
          const targetTilt = Math.max(-8.5, Math.min(8.5, vx * 0.45));
          savedTiltRef.current = targetTilt;
          if (overlayRef.current) {
            overlayRef.current.style.setProperty('--card-tilt', `${targetTilt}deg`);
          }

          if (tiltDecayTimerRef.current) clearTimeout(tiltDecayTimerRef.current);
          tiltDecayTimerRef.current = setTimeout(() => {
            savedTiltRef.current = 0;
            if (overlayRef.current) {
              overlayRef.current.style.setProperty('--card-tilt', '0deg');
            }
          }, 140);
        }
      }
      lastPointerXRef.current = currentX;
    }
  };

  const getReleaseWorldCoords = (event: DragEndEvent | DragCancelEvent) => {
    let releaseWorldX: number | undefined;
    let releaseWorldY: number | undefined;

    const boardEl = document.querySelector('.kanban-board');
    const actEvent = (event as any).activatorEvent;
    if (boardEl && actEvent) {
      const bRect = boardEl.getBoundingClientRect();
      const delta = event.delta;
      const initialClientX = 'clientX' in actEvent ? actEvent.clientX : bRect.left;
      const initialClientY = 'clientY' in actEvent ? actEvent.clientY : bRect.top;
      const currentClientX = initialClientX + delta.x;
      const currentClientY = initialClientY + delta.y;
      releaseWorldX = currentClientX - bRect.left;
      releaseWorldY = currentClientY - bRect.top;
    }
    return { releaseWorldX, releaseWorldY };
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const finalTilt = savedTiltRef.current;
    setActiveJob(null);
    onDragStateChange?.(null);
    savedTiltRef.current = 0;
    lastPointerXRef.current = null;
    if (tiltDecayTimerRef.current) clearTimeout(tiltDecayTimerRef.current);

    const activeJobId = active.id as string;
    const sourceJob = jobs.find((j) => j.id === activeJobId);
    if (!sourceJob) return;

    const { releaseWorldX, releaseWorldY } = getReleaseWorldCoords(event);

    const overId = over?.id as string | undefined;
    let targetStatus: JobStatus | null = null;

    if (overId) {
      if (COLUMNS.some((col) => col.status === overId)) {
        targetStatus = overId as JobStatus;
      } else {
        const overJob = jobs.find((j) => j.id === overId);
        if (overJob) {
          targetStatus = overJob.status;
        }
      }
    }

    // Always trigger drop lerp event (either into target column or back to original home slot)
    const effectiveTargetStatus = targetStatus || sourceJob.status;
    const dropEvt: CardDropEvent = {
      jobId: activeJobId,
      toStatus: effectiveTargetStatus,
      releaseWorldX,
      releaseWorldY,
      releaseTilt: finalTilt,
    };
    setLocalDropEvent(dropEvt);

    if (targetStatus && targetStatus !== sourceJob.status) {
      await onMoveJob(activeJobId, targetStatus, {
        worldX: releaseWorldX,
        worldY: releaseWorldY,
      });
    }
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    const { active } = event;
    const finalTilt = savedTiltRef.current;
    setActiveJob(null);
    onDragStateChange?.(null);
    savedTiltRef.current = 0;
    lastPointerXRef.current = null;
    if (tiltDecayTimerRef.current) clearTimeout(tiltDecayTimerRef.current);

    const activeJobId = active.id as string;
    const sourceJob = jobs.find((j) => j.id === activeJobId);
    if (!sourceJob) return;

    const { releaseWorldX, releaseWorldY } = getReleaseWorldCoords(event);
    const dropEvt: CardDropEvent = {
      jobId: activeJobId,
      toStatus: sourceJob.status,
      releaseWorldX,
      releaseWorldY,
      releaseTilt: finalTilt,
    };
    setLocalDropEvent(dropEvt);
  };

  const effectiveDropEvent = localDropEvent || lastDropEvent;

  return (
    <div className="board-container">
      <div className="board-canvas-flow">
        {/* Kanban Board Section with Figma-styled Header */}
        <section className="kanban-section-wrapper" aria-label="Kanban Pipeline COPM">
          {/* Top Header Bar */}
          <div className="kanban-top-bar">
            <div className="kanban-title-group">
              <h3 className="kanban-main-title">Kanban Pipeline COPM</h3>
              <span className="kanban-count-badge">
                {filteredJobs.length !== activeJobs.length
                  ? `${filteredJobs.length} dari ${activeJobs.length} request`
                  : `${activeJobs.length} request`}
              </span>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={smartColumnCollision}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="kanban-board">
              {COLUMNS.map((col, index) => (
                <React.Fragment key={col.status}>
                  <Column
                    status={col.status}
                    title={col.title}
                    jobs={getJobsByStatus(col.status)}
                    currentUser={currentUser}
                    onCardClick={onCardClick}
                    onAssignClick={onAssignClick}
                    onArchiveJob={onArchiveJob}
                    onArchiveAllDone={onArchiveAllDone}
                    remotelyDraggedJobIds={remotelyDraggedJobIds}
                    lastDropEvent={effectiveDropEvent}
                  />
                  {index < COLUMNS.length - 1 && (
                    <div className="pipeline-connector" aria-hidden="true">
                      <ChevronRight size={16} strokeWidth={1.8} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            <DragOverlay
              modifiers={[snapTopCenterToCursor]}
              dropAnimation={null}
            >
              {activeJob ? (
                <div
                  ref={overlayRef}
                  className="local-dragged-card-overlay"
                  style={{
                    '--card-tilt': '0deg',
                  } as React.CSSProperties}
                >
                  <JobCard
                    job={activeJob}
                    currentUser={currentUser}
                    onCardClick={() => { }}
                    onAssignClick={() => { }}
                    isDraggable={false}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>

        {/* Figma Native Archive Table below Kanban Board */}
        <ArchiveTable
          archivedJobs={archivedJobs}
          currentUser={currentUser}
          divisions={divisions}
          onCardClick={onCardClick}
        />
      </div>
    </div>
  );
});

