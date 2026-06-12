import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  disclosure: {
    contractingCompany: 'Interdomestik KS LLC',
    governingLaw: 'XK',
    unavailable: false,
    source: 'subscription' as const,
  },
  getSubscriptionEntityDisclosureCore: vi.fn(),
}));

vi.mock('@/lib/entity-disclosure.core', () => ({
  getSubscriptionEntityDisclosureCore: hoisted.getSubscriptionEntityDisclosureCore,
}));

import { attachMembershipEntityDisclosures } from './_entity-disclosure';

describe('membership entity disclosure attachment', () => {
  it('reuses disclosure reads for subscription rows with the same legal entity snapshot', async () => {
    hoisted.getSubscriptionEntityDisclosureCore.mockResolvedValue(hoisted.disclosure);

    const records = [
      subscriptionRecord('sub-1', 'legal-ks', 'XK'),
      subscriptionRecord('sub-2', 'legal-ks', 'XK'),
    ];

    await expect(attachMembershipEntityDisclosures(records)).resolves.toEqual([
      expect.objectContaining({ id: 'sub-1', entityDisclosure: hoisted.disclosure }),
      expect.objectContaining({ id: 'sub-2', entityDisclosure: hoisted.disclosure }),
    ]);
    expect(hoisted.getSubscriptionEntityDisclosureCore).toHaveBeenCalledTimes(1);
  });
});

function subscriptionRecord(id: string, legalTenantId: string, governingLawSnapshot: string) {
  return {
    id,
    tenantId: 'tenant-ks',
    legalTenantId,
    governingLawSnapshot,
    plan: null,
  } as never;
}
