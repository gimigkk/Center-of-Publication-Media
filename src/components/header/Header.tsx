'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { Page, Profile, OnlineUser, AppNotification } from '@/types';
import { PageSwitcher } from './PageSwitcher';
import { NotificationInbox } from './NotificationInbox';
import { Avatar } from '@/components/ui/Avatar';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';
import { User, LogOut } from 'lucide-react';

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
  onOpenEditProfile?: () => void;
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
  onOpenEditProfile,
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

  const otherCollaborators = (onlineUsers || []).filter((u) => u.userId !== currentUser.id);

  return (
    <header className="figjam-header">
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

          {/* Current user profile & stacked collaborator avatars */}
          <div className="user-profile-menu-wrapper">
            <button
              ref={profileButtonRef}
              type="button"
              className="user-profile-btn"
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={`${currentUser.fullName} (${currentUser.email})`}
            >
              <div className="figma-avatar-cluster">
                {otherCollaborators.slice(0, 4).map((user) => (
                  <div
                    key={user.userId}
                    className="collaborator-avatar-wrapper"
                    title={`${user.userName} (${user.role})`}
                  >
                    <Avatar
                      src={user.userAvatar}
                      name={user.userName}
                      size={28}
                      className="collaborator-avatar-item"
                    />
                  </div>
                ))}
                <Avatar
                  src={currentUser.avatarUrl}
                  name={currentUser.fullName}
                  size={28}
                  className="current-user-avatar-item"
                />
              </div>

              <div className="user-profile-text-group">
                <span className="user-profile-name">{currentUser.fullName}</span>
                <span className="user-profile-email">{currentUser.email}</span>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
                  {onOpenEditProfile && (
                    <button
                      type="button"
                      className="persona-row-item"
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenEditProfile();
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: 'var(--radius-sm)' }}
                    >
                      <User size={14} color="var(--text-secondary)" />
                      <span>Edit Profil</span>
                    </button>
                  )}

                  {onSignOut && (
                    <button
                      type="button"
                      className="persona-row-item"
                      onClick={() => {
                        setShowUserMenu(false);
                        onSignOut();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 8px',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--accent-red-text)',
                      }}
                    >
                      <LogOut size={14} color="var(--accent-red)" />
                      <span>Keluar</span>
                    </button>
                  )}
                </div>
              </div>

            )}
          </div>
        </div>
      </div>
    </header>
  );

});
