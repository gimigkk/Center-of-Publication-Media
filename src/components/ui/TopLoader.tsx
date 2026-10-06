'use client';

import React from 'react';

interface TopLoaderProps {
  isLoading: boolean;
}

export function TopLoader({ isLoading }: TopLoaderProps) {
  if (!isLoading) return null;

  return (
    <div className="copm-top-loader">
      <div className="copm-top-loader-bar" />
    </div>
  );
}
