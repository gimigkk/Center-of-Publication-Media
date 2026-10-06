'use client';

import React, { useEffect, useState } from 'react';

interface TopLoaderProps {
  isLoading: boolean;
}

export function TopLoader({ isLoading }: TopLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let trickleTimer: NodeJS.Timeout;
    let hideTimer: NodeJS.Timeout;

    if (isLoading) {
      setVisible(true);
      setProgress(25);

      // Trickle progress naturally across single pass: 25% -> 60% -> 85%
      trickleTimer = setTimeout(() => {
        setProgress(65);
        trickleTimer = setTimeout(() => {
          setProgress(85);
        }, 300);
      }, 150);
    } else if (visible) {
      // Finish line to 100%
      setProgress(100);
      hideTimer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
    }

    return () => {
      clearTimeout(trickleTimer);
      clearTimeout(hideTimer);
    };
  }, [isLoading, visible]);

  if (!visible) return null;

  return (
    <div className="copm-top-loader">
      <div
        className="copm-top-loader-bar"
        style={{
          transform: `scaleX(${progress / 100})`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
