import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { updateClaimStatus } from './admin-claims';

const authority = mintTestTenantAuthority('tenant-1');

vi.mock('./admin-claims/context', () => ({
  getActionContext: vi.fn(async () => ({
    session: { user: { id: 'admin-1', role: 'admin' } },
    authority,
    requestHeaders: new Headers(),
  })),
}));

vi.mock('./admin-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn(async () => undefined),
}));

describe('admin-claims action wrapper', () => {
  it('delegates updateClaimStatus to core', async () => {
    const { getActionContext } = await import('./admin-claims/context');
    const { updateClaimStatusCore } = await import('./admin-claims/update-status');

    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'resolved');
    formData.set('locale', 'en');

    await updateClaimStatus(formData);

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateClaimStatusCore).toHaveBeenCalledWith({
      formData,
      session: { user: { id: 'admin-1', role: 'admin' } },
      authority,
      requestHeaders: expect.any(Headers),
    });
  });
});
