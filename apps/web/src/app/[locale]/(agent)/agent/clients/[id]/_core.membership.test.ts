import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  member: vi.fn(),
  resolve: vi.fn(),
  assignment: vi.fn(),
  tenant: vi.fn(),
  select: vi.fn(),
  claims: vi.fn(),
}));
vi.mock('@interdomestik/database', async original => ({
  ...(await original<typeof import('@interdomestik/database')>()),
  withTenantContext: h.tenant,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  resolveEffectiveMembership: h.resolve,
}));
vi.mock('@interdomestik/domain-agent', () => ({ getAgentMemberDetail: h.assignment }));
vi.mock('./_claim-summary', () => ({ getAgentClientClaimSummary: h.claims }));
import { getAgentClientProfileCore } from './_core';

const authority = mintTestTenantAuthority('tenant-1');
const tx = {
  query: {
    user: { findFirst: h.member },
    userNotificationPreferences: { findFirst: vi.fn().mockResolvedValue(null) },
    memberActivities: { findMany: vi.fn().mockResolvedValue([]) },
  },
  select: () => ({ from: () => ({ where: () => ({ limit: h.select }) }) }),
};
const start = new Date('2026-01-01');
const end = new Date('2027-01-01');
const sponsor = {
  source: 'sponsor',
  planId: 'sponsor-plan',
  windowStart: start,
  windowEnd: end,
  coverageEnd: new Date('2028-01-01'),
  lifecycle: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
};
const subscription = {
  provider: 'paddle',
  status: 'past_due',
  planId: 'individual-plan',
  currentPeriodStart: start,
  currentPeriodEnd: end,
  cancelAtPeriodEnd: true,
};
const load = () =>
  getAgentClientProfileCore({
    memberId: 'member-1',
    viewer: { id: 'agent-1', role: 'agent' },
    authority,
  });

describe('agent linked member effective membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.member.mockResolvedValue({ id: 'member-1' });
    h.tenant.mockImplementation(
      (_authority: unknown, action: (value: typeof tx) => Promise<unknown>) => action(tx)
    );
    h.select.mockResolvedValue([{ id: 'existing-link' }]);
    h.claims.mockResolvedValue({
      claimCounts: { total: 0, open: 0, resolved: 0, rejected: 0 },
      recentClaims: [],
    });
  });

  it.each([
    [sponsor, 'active', 'sponsor-plan', start, end],
    [{ source: 'subscription', subscription }, 'past_due', 'individual-plan', start, end],
    [{ source: 'none' }, 'none', null, null, null],
  ] as const)(
    'projects resolved membership %j after the existing link check',
    async (membership, status, planId, currentPeriodStart, currentPeriodEnd) => {
      h.resolve.mockResolvedValue(new Map([['member-1', membership]]));
      const result = await load();
      expect(result).toMatchObject({
        kind: 'ok',
        membership: {
          source: membership.source,
          status,
          planId,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });
      expect(h.assignment).not.toHaveBeenCalled();
      expect(h.resolve).toHaveBeenCalledWith(tx, 'tenant-1', ['member-1'], expect.any(Date));
      expect(h.select.mock.invocationCallOrder[0]).toBeLessThan(
        h.resolve.mock.invocationCallOrder[0]
      );
      expect(h.tenant.mock.calls.every(([value]) => value === authority)).toBe(true);
    }
  );

  it('cannot use sponsorship to bypass the link and assignment refusal', async () => {
    h.select.mockResolvedValue([]);
    h.assignment.mockResolvedValue(null);
    h.resolve.mockResolvedValue(new Map([['member-1', sponsor]]));
    expect(await load()).toEqual({ kind: 'forbidden' });
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.claims).not.toHaveBeenCalled();
  });
});
