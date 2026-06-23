import { buildEntityMigrationReadinessEvidence } from './evidence';
import { hasEvidenceText, isActiveRecoveryLifecycleState, normalizeCountryCode } from './guards';
import { ENTITY_MIGRATION_REPAIR_CATEGORIES } from './types';

import type {
  EntityMigrationReadinessCandidate,
  EntityMigrationReadinessOptions,
  EntityMigrationReadinessResult,
  EntityMigrationRepairCategory,
} from './types';

export function classifyEntityMigrationReadinessCandidate(
  candidate: EntityMigrationReadinessCandidate,
  options: EntityMigrationReadinessOptions = {}
): EntityMigrationReadinessResult {
  const repairs = new Set<EntityMigrationRepairCategory>();
  addSubscriptionRepairs(candidate, repairs);
  addResidenceRepairs(candidate, options, repairs);
  addLegalEntityRepairs(candidate, repairs);
  addBookingRepairs(candidate, repairs);

  const activeRecoveryCaseCount = candidate.activeRecoveryCases.filter(
    ({ recoveryLifecycleState }) => isActiveRecoveryLifecycleState(recoveryLifecycleState)
  ).length;

  if (activeRecoveryCaseCount > 0) {
    repairs.add('active_recovery_runoff_required');
  }

  const repairCategories = ENTITY_MIGRATION_REPAIR_CATEGORIES.filter(category =>
    repairs.has(category)
  );

  return {
    memberId: candidate.memberId,
    tenantId: candidate.tenantId,
    subscriptionId: candidate.subscriptionId,
    status:
      activeRecoveryCaseCount > 0
        ? 'blocked_active_recovery_runoff'
        : repairCategories.length > 0
          ? 'blocked_repair_required'
          : 'eligible',
    repairCategories,
    evidence: buildEntityMigrationReadinessEvidence(candidate),
    activeRecoveryCaseCount,
    runoffRequired: activeRecoveryCaseCount > 0,
    noWrite: true,
  };
}

function addSubscriptionRepairs(
  candidate: EntityMigrationReadinessCandidate,
  repairs: Set<EntityMigrationRepairCategory>
): void {
  if (!hasEvidenceText(candidate.subscriptionId)) {
    repairs.add('missing_subscription');
  }
  if (!hasEvidenceText(candidate.subscriptionLegalEntityId)) {
    repairs.add('missing_subscription_legal_entity');
  }
  if (!hasEvidenceText(candidate.subscriptionLegalTenantId)) {
    repairs.add('missing_subscription_legal_tenant');
  } else if (candidate.subscriptionLegalTenantId !== candidate.tenantId) {
    repairs.add('subscription_legal_tenant_mismatch');
  }
  if (!hasEvidenceText(candidate.governingLawSnapshot)) {
    repairs.add('missing_governing_law_snapshot');
  }
  if (!hasEvidenceText(candidate.termsVersionAccepted)) {
    repairs.add('missing_terms_version_accepted');
  }
}

function addResidenceRepairs(
  candidate: EntityMigrationReadinessCandidate,
  options: EntityMigrationReadinessOptions,
  repairs: Set<EntityMigrationRepairCategory>
): void {
  const residenceCountry = normalizeCountryCode(candidate.residenceCountry);
  if (!residenceCountry) {
    repairs.add('missing_residence_country');
    return;
  }

  const supportedResidenceCountries = options.supportedResidenceCountries?.flatMap(country => {
    const normalized = normalizeCountryCode(country);
    return normalized ? [normalized] : [];
  });

  if (supportedResidenceCountries && !supportedResidenceCountries.includes(residenceCountry)) {
    repairs.add('unsupported_jurisdiction');
  }
  if (
    candidate.targetLegalEntity &&
    normalizeCountryCode(candidate.targetLegalEntity.countryCode) !== residenceCountry
  ) {
    repairs.add('target_legal_entity_country_mismatch');
  }
}

function addLegalEntityRepairs(
  candidate: EntityMigrationReadinessCandidate,
  repairs: Set<EntityMigrationRepairCategory>
): void {
  const candidateCount =
    candidate.targetLegalEntityCandidateCount ?? (candidate.targetLegalEntity ? 1 : 0);
  if (candidateCount > 1) {
    repairs.add('ambiguous_legal_entity');
  }
  if (!candidate.targetLegalEntity) {
    repairs.add('missing_target_legal_entity');
    return;
  }
  if (candidate.targetLegalEntity.tenantId !== candidate.tenantId) {
    repairs.add('target_legal_entity_tenant_mismatch');
  }
  if (candidate.targetLegalEntity.isActive === false) {
    repairs.add('inactive_target_legal_entity');
  }
  if (!hasEvidenceText(candidate.targetLegalEntity.governingLaw)) {
    repairs.add('missing_target_governing_law');
  }
  if (!hasEvidenceText(candidate.targetLegalEntity.termsVersion)) {
    repairs.add('missing_target_terms_version');
  }
}

function addBookingRepairs(
  candidate: EntityMigrationReadinessCandidate,
  repairs: Set<EntityMigrationRepairCategory>
): void {
  if (!candidate.defaultBookingLink) {
    repairs.add('missing_default_booking_link');
    return;
  }
  if (
    candidate.targetLegalEntity &&
    candidate.defaultBookingLink.legalEntityId !== candidate.targetLegalEntity.id
  ) {
    repairs.add('booking_legal_entity_mismatch');
  }
  if (
    candidate.defaultBookingLink.tenantId !== candidate.tenantId ||
    candidate.defaultBookingLink.defaultBookingTenantId !== candidate.tenantId
  ) {
    repairs.add('booking_tenant_mismatch');
  }
}
