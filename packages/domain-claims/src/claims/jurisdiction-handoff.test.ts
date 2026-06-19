import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  insertHandoffGrant: vi.fn(),
  isGrantActorInRecoveryTenant: vi.fn(),
  loadHandoffClaim: vi.fn(),
  lockHandoffClaim: vi.fn(),
  setRecoveryLegalTenantIfUnset: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  appendEvent: mocks.appendEvent,
  withTenantContext: mocks.withTenantContext,
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
import {
  baseClaim,
  baseParams,
  preGrantCases,
  preWriteCases,
  rollbackCases,
  tx,
} from './jurisdiction-handoff-test-fixtures';

describe('recordJurisdictionHandoffInTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHandoffClaim.mockResolvedValue(baseClaim);
    mocks.isGrantActorInRecoveryTenant.mockResolvedValue(true);
    mocks.setRecoveryLegalTenantIfUnset.mockResolvedValue(true);
    mocks.insertHandoffGrant.mockResolvedValue('inserted');
    mocks.appendEvent.mockResolvedValue(undefined);
    mocks.withTenantContext.mockImplementation(
      (_context: unknown, callback: (innerTx: typeof tx) => unknown) => callback(tx)
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

  it.each(preWriteCases)('returns %s before writing', async (error, claim, params) => {
    mocks.loadHandoffClaim.mockResolvedValueOnce(claim);

    await expect(recordJurisdictionHandoffInTransaction(tx, params)).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });

  it.each(preGrantCases)('returns %s before grant insert', async (error, params, actorInTenant) => {
    if (actorInTenant === false) mocks.isGrantActorInRecoveryTenant.mockResolvedValueOnce(false);
    const request =
      error === 'self_grant_denied' ? { ...params, grantActorId: params.actor.id } : params;

    await expect(recordJurisdictionHandoffInTransaction(tx, request)).resolves.toEqual({
      success: false,
      error,
    });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(mocks.setRecoveryLegalTenantIfUnset).not.toHaveBeenCalled();
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

  it.each(rollbackCases)('rolls back and classifies %s', async (storeStatus, error) => {
    mocks.insertHandoffGrant.mockResolvedValueOnce(storeStatus);

    await expect(
      recordJurisdictionHandoff({ ...baseParams, correlationId: 'operator-supplied-id' })
    ).resolves.toEqual({ success: false, error });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks' },
      expect.any(Function)
    );
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
});
