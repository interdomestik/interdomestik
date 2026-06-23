export const NON_BLOCKING_RECOVERY_LIFECYCLE_STATES = [
  'not_started',
  'resolved',
  'closed',
] as const;

export type KnownRecoveryLifecycleState =
  | 'negotiation'
  | 'court'
  | (typeof NON_BLOCKING_RECOVERY_LIFECYCLE_STATES)[number];

export type RecoveryLifecycleState = KnownRecoveryLifecycleState | (string & {}) | null;

export const ENTITY_MIGRATION_REPAIR_CATEGORIES = [
  'missing_subscription',
  'missing_residence_country',
  'unsupported_jurisdiction',
  'missing_subscription_legal_entity',
  'missing_subscription_legal_tenant',
  'subscription_legal_tenant_mismatch',
  'missing_target_legal_entity',
  'ambiguous_legal_entity',
  'inactive_target_legal_entity',
  'target_legal_entity_tenant_mismatch',
  'target_legal_entity_country_mismatch',
  'missing_target_governing_law',
  'missing_target_terms_version',
  'missing_default_booking_link',
  'booking_legal_entity_mismatch',
  'booking_tenant_mismatch',
  'missing_governing_law_snapshot',
  'missing_terms_version_accepted',
  'active_recovery_runoff_required',
] as const;

export type EntityMigrationRepairCategory = (typeof ENTITY_MIGRATION_REPAIR_CATEGORIES)[number];

export type EntityMigrationReadinessStatus =
  | 'eligible'
  | 'blocked_active_recovery_runoff'
  | 'blocked_repair_required';

export type EntityMigrationEvidenceSource =
  | 'subscription'
  | 'member_residence'
  | 'subscription_legal_boundary'
  | 'target_legal_entity'
  | 'default_booking_link'
  | 'active_recovery_cases';

export interface EntityMigrationLegalEntityEvidence {
  readonly id: string;
  readonly tenantId: string;
  readonly countryCode: string | null;
  readonly governingLaw: string | null;
  readonly termsVersion: string | null;
  readonly isActive: boolean | null;
}

export interface EntityMigrationDefaultBookingLinkEvidence {
  readonly id: string;
  readonly tenantId: string;
  readonly defaultBookingTenantId: string;
  readonly legalEntityId: string;
}

export interface EntityMigrationRecoveryCaseEvidence {
  readonly claimId: string;
  readonly recoveryLifecycleState: RecoveryLifecycleState;
}

export interface EntityMigrationReadinessCandidate {
  readonly memberId: string;
  readonly tenantId: string;
  readonly subscriptionId: string | null;
  readonly residenceCountry: string | null;
  readonly subscriptionLegalTenantId: string | null;
  readonly subscriptionLegalEntityId: string | null;
  readonly governingLawSnapshot: string | null;
  readonly termsVersionAccepted: string | null;
  readonly targetLegalEntity: EntityMigrationLegalEntityEvidence | null;
  readonly targetLegalEntityCandidateCount?: number;
  readonly defaultBookingLink: EntityMigrationDefaultBookingLinkEvidence | null;
  readonly activeRecoveryCases: readonly EntityMigrationRecoveryCaseEvidence[];
}

export interface EntityMigrationReadinessOptions {
  readonly supportedResidenceCountries?: readonly string[];
}

export interface EntityMigrationReadinessEvidence {
  readonly source: EntityMigrationEvidenceSource;
  readonly present: boolean;
  readonly reference: string;
  readonly fields: readonly string[];
}

export interface EntityMigrationReadinessResult {
  readonly memberId: string;
  readonly tenantId: string;
  readonly subscriptionId: string | null;
  readonly status: EntityMigrationReadinessStatus;
  readonly repairCategories: readonly EntityMigrationRepairCategory[];
  readonly evidence: readonly EntityMigrationReadinessEvidence[];
  readonly activeRecoveryCaseCount: number;
  readonly runoffRequired: boolean;
  readonly noWrite: true;
}

export type EntityMigrationRepairSummary = Partial<Record<EntityMigrationRepairCategory, number>>;

export interface EntityMigrationReadinessSummary {
  readonly totalCandidates: number;
  readonly eligibleCount: number;
  readonly blockedActiveRecoveryRunoffCount: number;
  readonly blockedRepairRequiredCount: number;
  readonly repairCategoryCounts: EntityMigrationRepairSummary;
}

export interface EntityMigrationReadinessReport {
  readonly summary: EntityMigrationReadinessSummary;
  readonly results: readonly EntityMigrationReadinessResult[];
  readonly noWrite: true;
}
