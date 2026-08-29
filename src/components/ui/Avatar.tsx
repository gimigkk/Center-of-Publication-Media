'use client';

import { useState } from 'react';
import { getAvatarColor, getInitials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  title?: string;
}

export function Avatar({ src, name, size = 28, className = '', title }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  const displayTitle = title || name;

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        title={displayTitle}
        onError={() => setImgError(true)}
        className={`user-avatar-img ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          maxWidth: `${size}px`,
          maxHeight: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }

  return (
    <div
      className={`avatar-fallback ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        maxWidth: `${size}px`,
        maxHeight: `${size}px`,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={displayTitle}
    >
      {initials}
    </div>
  );
}
