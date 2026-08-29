'use client';

import { useEffect, useRef, useCallback } from 'react';

interface SafeZoneOptions {
  safePadding?: number; // Generous safe margin around the trigger + panel (default: 60px)
  debounceMs?: number;  // Small grace period for rapid cursor gestures (default: 80ms)
}

/**
 * useSafeZone
 * Automatically closes a dropdown/panel when the cursor moves too far away from
 * the combined safe bounding zone (trigger button + panel + connecting corridor + generous safe margin).
 * Uses cached bounding envelopes to eliminate layout thrashing during mouse movements.
 */
export function useSafeZone({
  isOpen,
  onClose,
  triggerRef,
  panelRef,
  secondaryPanelRef,
  options = {},
}: {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLElement | null>;
  secondaryPanelRef?: React.RefObject<HTMLElement | null>;
  options?: SafeZoneOptions;
}) {
  const { safePadding = 60, debounceMs = 100 } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const boundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);

  const updateBounds = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    const secondaryPanel = secondaryPanelRef?.current;

    if (!trigger && !panel) return;

    const rects: DOMRect[] = [];
    if (trigger) rects.push(trigger.getBoundingClientRect());
    if (panel) rects.push(panel.getBoundingClientRect());
    if (secondaryPanel) rects.push(secondaryPanel.getBoundingClientRect());

    if (rects.length === 0) return;

    boundsRef.current = {
      minX: Math.min(...rects.map((r) => r.left)) - safePadding,
      maxX: Math.max(...rects.map((r) => r.right)) + safePadding,
      minY: Math.min(...rects.map((r) => r.top)) - safePadding,
      maxY: Math.max(...rects.map((r) => r.bottom)) + safePadding,
    };
  }, [triggerRef, panelRef, secondaryPanelRef, safePadding]);

  useEffect(() => {
    if (!isOpen) {
      boundsRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    // Initialize bounds on open
    updateBounds();

    let scrollRaf: number | null = null;
    const handleScrollOrResize = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateBounds();
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!boundsRef.current) {
        updateBounds();
      }

      const bounds = boundsRef.current;
      if (!bounds) return;

      const cursorX = e.clientX;
      const cursorY = e.clientY;

      const isInsideSafeZone =
        cursorX >= bounds.minX &&
        cursorX <= bounds.maxX &&
        cursorY >= bounds.minY &&
        cursorY <= bounds.maxY;

      if (!isInsideSafeZone) {
        if (!timeoutRef.current) {
          timeoutRef.current = setTimeout(() => {
            onClose();
            timeoutRef.current = null;
          }, debounceMs);
        }
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      const secondaryPanel = secondaryPanelRef?.current;

      if (trigger?.contains(target) || panel?.contains(target) || secondaryPanel?.contains(target)) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef, panelRef, secondaryPanelRef, debounceMs, updateBounds]);
}

