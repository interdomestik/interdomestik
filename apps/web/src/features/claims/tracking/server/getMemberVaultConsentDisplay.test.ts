import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ op: 'desc', column })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
}));

import { baseParams, tenantChain } from './getMemberVaultConsentDisplay.test-support';

vi.mock('@interdomestik/database', () => ({ db: { select: hoisted.select } }));
vi.mock('@interdomestik/database/schema', () => ({
  tenants: { id: 'tenants.id', code: 'tenants.code', countryCode: 'tenants.countryCode' },
  claimDocuments: {},
  claimDocumentAiExtractionConsents: {},
}));
vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  desc: hoisted.desc,
  eq: hoisted.eq,
  inArray: hoisted.inArray,
}));

import { getMemberVaultConsentDisplay } from './getMemberVaultConsentDisplay';

describe('getMemberVaultConsentDisplay gates', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [[], { kind: 'hidden' }],
    [[{ code: 'KS', countryCode: 'KS' }], { kind: 'hidden' }],
    [[{ code: 'MK', countryCode: 'AL' }], { kind: 'hidden' }],
  ])('fails closed before document reads for tenant row %j', async (tenantRows, expected) => {
    hoisted.select.mockReturnValueOnce(tenantChain(tenantRows));

    await expect(getMemberVaultConsentDisplay(baseParams)).resolves.toEqual(expected);
    expect(hoisted.select).toHaveBeenCalledTimes(1);
  });

  it('stops an ineligible claim before document reads', async () => {
    hoisted.select.mockReturnValueOnce(tenantChain([{ code: 'MK', countryCode: 'MK' }]));

    await expect(
      getMemberVaultConsentDisplay({ ...baseParams, claimCategory: 'injury' })
    ).resolves.toEqual({ kind: 'hidden' });
    expect(hoisted.select).toHaveBeenCalledTimes(1);
  });

  it('returns an item-free erased state before document reads', async () => {
    hoisted.select.mockReturnValueOnce(tenantChain([{ code: 'MK', countryCode: 'MK' }]));

    const result = await getMemberVaultConsentDisplay({
      ...baseParams,
      piiStatus: 'erased_or_unavailable',
    });
    expect(result).toEqual({ kind: 'subject_erased' });
    expect('items' in result).toBe(false);
    expect(hoisted.select).toHaveBeenCalledTimes(1);
  });
});
