import { describe, expect, it, vi } from 'vitest';

import { updateClaimStatus } from './agent-claims';

vi.mock('./agent-claims/context', async () => {
  const { mintTestTenantAuthority } =
    await import('@interdomestik/database/testing/tenant-authority');
  const authority = mintTestTenantAuthority('tenant-1');
  return {
    getActionContext: vi.fn(async () => ({
      session: { user: { id: 'staff-1', role: 'staff' } },
      authority,
      requestHeaders: new Headers(),
    })),
  };
});

vi.mock('./agent-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn(async () => undefined),
}));

describe('agent-claims action wrapper', () => {
  it('delegates updateClaimStatus to core', async () => {
    const { getActionContext } = await import('./agent-claims/context');
    const { updateClaimStatusCore } = await import('./agent-claims/update-status');
    const { authority } = await getActionContext();
    vi.mocked(getActionContext).mockClear();

    await updateClaimStatus('claim-1', 'resolved');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateClaimStatusCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      newStatus: 'resolved',
      session: { user: { id: 'staff-1', role: 'staff' } },
      authority,
      requestHeaders: expect.any(Headers),
    });
  });
});
