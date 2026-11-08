import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findTenantFirst: vi.fn(),
  findEntity: vi.fn(),
}));

vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLegalMetadata: hoisted.findTenantFirst,
}));

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => args,
  eq: hoisted.eq,
  legalEntities: { id: 'entity.id', tenantId: 'entity.tenantId' },
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback({
      query: { legalEntities: { findFirst: hoisted.findEntity } },
    }),
}));

import {
  getSubscriptionEntityDisclosureCore,
  getSponsorEntityDisclosureCore,
} from './entity-disclosure.core';

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
    expect(hoisted.findTenantFirst).toHaveBeenCalledWith('tenant_legal');
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
  it('discloses the covering term legal entity within the session tenant', async () => {
    hoisted.findEntity.mockResolvedValue({ legalName: 'Covering company', governingLaw: 'XK' });
    expect(
      await getSponsorEntityDisclosureCore(mintTestTenantAuthority('tenant_ks'), 'legal_covering')
    ).toEqual({
      contractingCompany: 'Covering company',
      governingLaw: 'XK',
      source: 'sponsor',
      unavailable: false,
    });
    expect(hoisted.findEntity).toHaveBeenCalledWith({
      where: [
        { op: 'eq', left: 'entity.tenantId', right: 'tenant_ks' },
        { op: 'eq', left: 'entity.id', right: 'legal_covering' },
      ],
    });
    expect(hoisted.findTenantFirst).not.toHaveBeenCalled();
  });
  it('does not fall back to the Paddle controller when the covering entity is missing', async () => {
    hoisted.findEntity.mockResolvedValue(null);
    expect(
      await getSponsorEntityDisclosureCore(mintTestTenantAuthority('tenant_ks'), 'missing')
    ).toMatchObject({
      source: 'sponsor',
      unavailable: true,
      contractingCompany: null,
    });
  });
});
