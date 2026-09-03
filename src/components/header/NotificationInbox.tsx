'use client';

import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { Bell, CheckCheck, Trash2, ArrowRight } from 'lucide-react';
import { AppNotification, Profile } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface NotificationInboxProps {
  notifications: AppNotification[];
  currentUser?: Profile;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll?: () => void;
  onSelectJob?: (jobId: string) => void;
  onDropdownChange?: (state: string | null) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diffSec < 60) return 'Baru saja';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m lalu`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}j lalu`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}h lalu`;
    return new Date(dateString).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

type TabFilter = 'all' | 'unread';

export const NotificationInbox = memo(function NotificationInbox({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onSelectJob,
  onDropdownChange,
}: NotificationInboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { shouldRender, isClosing } = useAnimatePresence(isOpen, 110);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const displayedNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, activeTab]);

  useEffect(() => {
    onDropdownChange?.(isOpen ? 'Membuka Notifikasi' : null);
  }, [isOpen, onDropdownChange]);

  // Safe-zone cursor tracking: auto-dismiss if cursor leaves safe corridor
  useSafeZone({
    isOpen,
    onClose: () => setIsOpen(false),
    triggerRef: buttonRef,
    panelRef: popoverRef,
    options: {
      safePadding: 70,
      debounceMs: 120,
    },
  });

  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.isRead) {
      onMarkAsRead(notif.id);
    }
    if (notif.jobId && onSelectJob) {
      onSelectJob(notif.jobId);
      setIsOpen(false);
    }
  };

  const renderNotificationMessage = (notif: AppNotification) => {
    const actorName = notif.actorName?.split(' (')[0] || notif.actorName || 'Seseorang';
    const targetTitle = notif.jobTitle ? `"${notif.jobTitle}"` : '';

    switch (notif.type) {
      case 'job_created':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> mengajukan request <span className="figma-notif-target">{targetTitle}</span>
          </>
        );
      case 'job_assigned':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> menugaskan Anda ke <span className="figma-notif-target">{targetTitle}</span>
          </>
        );
      case 'job_revisions':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> meminta revisi pada <span className="figma-notif-target">{targetTitle}</span>
          </>
        );
      case 'job_status_changed':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> memperbarui draft untuk <span className="figma-notif-target">{targetTitle}</span>
          </>
        );
      case 'job_completed':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> menandai <span className="figma-notif-target">{targetTitle}</span> selesai
          </>
        );
      case 'deliverable_uploaded':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> mengunggah hasil desain untuk <span className="figma-notif-target">{targetTitle}</span>
          </>
        );
      case 'user_signup_pending':
        return (
          <>
            <span className="figma-notif-actor">{actorName}</span> mendaftar akun baru dan menunggu approval
          </>
        );
      case 'user_approved':
        return (
          <>
            Akun Anda telah <strong style={{ color: '#10b981' }}>disetujui</strong> oleh Admin
          </>
        );
      default:
        return <span>{notif.message}</span>;
    }
  };

  return (
    <div className="figjam-inbox-wrapper">
      <button
        ref={buttonRef}
        type="button"
        className={`figjam-inbox-btn ${isOpen ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={unreadCount > 0 ? `${unreadCount} notifikasi belum dibaca` : 'Notifikasi'}
        aria-label="Notification Inbox"
      >
        <Bell size={15} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="inbox-badge-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {shouldRender && (
        <div
          ref={popoverRef}
          className={`figma-inbox-popover ${isClosing ? 'is-closing' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Header with Title & Tabs in 1 Row */}
          <div className="figma-inbox-header">
            <div className="figma-inbox-header-row">
              <span className="figma-inbox-title">Notifikasi</span>

              <div className="figma-inbox-header-right">
                {/* Segmented Tabs (Semua / Belum Dibaca) */}
                <div className="figma-inbox-tabs">
                  <button
                    type="button"
                    className={`figma-inbox-tab ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveTab('all')}
                  >
                    Semua
                    {notifications.length > 0 && (
                      <span className="figma-tab-count">{notifications.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`figma-inbox-tab ${activeTab === 'unread' ? 'active' : ''}`}
                    onClick={() => setActiveTab('unread')}
                  >
                    Belum Dibaca
                    {unreadCount > 0 && <span className="figma-tab-unread-pill">{unreadCount}</span>}
                  </button>
                </div>

                {/* Quick Actions */}
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="figma-inbox-icon-action"
                    onClick={onMarkAllAsRead}
                    title="Tandai semua dibaca"
                  >
                    <CheckCheck size={13} strokeWidth={2} />
                  </button>
                )}
                {notifications.length > 0 && onClearAll && (
                  <button
                    type="button"
                    className="figma-inbox-icon-action delete"
                    onClick={onClearAll}
                    title="Bersihkan semua"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 3. Notification Stream List */}
          <div className="figma-inbox-body no-scrollbar">
            {displayedNotifications.length === 0 ? (
              <div className="figma-inbox-empty">
                <span className="figma-inbox-empty-sub">
                  {activeTab === 'unread'
                    ? 'Semua notifikasi sudah dibaca.'
                    : 'Aktivitas job dan assignment akan muncul secara real-time di sini.'}
                </span>
              </div>
            ) : (
              <div className="figma-notif-list">
                {displayedNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`figma-notif-row ${!notif.isRead ? 'is-unread' : ''} ${
                      notif.jobId ? 'is-clickable' : ''
                    }`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    {/* Left: Avatar */}
                    <div className="figma-notif-avatar-slot">
                      <Avatar
                        src={notif.actorAvatar || ''}
                        name={notif.actorName || 'User'}
                        size={28}
                        className="figma-notif-avatar"
                      />
                    </div>

                    {/* Middle: Conversational text & comment snippet */}
                    <div className="figma-notif-content">
                      <div className="figma-notif-text">
                        {renderNotificationMessage(notif)}
                      </div>

                      {notif.note && (
                        <div className="figma-notif-note-bubble">
                          &ldquo;{notif.note}&rdquo;
                        </div>
                      )}

                      <div className="figma-notif-footer-meta">
                        <span className="figma-notif-timestamp">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                        {notif.jobId && (
                          <span className="figma-notif-open-cue">
                            Buka job <ArrowRight size={10} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Unread Blue Dot */}
                    {!notif.isRead && (
                      <div className="figma-notif-unread-indicator" title="Belum dibaca" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
