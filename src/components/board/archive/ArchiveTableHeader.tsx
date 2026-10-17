import React from 'react';
import { ArrowUpDown } from 'lucide-react';

export type SortField = 'title' | 'deadline' | 'division' | 'archivedAt';
export type SortOrder = 'asc' | 'desc';

interface ArchiveTableHeaderProps {
  sortField: SortField;
  onSort: (field: SortField) => void;
}

export const ArchiveTableHeader = React.memo(function ArchiveTableHeader({
  sortField,
  onSort,
}: ArchiveTableHeaderProps) {
  return (
    <thead>
      <tr>
        <th className="archive-th" style={{ width: '44px', textAlign: 'center' }}>
          #
        </th>
        <th className="archive-th sortable" onClick={() => onSort('title')} style={{ width: '30%' }}>
          <div className="archive-th-inner">
            <span>Tugas</span>
            <ArrowUpDown size={11} style={{ opacity: sortField === 'title' ? 1 : 0.4 }} />
          </div>
        </th>
        <th className="archive-th" style={{ width: '18%' }}>
          Penanggung Jawab
        </th>
        <th className="archive-th" style={{ width: '14%' }}>
          Requester
        </th>
        <th className="archive-th sortable" onClick={() => onSort('division')} style={{ width: '16%' }}>
          <div className="archive-th-inner">
            <span>Dari / Divisi</span>
            <ArrowUpDown size={11} style={{ opacity: sortField === 'division' ? 1 : 0.4 }} />
          </div>
        </th>
        <th className="archive-th sortable" onClick={() => onSort('deadline')} style={{ width: '12%' }}>
          <div className="archive-th-inner">
            <span>Deadline</span>
            <ArrowUpDown size={11} style={{ opacity: sortField === 'deadline' ? 1 : 0.4 }} />
          </div>
        </th>
        <th className="archive-th" style={{ width: '100px', textAlign: 'center' }}>
          Brief
        </th>
      </tr>
    </thead>
  );
});
