import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findTenantFirst: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  eq: hoisted.eq,
  tenants: {
    id: 'tenants.id',
  },
  db: {
    query: {
      tenants: {
        findFirst: hoisted.findTenantFirst,
      },
    },
  },
}));

import { getSubscriptionEntityDisclosureCore } from './entity-disclosure.core';

describe('entity disclosure core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findTenantFirst.mockResolvedValue(null);
  });

  it('uses legal tenant company and subscription governing-law snapshot', async () => {
    hoisted.findTenantFirst.mockResolvedValue({
      legalName: 'Interdomestik KS LLC',
      governingLaw: 'MK',
    });

    await expect(
      getSubscriptionEntityDisclosureCore({
        tenantId: 'tenant_ks',
        legalTenantId: 'tenant_legal',
        governingLawSnapshot: 'XK',
      })
    ).resolves.toEqual({
      contractingCompany: 'Interdomestik KS LLC',
      governingLaw: 'XK',
      unavailable: false,
      source: 'subscription',
    });
  });

  it('returns a bounded unavailable model when legal data is missing', async () => {
    await expect(
      getSubscriptionEntityDisclosureCore({
        tenantId: 'tenant_ks',
        legalTenantId: null,
        governingLawSnapshot: null,
      })
    ).resolves.toMatchObject({
      contractingCompany: null,
      governingLaw: null,
      unavailable: true,
    });
  });
});
