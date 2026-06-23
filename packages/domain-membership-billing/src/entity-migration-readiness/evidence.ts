import { hasEvidenceText } from './guards';

import type { EntityMigrationReadinessCandidate, EntityMigrationReadinessEvidence } from './types';

const SUBSCRIPTION_FIELDS = [
  'subscriptions.id',
  'subscriptions.tenant_id',
  'subscriptions.legal_tenant_id',
  'subscriptions.legal_entity_id',
  'subscriptions.governing_law_snapshot',
  'subscriptions.terms_version_accepted',
] as const;

const MEMBER_RESIDENCE_FIELDS = ['user.id', 'user.residence_country'] as const;

const TARGET_LEGAL_ENTITY_FIELDS = [
  'legal_entities.id',
  'legal_entities.tenant_id',
  'legal_entities.country_code',
  'legal_entities.governing_law',
  'legal_entities.terms_version',
  'legal_entities.is_active',
] as const;

const DEFAULT_BOOKING_LINK_FIELDS = [
  'default_booking_links.tenant_id',
  'default_booking_links.default_booking_tenant_id',
  'default_booking_links.legal_entity_id',
] as const;

const ACTIVE_RECOVERY_FIELDS = [
  'claims.user_id',
  'claims.tenant_id',
  'claims.recovery_lifecycle_state',
] as const;

export function buildEntityMigrationReadinessEvidence(
  candidate: EntityMigrationReadinessCandidate
): readonly EntityMigrationReadinessEvidence[] {
  return [
    {
      source: 'subscription',
      present: hasEvidenceText(candidate.subscriptionId),
      reference: candidate.subscriptionId ?? 'missing',
      fields: SUBSCRIPTION_FIELDS,
    },
    {
      source: 'member_residence',
      present: hasEvidenceText(candidate.residenceCountry),
      reference: candidate.memberId,
      fields: MEMBER_RESIDENCE_FIELDS,
    },
    {
      source: 'subscription_legal_boundary',
      present:
        hasEvidenceText(candidate.subscriptionLegalTenantId) &&
        hasEvidenceText(candidate.subscriptionLegalEntityId),
      reference: candidate.subscriptionLegalEntityId ?? 'missing',
      fields: SUBSCRIPTION_FIELDS,
    },
    {
      source: 'target_legal_entity',
      present: candidate.targetLegalEntity !== null,
      reference: candidate.targetLegalEntity?.id ?? 'missing',
      fields: TARGET_LEGAL_ENTITY_FIELDS,
    },
    {
      source: 'default_booking_link',
      present: candidate.defaultBookingLink !== null,
      reference: candidate.defaultBookingLink?.id ?? 'missing',
      fields: DEFAULT_BOOKING_LINK_FIELDS,
    },
    {
      source: 'active_recovery_cases',
      present: true,
      reference: `${candidate.activeRecoveryCases.length} case(s) reviewed`,
      fields: ACTIVE_RECOVERY_FIELDS,
    },
  ];
}
