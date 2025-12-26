import { describe, expect, it, vi } from 'vitest';

import { assignClaim, updateClaimStatus } from './agent-claims';

vi.mock('./agent-claims/context', () => ({
  getActionContext: vi.fn(async () => ({
    session: { user: { id: 'staff-1', role: 'staff' } },
    requestHeaders: new Headers(),
  })),
}));

vi.mock('./agent-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn(async () => undefined),
}));

vi.mock('./agent-claims/assign', () => ({
  assignClaimCore: vi.fn(async () => undefined),
}));

describe('agent-claims action wrapper', () => {
  it('delegates updateClaimStatus to core', async () => {
    const { getActionContext } = await import('./agent-claims/context');
    const { updateClaimStatusCore } = await import('./agent-claims/update-status');

    await updateClaimStatus('claim-1', 'resolved');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateClaimStatusCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      newStatus: 'resolved',
      session: { user: { id: 'staff-1', role: 'staff' } },
      requestHeaders: expect.any(Headers),
    });
  });

  it('delegates assignClaim to core', async () => {
    const { getActionContext } = await import('./agent-claims/context');
    const { assignClaimCore } = await import('./agent-claims/assign');

    await assignClaim('claim-1', 'staff-2');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(assignClaimCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      agentId: 'staff-2',
      session: { user: { id: 'staff-1', role: 'staff' } },
      requestHeaders: expect.any(Headers),
    });
  });
});
