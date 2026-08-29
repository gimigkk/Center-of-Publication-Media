import React from 'react';

interface GoogleDocsIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function GoogleDocsIcon({
  size = 18,
  className = '',
  style,
}: GoogleDocsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      {/* Main Document Body */}
      <path
        d="M14.5 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V7.5L14.5 2Z"
        fill="#2684FC"
      />
      {/* Top Right Corner Fold Under-Shadow */}
      <path
        d="M14 2V6.8C14 7.46274 14.5373 8 15.2 8H20L14 2Z"
        fill="#0056C7"
        opacity="0.2"
      />
      {/* Top Right Corner Fold */}
      <path
        d="M14 2V6.8C14 7.46274 14.5373 8 15.2 8H20L14 2Z"
        fill="#A1C2FA"
      />
      {/* White Document Text Bars */}
      <rect x="7" y="11" width="10" height="2" rx="1" fill="#FFFFFF" />
      <rect x="7" y="15" width="6.5" height="2" rx="1" fill="#FFFFFF" />
    </svg>
  );
}
