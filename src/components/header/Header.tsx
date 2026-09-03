'use client';

import React, { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Page, Profile, OnlineUser, AppNotification, UserRole } from '@/types';
import { PageSwitcher } from './PageSwitcher';
import { NotificationInbox } from './NotificationInbox';
import { ApprovalDropdown } from './ApprovalDropdown';
import { Avatar } from '@/components/ui/Avatar';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';
import { getRelativeTime, getWhatsAppUrl } from '@/lib/utils';
import { User, LogOut } from 'lucide-react';

interface HeaderProps {
  pages: Page[];
  currentPage: Page;
  currentUser: Profile;
  allUsers?: Profile[];
  onlineUsers: OnlineUser[];
  notifications?: AppNotification[];
  pendingUsers?: Profile[];
  onMarkAsRead?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onClearAllNotifications?: () => void;
  onSelectJob?: (jobId: string) => void;
  onSelectPage: (page: Page) => void;
  onOpenCreatePage: () => void;
  onDeletePage?: (pageId: string) => Promise<void>;
  onRenamePage?: (pageId: string, name: string) => Promise<void>;
  onApproveUser?: (userId: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  onRejectUser?: (userId: string) => Promise<{ success: boolean; error?: string }>;
  onSignOut?: () => void;
  onOpenEditProfile?: () => void;
  onDropdownChange?: (state: string | null) => void;
}

export const Header = memo(function Header({
  pages,
  currentPage,
  currentUser,
  allUsers = [],
  onlineUsers = [],
  notifications = [],
  pendingUsers = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAllNotifications,
  onSelectJob,
  onSelectPage,
  onOpenCreatePage,
  onDeletePage,
  onRenamePage,
  onApproveUser,
  onRejectUser,
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

  const otherCollaborators = useMemo(() => {
    return (onlineUsers || []).filter((u) => u.userId !== currentUser.id);
  }, [onlineUsers, currentUser.id]);

  // Derive other users / previously viewed collaborators
  const previouslyViewedUsers = useMemo(() => {
    const onlineMap = new Map((onlineUsers || []).map((u) => [u.userId, u]));

    // Start with all known registered users
    const userMap = new Map<string, Profile>();
    for (const u of allUsers) {
      if (u.id !== currentUser.id && u.isApproved !== false) {
        userMap.set(u.id, u);
      }
    }

    // ALWAYS merge in onlineUsers so new/active collaborators appear immediately
    for (const ou of onlineUsers || []) {
      if (ou.userId && ou.userId !== currentUser.id) {
        const existing = userMap.get(ou.userId);
        if (existing) {
          userMap.set(ou.userId, {
            ...existing,
            fullName: ou.userName || existing.fullName,
            avatarUrl: ou.userAvatar !== undefined ? ou.userAvatar : existing.avatarUrl,
            lastSeenAt: ou.onlineAt || existing.lastSeenAt,
          });
        } else {
          userMap.set(ou.userId, {
            id: ou.userId,
            email: '',
            fullName: ou.userName,
            avatarUrl: ou.userAvatar,
            role: ou.role,
            divisionId: null,
            isApproved: true,
            lastSeenAt: ou.onlineAt,
            createdAt: ou.onlineAt,
            updatedAt: ou.onlineAt,
          });
        }
      }
    }

    const candidateUsers = Array.from(userMap.values());

    return candidateUsers.sort((a, b) => {
      const aIsOnline = onlineMap.has(a.id);
      const bIsOnline = onlineMap.has(b.id);
      if (aIsOnline && !bIsOnline) return -1;
      if (!aIsOnline && bIsOnline) return 1;

      const timeA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : new Date(a.updatedAt).getTime();
      const timeB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });
  }, [allUsers, currentUser.id, onlineUsers]);

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

      {/* 2. Right Cluster: Notifications + Approvals + Collaborators + User Menu */}
      <div className="header-right">
        <div className="figjam-right-widget">
          {/* Admin User Approval Dropdown */}
          {currentUser.role === 'admin' && onApproveUser && onRejectUser && (
            <ApprovalDropdown
              pendingUsers={pendingUsers}
              onApprove={onApproveUser}
              onReject={onRejectUser}
              onDropdownChange={onDropdownChange}
            />
          )}

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

            {/* Figma-Native Collaborator & Account Dropdown Popover */}
            {shouldRenderUserMenu && (
              <div
                ref={profileCardRef}
                className={`figma-profile-popover ${isUserMenuClosing ? 'is-closing' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Current User Row */}
                <div className="figma-profile-me-row">
                  <Avatar
                    src={currentUser.avatarUrl}
                    name={currentUser.fullName}
                    size={30}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <div className="figma-profile-me-name">
                      {currentUser.fullName} <span style={{ opacity: 0.7, fontWeight: 400 }}>(You)</span>
                    </div>
                    <span className="figma-profile-me-email">
                      {currentUser.email}
                    </span>
                  </div>
                  <span className={`role-badge ${currentUser.role}`}>
                    {currentUser.role.toUpperCase()}
                  </span>
                </div>

                {/* Quick Action Buttons: Edit Akun & Keluar */}
                <div className="figma-profile-top-actions">
                  {onOpenEditProfile && (
                    <button
                      type="button"
                      className="figma-profile-btn-secondary"
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenEditProfile();
                      }}
                      title="Edit Profil Akun"
                    >
                      <User size={13} />
                      <span>Edit Akun</span>
                    </button>
                  )}
                  {onSignOut && (
                    <button
                      type="button"
                      className="figma-profile-btn-danger"
                      onClick={() => {
                        setShowUserMenu(false);
                        onSignOut();
                      }}
                      title="Keluar dari akun"
                    >
                      <LogOut size={13} />
                      <span>Keluar</span>
                    </button>
                  )}
                </div>

                <div className="figma-profile-divider" />

                {/* Previously Viewed / Collaborators Section */}
                <div className="figma-collab-section">
                  <span className="figma-collab-section-title">Previously viewed</span>
                  <div className="figma-collab-list no-scrollbar">
                    {previouslyViewedUsers.length > 0 ? (
                      previouslyViewedUsers.map((user) => {
                        const isOnline = (onlineUsers || []).some((ou) => ou.userId === user.id);
                        const whatsappUrl = getWhatsAppUrl(user.phoneNumber);
                        const collaboratorContent = (
                          <>
                            <div className="figma-collab-avatar-slot">
                              <Avatar
                                src={user.avatarUrl}
                                name={user.fullName}
                                size={28}
                              />
                              {isOnline && <span className="figma-collab-online-badge" />}
                            </div>

                            <div className="figma-collab-info">
                              <span className="figma-collab-name">{user.fullName}</span>
                              <span className={`figma-collab-status ${isOnline ? 'online' : ''}`}>
                                {isOnline ? 'Online sekarang' : getRelativeTime(user.lastSeenAt || user.updatedAt || user.createdAt)}
                              </span>
                            </div>
                          </>
                        );

                        if (whatsappUrl) {
                          return (
                            <a
                              key={user.id}
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="figma-collab-row"
                              title={`Chat WhatsApp dengan ${user.fullName}`}
                            >
                              {collaboratorContent}
                            </a>
                          );
                        }

                        return (
                          <div
                            key={user.id}
                            className="figma-collab-row"
                            title={`${user.fullName} (${user.email || user.role})`}
                          >
                            {collaboratorContent}
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: '11px', color: '#6b7280', padding: '6px 8px' }}>
                        Belum ada kolaborator lain
                      </span>
                    )}
                  </div>
                </div>

                <div className="figma-profile-divider" />

                {/* Creator Credit Footer Link */}
                <a
                  href="https://github.com/gimigkk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="figma-profile-credit-link"
                  title="Kunjungi profil GitHub @gimigkk"
                >
                  Made with ♡ by <span className="figma-profile-credit-handle">@gimigkk</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});
