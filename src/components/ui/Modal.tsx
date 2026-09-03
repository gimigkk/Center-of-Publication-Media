'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  large?: boolean;
  className?: string;
  maxWidth?: number | string;
  showHeader?: boolean;
  showCloseButton?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  large = false,
  className = '',
  maxWidth,
  showHeader = true,
  showCloseButton = true,
}: ModalProps) {
  const { shouldRender, isClosing } = useAnimatePresence(isOpen, 110);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const style = maxWidth
    ? { maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth }
    : undefined;

  return (
    <div className={`modal-backdrop ${isClosing ? 'is-closing' : ''}`} onClick={onClose}>
      <div
        className={`modal-dialog ${large ? 'large' : ''} ${className} ${isClosing ? 'is-closing' : ''}`}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
            {showCloseButton && (
              <button className="modal-close-btn" onClick={onClose} title="Tutup">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {!showHeader && showCloseButton && (
          <button className="modal-close-btn modal-floating-close-btn" onClick={onClose} title="Tutup">
            <X size={16} />
          </button>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
