'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SimpleSelect } from '@/components/ui/Select';
import { Job, Page, Profile } from '@/types';
import { getJobCompletionStatsAction, JobCompletionStatItem } from '@/app/actions/stats';
import { JobLineChart, ChartPerson, ChartDataPoint } from './JobLineChart';
import { Avatar } from '@/components/ui/Avatar';
import { getAvatarColor } from '@/lib/utils';

interface JobStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  jobs: Job[];
  allUsers: Profile[];
  currentUser?: Profile;
  pages?: Page[];
}

const FIGMA_CONTRIBUTOR_PALETTE = [
  '#70C1FF', // Pastel Sky Blue
  '#B28DFF', // Pastel Lavender
  '#FF8E72', // Pastel Peach / Coral
  '#5CE1A6', // Pastel Mint Green
  '#FFB84D', // Pastel Honey / Butter
  '#FF7AB2', // Pastel Rose Pink
  '#54D5E6', // Pastel Aqua Cyan
  '#8CE264', // Pastel Pistachio / Lime
  '#C68EFF', // Pastel Orchid
  '#FFA366', // Pastel Soft Tangerine
  '#8EA7FF', // Pastel Periwinkle
  '#FF708F', // Pastel Strawberry
  '#6FE0C2', // Pastel Seafoam
  '#FFC84A', // Pastel Marigold
  '#EA7AF4', // Pastel Magenta Mist
  '#7C9BB8', // Pastel Dusty Slate
];

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const JobStatsModal = React.memo(function JobStatsModal({
  isOpen,
  onClose,
  currentPage,
  jobs,
  allUsers,
  pages = [],
}: JobStatsModalProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(currentPage.id);
  const [showTotalLine, setShowTotalLine] = useState<boolean>(false);
  const [serverStats, setServerStats] = useState<JobCompletionStatItem[]>([]);
  const [activePersonIds, setActivePersonIds] = useState<Set<string>>(new Set());
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);

  // Sync default selection to currentPage when modal opens or currentPage changes
  useEffect(() => {
    if (isOpen && currentPage?.id) {
      setSelectedPageId(currentPage.id);
    }
  }, [isOpen, currentPage?.id]);

  // Ensure available pages list contains all pages and current page
  const availablePages = useMemo(() => {
    const list: Page[] = pages && pages.length > 0 ? [...pages] : [currentPage];
    if (!list.some((p) => p.id === currentPage.id)) {
      list.unshift(currentPage);
    }
    return list;
  }, [pages, currentPage]);

  // Fetch completion records when modal opens or board selection changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const targetPageId = selectedPageId === 'all' ? undefined : selectedPageId;

    getJobCompletionStatsAction(targetPageId)
      .then((items) => {
        if (isMounted) {
          setServerStats(items);
        }
      })
      .catch((err) => {
        console.error('Failed to load completion stats:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedPageId]);

  // Merge server records with active board jobs
  const combinedRecords = useMemo(() => {
    const map = new Map<string, JobCompletionStatItem>();

    serverStats.forEach((item) => {
      map.set(item.id, item);
    });

    const localDoneJobs = jobs.filter((j) => {
      if (j.status !== 'done') return false;
      if (selectedPageId !== 'all' && j.pageId !== selectedPageId) return false;
      return true;
    });

    localDoneJobs.forEach((job) => {
      const rawDate = job.deadline || job.archivedAt || job.updatedAt || job.createdAt;
      const completedAt = (rawDate ? new Date(rawDate) : new Date()).toISOString();
      const contributors =
        job.designers && job.designers.length > 0
          ? job.designers
          : job.designer
          ? [job.designer]
          : job.requestor
          ? [job.requestor]
          : [];

      if (contributors.length === 0) {
        const id = `${job.id}-unassigned`;
        if (!map.has(id)) {
          map.set(id, {
            id,
            jobId: job.id,
            jobTitle: job.title,
            pageId: job.pageId,
            divisionName: job.divisionName || 'Umum',
            completedAt,
            personId: 'unassigned',
            personName: 'Tanpa Desainer',
            personAvatar: null,
            personRole: 'designer',
            personColor: '#757575',
          });
        }
      } else {
        contributors.forEach((contributor) => {
          const id = `${job.id}-${contributor.id}`;
          if (!map.has(id)) {
            map.set(id, {
              id,
              jobId: job.id,
              jobTitle: job.title,
              pageId: job.pageId,
              divisionName: job.divisionName || 'Umum',
              completedAt,
              personId: contributor.id,
              personName: contributor.fullName,
              personAvatar: contributor.avatarUrl || null,
              personRole: contributor.role,
              personColor: getAvatarColor(contributor.id || contributor.fullName),
            });
          }
        });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );
  }, [serverStats, jobs, selectedPageId]);

  // Overall counts per person
  const personOverallCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    combinedRecords.forEach((item) => {
      counts[item.personId] = (counts[item.personId] || 0) + 1;
    });
    return counts;
  }, [combinedRecords]);

  // Distinct persons sorted descending by completed job count
  const allPersons = useMemo<ChartPerson[]>(() => {
    const personMap = new Map<string, ChartPerson>();

    combinedRecords.forEach((item) => {
      if (!personMap.has(item.personId)) {
        personMap.set(item.personId, {
          id: item.personId,
          name: item.personName,
          color: item.personColor,
          avatarUrl: item.personAvatar,
        });
      }
    });

    if (personMap.size === 0) {
      allUsers
        .filter((u) => u.role === 'designer' || u.role === 'admin')
        .slice(0, 6)
        .forEach((u) => {
          personMap.set(u.id, {
            id: u.id,
            name: u.fullName,
            color: getAvatarColor(u.id || u.fullName),
            avatarUrl: u.avatarUrl,
          });
        });
    }

    const sorted = Array.from(personMap.values()).sort((a, b) => {
      const countA = personOverallCounts[a.id] || 0;
      const countB = personOverallCounts[b.id] || 0;
      return countB - countA;
    });

    // Reassign guaranteed distinct, collision-free palette colors sequentially by rank!
    return sorted.map((p, index) => ({
      ...p,
      color: FIGMA_CONTRIBUTOR_PALETTE[index % FIGMA_CONTRIBUTOR_PALETTE.length],
    }));
  }, [combinedRecords, allUsers, personOverallCounts]);

  // Select top 6 most active contributors by default for clean visual distinction
  useEffect(() => {
    if (allPersons.length > 0 && activePersonIds.size === 0) {
      const activeContributors = allPersons.filter(
        (p) => (personOverallCounts[p.id] || 0) > 0
      );
      const initialSelection = activeContributors.slice(0, 6);
      if (initialSelection.length > 0) {
        setActivePersonIds(new Set(initialSelection.map((p) => p.id)));
      } else {
        setActivePersonIds(new Set(allPersons.map((p) => p.id)));
      }
    }
  }, [allPersons, activePersonIds.size, personOverallCounts]);

  const isMouseDownRef = useRef(false);
  const dragTargetStateRef = useRef<boolean | null>(null);

  // Drag-to-toggle interaction for contributor chips
  const handleChipMouseDown = useCallback((personId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isMouseDownRef.current = true;

    setActivePersonIds((prev) => {
      const next = new Set(prev);
      const isCurrentlyActive = next.has(personId);
      const nextState = !isCurrentlyActive;
      dragTargetStateRef.current = nextState;

      if (nextState) {
        next.add(personId);
      } else {
        if (next.size > 1) {
          next.delete(personId);
        }
      }
      return next;
    });
  }, []);

  const handleChipMouseEnter = useCallback((personId: string) => {
    if (isMouseDownRef.current && dragTargetStateRef.current !== null) {
      const targetState = dragTargetStateRef.current;
      setActivePersonIds((prev) => {
        const next = new Set(prev);
        if (targetState) {
          next.add(personId);
        } else {
          if (next.size > 1) {
            next.delete(personId);
          }
        }
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isMouseDownRef.current = false;
      dragTargetStateRef.current = null;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Generate full start-to-end monthly timeline without arbitrary span limits
  const chartData = useMemo(() => {
    const now = new Date();
    let startYear = now.getFullYear();
    let startMonth = 0; // January

    if (combinedRecords.length > 0) {
      const earliest = new Date(combinedRecords[0].completedAt);
      startYear = earliest.getFullYear();
      startMonth = earliest.getMonth();
    }

    const endYear = now.getFullYear();
    const endMonth = now.getMonth();

    const monthBuckets: {
      key: string;
      label: string;
      fullLabel: string;
      startDate: Date;
      endDate: Date;
    }[] = [];

    let y = startYear;
    let m = startMonth;

    while (y < endYear || (y === endYear && m <= endMonth)) {
      const sDate = new Date(y, m, 1, 0, 0, 0, 0);
      const eDate = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
      const monthName = MONTH_NAMES_SHORT[m];
      const label = `${monthName} ${y !== now.getFullYear() ? `'${String(y).slice(2)}` : ''}`.trim();
      const fullLabel = sDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

      monthBuckets.push({
        key: monthKey,
        label,
        fullLabel,
        startDate: sDate,
        endDate: eDate,
      });

      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }

    const monthlyCountsMap = new Map<string, Record<string, number>>();
    monthBuckets.forEach((mb) => {
      monthlyCountsMap.set(mb.key, {});
    });

    combinedRecords.forEach((item) => {
      const itemDate = new Date(item.completedAt);
      const itemKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;

      if (monthlyCountsMap.has(itemKey)) {
        const mCounts = monthlyCountsMap.get(itemKey)!;
        mCounts[item.personId] = (mCounts[item.personId] || 0) + 1;
      }
    });

    // Output Periode: discrete monthly job count per person
    const points: ChartDataPoint[] = monthBuckets.map((mb) => {
      const mCounts = monthlyCountsMap.get(mb.key) || {};
      const counts: Record<string, number> = {};
      let monthTotal = 0;

      allPersons.forEach((p) => {
        const count = mCounts[p.id] || 0;
        counts[p.id] = count;
        monthTotal += count;
      });

      return {
        dateStr: mb.key,
        label: mb.label,
        fullDateLabel: mb.fullLabel,
        counts,
        total: monthTotal,
      };
    });

    return points;
  }, [combinedRecords, allPersons]);

  // Contributor chips and controls as the dedicated Modal Footer
  const modalFooter = allPersons.length > 0 ? (
    <div className="figma-legend-container">
      <div className="figma-legend-header">
        <span className="figma-legend-title">Garis Kontributor ({activePersonIds.size} aktif)</span>
        <div className="figma-toolbar-section">
          <button
            type="button"
            className={`figma-total-toggle-btn ${showTotalLine ? 'active' : ''}`}
            onClick={() => setShowTotalLine((prev) => !prev)}
            title="Tampilkan / sembunyikan garis total tim"
          >
            <span className="figma-total-dot" />
            <span>Total Tim</span>
          </button>

          <SimpleSelect
            size="sm"
            className="figma-board-select"
            value={selectedPageId}
            onChange={setSelectedPageId}
            title="Pilih papan atau tampilkan semua papan"
            options={[
              ...availablePages.map((page) => ({ value: page.id, label: page.name })),
              { value: 'all', label: 'Semua Papan' },
            ]}
          />
        </div>
      </div>

      <div className="figma-legend-chips">
        {allPersons.map((p) => {
          const isActive = activePersonIds.has(p.id);
          const isHovered = hoveredPersonId === p.id;
          const isFaded = hoveredPersonId !== null && !isHovered;
          const count = personOverallCounts[p.id] || 0;

          return (
            <button
              key={`legend-${p.id}`}
              type="button"
              className={`figma-person-chip ${
                isFaded ? 'faded' : !isActive ? 'toggled-off' : ''
              }`}
              style={{
                backgroundColor: p.color,
              }}
              onMouseDown={(e) => handleChipMouseDown(p.id, e)}
              onMouseEnter={() => handleChipMouseEnter(p.id)}
              title={`Klik/geser untuk ${isActive ? 'sembunyikan' : 'tampilkan'} garis ${p.name}`}
            >
              <Avatar
                src={p.avatarUrl}
                name={p.name}
                size={16}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  color: '#1e1e1e',
                  fontSize: '8px',
                  fontWeight: 700,
                }}
              />
              <span className="figma-person-chip-name" title={p.name}>
                {p.name}
              </span>
              <span className="figma-person-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Grafik Penyelesaian Job"
      subtitle="Tren penyelesaian pekerjaan dan kontribusi masing-masing anggota tim per bulan"
      footer={modalFooter}
      maxWidth={880}
      className="job-stats-modal"
    >
      <JobLineChart
        data={chartData}
        persons={allPersons}
        activePersonIds={activePersonIds}
        showTotalLine={showTotalLine}
        hoveredPersonId={hoveredPersonId}
        onHoverPerson={setHoveredPersonId}
        unitLabel="job"
      />
    </Modal>
  );
});
