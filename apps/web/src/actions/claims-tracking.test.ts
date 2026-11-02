import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  createPublicTrackingLinkCore: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenant,
}));
vi.mock('@/features/claims/tracking/server/createPublicTrackingLink', () => ({
  createPublicTrackingLink: hoisted.createPublicTrackingLinkCore,
}));

import { createPublicTrackingLink } from './claims-tracking';

describe('createPublicTrackingLink action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the link under the session tenant authority', async () => {
    const authority = mintTestTenantAuthority('tenant-ks');
    hoisted.authorizeSessionTenant.mockResolvedValue({
      session: {
        user: { id: 'staff-1', role: 'staff', branchId: 'branch-1', tenantId: 'tenant-ks' },
      },
      authority,
    });
    hoisted.createPublicTrackingLinkCore.mockResolvedValue({ url: 'https://x/track/t' });

    await createPublicTrackingLink('claim-1');

    expect(hoisted.createPublicTrackingLinkCore).toHaveBeenCalledWith('claim-1', {
      authority,
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: 'branch-1',
    });
  });

  it('rejects an unauthenticated request without creating a link', async () => {
    hoisted.authorizeSessionTenant.mockResolvedValue(null);

    await expect(createPublicTrackingLink('claim-1')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(hoisted.createPublicTrackingLinkCore).not.toHaveBeenCalled();
  });
});
