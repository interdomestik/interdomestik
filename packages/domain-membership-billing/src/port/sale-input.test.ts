import type { TenantTransaction } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordSale, recordSaleInTx } from './record-sale';
import { publishPlanVersionInputSchema, recordSaleInputSchema } from './sale-input';

vi.mock('@interdomestik/database/tenant-authority', () => ({ readTenantAuthority: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));

const sale = {
  buyer: { leadId: 'lead-1' },
  planVersionId: 'plan-version-1',
  termsVersion: ' conditions révisées 📄 ',
  rateId: 'rate-1',
  amountMkdMinor: 15_099_999_800n,
  channel: 'cash',
  operationKey: 'operation-1',
};

describe('individual payment port input', () => {
  const invalidTextIssue = {
    code: 'invalid_format',
    format: 'regex',
    pattern: String.raw`/^[^\0\uD800-\uDFFF]+$/u`,
    path: ['termsVersion'],
  };

  it.each([{ leadId: 'lead-1' }, { memberUserId: 'member-1' }])(
    'preserves buyer %j, the accepted bigint amount and exact Unicode terms',
    buyer => {
      const input = { ...sale, buyer };
      expect(recordSaleInputSchema.parse(input)).toStrictEqual(input);
    }
  );

  it('refuses an unknown key in buyer', () => {
    const buyer = { memberUserId: 'member-1', branchId: 'injected' };
    expect(recordSaleInputSchema.safeParse({ ...sale, buyer })).toMatchObject({
      success: false,
      error: { issues: [{ code: 'unrecognized_keys', keys: ['branchId'], path: ['buyer'] }] },
    });
  });

  it('refuses empty text', () => {
    expect(recordSaleInputSchema.safeParse({ ...sale, termsVersion: '' })).toMatchObject({
      success: false,
      error: { issues: [{ code: 'too_small', path: ['termsVersion'] }, invalidTextIssue] },
    });
  });

  it.each(['before\u0000after', '\uD800', '\uDFFF'])(
    'refuses unpreservable text %j',
    termsVersion => {
      expect(recordSaleInputSchema.safeParse({ ...sale, termsVersion })).toMatchObject({
        success: false,
        error: { issues: [invalidTextIssue] },
      });
    }
  );

  it.each(['ordinary text', '📄'])('preserves non-empty Unicode text %s', termsVersion => {
    expect(recordSaleInputSchema.parse({ ...sale, termsVersion }).termsVersion).toBe(termsVersion);
  });

  it('accepts a 255-character operation key at the four-byte UTF-8 boundary', () => {
    const operationKey = '📄'.repeat(255);
    expect(recordSaleInputSchema.parse({ ...sale, operationKey }).operationKey).toBe(operationKey);
    expect(
      recordSaleInputSchema.safeParse({ ...sale, operationKey: `${operationKey}📄` })
    ).toMatchObject({
      success: false,
      error: { issues: [{ code: 'too_big', maximum: 255, path: ['operationKey'] }] },
    });
  });

  it.each([0n, -100n, 9_223_372_036_854_775_808n, 100, '100'])(
    'refuses invalid bigint amount %s',
    amountMkdMinor => {
      expect(recordSaleInputSchema.safeParse({ ...sale, amountMkdMinor }).success).toBe(false);
    }
  );

  it.each(['soldBy', 'sold_by', 'tenantId', 'agentId', 'branchId', 'governingLaw'])(
    'rejects injected %s',
    key => {
      expect(recordSaleInputSchema.safeParse({ ...sale, [key]: 'injected' }).success).toBe(false);
    }
  );

  it.each(['publishedBy', 'published_by'])('refuses injected publisher %s', key => {
    expect(
      publishPlanVersionInputSchema.safeParse({
        planId: 'plan-1',
        legalEntityId: 'entity-1',
        [key]: 'injected',
      }).success
    ).toBe(false);
  });
});

describe('sale command input validation', () => {
  const actor = { id: 'seller-1', tenantId: 'tenant-1' };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(readTenantAuthority).mockReturnValue({
      purpose: 'session',
      tenantId: actor.tenantId,
      accessTenantId: actor.tenantId,
      principal: { userId: actor.id, role: 'tenant_admin', branchId: null, agentId: null },
      expiresAtMs: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each([
    { name: 'both IDs', buyer: { leadId: 'lead-1', memberUserId: 'member-1' } },
    { name: 'neither ID', buyer: {} },
    { name: 'an unknown key', buyer: { memberUserId: 'member-1', branchId: 'injected' } },
    {
      name: 'an explicit undefined member ID',
      buyer: { leadId: 'lead-1', memberUserId: undefined },
    },
    {
      name: 'an explicit undefined lead ID',
      buyer: { leadId: undefined, memberUserId: 'member-1' },
    },
  ])('refuses $name before any SQL in both entry points', async ({ buyer }) => {
    const authority = mintTestTenantAuthority(actor.tenantId);
    const execute = vi.fn();
    const tx = { execute } as unknown as TenantTransaction;
    const input = { ...sale, buyer };
    const invalid = { ok: false, code: 'invalid' };

    await expect(recordSale(authority, input, actor)).resolves.toEqual(invalid);
    expect(withTenantAuthority).not.toHaveBeenCalled();
    await expect(recordSaleInTx(tx, authority, input, actor)).resolves.toEqual(invalid);
    expect(execute).not.toHaveBeenCalled();
  });

  it('opens a tenant transaction for a 255-character operation key', async () => {
    const authority = mintTestTenantAuthority(actor.tenantId);
    const failure = new Error('synthetic transaction failure');
    vi.mocked(withTenantAuthority).mockRejectedValueOnce(failure);

    await expect(
      recordSale(authority, { ...sale, operationKey: '📄'.repeat(255) }, actor)
    ).rejects.toBe(failure);
    expect(withTenantAuthority).toHaveBeenCalledExactlyOnceWith(authority, expect.any(Function));
  });

  it('refuses a 256-character operation key before any SQL in both entry points', async () => {
    const authority = mintTestTenantAuthority(actor.tenantId);
    const execute = vi.fn();
    const tx = { execute } as unknown as TenantTransaction;
    const input = { ...sale, operationKey: '📄'.repeat(256) };
    const invalid = { ok: false, code: 'invalid' };

    await expect(recordSale(authority, input, actor)).resolves.toStrictEqual(invalid);
    expect(withTenantAuthority).not.toHaveBeenCalled();
    await expect(recordSaleInTx(tx, authority, input, actor)).resolves.toStrictEqual(invalid);
    expect(execute).not.toHaveBeenCalled();
  });
});
