import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';
const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));
  const isNull = vi.fn((field: unknown) => ({ op: 'isNull', field }));
  const disclosure = {
    contractingCompany: 'Interdomestik KS LLC',
    governingLaw: 'XK',
    unavailable: false,
    source: 'subscription' as const,
  };
  return {
    authorize: vi.fn(),
    resolve: vi.fn(),
    leavable: vi.fn(),
    findPlan: vi.fn(),
    sponsorDisclosure: vi.fn().mockResolvedValue({ ...disclosure, source: 'sponsor' }),
    and,
    eq,
    findSubscriptionMany: vi.fn(),
    findDocumentsMany: vi.fn(),
    getSubscriptionEntityDisclosureCore: vi.fn().mockResolvedValue(disclosure),
    isNull,
  };
});
vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  isNull: hoisted.isNull,
  membershipPlans: { tenantId: 'plans.tenant_id', id: 'plans.id' },
  subscriptions: {
    userId: 'subscriptions.user_id',
    tenantId: 'subscriptions.tenant_id',
  },
  withTenantContext: vi.fn((_context: unknown, callback: (tx: unknown) => unknown) =>
    callback({
      query: {
        subscriptions: {
          findMany: hoisted.findSubscriptionMany,
        },
        documents: {
          findMany: hoisted.findDocumentsMany,
        },
      },
    })
  ),
}));
vi.mock('@/lib/entity-disclosure.core', () => ({
  getSubscriptionEntityDisclosureCore: hoisted.getSubscriptionEntityDisclosureCore,
  getSponsorEntityDisclosureCore: hoisted.sponsorDisclosure,
}));

export function getMembershipCoreMocks(): typeof hoisted {
  return hoisted;
}

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionUserTenant: hoisted.authorize,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  resolveEffectiveMembership: hoisted.resolve,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/opt-out', () => ({
  listLeavableSponsorEntries: hoisted.leavable,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn((_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback({
      query: {
        subscriptions: { findMany: hoisted.findSubscriptionMany },
        documents: { findMany: hoisted.findDocumentsMany },
        membershipPlans: { findFirst: hoisted.findPlan },
      },
    })
  ),
}));
hoisted.authorize.mockResolvedValue(mintTestTenantAuthority('tenant-ks'));
hoisted.resolve.mockResolvedValue(new Map());
hoisted.leavable.mockResolvedValue([]);
