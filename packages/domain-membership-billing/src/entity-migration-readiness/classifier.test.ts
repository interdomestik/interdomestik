import { describe, expect, it } from 'vitest';

import {
  classifyEntityMigrationReadinessCandidate,
  isActiveRecoveryLifecycleState,
} from './classifier';
import { readinessCandidate } from './test-support';

describe('entity migration readiness classifier', () => {
  it('marks a fully evidenced candidate eligible without requiring writes', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({ residenceCountry: 'de' }),
      {
        supportedResidenceCountries: ['de'],
      }
    );

    expect(result).toMatchObject({
      memberId: 'member-1',
      tenantId: 'tenant-home',
      subscriptionId: 'sub-1',
      status: 'eligible',
      repairCategories: [],
      activeRecoveryCaseCount: 0,
      runoffRequired: false,
      noWrite: true,
    });
    expect(result.evidence.map(({ source, present }) => [source, present])).toEqual([
      ['subscription', true],
      ['member_residence', true],
      ['subscription_legal_boundary', true],
      ['target_legal_entity', true],
      ['default_booking_link', true],
      ['active_recovery_cases', true],
    ]);
  });

  it('blocks non-terminal recovery lifecycle states for documented run-off', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        governingLawSnapshot: null,
        activeRecoveryCases: [
          { claimId: 'claim-1', recoveryLifecycleState: 'negotiation' },
          { claimId: 'claim-2', recoveryLifecycleState: 'court' },
          { claimId: 'claim-3', recoveryLifecycleState: 'resolved' },
        ],
      })
    );

    expect(result.status).toBe('blocked_active_recovery_runoff');
    expect(result.activeRecoveryCaseCount).toBe(2);
    expect(result.runoffRequired).toBe(true);
    expect(result.repairCategories).toContain('active_recovery_runoff_required');
    expect(result.repairCategories).toContain('missing_governing_law_snapshot');
  });

  it('treats terminal and inactive recovery lifecycle states as non-blocking', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        activeRecoveryCases: [
          { claimId: 'claim-1', recoveryLifecycleState: 'not_started' },
          { claimId: 'claim-2', recoveryLifecycleState: 'resolved' },
          { claimId: 'claim-3', recoveryLifecycleState: 'closed' },
          { claimId: 'claim-4', recoveryLifecycleState: null },
        ],
      })
    );

    expect(result.status).toBe('eligible');
    expect(result.activeRecoveryCaseCount).toBe(0);
    expect(isActiveRecoveryLifecycleState('negotiation')).toBe(true);
    expect(isActiveRecoveryLifecycleState('resolved')).toBe(false);
    expect(isActiveRecoveryLifecycleState(null)).toBe(false);
  });

  it('fails closed for unrecognized recovery lifecycle states until proven terminal', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        activeRecoveryCases: [{ claimId: 'claim-appeal', recoveryLifecycleState: 'appeal' }],
      })
    );

    expect(result.status).toBe('blocked_active_recovery_runoff');
    expect(result.activeRecoveryCaseCount).toBe(1);
    expect(isActiveRecoveryLifecycleState('appeal')).toBe(true);
  });

  it('classifies missing and ambiguous legal evidence as repair-required', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        subscriptionId: null,
        residenceCountry: 'FR',
        subscriptionLegalTenantId: null,
        subscriptionLegalEntityId: '',
        targetLegalEntity: null,
        targetLegalEntityCandidateCount: 2,
        defaultBookingLink: null,
        governingLawSnapshot: null,
        termsVersionAccepted: '',
      }),
      { supportedResidenceCountries: ['DE'] }
    );

    expect(result.status).toBe('blocked_repair_required');
    expect(result.repairCategories).toEqual([
      'missing_subscription',
      'unsupported_jurisdiction',
      'missing_subscription_legal_entity',
      'missing_subscription_legal_tenant',
      'missing_target_legal_entity',
      'ambiguous_legal_entity',
      'missing_default_booking_link',
      'missing_governing_law_snapshot',
      'missing_terms_version_accepted',
    ]);
  });

  it('requires booking links to point at the target legal entity', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        defaultBookingLink: {
          id: 'booking-link-1',
          tenantId: 'tenant-home',
          defaultBookingTenantId: 'tenant-home',
          legalEntityId: 'le-other',
        },
      })
    );

    expect(result.status).toBe('blocked_repair_required');
    expect(result.repairCategories).toEqual(['booking_legal_entity_mismatch']);
  });
});
