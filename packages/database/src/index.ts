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
  isSubjectErased,
  markSubjectErased,
  type DomainEventErasureTx,
  type IsSubjectErasedParams,
  type MarkSubjectErasedParams,
} from './domain-event-erasure';
export {
  ERASURE_REDACTED_VALUE,
  ERASURE_RENDER_STORES,
  redactAuditMetadataForErasure,
  renderClaimDocumentForErasedSubject,
  renderClaimForErasedSubject,
  renderMemberNoteForErasedSubject,
  renderTimelineEventAfterErasure,
  type ErasureRenderStore,
} from './domain-event-erasure-render';
export {
  createEventPiiReference,
  type CreateEventPiiReferenceParams,
  type CreateEventPiiReferenceResult,
  type DomainEventPiiTx,
  readEventPiiReference,
  type ReadEventPiiReferenceParams,
  type ReadEventPiiReferenceResult,
} from './domain-event-pii';
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
  projectClaimStatusChangedAuditEvent,
  relayClaimStatusAuditProjectionEvents,
  type ProjectClaimStatusChangedAuditResult,
} from './domain-event-audit-projection';
export {
  CLAIM_STATUS_LIFECYCLE_FIELDS,
  claimStatusFromLifecycleFields,
  claimLifecycleFieldsForStatus,
  type ClaimLifecycleFields,
} from './claim-lifecycle';
export { withTenantContext, withTenantDb, type TenantTransaction } from './tenant';

// Fixed, purpose-specific privileged lookups and commands for the cases that precede any tenant
// context. Each module confines dbAdmin and returns ids or minimal columns only; see its header.
export { authorizePublicSiteTenant } from './public-site-tenant';
export { delegateClaimHomeTenantRead } from './claim-home-tenant';
export {
  resolveClaimTrackingTokenTenant,
  resolveNpsSurveyTokenTenant,
  resolveSharePackTenant,
  type ClaimTrackingTokenTenant,
  type NpsSurveyTokenTenant,
  type SharePackTenant,
} from './public-token-tenant';
export {
  authorizeInngestEventTenant,
  MAX_SCHEDULED_TENANTS,
  listScheduledTenantWork,
  listTenantIdsForScheduledWork,
  type ScheduledTenantWork,
} from './scheduled-tenant-work';
export {
  admitVerifiedPaddleReceipt,
  appendPaddleInvalidSignatureEvidence,
  completePaddleReceiptLease,
  type PaddleReceiptAdmission,
  type PaddleReceiptCompletion,
  type PaddleReceiptEvidence,
  type PaddleReceiptLease,
} from './paddle-webhook-receipts';
export {
  readVerifiedPaddleTransactionEvidence,
  resolvePaddleCustomerEmailOwner,
  resolvePaddleSubscriptionOwner,
  resolvePaddleUserOwner,
  type PaddleSubscriptionOwner,
  type PaddleTransactionEvidence,
  type PaddleUserOwner,
} from './paddle-provider-resolution';
export {
  appendAnonymousTenantAuditEvent,
  type AnonymousTenantAuditEvent,
} from './anonymous-tenant-audit';
export {
  appendTenantMemberCredential,
  hasTenantMemberCredential,
  type TenantMemberCredential,
} from './tenant-member-credential';
export { issueTenantMemberNumber, type TenantMemberNumberRequest } from './tenant-member-number';
export {
  appendCaseGrantDocumentAudit,
  type CaseGrantDocumentAuditEvent,
  type CaseGrantDocumentSource,
} from './case-grant-document-audit';
export {
  authorizePaddleBillingTenant,
  authorizePaddleTenant,
  type ResolvedPaddleOwner,
} from './paddle-tenant-authority';
export {
  MAX_PLATFORM_TENANTS,
  delegateSuperAdminBranchOwner,
  delegateSuperAdminTenant,
  listPublicStatisticsWork,
  listSuperAdminAggregateWork,
  listSuperAdminTenantOptions,
  listTenantIdsForPlatformAggregate,
  readActiveTenantId,
  resolveBranchOwner,
  type BranchOwner,
  type DelegatedBranchOwner,
  type DelegatedTenantWork,
} from './platform-directory';

// Export Drizzle instance and schema
export { db, dbAdmin, dbRls } from './db';
export * from './schema';

// Re-export Drizzle helpers so consumers use the same module instance
export { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
export * from './e2e-users';
export * from './e2e-role-fixtures';
export * from './e2e-lifecycle-fixtures';
