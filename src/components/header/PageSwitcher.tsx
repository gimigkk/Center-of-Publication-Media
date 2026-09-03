'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal, ChevronDown } from 'lucide-react';
import { Page, Profile, OnlineUser } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

import { FullLogoIEEE } from '@/components/ui/FullLogoIEEE';

interface PageSwitcherProps {
  pages: Page[];
  currentPage: Page;
  currentUser: Profile;
  onlineUsers?: OnlineUser[];
  onSelectPage: (page: Page) => void;
  onOpenCreatePage: () => void;
  onDeletePage?: (pageId: string) => Promise<void>;
  onRenamePage?: (pageId: string, name: string) => Promise<void>;
  onDropdownChange?: (state: string | null) => void;
}

export function PageSwitcher({
  pages,
  currentPage,
  currentUser,
  onlineUsers = [],
  onSelectPage,
  onOpenCreatePage,
  onDeletePage,
  onRenamePage,
  onDropdownChange,
}: PageSwitcherProps) {
  const [isPagesOpen, setIsPagesOpen] = useState(false);
  const [activeMenuPageId, setActiveMenuPageId] = useState<string | null>(null);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { shouldRender: shouldRenderPages, isClosing: isPagesClosing } = useAnimatePresence(isPagesOpen, 110);

  useEffect(() => {
    if (activeMenuPageId) {
      onDropdownChange?.('Membuka Opsi Page');
    } else if (isPagesOpen) {
      onDropdownChange?.('Membuka Menu Pages');
    } else {
      onDropdownChange?.(null);
    }
  }, [isPagesOpen, activeMenuPageId, onDropdownChange]);

  const widgetRef = useRef<HTMLDivElement>(null);
  const pagesCardRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Safe-zone cursor tracking: auto-dismiss if cursor leaves safe corridor/envelope
  useSafeZone({
    isOpen: isPagesOpen,
    onClose: () => {
      setIsPagesOpen(false);
      setActiveMenuPageId(null);
    },
    triggerRef: widgetRef,
    panelRef: pagesCardRef,
    secondaryPanelRef: contextMenuRef,
    options: {
      safePadding: 70,
      debounceMs: 120,
    },
  });

  const handleCopyLink = (page: Page) => {
    navigator.clipboard.writeText(window.location.href);
    setActiveMenuPageId(null);
    alert(`Tautan ke ${page.name} berhasil disalin`);
  };

  const handleStartRename = (page: Page) => {
    setRenamingPageId(page.id);
    setRenameValue(page.name);
    setActiveMenuPageId(null);
  };

  const handleSaveRename = async (pageId: string) => {
    if (renameValue.trim() && onRenamePage) {
      await onRenamePage(pageId, renameValue.trim());
    }
    setRenamingPageId(null);
  };

  const handleDelete = async (pageId: string) => {
    if (pages.length <= 1) {
      alert('Tidak dapat menghapus satu-satunya halaman yang tersisa');
      return;
    }
    if (confirm('Apakah Anda yakin ingin menghapus halaman ini?')) {
      if (onDeletePage) await onDeletePage(pageId);
      setActiveMenuPageId(null);
    }
  };

  return (
    <div className="figjam-top-widget" ref={widgetRef} onClick={() => setIsPagesOpen(!isPagesOpen)}>
      {/* Full IEEE Brand Logo */}
      <div style={{ display: 'flex', alignItems: 'center', paddingRight: '2px' }}>
        <FullLogoIEEE height={18} fill="#ffffff" />
      </div>

      {/* Full-height top-to-bottom divider line with no padding */}
      <div className="figjam-widget-divider" />

      {/* Current Page Name */}
      <span className="figjam-current-page-name" title={currentPage.name}>
        {currentPage.name}
      </span>

      {/* Full-height divider between Page Name and Pages Icon */}
      <div className="figjam-widget-divider" />

      {/* FigJam Overlapping Pages Toggle Button */}
      <button
        className={`figjam-pages-toggle-btn ${isPagesOpen ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsPagesOpen(!isPagesOpen);
        }}
        title="Halaman"
        aria-label="Halaman"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5.5" y="1.5" width="13" height="13" rx="2.5" stroke="#0d99ff" strokeWidth="1.6" fill="none" />
          <rect x="1.5" y="5.5" width="13" height="13" rx="2.5" stroke="#0d99ff" strokeWidth="1.6" fill="rgba(13, 153, 255, 0.25)" />
        </svg>
      </button>

      {/* 3. FigJam Pages Popover Card */}
      {shouldRenderPages && (
        <div
          className={`figjam-pages-card ${isPagesClosing ? 'is-closing' : ''}`}
          ref={pagesCardRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pages-card-header">
            <span className="pages-card-title">Halaman</span>
            <button
              className="pages-add-btn"
              onClick={() => {
                onOpenCreatePage();
              }}
              title="Tambah halaman baru"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="pages-list">
            {pages.map((page) => {
              const isActive = page.id === currentPage.id;
              const isRenaming = renamingPageId === page.id;
              const isMenuOpen = activeMenuPageId === page.id;
              const usersOnThisPage = onlineUsers.filter((u) => u.pageId === page.id);

              return (
                <div
                  key={page.id}
                  className={`page-row-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (!isRenaming) {
                      onSelectPage(page);
                      setActiveMenuPageId(null);
                      setIsPagesOpen(false);
                    }
                  }}
                >
                  {isRenaming ? (
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '2px 6px', fontSize: '12px' }}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleSaveRename(page.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(page.id);
                        if (e.key === 'Escape') setRenamingPageId(null);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.name}</span>
                      {usersOnThisPage.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: 'auto', marginRight: '4px', flexShrink: 0 }}>
                          {usersOnThisPage.slice(0, 3).map((u) => (
                            <div key={u.userId} title={`${u.userName} (${u.role}) sedang melihat halaman ini`}>
                              <Avatar src={u.userAvatar} name={u.userName} size={18} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isActive && !isRenaming && (
                    <button
                      className="page-more-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuPageId(isMenuOpen ? null : page.id);
                      }}
                      title="Opsi halaman"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  )}

                  {/* 4. FigJam Sleek Dark Context Menu */}
                  {isMenuOpen && (
                    <div
                      className="figjam-dark-context-menu"
                      ref={contextMenuRef}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="dark-menu-item"
                        onClick={() => handleCopyLink(page)}
                      >
                        Salin tautan halaman
                      </button>

                      <div className="dark-menu-divider" />

                      <button
                        className="dark-menu-item"
                        onClick={() => handleStartRename(page)}
                      >
                        Ubah nama halaman
                      </button>

                      <button
                        className="dark-menu-item"
                        onClick={() => {
                          onOpenCreatePage();
                          setActiveMenuPageId(null);
                        }}
                      >
                        Duplikasi halaman
                      </button>

                      <div className="dark-menu-divider" />

                      <button
                        className={`dark-menu-item ${pages.length <= 1 ? 'disabled' : ''}`}
                        onClick={() => handleDelete(page.id)}
                        disabled={pages.length <= 1}
                      >
                        Hapus halaman
                      </button>

                      <button
                        className="dark-menu-item disabled"
                        style={{ fontSize: '11px' }}
                      >
                        Buat kerangka Figma Slides
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
