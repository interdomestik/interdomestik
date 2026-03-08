import {
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { documents } from './documents';
import { tenants } from './tenants';

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    workflow: text('workflow').notNull(),
    status: text('status').notNull().default('queued'),
    documentId: text('document_id').references(() => documents.id),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    requestedBy: text('requested_by').references(() => user.id),
    model: text('model').notNull(),
    modelSnapshot: text('model_snapshot'),
    promptVersion: text('prompt_version').notNull(),
    inputHash: text('input_hash').notNull(),
    requestJson: jsonb('request_json').$type<Record<string, unknown>>().notNull().default({}),
    responseJson: jsonb('response_json').$type<Record<string, unknown>>(),
    outputJson: jsonb('output_json').$type<Record<string, unknown>>(),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    reviewStatus: text('review_status').notNull().default('pending'),
    reviewedBy: text('reviewed_by').references(() => user.id),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('idx_ai_runs_tenant_workflow_status').on(table.tenantId, table.workflow, table.status),
    index('idx_ai_runs_document').on(table.documentId),
    index('idx_ai_runs_tenant_entity').on(table.tenantId, table.entityType, table.entityId),
    index('idx_ai_runs_requested_by').on(table.requestedBy),
    index('idx_ai_runs_created_at').on(table.createdAt),
  ]
);

export const documentExtractions = pgTable(
  'document_extractions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    workflow: text('workflow').notNull(),
    schemaVersion: text('schema_version').notNull(),
    extractedJson: jsonb('extracted_json').$type<Record<string, unknown>>().notNull(),
    confidence: decimal('confidence', { precision: 5, scale: 4 }),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    sourceRunId: text('source_run_id')
      .notNull()
      .references(() => aiRuns.id),
    reviewStatus: text('review_status').notNull().default('pending'),
    reviewedBy: text('reviewed_by').references(() => user.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('idx_document_extractions_tenant_document').on(table.tenantId, table.documentId),
    index('idx_document_extractions_tenant_entity').on(
      table.tenantId,
      table.entityType,
      table.entityId
    ),
    index('idx_document_extractions_workflow').on(table.workflow),
    index('idx_document_extractions_review_status').on(table.reviewStatus),
    uniqueIndex('idx_document_extractions_source_run').on(table.sourceRunId),
  ]
);

export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;
export type DocumentExtraction = typeof documentExtractions.$inferSelect;
export type NewDocumentExtraction = typeof documentExtractions.$inferInsert;
