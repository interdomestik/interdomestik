import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ load: vi.fn(), card: vi.fn() }));
vi.mock('@/app/[locale]/admin/users/[id]/_core', () => ({ getAdminUserProfileCore: h.load }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/membership-info-card', () => ({
  MembershipInfoCard: h.card,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/admin-user-roles-panel', () => ({
  AdminUserRolesPanel: () => null,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/agent-info-card', () => ({
  AgentInfoCard: () => null,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/preferences-card', () => ({
  PreferencesCard: () => null,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/claims-stats-card', () => ({
  ClaimsStatsCard: () => null,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/recent-claims-card', () => ({
  RecentClaimsCard: () => null,
}));
vi.mock('@/app/[locale]/admin/users/[id]/_components/user-profile-header', () => ({
  UserProfileHeader: () => null,
}));

import { AdminUserDetailV2Page } from './AdminUserDetailV2Page';

const start = new Date('2026-01-01');
const end = new Date('2027-01-01');
const row = {
  provider: 'paddle',
  status: 'canceled',
  planId: 'individual-plan',
  currentPeriodStart: start,
  currentPeriodEnd: end,
  cancelAtPeriodEnd: false,
};
const sponsor = {
  source: 'sponsor',
  planId: 'sponsor-plan',
  windowStart: start,
  windowEnd: end,
  coverageEnd: new Date('2028-01-01'),
  lifecycle: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
};
const loadPage = () =>
  AdminUserDetailV2Page({
    id: 'member-1',
    locale: 'en',
    searchParams: {},
    authority: mintTestTenantAuthority('tenant-1'),
    actorRole: 'tenant_admin',
    actorBranchId: null,
    tenantClassificationOptions: [],
  });

describe('admin membership projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.card.mockImplementation(() => <div>membership-card</div>);
  });

  it.each([
    {
      membership: sponsor,
      subscription: row,
      status: 'active',
      planId: 'sponsor-plan',
      providerStatus: 'canceled',
    },
    {
      membership: sponsor,
      subscription: null,
      status: 'active',
      planId: 'sponsor-plan',
      providerStatus: null,
    },
    {
      membership: { source: 'subscription', subscription: row },
      subscription: row,
      status: 'canceled',
      planId: 'individual-plan',
      providerStatus: null,
    },
    {
      membership: { source: 'none' },
      subscription: { ...row, provider: 'group_sponsor' },
      status: 'none',
      planId: null,
      providerStatus: null,
    },
  ])(
    'shows $membership.source independently of a provider cache',
    async ({ membership, subscription, status, planId, providerStatus }) => {
      h.load.mockResolvedValue({
        kind: 'ok',
        member: { id: 'member-1', role: 'member', memberNumber: 'M-1' },
        membership,
        subscription,
        membershipStatus: status,
        counts: {},
        recentClaims: [],
        preferences: null,
      });
      render(await loadPage());
      expect(screen.getByText('membership-card')).toBeInTheDocument();
      const props = h.card.mock.calls[0]?.[0];
      expect(props).toMatchObject({
        membershipSource: membership.source,
        membershipStatus: status,
        isMembershipProfile: true,
        providerStatus,
      });
      if (planId) {
        expect(props.subscription).toMatchObject({
          planId,
          currentPeriodStart: start,
          currentPeriodEnd: end,
        });
      } else {
        expect(props.subscription).toBeNull();
      }
      expect(props.coverageEnd).toEqual(
        membership.source === 'sponsor' ? sponsor.coverageEnd : null
      );
    }
  );

  it('preserves the not-found outcome before rendering any membership', async () => {
    h.load.mockResolvedValue({ kind: 'not_found' });
    await expect(loadPage()).rejects.toThrow('notFound');
    expect(h.card).not.toHaveBeenCalled();
  });
});
