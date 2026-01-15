/**
 * Claim Threads & Messages Schema - M3.2
 *
 * External communication threads for claims.
 * Message types: note/email/phone/whatsapp/system
 * Attachments link to document IDs.
 */
import { index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claims } from './claims';
import { tenants } from './tenants';

// Message type enum as required
export const messageTypeEnum = pgEnum('message_type', [
  'note',
  'email',
  'phone',
  'whatsapp',
  'system',
]);

// Thread status
export const threadStatusEnum = pgEnum('thread_status', [
  'open',
  'pending_response',
  'resolved',
  'closed',
]);

// Claim communication threads
export const claimThreads = pgTable(
  'claim_threads',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),

    // Thread metadata
    subject: text('subject').notNull(),
    status: threadStatusEnum('status').default('open'),

    // External reference fields for insurer tracking
    externalReference: text('external_reference'), // Insurer's reference number
    insurerClaimNo: text('insurer_claim_no'), // Insurer's claim number
    policyNo: text('policy_no'), // Related policy number

    // Participants
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
    lastMessageAt: timestamp('last_message_at'),
  },
  table => [
    index('idx_claim_threads_tenant').on(table.tenantId),
    index('idx_claim_threads_claim').on(table.claimId),
    index('idx_claim_threads_tenant_claim').on(table.tenantId, table.claimId),
    index('idx_claim_threads_external_ref').on(table.externalReference),
  ]
);

// Claim messages within threads
export const claimThreadMessages = pgTable(
  'claim_messages',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => claimThreads.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),

    // Message content
    messageType: messageTypeEnum('message_type').notNull(),
    content: text('content').notNull(),
    htmlContent: text('html_content'), // For rich email content

    // External references
    externalReference: text('external_reference'), // External message ID (email message-id, etc.)
    externalRecipient: text('external_recipient'), // Email address, phone number, etc.

    // Attachments - array of document IDs
    // Links to documents table via documentId
    attachmentIds: jsonb('attachment_ids').$type<string[]>().default([]),

    // Sender info
    sentBy: text('sent_by').references(() => user.id), // null for inbound messages
    sentAt: timestamp('sent_at').defaultNow().notNull(),

    // Inbound message tracking
    isInbound: text('is_inbound').default('false'),
    receivedAt: timestamp('received_at'),
    receivedFrom: text('received_from'), // External sender (email, phone)

    // Delivery status
    deliveryStatus: text('delivery_status').default('pending'), // pending, sent, delivered, failed
    deliveryError: text('delivery_error'),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  table => [
    index('idx_claim_messages_tenant').on(table.tenantId),
    index('idx_claim_messages_thread').on(table.threadId),
    index('idx_claim_messages_claim').on(table.claimId),
    index('idx_claim_messages_sent_at').on(table.sentAt),
    index('idx_claim_messages_external_ref').on(table.externalReference),
  ]
);

// Type exports
export type ClaimThread = typeof claimThreads.$inferSelect;
export type NewClaimThread = typeof claimThreads.$inferInsert;
export type ClaimThreadMessage = typeof claimThreadMessages.$inferSelect;
export type NewClaimThreadMessage = typeof claimThreadMessages.$inferInsert;
