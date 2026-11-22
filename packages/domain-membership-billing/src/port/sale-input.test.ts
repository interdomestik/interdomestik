import { describe, expect, it } from 'vitest';

import { publishPlanVersionInputSchema, recordSaleInputSchema } from './sale-input';

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
  it('preserves the accepted bigint amount and exact Unicode terms', () => {
    expect(recordSaleInputSchema.parse(sale)).toEqual(sale);
  });

  it.each([
    {},
    { leadId: 'lead-1', memberUserId: 'member-1' },
    { memberUserId: 'member-1', branchId: 'injected' },
  ])('requires exactly one buyer without additional fields', buyer => {
    expect(recordSaleInputSchema.safeParse({ ...sale, buyer }).success).toBe(false);
  });

  it('refuses empty text', () => {
    expect(recordSaleInputSchema.safeParse({ ...sale, termsVersion: '' }).success).toBe(false);
  });

  it.each(['before\u0000after', '\uD800', '\uDFFF'])(
    'refuses unpreservable text %j',
    termsVersion => {
      expect(recordSaleInputSchema.safeParse({ ...sale, termsVersion })).toMatchObject({
        success: false,
        error: { issues: [{ code: 'invalid_format', path: ['termsVersion'] }] },
      });
    }
  );

  it.each(['ordinary text', '📄'])('preserves non-empty Unicode text %s', termsVersion => {
    expect(recordSaleInputSchema.parse({ ...sale, termsVersion }).termsVersion).toBe(termsVersion);
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
