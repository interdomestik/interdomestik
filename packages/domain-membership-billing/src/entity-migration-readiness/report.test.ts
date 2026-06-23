import { describe, expect, it } from 'vitest';

import { buildEntityMigrationReadinessReport, summarizeResults } from './report';
import { readinessCandidate } from './test-support';

describe('entity migration readiness report', () => {
  it('builds deterministic aggregate eligibility and repair counts', () => {
    const report = buildEntityMigrationReadinessReport([
      readinessCandidate({ memberId: 'eligible-member' }),
      readinessCandidate({
        memberId: 'runoff-member',
        activeRecoveryCases: [{ claimId: 'claim-1', recoveryLifecycleState: 'court' }],
      }),
      readinessCandidate({
        memberId: 'repair-member',
        residenceCountry: null,
        targetLegalEntity: {
          id: 'le-de',
          tenantId: 'tenant-home',
          countryCode: 'DE',
          governingLaw: null,
          termsVersion: null,
          isActive: false,
        },
      }),
    ]);

    expect(report.noWrite).toBe(true);
    expect(report.summary).toEqual({
      totalCandidates: 3,
      eligibleCount: 1,
      blockedActiveRecoveryRunoffCount: 1,
      blockedRepairRequiredCount: 1,
      repairCategoryCounts: {
        missing_residence_country: 1,
        inactive_target_legal_entity: 1,
        missing_target_governing_law: 1,
        missing_target_terms_version: 1,
        active_recovery_runoff_required: 1,
      },
    });
    expect(report.results.map(({ memberId, status }) => [memberId, status])).toEqual([
      ['eligible-member', 'eligible'],
      ['runoff-member', 'blocked_active_recovery_runoff'],
      ['repair-member', 'blocked_repair_required'],
    ]);
  });

  it('summarizes an empty dry-run without ambient timestamps or side effects', () => {
    expect(summarizeResults([])).toEqual({
      totalCandidates: 0,
      eligibleCount: 0,
      blockedActiveRecoveryRunoffCount: 0,
      blockedRepairRequiredCount: 0,
      repairCategoryCounts: {},
    });
  });
});
