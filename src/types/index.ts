export type UserRole = 'requestor' | 'designer' | 'admin';

export type JobStatus = 'in_queue' | 'wip' | 'revisions' | 'done';

export interface Division {
  id: string;
  pageId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Page {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  divisionId: string | null;
  divisionName?: string | null;
  isApproved: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface Job {
  id: string;
  pageId: string;
  title: string;
  description: string | null;
  briefLink: string;
  briefTitle?: string | null;
  divisionId: string;
  divisionName?: string;
  publicationMedia: string;
  deadline: string;
  status: JobStatus;
  kanbanOrder: number;
  requestorId: string;
  requestor?: Profile;
  designerId: string | null;
  designer?: Profile | null;
  designerIds?: string[];
  designers?: Profile[];
  isArchived?: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobActivity {
  id: string;
  jobId: string;
  actorId: string;
  actor?: Profile;
  fromStatus: JobStatus | null;
  toStatus: JobStatus;
  note: string | null;
  createdAt: string;
}

export interface Deliverable {
  id: string;
  jobId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploaderName?: string | null;
  createdAt: string;
  registeredAt: string;
  previewUrl: string;
}

export interface RemoteCursor {
  userId: string;
  userName: string;
  userAvatar: string;
  color: string;
  x: number;
  y: number;
  worldX?: number;
  worldY?: number;
  pageId?: string;
  pageName?: string;
  draggedJob?: Job | null;
  initialCardWorldX?: number;
  initialCardWorldY?: number;
  userState?: string | null;
  lastUpdated: number;
}

export interface OnlineUser {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  role: UserRole;
  color: string;
  pageId?: string;
  pageName?: string;
  onlineAt: string;
}

export type NotificationType =
  | 'job_created'
  | 'job_assigned'
  | 'job_status_changed'
  | 'job_revisions'
  | 'job_completed'
  | 'deliverable_uploaded'
  | 'user_signup_pending'
  | 'user_approved'
  | 'user_rejected';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  jobId?: string | null;
  jobTitle?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorAvatar?: string | null;
  note?: string | null;
  isRead: boolean;
  createdAt: string;
}

