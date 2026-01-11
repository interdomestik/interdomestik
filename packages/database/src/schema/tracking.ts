import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { claims } from './claims';
import { tenants } from './tenants';

export const claimTrackingTokens = pgTable(
  'claim_tracking_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    tokenHash: text('token_hash').notNull(), // sha256 of the token
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  table => [
    // Ensure fast lookup by tenant + token hash
    unique('idx_claim_tracking_tokens_hash_tenant').on(table.tenantId, table.tokenHash),
    // Ensure we can list tokens for a claim
    index('idx_claim_tracking_tokens_claim').on(table.claimId),
  ]
);
