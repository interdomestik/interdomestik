import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  dbTransaction: vi.fn(),
  insertHandoffGrant: vi.fn(),
  isGrantActorInRecoveryTenant: vi.fn(),
  loadHandoffClaim: vi.fn(),
  lockHandoffClaim: vi.fn(),
  setRecoveryLegalTenantIfUnset: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  appendEvent: mocks.appendEvent,
  db: { transaction: mocks.dbTransaction },
}));

vi.mock('./jurisdiction-handoff-store', () => ({
  insertHandoffGrant: mocks.insertHandoffGrant,
  isGrantActorInRecoveryTenant: mocks.isGrantActorInRecoveryTenant,
  loadHandoffClaim: mocks.loadHandoffClaim,
  lockHandoffClaim: mocks.lockHandoffClaim,
  setRecoveryLegalTenantIfUnset: mocks.setRecoveryLegalTenantIfUnset,
}));

import {
  recordJurisdictionHandoff,
  recordJurisdictionHandoffInTransaction,
} from './jurisdiction-handoff';

const tx = {} as never;
const baseClaim = {
  branchId: 'branch-a',
  incidentCountryCode: 'MK',
  lifecycleVersion: 7,
  recoveryLegalTenantId: null,
  staffId: 'staff-1',
};
const baseParams = {
  actor: { branchId: 'branch-a', id: 'staff-1', role: 'staff' },
  claimId: 'claim-1',
  grantActorId: 'local-legal-1',
  homeTenantId: 'tenant_ks',
  now: new Date('2026-06-19T10:00:00Z'),
};

describe('recordJurisdictionHandoffInTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHandoffClaim.mockResolvedValue(baseClaim);
    mocks.isGrantActorInRecoveryTenant.mockResolvedValue(true);
    mocks.setRecoveryLegalTenantIfUnset.mockResolvedValue(true);
    mocks.insertHandoffGrant.mockResolvedValue('inserted');
    mocks.appendEvent.mockResolvedValue(undefined);
    mocks.dbTransaction.mockImplementation((callback: (innerTx: typeof tx) => unknown) =>
      callback(tx)
    );
  });

  it('creates a cross-jurisdiction handoff, grant, and audited event', async () => {
    const result = await recordJurisdictionHandoffInTransaction(tx, baseParams);

    expect(result).toEqual({
      success: true,
      status: 'created',
      grant: expect.objectContaining({
        accessTenantId: 'tenant_mk',
        actorId: 'local-legal-1',
        caseId: 'claim-1',
        documentClasses: ['correspondence', 'contract', 'evidence', 'legal', 'receipt'],
      }),
    });
    expect(mocks.lockHandoffClaim).toHaveBeenCalledWith(tx, 'tenant_ks', 'claim-1');
    expect(mocks.setRecoveryLegalTenantIfUnset).toHaveBeenCalledWith(
      expect.objectContaining({ homeTenantId: 'tenant_ks', recoveryLegalTenantId: 'tenant_mk' })
    );
    expect(mocks.insertHandoffGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'local-legal-1',
        caseId: 'claim-1',
        correlationId: 'claim:claim-1:jurisdiction-handoff:tenant_mk:local-legal-1',
        recoveryLegalTenantId: 'tenant_mk',
      })
    );
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventName: 'recovery.handed_off_to_jurisdiction',
        payload: expect.objectContaining({ grantId: expect.stringMatching(/^csg_/u) }),
        tenantId: 'tenant_ks',
      })
    );
  });

  it('returns not_required for same-jurisdiction incidents', async () => {
    await expect(
      recordJurisdictionHandoffInTransaction(tx, { ...baseParams, homeTenantId: 'tenant_mk' })
    ).resolves.toEqual({ success: true, grant: null, status: 'not_required' });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
  });

  it.each([
    ['unsupported_incident_jurisdiction', { ...baseClaim, incidentCountryCode: 'ZZ' }, baseParams],
    [
      'actor_not_authorized',
      baseClaim,
      { ...baseParams, actor: { id: 'member-1', role: 'member' } },
    ],
    [
      'actor_not_authorized',
      baseClaim,
      { ...baseParams, actor: { branchId: 'branch-b', id: 'manager-1', role: 'branch_manager' } },
    ],
  ])('returns %s before writing', async (error, claim, params) => {
    mocks.loadHandoffClaim.mockResolvedValueOnce(claim);

    await expect(recordJurisdictionHandoffInTransaction(tx, params)).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['self_grant_denied', baseParams, undefined],
    ['grant_actor_not_recovery_tenant', { ...baseParams, grantActorId: 'other-local' }, false],
  ])('returns %s before grant insert', async (error, params, actorInTenant) => {
    if (actorInTenant === false) mocks.isGrantActorInRecoveryTenant.mockResolvedValueOnce(false);
    const request =
      error === 'self_grant_denied' ? { ...params, grantActorId: params.actor.id } : params;

    await expect(recordJurisdictionHandoffInTransaction(tx, request)).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
  });

  it('returns a typed conflict when the guarded tenant update loses a race', async () => {
    mocks.setRecoveryLegalTenantIfUnset.mockResolvedValueOnce(false);

    await expect(recordJurisdictionHandoffInTransaction(tx, baseParams)).resolves.toEqual({
      error: 'recovery_legal_tenant_conflict',
      success: false,
    });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
  });

  it('treats deterministic retry as already_exists without appending a duplicate event', async () => {
    mocks.insertHandoffGrant.mockResolvedValueOnce('already_exists');

    await expect(recordJurisdictionHandoffInTransaction(tx, baseParams)).resolves.toEqual(
      expect.objectContaining({ success: true, status: 'already_exists' })
    );
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['active_grant_conflict', 'handoff_active_grant_conflict'],
    ['correlation_conflict', 'handoff_correlation_conflict'],
    ['revoked_exists', 'handoff_grant_revoked'],
  ])('rolls back and classifies %s', async (storeStatus, error) => {
    mocks.insertHandoffGrant.mockResolvedValueOnce(storeStatus);

    await expect(
      recordJurisdictionHandoff({ ...baseParams, correlationId: 'operator-supplied-id' })
    ).resolves.toEqual({ success: false, error });
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
});
