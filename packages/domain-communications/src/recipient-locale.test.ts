import type { TenantTransaction } from '@interdomestik/database';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { resolveRecipientLocale } from './recipient-locale';

describe('resolveRecipientLocale', () => {
  it.each([
    ['tenant_mk', [{ locale: 'de' }], 'de'],
    ['tenant_mk', [{ locale: null }], 'mk'],
    ['pilot-mk', [], 'en'],
    ['tenant_ks', [{ locale: null }], 'sq'],
    ['other-tenant', [], 'sq'],
  ])('applies recipient, tenant and Albanian fallback for %s', async (tenantId, rows, locale) => {
    const where = vi.fn().mockResolvedValue(rows);
    const tx = { select: () => ({ from: () => ({ where }) }) } as unknown as TenantTransaction;
    expect(await resolveRecipientLocale(tx, tenantId, 'recipient')).toBe(locale);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual([
      tenantId,
      'recipient',
    ]);
  });
});
