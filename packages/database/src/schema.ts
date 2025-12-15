import { boolean, decimal, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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

export const leads = pgTable('leads', {
  id: text('id').primaryKey(), // We'll use nanoid/uuid in the action or db default
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  category: text('category').notNull(),
  status: text('status').default('new'), // new, contacted, converted, closed
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});
