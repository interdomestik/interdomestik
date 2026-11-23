import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgPolicy, pgTable } from 'drizzle-orm/pg-core';
import { text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
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
  table => [
    uniqueIndex('claim_authorities_correlation_uq').on(table.tenantId, table.correlationId),
    uniqueIndex('claim_authorities_tenant_claim_id_uq').on(table.tenantId, table.claimId, table.id),
    uniqueIndex('claim_authorities_claim_kind_uq').on(table.tenantId, table.claimId, table.kind),
    index('claim_authorities_claim_idx').on(table.tenantId, table.claimId, table.createdAt),
    index('claim_authorities_evidence_idx').on(
      table.tenantId,
      table.claimId,
      table.evidenceDocumentId
    ),
    foreignKey({
      name: 'claim_authorities_claim_fk',
      columns: [table.tenantId, table.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_authorities_recorded_by_fk',
      columns: [table.tenantId, table.recordedByStaffId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'claim_authorities_revoked_by_fk',
      columns: [table.tenantId, table.revokedByUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'claim_authorities_jurisdiction_attested_by_fk',
      columns: [table.tenantId, table.jurisdictionAttestedByUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'claim_authorities_kind_check',
      sql`${table.kind} in ('recovery_agreement', 'power_of_attorney', 'signed_assignment', 'consent_or_lawful_basis')`
    ),
    check(
      'claim_authorities_scope_check',
      sql`${table.scope} in ('recovery', 'representation', 'document_sharing')`
    ),
    check(
      'claim_authorities_kind_scope_check',
      sql`(${table.kind} in ('recovery_agreement', 'signed_assignment') and ${table.scope} = 'recovery')
        or (${table.kind} = 'power_of_attorney' and ${table.scope} = 'representation')
        or (${table.kind} = 'consent_or_lawful_basis' and ${table.scope} = 'document_sharing')`
    ),
    check('claim_authorities_version_check', sql`${table.version} ~ '\\S'`),
    check(
      'claim_authorities_jurisdiction_check',
      sql`(${table.kind} = 'power_of_attorney') = (${table.jurisdictionCountryCode} is not null)
        and (${table.jurisdictionCountryCode} is null or ${table.jurisdictionCountryCode} ~ '^[A-Z]{2}$')
        and (${table.kind} = 'power_of_attorney') = (${table.jurisdictionAttestedByUserId} is not null)
        and (${table.kind} = 'power_of_attorney') = (${table.jurisdictionAttestedAt} is not null)`
    ),
    check(
      'claim_authorities_purpose_check',
      sql`(${table.kind} = 'consent_or_lawful_basis') = (${table.purpose} is not null)
        and (${table.purpose} is null or ${table.purpose} ~ '\\S')`
    ),
    check(
      'claim_authorities_expiry_check',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.grantedAt}`
    ),
    check(
      'claim_authorities_revocation_check',
      sql`(${table.revokedAt} is null) = (${table.revokedByUserId} is null)`
    ),
    pgPolicy('claim_authorities_tenant_policy', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
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
  table => [
    uniqueIndex('claim_correspondence_correlation_uq').on(table.tenantId, table.correlationId),
    uniqueIndex('claim_correspondence_tenant_claim_id_uq').on(
      table.tenantId,
      table.claimId,
      table.id
    ),
    index('claim_correspondence_claim_idx').on(
      table.tenantId,
      table.claimId,
      table.occurredAt,
      table.id
    ),
    index('claim_correspondence_reply_idx').on(table.tenantId, table.claimId, table.inReplyToId),
    foreignKey({
      name: 'claim_correspondence_claim_fk',
      columns: [table.tenantId, table.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_correspondence_reply_fk',
      columns: [table.tenantId, table.claimId, table.inReplyToId],
      foreignColumns: [table.tenantId, table.claimId, table.id],
    }),
    foreignKey({
      name: 'claim_correspondence_recovery_authority_fk',
      columns: [table.tenantId, table.claimId, table.recoveryAuthorityId],
      foreignColumns: [claimAuthorities.tenantId, claimAuthorities.claimId, claimAuthorities.id],
    }),
    foreignKey({
      name: 'claim_correspondence_representation_authority_fk',
      columns: [table.tenantId, table.claimId, table.representationAuthorityId],
      foreignColumns: [claimAuthorities.tenantId, claimAuthorities.claimId, claimAuthorities.id],
    }),
    foreignKey({
      name: 'claim_correspondence_sharing_authority_fk',
      columns: [table.tenantId, table.claimId, table.sharingAuthorityId],
      foreignColumns: [claimAuthorities.tenantId, claimAuthorities.claimId, claimAuthorities.id],
    }),
    foreignKey({
      name: 'claim_correspondence_recorded_by_fk',
      columns: [table.tenantId, table.recordedByStaffId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'claim_correspondence_sharing_attested_by_fk',
      columns: [table.tenantId, table.sharingAttestedByUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'claim_correspondence_direction_check',
      sql`${table.direction} in ('outbound', 'inbound')`
    ),
    check(
      'claim_correspondence_party_kind_check',
      sql`${table.partyKind} in ('insurer', 'bureau', 'other')`
    ),
    check(
      'claim_correspondence_channel_check',
      sql`${table.channel} in ('email', 'post', 'phone', 'portal', 'other')`
    ),
    check('claim_correspondence_organisation_check', sql`${table.partyOrganisation} ~ '\\S'`),
    check('claim_correspondence_body_check', sql`${table.body} ~ '\\S'`),
    check(
      'claim_correspondence_reply_direction_check',
      sql`${table.inReplyToId} is null or ${table.direction} = 'inbound'`
    ),
    check(
      'claim_correspondence_document_count_check',
      sql`${table.sharedDocumentCount} between 0 and 20`
    ),
    check(
      'claim_correspondence_sharing_check',
      sql`(${table.sharingAuthorityId} is not null) = (${table.sharedDocumentCount} > 0)
        and (${table.sharingAuthorityId} is not null) = (${table.sharingAttestedByUserId} is not null)
        and (${table.sharingAuthorityId} is not null) = (${table.sharingAttestedAt} is not null)
        and (${table.sharingAuthorityId} is null or ${table.direction} = 'outbound')`
    ),
    check(
      'claim_correspondence_outbound_check',
      sql`${table.direction} <> 'outbound' or (${table.recoveryAuthorityId} is not null and ${table.representationAuthorityId} is not null and ${table.decidedAt} is not null)`
    ),
    check(
      'claim_correspondence_inbound_check',
      sql`${table.direction} <> 'inbound' or (${table.recoveryAuthorityId} is null and ${table.representationAuthorityId} is null
        and ${table.sharingAuthorityId} is null and ${table.sharedDocumentCount} = 0
        and ${table.sharingAttestedByUserId} is null and ${table.sharingAttestedAt} is null
        and ${table.followUpAt} is null and ${table.decidedAt} is null)`
    ),
    pgPolicy('claim_correspondence_tenant_policy', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
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
  table => [
    index('claim_correspondence_documents_entry_idx').on(
      table.tenantId,
      table.claimId,
      table.correspondenceId
    ),
    index('claim_correspondence_documents_document_idx').on(
      table.tenantId,
      table.claimId,
      table.claimDocumentId
    ),
    uniqueIndex('claim_correspondence_documents_entry_uq').on(
      table.correspondenceId,
      table.claimDocumentId
    ),
    foreignKey({
      name: 'claim_correspondence_documents_claim_fk',
      columns: [table.tenantId, table.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_correspondence_documents_correspondence_fk',
      columns: [table.tenantId, table.claimId, table.correspondenceId],
      foreignColumns: [
        claimCorrespondence.tenantId,
        claimCorrespondence.claimId,
        claimCorrespondence.id,
      ],
    }),
    pgPolicy('claim_correspondence_documents_tenant_policy', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
    }),
  ]
).enableRLS();
