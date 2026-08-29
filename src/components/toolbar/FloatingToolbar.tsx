'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { Plus, SlidersHorizontal, FolderTree, UserCheck, Search } from 'lucide-react';
import { Profile, Division } from '@/types';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface FloatingToolbarProps {
  currentUser: Profile;
  pendingCount: number;
  divisions: Division[];
  filterDivision: string | null;
  setFilterDivision: (divId: string | null) => void;
  filterSearch: string;
  setFilterSearch: (query: string) => void;
  onOpenNewJob: () => void;
  onOpenDivisions: () => void;
  onOpenApprovals: () => void;
  onDropdownChange?: (state: string | null) => void;
}

export const FloatingToolbar = memo(function FloatingToolbar({
  currentUser,
  pendingCount,
  divisions,
  filterDivision,
  setFilterDivision,
  filterSearch,
  setFilterSearch,
  onOpenNewJob,
  onOpenDivisions,
  onOpenApprovals,
  onDropdownChange,
}: FloatingToolbarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterItemRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { shouldRender: shouldRenderFilter, isClosing: isFilterClosing } = useAnimatePresence(isFilterOpen, 110);

  useEffect(() => {
    onDropdownChange?.(isFilterOpen ? 'Membuka Menu Filter' : null);
  }, [isFilterOpen, onDropdownChange]);

  const hasActiveFilters = Boolean(filterDivision || filterSearch.trim());

  // Safe-zone cursor tracking: auto-dismiss if cursor leaves safe corridor/envelope
  useSafeZone({
    isOpen: isFilterOpen,
    onClose: () => setIsFilterOpen(false),
    triggerRef: filterItemRef,
    panelRef: popoverRef,
    options: {
      safePadding: 70,
      debounceMs: 120,
    },
  });

  const handleClear = () => {
    setFilterDivision(null);
    setFilterSearch('');
  };

  return (
    <div className="floating-toolbar-container">
      <div className="floating-toolbar">
        {/* 1. New Job Card Button */}
        <button className="toolbar-btn primary" onClick={onOpenNewJob}>
          <Plus size={10} strokeWidth={4} />
          <span>REQUEST COPM</span>
        </button>

        <div className="toolbar-divider" />

        {/* 2. Filter Button with Anchored Popover */}
        <div className="toolbar-item-wrapper" ref={filterItemRef}>
          {shouldRenderFilter && (
            <div
              ref={popoverRef}
              className={`toolbar-popover ${isFilterClosing ? 'is-closing' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="toolbar-popover-header">
                <span className="toolbar-popover-title">Filter Kartu</span>
                <button
                  className="toolbar-clear-btn"
                  onClick={handleClear}
                  style={{
                    opacity: hasActiveFilters ? 1 : 0,
                    pointerEvents: hasActiveFilters ? 'auto' : 'none',
                  }}
                >
                  Hapus semua
                </button>
              </div>

              {/* Search Input */}
              <div className="search-input-wrapper">
                <Search size={13} className="search-input-icon" />
                <input
                  type="text"
                  className="toolbar-search-input"
                  placeholder="Cari judul atau catatan..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Division Select */}
              <div className="toolbar-filter-group">
                <label className="toolbar-filter-label">Divisi</label>
                <select
                  className="toolbar-select"
                  value={filterDivision || ''}
                  onChange={(e) => setFilterDivision(e.target.value || null)}
                >
                  <option value="">Semua Divisi</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            className={`toolbar-btn ${isFilterOpen ? 'active-popover' : ''}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title="Filter board"
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
            <span>Filter</span>
            {hasActiveFilters && <span className="filter-active-dot" />}
          </button>
        </div>

        {/* 3. Admin Tools */}
        {currentUser.role === 'admin' && (
          <>
            <button className="toolbar-btn" onClick={onOpenDivisions} title="Kelola Divisi">
              <FolderTree size={13} strokeWidth={2} />
              <span>Divisi</span>
            </button>

            <button className="toolbar-btn" onClick={onOpenApprovals} title="Persetujuan Tertunda">
              <UserCheck size={13} strokeWidth={2} />
              <span>Approval</span>
              {pendingCount > 0 && <span className="badge-count">{pendingCount}</span>}
            </button>
          </>
        )}
      </div>
    </div>
  );
});
