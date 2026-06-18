import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminSession, getUpdateStatusMocks } from './update-status.test-support';

import { updateClaimStatusCore } from './update-status';

const mocks = getUpdateStatusMocks();

describe('admin updateClaimStatusCore payment authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimWhere.mockResolvedValue([
      {
        id: 'claim-1',
        title: 'Claim',
        status: 'evaluation',
        userId: 'member-1',
        userEmail: 'member@example.com',
      },
    ]);
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'evaluation',
      lifecycleVersion: 2,
      status: 'negotiation',
    });
  });

  it('routes payment-gated admin transitions through the central transition command', async () => {
    await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: adminSession,
      requestHeaders: new Headers(),
    });

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.agreementLimit).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'admin-1', role: 'tenant_admin' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'negotiation',
    });
  });
});
