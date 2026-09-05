import { pgTable, text, timestamp, boolean, integer, uuid, pgEnum, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['requestor', 'designer', 'admin']);
export const jobStatusEnum = pgEnum('job_status', ['in_queue', 'wip', 'revisions', 'done']);
export const deliverableStatusEnum = pgEnum('deliverable_status', ['pending', 'ready']);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // mirrors auth.users.id
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  phoneNumber: text('phone_number'),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').default('requestor').notNull(),
  divisionId: uuid('division_id').references((): AnyPgColumn => divisions.id, { onDelete: 'set null' }),
  isApproved: boolean('is_approved').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    correlationId: uuid('correlation_id').notNull(),
    email: text('email').notNull(),
    stage: text('stage').notNull(),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    providerStatus: integer('provider_status'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('login_attempts_correlation_id_idx').on(table.correlationId),
    index('login_attempts_email_created_at_idx').on(table.email, table.createdAt),
    index('login_attempts_status_created_at_idx').on(table.status, table.createdAt),
  ]
);

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by').references(() => profiles.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const divisions = pgTable(
  'divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => pages.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('divisions_page_name_idx').on(table.pageId, table.name),
    index('divisions_page_id_idx').on(table.pageId),
  ]
);

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').references(() => pages.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  briefLink: text('brief_link').notNull(),
  briefTitle: text('brief_title'),
  divisionId: uuid('division_id').references(() => divisions.id).notNull(),
  publicationMedia: text('publication_media').notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: jobStatusEnum('status').default('in_queue').notNull(),
  kanbanOrder: integer('kanban_order').default(0).notNull(),
  requestorId: uuid('requestor_id').references(() => profiles.id).notNull(),
  designerId: uuid('designer_id').references(() => profiles.id),
  isArchived: boolean('is_archived').default(false).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('jobs_page_status_order_idx').on(table.pageId, table.isArchived, table.status, table.kanbanOrder),
]);

export const deliverables = pgTable('deliverables', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  storageKey: text('storage_key').notNull(),
  previewStorageKey: text('preview_storage_key'),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => profiles.id).notNull(),
  status: deliverableStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('deliverables_storage_key_idx').on(table.storageKey),
  index('deliverables_job_id_idx').on(table.jobId),
  index('deliverables_uploader_id_idx').on(table.uploadedBy),
]);

export const jobDesigners = pgTable('job_designers', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  designerId: uuid('designer_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('job_designers_job_designer_idx').on(table.jobId, table.designerId),
]);

export const jobActivity = pgTable('job_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }).notNull(),
  actorId: uuid('actor_id').references(() => profiles.id).notNull(),
  fromStatus: jobStatusEnum('from_status'),
  toStatus: jobStatusEnum('to_status').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('job_activity_job_created_at_idx').on(table.jobId, table.createdAt),
]);

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  page: one(pages, {
    fields: [divisions.pageId],
    references: [pages.id],
  }),
  profiles: many(profiles),
  jobs: many(jobs),
}));

export const jobDesignersRelations = relations(jobDesigners, ({ one }) => ({
  job: one(jobs, {
    fields: [jobDesigners.jobId],
    references: [jobs.id],
  }),
  designer: one(profiles, {
    fields: [jobDesigners.designerId],
    references: [profiles.id],
  }),
}));


export const profilesRelations = relations(profiles, ({ one, many }) => ({
  division: one(divisions, {
    fields: [profiles.divisionId],
    references: [divisions.id],
  }),
  createdPages: many(pages),
  requestedJobs: many(jobs, { relationName: 'requestorJobs' }),
  assignedJobs: many(jobs, { relationName: 'designerJobs' }),
  deliverables: many(deliverables),
  activities: many(jobActivity),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  creator: one(profiles, {
    fields: [pages.createdBy],
    references: [profiles.id],
  }),
  divisions: many(divisions),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  page: one(pages, {
    fields: [jobs.pageId],
    references: [pages.id],
  }),
  division: one(divisions, {
    fields: [jobs.divisionId],
    references: [divisions.id],
  }),
  requestor: one(profiles, {
    fields: [jobs.requestorId],
    references: [profiles.id],
    relationName: 'requestorJobs',
  }),
  designer: one(profiles, {
    fields: [jobs.designerId],
    references: [profiles.id],
    relationName: 'designerJobs',
  }),
  activities: many(jobActivity),
  deliverables: many(deliverables),
}));

export const jobActivityRelations = relations(jobActivity, ({ one }) => ({
  job: one(jobs, {
    fields: [jobActivity.jobId],
    references: [jobs.id],
  }),
  actor: one(profiles, {
    fields: [jobActivity.actorId],
    references: [profiles.id],
  }),
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
  jobTitle: text('job_title'),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  actorName: text('actor_name'),
  actorAvatar: text('actor_avatar'),
  note: text('note'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notifications_user_created_at_idx').on(table.userId, table.createdAt),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(profiles, {
    fields: [notifications.userId],
    references: [profiles.id],
  }),
  job: one(jobs, {
    fields: [notifications.jobId],
    references: [jobs.id],
  }),
  actor: one(profiles, {
    fields: [notifications.actorId],
    references: [profiles.id],
  }),
}));

