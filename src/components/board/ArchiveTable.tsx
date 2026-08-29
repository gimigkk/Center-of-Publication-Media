'use client';

import React, { useState, useMemo } from 'react';
import { Job, Profile, Division } from '@/types';
import { Avatar } from '@/components/ui/Avatar';
import { GoogleDocsIcon } from '@/components/ui/GoogleDocsIcon';
import { formatDate } from '@/lib/utils';
import {
  Search,
  ArrowUpDown,
  Layers,
} from 'lucide-react';

interface ArchiveTableProps {
  archivedJobs: Job[];
  currentUser: Profile;
  divisions: Division[];
  onCardClick: (job: Job) => void;
}

type SortField = 'title' | 'deadline' | 'division' | 'archivedAt';
type SortOrder = 'asc' | 'desc';

export const ArchiveTable = React.memo(function ArchiveTable({
  archivedJobs,
  divisions,
  onCardClick,
}: ArchiveTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('archivedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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
      let valA: string | number = '';
      let valB: string | number = '';

      if (sortField === 'title') {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
      } else if (sortField === 'deadline') {
        valA = new Date(a.deadline).getTime();
        valB = new Date(b.deadline).getTime();
      } else if (sortField === 'division') {
        valA = (a.divisionName || '').toLowerCase();
        valB = (b.divisionName || '').toLowerCase();
      } else if (sortField === 'archivedAt') {
        valA = a.archivedAt ? new Date(a.archivedAt).getTime() : new Date(a.updatedAt).getTime();
        valB = b.archivedAt ? new Date(b.archivedAt).getTime() : new Date(b.updatedAt).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
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
    <section className="archive-section-wrapper" aria-label="COPM Archive Table">
      {/* Top Header Bar */}
      <div className="archive-top-bar">
        <div className="archive-title-group">
          <h3 className="archive-main-title">Tabel Arsip COPM</h3>
          <span className="archive-count-badge">
            {sortedJobs.length} request
          </span>
        </div>

        {/* Toolbar controls */}
        <div className="archive-controls-group">
          {/* Search box */}
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

          {/* Division Filter */}
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="archive-select"
          >
            <option value="all">Semua Divisi</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Card (Zero Internal Scrolling) */}
      <div className="archive-card">
        <table className="archive-table">
          <thead>
            <tr>
              <th className="archive-th" style={{ width: '40px', textAlign: 'center' }}>
                #
              </th>
              <th className="archive-th sortable" onClick={() => handleSort('title')}>
                <div className="archive-th-inner">
                  <span>Tugas</span>
                  <ArrowUpDown size={11} style={{ opacity: sortField === 'title' ? 1 : 0.4 }} />
                </div>
              </th>
              <th className="archive-th">Penanggung Jawab</th>
              <th className="archive-th">Requester</th>
              <th className="archive-th sortable" onClick={() => handleSort('division')}>
                <div className="archive-th-inner">
                  <span>Dari / Divisi</span>
                  <ArrowUpDown size={11} style={{ opacity: sortField === 'division' ? 1 : 0.4 }} />
                </div>
              </th>
              <th className="archive-th sortable" onClick={() => handleSort('deadline')}>
                <div className="archive-th-inner">
                  <span>Deadline</span>
                  <ArrowUpDown size={11} style={{ opacity: sortField === 'deadline' ? 1 : 0.4 }} />
                </div>
              </th>
              <th className="archive-th">Brief</th>
            </tr>
          </thead>

          <tbody>
            {sortedJobs.map((job, idx) => {
              const assignedDesigners: Profile[] =
                job.designers && job.designers.length > 0
                  ? job.designers
                  : job.designer
                    ? [job.designer]
                    : [];

              return (
                <tr
                  key={job.id}
                  className="archive-tr"
                  onClick={() => onCardClick(job)}
                >
                  {/* Index */}
                  <td
                    className="archive-td"
                    style={{
                      textAlign: 'center',
                      color: 'var(--text-tertiary)',
                      fontSize: '11px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {idx + 1}
                  </td>

                  {/* Task Title + Snippet */}
                  <td className="archive-td">
                    <div className="archive-task-title-group">
                      <span className="archive-task-title">{job.title}</span>
                      {job.description && (
                        <span className="archive-task-desc">{job.description}</span>
                      )}
                    </div>
                  </td>

                  {/* Person In Charge (Editors) */}
                  <td className="archive-td">
                    <div className="archive-people-group">
                      {assignedDesigners.length > 0 ? (
                        assignedDesigners.map((designer) => (
                          <div
                            key={designer.id}
                            className="archive-person-chip"
                            title={`Editor: ${designer.fullName} (${designer.email})`}
                          >
                            <Avatar
                              src={designer.avatarUrl}
                              name={designer.fullName}
                              size={16}
                            />
                            <span>{designer.fullName.split(' ')[0]}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                          Belum Ditugaskan
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Requestor */}
                  <td className="archive-td">
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      title={`Requester: ${job.requestor?.fullName || 'Anonim'}`}
                    >
                      <Avatar
                        src={job.requestor?.avatarUrl}
                        name={job.requestor?.fullName || 'Requester'}
                        size={18}
                      />
                      <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        {job.requestor?.fullName.split(' ')[0] || 'Anonim'}
                      </span>
                    </div>
                  </td>

                  {/* Division / From */}
                  <td className="archive-td">
                    <span className="archive-division-badge">
                      {job.divisionName || 'Umum'}
                    </span>
                  </td>

                  {/* Due Date */}
                  <td className="archive-td">
                    <div className="archive-due-group">
                      <span className="archive-due-date">{formatDate(job.deadline)}</span>
                    </div>
                  </td>

                  {/* Brief Link */}
                  <td className="archive-td" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={job.briefLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="archive-brief-btn"
                      title="Buka Brief Google Docs"
                    >
                      <GoogleDocsIcon size={12} />
                      <span>Brief</span>
                    </a>
                  </td>
                </tr>
              );
            })}

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

        {/* Footer info bar */}
        <div className="archive-footer-bar">
          <span>
            Menampilkan {sortedJobs.length} dari {archivedJobs.length} data arsip
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>
            Klik baris mana saja untuk melihat detail dan riwayat lengkap
          </span>
        </div>
      </div>
    </section>
  );
});
