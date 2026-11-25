import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  createPublicTrackingLinkCore: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock('@interdomestik/database/tenant-authority', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-authority')>();
  return {
    ...actual,
    readTenantAuthority: (authority: Parameters<typeof actual.readTenantAuthority>[0]) => ({
      ...actual.readTenantAuthority(authority),
      purpose: 'session',
    }),
  };
});
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
    const authority = mintTestTenantAuthority('tenant-ks', { userId: 'staff-1', role: 'staff' });
    const otherAuthority = mintTestTenantAuthority('tenant-ks', {
      userId: 'staff-1',
      role: 'staff',
    });
    const session = {
      user: { id: 'staff-1', role: 'staff', branchId: 'branch-1', tenantId: 'tenant-ks' },
    };
    hoisted.authorizeSessionTenant
      .mockResolvedValueOnce({ session, authority })
      .mockResolvedValueOnce({ session, authority: otherAuthority });
    hoisted.createPublicTrackingLinkCore.mockResolvedValue({ url: 'https://x/track/t' });

    await expect(createPublicTrackingLink('claim-1')).resolves.toMatchObject({
      success: true,
      data: { url: 'https://x/track/t' },
    });

    expect(hoisted.authorizeSessionTenant).toHaveBeenCalledTimes(2);
    expect(hoisted.createPublicTrackingLinkCore.mock.calls[0]?.[1].authority).toBe(authority);
    expect(hoisted.createPublicTrackingLinkCore).toHaveBeenCalledWith('claim-1', {
      authority,
      actorUserId: 'staff-1',
      role: 'staff',
      branchId: 'branch-1',
    });
  });

  it('refuses a malformed claim identifier before creating a link', async () => {
    const authority = mintTestTenantAuthority('tenant-ks', { userId: 'staff-1', role: 'staff' });
    hoisted.authorizeSessionTenant.mockResolvedValue({
      session: { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-ks' } },
      authority,
    });
    await expect(createPublicTrackingLink(' ')).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(hoisted.createPublicTrackingLinkCore).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request without creating a link', async () => {
    hoisted.authorizeSessionTenant.mockResolvedValue(null);

    await expect(createPublicTrackingLink('claim-1')).resolves.toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(hoisted.createPublicTrackingLinkCore).not.toHaveBeenCalled();
  });
});
