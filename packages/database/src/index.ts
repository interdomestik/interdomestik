// Re-export all types
export * from './types';

// Export client creators
export { createClient } from './client';
export { createAdminClient, createServerSupabaseClient } from './server';
export {
  appendEvent,
  type AppendEventParams,
  type AppendEventResult,
  type DomainEventTx,
} from './domain-events';
export {
  domainEventDeliveryIdempotencyKey,
  recordDomainEventDelivery,
  relayDomainEvents,
  selectDomainEventsForRelay,
  type DomainEventRelayConsumer,
  type DomainEventRelayEvent,
  type RelayDomainEventsParams,
  type RelayDomainEventsResult,
  type RelayMode,
} from './domain-event-relay';
export {
  CLAIM_STATUS_AUDIT_PROJECTION_CONSUMER_NAME,
  claimStatusAuditProjectionConsumer,
  projectClaimStatusChangedAuditEvent,
  relayClaimStatusAuditProjectionEvents,
  type ProjectClaimStatusChangedAuditResult,
} from './domain-event-audit-projection';
export { withTenantContext, withTenantDb, type TenantTransaction } from './tenant';

// Export Drizzle instance and schema
export { db, dbAdmin, dbRls } from './db';
export * from './schema';

// Re-export Drizzle helpers so consumers use the same module instance
export { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
export * from './e2e-users';
