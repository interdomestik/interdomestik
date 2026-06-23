import { describe, expect, it, vi } from 'vitest';

import { readinessCandidate } from '../entity-migration-readiness/test-support';
import { executeMemberEntityMigration } from './executor';

import type { MemberEntityMigrationWritePort } from './types';

const approval = {
  approvedBy: 'ops-lead',
  kind: 'explicit_waiver' as const,
  reference: 'waiver:T-506:batch-1',
};

function writePort(): MemberEntityMigrationWritePort {
  return {
    withTransaction: vi.fn(async operation => operation()),
    updateSubscriptionLegalEntity: vi.fn(async () => undefined),
    recordTermsAcceptance: vi.fn(async () => undefined),
    appendMigrationHistory: vi.fn(async () => undefined),
    appendEntityMigratedEvent: vi.fn(async () => undefined),
  };
}

describe('member entity migration executor', () => {
  it('reports dry-run readiness without calling write ports', async () => {
    const port = writePort();
    const result = await executeMemberEntityMigration(
      { candidate: readinessCandidate(), mode: 'dry_run' },
      port
    );

    expect(result).toMatchObject({
      ok: true,
      eventPayload: null,
      plan: { status: 'dry_run_ready', writesPlanned: false },
    });
    expect(port.updateSubscriptionLegalEntity).not.toHaveBeenCalled();
    expect(port.appendEntityMigratedEvent).not.toHaveBeenCalled();
  });

  it('applies eligible migrations with terms recapture, history, and event payload', async () => {
    const port = writePort();
    const result = await executeMemberEntityMigration(
      { approval, candidate: readinessCandidate(), mode: 'apply' },
      port
    );

    expect(result.ok).toBe(true);
    expect(port.withTransaction).toHaveBeenCalledOnce();
    expect(port.updateSubscriptionLegalEntity).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      tenantId: 'tenant-home',
      target: {
        legalEntityId: 'le-de',
        legalTenantId: 'tenant-home',
        governingLawSnapshot: 'DE',
        termsVersionAccepted: 'terms-2026-07',
      },
    });
    expect(port.recordTermsAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({ termsVersion: 'terms-2026-07', approval })
    );
    expect(port.appendMigrationHistory).toHaveBeenCalledWith(
      expect.objectContaining({ termsAction: 'reissue_and_recapture', approval })
    );
    expect(port.appendEntityMigratedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          approvalKind: 'explicit_waiver',
          migrationMode: 'apply',
          toLegalEntityId: 'le-de',
        }),
      })
    );
  });

  it('does not write when active recovery guard blocks the migration', async () => {
    const port = writePort();
    const result = await executeMemberEntityMigration(
      {
        approval,
        candidate: readinessCandidate({
          activeRecoveryCases: [{ claimId: 'claim-1', recoveryLifecycleState: 'negotiation' }],
        }),
        mode: 'apply',
      },
      port
    );

    expect(result).toMatchObject({ ok: false, reason: 'blocked_active_recovery_runoff' });
    expect(port.withTransaction).not.toHaveBeenCalled();
    expect(port.updateSubscriptionLegalEntity).not.toHaveBeenCalled();
    expect(port.recordTermsAcceptance).not.toHaveBeenCalled();
    expect(port.appendMigrationHistory).not.toHaveBeenCalled();
    expect(port.appendEntityMigratedEvent).not.toHaveBeenCalled();
  });

  it('does not write apply commands when readiness options block the jurisdiction', async () => {
    const port = writePort();
    const result = await executeMemberEntityMigration(
      {
        approval,
        candidate: readinessCandidate({
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
        }),
        mode: 'apply',
        readinessOptions: { supportedResidenceCountries: ['DE'] },
      },
      port
    );

    expect(result).toMatchObject({ ok: false, reason: 'blocked_repair_required' });
    expect(result.plan.dataRepairCategories).toContain('unsupported_jurisdiction');
    expect(port.withTransaction).not.toHaveBeenCalled();
    expect(port.updateSubscriptionLegalEntity).not.toHaveBeenCalled();
    expect(port.recordTermsAcceptance).not.toHaveBeenCalled();
    expect(port.appendMigrationHistory).not.toHaveBeenCalled();
    expect(port.appendEntityMigratedEvent).not.toHaveBeenCalled();
  });
});
