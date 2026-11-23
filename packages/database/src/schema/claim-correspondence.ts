import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claims } from './claim-core';
import { tenants } from './tenants';

// Closed tail grammar (tenant guard): fresh tables only, no helpers, no `$type`.
// Value sets are database checks; the domain parses them at its read sites.

export const claimAuthorities = pgTable(
  'claim_authorities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    kind: text('kind').notNull(),
    scope: text('scope').notNull(),
    evidenceDocumentId: text('evidence_document_id').notNull(),
    evidenceBucket: text('evidence_bucket').notNull(),
    evidenceFilePath: text('evidence_file_path').notNull(),
    version: varchar('version', { length: 50 }).notNull(),
    jurisdictionCountryCode: text('jurisdiction_country_code'),
    jurisdictionAttestedByUserId: text('jurisdiction_attested_by_user_id'),
    jurisdictionAttestedAt: timestamp('jurisdiction_attested_at', {
      withTimezone: true,
      precision: 3,
    }),
    purpose: varchar('purpose', { length: 500 }),
    grantedAt: timestamp('granted_at', { withTimezone: true, precision: 3 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, precision: 3 }),
    revokedByUserId: text('revoked_by_user_id'),
    recordedByStaffId: text('recorded_by_staff_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('claim_authorities_correlation_uq').on(t.tenantId, t.correlationId),
    uniqueIndex('claim_authorities_tenant_claim_id_uq').on(t.tenantId, t.claimId, t.id),
    uniqueIndex('claim_authorities_claim_kind_uq').on(t.tenantId, t.claimId, t.kind),
    index('claim_authorities_claim_idx').on(t.tenantId, t.claimId, t.createdAt),
    index('claim_authorities_evidence_idx').on(t.tenantId, t.claimId, t.evidenceDocumentId),
    foreignKey({
      name: 'claim_authorities_claim_fk',
      columns: [t.tenantId, t.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_authorities_recorded_by_fk',
      columns: [t.tenantId, t.recordedByStaffId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'claim_authorities_revoked_by_fk',
      columns: [t.tenantId, t.revokedByUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'claim_authorities_jurisdiction_attested_by_fk',
      columns: [t.tenantId, t.jurisdictionAttestedByUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'claim_authorities_kind_check',
      sql`${t.kind} in ('recovery_agreement', 'power_of_attorney', 'signed_assignment', 'consent_or_lawful_basis')`
    ),
    check(
      'claim_authorities_scope_check',
      sql`${t.scope} in ('recovery', 'representation', 'document_sharing')`
    ),
    check(
      'claim_authorities_kind_scope_check',
      sql`(${t.kind} in ('recovery_agreement', 'signed_assignment') and ${t.scope} = 'recovery')
        or (${t.kind} = 'power_of_attorney' and ${t.scope} = 'representation')
        or (${t.kind} = 'consent_or_lawful_basis' and ${t.scope} = 'document_sharing')`
    ),
    check('claim_authorities_version_check', sql`${t.version} ~ '\\S'`),
    check(
      'claim_authorities_jurisdiction_check',
      sql`(${t.kind} = 'power_of_attorney') = (${t.jurisdictionCountryCode} is not null)
        and (${t.jurisdictionCountryCode} is null or ${t.jurisdictionCountryCode} ~ '^[A-Z]{2}$')
        and (${t.kind} = 'power_of_attorney') = (${t.jurisdictionAttestedByUserId} is not null)
        and (${t.kind} = 'power_of_attorney') = (${t.jurisdictionAttestedAt} is not null)`
    ),
    check(
      'claim_authorities_purpose_check',
      sql`(${t.kind} = 'consent_or_lawful_basis') = (${t.purpose} is not null)
        and (${t.purpose} is null or ${t.purpose} ~ '\\S')`
    ),
    check(
      'claim_authorities_expiry_check',
      sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.grantedAt}`
    ),
    check(
      'claim_authorities_revocation_check',
      sql`(${t.revokedAt} is null) = (${t.revokedByUserId} is null)`
    ),
    pgPolicy('claim_authorities_tenant_policy', {
      for: 'all',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${t.claimId} and c.tenant_id = ${t.tenantId})`,
    }),
  ]
).enableRLS();

export const claimCorrespondence = pgTable(
  'claim_correspondence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    direction: text('direction').notNull(),
    partyKind: text('party_kind').notNull(),
    partyOrganisation: varchar('party_organisation', { length: 200 }).notNull(),
    partyReference: varchar('party_reference', { length: 200 }),
    partyContactName: varchar('party_contact_name', { length: 200 }),
    channel: text('channel').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 }).notNull(),
    body: varchar('body', { length: 4000 }).notNull(),
    inReplyToId: uuid('in_reply_to_id'),
    recoveryAuthorityId: uuid('recovery_authority_id'),
    representationAuthorityId: uuid('representation_authority_id'),
    sharingAuthorityId: uuid('sharing_authority_id'),
    sharedDocumentCount: integer('shared_document_count').notNull().default(0),
    sharingAttestedByUserId: text('sharing_attested_by_user_id'),
    sharingAttestedAt: timestamp('sharing_attested_at', { withTimezone: true, precision: 3 }),
    followUpAt: timestamp('follow_up_at', { withTimezone: true, precision: 3 }),
    decidedAt: timestamp('decided_at', { withTimezone: true, precision: 3 }),
    recordedByStaffId: text('recorded_by_staff_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('claim_correspondence_correlation_uq').on(t.tenantId, t.correlationId),
    uniqueIndex('claim_correspondence_tenant_claim_id_uq').on(t.tenantId, t.claimId, t.id),
    index('claim_correspondence_claim_idx').on(t.tenantId, t.claimId, t.occurredAt, t.id),
    index('claim_correspondence_reply_idx').on(t.tenantId, t.claimId, t.inReplyToId),
    foreignKey({
      name: 'claim_correspondence_claim_fk',
      columns: [t.tenantId, t.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_correspondence_reply_fk',
      columns: [t.tenantId, t.claimId, t.inReplyToId],
      foreignColumns: [t.tenantId, t.claimId, t.id],
    }),
    foreignKey({
      name: 'claim_correspondence_recovery_authority_fk',
      columns: [t.tenantId, t.claimId, t.recoveryAuthorityId],
      foreignColumns: [claimAuthorities.tenantId, claimAuthorities.claimId, claimAuthorities.id],
    }),
    foreignKey({
      name: 'claim_correspondence_representation_authority_fk',
      columns: [t.tenantId, t.claimId, t.representationAuthorityId],
      foreignColumns: [claimAuthorities.tenantId, claimAuthorities.claimId, claimAuthorities.id],
    }),
    foreignKey({
      name: 'claim_correspondence_sharing_authority_fk',
      columns: [t.tenantId, t.claimId, t.sharingAuthorityId],
      foreignColumns: [claimAuthorities.tenantId, claimAuthorities.claimId, claimAuthorities.id],
    }),
    foreignKey({
      name: 'claim_correspondence_recorded_by_fk',
      columns: [t.tenantId, t.recordedByStaffId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'claim_correspondence_sharing_attested_by_fk',
      columns: [t.tenantId, t.sharingAttestedByUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check('claim_correspondence_direction_check', sql`${t.direction} in ('outbound', 'inbound')`),
    check(
      'claim_correspondence_party_kind_check',
      sql`${t.partyKind} in ('insurer', 'bureau', 'other')`
    ),
    check(
      'claim_correspondence_channel_check',
      sql`${t.channel} in ('email', 'post', 'phone', 'portal', 'other')`
    ),
    check('claim_correspondence_organisation_check', sql`${t.partyOrganisation} ~ '\\S'`),
    check('claim_correspondence_body_check', sql`${t.body} ~ '\\S'`),
    check(
      'claim_correspondence_reply_direction_check',
      sql`${t.inReplyToId} is null or ${t.direction} = 'inbound'`
    ),
    check(
      'claim_correspondence_document_count_check',
      sql`${t.sharedDocumentCount} between 0 and 20`
    ),
    check(
      'claim_correspondence_sharing_check',
      sql`(${t.sharingAuthorityId} is not null) = (${t.sharedDocumentCount} > 0)
        and (${t.sharingAuthorityId} is not null) = (${t.sharingAttestedByUserId} is not null)
        and (${t.sharingAuthorityId} is not null) = (${t.sharingAttestedAt} is not null)
        and (${t.sharingAuthorityId} is null or ${t.direction} = 'outbound')`
    ),
    check(
      'claim_correspondence_outbound_check',
      sql`${t.direction} <> 'outbound' or (${t.recoveryAuthorityId} is not null and ${t.representationAuthorityId} is not null and ${t.decidedAt} is not null)`
    ),
    check(
      'claim_correspondence_inbound_check',
      sql`${t.direction} <> 'inbound' or (${t.recoveryAuthorityId} is null and ${t.representationAuthorityId} is null
        and ${t.sharingAuthorityId} is null and ${t.sharedDocumentCount} = 0
        and ${t.sharingAttestedByUserId} is null and ${t.sharingAttestedAt} is null
        and ${t.followUpAt} is null and ${t.decidedAt} is null)`
    ),
    pgPolicy('claim_correspondence_tenant_policy', {
      for: 'all',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${t.claimId} and c.tenant_id = ${t.tenantId})`,
    }),
  ]
).enableRLS();

export const claimCorrespondenceDocuments = pgTable(
  'claim_correspondence_documents',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id').notNull(),
    correspondenceId: uuid('correspondence_id').notNull(),
    claimDocumentId: text('claim_document_id').notNull(),
    documentBucket: text('document_bucket').notNull(),
    documentFilePath: text('document_file_path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  t => [
    index('claim_correspondence_documents_entry_idx').on(t.tenantId, t.claimId, t.correspondenceId),
    index('claim_correspondence_documents_document_idx').on(
      t.tenantId,
      t.claimId,
      t.claimDocumentId
    ),
    uniqueIndex('claim_correspondence_documents_entry_uq').on(
      t.correspondenceId,
      t.claimDocumentId
    ),
    foreignKey({
      name: 'claim_correspondence_documents_claim_fk',
      columns: [t.tenantId, t.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_correspondence_documents_correspondence_fk',
      columns: [t.tenantId, t.claimId, t.correspondenceId],
      foreignColumns: [
        claimCorrespondence.tenantId,
        claimCorrespondence.claimId,
        claimCorrespondence.id,
      ],
    }),
    pgPolicy('claim_correspondence_documents_tenant_policy', {
      for: 'all',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${t.claimId} and c.tenant_id = ${t.tenantId})`,
    }),
  ]
).enableRLS();
