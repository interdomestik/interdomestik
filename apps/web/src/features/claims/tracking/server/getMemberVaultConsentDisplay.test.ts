import { UnauthorizedError } from '@interdomestik/shared-auth/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  withTenantContext: vi.fn(),
  locale: vi.fn(),
  admit: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ op: 'desc', column })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
}));

import {
  baseAuthority,
  baseParams,
  baseTenantId,
} from './getMemberVaultConsentDisplay.test-support';

vi.mock('@/lib/privacy/require-member-acceptance', () => ({
  requireAdmittedMember: hoisted.admit,
}));

vi.mock('@interdomestik/database', () => ({
  db: { select: hoisted.select },
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLocaleMetadata: hoisted.locale,
}));
vi.mock('@interdomestik/database/schema', () => ({
  tenants: { id: 'tenants.id', code: 'tenants.code', countryCode: 'tenants.countryCode' },
  claimDocuments: {},
  claimDocumentAiExtractionConsents: {},
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: hoisted.and,
  desc: hoisted.desc,
  eq: hoisted.eq,
  inArray: hoisted.inArray,
}));

import { getMemberVaultConsentDisplay } from './getMemberVaultConsentDisplay';

describe('getMemberVaultConsentDisplay gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.admit.mockResolvedValue({ ok: true, authorized: { authority: baseAuthority } });
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({ select: hoisted.select })
    );
  });

  it('refuses before reading any metadata or document data', async () => {
    hoisted.admit.mockResolvedValueOnce({ ok: false });
    await expect(getMemberVaultConsentDisplay(baseParams)).rejects.toThrow(UnauthorizedError);
    expect(hoisted.locale).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([
    [[], { kind: 'hidden' }],
    [[{ code: 'KS', countryCode: 'KS' }], { kind: 'hidden' }],
    [[{ code: 'MK', countryCode: 'AL' }], { kind: 'hidden' }],
  ])('fails closed before document reads for tenant row %j', async (tenantRows, expected) => {
    hoisted.locale.mockResolvedValueOnce(tenantRows[0] ?? null);

    await expect(getMemberVaultConsentDisplay(baseParams)).resolves.toEqual(expected);
    expect(hoisted.locale).toHaveBeenCalledWith(baseTenantId);
    expect(hoisted.select).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('stops an ineligible claim before document reads', async () => {
    hoisted.locale.mockResolvedValueOnce({ code: 'MK', countryCode: 'MK' });

    await expect(
      getMemberVaultConsentDisplay({ ...baseParams, claimCategory: 'injury' })
    ).resolves.toEqual({ kind: 'hidden' });
    expect(hoisted.locale).toHaveBeenCalledWith(baseTenantId);
    expect(hoisted.select).not.toHaveBeenCalled();
  });

  it('returns an item-free erased state before document reads', async () => {
    hoisted.locale.mockResolvedValueOnce({ code: 'MK', countryCode: 'MK' });

    const result = await getMemberVaultConsentDisplay({
      ...baseParams,
      piiStatus: 'erased_or_unavailable',
    });
    expect(result).toEqual({ kind: 'subject_erased' });
    expect('items' in result).toBe(false);
    expect(hoisted.locale).toHaveBeenCalledWith(baseTenantId);
    expect(hoisted.select).not.toHaveBeenCalled();
  });
});
