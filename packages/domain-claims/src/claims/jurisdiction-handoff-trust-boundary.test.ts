import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  insertHandoffGrant: vi.fn(),
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
  loadHandoffClaim: mocks.loadHandoffClaim,
  lockHandoffClaim: mocks.lockHandoffClaim,
  setRecoveryLegalTenantIfUnset: mocks.setRecoveryLegalTenantIfUnset,
}));

import { recordJurisdictionHandoffInTransaction } from './jurisdiction-handoff';
import { baseClaim, baseParams, tx } from './jurisdiction-handoff-test-fixtures';

describe('jurisdiction handoff grant actor trust boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHandoffClaim.mockResolvedValue(baseClaim);
    mocks.setRecoveryLegalTenantIfUnset.mockResolvedValue(true);
    mocks.insertHandoffGrant.mockResolvedValue('inserted');
    mocks.appendEvent.mockResolvedValue(undefined);
  });

  it('does not trust forged grant actor tenant or role fields', async () => {
    const resolver = vi.fn(async () => ({ role: 'member', tenantId: 'tenant_ks' }));
    const request = {
      ...baseParams,
      grantActorResolver: resolver,
      grantActorRole: 'staff',
      grantActorTenantId: 'tenant_mk',
    } as typeof baseParams;

    await expect(recordJurisdictionHandoffInTransaction(tx, request)).resolves.toEqual({
      success: false,
      error: 'grant_actor_not_recovery_tenant',
    });
    expect(resolver).toHaveBeenCalledWith({
      actorId: 'local-legal-1',
      recoveryTenantId: 'tenant_mk',
      tx,
    });
    expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(mocks.appendEvent).not.toHaveBeenCalled();
  });
});
