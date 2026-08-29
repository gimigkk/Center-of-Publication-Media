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
        <th className="archive-th" style={{ width: '40px', textAlign: 'center' }}>
          #
        </th>
        <th className="archive-th sortable" onClick={() => onSort('title')}>
          <div className="archive-th-inner">
            <span>Tugas</span>
            <ArrowUpDown size={11} style={{ opacity: sortField === 'title' ? 1 : 0.4 }} />
          </div>
        </th>
        <th className="archive-th">Penanggung Jawab</th>
        <th className="archive-th">Requester</th>
        <th className="archive-th sortable" onClick={() => onSort('division')}>
          <div className="archive-th-inner">
            <span>Dari / Divisi</span>
            <ArrowUpDown size={11} style={{ opacity: sortField === 'division' ? 1 : 0.4 }} />
          </div>
        </th>
        <th className="archive-th sortable" onClick={() => onSort('deadline')}>
          <div className="archive-th-inner">
            <span>Deadline</span>
            <ArrowUpDown size={11} style={{ opacity: sortField === 'deadline' ? 1 : 0.4 }} />
          </div>
        </th>
        <th className="archive-th">Brief</th>
      </tr>
    </thead>
  );
});
