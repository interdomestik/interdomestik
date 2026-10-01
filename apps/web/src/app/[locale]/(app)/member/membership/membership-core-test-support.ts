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
    and,
    eq,
    findSubscriptionMany: vi.fn(),
    findDocumentsMany: vi.fn(),
    getSubscriptionEntityDisclosureCore: vi.fn(async () => disclosure),
    isNull,
  };
});
vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  isNull: hoisted.isNull,
  subscriptions: {
    userId: 'subscriptions.user_id',
    tenantId: 'subscriptions.tenant_id',
  },
  withTenantContext: vi.fn(async (_context: unknown, callback: (tx: unknown) => unknown) =>
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
}));

export function getMembershipCoreMocks() {
  return hoisted;
}
