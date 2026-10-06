'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { Plus, ListFilter, Shapes, Search, TrendingUp } from 'lucide-react';
import { Profile, Division } from '@/types';
import { SimpleSelect } from '@/components/ui/Select';
import { useSafeZone } from '@/hooks/useSafeZone';
import { useAnimatePresence } from '@/hooks/useAnimatePresence';

interface FloatingToolbarProps {
  currentUser: Profile;
  divisions: Division[];
  filterDivision: string | null;
  setFilterDivision: (divId: string | null) => void;
  filterSearch: string;
  setFilterSearch: (query: string) => void;
  onOpenNewJob: () => void;
  onOpenDivisions: () => void;
  isGraphOpen?: boolean;
  onOpenGraph?: () => void;
  onDropdownChange?: (state: string | null) => void;
}

export const FloatingToolbar = memo(function FloatingToolbar({
  currentUser,
  divisions,
  filterDivision,
  setFilterDivision,
  filterSearch,
  setFilterSearch,
  onOpenNewJob,
  onOpenDivisions,
  isGraphOpen = false,
  onOpenGraph,
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

  // Auto-reset filter if selected division is not in current page
  useEffect(() => {
    if (filterDivision && !divisions.some((d) => d.id === filterDivision)) {
      setFilterDivision(null);
    }
  }, [divisions, filterDivision, setFilterDivision]);

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
                <SimpleSelect
                  variant="dark"
                  size="sm"
                  className="toolbar-select"
                  value={filterDivision || 'all'}
                  onChange={(val) => setFilterDivision(val === 'all' ? null : val)}
                  options={[
                    { value: 'all', label: 'Semua Divisi' },
                    ...divisions.map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
              </div>
            </div>
          )}

          <button
            className={`toolbar-btn ${isFilterOpen ? 'active-popover' : ''}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            title="Filter board"
          >
            <ListFilter size={13} strokeWidth={2.2} />
            <span>Filter</span>
            {hasActiveFilters && <span className="filter-active-dot" />}
          </button>
        </div>

        {/* 3. Performance Line Chart Graph Button */}
        {onOpenGraph && (
          <button
            className={`toolbar-btn toolbar-btn-collapse ${isGraphOpen ? 'active-popover' : ''}`}
            onClick={onOpenGraph}
            title="Grafik Performa & Penyelesaian Job"
          >
            <TrendingUp size={13} strokeWidth={2.2} />
            <span className="toolbar-btn-text">Grafik</span>
          </button>
        )}

        {/* 4. Admin Tools */}
        {currentUser.role === 'admin' && (
          <button className="toolbar-btn toolbar-btn-collapse" onClick={onOpenDivisions} title="Kelola Divisi">
            <Shapes size={13} strokeWidth={2.2} />
            <span className="toolbar-btn-text">Divisi</span>
          </button>
        )}
      </div>
    </div>
  );
});
