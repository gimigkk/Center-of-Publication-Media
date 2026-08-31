export type DeadlineUrgency = 'normal' | 'warning' | 'urgent' | 'overdue';

export interface DeadlineStatus {
  urgency: DeadlineUrgency;
  daysRemaining: number;
  hoursRemaining: number;
  label: string;
  isOverdue: boolean;
}

export function compareJobsByDeadline(
  a: { deadline: string; title: string; id: string },
  b: { deadline: string; title: string; id: string }
): number {
  const deadlineA = new Date(a.deadline).getTime();
  const deadlineB = new Date(b.deadline).getTime();
  const validA = Number.isFinite(deadlineA);
  const validB = Number.isFinite(deadlineB);

  if (validA && !validB) return -1;
  if (!validA && validB) return 1;
  if (validA && validB && deadlineA !== deadlineB) return deadlineA - deadlineB;

  const titleComparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  return titleComparison || a.id.localeCompare(b.id);
}

export function getDeadlineStatus(deadlineInput: string | Date): DeadlineStatus {
  const deadline = new Date(deadlineInput);
  const now = new Date();

  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const isOverdue = diffMs < 0;

  let urgency: DeadlineUrgency = 'normal';
  let label = '';

  if (isOverdue) {
    urgency = 'overdue';
    const overdueDays = Math.abs(diffDays);
    label = overdueDays === 0 ? 'Hari ini' : `-${overdueDays} hari`;
  } else if (diffHours <= 24) {
    urgency = 'urgent';
    label = diffHours <= 1 ? '<1 jam' : `${diffHours} jam`;
  } else if (diffDays <= 3) {
    urgency = 'warning';
    label = `${diffDays} hari`;
  } else {
    urgency = 'normal';
    label = `${diffDays} hari`;
  }

  return {
    urgency,
    daysRemaining: diffDays,
    hoursRemaining: diffHours,
    label,
    isOverdue,
  };
}

export function formatDate(dateInput: string | Date): string {
  const date = new Date(dateInput);
  return date.toLocaleDateString('id-ID', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  return date.toLocaleDateString('id-ID', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getRelativeTime(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return 'Pernah aktif';
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0 || isNaN(diffMs)) return 'Baru saja';

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 45) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;
  if (diffDay === 1) return 'Kemarin';
  if (diffDay < 30) return `${diffDay} hari lalu`;
  if (diffMonth < 12) return `${diffMonth} bulan lalu`;
  return `${diffYear} tahun lalu`;
}

export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// FigJam cursor and avatar color palette
const FIGJAM_COLORS = [
  '#0D99FF', // Blue
  '#9747FF', // Purple
  '#FF7262', // Coral/Orange
  '#14AE5C', // Green
  '#FFA629', // Amber
  '#F24822', // Red
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#06B6D4', // Cyan
];

export function getAvatarColor(identifier: string): string {
  if (!identifier) return FIGJAM_COLORS[0];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FIGJAM_COLORS.length;
  return FIGJAM_COLORS[index];
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function compressImageToAvatarDataUrl(file: File, maxDim = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window not available'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(readerEvent.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to process image'));
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
