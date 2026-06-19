import { beforeEach, describe, expect, it } from 'vitest';

import { getHandoffMocks, resetHandoffMocks } from './jurisdiction-handoff-test-mocks';
import {
  recordJurisdictionHandoff,
  recordJurisdictionHandoffInTransaction,
} from './jurisdiction-handoff';
import {
  baseParams,
  preGrantCases,
  preWriteCases,
  rollbackCases,
  tx,
} from './jurisdiction-handoff-test-fixtures';

const handoffMocks = getHandoffMocks();

describe('recordJurisdictionHandoffInTransaction', () => {
  beforeEach(() => {
    resetHandoffMocks({ tenantContext: true });
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
    expect(handoffMocks.lockHandoffClaim).toHaveBeenCalledWith(tx, 'tenant_ks', 'claim-1');
    expect(handoffMocks.setRecoveryLegalTenantIfUnset).toHaveBeenCalledWith(
      expect.objectContaining({ homeTenantId: 'tenant_ks', recoveryLegalTenantId: 'tenant_mk' })
    );
    expect(handoffMocks.insertHandoffGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'local-legal-1',
        caseId: 'claim-1',
        correlationId: 'claim:claim-1:jurisdiction-handoff:tenant_mk:local-legal-1',
        recoveryLegalTenantId: 'tenant_mk',
      })
    );
    expect(baseParams.grantActorResolver).toHaveBeenCalledWith({
      actorId: 'local-legal-1',
      recoveryTenantId: 'tenant_mk',
      tx,
    });
    expect(handoffMocks.appendEvent).toHaveBeenCalledWith(
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
    expect(handoffMocks.insertHandoffGrant).not.toHaveBeenCalled();
  });

  it.each(preWriteCases)('returns %s before writing', async (error, claim, params) => {
    handoffMocks.loadHandoffClaim.mockResolvedValueOnce(claim);

    await expect(recordJurisdictionHandoffInTransaction(tx, params)).resolves.toEqual({
      success: false,
      error,
    });
    expect(handoffMocks.setRecoveryLegalTenantIfUnset).not.toHaveBeenCalled();
    expect(handoffMocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(handoffMocks.appendEvent).not.toHaveBeenCalled();
  });

  it.each(preGrantCases)('returns %s before grant insert', async (error, params) => {
    const request =
      error === 'self_grant_denied' ? { ...params, grantActorId: params.actor.id } : params;

    await expect(recordJurisdictionHandoffInTransaction(tx, request)).resolves.toEqual({
      success: false,
      error,
    });
    expect(handoffMocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(handoffMocks.setRecoveryLegalTenantIfUnset).not.toHaveBeenCalled();
  });

  it('returns a typed conflict when the guarded tenant update loses a race', async () => {
    handoffMocks.setRecoveryLegalTenantIfUnset.mockResolvedValueOnce(false);

    await expect(recordJurisdictionHandoffInTransaction(tx, baseParams)).resolves.toEqual({
      error: 'recovery_legal_tenant_conflict',
      success: false,
    });
    expect(handoffMocks.insertHandoffGrant).not.toHaveBeenCalled();
  });

  it('treats deterministic retry as already_exists without appending a duplicate event', async () => {
    handoffMocks.insertHandoffGrant.mockResolvedValueOnce('already_exists');

    await expect(recordJurisdictionHandoffInTransaction(tx, baseParams)).resolves.toEqual(
      expect.objectContaining({ success: true, status: 'already_exists' })
    );
    expect(handoffMocks.appendEvent).not.toHaveBeenCalled();
  });

  it.each(rollbackCases)('rolls back and classifies %s', async (storeStatus, error) => {
    handoffMocks.insertHandoffGrant.mockResolvedValueOnce(storeStatus);

    await expect(
      recordJurisdictionHandoff({ ...baseParams, correlationId: 'operator-supplied-id' })
    ).resolves.toEqual({ success: false, error });
    expect(handoffMocks.withTenantContext.mock.calls[0]?.[0]).toEqual({ tenantId: 'tenant_ks' });
    expect(handoffMocks.appendEvent).not.toHaveBeenCalled();
  });
});
