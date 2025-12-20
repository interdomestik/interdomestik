import { relations } from 'drizzle-orm';
import { boolean, decimal, integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Based on technical description: Submission -> Verification -> Evaluation -> Negotiation -> Court -> Final
export const statusEnum = pgEnum('status', [
  'draft',
  'submitted', // Phase 1: Submission
  'verification', // Phase 2: Information Verification
  'evaluation', // Phase 3: Damages Evaluation
  'negotiation', // Phase 4: Offer & Negotiation
  'court', // Phase 5: Judicial Process (if needed)
  'resolved', // Phase 6: Final Resolution (Success)
  'rejected', // Phase 6: Final Resolution (Failure)
]);

export const documentCategoryEnum = pgEnum('document_category', [
  'evidence',
  'correspondence',
  'contract',
  'receipt',
  'other',
]);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  role: text('role').notNull().default('user'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  agentId: text('agentId'), // Reference to the Agent managing this user
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
});

export const claims = pgTable('claim', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  agentId: text('agentId').references(() => user.id),
  title: text('title').notNull(),
  description: text('description'),
  status: statusEnum('status').default('draft'),
  category: text('category').notNull(), // e.g. 'retail', 'services'
  companyName: text('companyName').notNull(),
  claimAmount: decimal('amount', { precision: 10, scale: 2 }),
  currency: text('currency').default('EUR'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});

export const claimDocuments = pgTable('claim_documents', {
  id: text('id').primaryKey(),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  bucket: text('bucket').notNull().default('claim-evidence'),
  classification: text('classification').notNull().default('pii'),
  category: documentCategoryEnum('category').default('evidence').notNull(),
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const claimMessages = pgTable('claim_messages', {
  id: text('id').primaryKey(),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  senderId: text('sender_id')
    .notNull()
    .references(() => user.id),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false), // Agent-only internal notes
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => user.id),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const leads = pgTable('leads', {
  id: text('id').primaryKey(), // We'll use nanoid/uuid in the action or db default
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  category: text('category').notNull(),
  status: text('status').default('new'), // new, contacted, converted, closed
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});

export const userNotificationPreferences = pgTable('user_notification_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Email notifications
  emailClaimUpdates: boolean('email_claim_updates').default(true).notNull(),
  emailMarketing: boolean('email_marketing').default(false).notNull(),
  emailNewsletter: boolean('email_newsletter').default(true).notNull(),
  // Push notifications
  pushClaimUpdates: boolean('push_claim_updates').default(true).notNull(),
  pushMessages: boolean('push_messages').default(true).notNull(),
  // In-app notifications
  inAppAll: boolean('in_app_all').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(), // Paddle Subscription ID
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  status: text('status').notNull(), // active, past_due, paused, canceled
  planId: text('plan_id').notNull(), // Paddle Price ID
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});

export const userRelations = relations(user, ({ many, one }) => ({
  claims: many(claims),
  auditLogs: many(auditLog),
  agent: one(user, {
    fields: [user.agentId],
    references: [user.id],
    relationName: 'user_agent',
  }),
  clients: many(user, {
    relationName: 'user_agent',
  }),
}));

export const claimsRelations = relations(claims, ({ one, many }) => ({
  user: one(user, {
    fields: [claims.userId],
    references: [user.id],
  }),
  documents: many(claimDocuments),
  messages: many(claimMessages),
}));

export const claimDocumentsRelations = relations(claimDocuments, ({ one }) => ({
  claim: one(claims, {
    fields: [claimDocuments.claimId],
    references: [claims.id],
  }),
}));

export const claimMessagesRelations = relations(claimMessages, ({ one }) => ({
  claim: one(claims, {
    fields: [claimMessages.claimId],
    references: [claims.id],
  }),
  sender: one(user, {
    fields: [claimMessages.senderId],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));
