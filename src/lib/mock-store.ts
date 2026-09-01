import { Job, Profile, Page, Division, AppNotification } from '@/types';

// Mock Current User (Default Admin)
export const MOCK_ADMIN_USER: Profile = {
  id: 'mock-user-admin-1',
  email: 'wafflegilang@gmail.com',
  fullName: 'Gimigkk',
  phoneNumber: '081932062070',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  role: 'admin',
  divisionId: 'div-4', // Creative & Marketing
  divisionName: 'Creative & Marketing',
  isApproved: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
};

export const MOCK_USERS: Profile[] = [
  MOCK_ADMIN_USER,
  {
    id: 'mock-user-des-1',
    email: 'sarah.designer@ipb.ac.id',
    fullName: 'Sarah Putri',
    phoneNumber: '081298765432',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    role: 'designer',
    divisionId: 'div-4',
    divisionName: 'Creative & Marketing',
    isApproved: true,
    lastSeenAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  },
  {
    id: 'mock-user-des-2',
    email: 'fauzi.creative@ipb.ac.id',
    fullName: 'Ahmad Fauzi',
    phoneNumber: '085712345678',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'designer',
    divisionId: 'div-4',
    divisionName: 'Creative & Marketing',
    isApproved: true,
    lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    createdAt: '2026-02-15T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  },
  {
    id: 'mock-user-req-1',
    email: 'bph.ipb@gmail.com',
    fullName: 'Rian Pratama',
    phoneNumber: '081345678901',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    role: 'requestor',
    divisionId: 'div-2',
    divisionName: 'Badan Pengurus Harian',
    isApproved: true,
    lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  },
  {
    id: 'mock-user-bunga',
    email: 'bunga@ipb.ac.id',
    fullName: 'bunga',
    phoneNumber: null,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'designer',
    divisionId: 'div-4',
    divisionName: 'Creative & Marketing',
    isApproved: true,
    lastSeenAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 4 months ago
    createdAt: '2025-10-01T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
  },
  {
    id: 'mock-user-faisal',
    email: 'faisalmzhdtt@ipb.ac.id',
    fullName: 'faisalmzhdtt',
    phoneNumber: null,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'requestor',
    divisionId: 'div-1',
    divisionName: 'Academic & Publication',
    isApproved: true,
    lastSeenAt: new Date(Date.now() - 270 * 24 * 60 * 60 * 1000).toISOString(), // 9 months ago
    createdAt: '2025-05-15T00:00:00.000Z',
    updatedAt: '2025-11-10T00:00:00.000Z',
  },
  {
    id: 'mock-user-pending-1',
    email: 'farhan.partner@ipb.ac.id',
    fullName: 'Farhan Rasyid',
    phoneNumber: '081233445566',
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    role: 'requestor',
    divisionId: 'div-7',
    divisionName: 'Partnership',
    isApproved: false,
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T10:00:00.000Z',
  },
];

export const MOCK_DIVISIONS: Division[] = [
  { id: 'div-1', name: 'Academic & Publication', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-2', name: 'Badan Pengurus Harian', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-3', name: 'Business Development', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-4', name: 'Creative & Marketing', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-5', name: 'Information', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-6', name: 'Internal Humaniores', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-7', name: 'Partnership', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-8', name: 'Project & Competition', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'div-9', name: 'Recruitment & Retention', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

export const MOCK_PAGES: Page[] = [
  {
    id: 'mock-page-1',
    name: "Creative n' Marketing 2026",
    description: 'Papan kerja utama tim Creative & Media COPM',
    createdBy: 'mock-user-admin-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'mock-page-2',
    name: 'Dokumentasi & Publikasi Event',
    description: 'Publikasi visual khusus agenda Dies Natalis dan Seminar',
    createdBy: 'mock-user-admin-1',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

export const MOCK_JOBS: Job[] = [
  {
    id: 'mock-job-1',
    title: 'Key Visual & Banner Peluncuran Q4',
    description: 'Desain banner utama resolusi tinggi untuk portal web dan poster cetak A2.',
    briefLink: 'https://docs.google.com/document/d/1234567890abcdef_sample_brief',
    briefTitle: 'Key Visual Q4 IEEE Launch Brief',
    publicationMedia: 'Cetak Poster & Web Banner',
    divisionId: 'div-2',
    divisionName: 'Badan Pengurus Harian',
    status: 'in_queue',
    kanbanOrder: 0,
    pageId: 'mock-page-1',
    requestorId: 'mock-user-req-1',
    requestor: MOCK_USERS[3],
    designerId: null,
    designer: null,
    designerIds: [],
    designers: [],
    deadline: '2026-09-10T00:00:00.000Z',
    isArchived: false,
    archivedAt: null,
    createdAt: '2026-08-29T10:00:00.000Z',
    updatedAt: '2026-08-29T10:00:00.000Z',
  },
  {
    id: 'mock-job-2',
    title: 'Carousel Feed Instagram: Tips Desain UI/UX',
    description: 'Konten edukasi 6 slide seputar Figma component system dan best practice auto-layout.',
    briefLink: 'https://docs.google.com/document/d/0987654321sample_carousel_doc',
    briefTitle: 'Instagram Educational Post Brief',
    publicationMedia: 'Instagram Carousel (1080x1350)',
    divisionId: 'div-4',
    divisionName: 'Creative & Marketing',
    status: 'wip',
    kanbanOrder: 0,
    pageId: 'mock-page-1',
    requestorId: 'mock-user-admin-1',
    requestor: MOCK_ADMIN_USER,
    designerId: MOCK_ADMIN_USER.id,
    designer: MOCK_ADMIN_USER,
    designerIds: [MOCK_ADMIN_USER.id, MOCK_USERS[1].id],
    designers: [MOCK_ADMIN_USER, MOCK_USERS[1]],
    deadline: '2026-09-08T00:00:00.000Z',
    isArchived: false,
    archivedAt: null,
    createdAt: '2026-08-29T09:00:00.000Z',
    updatedAt: '2026-08-29T11:00:00.000Z',
  },
  {
    id: 'mock-job-3',
    title: 'Cover & Flyer Call for Paper 2026',
    description: 'Flyer digital untuk promosi call for paper internasional IEEE Student Branch IPB.',
    briefLink: 'https://docs.google.com/document/d/sample_brief_paper_call',
    briefTitle: 'IEEE Call for Paper Brief',
    publicationMedia: 'Instagram Story & PDF',
    divisionId: 'div-1',
    divisionName: 'Academic & Publication',
    status: 'revisions',
    kanbanOrder: 0,
    pageId: 'mock-page-1',
    requestorId: 'mock-user-req-1',
    requestor: MOCK_USERS[3],
    designerId: MOCK_USERS[2].id,
    designer: MOCK_USERS[2],
    designerIds: [MOCK_USERS[2].id],
    designers: [MOCK_USERS[2]],
    deadline: '2026-09-07T00:00:00.000Z',
    isArchived: false,
    archivedAt: null,
    createdAt: '2026-08-28T08:00:00.000Z',
    updatedAt: '2026-08-29T14:00:00.000Z',
  },
  {
    id: 'mock-job-4',
    title: 'Twibbon & Virtual Background Rapat Pleno',
    description: 'Twibbon PNG transparan dan background Zoom 1920x1080.',
    briefLink: 'https://docs.google.com/document/d/sample_twibbon_doc',
    briefTitle: 'Twibbon Pleno Brief',
    publicationMedia: 'Zoom Virtual Background & Twibbon',
    divisionId: 'div-9',
    divisionName: 'Recruitment & Retention',
    status: 'done',
    kanbanOrder: 0,
    pageId: 'mock-page-1',
    requestorId: 'mock-user-req-1',
    requestor: MOCK_USERS[3],
    designerId: MOCK_USERS[1].id,
    designer: MOCK_USERS[1],
    designerIds: [MOCK_USERS[1].id],
    designers: [MOCK_USERS[1]],
    deadline: '2026-09-06T00:00:00.000Z',
    isArchived: false,
    archivedAt: null,
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-29T16:00:00.000Z',
  },
  {
    id: 'mock-job-5',
    title: 'Poster Kemitraan Industri & Sponsor Tech Expo',
    description: 'Proposal booklet visual untuk pengajuan sponsor kemitraan perusahaan.',
    briefLink: 'https://docs.google.com/document/d/sample_partner_doc',
    briefTitle: 'Sponsorship Partner Deck Brief',
    publicationMedia: 'PDF Booklet & Poster',
    divisionId: 'div-7',
    divisionName: 'Partnership',
    status: 'done',
    kanbanOrder: 0,
    pageId: 'mock-page-1',
    requestorId: 'mock-user-req-1',
    requestor: MOCK_USERS[3],
    designerId: MOCK_ADMIN_USER.id,
    designer: MOCK_ADMIN_USER,
    designerIds: [MOCK_ADMIN_USER.id],
    designers: [MOCK_ADMIN_USER],
    deadline: '2026-08-25T00:00:00.000Z',
    isArchived: true,
    archivedAt: '2026-08-26T00:00:00.000Z',
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  },
];

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'mock-notif-1',
    userId: 'mock-user-admin-1',
    title: 'Request Baru Diajukan',
    message: 'Divisi Badan Pengurus Harian mengajukan job: "Key Visual & Banner Peluncuran Q4"',
    type: 'job_created',
    isRead: false,
    jobId: 'mock-job-1',
    createdAt: '2026-08-29T10:00:00.000Z',
  },
  {
    id: 'mock-notif-2',
    userId: 'mock-user-admin-1',
    title: 'Permintaan Revisi Desain',
    message: 'Job "Cover & Flyer Call for Paper 2026" membutuhkan revisi logo.',
    type: 'job_revisions',
    isRead: true,
    jobId: 'mock-job-3',
    createdAt: '2026-08-29T14:00:00.000Z',
  },
];

// Global mutable store for in-memory dev mutations
class MockStore {
  users: Profile[] = [...MOCK_USERS];
  divisions: Division[] = [...MOCK_DIVISIONS];
  pages: Page[] = [...MOCK_PAGES];
  jobs: Job[] = [...MOCK_JOBS];
  notifications: AppNotification[] = [...MOCK_NOTIFICATIONS];
  currentUser: Profile = { ...MOCK_ADMIN_USER };
}

declare global {
  var __COPM_MOCK_STORE__: MockStore | undefined;
}

export function getMockStore(): MockStore {
  if (!global.__COPM_MOCK_STORE__) {
    global.__COPM_MOCK_STORE__ = new MockStore();
  }
  return global.__COPM_MOCK_STORE__;
}

export function isMockEnabled(): boolean {
  return process.env.USE_MOCK_DATA === 'true';
}
