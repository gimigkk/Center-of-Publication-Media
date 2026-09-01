'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Hook to handle smooth mount & unmount animations in React.
 * Keeps the component in the DOM with `isClosing: true` until the exit animation finishes.
 */
export function useAnimatePresence(isOpen: boolean, durationMs = 140) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Defer state updates out of the effect body to avoid cascading renders.
    const frame = window.setTimeout(() => {
      if (isOpen) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setShouldRender(true);
        setIsClosing(false);
      } else {
        setIsClosing(true);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setShouldRender(false);
          setIsClosing(false);
          timeoutRef.current = null;
        }, durationMs);
      }
    }, 0);

    return () => window.clearTimeout(frame);
  }, [isOpen, durationMs]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { shouldRender, isClosing };
}
