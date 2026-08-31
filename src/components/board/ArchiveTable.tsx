'use client';

import React, { useState, useMemo } from 'react';
import { Job, Profile, Division } from '@/types';
import { Search, Layers } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import {
  ArchiveTableHeader,
  SortField,
  SortOrder,
} from './archive/ArchiveTableHeader';
import { ArchiveTableRow } from './archive/ArchiveTableRow';
import { ArchiveMobileCard } from './archive/ArchiveMobileCard';
import { ARCHIVE_DROP_ZONE_ID } from './Board';
import { compareJobsByDeadline } from '@/lib/utils';

interface ArchiveTableProps {
  archivedJobs: Job[];
  currentUser: Profile;
  divisions: Division[];
  onCardClick: (job: Job) => void;
  /** True when a Kanban card is being dragged (show as drop target) */
  isDropTarget?: boolean;
  /** True when a Kanban card is hovering over this zone */
  isOver?: boolean;
  isDraggable?: boolean;
}

export const ArchiveTable = React.memo(function ArchiveTable({
  archivedJobs,
  divisions,
  onCardClick,
  isDropTarget = false,
  isOver = false,
  isDraggable = true,
}: ArchiveTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('deadline');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const { setNodeRef } = useDroppable({ id: ARCHIVE_DROP_ZONE_ID });

  const sortedDivisions = useMemo(() => {
    return [...divisions].sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
    );
  }, [divisions]);

  // Filter archived jobs
  const filteredJobs = useMemo(() => {
    return archivedJobs.filter((job) => {
      if (selectedDivision !== 'all' && job.divisionId !== selectedDivision) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = job.title.toLowerCase().includes(q);
        const matchDesc = job.description?.toLowerCase().includes(q);
        const matchDiv = job.divisionName?.toLowerCase().includes(q);
        const matchRequestor = job.requestor?.fullName.toLowerCase().includes(q);
        const matchDesigners =
          job.designers?.some((d) => d.fullName.toLowerCase().includes(q)) ||
          job.designer?.fullName.toLowerCase().includes(q);

        if (!matchTitle && !matchDesc && !matchDiv && !matchRequestor && !matchDesigners) {
          return false;
        }
      }
      return true;
    });
  }, [archivedJobs, selectedDivision, searchQuery]);

  // Sort filtered jobs
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      if (sortField === 'deadline') {
        const comparison = compareJobsByDeadline(a, b);
        return sortOrder === 'asc' ? comparison : -comparison;
      }

      let valA: string | number = '';
      let valB: string | number = '';

      if (sortField === 'title') {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
      } else if (sortField === 'division') {
        valA = (a.divisionName || '').toLowerCase();
        valB = (b.divisionName || '').toLowerCase();
      } else if (sortField === 'archivedAt') {
        valA = a.archivedAt ? new Date(a.archivedAt).getTime() : new Date(a.updatedAt).getTime();
        valB = b.archivedAt ? new Date(b.archivedAt).getTime() : new Date(b.updatedAt).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return a.id.localeCompare(b.id);
    });
  }, [filteredJobs, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={`archive-section-wrapper ${isDropTarget ? 'archive-drag-target' : ''} ${isOver ? 'archive-drag-over' : ''}`}
      aria-label="COPM Archive Table"
    >
      {/* Top Header Bar */}
      <div className="archive-top-bar">
        <div className="archive-title-group">
          <h3 className="archive-main-title">Tabel Arsip COPM</h3>
          <span className="archive-count-badge">{sortedJobs.length} request</span>
        </div>

        {/* Toolbar controls (Search + Division in 1 row) */}
        <div className="archive-controls-group">
          <div className="archive-search-box">
            <Search size={12} color="var(--text-tertiary)" />
            <input
              type="text"
              placeholder="Cari di arsip..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="archive-search-input"
            />
          </div>

          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="archive-select"
          >
            <option value="all">Semua Divisi</option>
            {sortedDivisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Container Card */}
      <div className="archive-card no-scrollbar">
        {/* Desktop View: Multi-column Table */}
        <div className="archive-table-desktop">
          <table className="archive-table">
            <ArchiveTableHeader sortField={sortField} onSort={handleSort} />
            <tbody>
              {sortedJobs.map((job, idx) => (
                <ArchiveTableRow
                  key={job.id}
                  job={job}
                  index={idx}
                  onCardClick={onCardClick}
                  isDraggable={isDraggable}
                />
              ))}

              {sortedJobs.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="archive-empty-state">
                      <div className="archive-empty-icon">
                        <Layers size={18} />
                      </div>
                      <span className="archive-empty-text">Tidak ada request yang diarsipkan</span>
                      <span className="archive-empty-subtext">
                        {searchQuery || selectedDivision !== 'all'
                          ? 'Coba bersihkan pencarian atau filter divisi Anda'
                          : 'Request yang selesai dan diarsipkan dari board akan muncul di sini'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile / Tablet Responsive View: Vertical Card Table */}
        <div className="archive-cards-mobile">
          {sortedJobs.map((job) => (
            <ArchiveMobileCard key={job.id} job={job} onCardClick={onCardClick} />
          ))}

          {sortedJobs.length === 0 && (
            <div className="archive-empty-state">
              <div className="archive-empty-icon">
                <Layers size={18} />
              </div>
              <span className="archive-empty-text">Tidak ada request yang diarsipkan</span>
              <span className="archive-empty-subtext">
                {searchQuery || selectedDivision !== 'all'
                  ? 'Coba bersihkan pencarian atau filter divisi Anda'
                  : 'Request yang selesai dan diarsipkan dari board akan muncul di sini'}
              </span>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="archive-footer-bar">
          <span>
            Menampilkan {sortedJobs.length} dari {archivedJobs.length} data arsip
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>
            Seret baris ke atas untuk memindahkan ke board · Klik untuk detail
          </span>
        </div>
      </div>
    </section>
  );
});
