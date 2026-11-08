import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ counts: vi.fn(), where: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => Promise<unknown>) =>
    callback({ select: () => ({ from: () => ({ where: mocks.where }) }) }),
}));
vi.mock('@interdomestik/domain-membership-billing', () => ({
  getTenantMembershipLifecycleCounts: mocks.counts,
}));

import { fetchKpis } from './fetchKpis';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.where.mockResolvedValue([{ count: 7 }]);
});

describe('fetchKpis effective membership reporting', () => {
  it.each([
    ['sponsored member with a canceled Paddle row', 1, 1, 0],
    ['Paddle member', 1, 0, 1],
    ['uncovered group_sponsor row', 0, 0, 1],
  ])('uses coverage-set accessActive for %s', async (_label, accessActive, sponsored, active) => {
    const authority = mintTestTenantAuthority('tenant-a');
    mocks.counts.mockResolvedValue({ accessActive, sponsored, active, total: 50 });
    expect(await fetchKpis(authority)).toEqual({
      members: accessActive,
      branches: 7,
      agents: 7,
      claimsOpen: 7,
      cashPending: 7,
      slaBreaches: 7,
    });
    expect(mocks.counts).toHaveBeenCalledExactlyOnceWith({ authority });
  });
});
