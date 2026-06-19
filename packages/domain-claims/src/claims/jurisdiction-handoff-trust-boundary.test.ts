import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getHandoffMocks, resetHandoffMocks } from './jurisdiction-handoff-test-mocks';
import { recordJurisdictionHandoffInTransaction } from './jurisdiction-handoff';
import { baseParams, tx } from './jurisdiction-handoff-test-fixtures';

const handoffMocks = getHandoffMocks();

describe('jurisdiction handoff grant actor trust boundary', () => {
  beforeEach(() => {
    resetHandoffMocks();
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
    expect(handoffMocks.insertHandoffGrant).not.toHaveBeenCalled();
    expect(handoffMocks.appendEvent).not.toHaveBeenCalled();
  });
});
