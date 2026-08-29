'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { Page, Profile, OnlineUser, AppNotification } from '@/types';
import { PageSwitcher } from './PageSwitcher';
import { NotificationInbox } from './NotificationInbox';
import { Avatar } from '@/components/ui/Avatar';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface HeaderProps {
  pages: Page[];
  currentPage: Page;
  currentUser: Profile;
  onlineUsers: OnlineUser[];
  notifications?: AppNotification[];
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onClearAllNotifications?: () => void;
  onSelectJob?: (jobId: string) => void;
  onSelectPage: (page: Page) => void;
  onOpenCreatePage: () => void;
  onDeletePage?: (pageId: string) => Promise<void>;
  onRenamePage?: (pageId: string, name: string) => Promise<void>;
  onSignOut?: () => void;
  onDropdownChange?: (state: string | null) => void;
}


export const Header = memo(function Header({
  pages,
  currentPage,
  currentUser,
  onlineUsers,
  notifications = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAllNotifications,
  onSelectJob,
  onSelectPage,
  onOpenCreatePage,
  onDeletePage,
  onRenamePage,
  onSignOut,
  onDropdownChange,
}: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileCardRef = useRef<HTMLDivElement>(null);

  const { shouldRender: shouldRenderUserMenu, isClosing: isUserMenuClosing } = useAnimatePresence(
    showUserMenu,
    110
  );

  useEffect(() => {
    onDropdownChange?.(showUserMenu ? 'Membuka Menu Profil' : null);
  }, [showUserMenu, onDropdownChange]);

  // Safe-zone cursor tracking: auto-dismiss if cursor leaves safe corridor
  useSafeZone({
    isOpen: showUserMenu,
    onClose: () => setShowUserMenu(false),
    triggerRef: profileButtonRef,
    panelRef: profileCardRef,
    options: {
      safePadding: 60,
      debounceMs: 120,
    },
  });

  return (
    <header className="figjam-floating-header">
      {/* 1. Left Cluster: Page Switcher */}
      <div className="header-left">
        <PageSwitcher
          pages={pages}
          currentPage={currentPage}
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          onSelectPage={onSelectPage}
          onOpenCreatePage={onOpenCreatePage}
          onDeletePage={onDeletePage}
          onRenamePage={onRenamePage}
          onDropdownChange={onDropdownChange}
        />
      </div>


      {/* 2. Right Cluster: Notifications + Collaborators + User Menu */}
      <div className="header-right">
        <div className="figjam-right-widget">
          {/* Notification Inbox */}
          <NotificationInbox
            notifications={notifications}
            currentUser={currentUser}
            onMarkAsRead={onMarkAsRead || (() => {})}
            onMarkAllAsRead={onMarkAllAsRead || (() => {})}
            onClearAll={onClearAllNotifications}
            onSelectJob={onSelectJob}
            onDropdownChange={onDropdownChange}
          />

          <div className="figjam-widget-divider" />

          {/* Connected Live Collaborator Avatars */}
          <div className="collaborator-avatars-cluster">
            {onlineUsers
              .filter((u) => u.userId !== currentUser.id)
              .slice(0, 4)
              .map((u) => (
                <div key={u.userId} className="collaborator-avatar-wrapper" title={`${u.userName} (Online)`}>
                  <Avatar
                    src={u.userAvatar}
                    name={u.userName}
                    size={26}
                    className="collaborator-avatar-item"
                  />
                  <span className="collaborator-live-dot" />
                </div>
              ))}
          </div>

          {/* Active User Profile & Menu */}
          <div className="user-profile-cluster">
            <button
              ref={profileButtonRef}
              type="button"
              className={`user-profile-trigger ${showUserMenu ? 'active' : ''}`}
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="User profile menu"
            >
              <div className="current-user-avatar-wrapper">
                <Avatar
                  src={currentUser.avatarUrl}
                  name={currentUser.fullName}
                  size={28}
                  className="current-user-avatar-item"
                />
              </div>
            </button>

            {shouldRenderUserMenu && (
              <div
                ref={profileCardRef}
                className={`figjam-pages-card ${isUserMenuClosing ? 'is-closing' : ''}`}
                style={{ right: 0, left: 'auto', width: '220px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {currentUser.fullName}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {currentUser.email}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`role-badge ${currentUser.role}`} style={{ fontSize: '10px' }}>
                      {currentUser.role.toUpperCase()}
                    </span>
                  </div>
                </div>

                {onSignOut && (
                  <button
                    className="persona-row-item"
                    onClick={() => {
                      setShowUserMenu(false);
                      onSignOut();
                    }}
                    style={{ color: 'var(--accent-red-text)', margin: '4px' }}
                  >
                    <span>Keluar</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});
