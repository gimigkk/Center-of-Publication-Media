'use client';

import { useEffect, useRef } from 'react';

interface ModalEntry {
  id: number;
  onClose: () => void;
}

let modalCounter = 0;
const modalStack: ModalEntry[] = [];
let ignorePopstateCount = 0;
let isPopstateListening = false;

function ensurePopstateListener() {
  if (isPopstateListening || typeof window === 'undefined') return;
  isPopstateListening = true;

  // Strip stale modal indicator from reload if stack is empty
  if (window.history.state?.copmModalId && modalStack.length === 0) {
    const cleanState = { ...window.history.state };
    delete cleanState.copmModalId;
    window.history.replaceState(cleanState, '');
  }

  window.addEventListener('popstate', () => {
    if (ignorePopstateCount > 0) {
      ignorePopstateCount--;
      return;
    }

    if (modalStack.length > 0) {
      const top = modalStack.pop();
      if (top) {
        top.onClose();
      }
    }
  });
}

export function useModalBack({
  isOpen,
  onClose,
  disabled = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 1. History Back Navigation (popstate)
  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen || disabled) return;

    ensurePopstateListener();

    const id = ++modalCounter;
    modalStack.push({
      id,
      onClose: () => onCloseRef.current(),
    });

    window.history.pushState({ ...window.history.state, copmModalId: id }, '');

    return () => {
      const idx = modalStack.findIndex((item) => item.id === id);
      if (idx !== -1) {
        // Closed via UI (backdrop, 'X', escape, submit), not popstate
        modalStack.splice(idx, 1);
        if (window.history.state?.copmModalId === id) {
          ignorePopstateCount++;
          window.history.back();
        }
      }
    };
  }, [isOpen, disabled]);

  // 2. Touch Gestures: Edge swipe right or header swipe down to dismiss
  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen || disabled) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isCandidate = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();

      const target = e.target as HTMLElement | null;
      const isNearLeftEdge = startX <= 48;
      const isHeader = !!target?.closest?.('.modal-header, .simple-modal-header');
      const isBackdrop = !!target?.classList?.contains('modal-backdrop');

      isCandidate = isNearLeftEdge || isHeader || isBackdrop;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isCandidate || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const elapsed = Date.now() - startTime;

      if (elapsed > 450) return;

      // Swipe right from left edge, header, or backdrop (go-back gesture)
      const isSwipeRight = deltaX > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4;

      // Swipe down from header or backdrop (dismiss gesture)
      const target = e.target as HTMLElement | null;
      const isHeaderOrBackdrop =
        !!target?.classList?.contains('modal-backdrop') ||
        !!target?.closest?.('.modal-header, .simple-modal-header');
      const isSwipeDown =
        isHeaderOrBackdrop && deltaY > 70 && Math.abs(deltaY) > Math.abs(deltaX) * 1.4;

      if (isSwipeRight || isSwipeDown) {
        onCloseRef.current();
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen, disabled]);
}
