import { describe, expect, it } from 'vitest';

import { readinessCandidate } from '../entity-migration-readiness/test-support';
import { buildMemberEntityMigrationPlan } from './planning';

const approval = {
  approvedBy: 'ops-lead',
  kind: 'human_approval' as const,
  reference: 'approval:T-506:batch-1',
};

describe('member entity migration planning', () => {
  it('keeps eligible dry runs write-free while preserving target terms evidence', () => {
    const plan = buildMemberEntityMigrationPlan({
      candidate: readinessCandidate(),
      mode: 'dry_run',
    });

    expect(plan.status).toBe('dry_run_ready');
    expect(plan.writesPlanned).toBe(false);
    expect(plan.termsAction).toBe('reissue_and_recapture');
    expect(plan.target).toEqual({
      legalEntityId: 'le-de',
      legalTenantId: 'tenant-home',
      governingLawSnapshot: 'DE',
      termsVersionAccepted: 'terms-2026-07',
    });
  });

  it('requires human approval or explicit waiver before apply writes are planned', () => {
    const blocked = buildMemberEntityMigrationPlan({
      candidate: readinessCandidate(),
      mode: 'apply',
    });
    const approved = buildMemberEntityMigrationPlan({
      approval,
      candidate: readinessCandidate(),
      mode: 'apply',
    });

    expect(blocked.status).toBe('blocked_approval_required');
    expect(blocked.writesPlanned).toBe(false);
    expect(approved.status).toBe('ready');
    expect(approved.writesPlanned).toBe(true);
  });

  it('keeps missing subscription ids out of write-planned ready states', () => {
    const plan = buildMemberEntityMigrationPlan({
      approval,
      candidate: readinessCandidate({ subscriptionId: null }),
      mode: 'apply',
    });

    expect(plan.status).toBe('blocked_repair_required');
    expect(plan.subscriptionId).toBe('missing');
    expect(plan.writesPlanned).toBe(false);
  });

  it('carries supported residence options through dry-run and apply planning', () => {
    const candidate = readinessCandidate({
      residenceCountry: 'RS',
      targetLegalEntity: {
        id: 'le-rs',
        tenantId: 'tenant-home',
        countryCode: 'RS',
        governingLaw: 'RS',
        termsVersion: 'terms-2026-07',
        isActive: true,
      },
      defaultBookingLink: {
        id: 'booking-link-rs',
        tenantId: 'tenant-home',
        defaultBookingTenantId: 'tenant-home',
        legalEntityId: 'le-rs',
      },
    });
    const readinessOptions = { supportedResidenceCountries: ['DE'] };

    const dryRun = buildMemberEntityMigrationPlan({
      candidate,
      mode: 'dry_run',
      readinessOptions,
    });
    const apply = buildMemberEntityMigrationPlan({
      approval,
      candidate,
      mode: 'apply',
      readinessOptions,
    });

    expect(dryRun.status).toBe('blocked_repair_required');
    expect(apply.status).toBe('blocked_repair_required');
    expect(dryRun.dataRepairCategories).toContain('unsupported_jurisdiction');
    expect(apply.dataRepairCategories).toContain('unsupported_jurisdiction');
    expect(dryRun.writesPlanned).toBe(false);
    expect(apply.writesPlanned).toBe(false);
  });

  it('distinguishes malformed approvals from missing approvals', () => {
    const plan = buildMemberEntityMigrationPlan({
      approval: { ...approval, reference: '   ' },
      candidate: readinessCandidate(),
      mode: 'apply',
    });

    expect(plan.status).toBe('blocked_invalid_approval');
    expect(plan.writesPlanned).toBe(false);
  });

  it('blocks active recovery cases and returns repair categories without writes', () => {
    const plan = buildMemberEntityMigrationPlan({
      approval,
      candidate: readinessCandidate({
        activeRecoveryCases: [{ claimId: 'claim-1', recoveryLifecycleState: 'court' }],
      }),
      mode: 'apply',
    });

    expect(plan.status).toBe('blocked_active_recovery_runoff');
    expect(plan.writesPlanned).toBe(false);
    expect(plan.dataRepairCategories).toContain('active_recovery_runoff_required');
  });

  it('blocks incomplete legal, booking, terms, and residence evidence for repair', () => {
    const plan = buildMemberEntityMigrationPlan({
      approval,
      candidate: readinessCandidate({
        defaultBookingLink: null,
        residenceCountry: null,
        targetLegalEntity: null,
        termsVersionAccepted: null,
      }),
      mode: 'apply',
    });

    expect(plan.status).toBe('blocked_repair_required');
    expect(plan.writesPlanned).toBe(false);
    expect(plan.dataRepairCategories).toEqual(
      expect.arrayContaining([
        'missing_residence_country',
        'missing_target_legal_entity',
        'missing_default_booking_link',
        'missing_terms_version_accepted',
      ])
    );
  });
});
